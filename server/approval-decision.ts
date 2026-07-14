import { z } from 'zod';
import { HttpError } from './api-utils';

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  expectedPayloadHash: z.string().min(32).max(128),
  expectedApprovalIdempotencyKey: z.string().min(1).max(128),
}).strict();

export type ApprovalDecisionInput = z.infer<typeof bodySchema> & {
  approvalId: string;
  decisionIdempotencyKey: string;
};

export function parseApprovalDecisionInput(input: {
  approvalId?: string;
  idempotencyKey?: string;
  body: unknown;
}): ApprovalDecisionInput {
  if (!input.approvalId || !z.string().uuid().safeParse(input.approvalId).success) {
    throw new HttpError(400, 'Invalid approval ID.');
  }
  if (!input.idempotencyKey || !z.string().uuid().safeParse(input.idempotencyKey).success) {
    throw new HttpError(400, 'A valid decision idempotency key is required.');
  }

  const rawBody = typeof input.body === 'string' ? JSON.parse(input.body) : input.body;
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) throw new HttpError(400, 'Invalid approval decision payload.');

  return {
    approvalId: input.approvalId,
    decisionIdempotencyKey: input.idempotencyKey,
    ...parsed.data,
  };
}

export function approvalDecisionFailure(code?: string) {
  const failures: Record<string, { status: number; message: string }> = {
    not_found: { status: 404, message: 'Approval request not found.' },
    binding_mismatch: { status: 409, message: 'The approval preview changed. Refresh before deciding.' },
    already_decided: { status: 409, message: 'This approval has already been decided.' },
    not_pending: { status: 409, message: 'This approval is no longer pending.' },
    expired: { status: 409, message: 'This approval has expired.' },
    invalid_decision: { status: 400, message: 'Invalid approval decision.' },
  };
  return failures[code ?? ''] ?? { status: 409, message: 'Approval could not be decided.' };
}
