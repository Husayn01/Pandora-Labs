import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CreditCard, PhoneCall, Receipt } from 'lucide-react';
import {
  DashboardPage,
  EmptyState,
  PageHeader,
  SkeletonRows,
  StatePill,
  StatusBanner,
  Surface,
  UsageMeter,
} from '@/components/dashboard/DashboardPrimitives';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { supabase } from '@/lib/supabase';
import { launchPlanCatalog, type PublicPlan } from '@/lib/plan-catalog';

type Subscription = { plan_code: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; provider_subscription_code: string | null };
type UsageRow = { metric: string; quantity: number };

export default function BillingPage() {
  const { organization, role } = useWorkspace();
  const online = useOnlineStatus();
  const [plans, setPlans] = useState<PublicPlan[]>(launchPlanCatalog);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!organization) return;
    setError('');
    const periodKey = new Date().toISOString().slice(0, 7);
    const [planResponse, usageResult, subscriptionResult] = await Promise.all([
      fetch('/api/plans').then(async (response) => response.ok ? response.json() as Promise<{ plans?: PublicPlan[] }> : {} as { plans?: PublicPlan[] }).catch(() => ({} as { plans?: PublicPlan[] })),
      supabase.from('usage_counters').select('metric,quantity').eq('organization_id', organization.id).eq('period_key', periodKey),
      supabase.from('subscriptions').select('plan_code,status,current_period_end,cancel_at_period_end,provider_subscription_code').eq('organization_id', organization.id).maybeSingle(),
    ]);
    if (Array.isArray(planResponse.plans) && planResponse.plans.length === 4) setPlans(planResponse.plans);
    if (usageResult.error || subscriptionResult.error) setError(usageResult.error?.message || subscriptionResult.error?.message || 'Billing data could not be loaded.');
    setUsage(Object.fromEntries(((usageResult.data ?? []) as UsageRow[]).map((row) => [row.metric, Number(row.quantity)])));
    setSubscription((subscriptionResult.data as Subscription | null) ?? null);
    setLoading(false);
  }, [organization]);

  useEffect(() => { void load(); }, [load]);

  const checkout = async (planCode: PublicPlan['code']) => {
    if (!organization || busyPlan || planCode === 'free' || !online || !['owner', 'admin'].includes(role ?? '')) return;
    setBusyPlan(planCode);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/billing/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ planCode, organizationId: organization.id }),
      });
      const data = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || 'Checkout could not be started.');
      window.location.assign(data.authorizationUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout could not be started.');
      setBusyPlan('');
    }
  };

  const currentPlan = plans.find((plan) => plan.code === organization?.plan_code) ?? plans[0];
  const actionUsage = usage.web_commands ?? usage.action_credits ?? 0;
  const webVoiceMinutes = Math.ceil((usage.web_voice_seconds ?? 0) / 60);

  return (
    <DashboardPage>
      <PageHeader eyebrow="Plan, entitlement, and payment state" title="Billing" description="Subscription limits come from the plan catalog. Destination-sensitive telephone use remains prepaid and never silently spills into a monthly plan." />
      {!online && <StatusBanner tone="offline">Billing changes are unavailable while offline.</StatusBanner>}
      {error && <StatusBanner onRetry={() => void load()}>{error}</StatusBanner>}
      {organization?.status === 'past_due' && <StatusBanner><span className="flex items-center gap-2"><AlertTriangle size={14} />Payment is past due. Existing records remain available, but new paid actions may be restricted.</span></StatusBanner>}

      {loading ? <SkeletonRows count={6} /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Surface className="p-5"><div className="flex items-center justify-between"><CreditCard size={17} className="text-white/40" /><StatePill label={subscription?.status || organization?.status || 'active'} tone={subscription?.status === 'past_due' ? 'warning' : 'success'} /></div><p className="mt-7 text-xs text-white/30">Current plan</p><p className="mt-1 text-2xl font-medium">{currentPlan.name}</p><p className="mt-2 text-xs text-white/28">{subscription?.current_period_end ? `Current period ends ${new Date(subscription.current_period_end).toLocaleDateString()}` : 'No paid renewal is scheduled.'}</p></Surface>
            <Surface className="space-y-5 p-5"><p className="text-xs text-white/30">Entitlement usage this month</p><UsageMeter label="Action credits" used={actionUsage} limit={currentPlan.actionCredits} unit="actions" /><UsageMeter label="Web voice" used={webVoiceMinutes} limit={currentPlan.webVoiceMinutes} unit="min" /></Surface>
            <Surface className="p-5"><div className="flex items-center justify-between"><PhoneCall size={17} className="text-white/40" /><StatePill label="prepaid" tone="info" /></div><p className="mt-7 text-xs text-white/30">Telephone wallet</p><p className="mt-1 text-2xl font-medium">Not activated</p><p className="mt-2 text-xs leading-5 text-white/28">Minimum top-up ₦5,000. The all-inclusive NGN minute rate is shown before outbound calling.</p><button type="button" disabled className="mt-4 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/25">Available after phone verification</button></Surface>
          </div>

          <Surface title="Launch plans" eyebrow="Live entitlement catalog">
            <div className="grid md:grid-cols-2 xl:grid-cols-4">{plans.map((plan, index) => {
              const current = organization?.plan_code === plan.code;
              const disabled = current || plan.code === 'free' || Boolean(busyPlan) || !online || !['owner', 'admin'].includes(role ?? '');
              return <article key={plan.code} className={`relative min-h-[430px] p-5 ${index > 0 ? 'border-t border-white/8 md:border-l xl:border-t-0' : ''}`}><div className="flex items-center justify-between"><p className="text-sm text-white/55">{plan.name}</p>{current && <StatePill label="current" tone="success" />}</div><p className="mt-6 text-2xl font-medium tracking-[-0.04em]">{plan.pricePrefix ? `${plan.pricePrefix} ` : ''}{formatNaira(plan.monthlyPriceMinor)}<span className="text-[10px] font-normal text-white/25"> / month</span></p><div className="mt-6 space-y-3 border-t border-white/8 pt-5"><PlanLine text={plan.seatLimit ? `${plan.seatLimit} members` : 'Custom members'} /><PlanLine text={plan.actionCredits ? `${plan.actionCredits.toLocaleString()} action credits` : 'Custom action capacity'} /><PlanLine text={plan.webVoiceMinutes ? `${plan.webVoiceMinutes} web-voice minutes` : 'Custom web voice'} /><PlanLine text={plan.auditDays ? `${plan.auditDays}-day audit history` : 'Custom retention'} />{plan.features.map((feature) => <PlanLine key={feature} text={feature} />)}</div><button type="button" onClick={() => void checkout(plan.code)} disabled={disabled} className={`absolute inset-x-5 bottom-5 flex items-center justify-between rounded-xl px-4 py-3 text-sm ${current ? 'border border-emerald-300/15 text-emerald-200' : plan.code === 'solo' ? 'bg-white font-semibold text-black' : 'border border-white/12 text-white/55'} disabled:opacity-35`}>{current ? 'Current plan' : plan.code === 'free' ? 'Included' : busyPlan === plan.code ? 'Opening checkout…' : `Choose ${plan.name}`}<ArrowRight size={14} /></button></article>;
            })}</div>
          </Surface>

          <Surface title="Invoices and receipts" eyebrow="Paystack lifecycle">
            <EmptyState title="No receipts yet" description="Successful Paystack charges and voice-wallet top-ups will appear here after the provider webhook is durably received and verified." action={<span className="inline-flex items-center gap-2 text-xs text-white/32"><Receipt size={13} />Provider reference is never treated as payment proof by itself.</span>} />
          </Surface>
        </>
      )}
    </DashboardPage>
  );
}

function formatNaira(value: number) { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value / 100); }
function PlanLine({ text }: { text: string }) { return <p className="flex gap-2 text-xs leading-5 text-white/42"><Check size={12} className="mt-1 shrink-0 text-emerald-300" />{text}</p>; }
