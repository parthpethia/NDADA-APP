// Supabase Edge Function: razorpay-create-payment-link
// Creates (or reuses) a Razorpay Payment Link for the authenticated member.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type CreateLinkResponse = {
  payment_link_id: string;
  payment_link_url: string;
  amount: number;
  currency: string;
};

serve(async (req) => {
  // Handle CORS preflight requests FIRST
  if (req.method === 'OPTIONS') {
    console.log('📋 OPTIONS request - CORS preflight');
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    console.log('🔐 Razorpay function started');

    // Load environment variables INSIDE handler
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') || '';
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
    const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');
    const feeAmountRupees = Number(Deno.env.get('REGISTRATION_FEE_AMOUNT_INR') || '300');
    const feeCurrency = String(Deno.env.get('REGISTRATION_FEE_CURRENCY') || 'INR').toUpperCase();

    console.log('📋 Environment check:');
    console.log('  - RAZORPAY_KEY_ID:', razorpayKeyId ? '✅ SET' : '❌ MISSING');
    console.log('  - RAZORPAY_KEY_SECRET:', razorpayKeySecret ? '✅ SET' : '❌ MISSING');
    console.log('  - SUPABASE_URL:', supabaseUrl ? '✅ SET' : '❌ MISSING');
    console.log('  - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ SET' : '❌ MISSING');

    // Validate required environment variables
    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error('❌ Missing Razorpay credentials');
      const msg = 'Razorpay credentials not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Supabase environment variables.';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase credentials');
      const msg = 'Supabase credentials not configured.';
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client INSIDE handler
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get token from request body
    let token = '';
    try {
      const body = await req.json();
      token = String(body?.token || '').trim();
    } catch (e) {
      console.error('❌ Failed to parse request body:', e);
    }

    if (!token) {
      console.error('❌ No token in request body');
      throw new Error('Unauthorized');
    }

    console.log('✅ Token extracted from body, length:', token.length);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      console.error('❌ Auth error:', authErr?.message);
      console.error('❌ Token validation failed for token:', token.substring(0, 20) + '...');
      throw new Error('Unauthorized');
    }

    console.log('✅ User authenticated:', user.id);

    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('id, full_name, email, payment_status, membership_id')
      .eq('user_id', user.id)
      .single();

    if (memberErr || !member) {
      console.error('❌ Member fetch error:', memberErr?.message);
      throw new Error('Member not found');
    }

    console.log('✅ Member found:', (member as any).membership_id);

    if ((member as any).payment_status === 'paid') {
      console.warn('⚠️ Member already paid');
      throw new Error('Already paid');
    }

    const amountPaise = Math.round(feeAmountRupees * 100);
    console.log('💰 Amount in paise:', amountPaise);

    // Reuse a recent pending link if available (prevents multiple links per user).
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('id, status, created_at, amount, currency, razorpay_payment_link_id, razorpay_payment_link_url')
      .eq('member_id', (member as any).id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const existing = existingPayments?.[0] as any | undefined;
    if (existing?.razorpay_payment_link_id && existing?.razorpay_payment_link_url) {
      const createdAtMs = Date.parse(String(existing.created_at || ''));
      const isRecent = Number.isFinite(createdAtMs) && (Date.now() - createdAtMs) < 30 * 60 * 1000;
      const sameAmount = Number(existing.amount) === amountPaise;
      const sameCurrency = String(existing.currency || '').toUpperCase() === feeCurrency;
      if (isRecent && sameAmount && sameCurrency) {
        console.log('♻️ Reusing recent payment link');
        const reuseResponse: CreateLinkResponse = {
          payment_link_id: existing.razorpay_payment_link_id,
          payment_link_url: existing.razorpay_payment_link_url,
          amount: amountPaise,
          currency: feeCurrency,
        };
        return new Response(JSON.stringify(reuseResponse), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const callbackUrl = appUrl ? `${appUrl}/cart?success=true` : undefined;
    console.log('🔗 Callback URL:', callbackUrl);

    const payload: Record<string, unknown> = {
      amount: amountPaise,
      currency: feeCurrency,
      accept_partial: false,
      description: `NDADA registration fee (${(member as any).membership_id})`,
      customer: {
        name: (member as any).full_name,
        email: (member as any).email,
      },
      notes: {
        member_id: (member as any).id,
        membership_id: (member as any).membership_id,
      },
    };

    if (callbackUrl) {
      payload.callback_url = callbackUrl;
      payload.callback_method = 'get';
    }

    console.log('📤 Calling Razorpay API...');
    const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayResp = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('📥 Razorpay response status:', razorpayResp.status);

    const razorpayJson = await razorpayResp.json().catch(() => null);
    if (!razorpayResp.ok) {
      console.error('❌ Razorpay error:', razorpayJson);
      const msg = typeof razorpayJson?.error?.description === 'string'
        ? razorpayJson.error.description
        : `Razorpay error (${razorpayResp.status})`;
      throw new Error(msg);
    }

    const paymentLinkId = String(razorpayJson?.id || '');
    const paymentLinkUrl = String(razorpayJson?.short_url || razorpayJson?.url || '');
    if (!paymentLinkId || !paymentLinkUrl) {
      console.error('❌ Invalid Razorpay response - missing link ID or URL');
      throw new Error('Razorpay did not return a valid payment link');
    }

    console.log('✅ Got payment link from Razorpay:', paymentLinkId);

    const { error: insertErr } = await supabase.from('payments').insert({
      member_id: (member as any).id,
      amount: amountPaise,
      currency: feeCurrency,
      status: 'pending',
      provider: 'razorpay',
      razorpay_payment_link_id: paymentLinkId,
      razorpay_payment_link_url: paymentLinkUrl,
      provider_payload: razorpayJson,
    });

    if (insertErr) {
      console.error('❌ Database insert error:', insertErr);
      throw new Error(insertErr.message);
    }

    console.log('✅ Payment record created in database');

    const response: CreateLinkResponse = {
      payment_link_id: paymentLinkId,
      payment_link_url: paymentLinkUrl,
      amount: amountPaise,
      currency: feeCurrency,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message === 'Unauthorized' ? 403 : 500;
    console.error('❌ Function error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
