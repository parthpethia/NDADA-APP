/**
 * NDADA Load Test: Shared Helper Modules
 *
 * Reusable functions for authentication, data generation, and common operations.
 */

import http from 'k6/http';
import { check, fail } from 'k6';
import {
  supabaseHeaders,
  edgeFunctionHeaders,
  authUrl,
  restUrl,
  functionUrl,
  storageUrl,
  testUserEmail,
  TEST_USER_PASSWORD,
  ANON_KEY,
} from './config.js';

// ============================================================
// AUTHENTICATION HELPERS
// ============================================================

/**
 * Login a test user and return session data.
 * Returns { access_token, refresh_token, user_id, account_id }
 */
export function loginTestUser(vuIndex) {
  const email = testUserEmail(vuIndex);
  const payload = JSON.stringify({
    email: email,
    password: TEST_USER_PASSWORD,
  });

  const res = http.post(authUrl('token?grant_type=password'), payload, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    tags: { flow: 'login' },
  });

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has access_token': (r) => {
      try { return !!JSON.parse(r.body).access_token; } catch { return false; }
    },
  });

  if (!success) {
    console.error(`Login failed for ${email}: ${res.status} ${res.body}`);
    return null;
  }

  const body = JSON.parse(res.body);
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    user_id: body.user?.id,
    email: email,
  };
}

// VU-local profile cache to avoid duplicate RPC calls when both fetchAccount and fetchAdminUser are called in sequence
let cachedProfile = null;

/**
 * Fetch the account record for a logged-in user.
 * Consolidated: Calls the get_user_profile() RPC and caches result.
 * Returns the account object or null.
 */
export function fetchAccount(accessToken, userId) {
  if (cachedProfile && cachedProfile.account && cachedProfile.account.user_id === userId) {
    return cachedProfile.account;
  }

  const res = http.post(
    restUrl('rpc/get_user_profile'),
    JSON.stringify({ p_user_id: userId }),
    {
      headers: supabaseHeaders(accessToken),
      tags: { flow: 'login', name: 'get_user_profile_rpc' },
    }
  );

  const success = check(res, {
    'fetch profile RPC 200': (r) => r.status === 200,
  });

  if (!success) {
    cachedProfile = null;
    return null;
  }

  try {
    cachedProfile = JSON.parse(res.body);
    return cachedProfile.account;
  } catch {
    cachedProfile = null;
    return null;
  }
}

/**
 * Fetch the admin_users record for a logged-in user.
 * Consolidated: Uses the cached result from get_user_profile() RPC, or fetches if missing.
 */
export function fetchAdminUser(accessToken, userId) {
  if (cachedProfile && cachedProfile.account && cachedProfile.account.user_id === userId) {
    return cachedProfile.admin;
  }

  const res = http.post(
    restUrl('rpc/get_user_profile'),
    JSON.stringify({ p_user_id: userId }),
    {
      headers: supabaseHeaders(accessToken),
      tags: { flow: 'login', name: 'get_user_profile_rpc' },
    }
  );

  const success = check(res, {
    'fetch admin RPC 200': (r) => r.status === 200,
  });

  if (!success) {
    cachedProfile = null;
    return null;
  }

  try {
    cachedProfile = JSON.parse(res.body);
    return cachedProfile.admin;
  } catch {
    cachedProfile = null;
    return null;
  }
}

// ============================================================
// DASHBOARD HELPERS
// ============================================================

/**
 * Simulate the full dashboard load sequence:
 * Consolidated: Calls the get_dashboard_data() RPC (replaces 3 batched REST calls).
 */
export function loadDashboard(accessToken, userId, accountId) {
  const res = http.post(
    restUrl('rpc/get_dashboard_data'),
    JSON.stringify({ p_user_id: userId }),
    {
      headers: supabaseHeaders(accessToken),
      tags: { flow: 'dashboard_load', name: 'get_dashboard_rpc' },
    }
  );

  check(res, {
    'dashboard RPC 200': (r) => r.status === 200,
  });

  return res;
}

// ============================================================
// PROFILE HELPERS
// ============================================================

/**
 * Update profile (simulates the profile save flow)
 */
