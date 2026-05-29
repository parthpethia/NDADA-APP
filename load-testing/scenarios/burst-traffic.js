/**
 * NDADA Load Test: Burst Traffic Scenario
 *
 * Simulates sudden traffic spikes - e.g., an announcement or deadline.
 * Pattern: baseline → spike → baseline → bigger spike → cool down
 */

import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { THRESHOLDS, thinkTime } from './config.js';
import {
  loginTestUser,
  fetchAccount,
  loadDashboard,
  fetchNotifications,
  updateProfile,
} from './helpers.js';

const burstLoginDuration = new Trend('burst_login_duration', true);
const burstDashDuration = new Trend('burst_dashboard_duration', true);
const burstErrors = new Rate('burst_errors');

const tier = __ENV.TIER || 'heavy';
const peakVUs = tier === 'stress' ? 500 : tier === 'heavy' ? 250 : tier === 'medium' ? 100 : 50;

export const options = {
  scenarios: {
    burst_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Phase 1: Baseline (10% of peak)
        { duration: '30s', target: Math.max(5, Math.floor(peakVUs * 0.1)) },
        { duration: '1m', target: Math.max(5, Math.floor(peakVUs * 0.1)) },

        // Phase 2: First burst (60% of peak)
        { duration: '15s', target: Math.floor(peakVUs * 0.6) },
        { duration: '2m', target: Math.floor(peakVUs * 0.6) },

        // Phase 3: Drop back to baseline
        { duration: '15s', target: Math.max(5, Math.floor(peakVUs * 0.1)) },
        { duration: '1m', target: Math.max(5, Math.floor(peakVUs * 0.1)) },

        // Phase 4: Full spike (100% of peak)
        { duration: '10s', target: peakVUs },
        { duration: '3m', target: peakVUs },

        // Phase 5: Gradual cool down
        { duration: '30s', target: Math.floor(peakVUs * 0.3) },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration.p95 * 1.5}`],  // 50% more lenient during bursts
    'http_req_duration{flow:login}': [`p(95)<${THRESHOLDS.login.p95 * 1.5}`],
    'http_req_duration{flow:dashboard_load}': [`p(95)<${THRESHOLDS.dashboardLoad.p95 * 1.5}`],
    'burst_errors': [`rate<0.05`],  // Allow up to 5% errors during bursts
  },
};

export default function () {
  const vuIndex = (__VU - 1) % 500 + 1;

  // Login
  const loginStart = Date.now();
  const session = loginTestUser(vuIndex);
  burstLoginDuration.add(Date.now() - loginStart);

  if (!session) {
    burstErrors.add(1);
    sleep(2);
    return;
  }

  sleep(thinkTime() * 0.5); // Shorter think time during bursts

  // Fetch account
  const account = fetchAccount(session.access_token, session.user_id);
  if (!account) {
    burstErrors.add(1);
    sleep(2);
    return;
  }

  // Dashboard load (primary burst activity)
  const dashStart = Date.now();
  loadDashboard(session.access_token, session.user_id, account.id);
  burstDashDuration.add(Date.now() - dashStart);

  burstErrors.add(0);

  // 30% chance of additional actions during burst
  if (Math.random() < 0.3) {
    sleep(thinkTime() * 0.5);

    // Quick profile check or notification fetch
    if (Math.random() < 0.5) {
      fetchNotifications(session.access_token, session.user_id);
    } else {
      updateProfile(session.access_token, account.id);
    }
  }

  sleep(thinkTime());
}
