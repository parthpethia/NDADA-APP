/**
 * NDADA Load Test: Test User Setup Script
 *
 * Run this BEFORE load testing to create test users in Supabase Auth.
 * Uses Supabase Admin API (requires SERVICE_ROLE_KEY).
 *
 * Usage:
 *   node setup-test-users.js [count]
 *
 * Example:
 *   node setup-test-users.js 500
 *
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_USER_PREFIX = 'loadtest';
const TEST_USER_DOMAIN = 'ndada-loadtest.example.com';
const TEST_USER_PASSWORD = 'LoadTest2026!Secure';

const BATCH_SIZE = 10; // Create 10 users at a time
const DELAY_BETWEEN_BATCHES_MS = 500;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const totalUsers = parseInt(process.argv[2] || '500', 10);
console.log(`\n🚀 Creating ${totalUsers} test users in ${SUPABASE_URL}\n`);

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

async function createUser(index) {
  const email = `${TEST_USER_PREFIX}-${String(index).padStart(4, '0')}@${TEST_USER_DOMAIN}`;
  const fullName = `LoadTest User ${index}`;

  const districts = ['Nagpur', 'Nagpur Gramin', 'Hingna', 'Kuhi', 'Kalmeshwar', 'Katol',
    'Narkhed', 'Saoner', 'Parshivani', 'Kamthi', 'Ramtek', 'Mouda', 'Umred', 'Bhiwapur'];

  try {
    const result = await makeRequest('POST', '/auth/v1/admin/users', {
      email,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: `98${String(index).padStart(8, '0')}`,
        address: `Load Test Address ${index}, Nagpur`,
        district: districts[index % districts.length],
      },
    });

    if (result.status === 200 || result.status === 201) {
      return { email, status: 'created', userId: result.body?.id };
    } else if (result.body?.msg?.includes('already been registered') ||
               result.body?.message?.includes('already been registered')) {
      return { email, status: 'exists' };
    } else {
      return { email, status: 'error', error: result.body?.msg || result.body?.message || JSON.stringify(result.body) };
    }
  } catch (err) {
    return { email, status: 'error', error: err.message };
  }
}

async function createBatch(startIndex, count) {
  const promises = [];
  for (let i = startIndex; i < startIndex + count && i <= totalUsers; i++) {
    promises.push(createUser(i));
  }
  return Promise.all(promises);
}

async function main() {
  let created = 0;
  let exists = 0;
  let errors = 0;

  for (let batch = 1; batch <= totalUsers; batch += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, totalUsers - batch + 1);
    const results = await createBatch(batch, count);

    for (const result of results) {
      if (result.status === 'created') {
        created++;
        if (created % 50 === 0) console.log(`  ✅ Created ${created} users...`);
      } else if (result.status === 'exists') {
        exists++;
      } else {
        errors++;
        console.error(`  ❌ Error creating ${result.email}: ${result.error}`);
      }
    }

    // Rate limit protection
    if (batch + BATCH_SIZE <= totalUsers) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║           TEST USER SETUP COMPLETE               ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Created:  ${created}`);
  console.log(`║  Existing: ${exists}`);
  console.log(`║  Errors:   ${errors}`);
  console.log(`║  Total:    ${totalUsers}`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Email format: ${TEST_USER_PREFIX}-XXXX@${TEST_USER_DOMAIN}`);
  console.log(`║  Password:     ${TEST_USER_PASSWORD}`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (errors > 0) {
    console.warn('⚠️  Some users failed to create. Check errors above.');
    console.warn('   You may need to run this script again or increase rate limit delays.');
  }
}

main().catch(console.error);
