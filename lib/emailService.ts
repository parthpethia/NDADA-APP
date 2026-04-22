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

// ============================================================
// Email Templates
// ============================================================

export const EMAIL_TEMPLATES = {
  PAYMENT_RECEIVED: {
    subject: 'Payment Received - NDADA Membership',
    getHtml: (name: string, memberId: string, amount: string) => `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
      .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 8px 8px; }
      .status-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .button { background: #1d4ed8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>✓ Payment Received</h1>
        <p>Thank you for your registration fee payment</p>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Your payment of <strong>₹${amount}</strong> has been successfully received and verified.</p>

        <div class="status-box">
          <strong>Payment Details:</strong><br>
          Membership ID: <strong>${memberId}</strong><br>
          Status: <strong>Verified</strong>
        </div>

        <p><strong>What happens next:</strong></p>
        <ol>
          <li>Your application has been moved to the review queue</li>
          <li>Our team will review your documents within 2-3 business days</li>
          <li>You'll receive a notification once approved</li>
          <li>Your certificate will be issued immediately after approval</li>
        </ol>

        <p><a href="https://ndada-app.com/dashboard" class="button">View Your Application</a></p>

        <p>If you have any questions, please contact us at support@ndada.org</p>
      </div>
      <div class="footer">
        <p>&copy; 2024 NDADA Membership. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
    `,
  },

  PAYMENT_FAILED: {
    subject: 'Payment Failed - Please Retry - NDADA Membership',
    getHtml: (name: string, reason: string) => `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #fef2f2; padding: 30px; border: 1px solid #fecaca; }
      .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 8px 8px; }
      .error-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .button { background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Payment Failed</h1>
        <p>We couldn't process your payment</p>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Your payment could not be processed. Here's why:</p>

        <div class="error-box">
          <strong>Reason:</strong> ${reason}
        </div>

        <p><strong>How to resolve this:</strong></p>
        <ul>
          <li>Check your card details and expiry date</li>
          <li>Ensure you have sufficient funds</li>
          <li>Try a different payment method</li>
          <li>Contact your bank if the issue persists</li>
        </ul>

        <p><a href="https://ndada-app.com/dashboard/payment" class="button">Retry Payment</a></p>

        <p>Your payment link will expire in 24 hours. Please complete the payment before then.</p>
      </div>
      <div class="footer">
        <p>&copy; 2024 NDADA Membership. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
    `,
  },

  APPLICATION_APPROVED: {
    subject: '🎉 Your Application Approved! - NDADA Membership',
    getHtml: (name: string, memberId: string) => `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #ecfdf5; padding: 30px; border: 1px solid #a7f3d0; }
      .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 8px 8px; }
      .success-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .button { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🎉 Application Approved!</h1>
        <p>Your membership has been approved</p>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Congratulations! Your NDADA membership application has been approved.</p>

        <div class="success-box">
          <strong>Membership Details:</strong><br>
          Membership ID: <strong>${memberId}</strong><br>
          Status: <strong>Active</strong><br>
          Certificate: <strong>Ready to Download</strong>
        </div>

        <p><strong>Your membership includes:</strong></p>
        <ul>
          <li>Official NDADA membership certificate</li>
          <li>Access to member portal</li>
          <li>Eligibility for government schemes</li>
          <li>Network with other verified members</li>
        </ul>

        <p><a href="https://ndada-app.com/dashboard/certificate" class="button">Download Certificate</a></p>

        <p>Thank you for choosing NDADA!</p>
      </div>
      <div class="footer">
        <p>&copy; 2024 NDADA Membership. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
    `,
  },

  APPLICATION_REJECTED: {
    subject: 'Application Status - NDADA Membership',
    getHtml: (name: string, reason: string) => `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #fff7ed; padding: 30px; border: 1px solid #fed7aa; }
      .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 8px 8px; }
      .info-box { background: #ffedd5; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .button { background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Application Status</h1>
        <p>Update on your membership application</p>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Thank you for your application. After careful review, we are unable to approve your membership at this time.</p>

        <div class="info-box">
          <strong>Reason for rejection:</strong><br>
          ${reason}
        </div>

        <p><strong>What you can do:</strong></p>
        <ul>
          <li>Review the rejection reason carefully</li>
          <li>Correct the identified issues</li>
          <li>Reapply with updated information</li>
          <li>Contact support if you have questions</li>
        </ul>

        <p>We value your interest in joining NDADA and welcome your reapplication.</p>

        <p><a href="https://ndada-app.com/support" class="button">Contact Support</a></p>
      </div>
      <div class="footer">
        <p>&copy; 2024 NDADA Membership. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
    `,
  },

  CERTIFICATE_ISSUED: {
    subject: '📜 Your Certificate is Ready - NDADA Membership',
    getHtml: (name: string, memberId: string) => `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #faf5ff; padding: 30px; border: 1px solid #e9d5ff; }
      .footer { background: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 8px 8px; }
      .cert-box { background: #ede9fe; border-left: 4px solid #7c3aed; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .button { background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>📜 Certificate Ready</h1>
        <p>Download your official membership certificate</p>
      </div>
      <div class="content">
        <p>Dear ${name},</p>
        <p>Your official NDADA membership certificate is now ready for download!</p>

        <div class="cert-box">
          <strong>Certificate Details:</strong><br>
          Membership ID: <strong>${memberId}</strong><br>
          Type: <strong>Official Membership Certificate</strong><br>
          Status: <strong>Valid</strong>
        </div>

        <p><strong>You can use this certificate for:</strong></p>
        <ul>
          <li>Government scheme applications</li>
          <li>Loan and credit applications</li>
          <li>Business registration and compliance</li>
          <li>Verification with government agencies</li>
        </ul>

        <p><a href="https://ndada-app.com/dashboard/certificate" class="button">Download Now</a></p>

        <p>Keep your certificate safe. You can download it anytime from your dashboard.</p>
      </div>
      <div class="footer">
        <p>&copy; 2024 NDADA Membership. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>
    `,
  },
};

// ============================================================
// Email Service
// ============================================================

export class EmailService {
  private provider: 'resend' | 'sendgrid' | 'mailgun' | 'smtp' = 'resend';
  private apiKey: string | null = null;
  private fromEmail: string = 'noreply@ndada.org';

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
    emailServiceInstance = new EmailService('resend', process.env.RESEND_API_KEY);
  }
  return emailServiceInstance;
}
