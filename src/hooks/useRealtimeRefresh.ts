import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type RealtimeMode = 'connecting' | 'live' | 'polling';

export function useRealtimeRefresh({ organizationId, tables, onRefresh, pollInterval = 30_000 }: { organizationId?: string | null; tables: readonly string[]; onRefresh: () => void | Promise<void>; pollInterval?: number }) {
  const refreshRef = useRef(onRefresh);
  const [mode, setMode] = useState<RealtimeMode>('connecting');
  const tableKey = tables.join(',');

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!organizationId) return;
    let timeoutId: number | undefined;
    let lastRefresh = 0;
    let active = true;

    const scheduleRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      const delay = Math.max(0, 900 - (Date.now() - lastRefresh));
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        lastRefresh = Date.now();
        void refreshRef.current();
      }, delay);
    };

    const channel = supabase.channel(`dashboard:${organizationId}:${tableKey}`);
    for (const table of tableKey.split(',').filter(Boolean)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}` }, scheduleRefresh);
    }
    channel.subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') setMode('live');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setMode('polling');
    });

    const pollId = window.setInterval(scheduleRefresh, pollInterval);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, pollInterval, tableKey]);

  return mode;
}
