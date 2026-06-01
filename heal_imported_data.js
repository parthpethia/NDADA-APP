const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');

async function run() {
  console.log('=====================================================');
  console.log('         NDADA Imported Data Healing Tool            ');
  console.log('=====================================================');
  console.log(`Dry Run Mode: ${isDryRun ? 'ENABLED 🛑 (No database changes)' : 'DISABLED 🚀 (Live changes!)'}`);
  console.log('=====================================================\n');

  try {
    console.log('Step 1: Fetching accounts...');
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching accounts:', error);
      return;
    }

    console.log(`Fetched ${accounts.length} accounts to heal.\n`);

    let healedCount = 0;

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      
      // Determine the best values
      const bestLicense = (acc.seed_cotton_license_number || acc.seed_general_license_number || acc.pesticide_license_number || acc.fertilizer_license_number || '').trim();
      const bestRegistration = (acc.ifms_number || '').trim();
      const bestContactPhone = (acc.contact_phone || acc.phone || '').trim();
      const bestContactEmail = (acc.contact_email || acc.email || '').trim();
      const bestAddress = (acc.address || acc.firm_address || '').trim();

      // Check if anything needs updating
      const needsUpdate = 
        acc.license_number !== bestLicense ||
        acc.registration_number !== bestRegistration ||
        acc.contact_phone !== bestContactPhone ||
        acc.contact_email !== bestContactEmail ||
        acc.address !== bestAddress;

      if (needsUpdate) {
        console.log(`[Account ${i + 1}/${accounts.length}] Healing ${acc.email} (${acc.firm_name || 'No Firm'}):`);
        
        if (acc.license_number !== bestLicense) {
          console.log(`  - license_number: "${acc.license_number}" -> "${bestLicense}"`);
        }
        if (acc.registration_number !== bestRegistration) {
          console.log(`  - registration_number: "${acc.registration_number}" -> "${bestRegistration}"`);
        }
        if (acc.contact_phone !== bestContactPhone) {
          console.log(`  - contact_phone: "${acc.contact_phone}" -> "${bestContactPhone}"`);
        }
        if (acc.contact_email !== bestContactEmail) {
          console.log(`  - contact_email: "${acc.contact_email}" -> "${bestContactEmail}"`);
        }
        if (acc.address !== bestAddress) {
          console.log(`  - address: "${acc.address}" -> "${bestAddress}"`);
        }

        if (!isDryRun) {
          const { error: updateError } = await supabase
            .from('accounts')
            .update({
              license_number: bestLicense,
              registration_number: bestRegistration,
              contact_phone: bestContactPhone,
              contact_email: bestContactEmail,
              address: bestAddress
            })
            .eq('id', acc.id);

          if (updateError) {
            console.error(`  ❌ Error updating:`, updateError.message);
          } else {
            console.log(`  ✅ Synced successfully.`);
            healedCount++;
          }
        } else {
          healedCount++;
        }
        console.log('');
      }
    }

    console.log('=====================================================');
    console.log('                  Healing Summary                     ');
    console.log('=====================================================');
    console.log(`Total Records Needing Healing: ${healedCount}`);
    console.log(`Dry Run Mode:                  ${isDryRun ? 'YES' : 'NO'}`);
    console.log('=====================================================');

  } catch (err) {
    console.error('Fatal execution error:', err);
  }
}

run();
