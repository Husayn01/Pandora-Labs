import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
const REDIRECT_URI = process.env.VITE_SITE_URL 
  ? `${process.env.VITE_SITE_URL}/api/connectors/google-calendar` 
  : 'http://localhost:5173/api/connectors/google-calendar';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, userId, code, state } = req.query;

  // 1. Authorize - Redirect user to Google
  if (action === 'authorize') {
    if (!userId) return res.status(400).send('Missing userId');
    
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${userId}`;
    
    return res.redirect(authUrl);
  }

  // 2. Callback - Exchange code for tokens
  if (code && state) {
    const userIdFromState = Array.isArray(state) ? state[0] : state;
    
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: Array.isArray(code) ? code[0] : code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error_description || data.error);

      // Store in Supabase
      const { error } = await supabase
        .from('user_connectors')
        .upsert({
          user_id: userIdFromState,
          provider: 'google_calendar',
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          scopes: ['https://www.googleapis.com/auth/calendar'],
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,provider' });

      if (error) throw error;

      // Redirect back to dashboard store
      return res.redirect('/dashboard/store?connected=google_calendar');
      
    } catch (error: any) {
      console.error('OAuth error:', error);
      return res.redirect(`/dashboard/store?error=${encodeURIComponent(error.message)}`);
    }
  }

  return res.status(400).send('Invalid request');
}
