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

    // Idempotency check
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('*')
      .eq('member_id', member_id)
      .single();

    if (existingCert) {
      return new Response(JSON.stringify({ certificate: existingCert }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch member details
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('*')
      .eq('id', member_id)
      .single();

    if (memberErr || !member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
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

    const { data: approvedFirms } = await supabase
      .from('firms')
      .select('id')
      .eq('member_id', member_id)
      .eq('approval_status', 'approved')
      .limit(1);

    if (!approvedFirms || approvedFirms.length === 0) {
      return new Response(JSON.stringify({ error: 'No approved firms' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create certificate record first to get the auto-generated certificate_id
    const { data: certRecord, error: certInsertErr } = await supabase
      .from('certificates')
      .insert({
        certificate_id: '', // trigger will generate
        member_id: member.id,
        certificate_url: '', // will update after upload
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
        return new Response(JSON.stringify({ certificate: existing }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw certInsertErr;
    }

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

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // A4 landscape
    const { width, height } = page.getSize();

    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    // Background
    page.drawRectangle({
      x: 0, y: 0, width, height,
      color: rgb(0.98, 0.98, 1),
    });

    // Border
    const borderMargin = 20;
    page.drawRectangle({
      x: borderMargin, y: borderMargin,
      width: width - borderMargin * 2,
      height: height - borderMargin * 2,
      borderColor: rgb(0.11, 0.31, 0.68),
      borderWidth: 3,
    });

    // Inner border
    page.drawRectangle({
      x: borderMargin + 8, y: borderMargin + 8,
      width: width - (borderMargin + 8) * 2,
      height: height - (borderMargin + 8) * 2,
      borderColor: rgb(0.11, 0.31, 0.68),
      borderWidth: 1,
    });

    // Header
    const titleText = 'NDADA';
    page.drawText(titleText, {
      x: width / 2 - helveticaBold.widthOfTextAtSize(titleText, 36) / 2,
      y: height - 80,
      size: 36,
      font: helveticaBold,
      color: rgb(0.11, 0.31, 0.68),
    });

    // Subtitle
    const subtitleText = 'Certificate of Membership';
    page.drawText(subtitleText, {
      x: width / 2 - helveticaBold.widthOfTextAtSize(subtitleText, 24) / 2,
      y: height - 120,
      size: 24,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    // Decorative line
    page.drawLine({
      start: { x: width / 2 - 150, y: height - 135 },
      end: { x: width / 2 + 150, y: height - 135 },
      thickness: 2,
      color: rgb(0.11, 0.31, 0.68),
    });

    // "This is to certify that"
    const certifyText = 'This is to certify that';
    page.drawText(certifyText, {
      x: width / 2 - timesItalic.widthOfTextAtSize(certifyText, 16) / 2,
      y: height - 175,
      size: 16,
      font: timesItalic,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Member name
    const nameText = member.full_name;
    page.drawText(nameText, {
      x: width / 2 - helveticaBold.widthOfTextAtSize(nameText, 28) / 2,
      y: height - 215,
      size: 28,
      font: helveticaBold,
      color: rgb(0.11, 0.31, 0.68),
    });

    // Name underline
    const nameWidth = helveticaBold.widthOfTextAtSize(nameText, 28);
    page.drawLine({
      start: { x: width / 2 - nameWidth / 2 - 10, y: height - 220 },
      end: { x: width / 2 + nameWidth / 2 + 10, y: height - 220 },
      thickness: 1,
      color: rgb(0.11, 0.31, 0.68),
    });

    // Award text
    const awardText = 'has been awarded membership of NDADA';
    page.drawText(awardText, {
      x: width / 2 - helvetica.widthOfTextAtSize(awardText, 14) / 2,
      y: height - 255,
      size: 14,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Date and time
    const dateText = `Issued on ${issueDateStr} at ${issueTimeStr}`;
    page.drawText(dateText, {
      x: width / 2 - helvetica.widthOfTextAtSize(dateText, 12) / 2,
      y: height - 285,
      size: 12,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Certificate ID and Membership ID
    const certIdText = `Certificate ID: ${certRecord.certificate_id}`;
    page.drawText(certIdText, {
      x: width / 2 - helvetica.widthOfTextAtSize(certIdText, 11) / 2,
      y: height - 310,
      size: 11,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    const memIdText = `Membership ID: ${member.membership_id}`;
    page.drawText(memIdText, {
      x: width / 2 - helvetica.widthOfTextAtSize(memIdText, 11) / 2,
      y: height - 328,
      size: 11,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Embed QR code
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    const qrSize = 100;
    page.drawImage(qrImage, {
      x: width - borderMargin - qrSize - 30,
      y: borderMargin + 30,
      width: qrSize,
      height: qrSize,
    });

    // QR label
    const qrLabel = 'Scan to Verify';
    page.drawText(qrLabel, {
      x: width - borderMargin - qrSize - 30 + (qrSize - helvetica.widthOfTextAtSize(qrLabel, 8)) / 2,
      y: borderMargin + 20,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Footer - authority
    const footerText = 'Authorized Signatory';
    page.drawLine({
      start: { x: 80, y: borderMargin + 60 },
      end: { x: 250, y: borderMargin + 60 },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(footerText, {
      x: 80 + (170 - helvetica.widthOfTextAtSize(footerText, 10)) / 2,
      y: borderMargin + 45,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Upload to Supabase Storage
    const storagePath = `${member.id}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('certificates')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // Update certificate record with URL
    const { data: urlData } = supabase.storage
      .from('certificates')
      .getPublicUrl(storagePath);

    await supabase
      .from('certificates')
      .update({ certificate_url: urlData.publicUrl })
      .eq('id', certRecord.id);

    return new Response(
      JSON.stringify({ certificate: { ...certRecord, certificate_url: urlData.publicUrl } }),
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
