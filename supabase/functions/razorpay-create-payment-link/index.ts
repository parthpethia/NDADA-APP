// Supabase Edge Function: razorpay-create-payment-link
// Creates (or reuses) a Razorpay Payment Link for the authenticated member.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');

const feeAmountRupees = Number(Deno.env.get('REGISTRATION_FEE_AMOUNT_INR') || '300');
const feeCurrency = String(Deno.env.get('REGISTRATION_FEE_CURRENCY') || 'INR').toUpperCase();

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CreateLinkResponse = {
  payment_link_id: string;
  payment_link_url: string;
  amount: number;
  currency: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized');

    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('id, full_name, email, payment_status, membership_id')
      .eq('user_id', user.id)
      .single();

    if (memberErr || !member) throw new Error('Member not found');
    if (member.payment_status === 'paid') {
      throw new Error('Already paid');
    }

    const amountPaise = Math.round(feeAmountRupees * 100);

    // Reuse a recent pending link if available (prevents multiple links per user).
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('id, status, created_at, amount, currency, razorpay_payment_link_id, razorpay_payment_link_url')
      .eq('member_id', member.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    const existing = existingPayments?.[0] as any | undefined;
    if (existing?.razorpay_payment_link_id && existing?.razorpay_payment_link_url) {
      const createdAtMs = Date.parse(String(existing.created_at || ''));
      const isRecent = Number.isFinite(createdAtMs) && (Date.now() - createdAtMs) < 30 * 60 * 1000;
      const sameAmount = Number(existing.amount) === amountPaise;
      const sameCurrency = String(existing.currency || '').toUpperCase() === feeCurrency;
      if (isRecent) {
        if (sameAmount && sameCurrency) {
          const reuseResponse: CreateLinkResponse = {
            payment_link_id: existing.razorpay_payment_link_id,
            payment_link_url: existing.razorpay_payment_link_url,
            amount: amountPaise,
            currency: feeCurrency,
          };
          return new Response(JSON.stringify(reuseResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const callbackUrl = appUrl ? `${appUrl}/cart?success=true` : undefined;

    const payload: Record<string, unknown> = {
      amount: amountPaise,
      currency: feeCurrency,
      accept_partial: false,
      description: `NDADA registration fee (${member.membership_id})`,
      customer: {
        name: member.full_name,
        email: member.email,
      },
      notes: {
        member_id: member.id,
        membership_id: member.membership_id,
      },
    };

    if (callbackUrl) {
      payload.callback_url = callbackUrl;
      payload.callback_method = 'get';
    }

    const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayResp = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const razorpayJson = await razorpayResp.json().catch(() => null);
    if (!razorpayResp.ok) {
      const msg = typeof razorpayJson?.error?.description === 'string'
        ? razorpayJson.error.description
        : `Razorpay error (${razorpayResp.status})`;
      throw new Error(msg);
    }

    const paymentLinkId = String(razorpayJson?.id || '');
    const paymentLinkUrl = String(razorpayJson?.short_url || razorpayJson?.url || '');
    if (!paymentLinkId || !paymentLinkUrl) {
      throw new Error('Razorpay did not return a valid payment link');
    }

    const { error: insertErr } = await supabase.from('payments').insert({
      member_id: member.id,
      amount: amountPaise,
      currency: feeCurrency,
      status: 'pending',
      provider: 'razorpay',
      razorpay_payment_link_id: paymentLinkId,
      razorpay_payment_link_url: paymentLinkUrl,
      provider_payload: razorpayJson,
    });

    if (insertErr) throw new Error(insertErr.message);

    const response: CreateLinkResponse = {
      payment_link_id: paymentLinkId,
      payment_link_url: paymentLinkUrl,
      amount: amountPaise,
      currency: feeCurrency,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message === 'Unauthorized' ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
