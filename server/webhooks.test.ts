import { describe, expect, it } from 'vitest';
import { safeEqualHex, sha256 } from './webhooks';

describe('webhook cryptography helpers', () => {
  it('hashes deterministic input', () => {
    expect(sha256('pandora')).toBe('5a7b2e919d9eb13cbcfcdaa0bda8bf6aec156a00e29448e96f1702676f70b119');
  });

  it('accepts identical hexadecimal digests', () => {
    const digest = sha256('signed payload');
    expect(safeEqualHex(digest, digest)).toBe(true);
  });

  it('rejects different and malformed digests without throwing', () => {
    expect(safeEqualHex(sha256('one'), sha256('two'))).toBe(false);
    expect(safeEqualHex('not-hex', sha256('two'))).toBe(false);
    expect(safeEqualHex('aa', 'aaaa')).toBe(false);
  });
});
