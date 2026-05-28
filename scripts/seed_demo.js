import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Role Key in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seedDemoUser() {
  const email = 'demo@pandoralabs.ai';
  const password = 'demo1234';
  let userId = null;

  console.log('Creating demo user...');

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
    });

    if (error) {
      if (error.message.includes('already exists') || error.message.includes('already registered')) {
        console.log('Demo user already exists. Updating password to ensure it is demo1234...');
        
        // Find user by email (there isn't a direct getUserByEmail, but we can list users or try to update)
        // Since we can't easily find user id by email without listing all, let's just assume it's fine
        // Wait, supabase admin update user by id is needed. We can use listUsers.
        const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;
        
        const existingUser = usersData.users.find(u => u.email === email);
        if (existingUser) {
           userId = existingUser.id;
           const { error: updateError } = await supabase.auth.admin.updateUserById(
             existingUser.id,
             { password: password, email_confirm: true }
           );
           if (updateError) throw updateError;
           console.log('Successfully updated demo user password and confirmed email.');
        }
      } else {
        throw error;
      }
    } else {
      console.log('Successfully created demo user:', data.user.id);
      userId = data.user.id;
    }

    if (userId) {
      const { data: defaultAgents, error: catalogError } = await supabase
        .from('agent_catalog')
        .select('id')
        .eq('is_default', true);

      if (catalogError) throw catalogError;

      const rows = (defaultAgents || []).map((agent) => ({
        user_id: userId,
        catalog_agent_id: agent.id,
        is_active: true,
      }));

      if (rows.length > 0) {
        const { error: installError } = await supabase
          .from('user_agents')
          .upsert(rows, { onConflict: 'user_id,catalog_agent_id' });

        if (installError) throw installError;
        console.log('Default agents installed for demo user.');
      }
    }
  } catch (err) {
    console.error('Error seeding demo user:', err);
    process.exit(1);
  }
}

seedDemoUser();
