/**
 * NDADA Load Testing Configuration
 *
 * Central configuration for all k6 load test scripts.
 * Update these values before running tests.
 */

// ============================================================
// ENVIRONMENT
// ============================================================
export const BASE_URL = __ENV.SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
export const ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';
export const SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY || ''; // Only for admin tests

// Edge Functions base URL
export const FUNCTIONS_URL = `${BASE_URL}/functions/v1`;

// ============================================================
// TEST USERS (pre-created in Supabase Auth for load testing)
// ============================================================
// These users must exist before running tests.
// Use the setup script (setup-test-users.js) to create them.
export const TEST_USER_PREFIX = 'loadtest';
export const TEST_USER_DOMAIN = 'ndada-loadtest.example.com';
export const TEST_USER_PASSWORD = 'LoadTest2026!Secure';

// Admin test user (must be in admin_users table)
export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin-loadtest@ndada-loadtest.example.com';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'AdminLoadTest2026!';

// ============================================================
// LOAD TIERS
// ============================================================
export const LOAD_TIERS = {
  smoke: { vus: 5, duration: '1m' },
  light: { vus: 50, duration: '5m' },
  medium: { vus: 100, duration: '10m' },
  heavy: { vus: 250, duration: '10m' },
  stress: { vus: 500, duration: '15m' },
};

// ============================================================
// SUPABASE FREE TIER LIMITS
// ============================================================
export const FREE_TIER_LIMITS = {
  database: {
    maxConnections: 60,        // Postgres connection limit
    dbSizeGB: 0.5,             // 500 MB
    maxRowsEstimate: 50000,    // Practical limit
  },
  auth: {
    maxUsers: 50000,
    rateLimitPerHour: 30,      // Email sends per hour (signup/reset)
    tokenRefreshConcurrency: 60, // ~max concurrent token refreshes
  },
  storage: {
    maxSizeGB: 1,              // 1 GB total
    maxFileSize: 50 * 1024 * 1024, // 50 MB per file
  },
  edgeFunctions: {
    invocationsPerDay: 500000,
    invocationsPerSecond: 30,   // Practical limit before throttling
    maxExecutionTimeMs: 150000, // 150 seconds
    memoryMB: 150,
  },
  realtime: {
    maxConcurrentConnections: 200,
    messagesPerSecond: 100,
  },
};

// ============================================================
// THRESHOLDS (Pass/Fail Criteria)
// ============================================================
export const THRESHOLDS = {
  // HTTP request thresholds
  http_req_duration: {
    p95: 2000,    // 95% of requests < 2s
    p99: 5000,    // 99% of requests < 5s
    avg: 800,     // Average < 800ms
  },

  // Per-flow thresholds (ms)
  login: {
    p95: 1500,
    p99: 3000,
  },
  dashboardLoad: {
    p95: 2000,
    p99: 4000,
  },
  profileUpdate: {
    p95: 1500,
    p99: 3000,
  },
  notifications: {
    p95: 1000,
    p99: 2000,
  },
  firmRegistration: {
    p95: 3000,
    p99: 5000,
  },
  documentUpload: {
    p95: 5000,
    p99: 10000,
  },
  paymentCreate: {
    p95: 3000,
    p99: 6000,
  },
  certificateGeneration: {
    p95: 10000,
    p99: 20000,
  },
  certificateDownload: {
    p95: 3000,
    p99: 6000,
  },
  adminDashboard: {
    p95: 3000,
    p99: 5000,
  },
  adminApproval: {
    p95: 2000,
    p99: 4000,
  },

  // Error rate thresholds
  errorRate: {
    max: 0.01,    // < 1% error rate
  },

  // Iteration thresholds
  iterations: {
    rate: 10,     // At least 10 iterations/second at full load
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate a test user email for a given VU index
 */
export function testUserEmail(vuIndex) {
  return `${TEST_USER_PREFIX}-${String(vuIndex).padStart(4, '0')}@${TEST_USER_DOMAIN}`;
}

/**
 * Standard headers for Supabase REST API calls
 */
export function supabaseHeaders(accessToken) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Accept': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * Standard headers for Edge Function calls
 */
export function edgeFunctionHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
}

/**
 * Build Supabase REST URL for a table query
 */
export function restUrl(table, queryParams = '') {
  return `${BASE_URL}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
}

/**
 * Build Supabase Auth URL
 */
export function authUrl(path) {
  return `${BASE_URL}/auth/v1/${path}`;
}

/**
 * Build Supabase Storage URL
 */
export function storageUrl(bucket, path) {
  return `${BASE_URL}/storage/v1/object/${bucket}/${path}`;
}

/**
 * Build Supabase Edge Function URL
 */
export function functionUrl(name) {
  return `${FUNCTIONS_URL}/${name}`;
}

/**
 * Random think time between operations (1-3 seconds)
 */
export function thinkTime() {
  return Math.random() * 2 + 1; // 1-3 seconds
}

/**
 * Random think time for browsing (3-8 seconds)
 */
export function browseThinkTime() {
  return Math.random() * 5 + 3; // 3-8 seconds
}
