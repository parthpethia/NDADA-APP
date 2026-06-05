const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const testEmail = 'test_sync_2026@example.com';
  console.log(`Querying accounts for: ${testEmail}...`);

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('email', testEmail);

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log(`Found ${accounts.length} rows in accounts table:`);
  console.log(JSON.stringify(accounts, null, 2));

  if (accounts.length === 1) {
    const acc = accounts[0];
    if (acc.firm_name === 'Test Dummy Firm Inc.' && acc.user_id !== '99999999-9999-9999-9999-999999999999') {
      console.log('🎉 Verification Successful! The original record is intact, the user_id is updated, and no duplicates exist!');
    } else {
      console.error('❌ Verification failed: original fields mismatched or user_id not updated.');
    }
  } else {
    console.error(`❌ Verification failed: expected 1 row, found ${accounts.length}`);
  }
}

run();
