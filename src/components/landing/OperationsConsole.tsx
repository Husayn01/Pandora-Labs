import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarDays, Check, Circle, Clock3, Mail, Phone, ShieldCheck } from 'lucide-react';

const stages = [
  { label: 'Call received', status: 'Connected', tone: 'blue' },
  { label: 'Details captured', status: '4 of 6', tone: 'blue' },
  { label: 'Clarification', status: 'Waiting', tone: 'amber' },
  { label: 'Exact preview', status: 'Ready', tone: 'amber' },
  { label: 'Audit event', status: 'Recorded', tone: 'green' },
];

export function OperationsConsole() {
  const [stage, setStage] = useState(2);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setStage((value) => (value + 1) % stages.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  return (
    <div
      className="w-full overflow-hidden rounded-[22px] border border-white/12 bg-[#0b0b0b] shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex gap-1.5" aria-hidden="true"><span className="h-2 w-2 rounded-full bg-red-400/75" /><span className="h-2 w-2 rounded-full bg-amber-300/75" /><span className="h-2 w-2 rounded-full bg-emerald-400/75" /></div>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/28">workspace.live</span>
      </div>
      <div className="border-b border-white/10 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-blue-300/20 bg-blue-300/10 text-blue-200"><Phone size={17} /></span>
            <div><p className="text-sm font-medium">Incoming customer call</p><p className="mt-1 text-xs text-white/35">Business line • 02:14</p></div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-3 py-1.5 text-[9px] uppercase tracking-[0.17em] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Live</span>
        </div>
      </div>
      <div className="grid min-h-[430px] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="border-white/10 p-5 lg:border-r">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/28">Conversation</p>
          <div className="mt-5 space-y-3">
            <Transcript speaker="Caller" text="Schedule a Google Meet with Amina next Tuesday afternoon." />
            <Transcript speaker="Pandora" text="What email address should I invite, and should I use 2:00 PM Africa/Lagos?" agent />
            <div className={stage >= 3 ? 'visible opacity-100 transition-opacity' : 'invisible opacity-0'} aria-hidden={stage < 3}>
              <Transcript speaker="Caller" text="amina@acme.ng. Yes, make it 30 minutes." />
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-amber-300/16 bg-amber-300/6 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-100"><ShieldCheck size={14} />Confirmation required</div>
            <p className="mt-2 text-xs leading-5 text-white/42">No event exists until the owner confirms the complete preview.</p>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between"><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/28">Action plan</p><span className="text-[10px] text-white/28">{stage + 1}/5</span></div>
          <div className="mt-4 space-y-2">
            {stages.map((item, index) => {
              const complete = index < stage;
              const active = index === stage;
              return (
                <motion.div layout key={item.label} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${active ? 'border-white/18 bg-white/5' : 'border-white/6'}`}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${complete ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-200' : active ? 'border-amber-300/30 text-amber-200' : 'border-white/10 text-white/20'}`}>{complete ? <Check size={11} /> : <Circle size={8} />}</span>
                  <span className="min-w-0 flex-1 text-xs text-white/65">{item.label}</span>
                  <span className={`text-[9px] uppercase tracking-[0.12em] ${item.tone === 'green' ? 'text-emerald-300' : item.tone === 'amber' ? 'text-amber-200' : 'text-blue-200'}`}>{item.status}</span>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-white/35">
            <span className="flex items-center gap-2 rounded-lg border border-white/6 px-3 py-2"><Mail size={12} />amina@acme.ng</span>
            <span className="flex items-center gap-2 rounded-lg border border-white/6 px-3 py-2"><CalendarDays size={12} />Tuesday</span>
            <span className="flex items-center gap-2 rounded-lg border border-white/6 px-3 py-2"><Clock3 size={12} />14:00 WAT</span>
            <span className="flex items-center gap-2 rounded-lg border border-white/6 px-3 py-2">30 minutes</span>
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setStage((value) => (value + 1) % stages.length)} className="flex w-full items-center justify-between border-t border-white/10 px-5 py-4 text-left text-xs text-white/55 transition-colors hover:bg-white/4 hover:text-white">
        Advance example <ArrowRight size={14} />
      </button>
    </div>
  );
}

function Transcript({ speaker, text, agent = false }: { speaker: string; text: string; agent?: boolean }) {
  return <div className={`rounded-xl border p-3.5 ${agent ? 'border-white/8 bg-white/4' : 'ml-7 border-blue-300/12 bg-blue-300/6'}`}><p className="text-[9px] uppercase tracking-[0.14em] text-white/28">{speaker}</p><p className="mt-2 text-xs leading-5 text-white/62">{text}</p></div>;
}
