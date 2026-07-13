import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Circle, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';
import type { WorkflowEvent } from '@/types/platform';

type Task = { id:string; title:string; status:string; priority:string; due_at:string|null };
type Reminder = { id:string; title:string; status:string; remind_at:string; delivery_channel:string };

export default function OperationsPage() {
  const { organization } = useWorkspace();
  const [tasks,setTasks]=useState<Task[]>([]); const [reminders,setReminders]=useState<Reminder[]>([]); const [events,setEvents]=useState<WorkflowEvent[]>([]); const [loading,setLoading]=useState(false);
  const load=useCallback(async()=>{ if(!organization)return; setLoading(true); const [a,b,c]=await Promise.all([
    supabase.from('tasks').select('id,title,status,priority,due_at').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(20),
    supabase.from('reminders').select('id,title,status,remind_at,delivery_channel').eq('organization_id',organization.id).order('remind_at',{ascending:true}).limit(20),
    supabase.from('workflow_events').select('id,event_type,status,summary,workflow_name,created_at').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(30),
  ]); setTasks((a.data??[]) as Task[]); setReminders((b.data??[]) as Reminder[]); setEvents((c.data??[]) as WorkflowEvent[]); setLoading(false); },[organization]);
  useEffect(()=>{void load();},[load]);
  return <div className="p-5 md:p-8 max-w-7xl mx-auto space-y-6"><header className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-[.2em] text-gray-500">Source of truth</p><h1 className="text-3xl text-white mt-2">Operations</h1><p className="text-sm text-gray-500 mt-2">Tasks, reminders and workflow events from Supabase.</p></div><button onClick={()=>void load()} className="p-3 rounded-full border border-white/10 text-gray-400 hover:text-white" aria-label="Refresh"><RefreshCw size={16} className={loading?'animate-spin':''}/></button></header>
  <div className="grid lg:grid-cols-2 gap-5"><GlassCard hover={false} className="p-6"><h2 className="text-lg text-white mb-4">Tasks</h2><div className="space-y-2">{tasks.length?tasks.map(t=><div key={t.id} className="rounded-2xl border border-white/7 p-4 flex gap-3">{t.status==='done'?<CheckCircle2 size={17} className="text-emerald-400"/>:<Circle size={17} className="text-gray-500"/>}<div><p className="text-sm text-gray-200">{t.title}</p><p className="text-xs text-gray-600 mt-1">{t.priority} priority{t.due_at?` · due ${new Date(t.due_at).toLocaleString()}`:''}</p></div></div>):<Empty label="No tasks yet. Ask Pandora to create one."/>}</div></GlassCard>
  <GlassCard hover={false} className="p-6"><h2 className="text-lg text-white mb-4">Reminders</h2><div className="space-y-2">{reminders.length?reminders.map(r=><div key={r.id} className="rounded-2xl border border-white/7 p-4 flex gap-3"><CalendarClock size={17} className="text-gray-400"/><div><p className="text-sm text-gray-200">{r.title}</p><p className="text-xs text-gray-600 mt-1">{new Date(r.remind_at).toLocaleString()} · {r.delivery_channel}</p></div></div>):<Empty label="No reminders scheduled."/>}</div></GlassCard></div>
  <GlassCard hover={false} className="p-6"><h2 className="text-lg text-white mb-4">Audit trail</h2><div className="divide-y divide-white/5">{events.length?events.map(e=><div key={e.id} className="py-4 grid md:grid-cols-[140px_1fr_180px] gap-2 text-sm"><span className="text-gray-500">{e.event_type}</span><span className="text-gray-200">{e.summary||'Operation recorded'}</span><span className="text-xs text-gray-600 md:text-right">{new Date(e.created_at).toLocaleString()}</span></div>):<Empty label="Workflow events will appear after Pandora runs."/>}</div></GlassCard></div>;
}
function Empty({label}:{label:string}){return <p className="py-8 text-center text-sm text-gray-600">{label}</p>}
