// Supabase Edge Function: generate-certificate
// Generates a PDF certificate with QR code, uploads to Storage
// Optimized: template caching, parallel I/O, concurrency guard
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkEdgeRateLimit } from '../_shared/rate-limiter.ts';
import { validateAndParseJson } from '../_shared/request-validator.ts';

// ============================================================
// MODULE-LEVEL CACHE — persists across invocations within the
// same Edge Function instance. Avoids re-downloading the ~248 KB
// template JPEG on every certificate generation.
// ============================================================
let cachedTemplateBytes: Uint8Array | null = null;

// Maximum concurrent certificate generations allowed
const MAX_CONCURRENT = 3;

// Converts a Uint8Array to base64 encoding without Deno version dependencies or memory stack limits
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const l = bytes.length;
  for (let i = 2; i < l; i += 3) {
    result += chars[bytes[i - 2] >> 2];
    result += chars[((bytes[i - 2] & 3) << 4) | (bytes[i - 1] >> 4)];
    result += chars[((bytes[i - 1] & 15) << 2) | (bytes[i] >> 6)];
    result += chars[bytes[i] & 63];
  }
  const mod = l % 3;
  if (mod === 2) {
    const b0 = bytes[l - 2];
    const b1 = bytes[l - 1];
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += chars[(b1 & 15) << 2];
    result += '=';
  } else if (mod === 1) {
    const b0 = bytes[l - 1];
    result += chars[b0 >> 2];
    result += chars[(b0 & 3) << 4];
    result += '==';
  }
  return result;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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

    // Validate request payload size (Max 512KB) & parse JSON
    const { data: bodyData, errorResponse } = await validateAndParseJson(req, 512 * 1024);
    if (errorResponse) return errorResponse;

    const { member_id } = (bodyData || {}) as any;

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

    // ============================================================
    // PER-USER RATE LIMIT GUARD (3 requests / 60 seconds)
    // ============================================================
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let userId: string | null = null;
    if (!isServiceRole && token) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && user) {
        userId = user.id;
      }
    }

    if (!userId && member_id) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('user_id')
        .eq('id', member_id)
        .maybeSingle();
      if (acc) {
        userId = acc.user_id;
      }
    }

    if (!isServiceRole) {
      const rateLimitResult = await checkEdgeRateLimit(req, supabase, 'certificate', 3, 60, userId);
      if (!rateLimitResult.allowed && rateLimitResult.response) {
        return rateLimitResult.response;
      }
    }

    // ============================================================
    // CONCURRENCY GUARD — prevent thundering herd
    // ============================================================
    const { count: processingCount } = await supabase
      .from('certificate_generation_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing');

    if ((processingCount ?? 0) >= MAX_CONCURRENT) {
      console.log(`Concurrency limit reached (${processingCount}/${MAX_CONCURRENT}). Returning 429.`);
      return new Response(JSON.stringify({
        error: 'Certificate generation is busy. Your certificate will be generated shortly.',
        retry_after: 10,
        status: 'queued',
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '10' },
      });
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

    if (!member.membership_id) {
      return new Response(JSON.stringify({ error: 'Membership ID not assigned' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================================
    // LOAD TEMPLATE (cached) — only downloads on first invocation
    // ============================================================
    if (!cachedTemplateBytes) {
      console.log('Template cache MISS — downloading from storage...');
      try {
        const { data: templateData, error: templateErr } = await supabase.storage
          .from('templates')
          .download('certificate-template.jpeg');

        if (templateErr || !templateData) {
          console.error('Template download error:', templateErr);
          throw new Error('Certificate template not found in storage.');
        }

        cachedTemplateBytes = new Uint8Array(await templateData.arrayBuffer());
        console.log(`Template cached: ${cachedTemplateBytes.length} bytes`);
      } catch (e) {
        console.error('Error loading certificate template:', e);
        throw new Error('Certificate template not found. Contact admin to upload template.');
      }
    } else {
      console.log('Template cache HIT — using cached copy');
    }

    const templateBytes = cachedTemplateBytes;

    // Mark queue job as processing (if one exists)
    await supabase
      .from('certificate_generation_queue')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('account_id', member.id)
      .eq('status', 'pending');

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
    const issueDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    // Generate QR code verification URL (uses secure_token if available, falls back to certificate_id)
    const verificationToken = certRecord.secure_token || certRecord.certificate_id;
    const verifyUrl = `${appUrl}/verify?id=${encodeURIComponent(verificationToken)}`;

    // ============================================================
    // PARALLEL I/O — embed template, fonts, and QR concurrently
    // ============================================================
    const pdfDoc = await PDFDocument.create();

    const [templateImage, helveticaBold, qrDataUrl] = await Promise.all([
      pdfDoc.embedJpg(templateBytes),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
      QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 }),
    ]);

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

    // --- Calculate proportional coordinates based on actual template size ---
    // All percentages derived from analyzing the certificate template image
    // 1. MEMBER NAME
    const nameSize = Math.round(width * 0.024); // Bold, slightly smaller than firm name
    const nameText = member.full_name;
    const nameWidth = helveticaBold.widthOfTextAtSize(nameText, nameSize);
    const nameY = height * 0.4891;
    page.drawText(nameText, {
      x: (width * 0.5077) - (nameWidth / 2),
      y: nameY,
      size: nameSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    // 1.5. FIRM ADDRESS (Replaces District)
    const rawAddress = (member.firm_address || member.address || member.district || '').trim();
    if (rawAddress) {
      const upperAddr = rawAddress.toUpperCase();
      const firmAddressText = upperAddr.startsWith('AT ') ? upperAddr : `AT ${upperAddr}`;
      let addressSize = Math.round(width * 0.016); // Clean, proportioned size
      const maxAddressWidth = width * 0.75;
      let addressWidth = helveticaBold.widthOfTextAtSize(firmAddressText, addressSize);
      while (addressWidth > maxAddressWidth && addressSize > Math.round(width * 0.008)) {
        addressSize -= 0.5;
        addressWidth = helveticaBold.widthOfTextAtSize(firmAddressText, addressSize);
      }

      page.drawText(firmAddressText, {
        x: (width * 0.5083) - (addressWidth / 2),
        y: height * 0.4327,
        size: addressSize,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
    }


    // 2. MEMBERSHIP ID
    const memIdSize = Math.round(width * 0.015); // Increased size
    const memIdText = `NDADA/MAH/NAG/${member.membership_id}`;
    const memIdY = height * 0.2776;
    page.drawText(memIdText, {
      x: width * 0.2919,
      y: memIdY,
      size: memIdSize,
      font: helveticaBold, // Matches bold style of printed prefix
      color: rgb(0, 0, 0),
    });

    // 3. DATE AND TIME
    const dateSize = Math.round(width * 0.015); // Increased size
    const dateText = `${issueDateStr}`;
    const dateX = width * 0.7706;
    const dateY = height * 0.2935;
    page.drawText(dateText, {
      x: dateX,
      y: dateY,
      size: dateSize,
      font: helveticaBold, // Matches bold style of label
      color: rgb(0, 0, 0),
    });

    // 4. FIRM NAME
    const firmNameSize = Math.round(width * 0.026); // Large, prominent text
    const firmNameText = member.firm_name || '';
    const firmNameWidth = helveticaBold.widthOfTextAtSize(firmNameText, firmNameSize);
    page.drawText(firmNameText, {
      x: (width * 0.5077) - (firmNameWidth / 2),
      y: height * 0.5391,
      size: firmNameSize,
      font: helveticaBold,
      color: rgb(0.88, 0.05, 0.05), // Beautiful prominent red/crimson color to match reference
    });

    // 5. QR CODE — embed in parallel with other ops above
    const qrImageBytes = Uint8Array.from(atob(qrDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const qrSize = Math.round(width * 0.073); // ~110px on a 1500px wide template
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    page.drawImage(qrImage, {
      x: width * 0.8588,
      y: height * 0.6658,
      width: qrSize,
      height: qrSize,
    });

    // Generate PDF bytes
    const pdfBytesStandard = await pdfDoc.save();
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    const savings = pdfBytesStandard.length - pdfBytes.length;
    const savingsPercent = ((pdfBytesStandard.length - pdfBytes.length) / pdfBytesStandard.length) * 100;
    
    console.log(
      `[Certificate Optimization] PDF generated:\n` +
      `- Standard Size: ${pdfBytesStandard.length} bytes\n` +
      `- Optimized Size: ${pdfBytes.length} bytes\n` +
      `- Savings: ${savings} bytes (${savingsPercent.toFixed(2)}%)`
    );

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
      // Mark queue job as failed
      await supabase
        .from('certificate_generation_queue')
        .update({
          status: 'failed',
          error_message: `Storage upload failed: ${uploadErr.message}`,
          completed_at: new Date().toISOString(),
        })
        .eq('account_id', member.id)
        .in('status', ['pending', 'processing']);
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

    // Mark queue job as completed
    await supabase
      .from('certificate_generation_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('account_id', member.id)
      .in('status', ['pending', 'processing']);

    console.log(`Certificate generation complete for ${member.full_name} (${certRecord.certificate_id})`);

    // ============================================================
    // POST-GENERATION EMAIL FLOW (ISOLATED)
    // ============================================================
    try {
      // 1. Generate secure signed URL for the certificate (valid for 7 days = 604800 seconds)
      console.log(`Generating signed download URL for ${storagePath}...`);
      const { data: signedUrlData, error: signedUrlErr } = await supabase.storage
        .from('certificates')
        .createSignedUrl(storagePath, 604800);

      if (signedUrlErr || !signedUrlData) {
        throw new Error(signedUrlErr?.message || 'Failed to generate signed download URL');
      }

      const signedUrl = signedUrlData.signedUrl;

      // 2. Check if certificate PDF size is under 1 MB for attachment
      const pdfSize = pdfBytes.length;
      const shouldAttach = pdfSize < 1024 * 1024;
      console.log(`PDF size: ${pdfSize} bytes. Should attach: ${shouldAttach}`);

      let pdfBase64 = '';
      if (shouldAttach) {
        pdfBase64 = uint8ArrayToBase64(pdfBytes);
      }

      // 3. Send email with exponential backoff retries
      let retryCount = 0;
      const maxRetries = 3;
      let delay = 1000;
      let emailSuccess = false;
      let lastError = '';

      console.log(`Attempting to send congratulations email to ${member.email}...`);

      while (retryCount < maxRetries && !emailSuccess) {
        try {
          const { data: emailData, error: emailErr } = await supabase.functions.invoke('send-email', {
            body: {
              to: member.email,
              template_name: 'certificate_issued',
              data: {
                name: member.full_name,
                membership_id: `NDADA/MAH/NAG/${member.membership_id}`,
                download_url: signedUrl,
              },
              ...(shouldAttach ? {
                attachments: [
                  {
                    content: pdfBase64,
                    filename: `NDADA_Certificate_${member.membership_id}.pdf`,
                  }
                ]
              } : {})
            }
          });

          if (emailErr || emailData?.error) {
            throw new Error(emailErr?.message || emailData?.error || 'Unknown email function error');
          }

          emailSuccess = true;
          console.log(`Email successfully sent to ${member.email} on attempt ${retryCount + 1}`);
        } catch (retryErr) {
          retryCount++;
          lastError = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.error(`Email send attempt ${retryCount} failed: ${lastError}`);
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      }

      // 4. Write audit log event as a system actor
      console.log(`Recording system audit event: ${emailSuccess ? 'certificate_email_sent' : 'certificate_email_failed'}...`);
      const { error: auditErr } = await supabase.from('audit_logs').insert({
        admin_id: null,
        actor_type: 'system',
        actor_identifier: 'generate-certificate',
        action: emailSuccess ? 'certificate_email_sent' : 'certificate_email_failed',
        target_user: member.user_id, // points to auth.users.id
        details: emailSuccess
          ? `Certificate email sent to ${member.email} with signed URL. (Attached PDF: ${shouldAttach})`
          : `Failed to send certificate email to ${member.email} after ${maxRetries} attempts. Last error: ${lastError}`,
      });

      if (auditErr) {
        console.error('Failed to insert email audit log:', auditErr);
      }

    } catch (emailFlowErr) {
      // Completely isolated so certificate generation doesn't fail
      console.error('Critical failure in post-generation email flow:', emailFlowErr);
    }

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
