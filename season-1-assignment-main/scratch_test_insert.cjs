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

async function testInsert() {
  console.log('Testing insert into job_roles...');
  
  // We need a valid user ID from auth.users to reference in hr_user_id
  const { data: users, error: usersErr } = await supabase.auth.admin.listUsers();
  if (usersErr || !users.users || users.users.length === 0) {
    console.error('Failed to list users:', usersErr);
    return;
  }
  
  const testUser = users.users[0];
  console.log('Using test user:', testUser.id, testUser.email);
  
  const { data, error } = await supabase
    .from('job_roles')
    .insert([
      {
        hr_user_id: testUser.id,
        title: 'Test Software Engineer',
        description: 'Test description',
        required_skills: ['React', 'TypeScript'],
        experience_level: '0-2 years',
        status: 'active'
      }
    ])
    .select();
    
  if (error) {
    console.error('Insert failed:', error);
    console.error('Insert Error Details:', JSON.stringify(error, null, 2));
  } else {
    console.log('Insert succeeded! Row:', data);
    
    // Now test a select with anon key
    const anonKey = env['VITE_SUPABASE_ANON_KEY'] || '';
    const anonSupabase = createClient(supabaseUrl, anonKey);
    const { data: anonData, error: anonError } = await anonSupabase
      .from('job_roles')
      .select('*');
      
    if (anonError) {
      console.error('Anon Select failed:', anonError);
    } else {
      console.log('Anon Select succeeded! Rows:', anonData);
    }
    
    // Cleanup
    await supabase.from('job_roles').delete().eq('id', data[0].id);
    console.log('Cleanup complete.');
  }
}

testInsert();
