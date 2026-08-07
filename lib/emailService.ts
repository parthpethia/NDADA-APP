/**
 * Email Service Module
 *
 * Centralized email management for the NDADA app
 * Supports multiple email providers and templates
 */

export interface EmailTemplate {
  subject: string;
  htmlContent: string;
  plainTextContent: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  htmlContent: string;
  plainTextContent?: string;
  templateId?: string;
  variables?: Record<string, any>;
  from?: string;
}

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

// ============================================================
// Email Templates
// ============================================================

export const EMAIL_TEMPLATES = {
  PAYMENT_RECEIVED: {
    subject: '✓ Payment Received - NDADA Membership',
    getHtml: (name: string, memberId: string, amount: string) => renderEmailLayout({
      title: 'Payment Received - NDADA Membership',
      headerTitle: 'Payment Received ✓',
      headerSubtitle: 'Thank you for your registration fee payment',
      badgeText: 'PAYMENT VERIFIED',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Your membership registration fee payment has been successfully received and verified.</p>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="data-table">
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Amount Paid:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 16px; font-weight: 700;">₹${amount}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Membership ID:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 14px; font-weight: 700;">${memberId}</td>
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
  },

  PAYMENT_FAILED: {
    subject: 'Payment Failed - Action Required - NDADA Membership',
    getHtml: (name: string, reason: string) => renderEmailLayout({
      title: 'Payment Failed - NDADA Membership',
      headerTitle: 'Payment Failed',
      headerSubtitle: 'We could not process your transaction',
      badgeText: 'ACTION REQUIRED',
      badgeBg: 'rgba(239, 68, 68, 0.2)',
      badgeColor: '#fca5a5',
      headerGradient: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">We were unable to process your NDADA membership payment.</p>

        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; color: #991b1b; font-size: 13px; font-weight: 700;">Failure Reason:</p>
          <p style="margin: 0; color: #b91c1c; font-size: 14px; font-weight: 500;">${reason || 'Transaction declined or timed out'}</p>
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
  },

  APPLICATION_APPROVED: {
    subject: '🎉 Application Approved! - NDADA Membership',
    getHtml: (name: string, memberId: string) => renderEmailLayout({
      title: 'Application Approved - NDADA Membership',
      headerTitle: 'Application Approved! 🎉',
      headerSubtitle: 'Welcome to Nagpur District Agro Dealers Association',
      badgeText: 'MEMBERSHIP ACTIVE',
      badgeBg: 'rgba(34, 197, 94, 0.2)',
      badgeColor: '#86efac',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Congratulations! Your NDADA membership application has been reviewed and officially approved.</p>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="data-table">
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Membership ID:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 15px; font-weight: 700;">${memberId}</td>
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
  },

  APPLICATION_REJECTED: {
    subject: 'Application Update - Action Required - NDADA Membership',
    getHtml: (name: string, reason: string) => renderEmailLayout({
      title: 'Application Status - NDADA Membership',
      headerTitle: 'Application Update',
      headerSubtitle: 'Action required on your membership submission',
      badgeText: 'REVISION REQUIRED',
      badgeBg: 'rgba(234, 88, 12, 0.2)',
      badgeColor: '#fdba74',
      headerGradient: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 50%, #c2410c 100%)',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Thank you for your interest in joining NDADA. After reviewing your submitted documents, we require updates before we can approve your application.</p>

        <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #f97316; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px 0; color: #9a3412; font-size: 13px; font-weight: 700;">Review Feedback / Reason:</p>
          <p style="margin: 0; color: #c2410c; font-size: 14px; font-weight: 500;">${reason || 'Document mismatch or missing details'}</p>
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
  },

  CERTIFICATE_ISSUED: {
    subject: '📜 Your Official NDADA Membership Certificate is Ready',
    getHtml: (name: string, memberId: string) => renderEmailLayout({
      title: 'Official NDADA Certificate Issued',
      headerTitle: 'Certificate Issued 📜',
      headerSubtitle: 'Download your official membership certificate',
      badgeText: 'VERIFIED CERTIFICATE',
      contentHtml: `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Your official NDADA membership certificate has been generated and is ready for secure download.</p>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <tr>
            <td>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" class="data-table">
                <tr>
                  <td style="padding: 6px 0; color: #166534; font-size: 13px; font-weight: 600;">Membership ID:</td>
                  <td align="right" style="padding: 6px 0; color: #14532d; font-size: 15px; font-weight: 700;">${memberId}</td>
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
              <a href="https://ndada.in/dashboard/certificate" class="action-button" style="display: inline-block; background-color: #166534; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(22, 101, 52, 0.25);">Download Certificate PDF →</a>
            </td>
          </tr>
        </table>
      `,
    }),
  },
};

// ============================================================
// Email Service
// ============================================================

export class EmailService {
  private provider: 'resend' | 'sendgrid' | 'mailgun' | 'smtp' = 'resend';
  private apiKey: string | null = null;
  private fromEmail: string = 'NDADA <noreply@ndada.in>';

  constructor(provider: 'resend' | 'sendgrid' | 'mailgun' | 'smtp' = 'resend', apiKey?: string) {
    this.provider = provider;
    this.apiKey = apiKey || null;
  }

  /**
   * Send email using the configured provider
   */
  async send(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (this.provider === 'resend') {
      return this.sendViaResend(payload);
    } else if (this.provider === 'sendgrid') {
      return this.sendViaSendGrid(payload);
    } else if (this.provider === 'mailgun') {
      return this.sendViaMailgun(payload);
    }
    return { success: false, error: 'Provider not configured' };
  }

  /**
   * Send via Resend
   */
  private async sendViaResend(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: payload.from || this.fromEmail,
          to: payload.to,
          subject: payload.subject,
          html: payload.htmlContent,
          text: payload.plainTextContent,
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return { success: true, messageId: data.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Send via SendGrid
   */
  private async sendViaSendGrid(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: payload.to }],
          }],
          from: { email: payload.from || this.fromEmail },
          subject: payload.subject,
          content: [
            { type: 'text/html', value: payload.htmlContent },
            { type: 'text/plain', value: payload.plainTextContent || '' },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`SendGrid API error: ${response.statusText}`);
      }

      const messageId = response.headers.get('x-message-id') || 'unknown';
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Send via Mailgun
   */
  private async sendViaMailgun(payload: EmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('from', payload.from || this.fromEmail);
      formData.append('to', payload.to);
      formData.append('subject', payload.subject);
      formData.append('html', payload.htmlContent);
      if (payload.plainTextContent) {
        formData.append('text', payload.plainTextContent);
      }

      const response = await fetch('https://api.mailgun.net/v3/mail.ndada.org/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${this.apiKey}`)}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Mailgun API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return { success: true, messageId: data.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

// ============================================================
// Singleton instance
// ============================================================

let emailServiceInstance: EmailService | null = null;

export function initializeEmailService(provider: 'resend' | 'sendgrid' | 'mailgun' = 'resend', apiKey?: string) {
  emailServiceInstance = new EmailService(provider, apiKey);
  return emailServiceInstance;
}

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    // Initialize with Resend by default (should be configured in env)
    const apiKey = process.env.EXPO_PUBLIC_RESEND_API_KEY || process.env.RESEND_API_KEY;
    emailServiceInstance = new EmailService('resend', apiKey);
  }
  return emailServiceInstance;
}