export function updateProfile(accessToken, accountId) {
  const payload = JSON.stringify({
    full_name: `LoadTest User ${accountId.substring(0, 8)}`,
    phone: `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    address: `Test Address ${Math.floor(Math.random() * 1000)}, Nagpur`,
  });

  const res = http.patch(
    restUrl('accounts', `id=eq.${accountId}`),
    payload,
    {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'return=minimal',
      },
      tags: { flow: 'profile_update' },
    }
  );

  check(res, {
    'profile update 204': (r) => r.status === 204,
  });

  return res;
}

// ============================================================
// NOTIFICATIONS HELPERS
// ============================================================

/**
 * Fetch notifications list
 */
export function fetchNotifications(accessToken, userId) {
  const res = http.get(
    restUrl('notifications', `select=id,user_id,title,message,type,read,action_url,created_at&user_id=eq.${userId}&order=created_at.desc&limit=50`),
    {
      headers: supabaseHeaders(accessToken),
      tags: { flow: 'notifications' },
    }
  );

  check(res, {
    'notifications 200': (r) => r.status === 200,
  });

  return res;
}

/**
 * Mark notification as read
 */
export function markNotificationRead(accessToken, notificationId) {
  const res = http.patch(
    restUrl('notifications', `id=eq.${notificationId}`),
    JSON.stringify({ read: true }),
    {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'return=minimal',
      },
      tags: { flow: 'notifications' },
    }
  );

  return res;
}

// ============================================================
// FIRM REGISTRATION HELPERS
// ============================================================

/**
 * Submit firm registration data (simulates the multi-step form submission)
 */
export function submitFirmRegistration(accessToken, accountId) {
  const payload = JSON.stringify({
    firm_name: `LoadTest Firm ${Date.now()}`,
    firm_type: 'other',
    license_number: `LT-${Math.floor(Math.random() * 999999)}`,
    registration_number: `REG-${Math.floor(Math.random() * 999999)}`,
    gst_number: `22AAAAA${Math.floor(Math.random() * 9999)}A1Z5`,
    district: 'Nagpur',
    firm_address: 'Load Test Address, Nagpur, Maharashtra',
    contact_phone: `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    contact_email: `firm-${accountId.substring(0, 8)}@test.com`,
    firm_pin_code: '440001',
    partner_proprietor_name: `Test Proprietor ${accountId.substring(0, 4)}`,
    whatsapp_number: `91${Math.floor(Math.random() * 1000000000)}`,
    aadhaar_card_number: `${Math.floor(Math.random() * 999999999999).toString().padStart(12, '0')}`,
    ifms_number: `IFMS-${Math.floor(Math.random() * 999999)}`,
    seed_cotton_license_number: `SCL-${Math.floor(Math.random() * 999999)}`,
    seed_cotton_license_expiry: '31/12/2027',
    sarthi_id_cotton: `SC-${Math.floor(Math.random() * 99999)}`,
    approval_status: 'pending',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    documents_urls: [],
  });

  const res = http.patch(
    restUrl('accounts', `id=eq.${accountId}`),
    payload,
    {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'return=representation',
      },
      tags: { flow: 'firm_registration' },
    }
  );

  check(res, {
    'firm registration 200': (r) => r.status === 200,
  });

  return res;
}

// ============================================================
// DOCUMENT UPLOAD HELPERS
// ============================================================

/**
 * Upload a simulated document (small binary payload)
 */
export function uploadDocument(accessToken, accountId) {
  // Create a small fake PDF-like payload (1KB)
  const fakeDocContent = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    fakeDocContent[i] = Math.floor(Math.random() * 256);
  }

  const filePath = `${accountId}/${Date.now()}_loadtest_doc.pdf`;

  const res = http.post(
    storageUrl('documents', filePath),
    fakeDocContent.buffer,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': ANON_KEY,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      tags: { flow: 'document_upload' },
    }
  );

  check(res, {
    'document upload success': (r) => r.status === 200 || r.status === 201,
  });

  return { res, filePath };
}

// ============================================================
// PAYMENT HELPERS
// ============================================================

/**
 * Create a Razorpay order via edge function
 */
export function createPaymentOrder(accessToken, memberId) {
  const res = http.post(
    functionUrl('razorpay-create-order'),
    JSON.stringify({ member_id: memberId }),
    {
      headers: edgeFunctionHeaders(accessToken),
      tags: { flow: 'payment_create' },
      timeout: '30s',
    }
  );

  check(res, {
    'payment order created': (r) => r.status === 200,
    'payment order has id': (r) => {
      try { return !!JSON.parse(r.body).id; } catch { return false; }
    },
  });

  return res;
}

// ============================================================
// CERTIFICATE HELPERS
// ============================================================

