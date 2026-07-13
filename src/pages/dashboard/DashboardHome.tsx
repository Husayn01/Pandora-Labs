import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight, CalendarClock, CheckCircle2, Mic, ShieldCheck, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';
import type { ApprovalRequest, WorkflowEvent } from '@/types/platform';

export default function DashboardHome() {
  const { user } = useAuth();
  const { organization, role, loading: workspaceLoading } = useWorkspace();
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [openTasks, setOpenTasks] = useState(0);
  const [upcomingReminders, setUpcomingReminders] = useState(0);

  useEffect(() => {
    if (!organization) return;
    const load = async () => {
      const [eventResult, approvalResult, taskResult, reminderResult] = await Promise.all([
        supabase.from('workflow_events').select('id,event_type,status,summary,workflow_name,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(6),
        supabase.from('approval_requests').select('id,action_type,risk_level,status,action_preview,expires_at,created_at').eq('organization_id', organization.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(4),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id).in('status', ['open', 'in_progress', 'blocked']),
        supabase.from('reminders').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('status', 'scheduled').gte('remind_at', new Date().toISOString()),
      ]);
      setEvents((eventResult.data ?? []) as WorkflowEvent[]);
      setApprovals((approvalResult.data ?? []) as ApprovalRequest[]);
      setOpenTasks(taskResult.count ?? 0);
      setUpcomingReminders(reminderResult.count ?? 0);
    };
    void load();
  }, [organization]);

  const firstName = useMemo(() => user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Founder', [user]);

  if (workspaceLoading) return <div className="p-8 text-sm text-gray-500">Preparing your workspace…</div>;

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6 md:p-9">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(255,255,255,0.08),transparent_30%)]" />
        <div className="relative max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-4">{organization?.name ?? 'Pandora workspace'} · {role}</p>
          <h1 className="text-3xl md:text-5xl font-light tracking-tight text-white">Good to have you back, {firstName}.</h1>
          <p className="mt-4 text-gray-400 max-w-2xl leading-relaxed">Pandora is ready to answer calls, clarify requests, and keep every approved action visible here.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/dashboard/chat" className="inline-flex items-center gap-2 rounded-full bg-white text-black px-5 py-3 text-sm font-semibold"><Mic size={16}/> Talk to Pandora</Link>
            <Link to="/dashboard/integrations" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm text-white hover:bg-white/5">Check readiness <ArrowUpRight size={15}/></Link>
          </div>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          [openTasks, 'Open tasks', CheckCircle2],
          [upcomingReminders, 'Upcoming reminders', CalendarClock],
          [approvals.length, 'Awaiting approval', ShieldCheck],
          [events.length, 'Recent operations', Activity],
        ] as Array<[number,string,LucideIcon]>).map(([value, label, Icon]) => (
          <GlassCard key={String(label)} hover={false} className="p-5">
            <Icon size={18} className="text-gray-400 mb-5" />
            <p className="text-3xl font-light text-white">{String(value)}</p>
            <p className="text-xs text-gray-500 mt-2">{String(label)}</p>
          </GlassCard>
        ))}
      </section>

      <section className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <GlassCard hover={false} className="p-6">
          <div className="flex items-center justify-between mb-5"><div><p className="text-xs uppercase tracking-[0.2em] text-gray-500">Live activity</p><h2 className="text-xl text-white mt-1">What Pandora has done</h2></div><Link to="/dashboard/operations" className="text-xs text-gray-400 hover:text-white">View all</Link></div>
          <div className="divide-y divide-white/5">
            {events.length ? events.map(event => <div key={event.id} className="py-4 flex gap-3"><span className={`mt-1 h-2 w-2 rounded-full ${event.status === 'error' ? 'bg-red-400' : event.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'}`} /><div className="min-w-0"><p className="text-sm text-gray-200">{event.summary || event.event_type}</p><p className="text-xs text-gray-600 mt-1">{event.workflow_name} · {new Date(event.created_at).toLocaleString()}</p></div></div>) : <Empty text="Your verified operation history will appear here." />}
          </div>
        </GlassCard>
        <GlassCard hover={false} className="p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Control desk</p><h2 className="text-xl text-white mt-1 mb-5">Pending approvals</h2>
          {approvals.length ? approvals.map(item => <Link to="/dashboard/approvals" key={item.id} className="block rounded-2xl border border-white/8 p-4 mb-3 hover:bg-white/[0.03]"><div className="flex justify-between gap-3"><p className="text-sm text-white capitalize">{item.action_type.replaceAll('_',' ')}</p><span className="text-[10px] uppercase tracking-wider text-amber-300">{item.risk_level}</span></div><p className="text-xs text-gray-500 mt-2">Review before Pandora proceeds.</p></Link>) : <Empty text="Nothing needs your approval." />}
          <div className="mt-5 rounded-2xl bg-white/[0.03] p-4 flex gap-3"><Sparkles size={16} className="text-gray-400 shrink-0"/><p className="text-xs text-gray-500 leading-relaxed">Reads are automatic. Sends and calendar writes require confirmation. Destructive or financial actions require stronger verification.</p></div>
        </GlassCard>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) { return <div className="py-10 text-center text-sm text-gray-600">{text}</div>; }
