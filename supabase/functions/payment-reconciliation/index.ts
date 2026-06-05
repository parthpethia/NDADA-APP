// Supabase Edge Function: payment-reconciliation
// Periodically checks pending payments against Razorpay APIs and reconciles them in the database.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // CORS Headers support
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') || '';
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';

    if (!supabaseUrl || !supabaseServiceKey || !razorpayKeyId || !razorpayKeySecret) {
      console.error('❌ Credentials missing in Deno environment');
      return new Response(JSON.stringify({ error: 'Reconciliation credentials missing' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

    // Fetch payments that are pending or processing, older than 10 minutes (to avoid racing live users), and within the last 7 days
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingPayments, error: fetchErr } = await supabase
      .from('payments')
      .select('*')
      .in('status', ['pending', 'processing'])
      .gt('created_at', sevenDaysAgo)
      .lt('created_at', tenMinutesAgo);

    if (fetchErr) {
      console.error('❌ Error fetching pending payments:', fetchErr.message);
      throw fetchErr;
    }

    console.log(`📋 Reconciling ${pendingPayments?.length || 0} pending payments...`);
    const results = [];

    for (const payment of (pendingPayments || [])) {
      try {
        let statusUpdated = false;
        let finalStatus = payment.status;
        let razorpayPaymentId = payment.razorpay_payment_id;

        // 1. Reconcile Payment Links
        if (payment.razorpay_payment_link_id) {
          console.log(`Checking Payment Link: ${payment.razorpay_payment_link_id}`);
          const res = await fetch(`https://api.razorpay.com/v1/payment_links/${payment.razorpay_payment_link_id}`, {
            headers: { Authorization: authHeader }
          });
          
          if (res.ok) {
            const data = await res.json();
            console.log(`   Link Status: ${data.status}`);
            
            if (data.status === 'paid') {
              finalStatus = 'paid';
              statusUpdated = true;
              
              // Try to find the captured payment ID from payments list
              if (data.payments && data.payments.length > 0) {
                const successfulPayment = data.payments.find((p: any) => p.status === 'captured');
                if (successfulPayment) {
                  razorpayPaymentId = successfulPayment.payment_id;
                }
              }
            } else if (data.status === 'expired' || data.status === 'cancelled') {
              finalStatus = data.status === 'expired' ? 'expired' : 'failed';
              statusUpdated = true;
            }
          } else {
            console.error(`   Failed to fetch link details from Razorpay: ${res.statusText}`);
          }
        } 
        // 2. Reconcile Standard Orders
        else if (payment.razorpay_order_id) {
          console.log(`Checking Order: ${payment.razorpay_order_id}`);
          const res = await fetch(`https://api.razorpay.com/v1/orders/${payment.razorpay_order_id}`, {
            headers: { Authorization: authHeader }
          });
          
          if (res.ok) {
            const data = await res.json();
            console.log(`   Order Status: ${data.status}`);
            
            if (data.status === 'paid') {
              finalStatus = 'paid';
              statusUpdated = true;
              
              // Fetch order payments to get the captured payment ID
              const payRes = await fetch(`https://api.razorpay.com/v1/orders/${payment.razorpay_order_id}/payments`, {
                headers: { Authorization: authHeader }
              });
              if (payRes.ok) {
                const payData = await payRes.json();
                if (payData.items && payData.items.length > 0) {
                  const capturedPay = payData.items.find((p: any) => p.status === 'captured');
                  if (capturedPay) {
                    razorpayPaymentId = capturedPay.id;
                  }
                }
              }
            } else if (data.status === 'attempted' && new Date(payment.expires_at || '').getTime() < Date.now()) {
              // Order expired in our DB or timeline
              finalStatus = 'expired';
              statusUpdated = true;
            }
          } else {
            console.error(`   Failed to fetch order details from Razorpay: ${res.statusText}`);
          }
        }

        // 3. Update Database if status changed
        if (statusUpdated) {
          console.log(`   Updating DB: Payment ${payment.id} status is now ${finalStatus}`);
          
          await supabase
            .from('payments')
            .update({ 
              status: finalStatus,
              razorpay_payment_id: razorpayPaymentId || null,
              provider_event: 'reconciliation_job'
            })
            .eq('id', payment.id);
          
          if (finalStatus === 'paid') {
            // Update user accounts to paid
            await supabase
              .from('accounts')
              .update({ payment_status: 'paid' })
              .eq('id', payment.member_id);
            
            // Queue certificate generation job
            await supabase.from('certificate_generation_queue').upsert(
              { account_id: payment.member_id, status: 'pending' },
              { onConflict: 'account_id' }
            );
            
            // Invoke certificate queue runner
            supabase.functions.invoke('process-certificate-queue', { body: {} }).catch((e) => {
              console.error('   Failed to invoke process-certificate-queue:', e.message);
            });
          } else {
            // Update account status to failed/expired
            await supabase
              .from('accounts')
              .update({ payment_status: finalStatus })
              .eq('id', payment.member_id);
          }
          
          results.push({ payment_id: payment.id, reconciled: true, status: finalStatus });
        } else {
          results.push({ payment_id: payment.id, reconciled: false, reason: 'Status unchanged' });
        }
      } catch (itemErr: any) {
        console.error(`❌ Error reconciling payment ${payment.id}:`, itemErr.message);
        results.push({ payment_id: payment.id, reconciled: false, error: itemErr.message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results }), {
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error('❌ Reconciliation job error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
