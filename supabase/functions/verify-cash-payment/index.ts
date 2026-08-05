// Supabase Edge Function: verify-cash-payment (DEPRECATED)
// Cash payment intake and verification has been completely disabled in favor of online Razorpay payments.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({
    error: 'Cash payments have been disabled. All registration fee payments are processed online via Razorpay.',
    status: 'deprecated',
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
