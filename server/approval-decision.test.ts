import { describe, expect, it } from 'vitest';
import { HttpError } from './api-utils';
import { approvalDecisionFailure, parseApprovalDecisionInput } from './approval-decision';

const valid = {
  approvalId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  body: {
    organizationId: '33333333-3333-4333-8333-333333333333',
    decision: 'approved',
    expectedPayloadHash: 'a'.repeat(64),
    expectedApprovalIdempotencyKey: 'calendar-create:request-1',
  },
} as const;

describe('approval decision boundary', () => {
  it('accepts only a fully bound decision envelope', () => {
    expect(parseApprovalDecisionInput(valid)).toEqual({
      approvalId: valid.approvalId,
      decisionIdempotencyKey: valid.idempotencyKey,
      ...valid.body,
    });
  });

  it('accepts a valid raw JSON body without weakening validation', () => {
    const result = parseApprovalDecisionInput({ ...valid, body: JSON.stringify(valid.body) });
    expect(result.decision).toBe('approved');
  });

  it.each([
    [{ ...valid, approvalId: 'not-a-uuid' }, 'Invalid approval ID.'],
    [{ ...valid, idempotencyKey: 'reused-human-key' }, 'A valid decision idempotency key is required.'],
    [{ ...valid, body: { ...valid.body, decision: 'executed' } }, 'Invalid approval decision payload.'],
    [{ ...valid, body: { ...valid.body, expectedPayloadHash: 'short' } }, 'Invalid approval decision payload.'],
    [{ ...valid, body: { ...valid.body, organizationId: 'another-tenant' } }, 'Invalid approval decision payload.'],
  ])('rejects an invalid or weakly bound request', (input, message) => {
    expect(() => parseApprovalDecisionInput(input)).toThrowError(new HttpError(400, message));
  });

  it('rejects additional payload fields instead of silently accepting them', () => {
    expect(() => parseApprovalDecisionInput({ ...valid, body: { ...valid.body, actionPayload: { recipient: 'other@example.com' } } })).toThrow('Invalid approval decision payload.');
  });

  it('maps binding, expiry, replay conflict, and missing records to explicit failures', () => {
    expect(approvalDecisionFailure('binding_mismatch')).toEqual({ status: 409, message: 'The approval preview changed. Refresh before deciding.' });
    expect(approvalDecisionFailure('expired')).toEqual({ status: 409, message: 'This approval has expired.' });
    expect(approvalDecisionFailure('already_decided').status).toBe(409);
    expect(approvalDecisionFailure('not_found').status).toBe(404);
  });
});
