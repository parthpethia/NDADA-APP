/**
 * NDADA Load Test: Cleanup Script
 *
 * Removes all test users and their data after load testing.
 *
 * Usage:
 *   node cleanup-test-users.js
 *
 * Environment variables required:
 *   SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_USER_PREFIX = 'loadtest';
const TEST_USER_DOMAIN = 'ndada-loadtest.example.com';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation',
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`\n🧹 Cleaning up load test data from ${SUPABASE_URL}\n`);

  // Step 1: Find all test user accounts
  console.log('1️⃣  Finding test user accounts...');
  const accountsResult = await makeRequest(
    'GET',
    `/rest/v1/accounts?select=id,user_id,email&email=like.*@${TEST_USER_DOMAIN}`
  );

  const accounts = Array.isArray(accountsResult.body) ? accountsResult.body : [];
  console.log(`   Found ${accounts.length} test accounts`);

  if (accounts.length === 0) {
    console.log('   No test data to clean up. Done!');
    return;
  }

  const accountIds = accounts.map(a => a.id);
  const userIds = accounts.map(a => a.user_id).filter(Boolean);

  // Step 2: Delete certificates and downloads
  console.log('2️⃣  Deleting certificates and downloads...');
  for (const accountId of accountIds) {
    await makeRequest('DELETE', `/rest/v1/certificate_downloads?member_id=eq.${accountId}`);
    await makeRequest('DELETE', `/rest/v1/certificates?member_id=eq.${accountId}`);
    await makeRequest('DELETE', `/rest/v1/certificate_generation_queue?account_id=eq.${accountId}`);
  }

  // Step 3: Delete payments and orders
  console.log('3️⃣  Deleting payments and orders...');
  for (const accountId of accountIds) {
    await makeRequest('DELETE', `/rest/v1/payments?member_id=eq.${accountId}`);
    await makeRequest('DELETE', `/rest/v1/orders?member_id=eq.${accountId}`);
  }

  // Step 4: Delete notifications
  console.log('4️⃣  Deleting notifications...');
  for (const userId of userIds) {
    await makeRequest('DELETE', `/rest/v1/notifications?user_id=eq.${userId}`);
  }

  // Step 5: Delete account drafts
  console.log('5️⃣  Deleting account drafts...');
  for (const userId of userIds) {
    await makeRequest('DELETE', `/rest/v1/account_drafts?user_id=eq.${userId}`);
  }

  // Step 6: Delete accounts
  console.log('6️⃣  Deleting accounts...');
  for (const accountId of accountIds) {
    await makeRequest('DELETE', `/rest/v1/accounts?id=eq.${accountId}`);
  }

  // Step 7: Delete auth users
  console.log('7️⃣  Deleting auth users...');
  let deletedUsers = 0;
  for (const userId of userIds) {
    const result = await makeRequest('DELETE', `/auth/v1/admin/users/${userId}`);
    if (result.status === 200) deletedUsers++;
  }

  // Step 8: Clean up storage
  console.log('8️⃣  Cleaning up storage (loadtest documents)...');
  for (const accountId of accountIds) {
    await makeRequest('DELETE', `/storage/v1/object/documents/${accountId}`);
    await makeRequest('DELETE', `/storage/v1/object/certificates/${accountId}.pdf`);
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║           CLEANUP COMPLETE                       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Accounts deleted:   ${accountIds.length}`);
  console.log(`║  Auth users deleted: ${deletedUsers}`);
  console.log('╚══════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
