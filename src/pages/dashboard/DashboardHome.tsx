import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2, Mic, Phone, PlugZap, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DashboardPage,
  EmptyState,
  PageHeader,
  SkeletonRows,
  StatePill,
  StatusBanner,
  Surface,
  UsageMeter,
} from '@/components/dashboard/DashboardPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { launchPlanCatalog } from '@/lib/plan-catalog';
import type { ApprovalRequest, WorkflowEvent } from '@/types/platform';

type Integration = { provider: string; status: string; external_account_label: string | null; last_checked_at: string | null };
type UsageRow = { metric: string; quantity: number };

const realtimeTables = ['workflow_events', 'tasks', 'reminders', 'approval_requests', 'integration_connections', 'usage_counters'] as const;

export default function DashboardHome() {
  const { user } = useAuth();
  const { organization, role, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const online = useOnlineStatus();
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [openTasks, setOpenTasks] = useState(0);
  const [upcomingReminders, setUpcomingReminders] = useState(0);
  const [phoneLinked, setPhoneLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!organization || !user) return;
    setError('');
    const periodKey = new Date().toISOString().slice(0, 7);
    const results = await Promise.all([
      supabase.from('workflow_events').select('id,event_type,status,summary,workflow_name,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(6),
      supabase.from('approval_requests').select('id,action_type,risk_level,status,action_preview,expires_at,created_at').eq('organization_id', organization.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(4),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).in('status', ['open', 'in_progress', 'blocked']),
      supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('status', 'scheduled').gte('remind_at', new Date().toISOString()),
      supabase.from('integration_connections').select('provider,status,external_account_label,last_checked_at').eq('organization_id', organization.id),
      supabase.from('usage_counters').select('metric,quantity').eq('organization_id', organization.id).eq('period_key', periodKey),
      supabase.from('channel_identities').select('id').eq('organization_id', organization.id).eq('user_id', user.id).eq('channel', 'phone').not('verified_at', 'is', null).limit(1),
    ]);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setEvents((results[0].data ?? []) as WorkflowEvent[]);
    setApprovals((results[1].data ?? []) as ApprovalRequest[]);
    setOpenTasks(results[2].count ?? 0);
    setUpcomingReminders(results[3].count ?? 0);
    setIntegrations((results[4].data ?? []) as Integration[]);
    setUsage(Object.fromEntries(((results[5].data ?? []) as UsageRow[]).map((row) => [row.metric, Number(row.quantity)])));
    setPhoneLinked(Boolean(results[6].data?.length));
    setLastUpdated(new Date());
    setLoading(false);
  }, [organization, user]);

  useEffect(() => { void load(); }, [load]);
  const realtimeMode = useRealtimeRefresh({ organizationId: organization?.id, tables: realtimeTables, onRefresh: load });
  const firstName = useMemo(() => user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Founder', [user]);
  const plan = launchPlanCatalog.find((item) => item.code === organization?.plan_code) ?? launchPlanCatalog[0];
  const google = integrations.find((item) => item.provider === 'google_workspace');
  const voice = integrations.find((item) => item.provider === 'elevenlabs');
  const readiness = [google?.status === 'connected', phoneLinked, voice?.status === 'connected'].filter(Boolean).length;

  if (workspaceLoading) return <DashboardPage><SkeletonRows count={7} /></DashboardPage>;
  if (workspaceError || !organization) return <DashboardPage><StatusBanner>{workspaceError || 'Your account is not attached to an active workspace.'}</StatusBanner></DashboardPage>;

  return (
    <DashboardPage>
      <PageHeader
        eyebrow={`${organization.name} · ${role ?? 'member'}`}
        title={`Good to have you back, ${firstName}.`}
        description="Pandora’s live operating picture: connected channels, work awaiting attention, plan usage, and the latest audited actions."
        actions={<><Link to="/dashboard/chat" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"><Mic size={15} />Talk to Pandora</Link><Link to="/dashboard/integrations" className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-sm text-white/62">Check readiness<ArrowRight size={14} /></Link></>}
      />

      {!online && <StatusBanner tone="offline">You are offline. The last successful workspace snapshot remains read-only.</StatusBanner>}
      {error && <StatusBanner onRetry={() => void load()}>{error}</StatusBanner>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CheckCircle2} value={openTasks} label="Open tasks" detail="Open, active, or blocked" />
        <Metric icon={CalendarClock} value={upcomingReminders} label="Upcoming reminders" detail="Scheduled from now" />
        <Metric icon={ShieldCheck} value={approvals.length} label="Pending approvals" detail="Exact actions awaiting review" tone={approvals.length ? 'warning' : 'success'} />
        <Metric icon={PlugZap} value={`${readiness}/3`} label="Channel readiness" detail="Google, phone, and voice" tone={readiness === 3 ? 'success' : 'info'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Surface title="Channel and integration health" eyebrow="Readiness">
          <div className="divide-y divide-white/7">
            <HealthRow icon={PlugZap} label="Google Workspace" detail={google?.external_account_label || 'Connect Gmail and Calendar'} status={google?.status || 'not connected'} />
            <HealthRow icon={Phone} label="Verified calling number" detail={phoneLinked ? 'Linked to this web account' : 'Verify before private phone operations'} status={phoneLinked ? 'connected' : 'action needed'} />
            <HealthRow icon={Mic} label="ElevenLabs voice" detail="Shared Pandora agent and protected web session" status={voice?.status || 'managed setup'} />
          </div>
        </Surface>
        <Surface title="Current plan" eyebrow="Usage this month" action={<StatePill label={organization.status} tone={organization.status === 'active' ? 'success' : 'warning'} />}>
          <div className="space-y-6 p-5">
            <div><p className="text-2xl font-medium">{plan.name}</p><p className="mt-1 text-xs text-white/30">Entitlements refresh from the plan catalog.</p></div>
            <UsageMeter label="Action credits" used={usage.web_commands ?? usage.action_credits ?? 0} limit={plan.actionCredits} unit="actions" />
            <UsageMeter label="Web voice" used={Math.ceil((usage.web_voice_seconds ?? 0) / 60)} limit={plan.webVoiceMinutes} unit="min" />
            <Link to="/dashboard/billing" className="inline-flex items-center gap-2 text-xs font-medium text-white/55 hover:text-white">Manage plan and phone credit<ArrowRight size={12} /></Link>
          </div>
        </Surface>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface title="Recent operations" eyebrow="Audit trail" action={<div className="flex items-center gap-2"><StatePill label={realtimeMode} tone={realtimeMode === 'live' ? 'success' : 'warning'} /><Link to="/dashboard/operations" className="text-xs text-white/38 hover:text-white">View all</Link></div>}>
          {loading ? <SkeletonRows /> : events.length ? <div className="divide-y divide-white/7">{events.map((event) => <div key={event.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[16px_1fr_auto]"><span className={`mt-1.5 h-2 w-2 rounded-full ${event.status === 'error' ? 'bg-red-300' : event.status === 'warning' ? 'bg-amber-300' : 'bg-emerald-300'}`} /><div><p className="text-sm text-white/68">{event.summary || event.event_type}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">{event.workflow_name}</p></div><time className="text-[10px] text-white/25">{new Date(event.created_at).toLocaleString()}</time></div>)}</div> : <EmptyState title="No operations yet" description="Verified workflow events will appear here after Pandora handles the first request." />}
        </Surface>
        <Surface title="Pending approvals" eyebrow="Control desk" action={<Link to="/dashboard/approvals" className="text-xs text-white/38 hover:text-white">Review all</Link>}>
          {loading ? <SkeletonRows count={3} /> : approvals.length ? <div className="divide-y divide-white/7">{approvals.map((item) => <Link to="/dashboard/approvals" key={item.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-white/3"><div><p className="text-sm capitalize text-white/70">{item.action_type.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-white/28">Expires {new Date(item.expires_at).toLocaleString()}</p></div><StatePill label={item.risk_level} tone={item.risk_level === 'high' ? 'error' : 'warning'} /></Link>)}</div> : <EmptyState title="Control desk is clear" description="Actions that need a dashboard decision will appear here with an immutable preview." />}
        </Surface>
      </div>

      <p className="text-right font-mono text-[9px] uppercase tracking-[0.12em] text-white/20">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for first sync'}</p>
    </DashboardPage>
  );
}

function Metric({ icon: Icon, value, label, detail, tone = 'neutral' }: { icon: LucideIcon; value: number | string; label: string; detail: string; tone?: 'neutral' | 'success' | 'warning' | 'info' }) {
  return <Surface className="p-5"><div className="flex items-center justify-between"><Icon size={17} className="text-white/42" /><StatePill label={tone === 'neutral' ? 'live data' : tone} tone={tone} /></div><p className="mt-8 text-3xl font-medium tracking-[-0.04em]">{value}</p><p className="mt-2 text-sm text-white/58">{label}</p><p className="mt-1 text-xs text-white/25">{detail}</p></Surface>;
}

function HealthRow({ icon: Icon, label, detail, status }: { icon: LucideIcon; label: string; detail: string; status: string }) {
  const good = status === 'connected';
  const warning = ['expired', 'revoked', 'error', 'action needed'].includes(status);
  return <div className="flex items-center gap-4 px-5 py-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/9 text-white/45"><Icon size={17} /></span><div className="min-w-0 flex-1"><p className="text-sm text-white/68">{label}</p><p className="mt-1 truncate text-xs text-white/28">{detail}</p></div><StatePill label={status} tone={good ? 'success' : warning ? 'warning' : 'info'} /></div>;
}
