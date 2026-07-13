import crypto from 'node:crypto';
import { HttpError } from './api-utils';

export interface VoiceContext {
  organizationId: string | null;
  actorId: string | null;
  role: string;
  plan: string;
  channel: 'phone' | 'web_voice';
  expiresAt: number;
}

function getSecret() {
  const secret = process.env.VOICE_CONTEXT_SECRET;
  if (!secret || secret.length < 32) {
    throw new HttpError(500, 'Voice context security is not configured.');
  }
  return secret;
}

function sign(payload: string) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createVoiceContextToken(
  context: Omit<VoiceContext, 'expiresAt'>,
  ttlSeconds: number,
) {
  const payload = Buffer.from(
    JSON.stringify({ ...context, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyVoiceContextToken(token: string): VoiceContext {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) throw new HttpError(401, 'Invalid voice context.');
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new HttpError(401, 'Invalid voice context.');
  }

  let parsed: VoiceContext;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as VoiceContext;
  } catch {
    throw new HttpError(401, 'Invalid voice context.');
  }
  if (
    !parsed ||
    !['phone', 'web_voice'].includes(parsed.channel) ||
    typeof parsed.role !== 'string' ||
    typeof parsed.plan !== 'string' ||
    typeof parsed.expiresAt !== 'number' ||
    parsed.expiresAt < Math.floor(Date.now() / 1000)
  ) {
    throw new HttpError(401, 'Voice context has expired or is invalid.');
  }
  return parsed;
}
