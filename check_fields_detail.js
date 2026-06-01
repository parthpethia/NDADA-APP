const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Querying accounts details...');
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, email, full_name, firm_name, license_number, registration_number, seed_cotton_license_number, ifms_number');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Sample Accounts (first 5):`);
  accounts.slice(0, 5).forEach((a, idx) => {
    console.log(`Account ${idx + 1}:`);
    console.log(`  email: ${a.email}`);
    console.log(`  firm_name: "${a.firm_name}"`);
    console.log(`  license_number: "${a.license_number}"`);
    console.log(`  registration_number: "${a.registration_number}"`);
    console.log(`  seed_cotton_license_number: "${a.seed_cotton_license_number}"`);
    console.log(`  ifms_number: "${a.ifms_number}"`);
  });
}

run();
