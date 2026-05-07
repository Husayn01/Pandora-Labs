import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID || 'YOUR_NOTION_CLIENT_ID';
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET || 'YOUR_NOTION_CLIENT_SECRET';
const REDIRECT_URI = process.env.VITE_SITE_URL 
  ? `${process.env.VITE_SITE_URL}/api/connectors/notion` 
  : 'http://localhost:5173/api/connectors/notion';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, userId, code, state } = req.query;

  // 1. Authorize - Redirect user to Notion
  if (action === 'authorize') {
    if (!userId) return res.status(400).send('Missing userId');
    
    const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${userId}`;
    
    return res.redirect(authUrl);
  }

  // 2. Callback - Exchange code for tokens
  if (code && state) {
    const userIdFromState = Array.isArray(state) ? state[0] : state;
    
    try {
      const auth = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');
      
      const response = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({
          code: Array.isArray(code) ? code[0] : code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error_description || data.error);

      // Store in Supabase
      const { error } = await supabase
        .from('user_connectors')
        .upsert({
          user_id: userIdFromState,
          provider: 'notion',
          access_token: data.access_token,
          // Notion tokens don't expire/refresh in the same way, but we store the workspace id
          metadata: {
            workspace_id: data.workspace_id,
            workspace_name: data.workspace_name,
            workspace_icon: data.workspace_icon,
            bot_id: data.bot_id
          },
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,provider' });

      if (error) throw error;

      // Redirect back to dashboard store
      return res.redirect('/dashboard/store?connected=notion');
      
    } catch (error: any) {
      console.error('OAuth error:', error);
      return res.redirect(`/dashboard/store?error=${encodeURIComponent(error.message)}`);
    }
  }

  return res.status(400).send('Invalid request');
}
