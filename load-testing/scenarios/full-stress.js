/**
 * NDADA Load Test: Full Stress Test
 *
 * Combined scenario that runs ALL user flows simultaneously at scale.
 * This is the final validation test — if this passes at 500 VUs,
 * the system can handle 500 concurrent users.
 *
 * Uses separate scenarios (k6 executors) for each flow type
 * to maintain realistic distribution even under stress.
 */

import { sleep, check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { THRESHOLDS, thinkTime, browseThinkTime } from './config.js';
import {
  loginTestUser,
  fetchAccount,
  fetchAdminUser,
  loadDashboard,
  updateProfile,
  fetchNotifications,
  markNotificationRead,
  submitFirmRegistration,
  uploadDocument,
  createPaymentOrder,
  generateCertificate,
  loadAdminDashboard,
  adminFetchAccounts,
  adminApproveAccount,
} from './helpers.js';

// Custom metrics per flow
const metrics = {
  login: new Trend('stress_login_ms', true),
  dashboard: new Trend('stress_dashboard_ms', true),
  profile: new Trend('stress_profile_ms', true),
  notifications: new Trend('stress_notifications_ms', true),
  firmReg: new Trend('stress_firm_reg_ms', true),
  docUpload: new Trend('stress_doc_upload_ms', true),
  payment: new Trend('stress_payment_ms', true),
  certGen: new Trend('stress_cert_gen_ms', true),
  adminDash: new Trend('stress_admin_dash_ms', true),
  adminApproval: new Trend('stress_admin_approval_ms', true),
};

const errors = new Rate('stress_errors');
const flowCount = new Counter('stress_flow_count');

const tier = __ENV.TIER || 'heavy';
const multiplier = tier === 'stress' ? 1.0 : tier === 'heavy' ? 0.5 : tier === 'medium' ? 0.2 : 0.1;

export const options = {
  scenarios: {
    // 60% - Dashboard browsers
    dashboard_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(300 * multiplier) },
        { duration: '8m', target: Math.floor(300 * multiplier) },
        { duration: '1m', target: 0 },
      ],
      exec: 'dashboardFlow',
    },

    // 15% - Profile updaters
    profile_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(75 * multiplier) },
        { duration: '8m', target: Math.floor(75 * multiplier) },
        { duration: '1m', target: 0 },
      ],
      exec: 'profileFlow',
    },

    // 10% - Notification checkers
    notification_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(50 * multiplier) },
        { duration: '8m', target: Math.floor(50 * multiplier) },
        { duration: '1m', target: 0 },
      ],
      exec: 'notificationFlow',
    },

    // 5% - Firm registrants
    firm_reg_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(25 * multiplier) },
        { duration: '8m', target: Math.floor(25 * multiplier) },
        { duration: '1m', target: 0 },
      ],
      exec: 'firmRegFlow',
    },

    // 5% - Payment makers
    payment_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(25 * multiplier) },
        { duration: '8m', target: Math.floor(25 * multiplier) },
        { duration: '1m', target: 0 },
      ],
      exec: 'paymentFlow',
    },

    // 3% - Certificate generators/downloaders
    cert_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.floor(15 * multiplier) },
        { duration: '8m', target: Math.floor(15 * multiplier) },
        { duration: '1m', target: 0 },
      ],
      exec: 'certificateFlow',
    },

    // 2% - Admin users
    admin_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.max(1, Math.floor(10 * multiplier)) },
        { duration: '8m', target: Math.max(1, Math.floor(10 * multiplier)) },
        { duration: '1m', target: 0 },
      ],
      exec: 'adminFlow',
    },
  },

  thresholds: {
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration.p95}`],
    'stress_errors': [`rate<${THRESHOLDS.errorRate.max}`],
    'stress_login_ms': [`p(95)<${THRESHOLDS.login.p95}`],
    'stress_dashboard_ms': [`p(95)<${THRESHOLDS.dashboardLoad.p95}`],
    'stress_profile_ms': [`p(95)<${THRESHOLDS.profileUpdate.p95}`],
    'stress_notifications_ms': [`p(95)<${THRESHOLDS.notifications.p95}`],
    'stress_firm_reg_ms': [`p(95)<${THRESHOLDS.firmRegistration.p95}`],
    'stress_payment_ms': [`p(95)<${THRESHOLDS.paymentCreate.p95}`],
    'stress_cert_gen_ms': [`p(95)<${THRESHOLDS.certificateGeneration.p95}`],
    'stress_admin_dash_ms': [`p(95)<${THRESHOLDS.adminDashboard.p95}`],
    'stress_admin_approval_ms': [`p(95)<${THRESHOLDS.adminApproval.p95}`],
  },
};

// ============================================================
// SHARED LOGIN HELPER
// ============================================================
function loginAndFetchAccount(vuOffset = 0) {
  const vuIndex = ((__VU - 1 + vuOffset) % 500) + 1;

  const loginStart = Date.now();
  const session = loginTestUser(vuIndex);
  metrics.login.add(Date.now() - loginStart);

  if (!session) {
    errors.add(1);
    return null;
  }

  const account = fetchAccount(session.access_token, session.user_id);
  if (!account) {
    errors.add(1);
    return null;
  }

  return { session, account };
}

// ============================================================
// FLOW FUNCTIONS (each maps to a scenario executor)
// ============================================================

export function dashboardFlow() {
  const ctx = loginAndFetchAccount();
  if (!ctx) { sleep(5); return; }

  flowCount.add(1, { flow: 'dashboard' });
  sleep(thinkTime());

  const start = Date.now();
  loadDashboard(ctx.session.access_token, ctx.session.user_id, ctx.account.id);
  metrics.dashboard.add(Date.now() - start);
  errors.add(0);

  sleep(browseThinkTime());
}

export function profileFlow() {
  const ctx = loginAndFetchAccount(100);
  if (!ctx) { sleep(5); return; }

  flowCount.add(1, { flow: 'profile' });
  loadDashboard(ctx.session.access_token, ctx.session.user_id, ctx.account.id);
  sleep(thinkTime());

  const start = Date.now();
  updateProfile(ctx.session.access_token, ctx.account.id);
  metrics.profile.add(Date.now() - start);
  errors.add(0);

  sleep(browseThinkTime());
}

export function notificationFlow() {
  const ctx = loginAndFetchAccount(200);
  if (!ctx) { sleep(5); return; }

  flowCount.add(1, { flow: 'notifications' });

  const start = Date.now();
  const res = fetchNotifications(ctx.session.access_token, ctx.session.user_id);
  metrics.notifications.add(Date.now() - start);
  errors.add(0);

  // Mark a notification as read
  try {
    const notifs = JSON.parse(res.body);
    const unread = notifs.filter(n => !n.read);
    if (unread.length > 0) {
      sleep(1);
      markNotificationRead(ctx.session.access_token, unread[0].id);
    }
  } catch { /* ignore */ }

  sleep(browseThinkTime());
}

export function firmRegFlow() {
  const ctx = loginAndFetchAccount(300);
  if (!ctx) { sleep(5); return; }

  flowCount.add(1, { flow: 'firm_reg' });
  sleep(thinkTime());

  // Simulate multi-step form (think times between steps)
  sleep(thinkTime()); // Step 1: Business details
  sleep(thinkTime()); // Step 2: Personal details
  sleep(thinkTime()); // Step 3: License details

  const start = Date.now();
  submitFirmRegistration(ctx.session.access_token, ctx.account.id);
  metrics.firmReg.add(Date.now() - start);
  errors.add(0);

  // Upload a document
  const uploadStart = Date.now();
  uploadDocument(ctx.session.access_token, ctx.account.id);
  metrics.docUpload.add(Date.now() - uploadStart);

  sleep(browseThinkTime());
}

export function paymentFlow() {
  const ctx = loginAndFetchAccount(400);
  if (!ctx) { sleep(5); return; }

  flowCount.add(1, { flow: 'payment' });

  if (ctx.account.payment_status === 'paid') {
    loadDashboard(ctx.session.access_token, ctx.session.user_id, ctx.account.id);
    sleep(browseThinkTime());
    return;
  }

  sleep(thinkTime());

  const start = Date.now();
  createPaymentOrder(ctx.session.access_token, ctx.account.id);
  metrics.payment.add(Date.now() - start);
  errors.add(0);

  sleep(browseThinkTime());
}

export function certificateFlow() {
  const ctx = loginAndFetchAccount(0);
  if (!ctx) { sleep(5); return; }

  flowCount.add(1, { flow: 'certificate' });

  if (ctx.account.payment_status !== 'paid') {
    loadDashboard(ctx.session.access_token, ctx.session.user_id, ctx.account.id);
    sleep(browseThinkTime());
    return;
  }

  sleep(thinkTime());

  const start = Date.now();
  generateCertificate(ctx.session.access_token, ctx.account.id);
  metrics.certGen.add(Date.now() - start);
  errors.add(0);

  sleep(browseThinkTime() * 2); // Extra wait for cert gen
}

export function adminFlow() {
  // Admin uses a specific VU range (VU 1-5 are admins)
  const vuIndex = ((__VU - 1) % 5) + 1;

  const session = loginTestUser(vuIndex);
  if (!session) {
    errors.add(1);
    sleep(5);
    return;
  }

  flowCount.add(1, { flow: 'admin' });

  // Load admin dashboard
  const dashStart = Date.now();
  loadAdminDashboard(session.access_token);
  metrics.adminDash.add(Date.now() - dashStart);

  sleep(thinkTime());

  // Fetch pending accounts
  const accountsRes = adminFetchAccounts(session.access_token, 'pending');

  // Approve first pending account if available
  try {
    const accounts = JSON.parse(accountsRes.body);
    if (accounts.length > 0) {
      sleep(thinkTime());
      const approvalStart = Date.now();
      adminApproveAccount(session.access_token, accounts[0].id);
      metrics.adminApproval.add(Date.now() - approvalStart);
    }
  } catch { /* ignore */ }

  errors.add(0);
  sleep(browseThinkTime());
}
