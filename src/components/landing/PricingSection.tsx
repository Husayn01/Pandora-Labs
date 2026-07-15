import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { requestJson } from '@/lib/api-client';
import { launchPlanCatalog, type PublicPlan } from '@/lib/plan-catalog';

export function PricingSection() {
  const [plans, setPlans] = useState<PublicPlan[]>(launchPlanCatalog);

  useEffect(() => {
    const controller = new AbortController();
    void requestJson<{ plans?: PublicPlan[] }>('/api/plans', { signal: controller.signal })
      .then((data) => {
        if (Array.isArray(data.plans) && data.plans.length === 4) setPlans(data.plans);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <section id="pricing" className="border-b border-white/10 bg-[#080808]">
      <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-8 md:py-32 xl:px-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
          <div><p className="eyebrow">NGN launch pricing</p><h2 className="section-title max-w-2xl">Start useful. Pay when Pandora works harder.</h2></div>
          <p className="max-w-lg text-sm leading-6 text-white/45 lg:justify-self-end">The free plan is generous on the web. Destination-sensitive phone calls use transparent prepaid credit, so the subscription never hides an expensive minute rate.</p>
        </div>
        <div className="mt-14 grid overflow-hidden rounded-[22px] border border-white/10 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => (
            <article key={plan.code} className={`relative min-h-[470px] bg-[#0b0b0b] p-6 ${index > 0 ? 'border-t border-white/10 sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-t xl:border-t-0' : ''}`}>
              {plan.code === 'solo' && <span className="absolute right-5 top-5 rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-black">Best start</span>}
              <p className="text-sm text-white/55">{plan.name}</p>
              <p className="mt-7 text-3xl font-medium tracking-[-0.045em]">{plan.pricePrefix ? `${plan.pricePrefix} ` : ''}{formatNaira(plan.monthlyPriceMinor)}<span className="text-xs font-normal text-white/28"> / month</span></p>
              <div className="mt-7 space-y-3 border-t border-white/10 pt-6">
                <PlanLine text={plan.seatLimit ? `${plan.seatLimit} ${plan.seatLimit === 1 ? 'member' : 'members'}` : 'Custom members'} />
                <PlanLine text={plan.actionCredits ? `${plan.actionCredits.toLocaleString()} action credits` : 'Custom action capacity'} />
                <PlanLine text={plan.webVoiceMinutes ? `${plan.webVoiceMinutes} web-voice minutes` : 'Custom web voice'} />
                <PlanLine text={plan.auditDays ? `${plan.auditDays}-day audit history` : 'Custom retention'} />
                {plan.features.map((feature) => <PlanLine key={feature} text={feature} />)}
              </div>
              <Link to="/signup" className={`absolute inset-x-6 bottom-6 inline-flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ${plan.code === 'solo' ? 'bg-white text-black' : 'border border-white/12 text-white'}`}>{plan.code === 'free' ? 'Start free' : `Choose ${plan.name}`}<ArrowRight size={14} /></Link>
            </article>
          ))}
        </div>
        <p className="mt-5 text-xs text-white/28">Phone usage is prepaid. Minimum top-up ₦5,000. Rates are shown before outbound calling.</p>
      </div>
    </section>
  );
}

function formatNaira(value: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value / 100);
}

function PlanLine({ text }: { text: string }) {
  return <p className="flex gap-2.5 text-xs leading-5 text-white/48"><Check size={13} className="mt-0.5 shrink-0 text-emerald-300" />{text}</p>;
}
