// Supabase Edge Function: razorpay-verify-signature
// Verifies Razorpay payment signature and captures payment
// This follows Stage II: Payment attempted/authorized → Stage III: Payment captured
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

// ============================================================
// HMAC-SHA256 Signature Verification
// ============================================================

async function hmacSha256(key: string, data: string): Promise<string> {
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

type VerifySignatureRequest = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type VerifySignatureResponse = {
  verified: boolean;
  order_id?: string;
  payment_id?: string;
  message?: string;
  error?: string;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('🔐 Razorpay Signature Verification started');

    // Load environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') || '';

    if (!razorpayKeySecret || !supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    let user = null;

    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        const { data: { user: authUser } } = await supabase.auth.getUser(token);
        user = authUser;
      }
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body = await req.json() as VerifySignatureRequest;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('📝 Verifying payment:');
    console.log('   Order ID:', razorpay_order_id);
    console.log('   Payment ID:', razorpay_payment_id);

    // Get order from database
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('id, member_id, razorpay_order_id, amount, currency, status, created_at')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (orderErr || !orderData) {
      console.error('❌ Order not found:', orderErr?.message);
      return new Response(JSON.stringify({
        verified: false,
        error: 'Order not found',
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const order = orderData as any;
    console.log('✅ Order found:', order.razorpay_order_id);

    // Verify user owns this order
    const { data: memberData } = await supabase
      .from('accounts')
      .select('id, user_id')
      .eq('id', order.member_id)
      .single();

    if ((memberData as any)?.user_id !== user.id) {
      return new Response(JSON.stringify({
        verified: false,
        error: 'Unauthorized - order does not belong to user',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================================
    // VERIFY SIGNATURE: HMAC-SHA256(order_id + "|" + payment_id, secret)
    // ============================================================
    const signatureData = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = await hmacSha256(razorpayKeySecret, signatureData);

    console.log('🔍 Signature verification:');
    console.log('   Data:', signatureData);
    console.log('   Generated:', generatedSignature.substring(0, 20) + '...');
    console.log('   Received:', razorpay_signature.substring(0, 20) + '...');

    if (!timingSafeEqual(generatedSignature, razorpay_signature)) {
      console.error('❌ Signature mismatch - TAMPERING DETECTED');

      // Record failed verification
      await supabase.from('payment_signatures').insert({
        razorpay_signature: razorpay_signature,
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        is_verified: false,
        verification_error: 'Signature mismatch - possible tampering',
      });

      return new Response(JSON.stringify({
        verified: false,
        error: 'Signature verification failed',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Signature verified successfully');

    // ============================================================
    // UPDATE ORDER STATUS TO ATTEMPTED
    // ============================================================
    const { error: updateOrderErr } = await supabase
      .from('orders')
      .update({
        status: 'attempted',
        attempts: order.attempts + 1,
      })
      .eq('id', order.id);

    if (updateOrderErr) {
      console.error('❌ Failed to update order status:', updateOrderErr.message);
      return new Response(JSON.stringify({
        verified: true,
        error: 'Payment verified but order update failed',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================================
    // CREATE OR UPDATE PAYMENT RECORD
    // ============================================================
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .single();

    if (!existingPayment) {
      // Create new payment record
      const { error: insertPaymentErr } = await supabase.from('payments').insert({
        member_id: order.member_id,
        razorpay_order_id: razorpay_order_id,
        razorpay_payment_id: razorpay_payment_id,
        amount: order.amount,
        currency: order.currency,
        status: 'pending', // Awaiting webhook confirmation
        provider: 'razorpay',
      });

      if (insertPaymentErr) {
        console.error('❌ Failed to create payment record:', insertPaymentErr.message);
      }
    }

    // ============================================================
    // RECORD SIGNATURE VERIFICATION
    // ============================================================
    await supabase.from('payment_signatures').insert({
      razorpay_signature: razorpay_signature,
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      is_verified: true,
      verified_at: new Date().toISOString(),
    });

    console.log('✅ Payment signature verified and recorded');

    const response: VerifySignatureResponse = {
      verified: true,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      message: 'Signature verified successfully. Payment will be confirmed once webhook is received.',
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Function error:', message);

    return new Response(JSON.stringify({
      verified: false,
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
