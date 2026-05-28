import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createOAuthState,
  createSupabaseAdminClient,
  getBaseUrl,
  getSingleQueryParam,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  verifyOAuthState,
} from '../../server/api-utils';

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID || '';
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET || '';
const PROVIDER = 'notion';

function getRedirectUri(req: VercelRequest): string {
  return `${getBaseUrl(req)}/api/connectors/notion`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = getSingleQueryParam(req.query.action);
  const code = getSingleQueryParam(req.query.code);
  const state = getSingleQueryParam(req.query.state);

  if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
    const msg = 'Notion OAuth is not configured. Please add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.';
    return res.status(500).json({ error: msg });
  }

  const redirectUri = getRedirectUri(req);

  if (action === 'authorize') {
    try {
      const supabase = createSupabaseAdminClient();
      const { user } = await requireAuthenticatedUser(req, supabase);
      const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');

      authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('owner', 'user');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('state', createOAuthState(PROVIDER, user.id));

      return res.status(200).json({ authUrl: authUrl.toString() });
    } catch (error) {
      return sendError(res, error);
    }
  }

  if (code && state) {
    try {
      const supabase = createSupabaseAdminClient();
      const userId = verifyOAuthState(state, PROVIDER);
      const auth = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');
      const response = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error_description || data.error);

      const { error } = await supabase
        .from('user_connectors')
        .upsert(
          {
            user_id: userId,
            provider: PROVIDER,
            access_token: data.access_token,
            metadata: {
              workspace_id: data.workspace_id,
              workspace_name: data.workspace_name,
              workspace_icon: data.workspace_icon,
              bot_id: data.bot_id,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,provider' }
        );

      if (error) throw error;

      return res.redirect('/dashboard/store?connected=notion');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notion OAuth failed';
      console.error('Notion OAuth error:', error);
      return res.redirect(`/dashboard/store?error=${encodeURIComponent(message)}`);
    }
  }

  return sendError(res, new HttpError(400, 'Invalid request'));
}
