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
  action_type: string;
  risk_level: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';
  action_preview: Record<string, unknown>;
  expires_at: string;
  created_at: string;
}
