import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Email templates
const emailTemplates: Record<string, (data: any) => { subject: string; html: string; text: string }> = {
  payment_received: (data) => ({
    subject: 'Payment Received - NDADA Membership',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h1>Payment Received ✓</h1>
          <p>Dear ${data.name},</p>
          <p>Your payment of <strong>₹${data.amount}</strong> has been successfully received.</p>
          <p><strong>Membership ID:</strong> ${data.membership_id}</p>
          <p>Your application will now move to the review stage. You'll be notified of the outcome within 2-3 business days.</p>
          <p><a href="https://ndada-app.com/dashboard">View Dashboard</a></p>
        </body>
      </html>
    `,
    text: `Payment Received\n\nDear ${data.name},\nYour payment of ₹${data.amount} has been received.\nMembership ID: ${data.membership_id}\nVisit: https://ndada-app.com/dashboard`,
  }),

  application_approved: (data) => ({
    subject: '🎉 Your Application Approved! - NDADA Membership',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h1>Application Approved! 🎉</h1>
          <p>Dear ${data.name},</p>
          <p>Congratulations! Your membership application has been approved.</p>
          <p><strong>Membership ID:</strong> ${data.membership_id}</p>
          <p>Your certificate is ready to download.</p>
          <p><a href="https://ndada-app.com/dashboard/certificate">Download Certificate</a></p>
        </body>
      </html>
    `,
    text: `Application Approved!\n\nDear ${data.name},\nYour membership application has been approved.\nMembership ID: ${data.membership_id}\nDownload: https://ndada-app.com/dashboard/certificate`,
  }),

  application_rejected: (data) => ({
    subject: 'Application Status - NDADA Membership',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif;">
          <h1>Application Status</h1>
          <p>Dear ${data.name},</p>
          <p>Thank you for your application. Unfortunately, it has been rejected.</p>
          <p><strong>Reason:</strong> ${data.reason || 'Not provided'}</p>
          <p>You can reapply with corrected information.</p>
          <p><a href="https://ndada-app.com/dashboard">Go to Dashboard</a></p>
        </body>
      </html>
    `,
    text: `Application Status\n\nDear ${data.name},\nYour application has been rejected.\nReason: ${data.reason || 'Not provided'}\nVisit: https://ndada-app.com/dashboard`,
  }),

  certificate_issued: (data) => ({
    subject: '🎉 Congratulations! Your NDADA Membership Certificate is Ready',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; color: #333333; line-height: 1.6;">
          <h2 style="color: #4F46E5;">Congratulations! 🎉</h2>
          <p>Dear ${data.name},</p>
          <p>We are pleased to inform you that your official NDADA membership certificate has been successfully generated.</p>
          <p><strong>Membership ID:</strong> ${data.membership_id}</p>
          <p>You can securely download your certificate using the button below (valid for the next 7 days):</p>
          <p style="margin: 24px 0;">
            <a href="${data.download_url}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Download Certificate
            </a>
          </p>
          <p style="font-size: 12px; color: #6B7280;">If the button above does not work, copy and paste this link into your browser:<br/>
          <a href="${data.download_url}" style="color: #4F46E5;">${data.download_url}</a></p>
          <p>You can also log in to your dashboard at any time to view and download your certificate.</p>
          <br/>
          <p>Best regards,</p>
          <p><strong>NDADA Team</strong></p>
        </body>
      </html>
    `,
    text: `Congratulations!\n\nDear ${data.name},\nWe are pleased to inform you that your official NDADA membership certificate has been successfully generated.\n\nMembership ID: ${data.membership_id}\n\nYou can securely download your certificate using the link below (valid for the next 7 days):\n${data.download_url}\n\nBest regards,\nNDADA Team`,
  }),
};

async function sendEmail(
  to: string,
  templateName: string,
  data: Record<string, any>,
  attachments?: Array<{ content: string; filename: string; contentType?: string }>
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
        from: 'NDADA <noreply@ndada.org>',
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        ...(attachments ? { attachments } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return { success: false, error: `Resend API error: ${response.statusText}` };
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
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await req.json() as any;
    const { to, template_name: templateName, data, attachments } = payload;

    if (!to || !templateName || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, template_name, data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await sendEmail(to, templateName, data, attachments);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
