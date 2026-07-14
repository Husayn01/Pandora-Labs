import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Check,
  FileText,
  Headphones,
  Mail,
  Menu,
  Phone,
  Receipt,
  ShieldCheck,
  X,
} from 'lucide-react';
import { OperationsConsole } from '@/components/landing/OperationsConsole';
import { OperationWalkthrough } from '@/components/landing/OperationWalkthrough';
import { PricingSection } from '@/components/landing/PricingSection';
import { PlaceholderLogo } from '@/components/ui';

const problems = [
  {
    index: '01',
    icon: Phone,
    title: 'Calls are where opportunities disappear',
    copy: 'Customers call while you are busy, follow-ups get delayed, and important details are left in someone’s memory.',
    tone: 'blue',
  },
  {
    index: '02',
    icon: Mail,
    title: 'Your inbox has become an operating system',
    copy: 'Bookings, requests, receipts, reminders, and decisions are scattered across threads that no one has time to organize.',
    tone: 'amber',
  },
  {
    index: '03',
    icon: Receipt,
    title: 'The work after the conversation is still manual',
    copy: 'Meetings, payment reminders, invoice drafts, and reporting all need another person to push them forward.',
    tone: 'green',
  },
];

const capabilities = [
  { icon: Mail, title: 'Email operations', copy: 'Find messages, prepare replies, and send only after the exact recipient and content are confirmed.' },
  { icon: CalendarCheck2, title: 'Scheduling', copy: 'Collect attendee emails, timezone, duration, meeting mode, and conflict policy before creating an event.' },
  { icon: Phone, title: 'Phone access', copy: 'Reach Pandora from an ordinary telephone without mobile data. Pandora itself remains securely cloud-powered.' },
  { icon: Receipt, title: 'Invoices and reports', copy: 'Draft invoices, payment reminders, and operational summaries without silently moving money.' },
  { icon: FileText, title: 'Business knowledge', copy: 'Answer public and operator questions from a tenant-isolated, citation-bearing knowledge base.' },
  { icon: ShieldCheck, title: 'Human control', copy: 'Every risky action is previewed, confirmed, permission-checked, and written to an audit trail.' },
];

