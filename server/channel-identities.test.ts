import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from './api-utils';
import { hashChannelIdentity, normalizePhoneNumber, phoneDisplayHint } from './channel-identities';

describe('channel identity helpers', () => {
  const originalPepper = process.env.CHANNEL_IDENTITY_PEPPER;

  beforeEach(() => {
    process.env.CHANNEL_IDENTITY_PEPPER = 'test-pepper-that-is-at-least-32-characters';
  });

  afterEach(() => {
    if (originalPepper === undefined) delete process.env.CHANNEL_IDENTITY_PEPPER;
    else process.env.CHANNEL_IDENTITY_PEPPER = originalPepper;
  });

  it('normalizes Nigerian local and international phone numbers', () => {
    expect(normalizePhoneNumber('0803 123 4567')).toBe('+2348031234567');
    expect(normalizePhoneNumber('2348031234567')).toBe('+2348031234567');
    expect(normalizePhoneNumber('+1 (202) 555-0123')).toBe('+12025550123');
  });

  it('rejects malformed phone numbers', () => {
    expect(() => normalizePhoneNumber('not-a-phone')).toThrow(HttpError);
  });

  it('creates deterministic, channel-bound hashes without exposing the phone number', () => {
    const phone = '+2348031234567';
    const first = hashChannelIdentity('phone', phone);
    expect(first).toBe(hashChannelIdentity('phone', phone));
    expect(first).not.toBe(hashChannelIdentity('sms', phone));
    expect(first).not.toContain(phone);
    expect(phoneDisplayHint(phone)).toBe('+234••••4567');
  });
});
