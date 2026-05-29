/**
 * NDADA Load Test: Certificate Generation Spike
 *
 * Simulates a wave of certificate generation requests — e.g., after
 * batch payment verification or a bulk approval by admin.
 *
 * This is the HEAVIEST operation in the system because each certificate:
 * 1. Invokes generate-certificate edge function
 * 2. Edge function reads accounts table
 * 3. Edge function checks existing certificates
 * 4. Edge function downloads template from Storage
 * 5. Edge function generates PDF (CPU-intensive: pdf-lib + QR code)
 * 6. Edge function uploads PDF to Storage (~200KB)
 * 7. Edge function writes to certificates table
 * 8. Edge function updates certificate_generation_queue
 *
 * Expected bottleneck: Edge function memory (150MB) and execution time.
 * PDF generation is CPU-bound and can easily hit the 150s timeout.
 */

import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { THRESHOLDS, thinkTime, FREE_TIER_LIMITS } from './config.js';
import {
  loginTestUser,
  fetchAccount,
  generateCertificate,
  loadDashboard,
} from './helpers.js';

const certGenDuration = new Trend('spike_cert_gen_duration', true);
const certErrors = new Rate('spike_cert_errors');
const certSuccess = new Counter('spike_cert_success');
const certFail = new Counter('spike_cert_fail');
const edgeFnCalls = new Counter('spike_cert_edge_fn_calls');
const storageWrites = new Counter('spike_cert_storage_writes');

const tier = __ENV.TIER || 'light';
// Certificate generation is very heavy — cap concurrent generators
const peakVUs = tier === 'stress' ? 50 : tier === 'heavy' ? 30 : tier === 'medium' ? 15 : 5;

export const options = {
  scenarios: {
    cert_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.max(1, Math.floor(peakVUs * 0.2)) },
        { duration: '1m', target: Math.floor(peakVUs * 0.5) },
        { duration: '2m', target: peakVUs },
        { duration: '3m', target: peakVUs },  // Sustained
        { duration: '1m', target: Math.floor(peakVUs * 0.3) },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{flow:certificate_generation}': [
      `p(95)<${THRESHOLDS.certificateGeneration.p95 * 1.5}`,
    ],
    'spike_cert_errors': ['rate<0.10'],          // Allow 10% — this is expected to be stressed
    'spike_cert_gen_duration': ['p(95)<30000'],  // 30s p95 for cert generation
  },
};

export default function () {
  // Use a subset of users who are in "paid" status
  // VU indexes 1-100 are assumed to have payment_status=paid
  const vuIndex = ((__VU - 1) % 100) + 1;

  // Login
  const session = loginTestUser(vuIndex);
  if (!session) {
    certErrors.add(1);
    sleep(5);
    return;
  }

  // Fetch account
  const account = fetchAccount(session.access_token, session.user_id);
  if (!account) {
    certErrors.add(1);
    sleep(5);
    return;
  }

  // Check eligibility
  if (account.payment_status !== 'paid') {
    // Not eligible — just load dashboard
    loadDashboard(session.access_token, session.user_id, account.id);
    sleep(thinkTime());
    return;
  }

  // User views certificate page
  sleep(thinkTime());

  // ──────────────────────────────────────────
  // Generate certificate (edge function call)
  // ──────────────────────────────────────────
  const start = Date.now();
  edgeFnCalls.add(1);

  const res = generateCertificate(session.access_token, account.id);
  const duration = Date.now() - start;
  certGenDuration.add(duration);

  if (res.status === 200) {
    certSuccess.add(1);
    certErrors.add(0);
    storageWrites.add(1); // One PDF upload

    // Verify the response has a certificate
    try {
      const body = JSON.parse(res.body);
      check(body, {
        'cert has certificate_id': (b) => !!b.certificate?.certificate_id,
        'cert has certificate_url': (b) => !!b.certificate?.certificate_url,
      });
    } catch { /* ignore */ }
  } else {
    certFail.add(1);
    certErrors.add(1);

    // Distinguish error types
    if (res.status === 429) {
      console.warn('Rate limited by edge function');
    } else if (res.status === 504 || res.status === 502) {
      console.warn('Edge function timeout/gateway error');
    } else {
      console.warn(`Cert gen failed: ${res.status} - ${res.body?.substring(0, 200)}`);
    }
  }

  // Wait before next iteration (cert gen is expensive)
  sleep(thinkTime() * 3);
}

export function handleSummary(data) {
  const p95 = data.metrics?.spike_cert_gen_duration?.values?.['p(95)'] || 0;
  const p99 = data.metrics?.spike_cert_gen_duration?.values?.['p(99)'] || 0;
  const median = data.metrics?.spike_cert_gen_duration?.values?.['p(50)'] || 0;
  const errorRate = data.metrics?.spike_cert_errors?.values?.rate || 0;
  const success = data.metrics?.spike_cert_success?.values?.count || 0;
  const fail = data.metrics?.spike_cert_fail?.values?.count || 0;
  const edgeCalls = data.metrics?.spike_cert_edge_fn_calls?.values?.count || 0;
  const storageOps = data.metrics?.spike_cert_storage_writes?.values?.count || 0;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║     CERTIFICATE GENERATION SPIKE ANALYSIS        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Peak concurrent generators: ${peakVUs}`);
  console.log(`║  Successful generations:     ${success}`);
  console.log(`║  Failed generations:         ${fail}`);
  console.log(`║  Error rate:                 ${(errorRate * 100).toFixed(2)}%`);
  console.log(`║  Generation median:          ${median.toFixed(0)}ms`);
  console.log(`║  Generation p95:             ${p95.toFixed(0)}ms`);
  console.log(`║  Generation p99:             ${p99.toFixed(0)}ms`);
  console.log('║──────────────────────────────────────────────────║');
  console.log(`║  Edge fn invocations:        ${edgeCalls}`);
  console.log(`║  Storage writes (PDFs):      ${storageOps}`);
  console.log(`║  Est. storage used:          ~${(storageOps * 0.25).toFixed(1)} MB`);
  console.log(`║  Storage limit:              ${FREE_TIER_LIMITS.storage.maxSizeGB * 1024} MB`);

  if (p95 > 15000) {
    console.log('║  ⚠️  SLOW: p95 > 15s — risk of timeouts at scale');
  }
  if (errorRate > 0.05) {
    console.log('║  ⚠️  HIGH ERRORS: Connection pool likely exhausted');
  }

  console.log('╚══════════════════════════════════════════════════╝\n');

  return { 'stdout': JSON.stringify(data, null, 2) };
}
