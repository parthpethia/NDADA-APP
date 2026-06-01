const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const testEmail = 'test_sync_2026@example.com';
  const dummyUserId = '99999999-9999-9999-9999-999999999999';

  console.log(`Inserting test account: ${testEmail}...`);

  // First, clean up if it already exists
  await supabase.from('accounts').delete().eq('email', testEmail);

  // Insert the test account with a custom unique membership_id to bypass sequence issues
  const { data, error } = await supabase.from('accounts').insert({
    user_id: dummyUserId,
    email: testEmail,
    full_name: 'Test Sync Account',
    firm_name: 'Test Dummy Firm Inc.',
    license_number: 'LIC-TEST-12345',
    registration_number: 'REG-TEST-54321',
    address: '123 Test St',
    phone: '1234567890',
    membership_id: '9999'  // custom unique membership_id
  }).select('*').single();

  if (error) {
    console.error('Error inserting test account:', error);
  } else {
    console.log('Successfully inserted test account:', data);
  }
}

run();
