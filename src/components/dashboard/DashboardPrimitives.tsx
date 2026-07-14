import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';

export function DashboardPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1380px] space-y-6 p-5 md:p-8 lg:p-10', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/32">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.045em] text-white md:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-white/42">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Surface({ children, className, title, eyebrow, action }: { children: ReactNode; className?: string; title?: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <section className={clsx('overflow-hidden rounded-[18px] border border-white/9 bg-[#0a0a0a]', className)}>
      {(title || eyebrow || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div>{eyebrow && <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/28">{eyebrow}</p>}{title && <h2 className="mt-1 text-base font-medium text-white">{title}</h2>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatePill({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral' }) {
  const toneClass = {
    success: 'border-emerald-300/18 bg-emerald-300/7 text-emerald-200',
    warning: 'border-amber-300/18 bg-amber-300/7 text-amber-200',
    error: 'border-red-300/18 bg-red-300/7 text-red-200',
    info: 'border-blue-300/18 bg-blue-300/7 text-blue-200',
    neutral: 'border-white/10 bg-white/3 text-white/42',
  }[tone];
  return <span className={clsx('inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.13em]', toneClass)}>{label}</span>;
}

export function StatusBanner({ children, tone = 'error', onRetry }: { children: ReactNode; tone?: 'error' | 'offline' | 'stale'; onRetry?: () => void }) {
  const Icon = tone === 'offline' ? WifiOff : AlertCircle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex items-center justify-between gap-4 rounded-[14px] border px-4 py-3 text-sm', tone === 'error' ? 'border-red-300/18 bg-red-300/7 text-red-100' : tone === 'offline' ? 'border-amber-300/18 bg-amber-300/7 text-amber-100' : 'border-blue-300/18 bg-blue-300/7 text-blue-100')}>
      <span className="flex items-center gap-2.5"><Icon size={15} />{children}</span>
      {onRetry && <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-3 py-1.5 text-xs"><RefreshCw size={12} />Retry</button>}
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return <div aria-label="Loading" className="space-y-3 p-5">{Array.from({ length: count }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-white/4" />)}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="grid min-h-44 place-items-center px-6 py-10 text-center"><div><Inbox size={20} className="mx-auto text-white/25" /><p className="mt-4 text-sm font-medium text-white/70">{title}</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-white/32">{description}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}

export function UsageMeter({ label, used, limit, unit }: { label: string; used: number; limit: number | null; unit: string }) {
  const safeLimit = limit && limit > 0 ? limit : 0;
  const value = safeLimit ? Math.min(used / safeLimit, 1) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs"><span className="text-white/45">{label}</span><span className="font-mono text-white/55">{used.toLocaleString()} {safeLimit ? `/ ${safeLimit.toLocaleString()}` : ''} {unit}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"><div className={clsx('h-full rounded-full', value >= 0.9 ? 'bg-red-300' : value >= 0.7 ? 'bg-amber-300' : 'bg-emerald-300')} style={{ width: `${value * 100}%` }} /></div>
    </div>
  );
}
