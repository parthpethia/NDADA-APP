// Supabase Edge Function: razorpay-create-payment-link
// Creates (or reuses) a Razorpay Payment Link for the authenticated member.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkEdgeRateLimit } from '../_shared/rate-limiter.ts';
import { validateAndParseJson } from '../_shared/request-validator.ts';

type CreateLinkResponse = {
  payment_link_id: string;
  payment_link_url: string;
  amount: number;
  currency: string;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests FIRST
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
      const msg = 'Razorpay credentials not configured.';
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

    // Get Authorization header
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

    // Rate limit check: Max 5 payment link creations per 5 mins
    const rateLimitResult = await checkEdgeRateLimit(req, supabase, 'create_payment_link', 5, 300, user.id);
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response;
    }

    // Validate request payload size (Max 512KB) & parse JSON
    const { data: body, errorResponse } = await validateAndParseJson(req, 512 * 1024);
    if (errorResponse) return errorResponse;

    // Try to get member_id from request body
    let memberId = String(body?.member_id || '').trim();

    // If no member_id in body but user is authenticated, fetch from database
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

    // member_id must be determined
    if (!memberId) {
      return new Response(JSON.stringify({ error: 'member_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch full account record
    const { data: member, error: memberErr } = await supabase
      .from('accounts')
      .select('id, full_name, email, payment_status, membership_id, user_id')
      .eq('id', memberId)
      .single();

    if (memberErr || !member) {
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

    console.log('✅ Member found:', (member as any).membership_id);

    if ((member as any).payment_status === 'paid') {
      console.warn('⚠️ Member already paid');
      return new Response(JSON.stringify({
        error: 'Payment already completed',
        payment_status: (member as any).payment_status,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      description: `NDADA registration fee${(member as any).membership_id ? ` (${(member as any).membership_id})` : ''}`,
      customer: {
        name: (member as any).full_name,
        email: (member as any).email,
      },
      notes: {
        member_id: (member as any).id,
        membership_id: (member as any).membership_id || '',
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
        : `Razorpay API failed (${razorpayResp.status})`;
      return new Response(JSON.stringify({
        error: msg,
        razorpay_status: razorpayResp.status,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentLinkId = String(razorpayJson?.id || '');
    const paymentLinkUrl = String(razorpayJson?.short_url || razorpayJson?.url || '');
    if (!paymentLinkId || !paymentLinkUrl) {
      console.error('❌ Invalid Razorpay response - missing link ID or URL');
      console.error('   Response:', razorpayJson);
      return new Response(JSON.stringify({
        error: 'Invalid Razorpay response',
        details: 'Missing payment link',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      console.error('❌ Database insert error:', insertErr.message);
      console.error('   Code:', insertErr.code);
      return new Response(JSON.stringify({
        error: 'Failed to save payment',
        details: insertErr.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    const status = message === 'Unauthorized' ? 403 : 500;

    console.error('❌ Function error:', message);
    console.error('Stack:', stack);

    return new Response(JSON.stringify({
      error: message,
      details: stack?.split('\n').slice(0, 3).join(' | '),
      timestamp: new Date().toISOString(),
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
