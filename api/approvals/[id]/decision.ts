import type { VercelRequest, VercelResponse } from '../../../server/vercel-types';
import {
  createSupabaseAdminClient,
  getSingleQueryParam,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../../../server/api-utils';
import { approvalDecisionFailure, parseApprovalDecisionInput } from '../../../server/approval-decision';
import { canManageWorkspace, resolveTenant } from '../../../server/tenant';

type DecisionResult = {
  ok?: boolean;
  code?: string;
  status?: string;
  replayed?: boolean;
  approvalId?: string;
  decidedAt?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const approvalId = getSingleQueryParam(req.query.id);
    const idempotencyHeader = Array.isArray(req.headers['idempotency-key']) ? req.headers['idempotency-key'][0] : req.headers['idempotency-key'];
    const input = parseApprovalDecisionInput({ approvalId, idempotencyKey: idempotencyHeader, body: req.body });

    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    const tenant = await resolveTenant(supabase, user, input.organizationId);
    if (!canManageWorkspace(tenant.role)) throw new HttpError(403, 'Only workspace owners and admins can decide approvals.');

    const { data, error } = await supabase.rpc('decide_approval', {
      p_organization_id: tenant.organizationId,
      p_approval_request_id: input.approvalId,
      p_actor_user_id: user.id,
      p_decision: input.decision,
      p_expected_payload_hash: input.expectedPayloadHash,
      p_expected_approval_idempotency_key: input.expectedApprovalIdempotencyKey,
      p_decision_idempotency_key: input.decisionIdempotencyKey,
    });
    if (error) throw error;
    const result = (data ?? {}) as DecisionResult;
    if (!result.ok) {
      const failure = approvalDecisionFailure(result.code);
      throw new HttpError(failure.status, failure.message);
    }

    await supabase.from('workflow_events').upsert({
      organization_id: tenant.organizationId,
      actor_user_id: user.id,
      workflow_name: 'Pandora — Process Approval Decision',
      correlation_id: input.decisionIdempotencyKey,
      event_type: 'approval_decided',
      status: 'success',
      summary: `Approval ${input.decision} by a workspace ${tenant.role}.`,
      redacted_payload: { approval_id: input.approvalId, decision: input.decision, replayed: Boolean(result.replayed) },
      idempotency_key: `approval-decision:${input.decisionIdempotencyKey}`,
    }, { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true });

    return res.status(200).json({
      ok: true,
      approvalId: input.approvalId,
      status: result.status,
      replayed: Boolean(result.replayed),
      decidedAt: result.decidedAt,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return sendError(res, new HttpError(400, 'Request body must be valid JSON.'));
    return sendError(res, error);
  }
}
