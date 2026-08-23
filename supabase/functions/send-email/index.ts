import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkEdgeRateLimit } from '../_shared/rate-limiter.ts';
import { validateAndParseJson } from '../_shared/request-validator.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'NDADA <noreply@ndada.in>';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function renderEmailLayout({
  title,
  headerTitle,
  headerSubtitle,
  badgeText = 'NDADA OFFICIAL NOTIFICATION',
  badgeBg = 'rgba(255, 255, 255, 0.15)',
  badgeColor = '#dcfce7',
  headerGradient = 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)',
  contentHtml,
}: {
  title: string;
  headerTitle: string;
  headerSubtitle: string;
  badgeText?: string;
  badgeBg?: string;
  badgeColor?: string;
  headerGradient?: string;
  contentHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${title}</title>
    <style>
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f4f7f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
      
      @media screen and (max-width: 600px) {
        .email-container { width: 100% !important; padding: 8px !important; }
        .content-box { padding: 20px 16px !important; }
        .header-box { padding: 24px 16px !important; }
        .action-button { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
        .data-table td { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f7f5; color: #1f2937;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f5; table-layout: fixed; padding: 24px 0;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" width="600" class="email-container" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
            
            <!-- GREEN BRAND HEADER -->
            <tr>
              <td class="header-box" align="center" style="background: ${headerGradient}; padding: 32px 24px; text-align: center;">
                <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 12px auto;">
                  <tr>
                    <td align="center" style="background-color: #ffffff; width: 64px; height: 64px; border-radius: 32px; border: 2px solid #86efac; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
                      <img src="https://ndada.in/assets/logo-ndada.png" alt="NDADA Logo" width="52" height="52" style="display: block; border-radius: 26px;" />
                    </td>
                  </tr>
                </table>
                <div style="display: inline-block; background-color: ${badgeBg}; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 20px; padding: 4px 14px; margin-bottom: 10px;">
                  <span style="color: ${badgeColor}; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">${badgeText}</span>
                </div>
                <h1 style="margin: 4px 0 0 0; color: #ffffff; font-size: 22px; font-weight: 700; line-height: 1.3;">${headerTitle}</h1>
                <p style="margin: 6px 0 0 0; color: #bbf7d0; font-size: 14px; font-weight: 400;">${headerSubtitle}</p>
              </td>
            </tr>

            <!-- WHITE CONTENT CARD -->
            <tr>
              <td class="content-box" style="padding: 32px 28px; background-color: #ffffff;">
                ${contentHtml}
              </td>
            </tr>

            <!-- GREEN ACCENTED FOOTER -->
            <tr>
              <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
                <p style="margin: 0 0 4px 0; color: #166534; font-size: 13px; font-weight: 700;">Nagpur District Agro Dealers Association</p>
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px;">Strengthening Agro Dealers Across Nagpur District</p>
                <div style="border-top: 1px solid #e5e7eb; width: 60px; margin: 12px auto;"></div>
                <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 11px; line-height: 1.5;">
                  This is an official automated notification. Please do not reply directly.<br>
                  Visit <a href="https://ndada.in" style="color: #166534; font-weight: 600; text-decoration: underline;">ndada.in</a> for portal support.
                </p>
                <p style="margin: 6px 0 0 0; color: #9ca3af; font-size: 11px;">&copy; ${new Date().getFullYear()} NDADA. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Email templates
const emailTemplates: Record<string, (data: any) => { subject: string; html: string; text: string }> = {
  payment_received: (data) => ({
    subject: '✓ Payment Received - NDADA Membership',
    html: renderEmailLayout({
      title: 'Payment Received - NDADA Membership',
      headerTitle: 'Payment Received ✓',
      headerSubtitle: 'Thank you for your registration fee payment',
      badgeText: 'PAYMENT VERIFIED',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${data.name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Your membership registration fee payment has been successfully received and verified.</p>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="data-table">
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Amount Paid:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 16px; font-weight: 700;">₹${data.amount}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Membership ID:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 14px; font-weight: 700;">${data.membership_id}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Payment Status:</td>
                  <td align="right" style="padding: 6px 0;">
                    <span style="background-color: #166534; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px;">VERIFIED ✓</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 15px; font-weight: 700;">Next Steps in Your Application:</h3>
        <ol style="margin: 0 0 24px 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.7;">
          <li>Your application has progressed to the executive review queue.</li>
          <li>Document and firm licensing details will be reviewed within 1-2 business days.</li>
          <li>Once approved, your official digital certificate will be issued instantly.</li>
        </ol>

        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <a href="https://ndada.in/dashboard" class="action-button" style="display: inline-block; background-color: #166534; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(22, 101, 52, 0.25);">View Dashboard →</a>
            </td>
          </tr>
        </table>
      `,
    }),
    text: `Payment Received\n\nDear ${data.name},\nYour payment of ₹${data.amount} has been received.\nMembership ID: ${data.membership_id}\nVisit: https://ndada.in/dashboard`,
  }),

  payment_failed: (data) => ({
    subject: 'Payment Failed - Action Required - NDADA Membership',
    html: renderEmailLayout({
      title: 'Payment Failed - NDADA Membership',
      headerTitle: 'Payment Failed',
      headerSubtitle: 'We could not process your transaction',
      badgeText: 'ACTION REQUIRED',
      badgeBg: 'rgba(239, 68, 68, 0.2)',
      badgeColor: '#fca5a5',
      headerGradient: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${data.name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">We were unable to process your NDADA membership payment.</p>

        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; color: #991b1b; font-size: 13px; font-weight: 700;">Failure Reason:</p>
          <p style="margin: 0; color: #b91c1c; font-size: 14px; font-weight: 500;">${data.reason || 'Transaction declined or timed out'}</p>
        </div>

        <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 15px; font-weight: 700;">Recommended Actions:</h3>
        <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.7;">
          <li>Verify account balance and card/UPI limits.</li>
          <li>Ensure your mobile number is linked for OTP verification.</li>
          <li>Try an alternate payment option (UPI / Credit Card / Debit Card / NetBanking).</li>
        </ul>

        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <a href="https://ndada.in/dashboard/payment" class="action-button" style="display: inline-block; background-color: #dc2626; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25);">Retry Payment →</a>
            </td>
          </tr>
        </table>
      `,
    }),
    text: `Payment Failed\n\nDear ${data.name},\nYour payment could not be processed.\nReason: ${data.reason || 'Transaction could not be completed'}\nRetry: https://ndada.in/dashboard/payment`,
  }),

  application_approved: (data) => ({
    subject: '🎉 Application Approved! - NDADA Membership',
    html: renderEmailLayout({
      title: 'Application Approved - NDADA Membership',
      headerTitle: 'Application Approved! 🎉',
      headerSubtitle: 'Welcome to Nagpur District Agro Dealers Association',
      badgeText: 'MEMBERSHIP ACTIVE',
      badgeBg: 'rgba(34, 197, 94, 0.2)',
      badgeColor: '#86efac',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${data.name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Congratulations! Your NDADA membership application has been reviewed and officially approved.</p>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="data-table">
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Membership ID:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 15px; font-weight: 700;">${data.membership_id}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Approval Status:</td>
                  <td align="right" style="padding: 6px 0;">
                    <span style="background-color: #15803d; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px;">APPROVED ✓</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Certificate:</td>
                  <td align="right" style="padding: 6px 0; color: #15803d; font-size: 13px; font-weight: 700;">Ready to Download</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 15px; font-weight: 700;">Your Member Privileges Include:</h3>
        <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.7;">
          <li>Official QR-verified NDADA Membership Certificate</li>
          <li>District-wide representation and compliance support</li>
          <li>Eligibility for government scheme assistance</li>
        </ul>

        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <a href="https://ndada.in/dashboard/certificate" class="action-button" style="display: inline-block; background-color: #166534; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(22, 101, 52, 0.25);">Download Certificate →</a>
            </td>
          </tr>
        </table>
      `,
    }),
    text: `Application Approved!\n\nDear ${data.name},\nYour membership application has been approved.\nMembership ID: ${data.membership_id}\nDownload: https://ndada.in/dashboard/certificate`,
  }),

  application_rejected: (data) => ({
    subject: 'Application Update - Action Required - NDADA Membership',
    html: renderEmailLayout({
      title: 'Application Status - NDADA Membership',
      headerTitle: 'Application Update',
      headerSubtitle: 'Action required on your membership submission',
      badgeText: 'REVISION REQUIRED',
      badgeBg: 'rgba(234, 88, 12, 0.2)',
      badgeColor: '#fdba74',
      headerGradient: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 50%, #c2410c 100%)',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${data.name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Thank you for your interest in joining NDADA. After reviewing your submitted documents, we require updates before we can approve your application.</p>

        <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #f97316; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; color: #9a3412; font-size: 13px; font-weight: 700;">Review Feedback / Reason:</p>
          <p style="margin: 0; color: #c2410c; font-size: 14px; font-weight: 500;">${data.reason || 'Document mismatch or missing details'}</p>
        </div>

        <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 15px; font-weight: 700;">How to Re-apply:</h3>
        <ol style="margin: 0 0 24px 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.7;">
          <li>Log in to your NDADA dashboard.</li>
          <li>Update your firm details or upload revised license documents.</li>
          <li>Resubmit for fast-track executive re-review.</li>
        </ol>

        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center">
              <a href="https://ndada.in/dashboard" class="action-button" style="display: inline-block; background-color: #ea580c; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25);">Update Application →</a>
            </td>
          </tr>
        </table>
      `,
    }),
    text: `Application Status\n\nDear ${data.name},\nYour application requires revision.\nReason: ${data.reason || 'Not provided'}\nVisit: https://ndada.in/dashboard`,
  }),

  certificate_issued: (data) => ({
    subject: '📜 Your Official NDADA Membership Certificate is Ready',
    html: renderEmailLayout({
      title: 'Official NDADA Certificate Issued',
      headerTitle: 'Certificate Issued 📜',
      headerSubtitle: 'Download your official membership certificate',
      badgeText: 'VERIFIED CERTIFICATE',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${data.name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Your official NDADA membership certificate has been generated and is ready for secure download.</p>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="data-table">
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Membership ID:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 15px; font-weight: 700;">${data.membership_id}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Certificate Format:</td>
                  <td align="right" style="padding: 6px 0; color: #15803d; font-size: 13px; font-weight: 700;">Official Vector PDF</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
          <tr>
            <td align="center">
              <a href="${data.download_url}" class="action-button" style="display: inline-block; background-color: #166534; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(22, 101, 52, 0.25);">Download Certificate PDF →</a>
            </td>
          </tr>
        </table>

        <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5; text-align: center;">
          Direct link (valid for 7 days):<br>
          <a href="${data.download_url}" style="color: #166534; word-break: break-all; text-decoration: underline;">${data.download_url}</a>
        </p>
      `,
    }),
    text: `Congratulations!\n\nDear ${data.name},\nYour official NDADA certificate has been generated.\n\nMembership ID: ${data.membership_id}\nDownload Link: ${data.download_url}`,
  }),

  password_reset: (data) => ({
    subject: '🔐 Reset Your NDADA Account Password',
    html: renderEmailLayout({
      title: 'Reset Password - NDADA',
      headerTitle: 'Password Reset Request',
      headerSubtitle: 'Follow the link below to set your new password',
      badgeText: 'SECURITY VERIFICATION',
      badgeBg: 'rgba(234, 179, 8, 0.2)',
      badgeColor: '#fef08a',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Hello <strong>${data.name || 'NDADA Member'}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">We received a request to reset the password for your NDADA account registered under <strong>${data.email}</strong>.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
          <p style="margin: 0 0 16px 0; color: #166534; font-size: 14px; font-weight: 600;">Tap the button below to choose a new password:</p>
          <a href="${data.reset_url}" class="action-button" style="display: inline-block; background-color: #166534; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(22, 101, 52, 0.25);">Reset Password →</a>
        </div>

        <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; line-height: 1.5; text-align: center;">
          If the button above does not work, copy and paste this link into your browser:<br>
          <a href="${data.reset_url}" style="color: #166534; word-break: break-all; text-decoration: underline;">${data.reset_url}</a>
        </p>

        <p style="margin: 16px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
          If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      `,
    }),
    text: `Password Reset Request\n\nDear Member,\nReset your password here: ${data.reset_url}\n\nIf you did not request this, ignore this email.`,
  }),
};

async function sendEmail(
  to: string,
  templateName: string,
  data: Record<string, any>,
  attachments?: Array<{ content: string; filename: string; contentType?: string }>,
  customFrom?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!emailTemplates[templateName]) {
    return { success: false, error: `Template "${templateName}" not found` };
  }

  const template = emailTemplates[templateName](data);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: customFrom || RESEND_FROM_EMAIL,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        ...(attachments ? { attachments } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend error:', errorText);
      try {
        const parsed = JSON.parse(errorText);
        return { success: false, error: parsed.message || `Resend API error: ${response.statusText}` };
      } catch {
        return { success: false, error: errorText || `Resend API error: ${response.statusText}` };
      }
    }

    const result = await response.json() as any;
    console.log('Email sent successfully:', result.id);
    return { success: true, messageId: result.id };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: String(error) };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Rate limit check: Max 10 email dispatches per 10 mins per caller
  const rateLimitResult = await checkEdgeRateLimit(req, supabase, 'send_email', 10, 600);
  if (!rateLimitResult.allowed && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  // Validate payload size (Max 1MB) & parse JSON safely
  const { data: payloadData, errorResponse } = await validateAndParseJson(req, 1024 * 1024);
  if (errorResponse) return errorResponse;

  try {
    const payload = (payloadData || {}) as any;
    const { to, template_name: templateName, data, attachments, from: customFrom, action } = payload;

    // Direct password reset request handling
    if (action === 'password_reset' || templateName === 'password_reset') {
      const email = (to || payload.email || '').toLowerCase().trim();
      let redirectUrl = payload.redirect_url || 'https://ndada.in/reset-password';
      if (redirectUrl.startsWith('http://ndada.in') || redirectUrl.startsWith('http://ndada.vercel.app')) {
        redirectUrl = redirectUrl.replace('http://', 'https://');
      }

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Missing target email address for password reset' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Generate recovery link instantly via Supabase Admin Auth API
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        console.error('generateLink error:', linkErr);
        return new Response(
          JSON.stringify({ error: linkErr?.message || 'Failed to generate password reset token. Please ensure the email address is registered.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let resetUrl = linkData.properties.action_link;
      const tokenHash = linkData.properties?.hashed_token;
      if (tokenHash) {
        const delimiter = redirectUrl.includes('?') ? '&' : '?';
        resetUrl = `${redirectUrl}${delimiter}token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
      }

      // 2. Fetch full name from accounts table for personalized greeting
      const { data: acc } = await supabase
        .from('accounts')
        .select('full_name')
        .eq('email', email)
        .maybeSingle();

      const memberName = acc?.full_name || 'Member';

      // 3. Send email via Resend instantly
      const result = await sendEmail(
        email,
        'password_reset',
        {
          name: memberName,
          email,
          reset_url: resetUrl,
        },
        attachments,
        customFrom
      );

      return new Response(
        JSON.stringify(result),
        {
          status: result.success ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!to || !templateName || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, template_name, data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await sendEmail(to, templateName, data, attachments, customFrom);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
