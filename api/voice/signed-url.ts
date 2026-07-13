import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import {
  createSupabaseAdminClient,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../../server/api-utils';
import { resolveTenant } from '../../server/tenant';
import { createVoiceContextToken } from '../../server/voice-context';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!apiKey || !agentId) {
      throw new HttpError(503, 'ElevenLabs web voice is not configured.');
    }

    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    const requested =
      typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    const tenant = await resolveTenant(supabase, user, requested);
    const period = new Date().toISOString().slice(0, 7);
    const [{ data: counter, error: counterError }, { data: entitlement, error: entitlementError }] =
      await Promise.all([
        supabase
          .from('usage_counters')
          .select('quantity')
          .eq('organization_id', tenant.organizationId)
          .eq('metric', 'web_voice_seconds')
          .eq('period_key', period)
          .maybeSingle(),
        supabase
          .from('plan_entitlements')
          .select('web_voice_seconds_limit')
          .eq('plan_code', tenant.plan)
          .single(),
      ]);
    if (counterError || entitlementError || !entitlement) {
      throw new HttpError(503, 'Voice entitlement could not be verified.');
    }
    if (Number(counter?.quantity ?? 0) >= Number(entitlement.web_voice_seconds_limit)) {
      throw new HttpError(402, 'Your included web voice allowance has been used.');
    }

    const environment = process.env.ELEVENLABS_ENVIRONMENT || 'production';
    const params = new URLSearchParams({ agent_id: agentId, environment });
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?${params}`,
      { headers: { 'xi-api-key': apiKey } },
    );
    const data = (await response.json()) as { signed_url?: string; detail?: string };
    if (!response.ok || !data.signed_url) {
      throw new HttpError(502, data.detail || 'Unable to create a protected voice session.');
    }

    const contextToken = createVoiceContextToken(
      {
        organizationId: tenant.organizationId,
        actorId: user.id,
        role: tenant.role,
        plan: tenant.plan,
        channel: 'web_voice',
      },
      2 * 60 * 60,
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      signedUrl: data.signed_url,
      contextToken,
      role: tenant.role,
      environment,
      expiresIn: 900,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
