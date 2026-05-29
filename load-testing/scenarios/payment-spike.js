/**
 * NDADA Load Test: Payment Spike Scenario
 *
 * Simulates a rush of payment attempts — e.g., deadline day for
 * membership registration when many users pay simultaneously.
 *
 * This is critical because each payment:
 * 1. Calls razorpay-create-order edge function
 * 2. Edge function makes external API call to Razorpay
 * 3. Edge function writes to orders table
 * 4. Edge function reads from accounts table
 * 5. After payment, razorpay-verify-signature is called
 *
 * Each edge function invocation = cold start risk + PG connection.
 */

import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { THRESHOLDS, thinkTime, FREE_TIER_LIMITS } from './config.js';
import {
  loginTestUser,
  fetchAccount,
  loadDashboard,
  createPaymentOrder,
} from './helpers.js';

const paymentDuration = new Trend('spike_payment_duration', true);
const paymentErrors = new Rate('spike_payment_errors');
const paymentSuccess = new Counter('spike_payment_success');
const paymentFail = new Counter('spike_payment_fail');
const edgeFnCalls = new Counter('spike_edge_fn_invocations');

const tier = __ENV.TIER || 'medium';
const peakVUs = tier === 'stress' ? 500 : tier === 'heavy' ? 250 : tier === 'medium' ? 100 : 50;

// Payment scenarios typically involve fewer users but sustained load
const paymentVUs = Math.min(peakVUs, 100); // Cap at 100 concurrent payers

export const options = {
  scenarios: {
    payment_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Warm up
        { duration: '30s', target: Math.max(3, Math.floor(paymentVUs * 0.1)) },

        // Gradual increase as deadline approaches
        { duration: '1m', target: Math.floor(paymentVUs * 0.3) },
        { duration: '1m', target: Math.floor(paymentVUs * 0.6) },

        // Peak — deadline hour
        { duration: '3m', target: paymentVUs },

        // Sustained peak
        { duration: '2m', target: paymentVUs },

        // Cool down
        { duration: '1m', target: Math.floor(paymentVUs * 0.2) },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{flow:payment_create}': [
      `p(95)<${THRESHOLDS.paymentCreate.p95 * 1.5}`,
    ],
    'spike_payment_errors': ['rate<0.05'],  // < 5% payment errors
    'spike_payment_duration': ['p(95)<8000'], // Payment order within 8s
  },
};

export default function () {
  const vuIndex = (__VU - 1) % 500 + 1;

  // Login
  const session = loginTestUser(vuIndex);
  if (!session) {
    paymentErrors.add(1);
    sleep(3);
    return;
  }

  // Fetch account
  const account = fetchAccount(session.access_token, session.user_id);
  if (!account) {
    paymentErrors.add(1);
    sleep(3);
    return;
  }

  // Check if already paid
  if (account.payment_status === 'paid') {
    // Skip payment, just load dashboard
    loadDashboard(session.access_token, session.user_id, account.id);
    sleep(thinkTime());
    return;
  }

  // User browses payment page first
  sleep(thinkTime());

  // ──────────────────────────────────────────
  // Create payment order (edge function call)
  // ──────────────────────────────────────────
  const start = Date.now();
  edgeFnCalls.add(1);

  const res = createPaymentOrder(session.access_token, account.id);
  const duration = Date.now() - start;
  paymentDuration.add(duration);

  if (res.status === 200) {
    paymentSuccess.add(1);
    paymentErrors.add(0);
  } else {
    paymentFail.add(1);
    paymentErrors.add(1);
    console.warn(`Payment failed: ${res.status} - ${res.body}`);
  }

  // Simulate user reviewing payment page after order creation
  sleep(thinkTime() * 2);
}

export function handleSummary(data) {
  const p95 = data.metrics?.spike_payment_duration?.values?.['p(95)'] || 0;
  const p99 = data.metrics?.spike_payment_duration?.values?.['p(99)'] || 0;
  const errorRate = data.metrics?.spike_payment_errors?.values?.rate || 0;
  const success = data.metrics?.spike_payment_success?.values?.count || 0;
  const fail = data.metrics?.spike_payment_fail?.values?.count || 0;
  const edgeCalls = data.metrics?.spike_edge_fn_invocations?.values?.count || 0;

  const dailyLimit = FREE_TIER_LIMITS.edgeFunctions.invocationsPerDay;
  const perSecLimit = FREE_TIER_LIMITS.edgeFunctions.invocationsPerSecond;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         PAYMENT SPIKE ANALYSIS                   ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Peak concurrent payers: ${paymentVUs}`);
  console.log(`║  Successful orders:      ${success}`);
  console.log(`║  Failed orders:          ${fail}`);
  console.log(`║  Error rate:             ${(errorRate * 100).toFixed(2)}%`);
  console.log(`║  Order creation p95:     ${p95.toFixed(0)}ms`);
  console.log(`║  Order creation p99:     ${p99.toFixed(0)}ms`);
  console.log('║──────────────────────────────────────────────────║');
  console.log(`║  Edge fn invocations:    ${edgeCalls}`);
  console.log(`║  Daily limit:            ${dailyLimit}`);
  console.log(`║  Per-second limit:       ~${perSecLimit}`);

  if (edgeCalls > dailyLimit * 0.1) {
    console.log('║  ⚠️  High edge fn consumption detected!');
  }

  console.log('╚══════════════════════════════════════════════════╝\n');

  return { 'stdout': JSON.stringify(data, null, 2) };
}
