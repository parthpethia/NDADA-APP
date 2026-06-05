const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.');
  console.error('You can run this script using native Node.js env loading:');
  console.error('  node --env-file=.env scripts/sync_accounts_to_auth.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isTestOnly = args.includes('--test-only') || args.includes('-t');
const targetEmail = args.find(a => a.startsWith('--email='))?.split('=')[1];
let customPassword = args.find(a => a.startsWith('--password='))?.split('=')[1] || 'ndada@2026';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log('=====================================================');
  console.log('         NDADA Supabase Auth Sync Tool               ');
  console.log('=====================================================');
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Dry Run Mode: ${isDryRun ? 'ENABLED 🛑 (No modifications will be made)' : 'DISABLED 🚀 (Live changes!)'}`);
  console.log(`Test Only Mode: ${isTestOnly ? 'ENABLED 🧪 (Will only sync ONE test account)' : 'DISABLED'}`);
  console.log(`Common Password: ${customPassword}`);
  console.log('=====================================================\n');

  try {
    // 1. Fetch all accounts from public.accounts
    console.log('Step 1: Fetching accounts from public.accounts...');
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, user_id, email, full_name, created_at')
      .order('created_at', { ascending: true });

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError);
      return;
    }
    console.log(`Fetched ${accounts.length} total accounts from public.accounts.\n`);

    // 2. Fetch all auth users via listUsers admin API (with pagination)
    console.log('Step 2: Fetching auth users...');
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
        console.log(`  Page ${page}: Fetched ${users.length} auth users. (Total: ${allAuthUsers.length})`);
        page++;
        if (users.length < 1000) keepGoing = false;
      }
    }
    console.log(`Fetched ${allAuthUsers.length} total auth users from auth.users.\n`);

    // Create lookup map of existing auth users by email (case-insensitive)
    const authUserByEmail = new Map();
    allAuthUsers.forEach(u => {
      if (u.email) {
        authUserByEmail.set(u.email.toLowerCase().trim(), u);
      }
    });

    // 3. Identify which accounts are missing in auth or have invalid user_ids
    console.log('Step 3: Analyzing mismatching records...');
    const missingAccounts = [];
    const mismatchedAccounts = [];

    accounts.forEach(acc => {
      if (!acc.email) return;
      const emailLower = acc.email.toLowerCase().trim();
      const existingAuth = authUserByEmail.get(emailLower);

      if (!existingAuth) {
        // Auth user does not exist for this email
        missingAccounts.push(acc);
      } else if (acc.user_id !== existingAuth.id) {
        // Auth user exists, but the user_id in accounts does not match the auth user ID
        mismatchedAccounts.push({
          account: acc,
          authUserId: existingAuth.id
        });
      }
    });

    console.log(`  - Accounts missing auth users: ${missingAccounts.length}`);
    console.log(`  - Accounts with mismatched user_id: ${mismatchedAccounts.length}`);
    console.log('=====================================================\n');

    if (missingAccounts.length === 0 && mismatchedAccounts.length === 0) {
      console.log('🎉 Everything is in sync! No accounts need to be processed.');
      return;
    }

    // Determine target list to process
    let accountsToSync = [...missingAccounts];
    
    if (targetEmail) {
      console.log(`🎯 Filtering by target email: ${targetEmail}`);
      accountsToSync = accountsToSync.filter(acc => acc.email.toLowerCase().trim() === targetEmail.toLowerCase().trim());
      if (accountsToSync.length === 0) {
        console.log(`No missing account found with email: ${targetEmail}`);
        // Check mismatched accounts too just in case
        const matchedMismatch = mismatchedAccounts.find(item => item.account.email.toLowerCase().trim() === targetEmail.toLowerCase().trim());
        if (matchedMismatch) {
          console.log(`Found mismatched account for ${targetEmail}. Re-linking...`);
          accountsToSync = [matchedMismatch.account];
        }
      }
    } else if (isTestOnly) {
      console.log('🧪 --test-only flag is active. Selecting only the first missing account to sync.');
      accountsToSync = accountsToSync.slice(0, 1);
      if (accountsToSync.length === 0) {
        console.log('No missing accounts found to run a test on!');
        if (mismatchedAccounts.length > 0) {
          console.log('Selecting one mismatched account to test re-linking.');
          accountsToSync = [mismatchedAccounts[0].account];
        } else {
          return;
        }
      }
    }

    if (isDryRun) {
      console.log('📋 --- DRY RUN LOGS ---');
      accountsToSync.forEach((acc, idx) => {
        console.log(`[DRY-RUN] [${idx + 1}/${accountsToSync.length}] Will create Auth user for ${acc.email} (${acc.full_name}) and link to account ID ${acc.id}`);
      });
      mismatchedAccounts.forEach((item, idx) => {
        console.log(`[DRY-RUN] Will re-link existing Auth user ${item.authUserId} for ${item.account.email} to account ID ${item.account.id}`);
      });
      console.log('\nDry run finished. No database changes were made. Run without --dry-run to execute.');
      return;
    }

    // 4. Perform the live synchronization
    console.log('Step 4: Executing Live Sync...\n');
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < accountsToSync.length; i++) {
      const acc = accountsToSync[i];
      const email = acc.email.trim();
      const fullName = acc.full_name || email.split('@')[0];
      console.log(`[${i + 1}/${accountsToSync.length}] Processing ${email} (${fullName})...`);

      try {
        let authUserId;
        const existingAuth = authUserByEmail.get(email.toLowerCase());

        if (existingAuth) {
          // If auth user already exists, use it
          console.log(`  - Auth user already exists with ID: ${existingAuth.id}`);
          authUserId = existingAuth.id;
        } else {
          // Create new auth user
          console.log(`  - Creating new Auth user...`);
          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: email,
            password: customPassword,
            email_confirm: true,
            user_metadata: {
              full_name: fullName
            }
          });

          if (createError) {
            console.error(`  ❌ Error creating auth user for ${email}:`, createError.message);
            failCount++;
            continue;
          }

          authUserId = newUser.user.id;
          console.log(`  - Created Auth user successfully! ID: ${authUserId}`);

          // Give a very brief moment for the DB trigger to finish executing
          await sleep(250);

          // Delete the newly inserted blank account row created by the on_auth_user_created trigger
          console.log(`  - Cleaning up trigger-inserted duplicate row (user_id: ${authUserId})...`);
          const { error: deleteError } = await supabase
            .from('accounts')
            .delete()
            .eq('user_id', authUserId);

          if (deleteError) {
            console.warn(`  ⚠️ Warning: Failed to delete duplicate trigger row:`, deleteError.message);
          } else {
            console.log(`  - Duplicate row cleaned up.`);
          }
        }

        // Link the original account row to the new/existing auth user ID
        console.log(`  - Linking original account ID ${acc.id} to user_id ${authUserId}...`);
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ user_id: authUserId })
          .eq('id', acc.id);

        if (updateError) {
          console.error(`  ❌ Failed to update original account with user_id:`, updateError.message);
          failCount++;
        } else {
          console.log(`  ✅ Successfully synced and linked ${email}!`);
          successCount++;
        }

      } catch (err) {
        console.error(`  ❌ Unexpected error syncing ${email}:`, err);
        failCount++;
      }

      // Add a small spacing sleep to be gentle on DB & API
      await sleep(200);
      console.log('');
    }

    // Process mismatched accounts (just updating their user_id to point to the correct existing auth user)
    if (!isTestOnly && mismatchedAccounts.length > 0) {
      console.log('Step 5: Processing mismatched account user_ids...');
      for (let i = 0; i < mismatchedAccounts.length; i++) {
        const item = mismatchedAccounts[i];
        console.log(`[Mismatched ${i + 1}/${mismatchedAccounts.length}] Re-linking ${item.account.email} to existing user_id ${item.authUserId}...`);
        
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ user_id: item.authUserId })
          .eq('id', item.account.id);

        if (updateError) {
          console.error(`  ❌ Failed to update user_id for ${item.account.email}:`, updateError.message);
          failCount++;
        } else {
          console.log(`  ✅ Re-linked successfully!`);
          successCount++;
        }
        await sleep(100);
      }
    }

    console.log('=====================================================');
    console.log('                  Sync Summary                       ');
    console.log('=====================================================');
    console.log(`Successful Syncs: ${successCount}`);
    console.log(`Failed Syncs:     ${failCount}`);
    console.log('=====================================================');

  } catch (err) {
    console.error('Fatal execution error:', err);
  }
}

run();
