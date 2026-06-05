const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Querying accounts and their firm details...');
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, email, full_name, firm_name, license_number, registration_number, payment_status, approval_status');

  if (error) {
    console.error('Error fetching accounts:', error);
    return;
  }

  console.log(`Total accounts: ${accounts.length}`);
  
  const emptyFirms = accounts.filter(a => !a.firm_name || a.firm_name.trim() === '');
  const populatedFirms = accounts.filter(a => a.firm_name && a.firm_name.trim() !== '');

  console.log(`Accounts with EMPTY firm_name: ${emptyFirms.length}`);
  console.log(`Accounts with POPULATED firm_name: ${populatedFirms.length}`);

  if (populatedFirms.length > 0) {
    console.log('\nSample accounts with populated firm details:');
    console.log(JSON.stringify(populatedFirms.slice(0, 5), null, 2));
  }

  if (emptyFirms.length > 0) {
    console.log('\nSample accounts with EMPTY firm details:');
    console.log(JSON.stringify(emptyFirms.slice(0, 5), null, 2));
  }
}

run();
