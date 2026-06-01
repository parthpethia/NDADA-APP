const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  try {
    // 1. Fetch total count of accounts
    const { count, error: countError } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Error fetching count:', countError);
      return;
    }
    console.log('Total accounts in public.accounts:', count);

    // 2. Fetch a few accounts to see their data structure
    const { data: samples, error: sampleError } = await supabase
      .from('accounts')
      .select('id, user_id, email, full_name, created_at')
      .limit(10);

    if (sampleError) {
      console.error('Error fetching samples:', sampleError);
      return;
    }
    console.log('Sample accounts:');
    console.log(JSON.stringify(samples, null, 2));

    // 3. Count how many have null/empty user_id or user_ids that might not exist in auth.users
    const { data: allAccounts, error: allErr } = await supabase
      .from('accounts')
      .select('id, user_id, email, full_name');
    
    if (allErr) {
      console.error('Error fetching all accounts:', allErr);
      return;
    }

    const withoutUserId = allAccounts.filter(a => !a.user_id);
    console.log(`Accounts without user_id: ${withoutUserId.length}`);
    if (withoutUserId.length > 0) {
      console.log('Some accounts without user_id:', withoutUserId.slice(0, 5));
    }

    const withUserId = allAccounts.filter(a => a.user_id);
    console.log(`Accounts with user_id: ${withUserId.length}`);
    if (withUserId.length > 0) {
      console.log('Some accounts with user_id:', withUserId.slice(0, 5));
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
