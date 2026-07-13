import type { VercelRequest, VercelResponse } from './vercel-types';
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
  const isLocalOrigin = typeof requestOrigin === 'string' && /^http:\/\/localhost:\d+$/.test(requestOrigin);
  const origin = configuredOrigin && requestOrigin === configuredOrigin
    ? configuredOrigin
    : isLocalOrigin && process.env.NODE_ENV !== 'production'
      ? requestOrigin
      : configuredOrigin || 'https://pandoralabs.ai';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
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

export function sendError(res: VercelResponse, error: unknown) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error('Unhandled API error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
