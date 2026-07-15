import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiResponseError, requestJson } from './api-client';

describe('requestJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a parsed JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(requestJson<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true });
  });

  it('uses a safe structured API error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Phone verification is not configured.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(requestJson('/api/test')).rejects.toMatchObject({
      name: 'ApiResponseError',
      message: 'Phone verification is not configured.',
      status: 503,
    });
  });

  it('does not expose or attempt to parse a non-JSON server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'A server error occurred',
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    )));

    await expect(requestJson('/api/test')).rejects.toEqual(
      new ApiResponseError('The server returned a non-JSON error (HTTP 500).', 500),
    );
  });

  it('converts aborts into a retryable user-facing timeout message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    await expect(requestJson('/api/test')).rejects.toMatchObject({
      message: 'The request timed out. Please try again.',
    });
  });
});
