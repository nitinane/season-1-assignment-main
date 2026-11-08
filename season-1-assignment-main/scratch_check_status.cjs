const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.trim().startsWith('"') && value.trim().endsWith('"')) {
      value = value.trim().substring(1, value.trim().length - 1);
    }
    env[key] = value.trim();
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'] || '';
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'] || '';

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkStatusColumn() {
  console.log('Checking status column...');
  const { data, error } = await supabase.from('job_roles').select('status').limit(1);
  if (error) {
    console.log('❌ Error querying status column:', error.message);
  } else {
    console.log('✅ Status column exists and is accessible. Rows found:', data.length);
  }
}

checkStatusColumn();
