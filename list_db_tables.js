const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  console.log('Querying existing database tables and row counts...');
  
  // We can query the information_schema via a RPC if exists, or try to select from expected tables.
  const tables = [
    'accounts',
    'members',
    'firms',
    'payments',
    'certificates',
    'admin_users',
    'account_drafts',
    'notifications'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`Table '${table}': Error or does not exist (${error.message})`);
      } else {
        console.log(`Table '${table}': ${count} rows`);
      }
    } catch (err) {
      console.log(`Table '${table}': Exception (${err.message})`);
    }
  }
}

run();
