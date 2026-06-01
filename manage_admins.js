const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read and parse environment variables from .env
if (!fs.existsSync('.env')) {
  console.error('Error: .env file not found in the current directory.');
  process.exit(1);
}

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.error('Error: Could not find Supabase credentials in .env file.');
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const serviceRoleKey = keyMatch[1].trim();
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Parse CLI arguments
const args = process.argv.slice(2);
const targetEmail = args.find(a => a.startsWith('--email='))?.split('=')[1];
const targetRole = args.find(a => a.startsWith('--role='))?.split('=')[1] || 'admin'; // 'super_admin', 'admin', 'reviewer'
const listMode = args.includes('--list') || args.includes('-l');

async function getAuthUsers() {
  let allAuthUsers = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({
      page: page,
      perPage: 1000
    });

    if (authError) {
      throw new Error(`Error fetching auth users: ${authError.message}`);
    }

    if (users.length === 0) {
      keepGoing = false;
    } else {
      allAuthUsers = allAuthUsers.concat(users);
      page++;
      if (users.length < 1000) keepGoing = false;
    }
  }
  return allAuthUsers;
}

async function run() {
  console.log('=====================================================');
  console.log('         NDADA Supabase Admin Management Tool        ');
  console.log('=====================================================');

  try {
    if (listMode || (!targetEmail)) {
      // MODE 1: List users and their status
      console.log('Fetching users to display status...\n');
      const authUsers = await getAuthUsers();
      
      // Sort auth users by created_at descending (most recent first)
      authUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Fetch public.accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, user_id, email, full_name');
      
      if (accountsError) {
        throw new Error(`Error fetching accounts: ${accountsError.message}`);
      }

      // Fetch public.admin_users
      const { data: adminUsers, error: adminsError } = await supabase
        .from('admin_users')
        .select('id, user_id, email, role');
      
      if (adminsError) {
        throw new Error(`Error fetching admin users: ${adminsError.message}`);
      }

      const accountByUserId = new Map(accounts.map(a => [a.user_id, a]));
      const adminByUserId = new Map(adminUsers.map(au => [au.user_id, au]));

      console.log(`Found ${authUsers.length} total users in Supabase Auth.\n`);
      console.log('--- RECENT USERS ---');
      
      // Show top 15 most recent users
      const recentUsers = authUsers.slice(0, 15);
      recentUsers.forEach((u, i) => {
        const hasAccount = accountByUserId.has(u.id);
        const adminInfo = adminByUserId.get(u.id);
        const adminStr = adminInfo ? `[ADMIN: ${adminInfo.role}] 🌟` : '[User]';
        
        console.log(`${i + 1}. Email: ${u.email.padEnd(30)} | Created: ${u.created_at.slice(0, 10)} | In public.accounts: ${hasAccount ? '✅' : '❌ NOT FOUND'} | Role: ${adminStr}`);
      });

      console.log('\n=====================================================');
      console.log('To make a user an admin, run:');
      console.log('  node manage_admins.js --email=<email> --role=<role>');
      console.log('  Available roles: super_admin, admin, reviewer');
      console.log('=====================================================');
      return;
    }

    // MODE 2: Set user as admin
    const emailToFind = targetEmail.trim().toLowerCase();
    console.log(`Target Email: ${emailToFind}`);
    console.log(`Desired Role: ${targetRole}\n`);

    // Fetch all auth users to find matching email
    console.log('Searching for user in auth.users...');
    const authUsers = await getAuthUsers();
    const user = authUsers.find(u => u.email && u.email.toLowerCase() === emailToFind);

    if (!user) {
      console.error(`❌ Error: User with email "${targetEmail}" was not found in Supabase Auth.`);
      console.log('Ensure the user has registered their account first.');
      return;
    }

    console.log(`✅ Found in Supabase Auth!`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Created At: ${user.created_at}`);

    // Check if the user is in public.accounts
    console.log('\nChecking public.accounts...');
    const { data: existingAccount, error: accFetchError } = await supabase
      .from('accounts')
      .select('id, email, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accFetchError) {
      throw new Error(`Error checking public.accounts: ${accFetchError.message}`);
    }

    let accountId;
    if (!existingAccount) {
      console.log('❌ User does NOT have an entry in public.accounts. Creating one now...');
      
      const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
      
      // Let's insert the missing public.accounts record
      // The generate_membership_id trigger will run automatically on insert to generate a membership_id
      const { data: newAccount, error: accInsertError } = await supabase
        .from('accounts')
        .insert({
          user_id: user.id,
          full_name: fullName,
          email: user.email,
          phone: user.user_metadata?.phone || '',
          address: user.user_metadata?.address || '',
          firm_name: '',
          license_number: '',
          registration_number: ''
        })
        .select('id, membership_id')
        .single();

      if (accInsertError) {
        throw new Error(`Error creating account row: ${accInsertError.message}`);
      }

      accountId = newAccount.id;
      console.log(`✅ public.accounts row successfully created!`);
      console.log(`   Account ID: ${accountId}`);
      console.log(`   Generated Membership ID: ${newAccount.membership_id}`);
    } else {
      accountId = existingAccount.id;
      console.log(`✅ User already has an entry in public.accounts!`);
      console.log(`   Account ID: ${accountId}`);
    }

    // Check if they are in admin_users
    console.log('\nUpdating admin permissions...');
    const { data: existingAdmin, error: adminFetchError } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (adminFetchError) {
      throw new Error(`Error checking admin_users: ${adminFetchError.message}`);
    }

    if (existingAdmin) {
      if (existingAdmin.role === targetRole) {
        console.log(`ℹ️ User is already an admin with the role "${targetRole}". No change needed.`);
      } else {
        console.log(`Updating role from "${existingAdmin.role}" to "${targetRole}"...`);
        const { error: adminUpdateError } = await supabase
          .from('admin_users')
          .update({ role: targetRole })
          .eq('user_id', user.id);

        if (adminUpdateError) {
          throw new Error(`Error updating admin role: ${adminUpdateError.message}`);
        }
        console.log(`✅ Successfully updated role to "${targetRole}"!`);
      }
    } else {
      console.log(`Adding user to public.admin_users with role "${targetRole}"...`);
      const { error: adminInsertError } = await supabase
        .from('admin_users')
        .insert({
          user_id: user.id,
          email: user.email,
          role: targetRole
        });

      if (adminInsertError) {
        throw new Error(`Error inserting into admin_users: ${adminInsertError.message}`);
      }
      console.log(`✅ Successfully made user an Admin with role "${targetRole}"!`);
    }

    console.log('\n🎉 Process completed successfully!');
    console.log('=====================================================');

  } catch (error) {
    console.error('\n❌ An error occurred during execution:');
    console.error(error.message);
    console.log('=====================================================');
  }
}

run();
