import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { WorkspaceMembership } from '@/types/platform';

export function useWorkspace() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setMembership(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('organization_members')
      .select('role, organization:organizations(id,name,slug,timezone,locale,plan_code,status,business_profile)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (queryError) {
      setError(queryError.message);
      setMembership(null);
    } else {
      setError(null);
      setMembership(data as unknown as WorkspaceMembership | null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    membership,
    organization: membership?.organization ?? null,
    role: membership?.role ?? null,
    loading,
    error,
    refresh,
  };
}
