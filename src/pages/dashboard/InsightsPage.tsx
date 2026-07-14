import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Download, TriangleAlert } from 'lucide-react';
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
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';

type ReportEvent = { id: string; event_type: string; status: 'info' | 'success' | 'warning' | 'error'; summary: string | null; workflow_name: string; redacted_payload: Record<string, unknown>; created_at: string };
const realtimeTables = ['workflow_events'] as const;

export default function InsightsPage() {
  const { organization } = useWorkspace();
  const [days, setDays] = useState(30);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError('');
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error: queryError } = await supabase.from('workflow_events').select('id,event_type,status,summary,workflow_name,redacted_payload,created_at').eq('organization_id', organization.id).gte('created_at', since).order('created_at', { ascending: false }).limit(1000);
    if (queryError) setError(queryError.message); else setEvents((data ?? []) as ReportEvent[]);
    setLoading(false);
  }, [days, organization]);

  useEffect(() => { void load(); }, [load]);
  const realtimeMode = useRealtimeRefresh({ organizationId: organization?.id, tables: realtimeTables, onRefresh: load });
  const report = useMemo(() => buildReport(events), [events]);

  const exportCsv = () => {
    const header = ['created_at', 'event_type', 'status', 'workflow_name', 'summary'];
    const rows = events.map((event) => [event.created_at, event.event_type, event.status, event.workflow_name, event.summary ?? '']);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pandora-operations-${days}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardPage>
      <PageHeader eyebrow="Evidence, not estimates" title="Reports" description="Success, failure, latency, and action mix calculated from tenant-scoped workflow events—never invented efficiency scores." actions={<><StatePill label={realtimeMode} tone={realtimeMode === 'live' ? 'success' : 'warning'} /><label><span className="sr-only">Report date range</span><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white/58"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><button type="button" onClick={exportCsv} disabled={!events.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/55 disabled:opacity-30"><Download size={14} />Export CSV</button></>} />
      {error && <StatusBanner onRetry={() => void load()}>{error}</StatusBanner>}
      {loading ? <SkeletonRows count={7} /> : !events.length ? <Surface><EmptyState title="No reportable events" description={`No audited workflow events exist in the last ${days} days. Expand the range or run a verified operation.`} /></Surface> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Activity} label="Audited operations" value={report.total.toLocaleString()} detail={`Up to 1,000 events in ${days} days`} />
            <Metric icon={CheckCircle2} label="Successful" value={`${report.successRate}%`} detail={`${report.success} successful events`} tone="success" />
            <Metric icon={TriangleAlert} label="Failures" value={report.failures.toLocaleString()} detail={`${report.warnings} warning events`} tone={report.failures ? 'error' : 'success'} />
            <Metric icon={Clock3} label="Recorded latency" value={report.averageLatency === null ? 'Not captured' : `${report.averageLatency} ms`} detail={report.latencySamples ? `${report.latencySamples} events with timing` : 'Workflows must emit latency_ms'} tone="info" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Surface title="Daily outcome trend" eyebrow={`${days}-day event window`}>
              <div className="divide-y divide-white/7">{report.daily.slice(-14).map((day) => <div key={day.date} className="grid grid-cols-[90px_1fr_auto] items-center gap-4 px-5 py-3"><time className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/28">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><meter min={0} max={Math.max(1, day.total)} value={day.success} className="h-2 w-full accent-emerald-300" aria-label={`${day.success} successful of ${day.total} events`} /><span className="text-xs text-white/35">{day.success}/{day.total}</span></div>)}</div>
            </Surface>
            <Surface title="Action mix" eyebrow="Most frequent event types">
              <div className="divide-y divide-white/7">{report.actionTypes.slice(0, 8).map(([type, count]) => <div key={type} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3"><div><p className="text-sm capitalize text-white/60">{type.replaceAll('_', ' ')}</p><meter min={0} max={report.total} value={count} className="mt-2 h-1.5 w-full accent-blue-300" aria-label={`${count} ${type} events`} /></div><span className="self-center font-mono text-xs text-white/35">{count}</span></div>)}</div>
            </Surface>
          </div>

          <Surface title="Recent exceptions" eyebrow="Failure and warning evidence">
            {report.exceptions.length ? <div className="divide-y divide-white/7">{report.exceptions.slice(0, 12).map((event) => <div key={event.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[110px_1fr_auto]"><StatePill label={event.status} tone={event.status === 'error' ? 'error' : 'warning'} /><div><p className="text-sm text-white/62">{event.summary || event.event_type}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/24">{event.workflow_name}</p></div><time className="text-xs text-white/25">{new Date(event.created_at).toLocaleString()}</time></div>)}</div> : <EmptyState title="No exceptions in this range" description="There are no warning or failure events to investigate." />}
          </Surface>
        </>
      )}
    </DashboardPage>
  );
}

function buildReport(events: ReportEvent[]) {
  const success = events.filter((event) => event.status === 'success').length;
  const failures = events.filter((event) => event.status === 'error').length;
  const warnings = events.filter((event) => event.status === 'warning').length;
  const latencies = events.map((event) => event.redacted_payload?.latency_ms).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const byType = new Map<string, number>();
  const byDay = new Map<string, { total: number; success: number }>();
  for (const event of events) {
    byType.set(event.event_type, (byType.get(event.event_type) ?? 0) + 1);
    const date = event.created_at.slice(0, 10);
    const day = byDay.get(date) ?? { total: 0, success: 0 };
    day.total += 1;
    if (event.status === 'success') day.success += 1;
    byDay.set(date, day);
  }
  return {
    total: events.length,
    success,
    failures,
    warnings,
    successRate: events.length ? Math.round((success / events.length) * 100) : 0,
    averageLatency: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
    latencySamples: latencies.length,
    actionTypes: [...byType.entries()].sort((a, b) => b[1] - a[1]),
    daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
    exceptions: events.filter((event) => event.status === 'error' || event.status === 'warning'),
  };
}

function Metric({ icon: Icon, label, value, detail, tone = 'neutral' }: { icon: typeof Activity; label: string; value: string; detail: string; tone?: 'neutral' | 'success' | 'error' | 'info' }) { return <Surface className="p-5"><div className="flex items-center justify-between"><Icon size={17} className="text-white/38" /><StatePill label={tone === 'neutral' ? 'live data' : tone} tone={tone} /></div><p className="mt-7 text-3xl font-medium tracking-[-0.04em]">{value}</p><p className="mt-2 text-sm text-white/58">{label}</p><p className="mt-1 text-xs text-white/25">{detail}</p></Surface>; }
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }
