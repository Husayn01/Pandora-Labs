import crypto from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import {
  createSupabaseAdminClient,
  getBaseUrl,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../../server/api-utils';
import { canManageWorkspace, resolveTenant } from '../../server/tenant';

const plans = {
  solo: { amount: 2_990_000, env: 'PAYSTACK_SOLO_PLAN_CODE' },
  business: { amount: 7_990_000, env: 'PAYSTACK_BUSINESS_PLAN_CODE' },
  scale: { amount: 19_990_000, env: 'PAYSTACK_SCALE_PLAN_CODE' },
} as const;

type PaystackInitializeResponse = {
  status?: boolean;
  message?: string;
  data?: { authorization_url?: string; reference?: string };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) throw new HttpError(503, 'Billing is not configured.');
    const parsed = z
      .object({
        planCode: z.enum(['solo', 'business', 'scale']),
        organizationId: z.string().uuid().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid billing request.');

    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    if (!user.email) throw new HttpError(400, 'A verified account email is required.');
    const tenant = await resolveTenant(supabase, user, parsed.data.organizationId);
    if (!canManageWorkspace(tenant.role)) {
      throw new HttpError(403, 'Only workspace administrators can change billing.');
    }

    const selected = plans[parsed.data.planCode];
    const plan = process.env[selected.env];
    if (!plan) throw new HttpError(503, 'This billing plan is not configured.');
    const reference = `PAN-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: selected.amount,
        currency: 'NGN',
        plan,
        reference,
        callback_url: `${getBaseUrl(req)}/dashboard/billing`,
        metadata: {
          organization_id: tenant.organizationId,
          plan_code: parsed.data.planCode,
          user_id: user.id,
        },
      }),
    });
    const data = (await response.json()) as PaystackInitializeResponse;
    if (
      !response.ok ||
      !data.status ||
      !data.data?.authorization_url ||
      !data.data.reference
    ) {
      throw new HttpError(502, data.message || 'Unable to initialize payment.');
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
