import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Ellipsis,
  Home,
  LogOut,
  MessageSquare,
  PlugZap,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/hooks/useWorkspace';
import { PlaceholderLogo } from '@/components/ui';

const navItems = [
  { icon: Home, label: 'Overview', path: '/dashboard' },
  { icon: MessageSquare, label: 'Talk', path: '/dashboard/chat' },
  { icon: Activity, label: 'Operations', path: '/dashboard/operations' },
  { icon: ShieldCheck, label: 'Approvals', path: '/dashboard/approvals' },
  { icon: PlugZap, label: 'Integrations', path: '/dashboard/integrations' },
  { icon: BarChart3, label: 'Reports', path: '/dashboard/insights' },
  { icon: CreditCard, label: 'Billing', path: '/dashboard/billing' },
  { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
] as const;

const primaryMobileItems = navItems.slice(0, 4);
const moreItems = navItems.slice(4);

export function Sidebar() {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { organization, role } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  const isActive = (path: string) => path === '/dashboard' ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 76 : 264 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
        className="sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-white/8 bg-[#080808] md:flex"
      >
        <div className="flex min-h-[76px] items-center gap-3 border-b border-white/8 px-5">
          <PlaceholderLogo size={34} className="shrink-0" />
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">Pandora <span className="text-white/35">Labs</span></p><p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.16em] text-white/25">Operations workspace</p></div>}
        </div>

        {!collapsed && (
          <div className="border-b border-white/8 px-4 py-4">
            <p className="truncate text-xs font-medium text-white/68">{organization?.name ?? 'Preparing workspace'}</p>
            <div className="mt-2 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">{role ?? 'member'} · {organization?.plan_code ?? 'free'}</span></div>
          </div>
        )}

        <nav aria-label="Dashboard" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => <NavItem key={item.path} item={item} active={isActive(item.path)} collapsed={collapsed} />)}
        </nav>

        <div className="space-y-2 border-t border-white/8 p-3">
          <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/4 text-xs font-semibold">{user?.email?.charAt(0).toUpperCase() || 'P'}</div>
            {!collapsed && <div className="min-w-0"><p className="truncate text-xs text-white/62">{user?.email}</p><p className="mt-0.5 text-[9px] uppercase tracking-[0.13em] text-white/25">Verified web account</p></div>}
          </div>
          <button type="button" onClick={() => void signOut()} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/35 hover:bg-red-300/6 hover:text-red-200 ${collapsed ? 'justify-center' : ''}`}><LogOut size={16} />{!collapsed && 'Sign out'}</button>
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="grid w-full place-items-center rounded-lg py-2 text-white/25 hover:bg-white/4 hover:text-white" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
        </div>
      </motion.aside>

      <nav aria-label="Mobile dashboard" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#080808]/97 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
        <div className="grid grid-cols-5">
          {primaryMobileItems.map((item) => <MobileItem key={item.path} item={item} active={isActive(item.path)} />)}
          <button type="button" onClick={() => setMoreOpen(true)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] ${moreOpen || moreItems.some((item) => isActive(item.path)) ? 'text-white' : 'text-white/32'}`} aria-label="More dashboard destinations" aria-expanded={moreOpen}><Ellipsis size={19} /><span>More</span></button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.button type="button" aria-label="Close more menu" className="fixed inset-0 z-[55] bg-black/70 md:hidden" onClick={() => setMoreOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="More dashboard destinations"
              initial={reduceMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduceMotion ? undefined : { y: '100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] border border-white/10 bg-[#0b0b0b] p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden"
            >
              <div className="flex items-center justify-between px-2 pb-4"><div><p className="text-sm font-medium">More</p><p className="mt-1 text-xs text-white/30">Workspace, reporting, and account controls</p></div><button type="button" onClick={() => setMoreOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Close more menu"><X size={17} /></button></div>
              <div className="grid grid-cols-2 gap-2">{moreItems.map((item) => <Link key={item.path} to={item.path} className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${isActive(item.path) ? 'border-white/20 bg-white/7 text-white' : 'border-white/7 text-white/48'}`}><item.icon size={17} />{item.label}</Link>)}</div>
              <button type="button" onClick={() => void signOut()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300/12 py-3 text-sm text-red-200"><LogOut size={15} />Sign out</button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

type NavItemConfig = (typeof navItems)[number];

function NavItem({ item, active, collapsed }: { item: NavItemConfig; active: boolean; collapsed: boolean }) {
  return <Link to={item.path} title={collapsed ? item.label : undefined} className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${active ? 'border-white/10 bg-white/6 text-white' : 'border-transparent text-white/35 hover:bg-white/4 hover:text-white/70'} ${collapsed ? 'justify-center' : ''}`}>{active && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-white" />}<item.icon size={17} className="shrink-0" />{!collapsed && <span>{item.label}</span>}</Link>;
}

function MobileItem({ item, active }: { item: NavItemConfig; active: boolean }) {
  return <Link to={item.path} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] ${active ? 'bg-white/6 text-white' : 'text-white/32'}`}><item.icon size={18} /><span>{item.label}</span></Link>;
}
