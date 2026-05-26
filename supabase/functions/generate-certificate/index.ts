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

    // Verify eligibility — only payment is required
    if (member.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Payment not completed' }), {
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
    // Template is landscape ~1500x1060 (actual dimensions come from the image)
    // All positions are calibrated to the uploaded certificate-template.jpeg

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const templateImage = await pdfDoc.embedJpg(templateBytes);
    const { width, height } = templateImage.scale(1); // Use original image dimensions
    
    console.log(`Template dimensions: ${width}x${height}`);
    
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

    // --- Calculate proportional coordinates based on actual template size ---
    // All percentages derived from analyzing the certificate template image

    // 1. MEMBER NAME
    const nameSize = Math.round(width * 0.028); // Increased size
    const nameText = member.full_name;
    const nameWidth = helveticaBold.widthOfTextAtSize(nameText, nameSize);
    const nameY = height * 0.4615;
    page.drawText(nameText, {
      x: width * 0.4381,
      y: nameY,
      size: nameSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // 2. MEMBERSHIP ID
    const memIdSize = Math.round(width * 0.012); // Increased size
    const memIdText = `${member.membership_id}`;
    const memIdY = height * 0.2776;
    page.drawText(memIdText, {
      x: width * 0.2919,
      y: memIdY,
      size: memIdSize,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    // 3. DATE AND TIME
    const dateSize = Math.round(width * 0.012); // Increased size
    const dateText = `${issueDateStr}`;
    const dateX = width * 0.7706;
    const dateY = height * 0.2935;
    page.drawText(dateText, {
      x: dateX,
      y: dateY,
      size: dateSize,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    // 4. FIRM NAME
    const firmNameSize = Math.round(width * 0.024); // Size slightly smaller than member name
    const firmNameText = member.firm_name || '';
    const firmNameWidth = helveticaBold.widthOfTextAtSize(firmNameText, firmNameSize);
    page.drawText(firmNameText, {
      x: width * 0.4531,
      y: height * 0.5323,
      size: firmNameSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });


    // 5. QR CODE
    const qrSize = Math.round(width * 0.073); // ~110px on a 1500px wide template
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    page.drawImage(qrImage, {
      x: width * 0.8588,
      y: height * 0.6658,
      width: qrSize,
      height: qrSize,
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
