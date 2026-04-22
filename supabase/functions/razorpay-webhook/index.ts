// Supabase Edge Function: razorpay-webhook
// Verifies Razorpay webhook signature and marks payments/members as paid.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Load environment variables INSIDE handler
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';

    if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
      return new Response(JSON.stringify({ error: 'Configuration missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const signatureHeader = req.headers.get('x-razorpay-signature') || req.headers.get('X-Razorpay-Signature');
    if (!signatureHeader) throw new Error('Missing signature');

    const bodyText = await req.text();
    const computed = await hmacSha256Hex(webhookSecret, bodyText);
    if (!timingSafeEqualHex(computed, signatureHeader)) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(bodyText);
    const eventType = String(event?.event || '');

    // Prefer payment_link payloads (works well with hosted payment links)
    const paymentLinkId = String(event?.payload?.payment_link?.entity?.id || '');
    const paymentId = String(event?.payload?.payment?.entity?.id || '');
    const memberIdFromNotes = String(event?.payload?.payment_link?.entity?.notes?.member_id || '');

    // Only handle the events we care about.
    if (!eventType) {
      throw new Error('Missing event type');
    }

    if (!paymentLinkId) {
      // For now we require a payment_link id; ignore unrelated events.
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (eventType === 'payment_link.paid') {
      // Update payment row
      const { data: paymentRows, error: paymentErr } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          razorpay_payment_id: paymentId || null,
          provider_event: eventType,
          provider_payload: event,
        })
        .eq('razorpay_payment_link_id', paymentLinkId)
        .select('member_id');

      if (paymentErr) throw new Error(paymentErr.message);

      const memberId = (Array.isArray(paymentRows) ? paymentRows?.[0]?.member_id : (paymentRows as any)?.member_id) || memberIdFromNotes;
      if (memberId) {
        const { error: accountErr } = await supabase
          .from('accounts')
          .update({ payment_status: 'paid' })
          .eq('id', memberId);
        if (accountErr) throw new Error(accountErr.message);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (eventType === 'payment_link.cancelled' || eventType === 'payment_link.expired') {
      await supabase
        .from('payments')
        .update({ status: 'failed', provider_event: eventType, provider_payload: event })
        .eq('razorpay_payment_link_id', paymentLinkId);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: true, event: eventType }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
