const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  try {
    // 1. Fetch all accounts from public.accounts
    console.log('Fetching accounts...');
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, user_id, email, full_name, created_at');

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError);
      return;
    }
    console.log(`Fetched ${accounts.length} accounts.`);

    // 2. Fetch all auth users via listUsers admin API
    console.log('Fetching auth users...');
    let allAuthUsers = [];
    let page = 1;
    let keepGoing = true;

    while (keepGoing) {
      const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 1000
      });

      if (authError) {
        console.error('Error fetching auth users:', authError);
        return;
      }

      if (users.length === 0) {
        keepGoing = false;
      } else {
        allAuthUsers = allAuthUsers.concat(users);
        console.log(`Page ${page}: Fetched ${users.length} auth users. Total so far: ${allAuthUsers.length}`);
        page++;
        // Safety check to avoid infinite loop
        if (users.length < 1000) keepGoing = false;
      }
    }

    console.log(`Fetched ${allAuthUsers.length} total auth users.`);

    // Create maps for analysis
    const authUserById = new Map();
    const authUserByEmail = new Map();
    allAuthUsers.forEach(u => {
      authUserById.set(u.id, u);
      if (u.email) {
        authUserByEmail.set(u.email.toLowerCase(), u);
      }
    });

    // Check mapping
    let matchedById = 0;
    let matchedByEmailOnly = 0;
    let missingAuthForAccount = [];

    accounts.forEach(acc => {
      const emailLower = acc.email ? acc.email.toLowerCase() : '';
      const userById = authUserById.get(acc.user_id);
      const userByEmail = authUserByEmail.get(emailLower);

      if (userById) {
        matchedById++;
      } else if (userByEmail) {
        matchedByEmailOnly++;
        console.log(`Account ${acc.email} matched by email but has wrong user_id (Account user_id: ${acc.user_id}, Auth id: ${userByEmail.id})`);
      } else {
        missingAuthForAccount.push(acc);
      }
    });

    console.log(`\n--- Analysis Result ---`);
    console.log(`Matched by ID: ${matchedById}`);
    console.log(`Matched by Email only (wrong ID): ${matchedByEmailOnly}`);
    console.log(`Missing Auth Users entirely: ${missingAuthForAccount.length}`);

    if (missingAuthForAccount.length > 0) {
      console.log('\nFirst 10 missing accounts:');
      missingAuthForAccount.slice(0, 10).forEach(acc => {
        console.log(`- Email: ${acc.email}, Name: ${acc.full_name}, current user_id: ${acc.user_id}`);
      });
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
