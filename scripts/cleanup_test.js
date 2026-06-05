const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const testEmail = 'test_sync_2026@example.com';
  console.log(`Cleaning up test user for: ${testEmail}...`);

  // Fetch the user ID first
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }

  const testUser = users.find(u => u.email === testEmail);

  if (testUser) {
    console.log(`Found test user with ID: ${testUser.id}. Deleting...`);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(testUser.id);
    if (deleteError) {
      console.error('Error deleting user:', deleteError);
    } else {
      console.log('Successfully deleted test user and cascade-deleted the account row.');
    }
  } else {
    console.log('No test user found in auth.users.');
  }

  // Double check and delete the account row if any is left (just in case cascade wasn't active)
  await supabase.from('accounts').delete().eq('email', testEmail);
  console.log('Cleanup complete.');
}

run();
