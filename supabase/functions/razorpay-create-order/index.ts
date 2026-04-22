// Supabase Edge Function: razorpay-create-order
// Creates a Razorpay Order (Stage I) - server-side API call
// This follows the Order API flow per Razorpay documentation
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type CreateOrderResponse = {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: Record<string, unknown>;
  created_at: number;
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
    console.log('🔐 Razorpay Order creation started');

    // Load environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') || '';
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
    const feeAmountRupees = Number(Deno.env.get('REGISTRATION_FEE_AMOUNT_INR') || '300');
    const feeCurrency = String(Deno.env.get('REGISTRATION_FEE_CURRENCY') || 'INR').toUpperCase();

    console.log('📋 Environment check:');
    console.log('  - RAZORPAY_KEY_ID:', razorpayKeyId ? '✅ SET' : '❌ MISSING');
    console.log('  - RAZORPAY_KEY_SECRET:', razorpayKeySecret ? '✅ SET' : '❌ MISSING');

    // Validate environment
    if (!razorpayKeyId || !razorpayKeySecret || !supabaseUrl || !supabaseServiceKey) {
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

    // Get member_id from request body or fetch from auth
    let memberId = '';
    try {
      const body = await req.json();
      memberId = String(body?.member_id || '').trim();
    } catch (e) {
      console.warn('⚠️ Could not parse request body');
    }

    // If no member_id, fetch from account
    if (!memberId) {
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (accountData?.id) {
        memberId = accountData.id;
      }
    }

    if (!memberId) {
      return new Response(JSON.stringify({ error: 'member_id not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch member details
    const { data: member, error: memberErr } = await supabase
      .from('accounts')
      .select('id, full_name, email, payment_status, membership_id, user_id')
      .eq('id', memberId)
      .single();

    if (memberErr || !member) {
      console.error('❌ Member fetch error:', memberErr?.message);
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify ownership
    if ((member as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if already paid
    if ((member as any).payment_status === 'paid') {
      return new Response(JSON.stringify({
        error: 'Payment already completed',
        payment_status: (member as any).payment_status,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if there's already a pending/attempted order
    const { data: existingOrders } = await supabase
      .from('orders')
      .select('id, razorpay_order_id, status, amount, created_at')
      .eq('member_id', (member as any).id)
      .in('status', ['created', 'attempted'])
      .order('created_at', { ascending: false })
      .limit(1);

    const existingOrder = existingOrders?.[0] as any;
    const isRecentOrder = existingOrder &&
      (Date.now() - new Date(existingOrder.created_at).getTime()) < 30 * 60 * 1000;
    const sameAmount = existingOrder && Number(existingOrder.amount) === feeAmountRupees;

    if (isRecentOrder && sameAmount && existingOrder.razorpay_order_id) {
      console.log('♻️ Reusing recent order:', existingOrder.razorpay_order_id);
      return new Response(JSON.stringify({
        id: existingOrder.razorpay_order_id,
        entity: 'order',
        amount: feeAmountRupees * 100, // in paise
        amount_paid: 0,
        amount_due: feeAmountRupees * 100,
        currency: feeCurrency,
        receipt: existingOrder.id,
        status: existingOrder.status,
        attempts: 0,
        notes: {
          member_id: (member as any).id,
          membership_id: (member as any).membership_id,
        },
        created_at: Math.floor(new Date(existingOrder.created_at).getTime() / 1000),
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create new order in Razorpay
    const amountPaise = Math.round(feeAmountRupees * 100);
    const receipt = `order_${memberId.substring(0, 8)}_${Date.now()}`;

    const payload = {
      amount: amountPaise,
      currency: feeCurrency,
      receipt: receipt,
      notes: {
        member_id: (member as any).id,
        membership_id: (member as any).membership_id,
      },
      partial_payment: false,
    };

    console.log('📤 Creating order in Razorpay...');
    console.log('   Amount (paise):', amountPaise);
    console.log('   Receipt:', receipt);

    const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayResp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const razorpayJson = await razorpayResp.json().catch(() => null);

    if (!razorpayResp.ok) {
      console.error('❌ Razorpay error:', razorpayJson);
      const errorMsg = razorpayJson?.error?.description || `Razorpay API failed (${razorpayResp.status})`;
      return new Response(JSON.stringify({
        error: errorMsg,
        razorpay_status: razorpayResp.status,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orderId = String(razorpayJson?.id || '');
    if (!orderId) {
      console.error('❌ Invalid Razorpay response - missing order ID');
      return new Response(JSON.stringify({
        error: 'Invalid Razorpay response',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Order created in Razorpay:', orderId);

    // Store order in database
    const { error: insertErr } = await supabase.from('orders').insert({
      member_id: (member as any).id,
      razorpay_order_id: orderId,
      amount: feeAmountRupees,
      currency: feeCurrency,
      receipt: receipt,
      status: 'created',
      amount_paid: 0,
      amount_due: feeAmountRupees,
      attempts: 0,
      notes: payload.notes,
      provider_payload: razorpayJson,
    });

    if (insertErr) {
      console.error('❌ Database insert error:', insertErr.message);
      return new Response(JSON.stringify({
        error: 'Failed to save order',
        details: insertErr.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Order saved to database');

    // Return order details to client
    const response: CreateOrderResponse = {
      id: orderId,
      entity: 'order',
      amount: amountPaise,
      amount_paid: 0,
      amount_due: amountPaise,
      currency: feeCurrency,
      receipt: receipt,
      status: 'created',
      attempts: 0,
      notes: payload.notes,
      created_at: Math.floor(Date.now() / 1000),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Function error:', message);

    return new Response(JSON.stringify({
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
