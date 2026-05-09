// Supabase Edge Function: generate-certificate
// Generates a PDF certificate with QR code, uploads to Storage
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';
import QRCode from 'https://esm.sh/qrcode@1.5.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Load environment variables INSIDE handler
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:8081';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { member_id } = await req.json();

    if (!member_id) {
      return new Response(JSON.stringify({ error: 'member_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency check — only return existing cert if it's FULLY GENERATED
    // (has a non-empty certificate_url and certificate_id, and is not revoked)
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('*')
      .eq('member_id', member_id)
      .maybeSingle();

    if (existingCert) {
      // If the existing cert is fully valid with a real URL, return it
      if (existingCert.certificate_url && existingCert.certificate_id && existingCert.status === 'valid') {
        return new Response(JSON.stringify({ certificate: existingCert }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Otherwise, delete the broken/revoked record so we can regenerate
      console.log(`Deleting broken/incomplete certificate record ${existingCert.id} for member ${member_id}`);
      await supabase.from('certificate_downloads').delete().eq('certificate_id', existingCert.id);
      await supabase.from('certificates').delete().eq('id', existingCert.id);
    }

    // Fetch account details
    const { data: member, error: memberErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', member_id)
      .single();

    if (memberErr || !member) {
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify eligibility
    if (member.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Payment not completed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (member.approval_status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Firm not approved' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- LOAD TEMPLATE FROM SUPABASE STORAGE (before inserting record) ---
    // Template is stored in the 'templates' bucket as 'certificate-template.jpeg'
    // This ensures we don't create a broken DB record if the template is missing
    let templateBytes: Uint8Array;
    try {
      const { data: templateData, error: templateErr } = await supabase.storage
        .from('templates')
        .download('certificate-template.jpeg');

      if (templateErr || !templateData) {
        console.error('Template download error:', templateErr);
        throw new Error('Certificate template not found in storage.');
      }

      templateBytes = new Uint8Array(await templateData.arrayBuffer());
      console.log(`Template loaded from storage: ${templateBytes.length} bytes`);
    } catch (e) {
      console.error('Error loading certificate template:', e);
      throw new Error('Certificate template not found. Contact admin to upload template.');
    }

    // Create certificate record — the DB trigger auto-generates certificate_id
    const { data: certRecord, error: certInsertErr } = await supabase
      .from('certificates')
      .insert({
        member_id: member.id,
        certificate_url: '', // will update after upload
        status: 'valid',
      })
      .select()
      .single();

    if (certInsertErr) {
      // Might be duplicate (race condition)
      if (certInsertErr.message.includes('unique') || certInsertErr.message.includes('duplicate')) {
        const { data: existing } = await supabase
          .from('certificates')
          .select('*')
          .eq('member_id', member_id)
          .single();
        if (existing?.certificate_url && existing?.certificate_id) {
          return new Response(JSON.stringify({ certificate: existing }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      throw certInsertErr;
    }

    console.log(`Certificate record created: id=${certRecord.id}, certificate_id=${certRecord.certificate_id}`);

    const now = new Date();
    const issueDateStr = now.toLocaleDateString('en-IN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const issueTimeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
    });

    // Generate QR code as data URL
    const verifyUrl = `${appUrl}/verify?id=${certRecord.certificate_id}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1 });
    const qrImageBytes = Uint8Array.from(atob(qrDataUrl.split(',')[1]), (c) => c.charCodeAt(0));

    // --- TEMPLATE CONFIGURATION ---
    // Coordinates for text placement on the certificate template
    // (0,0) is the Bottom-Left corner in pdf-lib
    const COORDS = {
      name: { x: 421, y: 380, size: 28, color: rgb(0, 0, 0) },
      date: { x: 1237, y: 352, size: 12, color: rgb(0, 0, 0) },
      certId: { x: 421, y: 285, size: 11, color: rgb(0, 0, 0) },
      memId: { x: 430, y: 371, size: 11, color: rgb(0, 0, 0) },
      qr: { x: 700, y: 50, size: 100 }
    };

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const templateImage = await pdfDoc.embedJpg(templateBytes);
    const { width, height } = templateImage.scale(1); // Use original image dimensions
    
    const page = pdfDoc.addPage([width, height]);
    
    // Draw the background template
    page.drawImage(templateImage, {
      x: 0,
      y: 0,
      width,
      height,
    });

    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Member name (centered horizontally)
    const nameText = member.full_name;
    const nameWidth = helveticaBold.widthOfTextAtSize(nameText, COORDS.name.size);
    page.drawText(nameText, {
      x: width / 2 - nameWidth / 2,
      y: COORDS.name.y,
      size: COORDS.name.size,
      font: helveticaBold,
      color: COORDS.name.color,
    });

    // Date and time
    const dateText = `Issued on ${issueDateStr} at ${issueTimeStr}`;
    page.drawText(dateText, {
      x: COORDS.date.x,
      y: COORDS.date.y,
      size: COORDS.date.size,
      font: helvetica,
      color: COORDS.date.color,
    });

    // Certificate ID
    const certIdText = `Certificate ID: ${certRecord.certificate_id}`;
    const certIdWidth = helvetica.widthOfTextAtSize(certIdText, COORDS.certId.size);
    page.drawText(certIdText, {
      x: COORDS.certId.x - certIdWidth / 2,
      y: COORDS.certId.y,
      size: COORDS.certId.size,
      font: helvetica,
      color: COORDS.certId.color,
    });

    // Membership ID
    const memIdText = `Membership ID: ${member.membership_id}`;
    page.drawText(memIdText, {
      x: COORDS.memId.x,
      y: COORDS.memId.y,
      size: COORDS.memId.size,
      font: helvetica,
      color: COORDS.memId.color,
    });

    // Embed QR code
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    page.drawImage(qrImage, {
      x: COORDS.qr.x,
      y: COORDS.qr.y,
      width: COORDS.qr.size,
      height: COORDS.qr.size,
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF generated: ${pdfBytes.length} bytes`);

    // Upload to Supabase Storage
    const storagePath = `${member.id}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('certificates')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error('Storage upload error:', uploadErr);
      // Clean up the certificate record since upload failed
      await supabase.from('certificates').delete().eq('id', certRecord.id);
      throw uploadErr;
    }

    console.log(`PDF uploaded to storage: ${storagePath}`);

    // Update certificate record with storage path
    const { data: finalCert } = await supabase
      .from('certificates')
      .update({ certificate_url: storagePath })
      .eq('id', certRecord.id)
      .select()
      .single();

    // Also mark queue job as completed if one exists
    await supabase
      .from('certificate_generation_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('account_id', member.id)
      .eq('status', 'pending');

    console.log(`Certificate generation complete for ${member.full_name} (${certRecord.certificate_id})`);

    return new Response(
      JSON.stringify({ certificate: finalCert || { ...certRecord, certificate_url: storagePath } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Certificate generation error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
