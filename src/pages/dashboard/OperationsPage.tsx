import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarClock, CheckCircle2, ChevronRight, Circle, Plus, RefreshCw, Search, X } from 'lucide-react';
import {
  DashboardPage,
  EmptyState,
  PageHeader,
  SkeletonRows,
  StatePill,
  StatusBanner,
  Surface,
} from '@/components/dashboard/DashboardPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import type { WorkflowEvent } from '@/types/platform';

type Task = { id: string; title: string; description: string | null; status: string; priority: string; due_at: string | null; created_at: string };
type Reminder = { id: string; title: string; body: string | null; status: string; remind_at: string; delivery_channel: string; created_at: string };
type Detail = { type: 'task'; value: Task } | { type: 'reminder'; value: Reminder } | { type: 'event'; value: WorkflowEvent };
type Tab = 'tasks' | 'reminders' | 'events';

const pageSize = 16;
const realtimeTables = ['tasks', 'reminders', 'workflow_events'] as const;

export default function OperationsPage() {
  const { user } = useAuth();
  const { organization, role } = useWorkspace();
  const online = useOnlineStatus();
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const cursors = useRef<Record<Tab, string | null>>({ tasks: null, reminders: null, events: null });
  const [hasMore, setHasMore] = useState<Record<Tab, boolean>>({ tasks: false, reminders: false, events: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (reset = true) => {
    if (!organization) return;
    reset ? setLoading(true) : setLoadingMore(true);
    setError('');
    const taskQuery = supabase.from('tasks').select('id,title,description,status,priority,due_at,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(pageSize);
    const reminderQuery = supabase.from('reminders').select('id,title,body,status,remind_at,delivery_channel,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(pageSize);
    const eventQuery = supabase.from('workflow_events').select('id,event_type,status,summary,workflow_name,created_at').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(pageSize);
    if (!reset) {
      if (cursors.current.tasks) taskQuery.lt('created_at', cursors.current.tasks);
      if (cursors.current.reminders) reminderQuery.lt('created_at', cursors.current.reminders);
      if (cursors.current.events) eventQuery.lt('created_at', cursors.current.events);
    }
    const [taskResult, reminderResult, eventResult] = await Promise.all([taskQuery, reminderQuery, eventQuery]);
    const firstError = taskResult.error || reminderResult.error || eventResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      const nextTasks = (taskResult.data ?? []) as Task[];
      const nextReminders = (reminderResult.data ?? []) as Reminder[];
      const nextEvents = (eventResult.data ?? []) as WorkflowEvent[];
      setTasks((current) => reset ? nextTasks : [...current, ...nextTasks]);
      setReminders((current) => reset ? nextReminders : [...current, ...nextReminders]);
      setEvents((current) => reset ? nextEvents : [...current, ...nextEvents]);
      cursors.current = { tasks: nextTasks.at(-1)?.created_at ?? null, reminders: nextReminders.at(-1)?.created_at ?? null, events: nextEvents.at(-1)?.created_at ?? null };
      setHasMore({ tasks: nextTasks.length === pageSize, reminders: nextReminders.length === pageSize, events: nextEvents.length === pageSize });
    }
    setLoading(false);
    setLoadingMore(false);
  }, [organization]);

  useEffect(() => { void load(true); }, [load]);
  const refresh = useCallback(() => load(true), [load]);
  const realtimeMode = useRealtimeRefresh({ organizationId: organization?.id, tables: realtimeTables, onRefresh: refresh });
  const canMutate = online && role !== 'viewer';

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (tab === 'tasks') return tasks.filter((item) => (status === 'all' || item.status === status) && (!needle || `${item.title} ${item.description ?? ''}`.toLowerCase().includes(needle)));
    if (tab === 'reminders') return reminders.filter((item) => (status === 'all' || item.status === status) && (!needle || `${item.title} ${item.body ?? ''}`.toLowerCase().includes(needle)));
    return events.filter((item) => (status === 'all' || item.status === status) && (!needle || `${item.event_type} ${item.summary ?? ''} ${item.workflow_name}`.toLowerCase().includes(needle)));
  }, [events, reminders, search, status, tab, tasks]);

  const changeTaskStatus = async (task: Task, nextStatus: 'done' | 'cancelled') => {
    if (!organization || !canMutate) return;
    const { error: updateError } = await supabase.from('tasks').update({ status: nextStatus }).eq('organization_id', organization.id).eq('id', task.id);
    if (updateError) setError(updateError.message); else { setDetail(null); await load(true); }
  };

  return (
    <DashboardPage>
      <PageHeader
        eyebrow="Source of truth"
        title="Operations"
        description="Search, inspect, create, complete, and cancel tenant-scoped tasks and reminders. Every workflow event remains immutable."
        actions={<><StatePill label={realtimeMode} tone={realtimeMode === 'live' ? 'success' : 'warning'} /><button type="button" onClick={() => void load(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/45" aria-label="Refresh operations"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button><button type="button" onClick={() => setCreating(true)} disabled={!canMutate} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-30"><Plus size={15} />New task</button></>}
      />

      {!online && <StatusBanner tone="offline">Offline mode is read-only. Reconnect to create or change work.</StatusBanner>}
      {error && <StatusBanner onRetry={() => void load(true)}>{error}</StatusBanner>}

      <Surface>
        <div className="grid gap-3 border-b border-white/8 p-4 lg:grid-cols-[auto_1fr_190px]">
          <div role="tablist" aria-label="Operation types" className="flex rounded-xl border border-white/9 p-1">{(['tasks', 'reminders', 'events'] as Tab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setStatus('all'); }} className={`rounded-lg px-3 py-2 text-xs capitalize ${tab === item ? 'bg-white text-black' : 'text-white/38 hover:text-white'}`}>{item}</button>)}</div>
          <label className="flex items-center gap-2 rounded-xl border border-white/9 bg-black/20 px-3"><Search size={14} className="text-white/25" /><span className="sr-only">Search {tab}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab}`} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/20" /></label>
          <label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border border-white/9 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white/58"><option value="all">All statuses</option>{statusOptions(tab).map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        </div>

        {loading ? <SkeletonRows count={7} /> : filtered.length ? <div className="divide-y divide-white/7">{filtered.map((item) => {
          if (tab === 'tasks') return <TaskRow key={(item as Task).id} task={item as Task} onOpen={() => setDetail({ type: 'task', value: item as Task })} />;
          if (tab === 'reminders') return <ReminderRow key={(item as Reminder).id} reminder={item as Reminder} onOpen={() => setDetail({ type: 'reminder', value: item as Reminder })} />;
          return <EventRow key={(item as WorkflowEvent).id} event={item as WorkflowEvent} onOpen={() => setDetail({ type: 'event', value: item as WorkflowEvent })} />;
        })}</div> : <EmptyState title={`No matching ${tab}`} description={search || status !== 'all' ? 'Clear the search or status filter to see more records.' : tab === 'tasks' ? 'Ask Pandora to create a task, or add one manually.' : `New ${tab} will appear here automatically.`} action={tab === 'tasks' && canMutate ? <button type="button" onClick={() => setCreating(true)} className="rounded-xl border border-white/12 px-4 py-2 text-xs text-white/65">Create the first task</button> : undefined} />}

        {hasMore[tab] && !search && status === 'all' && <div className="border-t border-white/8 p-4 text-center"><button type="button" onClick={() => void load(false)} disabled={loadingMore} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-white/48 disabled:opacity-30">{loadingMore ? 'Loading…' : 'Load older records'}</button></div>}
      </Surface>

      {creating && <TaskComposer busy={saving} onClose={() => setCreating(false)} onSubmit={async (values) => {
        if (!organization || !user) return;
        setSaving(true);
        const { error: insertError } = await supabase.from('tasks').insert({ organization_id: organization.id, created_by: user.id, title: values.title, description: values.description || null, priority: values.priority, due_at: values.dueAt || null, source_channel: 'web' });
        setSaving(false);
        if (insertError) setError(insertError.message); else { setCreating(false); await load(true); }
      }} />}

      {detail && <DetailDrawer detail={detail} canMutate={canMutate} onClose={() => setDetail(null)} onTaskStatus={changeTaskStatus} />}
    </DashboardPage>
  );
}

function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="grid w-full gap-3 px-5 py-4 text-left hover:bg-white/3 sm:grid-cols-[24px_1fr_auto_18px] sm:items-center">{task.status === 'done' ? <CheckCircle2 size={17} className="text-emerald-300" /> : <Circle size={17} className="text-white/25" />}<div><p className="text-sm text-white/68">{task.title}</p><p className="mt-1 text-xs text-white/26">{task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : 'No due date'}</p></div><div className="flex gap-2"><StatePill label={task.priority} tone={task.priority === 'urgent' ? 'error' : task.priority === 'high' ? 'warning' : 'neutral'} /><StatePill label={task.status} tone={task.status === 'done' ? 'success' : 'info'} /></div><ChevronRight size={14} className="text-white/20" /></button>;
}

function ReminderRow({ reminder, onOpen }: { reminder: Reminder; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="grid w-full gap-3 px-5 py-4 text-left hover:bg-white/3 sm:grid-cols-[24px_1fr_auto_18px] sm:items-center"><CalendarClock size={17} className="text-white/30" /><div><p className="text-sm text-white/68">{reminder.title}</p><p className="mt-1 text-xs text-white/26">{new Date(reminder.remind_at).toLocaleString()}</p></div><div className="flex gap-2"><StatePill label={reminder.delivery_channel} /><StatePill label={reminder.status} tone={reminder.status === 'sent' ? 'success' : reminder.status === 'failed' ? 'error' : 'info'} /></div><ChevronRight size={14} className="text-white/20" /></button>;
}

function EventRow({ event, onOpen }: { event: WorkflowEvent; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="grid w-full gap-3 px-5 py-4 text-left hover:bg-white/3 sm:grid-cols-[24px_1fr_auto_18px] sm:items-center"><span className={`h-2 w-2 rounded-full ${event.status === 'error' ? 'bg-red-300' : event.status === 'warning' ? 'bg-amber-300' : 'bg-emerald-300'}`} /><div><p className="text-sm text-white/68">{event.summary || event.event_type}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/24">{event.workflow_name}</p></div><time className="text-xs text-white/26">{new Date(event.created_at).toLocaleString()}</time><ChevronRight size={14} className="text-white/20" /></button>;
}

function TaskComposer({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (values: { title: string; description: string; priority: string; dueAt: string }) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueAt, setDueAt] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (title.trim()) void onSubmit({ title: title.trim(), description: description.trim(), priority, dueAt: dueAt ? new Date(dueAt).toISOString() : '' }); };
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/78 p-4" role="dialog" aria-modal="true" aria-labelledby="task-composer-title"><form onSubmit={submit} className="w-full max-w-lg rounded-[20px] border border-white/12 bg-[#0b0b0b] p-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/28">Manual operation</p><h2 id="task-composer-title" className="mt-1 text-xl font-medium">Create task</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Close task composer"><X size={16} /></button></div><div className="mt-6 space-y-4"><Field label="Title"><input autoFocus required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} className="field-control" /></Field><Field label="Description"><textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="field-control resize-none" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value)} className="field-control"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field><Field label="Due date"><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="field-control" /></Field></div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/48">Cancel</button><button disabled={busy || !title.trim()} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-30">{busy ? 'Creating…' : 'Create task'}</button></div></form></div>;
}

function DetailDrawer({ detail, canMutate, onClose, onTaskStatus }: { detail: Detail; canMutate: boolean; onClose: () => void; onTaskStatus: (task: Task, status: 'done' | 'cancelled') => Promise<void> }) {
  const title = detail.type === 'event' ? detail.value.summary || detail.value.event_type : detail.value.title;
  return <div className="fixed inset-0 z-[65] bg-black/65" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside role="dialog" aria-modal="true" aria-labelledby="operation-detail-title" className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#090909] p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/28">{detail.type} detail</p><h2 id="operation-detail-title" className="mt-2 text-xl font-medium">{title}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Close detail"><X size={16} /></button></div><div className="mt-7 space-y-4 rounded-[16px] border border-white/8 p-4">{Object.entries(detail.value).filter(([key]) => !['id', 'title', 'summary'].includes(key)).map(([key, value]) => <div key={key} className="grid gap-1 border-b border-white/6 pb-3 last:border-0 last:pb-0"><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/25">{key.replaceAll('_', ' ')}</span><span className="break-words text-sm text-white/58">{value === null ? 'Not set' : String(value)}</span></div>)}</div>{detail.type === 'task' && !['done', 'cancelled'].includes(detail.value.status) && <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={!canMutate} onClick={() => void onTaskStatus(detail.value, 'cancelled')} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/48 disabled:opacity-30">Cancel task</button><button type="button" disabled={!canMutate} onClick={() => void onTaskStatus(detail.value, 'done')} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-30">Mark complete</button></div>}</aside></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-xs text-white/38">{label}</span>{children}</label>; }

function statusOptions(tab: Tab) {
  if (tab === 'tasks') return ['open', 'in_progress', 'blocked', 'done', 'cancelled'];
  if (tab === 'reminders') return ['scheduled', 'processing', 'sent', 'cancelled', 'failed'];
  return ['info', 'success', 'warning', 'error'];
}
