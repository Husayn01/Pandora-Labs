import type { SupabaseClient, User } from '@supabase/supabase-js';
import { HttpError } from './api-utils';

export interface TenantContext {
  organizationId: string;
  organizationName: string;
  timezone: string;
  locale: string;
  plan: 'free' | 'solo' | 'business' | 'scale';
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export async function resolveTenant(
  supabase: SupabaseClient,
  user: User,
  requestedOrganizationId?: string,
): Promise<TenantContext> {
  let query = supabase
    .from('organization_members')
    .select('role, organization:organizations!inner(id,name,timezone,locale,plan_code,status)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('organization.status', 'active');

  if (requestedOrganizationId) query = query.eq('organization_id', requestedOrganizationId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, 'You do not have access to this workspace.');

  const organization = data.organization as unknown as {
    id: string; name: string; timezone: string; locale: string; plan_code: TenantContext['plan'];
  };
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    timezone: organization.timezone,
    locale: organization.locale,
    plan: organization.plan_code,
    role: data.role as TenantContext['role'],
  };
}

export function canManageWorkspace(role: TenantContext['role']) {
  return role === 'owner' || role === 'admin';
}
