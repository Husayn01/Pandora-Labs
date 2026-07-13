import crypto from 'node:crypto';
import type { VercelRequest } from './vercel-types';
import { HttpError } from './api-utils';

export async function readRawBody(req: VercelRequest, maxBytes = 1_000_000): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > maxBytes) throw new HttpError(413, 'Payload too large.');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function safeEqualHex(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]+$/i.test(actual) || !/^[a-f0-9]+$/i.test(expected)) return false;
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