const safeguards = [
  'Tenant credentials stay encrypted in Supabase Vault and never enter a prompt.',
  'Public callers can ask questions and request bookings, but cannot access private operations.',
  'Email sends and calendar writes require an exact preview and explicit confirmation.',
  'Call audio is off by default; redacted transcripts expire after 30 days.',
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#050505]/95">
        <nav aria-label="Primary navigation" className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 md:px-8 xl:px-12">
          <Link to="/" className="flex items-center gap-3" aria-label="Pandora Labs home">
            <PlaceholderLogo size={34} />
            <span className="text-sm font-semibold tracking-[-0.02em]">Pandora <span className="text-white/45">Labs</span></span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-white/55 md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#capabilities" className="transition-colors hover:text-white">Capabilities</a>
            <a href="#trust" className="transition-colors hover:text-white">Trust</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login" className="px-3 py-2 text-sm text-white/60 transition-colors hover:text-white">Sign in</Link>
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5">
              Start free <ArrowRight size={15} />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 md:hidden"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </nav>
        {menuOpen && (
          <div className="border-t border-white/10 bg-[#080808] px-5 py-5 md:hidden">
            <div className="space-y-1">
              {[
                ['How it works', '#how-it-works'],
                ['Capabilities', '#capabilities'],
                ['Trust', '#trust'],
                ['Pricing', '#pricing'],
              ].map(([label, href]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block rounded-xl px-3 py-3 text-sm text-white/70 hover:bg-white/5 hover:text-white">{label}</a>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
              <Link to="/login" className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm">Sign in</Link>
              <Link to="/signup" className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-black">Start free</Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="border-b border-white/10 pt-[72px]">
          <div className="mx-auto grid min-h-[760px] max-w-[1440px] lg:grid-cols-[0.88fr_1.12fr]">
            <div className="flex items-center border-white/10 px-5 py-20 md:px-8 lg:border-r lg:px-12 xl:px-16">
              <motion.div
                className="max-w-[680px]"
                initial={reduceMotion ? false : { opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-white/55">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Voice-first business operations
                </div>
                <h1 className="mt-7 max-w-[760px] text-[clamp(4rem,8vw,8.5rem)] font-medium leading-[0.83] tracking-[-0.075em]">
                  Run the work.<br /><span className="text-white/38">Just say it.</span>
                </h1>
                <p className="mt-8 max-w-[600px] text-base leading-7 text-white/55 md:text-lg">
                  Pandora handles email, schedules meetings, follows up, drafts invoices, and keeps an audit trail—from the web or an ordinary phone.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5">
                    Start free <ArrowRight size={16} />
                  </Link>
                  <a href="#how-it-works" className="inline-flex items-center gap-2 rounded-xl border border-white/14 px-6 py-3.5 text-sm text-white/85 transition-colors hover:border-white/30 hover:bg-white/5">
                    <Headphones size={16} /> Hear Pandora work
                  </a>
                </div>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/35">
                  <span>No card required</span>
                  <span>15 web-voice minutes</span>
                  <span>Human approval built in</span>
                </div>
              </motion.div>
            </div>
            <motion.div
              className="flex items-center bg-[#080808] px-5 py-12 md:px-8 lg:px-10 xl:px-14"
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.75, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <OperationsConsole />
            </motion.div>
          </div>
        </section>

        <section aria-label="Available channels" className="border-b border-white/10 bg-[#080808]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 xl:px-12">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">One agent, every conversation</p>
            <div className="flex flex-wrap gap-2">
              <ChannelBadge label="Web" state="Live" tone="green" />
              <ChannelBadge label="Telephone" state="Live" tone="blue" />
              <ChannelBadge label="SMS" state="Next" tone="neutral" />
              <ChannelBadge label="WhatsApp" state="After onboarding" tone="neutral" />
              <ChannelBadge label="Telegram" state="After onboarding" tone="neutral" />
            </div>
          </div>
        </section>

        <section className="bg-[#ededeb] text-[#111214]">
          <div className="mx-auto max-w-[1180px] px-5 py-24 md:px-8 md:py-32">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/45">The operational gap</p>
            <h2 className="mt-5 max-w-[920px] text-4xl font-semibold leading-[1.02] tracking-[-0.055em] md:text-6xl">
              Your business does not need another chatbot. It needs the follow-through.
            </h2>
            <div className="mt-14 grid overflow-hidden rounded-[22px] border border-black/12 md:grid-cols-3">
              {problems.map((problem, index) => (
                <motion.article
                  key={problem.index}
                  whileHover={reduceMotion ? undefined : { y: -6 }}
                  transition={{ duration: 0.22 }}
                  className={`min-h-[390px] bg-white p-6 md:p-7 ${index > 0 ? 'border-t border-black/12 md:border-l md:border-t-0' : ''}`}
                >
                  <div className={`problem-visual problem-visual-${problem.tone}`}>
                    <problem.icon size={23} />
                    <div>
                      <span className="block text-[9px] uppercase tracking-[0.18em] opacity-55">Open item</span>
                      <span className="mt-1 block text-sm font-medium">{problem.title.split(' ').slice(0, 3).join(' ')}</span>
                    </div>
                  </div>
                  <p className="mt-8 font-mono text-xs text-black/40">{problem.index}</p>
                  <h3 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.035em]">{problem.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-black/58">{problem.copy}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-white/10 bg-[#080808]">
          <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-8 md:py-32 xl:px-12">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="eyebrow">A safer operating loop</p>
                <h2 className="section-title max-w-xl">Useful because it knows when to stop.</h2>
              </div>
              <p className="max-w-xl text-base leading-7 text-white/48 lg:justify-self-end">
                Pandora collects the missing details, shows the exact action, and waits for the right level of confirmation before anything leaves your business.
              </p>
            </div>
            <OperationWalkthrough />
          </div>
        </section>

        <section id="capabilities" className="border-b border-white/10 bg-[#050505]">
          <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-8 md:py-32 xl:px-12">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="eyebrow">The work around the work</p>
                <h2 className="section-title max-w-3xl">One conversation can move the whole operation forward.</h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-white/45 lg:justify-self-end">
                ElevenLabs carries the conversation. n8n coordinates the operation. Supabase protects the durable record.
              </p>
            </div>
            <div className="mt-14 grid overflow-hidden rounded-[22px] border border-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item, index) => (
                <motion.article
                  key={item.title}
                  whileHover={reduceMotion ? undefined : { backgroundColor: '#0d0d0d' }}
                  transition={{ duration: 0.2 }}
                  className={`min-h-[260px] bg-[#080808] p-7 ${index % 3 !== 0 ? 'lg:border-l lg:border-white/10' : ''} ${index > 2 ? 'border-t border-white/10' : index > 1 ? 'sm:border-t sm:border-white/10 lg:border-t-0' : index > 0 ? 'sm:border-l sm:border-white/10 lg:border-l-0' : ''}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/65"><item.icon size={18} /></div>
                  <h3 className="mt-12 text-xl font-medium tracking-[-0.03em]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/42">{item.copy}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-[#080808]">
          <div className="mx-auto grid max-w-[1440px] lg:grid-cols-2">
            <div className="border-white/10 px-5 py-20 md:px-8 lg:border-r lg:px-12 xl:px-16">
              <p className="eyebrow">Phone accessible</p>
              <h2 className="section-title max-w-xl">No app. No mobile data. Just a call.</h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/48">
                A customer or verified operator can reach Pandora from an ordinary telephone. The experience works without mobile data on the caller’s device; Pandora remains cloud-powered and securely connected to approved business systems.
              </p>
              <div className="mt-9 space-y-3">
                {['Public Q&A and booking without exposing private operations', 'Verified operator access through web onboarding and OTP', 'A full dashboard record after the call ends'].map((item) => (
                  <p key={item} className="flex gap-3 text-sm text-white/62"><BadgeCheck size={17} className="mt-0.5 shrink-0 text-blue-300" />{item}</p>
                ))}
              </div>
            </div>
            <div className="relative min-h-[520px] overflow-hidden">
              <img
                src="/images/pandora-founder-editorial.png"
                alt="Nigerian business owner using Pandora after hours"
                width={972}
                height={1619}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-[58%_30%]"
              />
              <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/15 bg-[#080808]/95 p-5 md:inset-x-8 md:bottom-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Inbound call</p>
                    <p className="mt-2 text-sm">“Remind the team about tomorrow’s site visit.”</p>
                  </div>
                  <span className="rounded-full bg-blue-400/12 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-blue-200">Phone</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="border-b border-white/10 bg-[#050505]">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-24 md:px-8 md:py-32 lg:grid-cols-[0.82fr_1.18fr] xl:px-12">
            <div>
              <p className="eyebrow">Trust by architecture</p>
              <h2 className="section-title max-w-lg">Helpful without being reckless.</h2>
              <p className="mt-6 max-w-md text-sm leading-6 text-white/45">Security is visible in the product: who asked, what Pandora understood, what changed, who approved it, and what the provider returned.</p>
            </div>
            <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#080808]">
              {safeguards.map((item, index) => (
                <div key={item} className={`grid grid-cols-[44px_1fr] gap-4 p-5 md:p-6 ${index > 0 ? 'border-t border-white/10' : ''}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-white/12 text-white/70"><Check size={14} /></span>
                  <p className="self-center text-sm leading-6 text-white/62">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <PricingSection />

        <section className="bg-[#050505] px-5 py-24 text-center md:px-8 md:py-36">
          <p className="eyebrow">Pandora Labs</p>
          <h2 className="mx-auto max-w-4xl text-5xl font-medium leading-[0.96] tracking-[-0.06em] md:text-7xl">Give your business a voice people can reach.</h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/45">Start on the web, connect Google Workspace securely, and add phone access when your team is ready.</p>
          <Link to="/signup" className="mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5">
            Create your free workspace <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#080808]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8 xl:px-12">
          <div className="flex items-center gap-3"><PlaceholderLogo size={28} /><span className="text-sm font-medium">Pandora Labs</span></div>
          <p className="text-xs text-white/32">Cloud-powered voice operations for accessible Nigerian business.</p>
          <div className="flex gap-5 text-xs text-white/42"><a href="mailto:hello@pandoralabs.ai" className="hover:text-white">Contact</a><Link to="/login" className="hover:text-white">Sign in</Link></div>
        </div>
      </footer>
    </div>
  );
}

function ChannelBadge({ label, state, tone }: { label: string; state: string; tone: 'green' | 'blue' | 'neutral' }) {
  const toneClass = tone === 'green' ? 'text-emerald-300' : tone === 'blue' ? 'text-blue-300' : 'text-white/35';
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]"><span className={toneClass}>{label}</span><span className="text-white/25">{state}</span></span>;
}
