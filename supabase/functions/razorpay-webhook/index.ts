// Supabase Edge Function: razorpay-webhook
// Verifies Razorpay webhook signature and marks payments/members as paid.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================
// Crypto helpers (Web Crypto API available in Deno)
// ============================================================

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// Main handler
// ============================================================

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

    // Extract IDs from different payload structures
    const paymentLinkId = String(event?.payload?.payment_link?.entity?.id || '');
    const paymentId = String(event?.payload?.payment?.entity?.id || '');
    const orderId = String(event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || '');
    const memberIdFromNotes = String(
      event?.payload?.payment_link?.entity?.notes?.member_id ||
      event?.payload?.payment?.entity?.notes?.member_id ||
      event?.payload?.order?.entity?.notes?.member_id ||
      ''
    );

    // Only handle the events we care about.
    if (!eventType) {
      throw new Error('Missing event type');
    }

    console.log(`📨 Webhook event: ${eventType}`);
    console.log(`   Payment ID: ${paymentId || '(none)'}`);
    console.log(`   Order ID: ${orderId || '(none)'}`);
    console.log(`   Payment Link ID: ${paymentLinkId || '(none)'}`);
    console.log(`   Member ID (notes): ${memberIdFromNotes || '(none)'}`);

    // ============================================================
    // Standard Checkout flow: payment.captured / order.paid
    // These events fire when payment is made via the Razorpay modal
    // (create order → checkout modal → payment captured)
    // ============================================================
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      if (!orderId && !paymentId) {
        console.log('⚠️ No order_id or payment_id — ignoring');
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Find the order record in our database
      let memberId = memberIdFromNotes;
      let orderRecord: any = null;

      if (orderId) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('id, member_id, status')
          .eq('razorpay_order_id', orderId)
          .single();

        if (orderData) {
          orderRecord = orderData;
          memberId = memberId || orderData.member_id;
        }
      }

      // Also try to find via payment record if we have payment_id
      if (!memberId && paymentId) {
        const { data: paymentData } = await supabase
          .from('payments')
          .select('member_id')
          .eq('razorpay_payment_id', paymentId)
          .single();

        if (paymentData) {
          memberId = paymentData.member_id;
        }
      }

      if (!memberId) {
        console.error('❌ Could not determine member_id for Standard Checkout event');
        return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no member_id' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log(`✅ Member identified: ${memberId}`);

      // Update order status to 'paid'
      if (orderRecord) {
        await supabase
          .from('orders')
          .update({
            status: 'paid',
            provider_payload: event,
          })
          .eq('id', orderRecord.id);
        console.log('✅ Order status updated to paid');
      }

      // Update payment record if exists
      if (paymentId) {
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('razorpay_payment_id', paymentId)
          .single();

        if (existingPayment) {
          await supabase
            .from('payments')
            .update({
              status: 'paid',
              provider_event: eventType,
              provider_payload: event,
            })
            .eq('razorpay_payment_id', paymentId);
        } else if (orderId) {
          // Update by order_id instead
          await supabase
            .from('payments')
            .update({
              status: 'paid',
              razorpay_payment_id: paymentId,
              provider_event: eventType,
              provider_payload: event,
            })
            .eq('razorpay_order_id', orderId);
        }
        console.log('✅ Payment record updated');
      }

      // Mark member as paid
      const { data: account, error: accountErr } = await supabase
        .from('accounts')
        .update({ payment_status: 'paid' })
        .eq('id', memberId)
        .select('approval_status')
        .single();

      if (accountErr) throw new Error(accountErr.message);
      console.log('✅ Account payment_status updated to paid');

      if (account?.approval_status === 'approved') {
        console.log(`Triggering certificate generation for member ${memberId}`);
        await supabase.functions.invoke('generate-certificate', {
          body: { member_id: memberId }
        }).catch(err => console.error('Failed to trigger certificate generation:', err));
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ============================================================
    // Payment Link flow: payment_link.paid / cancelled / expired
    // These events fire when payment is made via a Razorpay Payment Link
    // ============================================================
    if (!paymentLinkId) {
      // No payment_link id and not a Standard Checkout event — ignore
      console.log('⚠️ Unhandled event type, ignoring:', eventType);
      return new Response(JSON.stringify({ ok: true, ignored: true, event: eventType }), {
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
        const { data: account, error: accountErr } = await supabase
          .from('accounts')
          .update({ payment_status: 'paid' })
          .eq('id', memberId)
          .select('approval_status')
          .single();
          
        if (accountErr) throw new Error(accountErr.message);

        if (account?.approval_status === 'approved') {
          console.log(`Triggering certificate generation for member ${memberId}`);
          await supabase.functions.invoke('generate-certificate', {
            body: { member_id: memberId }
          }).catch(err => console.error('Failed to trigger certificate generation:', err));
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (eventType === 'payment_link.cancelled' || eventType === 'payment_link.expired') {
      const newPaymentStatus = eventType === 'payment_link.expired' ? 'expired' : 'failed';

      // Update payment row
      const { data: paymentRows } = await supabase
        .from('payments')
        .update({
          status: newPaymentStatus,
          provider_event: eventType,
          provider_payload: event,
        })
        .eq('razorpay_payment_link_id', paymentLinkId)
        .select('member_id');

      // Also update the account payment_status so dashboards reflect the failure
      const memberId = (Array.isArray(paymentRows) ? paymentRows?.[0]?.member_id : (paymentRows as any)?.member_id) || memberIdFromNotes;
      if (memberId) {
        await supabase
          .from('accounts')
          .update({ payment_status: newPaymentStatus })
          .eq('id', memberId);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Unhandled event type
    console.log('⚠️ Unhandled event type:', eventType);
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
