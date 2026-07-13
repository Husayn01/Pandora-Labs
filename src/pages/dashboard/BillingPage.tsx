import { useEffect, useState } from 'react';
import { Check, CreditCard, PhoneCall } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/lib/supabase';

const plans = [
  {
    code: 'free',
    name: 'Free',
    price: '₦0',
    features: ['500 web commands', '15 web voice minutes', 'Tasks and reminders', 'Calendar read-only'],
  },
  {
    code: 'solo',
    name: 'Solo',
    price: '₦29,900',
    features: ['2 seats', 'Gmail and Calendar actions', '100 voice minutes', 'Invoice drafts and reports'],
  },
  {
    code: 'business',
    name: 'Business',
    price: '₦79,900',
    features: ['5 seats', '400 voice minutes', 'WhatsApp and Telegram', 'Team approvals and schedules'],
  },
  {
    code: 'scale',
    name: 'Scale',
    price: '₦199,900',
    features: ['15 seats', '1,200 voice minutes', 'Dedicated SIP onboarding', 'Priority support and exports'],
  },
];

export default function BillingPage() {
  const { organization } = useWorkspace();
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [busyPlan, setBusyPlan] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!organization) return;
    void supabase
      .from('usage_counters')
      .select('metric,quantity')
      .eq('organization_id', organization.id)
      .then(({ data }) =>
        setUsage(Object.fromEntries((data ?? []).map((row) => [row.metric, Number(row.quantity)]))),
      );
  }, [organization]);

  const checkout = async (planCode: string) => {
    if (!organization || busyPlan) return;
    setBusyPlan(planCode);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/api/billing/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ planCode, organizationId: organization.id }),
    });
    const data = await response.json();
    if (response.ok && data.authorizationUrl) {
      window.location.assign(data.authorizationUrl);
      return;
    }
    setBusyPlan('');
    setError(data.error || 'Checkout could not be started.');
  };

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto">
      <header className="mb-7">
        <p className="text-xs uppercase tracking-[.2em] text-gray-500">Plan and usage</p>
        <h1 className="text-3xl text-white mt-2">Billing</h1>
        <p className="text-sm text-gray-500 mt-2">
          Useful free access on the web. Costly phone usage stays transparent and controlled.
        </p>
      </header>

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-7">
        <GlassCard hover={false} className="p-5">
          <CreditCard size={17} className="text-gray-400" />
          <p className="text-xs text-gray-500 mt-5">Current plan</p>
          <p className="text-2xl text-white capitalize mt-1">{organization?.plan_code ?? 'free'}</p>
        </GlassCard>
        <GlassCard hover={false} className="p-5">
          <PhoneCall size={17} className="text-gray-400" />
          <p className="text-xs text-gray-500 mt-5">Voice minutes used</p>
          <p className="text-2xl text-white mt-1">
            {Math.ceil(((usage.voice_seconds ?? 0) + (usage.web_voice_seconds ?? 0)) / 60)}
          </p>
        </GlassCard>
        <GlassCard hover={false} className="p-5">
          <p className="text-xs text-gray-500">Outbound Nigeria calls</p>
          <p className="text-lg text-white mt-2">Prepaid only</p>
          <p className="text-xs text-gray-600 mt-2">Hard stop when wallet credit reaches zero.</p>
        </GlassCard>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((plan) => {
          const current = organization?.plan_code === plan.code;
          const disabled = plan.code === 'free' || current || Boolean(busyPlan);
          return (
            <GlassCard key={plan.code} hover={false} className={`p-6 ${current ? 'border-white/25' : ''}`}>
              <p className="text-sm text-gray-400">{plan.name}</p>
              <p className="text-3xl text-white mt-3">
                {plan.price}<span className="text-xs text-gray-600"> / month</span>
              </p>
              <div className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <p key={feature} className="text-xs text-gray-400 flex gap-2">
                    <Check size={13} className="text-white" />{feature}
                  </p>
                ))}
              </div>
              <button
                onClick={() => void checkout(plan.code)}
                disabled={disabled}
                className="mt-7 w-full rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:bg-white/5 disabled:text-gray-600"
              >
                {current ? 'Current plan' : plan.code === 'free' ? 'Included' : busyPlan === plan.code ? 'Opening checkout…' : 'Choose plan'}
              </button>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
