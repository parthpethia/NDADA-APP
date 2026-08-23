// Supabase Edge Function: payment-reconciliation
// Periodically checks pending payments against Razorpay APIs and reconciles them in the database.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { checkEdgeRateLimit } from '../_shared/rate-limiter.ts';
import { validateAndParseJson } from '../_shared/request-validator.ts';

serve(async (req) => {
  const corsHeaders = {
    ...getCorsHeaders(req),
    'Content-Type': 'application/json',
  };

  // CORS Headers support
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

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

    // Rate limit check: Max 20 reconciliation triggers per 5 mins
    const rateLimitResult = await checkEdgeRateLimit(req, supabase, 'reconciliation', 20, 300);
    if (!rateLimitResult.allowed && rateLimitResult.response) {
      return rateLimitResult.response;
    }

    // Validate payload size (Max 512KB) & parse JSON safely
    const { data: bodyData, errorResponse } = await validateAndParseJson(req, 512 * 1024);
    if (errorResponse) return errorResponse;

    const authHeader = 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

    // Parse request body for optional member_id parameter
    const body = bodyData || {};
    const targetMemberId = body?.member_id;
    const force = !!body?.force;

    let pendingPayments: any[] = [];

    if (targetMemberId) {
      console.log(`🎯 Real-time single member reconciliation for member: ${targetMemberId}`);
      // Reconcile payments for specific member without 10-min delay
      const { data: memberPayments, error: fetchErr } = await supabase
        .from('payments')
        .select('*')
        .eq('member_id', targetMemberId)
        .in('status', ['pending', 'processing']);

      if (fetchErr) {
        console.error('❌ Error fetching member pending payments:', fetchErr.message);
      } else if (memberPayments) {
        pendingPayments = memberPayments;
      }

      // If no payment row exists yet, check orders table for attempted/created orders
      const { data: memberOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('member_id', targetMemberId)
        .in('status', ['created', 'attempted']);

      if (memberOrders && memberOrders.length > 0) {
        for (const ord of memberOrders) {
          const alreadyInList = pendingPayments.some((p) => p.razorpay_order_id === ord.razorpay_order_id);
          if (!alreadyInList) {
            pendingPayments.push({
              id: ord.id,
              member_id: ord.member_id,
              razorpay_order_id: ord.razorpay_order_id,
              amount: ord.amount,
              currency: ord.currency,
              status: 'processing',
              created_at: ord.created_at,
            });
          }
        }
      }
    } else {
      // Fetch payments that are pending or processing within the last 7 days
      // If force is true, skip 10-minute age filter; otherwise, apply 10-minute filter
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('payments')
        .select('*')
        .in('status', ['pending', 'processing'])
        .gt('created_at', sevenDaysAgo);

      if (!force) {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        query = query.lt('created_at', tenMinutesAgo);
      }

      const { data, error: fetchErr } = await query;

      if (fetchErr) {
        console.error('❌ Error fetching pending payments:', fetchErr.message);
        throw fetchErr;
      }
      pendingPayments = data || [];
    }

    console.log(`📋 Reconciling ${pendingPayments.length} pending payments/orders...`);
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
            } else if (data.status === 'attempted') {
              // Check if any payment for this order was captured
              const payRes = await fetch(`https://api.razorpay.com/v1/orders/${payment.razorpay_order_id}/payments`, {
                headers: { Authorization: authHeader }
              });
              if (payRes.ok) {
                const payData = await payRes.json();
                if (payData.items && payData.items.length > 0) {
                  const capturedPay = payData.items.find((p: any) => p.status === 'captured');
                  if (capturedPay) {
                    razorpayPaymentId = capturedPay.id;
                    finalStatus = 'paid';
                    statusUpdated = true;
                  }
                }
              }

              if (!statusUpdated) {
                // Consider orders expired if they were created more than 30 minutes ago
                const orderCreatedAt = Date.parse(String(payment.created_at || ''));
                const ORDER_EXPIRY_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
                const isExpired = Number.isFinite(orderCreatedAt) && (Date.now() - orderCreatedAt) > ORDER_EXPIRY_WINDOW_MS;
                if (isExpired) {
                  finalStatus = 'expired';
                  statusUpdated = true;
                }
              }
            }
          } else {
            console.error(`   Failed to fetch order details from Razorpay: ${res.statusText}`);
          }
        }

        // 3. Update Database if status changed
        if (statusUpdated) {
          console.log(`   Updating DB: Payment ${payment.id} status is now ${finalStatus}`);
          
          if (payment.razorpay_order_id) {
            await supabase
              .from('orders')
              .update({ status: finalStatus === 'paid' ? 'paid' : finalStatus })
              .eq('razorpay_order_id', payment.razorpay_order_id);

            const { data: existingPayment } = await supabase
              .from('payments')
              .select('id')
              .eq('razorpay_order_id', payment.razorpay_order_id)
              .maybeSingle();

            if (existingPayment) {
              await supabase
                .from('payments')
                .update({ 
                  status: finalStatus,
                  razorpay_payment_id: razorpayPaymentId || null,
                  provider_event: 'reconciliation_job'
                })
                .eq('id', existingPayment.id);
            } else {
              await supabase
                .from('payments')
                .insert({
                  member_id: payment.member_id,
                  razorpay_order_id: payment.razorpay_order_id,
                  razorpay_payment_id: razorpayPaymentId || null,
                  amount: payment.amount,
                  currency: payment.currency || 'INR',
                  status: finalStatus,
                  provider: 'razorpay',
                  provider_event: 'reconciliation_job'
                });
            }
          } else {
            await supabase
              .from('payments')
              .update({ 
                status: finalStatus,
                razorpay_payment_id: razorpayPaymentId || null,
                provider_event: 'reconciliation_job'
              })
              .eq('id', payment.id);
          }
          
          if (finalStatus === 'paid') {
            // Update user accounts to paid and fetch details for email
            const { data: memberAcc } = await supabase
              .from('accounts')
              .update({ payment_status: 'paid' })
              .eq('id', payment.member_id)
              .select('full_name, email, membership_id')
              .single();

            if (memberAcc?.email) {
              supabase.functions.invoke('send-email', {
                body: {
                  to: memberAcc.email,
                  template_name: 'payment_received',
                  data: {
                    name: memberAcc.full_name || 'Member',
                    amount: String(payment.amount ? Math.round(Number(payment.amount) > 1000 ? Number(payment.amount) / 100 : Number(payment.amount)) : '300'),
                    membership_id: memberAcc.membership_id || 'NDADA-MEM',
                  },
                },
              }).catch((e) => {
                console.error('Failed to send payment_received email in reconciliation:', e.message);
              });
            }
            
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
