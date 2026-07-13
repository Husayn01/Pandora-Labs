import { useEffect, useState } from 'react';
import { BarChart3, CalendarCheck2, MailCheck, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';

export default function InsightsPage(){
 const {organization}=useWorkspace(); const [counts,setCounts]=useState<Record<string,number>>({});
 useEffect(()=>{if(!organization)return;void supabase.from('workflow_events').select('event_type').eq('organization_id',organization.id).then(({data})=>{const next:Record<string,number>={};for(const row of data??[])next[row.event_type]=(next[row.event_type]??0)+1;setCounts(next)})},[organization]);
 const metrics:Array<[number,string,LucideIcon]>=[[counts.email_sent??0,'Emails sent',MailCheck],[counts.calendar_created??0,'Meetings scheduled',CalendarCheck2],[counts.approval_completed??0,'Approved actions',ShieldCheck],[Object.values(counts).reduce((a,b)=>a+b,0),'Audited operations',BarChart3]];
 return <div className="p-5 md:p-8 max-w-6xl mx-auto"><header className="mb-7"><p className="text-xs uppercase tracking-[.2em] text-gray-500">Evidence, not estimates</p><h1 className="text-3xl text-white mt-2">Reports</h1><p className="text-sm text-gray-500 mt-2">Metrics are calculated from verified workflow events—no fabricated efficiency scores.</p></header><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{metrics.map(([value,label,Icon])=><GlassCard key={label} hover={false} className="p-5"><Icon size={18} className="text-gray-400"/><p className="text-3xl text-white mt-5">{value}</p><p className="text-xs text-gray-500 mt-2">{label}</p></GlassCard>)}</div><GlassCard hover={false} className="p-8 mt-5"><h2 className="text-xl text-white">Weekly operating report</h2><p className="text-sm text-gray-500 mt-2 max-w-2xl">Once enough audited events exist, Pandora will summarize appointments, communication, outstanding tasks, invoice drafts and exceptions here. Reports never claim savings that cannot be traced to an event definition.</p></GlassCard></div>
}
