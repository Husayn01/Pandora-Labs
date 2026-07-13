import crypto from 'node:crypto';
import { HttpError } from './api-utils';

export function normalizePhoneNumber(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, '');
  const nigeriaNormalized = /^0\d{10}$/.test(compact)
    ? `+234${compact.slice(1)}`
    : /^234\d{10}$/.test(compact)
      ? `+${compact}`
      : compact;

  if (!/^\+[1-9]\d{7,14}$/.test(nigeriaNormalized)) {
    throw new HttpError(400, 'Enter a valid phone number with its country code.');
  }

  return nigeriaNormalized;
}

export function hashChannelIdentity(channel: string, externalId: string): string {
  const pepper = process.env.CHANNEL_IDENTITY_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new HttpError(500, 'Channel identity security is not configured.');
  }

  return crypto
    .createHmac('sha256', pepper)
    .update(`${channel}:${externalId}`)
    .digest('hex');
}

export function phoneDisplayHint(phone: string): string {
  return `${phone.slice(0, 4)}••••${phone.slice(-4)}`;
}
