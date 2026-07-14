export type PlanCode = 'free' | 'solo' | 'business' | 'scale';
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  plan_code: PlanCode;
  status: 'active' | 'past_due' | 'suspended' | 'closed';
  business_profile: Record<string, unknown>;
}

export interface WorkspaceMembership {
  role: MemberRole;
  organization: Organization;
}

export interface WorkflowEvent {
  id: string;
  event_type: string;
  status: 'info' | 'success' | 'warning' | 'error';
  summary: string | null;
  workflow_name: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  requested_by: string | null;
  action_type: string;
  risk_level: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';
  action_preview: Record<string, unknown>;
  action_payload_hash: string;
  idempotency_key: string;
  expires_at: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}
