/**
 * NDADA Load Test: Normal Traffic Scenario
 *
 * Simulates realistic everyday usage patterns:
 * - 60% of users browse dashboard
 * - 15% update profile
 * - 10% check notifications
 * - 5% register firms
 * - 5% make payments
 * - 3% download certificates
 * - 2% admin operations
 *
 * VU Assignment: Each VU picks a random flow weighted by distribution.
 */

import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import {
  LOAD_TIERS,
  THRESHOLDS,
  thinkTime,
  browseThinkTime,
} from './config.js';
import {
  loginTestUser,
  fetchAccount,
  loadDashboard,
  updateProfile,
  fetchNotifications,
  markNotificationRead,
  submitFirmRegistration,
  createPaymentOrder,
  generateCertificate,
  loadAdminDashboard,
  adminFetchAccounts,
} from './helpers.js';

// ============================================================
// CUSTOM METRICS
// ============================================================
const loginDuration = new Trend('ndada_login_duration', true);
const dashboardDuration = new Trend('ndada_dashboard_duration', true);
const profileUpdateDuration = new Trend('ndada_profile_update_duration', true);
const notificationsDuration = new Trend('ndada_notifications_duration', true);
const firmRegDuration = new Trend('ndada_firm_reg_duration', true);
const paymentDuration = new Trend('ndada_payment_duration', true);
const certGenDuration = new Trend('ndada_cert_gen_duration', true);
const adminDashDuration = new Trend('ndada_admin_dash_duration', true);
const flowErrors = new Rate('ndada_flow_errors');
const flowCounter = new Counter('ndada_flow_executions');

// ============================================================
// LOAD CONFIGURATION
// ============================================================
const tier = __ENV.TIER || 'light';
const config = LOAD_TIERS[tier] || LOAD_TIERS.light;

export const options = {
  scenarios: {
    normal_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(config.vus * 0.25) },  // Ramp up 25%
        { duration: '1m', target: Math.floor(config.vus * 0.5) },   // Ramp up 50%
        { duration: '1m', target: config.vus },                      // Full load
        { duration: config.duration, target: config.vus },           // Sustain
        { duration: '1m', target: Math.floor(config.vus * 0.25) },  // Ramp down
        { duration: '30s', target: 0 },                              // Cool down
      ],
    },
  },
  thresholds: {
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration.p95}`],
    'http_req_duration{flow:login}': [`p(95)<${THRESHOLDS.login.p95}`],
    'http_req_duration{flow:dashboard_load}': [`p(95)<${THRESHOLDS.dashboardLoad.p95}`],
    'http_req_duration{flow:profile_update}': [`p(95)<${THRESHOLDS.profileUpdate.p95}`],
    'http_req_duration{flow:notifications}': [`p(95)<${THRESHOLDS.notifications.p95}`],
    'http_req_duration{flow:firm_registration}': [`p(95)<${THRESHOLDS.firmRegistration.p95}`],
    'http_req_duration{flow:payment_create}': [`p(95)<${THRESHOLDS.paymentCreate.p95}`],
    'http_req_duration{flow:certificate_generation}': [`p(95)<${THRESHOLDS.certificateGeneration.p95}`],
    'http_req_duration{flow:admin_dashboard}': [`p(95)<${THRESHOLDS.adminDashboard.p95}`],
    'ndada_flow_errors': [`rate<${THRESHOLDS.errorRate.max}`],
  },
};

// ============================================================
// FLOW DISTRIBUTION (weighted random selection)
// ============================================================
const FLOWS = [
  { name: 'dashboard',     weight: 60, fn: flowDashboard },
  { name: 'profile',       weight: 15, fn: flowProfile },
  { name: 'notifications', weight: 10, fn: flowNotifications },
  { name: 'firm_reg',      weight: 5,  fn: flowFirmRegistration },
  { name: 'payment',       weight: 5,  fn: flowPayment },
  { name: 'cert_download', weight: 3,  fn: flowCertificate },
  { name: 'admin',         weight: 2,  fn: flowAdmin },
];

const totalWeight = FLOWS.reduce((sum, f) => sum + f.weight, 0);

function selectFlow() {
  let r = Math.random() * totalWeight;
  for (const flow of FLOWS) {
    r -= flow.weight;
    if (r <= 0) return flow;
  }
  return FLOWS[0];
}

// ============================================================
// MAIN TEST FUNCTION
// ============================================================
export default function () {
  // Each VU gets a unique index for login
  const vuIndex = (__VU - 1) % 500 + 1;

  // Step 1: Login
  const startLogin = Date.now();
  const session = loginTestUser(vuIndex);
  loginDuration.add(Date.now() - startLogin);

  if (!session) {
    flowErrors.add(1);
    sleep(5);
    return;
  }

  sleep(thinkTime());

  // Step 2: Fetch account
  const account = fetchAccount(session.access_token, session.user_id);
  if (!account) {
    flowErrors.add(1);
    sleep(5);
    return;
  }

  // Step 3: Select and execute a weighted random flow
  const flow = selectFlow();
  flowCounter.add(1, { flow: flow.name });

  try {
    flow.fn(session, account);
    flowErrors.add(0);
  } catch (err) {
    console.error(`Flow ${flow.name} failed: ${err}`);
    flowErrors.add(1);
  }

  sleep(browseThinkTime());
}

// ============================================================
// FLOW IMPLEMENTATIONS
// ============================================================

function flowDashboard(session, account) {
  const start = Date.now();
  loadDashboard(session.access_token, session.user_id, account.id);
  dashboardDuration.add(Date.now() - start);
}

function flowProfile(session, account) {
  // Load dashboard first (realistic)
  loadDashboard(session.access_token, session.user_id, account.id);
  sleep(thinkTime());

  // Update profile
  const start = Date.now();
  updateProfile(session.access_token, account.id);
  profileUpdateDuration.add(Date.now() - start);
}

function flowNotifications(session, account) {
  const start = Date.now();
  const res = fetchNotifications(session.access_token, session.user_id);
  notificationsDuration.add(Date.now() - start);

  // Mark first unread notification as read (if any)
  try {
    const notifications = JSON.parse(res.body);
    const unread = notifications.filter(n => !n.read);
    if (unread.length > 0) {
      sleep(1);
      markNotificationRead(session.access_token, unread[0].id);
    }
  } catch { /* ignore */ }
}

function flowFirmRegistration(session, account) {
  // Load dashboard first
  loadDashboard(session.access_token, session.user_id, account.id);
  sleep(thinkTime());

  // Submit firm
  const start = Date.now();
  submitFirmRegistration(session.access_token, account.id);
  firmRegDuration.add(Date.now() - start);
}

function flowPayment(session, account) {
  // Only attempt payment if status allows
  if (account.payment_status === 'paid') {
    // Already paid — just load dashboard instead
    flowDashboard(session, account);
    return;
  }

  const start = Date.now();
  createPaymentOrder(session.access_token, account.id);
  paymentDuration.add(Date.now() - start);
}

function flowCertificate(session, account) {
  if (account.payment_status !== 'paid') {
    // Not eligible — load dashboard instead
    flowDashboard(session, account);
    return;
  }

  const start = Date.now();
  generateCertificate(session.access_token, account.id);
  certGenDuration.add(Date.now() - start);
}

function flowAdmin(session, account) {
  // Simulate admin dashboard load (uses same REST queries)
  const start = Date.now();
  loadAdminDashboard(session.access_token);
  sleep(thinkTime());
  adminFetchAccounts(session.access_token, 'pending');
  adminDashDuration.add(Date.now() - start);
}