/**
 * Trigger certificate generation via edge function
 */
export function generateCertificate(accessToken, memberId) {
  const res = http.post(
    functionUrl('generate-certificate'),
    JSON.stringify({ member_id: memberId }),
    {
      headers: edgeFunctionHeaders(accessToken),
      tags: { flow: 'certificate_generation' },
      timeout: '60s',
    }
  );

  check(res, {
    'certificate generated or queued': (r) => r.status === 200 || r.status === 429,
  });

  return res;
}

/**
 * Download certificate via signed URL
 */
export function downloadCertificate(accessToken, certificateUrl) {
  // First get the signed URL
  const signRes = http.post(
    `${storageUrl('certificates', '')}sign/${certificateUrl}`,
    JSON.stringify({ expiresIn: 60 }),
    {
      headers: {
        ...supabaseHeaders(accessToken),
      },
      tags: { flow: 'certificate_download', name: 'sign_url' },
    }
  );

  if (signRes.status !== 200) return signRes;

  const signedUrl = JSON.parse(signRes.body).signedURL;

  // Download the file
  const downloadRes = http.get(signedUrl, {
    tags: { flow: 'certificate_download', name: 'file_download' },
  });

  check(downloadRes, {
    'certificate downloaded': (r) => r.status === 200,
  });

  // Track the download
  http.post(
    restUrl('certificate_downloads'),
    JSON.stringify({ certificate_id: 'loadtest', member_id: 'loadtest' }),
    {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'return=minimal',
      },
      tags: { flow: 'certificate_download', name: 'track_download' },
    }
  );

  return downloadRes;
}

// ============================================================
// ADMIN HELPERS
// ============================================================

/**
 * Load admin dashboard stats (4 parallel count queries)
 */
export function loadAdminDashboard(accessToken) {
  const responses = http.batch([
    ['GET', restUrl('accounts', 'select=id&limit=0'), null, {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
      tags: { flow: 'admin_dashboard', name: 'total_accounts' },
    }],
    ['GET', restUrl('payments', 'select=id&status=eq.paid&limit=0'), null, {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
      tags: { flow: 'admin_dashboard', name: 'paid_payments' },
    }],
    ['GET', restUrl('certificates', 'select=id&limit=0'), null, {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
      tags: { flow: 'admin_dashboard', name: 'total_certs' },
    }],
    ['GET', restUrl('accounts', 'select=id&approval_status=eq.pending&limit=0'), null, {
      headers: {
        ...supabaseHeaders(accessToken),
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
      tags: { flow: 'admin_dashboard', name: 'pending_reviews' },
    }],
  ]);

  for (let i = 0; i < responses.length; i++) {
    check(responses[i], {
      [`admin stat query ${i} ok`]: (r) => r.status === 200 || r.status === 206,
    });
  }

  return responses;
}

/**
 * Admin approval action via edge function
 */
export function adminApproveAccount(accessToken, accountId) {
  const res = http.post(
    functionUrl('admin-actions'),
    JSON.stringify({
      action: 'approve-account',
      account_id: accountId,
    }),
    {
      headers: edgeFunctionHeaders(accessToken),
      tags: { flow: 'admin_approval' },
    }
  );

  check(res, {
    'admin approve 200': (r) => r.status === 200,
  });

  return res;
}

/**
 * Admin fetch accounts list (with filter)
 */
export function adminFetchAccounts(accessToken, approvalStatus = 'pending') {
  const filter = approvalStatus !== 'all' ? `&approval_status=eq.${approvalStatus}` : '';
  const res = http.get(
    restUrl('accounts', `select=id,firm_name,full_name,approval_status,firm_type,license_number,registration_number,district,created_at,membership_id,email&order=created_at.desc${filter}&limit=100`),
    {
      headers: supabaseHeaders(accessToken),
      tags: { flow: 'admin_dashboard', name: 'accounts_list' },
    }
  );

  check(res, {
    'admin accounts list 200': (r) => r.status === 200,
  });

  return res;
}

// ============================================================
// DATA GENERATION
// ============================================================

const DISTRICTS = ['Nagpur', 'Nagpur Gramin', 'Hingna', 'Kuhi', 'Kalmeshwar', 'Katol', 'Narkhed', 'Saoner', 'Parshivani', 'Kamthi', 'Ramtek', 'Mouda', 'Umred', 'Bhiwapur'];

export function randomDistrict() {
  return DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)];
}

export function randomPhone() {
  return `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
}
