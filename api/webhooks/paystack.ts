import crypto from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import { createSupabaseAdminClient, HttpError, sendError } from '../../server/api-utils';
import { readRawBody, safeEqualHex, sha256 } from '../../server/webhooks';

export const config = { api: { bodyParser: false } };

const planConfig = {
  solo: { amount: 2_990_000, env: 'PAYSTACK_SOLO_PLAN_CODE' },
  business: { amount: 7_990_000, env: 'PAYSTACK_BUSINESS_PLAN_CODE' },
  scale: { amount: 19_990_000, env: 'PAYSTACK_SCALE_PLAN_CODE' },
} as const;

type PlanCode = keyof typeof planConfig;
type PaystackData = Record<string, unknown> & {
  id?: string | number;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  paid_at?: string;
  next_payment_date?: string;
};

function nestedString(value: unknown, key: string): string {
  return value && typeof value === 'object' && typeof (value as Record<string, unknown>)[key] === 'string'
    ? String((value as Record<string, unknown>)[key])
    : '';
}

async function resolveOrganizationId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  data: PaystackData,
) {
  const candidate = data.metadata?.organization_id || data.customer?.metadata;
  const metadataOrganization =
    typeof candidate === 'string'
      ? candidate
      : candidate && typeof candidate === 'object'
        ? (candidate as Record<string, unknown>).organization_id
        : null;
  if (typeof metadataOrganization === 'string' && z.string().uuid().safeParse(metadataOrganization).success) {
    return metadataOrganization;
  }

  const customerCode = nestedString(data.customer, 'customer_code');
  if (customerCode) {
    const { data: customer } = await supabase
      .from('billing_customers')
      .select('organization_id')
      .eq('provider_customer_code', customerCode)
      .maybeSingle();
    if (customer?.organization_id) return customer.organization_id;
  }
  const subscriptionCode =
    nestedString(data.subscription, 'subscription_code') || nestedString(data, 'subscription_code');
  if (subscriptionCode) {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('organization_id')
      .eq('provider_subscription_code', subscriptionCode)
      .maybeSingle();
    if (subscription?.organization_id) return subscription.organization_id;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new HttpError(503, 'Billing webhook is not configured.');
    const raw = await readRawBody(req);
    const signatureHeader = req.headers['x-paystack-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const expected = crypto.createHmac('sha512', key).update(raw).digest('hex');
    if (!signature || !safeEqualHex(signature, expected)) {
      throw new HttpError(401, 'Invalid signature.');
    }

    let event: { event?: string; data?: PaystackData };
    try {
      event = JSON.parse(raw.toString('utf8')) as { event?: string; data?: PaystackData };
    } catch {
      throw new HttpError(400, 'Invalid webhook JSON.');
    }
    if (!event.event || typeof event.event !== 'string') {
      throw new HttpError(400, 'Invalid billing event.');
    }
    const data = event.data || {};
    const payloadHash = sha256(raw);
    const providerEventId = String(
      data.id ? `${event.event}:${data.id}` : `${event.event}:${payloadHash}`,
    );
    const supabase = createSupabaseAdminClient();
    const organizationId = await resolveOrganizationId(supabase, data);

    const { data: existingEvent } = await supabase
      .from('billing_events')
      .select('id,processed_at,payload_hash')
      .eq('provider_event_id', providerEventId)
      .maybeSingle();
    if (existingEvent?.payload_hash && existingEvent.payload_hash !== payloadHash) {
      throw new HttpError(409, 'Billing event identifier collision.');
    }
    if (existingEvent?.processed_at) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    if (!existingEvent) {
      const { error: insertError } = await supabase.from('billing_events').insert({
        organization_id: organizationId,
        provider: 'paystack',
        provider_event_id: providerEventId,
        event_type: event.event,
        signature_verified: true,
        payload_hash: payloadHash,
      });
      if (insertError?.code !== '23505' && insertError) throw insertError;
    }

    if (event.event === 'charge.success') {
      const rawPlanCode = data.metadata?.plan_code;
      const planCode = typeof rawPlanCode === 'string' ? rawPlanCode as PlanCode : null;
      if (!organizationId || !planCode || !planConfig[planCode]) {
        throw new HttpError(409, 'Paid transaction could not be matched to a Pandora workspace and plan.');
      }
      const expectedPlanCode = process.env[planConfig[planCode].env];
      const providerPlanCode =
        nestedString(data.plan, 'plan_code') ||
        nestedString(data.subscription && (data.subscription as Record<string, unknown>).plan, 'plan_code');
      if (
        !expectedPlanCode ||
        providerPlanCode !== expectedPlanCode ||
        Number(data.amount) !== planConfig[planCode].amount ||
        data.currency !== 'NGN'
      ) {
        throw new HttpError(409, 'Paid plan details do not match Pandora pricing.');
      }

      const customerCode = nestedString(data.customer, 'customer_code');
      const customerEmail = nestedString(data.customer, 'email');
      if (!customerEmail) {
        throw new HttpError(409, 'Paid transaction is missing its customer email.');
      }
      const subscriptionCode = nestedString(data.subscription, 'subscription_code');
      const { error: activationError } = await supabase.rpc(
        'apply_paystack_subscription_event',
        {
          p_organization_id: organizationId,
          p_email: customerEmail,
          p_customer_code: customerCode,
          p_plan_code: planCode,
          p_provider_plan_code: providerPlanCode,
          p_subscription_code: subscriptionCode,
          p_period_start: data.paid_at || new Date().toISOString(),
          p_period_end: data.next_payment_date || null,
        },
      );
      if (activationError) throw activationError;
    } else if (event.event === 'invoice.payment_failed' && organizationId) {
      const { error } = await supabase.rpc('set_subscription_status', {
        p_organization_id: organizationId,
        p_status: 'past_due',
      });
      if (error) throw error;
    } else if (event.event === 'subscription.disable' && organizationId) {
      const { error } = await supabase.rpc('set_subscription_status', {
        p_organization_id: organizationId,
        p_status: 'cancelled',
      });
      if (error) throw error;
    }

    const { error: processedError } = await supabase
      .from('billing_events')
      .update({ processed_at: new Date().toISOString(), organization_id: organizationId })
      .eq('provider_event_id', providerEventId)
      .is('processed_at', null);
    if (processedError) throw processedError;
    return res.status(200).json({ received: true });
  } catch (error) {
    return sendError(res, error);
  }
}
