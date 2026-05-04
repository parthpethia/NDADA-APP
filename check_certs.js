const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const { data: accounts } = await supabase.from('accounts').select('id, full_name, payment_status, approval_status');
  const { data: certs } = await supabase.from('certificates').select('member_id');
  const certMemberIds = new Set(certs.map(c => c.member_id));
  const missing = accounts.filter(a => a.approval_status === 'approved' && !certMemberIds.has(a.id));
  console.log('Approved accounts missing certificates:');
  missing.forEach(a => console.log(a.id, a.full_name, 'Payment:', a.payment_status, 'Cash Verified:', a.cash_payment_verified));

  for (const account of missing) {
    if (account.payment_status !== 'paid' && !account.cash_payment_verified) continue;
    console.log('Triggering generation for', account.id);
    try {
      const { data, error } = await supabase.functions.invoke('generate-certificate', {
        body: { member_id: account.id }
      });
      console.log('Result for', account.id, 'Data:', data, 'Error:', error);
    } catch(err) {
      console.error('Network Error for', account.id, ':', err);
    }
  }
}
run();
