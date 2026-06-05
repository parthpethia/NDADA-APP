const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Fetching all accounts to analyze duplicates...');
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, user_id, email, full_name, firm_name, created_at');

  if (error) {
    console.error('Error fetching accounts:', error);
    return;
  }

  // Count by email
  const countByEmail = new Map();
  accounts.forEach(acc => {
    if (!acc.email) return;
    const emailLower = acc.email.toLowerCase().trim();
    if (!countByEmail.has(emailLower)) {
      countByEmail.set(emailLower, []);
    }
    countByEmail.get(emailLower).push(acc);
  });

  let duplicateCount = 0;
  console.log('\n--- Duplicate Analysis ---');
  for (const [email, list] of countByEmail.entries()) {
    if (list.length > 1) {
      duplicateCount++;
      console.log(`Email: ${email} has ${list.length} records:`);
      list.forEach((acc, idx) => {
        console.log(`  [Record ${idx + 1}] ID: ${acc.id}, user_id: ${acc.user_id}, firm_name: "${acc.firm_name}", created_at: ${acc.created_at}`);
      });
    }
  }

  console.log(`\nTotal duplicate email groups found: ${duplicateCount}`);
}

run();
