/**
 * NDADA Supabase Standalone Node.js Load Testing Script
 *
 * Runs concurrent HTTP/REST/RPC requests against Supabase to benchmark
 * latency, throughput (RPS), and connection limits.
 *
 * Usage:
 *   node load-testing/run-node-test.js [--concurrency 50] [--duration 15] [--endpoint rpc/get_dashboard_data]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Load .env variables manually if not set in process.env
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    });
  }
}
loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in environment or .env');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const CONCURRENCY = parseInt(getArg('--concurrency', '50'), 10);
const DURATION_SEC = parseInt(getArg('--duration', '15'), 10);
const TEST_MODE = getArg('--mode', 'all'); // 'all', 'rest', 'rpc', 'auth'

console.log('================================================================');
console.log('         NDADA Supabase Free Tier Load Test Benchmark          ');
console.log('================================================================');
console.log(` Target URL:   ${SUPABASE_URL}`);
console.log(` Concurrency:  ${CONCURRENCY} parallel Virtual Users (VUs)`);
console.log(` Test Duration: ${DURATION_SEC} seconds`);
console.log(` Mode:         ${TEST_MODE}`);
console.log('================================================================\n');

// Standard headers for Supabase REST
const headers = {
  'Content-Type': 'application/json',
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
};

// Endpoints to benchmark
const ENDPOINTS = [
  {
    name: 'REST Table Select (Accounts)',
    method: 'GET',
    path: '/rest/v1/accounts?select=id,firm_name,district,approval_status&limit=10',
    body: null,
  },
  {
    name: 'REST Count Query (Accounts)',
    method: 'GET',
    path: '/rest/v1/accounts?select=id&limit=0',
    extraHeaders: { 'Prefer': 'count=exact', 'Range': '0-0' },
    body: null,
  },
  {
    name: 'RPC User Profile (get_user_profile)',
    method: 'POST',
    path: '/rest/v1/rpc/get_user_profile',
    body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
  },
  {
    name: 'RPC Dashboard Data (get_dashboard_data)',
    method: 'POST',
    path: '/rest/v1/rpc/get_dashboard_data',
    body: JSON.stringify({ p_user_id: '00000000-0000-0000-0000-000000000000' }),
  },
];

function makeHttpRequest(targetUrl, method, reqHeaders, body) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(targetUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders,
      timeout: 10000,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          duration,
          success: res.statusCode >= 200 && res.statusCode < 300,
          error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
        });
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        status: 0,
        duration,
        success: false,
        error: err.code || err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = Date.now() - startTime;
      resolve({
        status: 408,
        duration,
        success: false,
        error: 'ETIMEDOUT',
      });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// Percentile calculator helper
function getPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runBenchmarkForEndpoint(ep) {
  console.log(`\n👉 Benchmarking: ${ep.name}...`);
  const reqHeaders = { ...headers, ...(ep.extraHeaders || {}) };
  const targetUrl = `${SUPABASE_URL}${ep.path}`;

  const latencies = [];
  const statusCounts = {};
  let totalReqs = 0;
  let successReqs = 0;
  let failReqs = 0;

  const endTime = Date.now() + (DURATION_SEC * 1000);
  const startTime = Date.now();

  // Worker loop
  async function worker() {
    while (Date.now() < endTime) {
      const res = await makeHttpRequest(targetUrl, ep.method, reqHeaders, ep.body);
      totalReqs++;
      latencies.push(res.duration);
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;

      if (res.success) {
        successReqs++;
      } else {
        failReqs++;
      }
    }
  }

  // Spawn VUs
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const actualDurationSec = (Date.now() - startTime) / 1000;
  const rps = (totalReqs / actualDurationSec).toFixed(2);
  const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length || 0).toFixed(1);
  const p50 = getPercentile(latencies, 50);
  const p90 = getPercentile(latencies, 90);
  const p95 = getPercentile(latencies, 95);
  const p99 = getPercentile(latencies, 99);
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  return {
    name: ep.name,
    totalReqs,
    successReqs,
    failReqs,
    rps,
    latencies: { avg, min, max, p50, p90, p95, p99 },
    statusCounts,
  };
}

async function main() {
  const results = [];
  for (const ep of ENDPOINTS) {
    const res = await runBenchmarkForEndpoint(ep);
    results.push(res);
  }

  console.log('\n================================================================');
  console.log('                   LOAD TEST RESULTS SUMMARY                   ');
  console.log('================================================================\n');

  results.forEach(res => {
    console.log(`📌 ${res.name}`);
    console.log(`   Requests:      Total: ${res.totalReqs} | Success: ${res.successReqs} | Fail: ${res.failReqs}`);
    console.log(`   Throughput:    ${res.rps} req/sec`);
    console.log(`   Latency (ms):  Avg: ${res.latencies.avg} | Min: ${res.latencies.min} | p50: ${res.latencies.p50} | p95: ${res.latencies.p95} | p99: ${res.latencies.p99} | Max: ${res.latencies.max}`);
    console.log(`   Status Codes:  ${JSON.stringify(res.statusCounts)}`);
    console.log('----------------------------------------------------------------');
  });

  // Calculate Supabase Capacity Analysis
  const avgRps = (results.reduce((s, r) => s + parseFloat(r.rps), 0) / results.length).toFixed(1);
  console.log('\n📊 SUPABASE FREE TIER CAPACITY ANALYSIS:');
  console.log(` • Measured System Capacity: ~${avgRps} requests/sec`);
  console.log(` • Est. Max Concurrent Active Users (browsing with 3-5s think time): ~${Math.floor(avgRps * 4)} active users`);
  console.log(` • Est. Max Peak Burst Users (simultaneous request click): ~${CONCURRENCY} active users`);
  console.log('================================================================\n');
}

main().catch(console.error);
