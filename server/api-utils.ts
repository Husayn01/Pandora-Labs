import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function setCorsHeaders(
  req: VercelRequest,
  res: VercelResponse,
  methods = 'POST, OPTIONS'
) {
  const configuredOrigin = process.env.SITE_URL || process.env.VITE_SITE_URL;
  const requestOrigin = req.headers.origin;
  const origin =
    configuredOrigin && requestOrigin === configuredOrigin
      ? configuredOrigin
      : configuredOrigin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

export function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError(500, 'Supabase server environment variables are not configured.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAuthenticatedUser(
  req: VercelRequest,
  supabase: SupabaseClient
): Promise<{ user: User; token: string }> {
  const authHeader = req.headers.authorization;
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  if (!headerValue?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Unauthorized');
  }

  const token = headerValue.slice('Bearer '.length).trim();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(401, 'Unauthorized');
  }

  return { user: data.user, token };
}

export function getSingleQueryParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getBaseUrl(req: VercelRequest): string {
  const configuredUrl = process.env.SITE_URL || process.env.VITE_SITE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  const protoHeader = req.headers['x-forwarded-proto'];
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'http';
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  return `${proto}://${host}`;
}

function getOAuthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new HttpError(500, 'OAuth state secret is not configured.');
  return secret;
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', getOAuthStateSecret())
    .update(payload)
    .digest('base64url');
}

export function createOAuthState(provider: string, userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      provider,
      userId,
      ts: Date.now(),
      nonce: crypto.randomUUID(),
    })
  ).toString('base64url');

  return `${payload}.${signPayload(payload)}`;
}

export function verifyOAuthState(state: string, expectedProvider: string): string {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) throw new HttpError(400, 'Invalid OAuth state.');

  const expectedSignature = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new HttpError(400, 'Invalid OAuth state signature.');
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    provider?: string;
    userId?: string;
    ts?: number;
  };

  if (parsed.provider !== expectedProvider || !parsed.userId || !parsed.ts) {
    throw new HttpError(400, 'Invalid OAuth state payload.');
  }

  if (Date.now() - parsed.ts > 10 * 60 * 1000) {
    throw new HttpError(400, 'OAuth state has expired.');
  }

  return parsed.userId;
}

export function sendError(res: VercelResponse, error: unknown) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  console.error('Unhandled API error:', error);
  return res.status(500).json({ error: message });
}
