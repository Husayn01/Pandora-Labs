import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock3, Fingerprint, ShieldAlert, UserRoundCheck, X } from 'lucide-react';
import {
  DashboardPage,
  EmptyState,
  PageHeader,
  SkeletonRows,
  StatePill,
  StatusBanner,
  Surface,
} from '@/components/dashboard/DashboardPrimitives';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import type { ApprovalRequest } from '@/types/platform';

const realtimeTables = ['approval_requests', 'approval_decisions'] as const;
type DecisionLedger = { approval_request_id: string; actor_user_id: string; decision: string; decision_idempotency_key: string; decided_at: string };

export default function ApprovalsPage() {
  const { organization, role } = useWorkspace();
  const online = useOnlineStatus();
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [decisions, setDecisions] = useState<DecisionLedger[]>([]);
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const decisionKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    if (!organization) return;
    setError('');
    const [requestResult, decisionResult] = await Promise.all([
      supabase.from('approval_requests').select('id,requested_by,action_type,risk_level,status,action_preview,action_payload_hash,idempotency_key,expires_at,decided_by,decided_at,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('approval_decisions').select('approval_request_id,actor_user_id,decision,decision_idempotency_key,decided_at').eq('organization_id', organization.id).order('decided_at', { ascending: false }).limit(100),
    ]);
    const queryError = requestResult.error || decisionResult.error;
    if (queryError) setError(queryError.message); else {
      setItems((requestResult.data ?? []) as ApprovalRequest[]);
      setDecisions((decisionResult.data ?? []) as DecisionLedger[]);
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => { void load(); }, [load]);
  const realtimeMode = useRealtimeRefresh({ organizationId: organization?.id, tables: realtimeTables, onRefresh: load });
  const visibleItems = useMemo(() => items.filter((item) => view === 'pending' ? item.status === 'pending' : item.status !== 'pending'), [items, view]);
  const decisionByRequest = useMemo(() => new Map(decisions.map((decision) => [decision.approval_request_id, decision])), [decisions]);
  const canDecide = online && (role === 'owner' || role === 'admin');

  const decide = async (item: ApprovalRequest, decision: 'approved' | 'rejected') => {
    if (!organization || !canDecide) return;
    const keyName = `${item.id}:${decision}`;
    const decisionKey = decisionKeys.current.get(keyName) ?? crypto.randomUUID();
    decisionKeys.current.set(keyName, decisionKey);
    setBusy(item.id);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/approvals/${item.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, 'Idempotency-Key': decisionKey },
        body: JSON.stringify({ organizationId: organization.id, decision, expectedPayloadHash: item.action_payload_hash, expectedApprovalIdempotencyKey: item.idempotency_key }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Approval could not be decided.');
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Approval decision state is uncertain. Refresh before trying again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <DashboardPage>
      <PageHeader eyebrow="Human control" title="Approvals" description="Review the exact, hash-bound action Pandora intends to execute. A decision can authorize only this preview, never a rewritten payload." actions={<StatePill label={realtimeMode} tone={realtimeMode === 'live' ? 'success' : 'warning'} />} />
      {!online && <StatusBanner tone="offline">Approvals are read-only while offline.</StatusBanner>}
      {error && <StatusBanner onRetry={() => void load()}>{error}</StatusBanner>}
      {role && !['owner', 'admin'].includes(role) && <StatusBanner tone="stale">Your {role} role can inspect decisions but cannot approve or reject them.</StatusBanner>}

      <Surface>
        <div className="flex items-center gap-2 border-b border-white/8 p-4" role="tablist" aria-label="Approval views"><button type="button" role="tab" aria-selected={view === 'pending'} onClick={() => setView('pending')} className={`rounded-xl px-4 py-2 text-xs ${view === 'pending' ? 'bg-white text-black' : 'text-white/38'}`}>Pending ({items.filter((item) => item.status === 'pending').length})</button><button type="button" role="tab" aria-selected={view === 'history'} onClick={() => setView('history')} className={`rounded-xl px-4 py-2 text-xs ${view === 'history' ? 'bg-white text-black' : 'text-white/38'}`}>Decision history</button></div>
        {loading ? <SkeletonRows count={5} /> : visibleItems.length ? <div className="divide-y divide-white/8">{visibleItems.map((item) => <ApprovalCard key={item.id} item={item} decision={decisionByRequest.get(item.id)} busy={busy === item.id} canDecide={canDecide} onDecide={decide} />)}</div> : <EmptyState title={view === 'pending' ? 'Control desk is clear' : 'No decisions recorded'} description={view === 'pending' ? 'When an action requires dashboard approval, its exact preview and expiry will appear here.' : 'Approved, rejected, expired, and executed requests will form the immutable decision history.'} />}
      </Surface>
    </DashboardPage>
  );
}

function ApprovalCard({ item, decision, busy, canDecide, onDecide }: { item: ApprovalRequest; decision?: DecisionLedger; busy: boolean; canDecide: boolean; onDecide: (item: ApprovalRequest, decision: 'approved' | 'rejected') => Promise<void> }) {
  const expired = new Date(item.expires_at) <= new Date();
  return (
    <article className="p-5 md:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><ShieldAlert size={17} className={['high', 'destructive', 'financial'].includes(item.risk_level) ? 'text-red-300' : 'text-amber-200'} /><h2 className="text-lg font-medium capitalize">{item.action_type.replaceAll('_', ' ')}</h2><StatePill label={expired && item.status === 'pending' ? 'expired' : item.status} tone={item.status === 'approved' || item.status === 'executed' ? 'success' : item.status === 'rejected' || expired ? 'error' : 'warning'} /><StatePill label={`${item.risk_level} risk`} tone={['high', 'destructive', 'financial'].includes(item.risk_level) ? 'error' : 'warning'} /></div>
          <div className="mt-5 overflow-hidden rounded-[16px] border border-white/9"><div className="border-b border-white/8 bg-white/3 px-4 py-3"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/30">Exact action preview</p></div><dl className="divide-y divide-white/7">{Object.entries(item.action_preview).map(([key, value]) => <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]"><dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/28">{humanize(key)}</dt><dd className="break-words text-sm text-white/62">{formatValue(value)}</dd></div>)}</dl></div>
          <div className="mt-4 grid gap-3 text-xs text-white/28 sm:grid-cols-3"><span className="flex items-center gap-2"><Clock3 size={12} />Expires {new Date(item.expires_at).toLocaleString()}</span><span className="flex items-center gap-2"><Fingerprint size={12} /><span title={item.action_payload_hash}>Payload {item.action_payload_hash.slice(0, 12)}…</span></span><span className="flex items-center gap-2"><UserRoundCheck size={12} />{item.decided_at ? `Decided ${new Date(item.decided_at).toLocaleString()}` : 'Awaiting authorized actor'}</span></div>
          {decision && <div className="mt-4 rounded-xl border border-emerald-300/12 bg-emerald-300/5 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald-100/48">Immutable ledger · {decision.decision} by {decision.actor_user_id.slice(0, 8)}… · key {decision.decision_idempotency_key.slice(0, 8)}…</div>}
        </div>
        {item.status === 'pending' && !expired && <div className="flex shrink-0 gap-2"><button type="button" disabled={!canDecide || busy} onClick={() => void onDecide(item, 'rejected')} className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-sm text-white/58 disabled:opacity-30"><X size={14} />Reject</button><button type="button" disabled={!canDecide || busy} onClick={() => void onDecide(item, 'approved')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-30"><Check size={14} />{busy ? 'Recording…' : 'Approve exact preview'}</button></div>}
      </div>
    </article>
  );
}

function humanize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, nested]) => `${humanize(key)}: ${formatValue(nested)}`).join(' · ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
