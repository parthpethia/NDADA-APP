const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Querying first 3 accounts to check all fields...');
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .limit(3);

  if (error) {
    console.error('Error fetching accounts:', error);
    return;
  }

  accounts.forEach((acc, index) => {
    console.log(`\n================ ACCOUNT ${index + 1} ===============`);
    Object.keys(acc).forEach(key => {
      console.log(`${key}: ${JSON.stringify(acc[key])}`);
    });
  });
}

run();
