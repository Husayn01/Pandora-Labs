import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Clock3, FileCheck2, Mail, ShieldCheck } from 'lucide-react';

const steps = [
  { id: 'ask', label: 'Ask', eyebrow: 'Natural request', title: 'Say what needs to happen.', copy: 'Use the web or an ordinary phone. Pandora accepts the request in the language your team already uses.', details: ['Channel and caller context attached', 'Correlation ID created', 'No tenant identity accepted from the prompt'] },
  { id: 'clarify', label: 'Clarify', eyebrow: 'Required details', title: 'Missing information becomes one useful question.', copy: 'Pandora checks the operation schema and asks only for details that are necessary to perform the action safely.', details: ['Email address spelled back', 'Africa/Lagos resolved from workspace settings', 'Conflict policy requested before calendar write'] },
  { id: 'confirm', label: 'Confirm', eyebrow: 'Exact preview', title: 'See precisely what will change.', copy: 'The preview is bound to a payload fingerprint. Confirmation cannot silently authorize a different recipient, time, or action.', details: ['Recipient: amina@acme.ng', 'Tuesday, 2:00 PM WAT for 30 minutes', 'Google Meet • fail on conflict'] },
  { id: 'execute', label: 'Execute', eyebrow: 'Permissioned action', title: 'Pandora acts once—and only once.', copy: 'The shared n8n workflow claims an idempotency key, uses the tenant connector broker, and never receives the customer’s OAuth token.', details: ['Approval and role checked', 'Provider timeout bounded', 'Uncertain result sent to reconciliation'] },
  { id: 'audit', label: 'Audit', eyebrow: 'Durable evidence', title: 'The dashboard keeps the complete operational record.', copy: 'A redacted event records who requested the action, what was approved, what the provider returned, and how long it took.', details: ['Action ID and correlation ID', 'Redacted provider response', 'Searchable in Operations and Reports'] },
];

export function OperationWalkthrough() {
  const [activeId, setActiveId] = useState('clarify');
  const reduceMotion = useReducedMotion();
  const active = steps.find((step) => step.id === activeId) ?? steps[0];

  return (
    <div className="mt-14 overflow-hidden rounded-[22px] border border-white/10 bg-[#0b0b0b]">
      <div role="tablist" aria-label="Operation walkthrough" className="grid grid-cols-5 border-b border-white/10">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={active.id === step.id}
            aria-controls="operation-walkthrough-panel"
            onClick={() => setActiveId(step.id)}
            className={`border-white/10 px-2 py-4 text-center text-[10px] uppercase tracking-[0.12em] transition-colors sm:px-4 sm:text-xs ${index > 0 ? 'border-l' : ''} ${active.id === step.id ? 'bg-white text-black' : 'text-white/38 hover:bg-white/5 hover:text-white'}`}
          >
            <span className="hidden sm:inline">0{index + 1} </span>{step.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={active.id}
        id="operation-walkthrough-panel"
        role="tabpanel"
        tabIndex={0}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
        className="grid lg:grid-cols-[0.82fr_1.18fr]"
      >
        <div className="border-white/10 p-6 md:p-8 lg:border-r lg:p-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">{active.eyebrow}</p>
          <h3 className="mt-5 max-w-lg text-3xl font-medium leading-tight tracking-[-0.045em] md:text-4xl">{active.title}</h3>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/45">{active.copy}</p>
          <LinkLike label="Explore the control model" />
        </div>
        <div className="bg-[#080808] p-5 md:p-8 lg:p-10">
          <div className="rounded-2xl border border-white/10 bg-[#0c0c0c]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 text-xs text-white/65"><ShieldCheck size={15} />{active.label} checkpoint</div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/35">Controlled</span>
            </div>
            <div className="space-y-3 p-5">
              {active.details.map((detail, index) => (
                <div key={detail} className="flex items-center gap-3 rounded-xl border border-white/7 px-4 py-3.5">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-300/10 text-emerald-200"><Check size={12} /></span>
                  <span className="flex-1 text-xs leading-5 text-white/58">{detail}</span>
                  {index === 0 ? <Mail size={13} className="text-white/25" /> : index === 1 ? <Clock3 size={13} className="text-white/25" /> : <FileCheck2 size={13} className="text-white/25" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LinkLike({ label }: { label: string }) {
  return <a href="#trust" className="mt-8 inline-flex items-center gap-2 text-xs font-medium text-white/62 hover:text-white">{label}<ArrowRight size={13} /></a>;
}
