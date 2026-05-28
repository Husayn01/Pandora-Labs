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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const PROVIDER = 'gmail';

function getRedirectUri(req: VercelRequest): string {
  return `${getBaseUrl(req)}/api/connectors/gmail`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = getSingleQueryParam(req.query.action);
  const code = getSingleQueryParam(req.query.code);
  const state = getSingleQueryParam(req.query.state);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    const msg = 'Google OAuth is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.';
    return res.status(500).json({ error: msg });
  }

  const redirectUri = getRedirectUri(req);

  if (action === 'authorize') {
    try {
      const supabase = createSupabaseAdminClient();
      const { user } = await requireAuthenticatedUser(req, supabase);
      const scope = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ].join(' ');

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
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
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const data = await tokenRes.json();
      if (data.error) throw new Error(data.error_description || data.error);

      const connectorPayload: Record<string, unknown> = {
        user_id: userId,
        provider: PROVIDER,
        access_token: data.access_token,
        token_expiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
        ],
        updated_at: new Date().toISOString(),
      };

      if (data.refresh_token) connectorPayload.refresh_token = data.refresh_token;

      const { error } = await supabase
        .from('user_connectors')
        .upsert(connectorPayload, { onConflict: 'user_id,provider' });

      if (error) throw error;

      return res.redirect('/dashboard/store?connected=gmail');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gmail OAuth failed';
      console.error('Gmail OAuth error:', error);
      return res.redirect(`/dashboard/store?error=${encodeURIComponent(message)}`);
    }
  }

  return sendError(res, new HttpError(400, 'Invalid request'));
}
