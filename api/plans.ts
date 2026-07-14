import type { VercelRequest, VercelResponse } from '../server/vercel-types';
import { createSupabaseAdminClient, sendError, setCorsHeaders } from '../server/api-utils';
import { launchPlanCatalog, type PublicPlan } from '../src/lib/plan-catalog';

type EntitlementRow = {
  plan_code: string;
  monthly_price_minor: number;
  seat_limit: number | null;
  web_command_limit: number | null;
  web_voice_seconds_limit: number | null;
  features: unknown;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('plan_entitlements')
      .select('plan_code,monthly_price_minor,seat_limit,web_command_limit,web_voice_seconds_limit,features')
      .order('monthly_price_minor', { ascending: true });
    if (error) throw error;

    const defaults = new Map(launchPlanCatalog.map((plan) => [plan.code, plan]));
    const plans = ((data ?? []) as EntitlementRow[]).flatMap((row): PublicPlan[] => {
      if (!['free', 'solo', 'business', 'scale'].includes(row.plan_code)) return [];
      const fallback = defaults.get(row.plan_code as PublicPlan['code']);
      if (!fallback) return [];
      const features = row.features && typeof row.features === 'object' && !Array.isArray(row.features) ? row.features as Record<string, unknown> : {};
      return [{
        ...fallback,
        monthlyPriceMinor: Number(row.monthly_price_minor),
        seatLimit: row.plan_code === 'scale' ? null : Number(row.seat_limit),
        actionCredits: row.plan_code === 'scale' ? null : Number(row.web_command_limit),
        webVoiceMinutes: row.plan_code === 'scale' ? null : Math.floor(Number(row.web_voice_seconds_limit) / 60),
        auditDays: typeof features.audit_days === 'number' ? features.audit_days : fallback.auditDays,
      }];
    });

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ plans: plans.length === 4 ? plans : launchPlanCatalog });
  } catch (error) {
    return sendError(res, error);
  }
}
