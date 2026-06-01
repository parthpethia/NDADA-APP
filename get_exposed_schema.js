const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf-8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabaseUrl = urlMatch[1].trim();
const serviceRoleKey = keyMatch[1].trim();

async function run() {
  console.log(`Fetching exposed OpenAPI schema from: ${supabaseUrl}`);
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const schema = await response.json();
    console.log('Exposed Paths (Tables/Views/RPCs):');
    const paths = Object.keys(schema.paths);
    paths.forEach(p => console.log(`- ${p}`));

    console.log('\nDefinitions (Table Schemas):');
    const definitions = Object.keys(schema.definitions);
    definitions.forEach(d => {
      console.log(`\nTable/Definition: ${d}`);
      const properties = schema.definitions[d].properties;
      if (properties) {
        Object.keys(properties).forEach(prop => {
          console.log(`  - ${prop}: ${properties[prop].type} (${properties[prop].format || 'no format'})`);
        });
      }
    });

  } catch (err) {
    console.error('Error fetching schema:', err);
  }
}

run();
