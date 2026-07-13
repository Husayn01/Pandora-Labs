import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import {
  createSupabaseAdminClient,
  getBaseUrl,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../../server/api-utils';
import { canManageWorkspace, resolveTenant } from '../../server/tenant';
import { sha256 } from '../../server/webhooks';

const scopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
];

interface GoogleTokens {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error_description?: string;
  created_at?: number;
}

interface GoogleAccount {
  sub?: string;
  email?: string;
  email_verified?: boolean;
}

const base64url = (value: Buffer) => value.toString('base64url');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new HttpError(503, 'Google Workspace connection is not configured.');
    }

    const supabase = createSupabaseAdminClient();

    if (req.method === 'POST') {
      const { user } = await requireAuthenticatedUser(req, supabase);
      const requested =
        typeof req.body?.organizationId === 'string' ? req.body.organizationId : undefined;
      const tenant = await resolveTenant(supabase, user, requested);
      if (!canManageWorkspace(tenant.role)) {
        throw new HttpError(403, 'Only workspace administrators can connect Google.');
      }

      const state = base64url(crypto.randomBytes(32));
      const verifier = base64url(crypto.randomBytes(48));
      const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
      const redirectUri = `${getBaseUrl(req)}/api/connectors/google?action=callback`;
      const { data: secretId, error: secretError } = await supabase.rpc(
        'store_integration_secret',
        {
          secret_value: verifier,
          secret_name: `google-oauth-verifier-${crypto.randomUUID()}`,
          secret_description: 'Short-lived Google OAuth PKCE verifier',
        },
      );
      if (secretError) throw secretError;

      const { error: stateError } = await supabase.from('integration_oauth_states').insert({
        organization_id: tenant.organizationId,
        user_id: user.id,
        provider: 'google_workspace',
        state_hash: sha256(state),
        verifier_secret_id: secretId,
        redirect_uri: redirectUri,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (stateError) {
        await supabase.rpc('delete_integration_secret', { secret_id: secretId });
        throw stateError;
      }

      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', scopes.join(' '));
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('include_granted_scopes', 'true');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return res.status(200).json({ authorizationUrl: url.toString() });
    }

    if (req.method !== 'GET' || req.query.action !== 'callback') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!state || !code) {
      throw new HttpError(400, 'Google authorization was not completed.');
    }

    const consumedAt = new Date().toISOString();
    const { data: oauthState, error: stateError } = await supabase
      .from('integration_oauth_states')
      .update({ consumed_at: consumedAt })
      .eq('state_hash', sha256(state))
      .eq('provider', 'google_workspace')
      .is('consumed_at', null)
      .gt('expires_at', consumedAt)
      .select('*')
      .maybeSingle();
    if (stateError) throw stateError;
    if (!oauthState) {
      throw new HttpError(400, 'OAuth state is invalid, expired, or already used.');
    }

    const { data: verifier, error: verifierError } = await supabase.rpc(
      'read_integration_secret',
      { secret_id: oauthState.verifier_secret_id },
    );
    if (verifierError || !verifier) {
      throw new HttpError(400, 'OAuth verifier is unavailable.');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: String(verifier),
        grant_type: 'authorization_code',
        redirect_uri: oauthState.redirect_uri,
      }),
    });
    const tokens = (await tokenResponse.json()) as GoogleTokens;
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) {
      throw new HttpError(
        400,
        tokens.error_description ||
          'Google did not return offline access. Reconnect and grant consent.',
      );
    }
    tokens.created_at = Date.now();

    const accountResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const account = (await accountResponse.json()) as GoogleAccount;
    if (!accountResponse.ok || !account.email || !account.sub) {
      throw new HttpError(502, 'Google account details could not be verified.');
    }

    const { data: existingConnection } = await supabase
      .from('integration_connections')
      .select('vault_secret_id')
      .eq('organization_id', oauthState.organization_id)
      .eq('provider', 'google_workspace')
      .eq('external_account_id', account.sub)
      .maybeSingle();

    const { data: tokenSecretId, error: storeError } = await supabase.rpc(
      'store_integration_secret',
      {
        secret_value: JSON.stringify(tokens),
        secret_name: `google-workspace-${oauthState.organization_id}-${crypto.randomUUID()}`,
        secret_description: 'Encrypted Google Workspace OAuth tokens',
      },
    );
    if (storeError) throw storeError;

    const { error: connectionError } = await supabase.from('integration_connections').upsert(
      {
        organization_id: oauthState.organization_id,
        connected_by: oauthState.user_id,
        provider: 'google_workspace',
        status: 'connected',
        scopes: tokens.scope?.split(' ') || scopes,
        vault_secret_id: tokenSecretId,
        external_account_id: account.sub,
        external_account_label: account.email,
        token_expires_at: new Date(
          Date.now() + Number(tokens.expires_in || 3600) * 1000,
        ).toISOString(),
        last_checked_at: new Date().toISOString(),
        last_error_code: null,
        metadata: { email_verified: Boolean(account.email_verified) },
      },
      { onConflict: 'organization_id,provider,external_account_id' },
    );
    if (connectionError) {
      await supabase.rpc('delete_integration_secret', { secret_id: tokenSecretId });
      throw connectionError;
    }

    await supabase.rpc('delete_integration_secret', {
      secret_id: oauthState.verifier_secret_id,
    });
    if (
      existingConnection?.vault_secret_id &&
      existingConnection.vault_secret_id !== tokenSecretId
    ) {
      await supabase.rpc('delete_integration_secret', {
        secret_id: existingConnection.vault_secret_id,
      });
    }

    return res.redirect(
      302,
      `${getBaseUrl(req)}/dashboard/integrations?connected=google`,
    );
  } catch (error) {
    return sendError(res, error);
  }
}
