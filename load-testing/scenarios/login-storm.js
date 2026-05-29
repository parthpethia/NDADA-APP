/**
 * NDADA Load Test: Login Storm Scenario
 *
 * Simulates a mass login event — e.g., all members trying to log in
 * simultaneously after a scheduled maintenance or announcement.
 *
 * This is the most likely bottleneck for Supabase Auth on the free tier.
 * GoTrue (Supabase Auth) shares the Postgres connection pool.
 */

import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { THRESHOLDS, thinkTime, FREE_TIER_LIMITS } from './config.js';
import {
  loginTestUser,
  fetchAccount,
  fetchAdminUser,
  loadDashboard,
} from './helpers.js';

const loginDuration = new Trend('storm_login_duration', true);
const postLoginDuration = new Trend('storm_post_login_duration', true);
const loginErrors = new Rate('storm_login_errors');
const loginSuccess = new Counter('storm_login_success');
const loginFail = new Counter('storm_login_fail');

const tier = __ENV.TIER || 'heavy';
const peakVUs = tier === 'stress' ? 500 : tier === 'heavy' ? 250 : tier === 'medium' ? 100 : 50;

export const options = {
  scenarios: {
    login_storm: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: peakVUs,
      maxVUs: peakVUs * 2,
      stages: [
        // Gradual ramp to simulate growing login wave
        { duration: '30s', target: Math.floor(peakVUs * 0.1) },   // 10% arrival rate
        { duration: '30s', target: Math.floor(peakVUs * 0.3) },   // 30%
        { duration: '30s', target: Math.floor(peakVUs * 0.6) },   // 60%
        { duration: '1m', target: peakVUs },                       // 100% — storm peak
        { duration: '3m', target: peakVUs },                       // Sustained storm
        { duration: '1m', target: Math.floor(peakVUs * 0.5) },    // Receding
        { duration: '30s', target: Math.floor(peakVUs * 0.1) },   // Tail
        { duration: '30s', target: 0 },                             // End
      ],
    },
  },
  thresholds: {
    'http_req_duration{flow:login}': [
      `p(95)<${THRESHOLDS.login.p95 * 2}`,    // 2x tolerance for storms
      `p(99)<${THRESHOLDS.login.p99 * 2}`,
    ],
    'storm_login_errors': ['rate<0.10'],       // Allow up to 10% failure during storms
    'storm_login_duration': ['p(95)<5000'],     // Login should complete within 5s even under storm
  },
};

export default function () {
  const vuIndex = (__VU - 1) % 500 + 1;

  // ──────────────────────────────────────────
  // Phase 1: Login attempt
  // ──────────────────────────────────────────
  const loginStart = Date.now();
  const session = loginTestUser(vuIndex);
  const loginTime = Date.now() - loginStart;
  loginDuration.add(loginTime);

  if (!session) {
    loginErrors.add(1);
    loginFail.add(1);
    sleep(1); // Brief pause before retry (VU will loop)
    return;
  }

  loginErrors.add(0);
  loginSuccess.add(1);

  // ──────────────────────────────────────────
  // Phase 2: Post-login bootstrap
  // This simulates what the app does immediately after login:
  //   1. Fetch account (accounts table)
  //   2. Fetch admin_users (admin check)
  // These happen in parallel via Promise.all in AuthProvider
  // ──────────────────────────────────────────
  const postLoginStart = Date.now();

  const account = fetchAccount(session.access_token, session.user_id);
  fetchAdminUser(session.access_token, session.user_id);

  postLoginDuration.add(Date.now() - postLoginStart);

  if (!account) {
    // Account fetch failed — likely connection pool exhaustion
    loginErrors.add(1);
    sleep(2);
    return;
  }

  // ──────────────────────────────────────────
  // Phase 3: Dashboard load (most users will go here after login)
  // ──────────────────────────────────────────
  sleep(thinkTime() * 0.3); // Very short think time during storms

  loadDashboard(session.access_token, session.user_id, account.id);

  sleep(thinkTime());
}

// ============================================================
// LIFECYCLE HOOKS
// ============================================================
export function handleSummary(data) {
  const loginP95 = data.metrics?.storm_login_duration?.values?.['p(95)'] || 0;
  const loginP99 = data.metrics?.storm_login_duration?.values?.['p(99)'] || 0;
  const errorRate = data.metrics?.storm_login_errors?.values?.rate || 0;
  const successCount = data.metrics?.storm_login_success?.values?.count || 0;
  const failCount = data.metrics?.storm_login_fail?.values?.count || 0;

  const pgConnLimit = FREE_TIER_LIMITS.database.maxConnections;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         LOGIN STORM ANALYSIS                     ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Peak VUs:          ${peakVUs}`);
  console.log(`║  Successful logins: ${successCount}`);
  console.log(`║  Failed logins:     ${failCount}`);
  console.log(`║  Error rate:        ${(errorRate * 100).toFixed(2)}%`);
  console.log(`║  Login p95:         ${loginP95.toFixed(0)}ms`);
  console.log(`║  Login p99:         ${loginP99.toFixed(0)}ms`);
  console.log('║──────────────────────────────────────────────────║');
  console.log(`║  PG Connection Limit: ${pgConnLimit}`);
  console.log(`║  Each login = ~2 PG queries (auth + profile)`);
  console.log(`║  Estimated peak PG load: ${peakVUs * 2} queries`);

  if (peakVUs > pgConnLimit) {
    console.log('║  ⚠️  WARNING: Peak VUs EXCEED connection limit!');
    console.log('║  Connection pool exhaustion is EXPECTED.');
  }

  console.log('╚══════════════════════════════════════════════════╝\n');

  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}
