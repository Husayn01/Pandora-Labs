import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceContextToken, verifyVoiceContextToken } from './voice-context';

describe('signed voice context', () => {
  const originalSecret = process.env.VOICE_CONTEXT_SECRET;

  beforeEach(() => {
    process.env.VOICE_CONTEXT_SECRET = 'test-voice-context-secret-at-least-32-characters';
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalSecret === undefined) delete process.env.VOICE_CONTEXT_SECRET;
    else process.env.VOICE_CONTEXT_SECRET = originalSecret;
  });

  it('round-trips a trusted tenant context', () => {
    const token = createVoiceContextToken(
      {
        organizationId: '3d285583-5249-4e39-8c7a-1393ad33d3f3',
        actorId: 'f4a660fe-ef53-467a-90c6-3452ee9013af',
        role: 'owner',
        plan: 'business',
        channel: 'web_voice',
      },
      60,
    );
    expect(verifyVoiceContextToken(token)).toMatchObject({ role: 'owner', plan: 'business' });
  });

  it('rejects tampering and expiration', () => {
    const token = createVoiceContextToken(
      {
        organizationId: null,
        actorId: null,
        role: 'public_customer',
        plan: 'free',
        channel: 'phone',
      },
      1,
    );
    expect(() => verifyVoiceContextToken(`${token}x`)).toThrow(/invalid voice context/i);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2_000);
    expect(() => verifyVoiceContextToken(token)).toThrow(/expired/i);
  });
});
