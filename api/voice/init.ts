import crypto from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import { createSupabaseAdminClient, HttpError, sendError } from '../../server/api-utils';
import { hashChannelIdentity, normalizePhoneNumber } from '../../server/channel-identities';
import { createVoiceContextToken } from '../../server/voice-context';

const bodySchema = z.object({
  caller_id: z.string().max(32).optional().default(''),
  called_number: z.string().max(32).optional().default(''),
  agent_id: z.string().min(1).max(128),
  call_sid: z.string().min(1).max(128),
  conversation_id: z.string().max(128).optional(),
});

function secureEqual(left: string, right: string) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function publicContext() {
  const contextToken = createVoiceContextToken(
    {
      organizationId: null,
      actorId: null,
      role: 'public_customer',
      plan: 'free',
      channel: 'phone',
    },
    2 * 60 * 60,
  );
  return {
    type: 'conversation_initiation_client_data',
    dynamic_variables: {
      organization_id: '',
      organization_name: '',
      actor_id: '',
      role: 'public_customer',
      verification_level: 'anonymous',
      timezone: 'Africa/Lagos',
      locale: 'en-NG',
      plan: 'free',
      secret__voice_context_token: contextToken,
    },
    environment: process.env.ELEVENLABS_ENVIRONMENT || 'production',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  try {
    const expectedSecret = process.env.ELEVENLABS_INIT_WEBHOOK_SECRET;
    const expectedAgentId = process.env.ELEVENLABS_AGENT_ID;
    const suppliedHeader = req.headers['x-pandora-elevenlabs-secret'];
    const suppliedSecret = Array.isArray(suppliedHeader) ? suppliedHeader[0] : suppliedHeader;
    if (!expectedSecret || !expectedAgentId) {
      throw new HttpError(503, 'Voice identity lookup is not configured.');
    }
    if (!suppliedSecret || !secureEqual(suppliedSecret, expectedSecret)) {
      throw new HttpError(401, 'Unauthorized');
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid call initiation payload.');
    if (parsed.data.agent_id !== expectedAgentId) {
      throw new HttpError(401, 'Unknown voice agent.');
    }
    if (process.env.PANDORA_TWILIO_NUMBER) {
      let expectedNumber: string;
      let calledNumber: string;
      try {
        expectedNumber = normalizePhoneNumber(process.env.PANDORA_TWILIO_NUMBER);
        calledNumber = normalizePhoneNumber(parsed.data.called_number);
      } catch {
        throw new HttpError(401, 'Unknown called number.');
      }
      if (calledNumber !== expectedNumber) throw new HttpError(401, 'Unknown called number.');
    }
    if (!parsed.data.caller_id) return res.status(200).json(publicContext());

    let callerId: string;
    try {
      callerId = normalizePhoneNumber(parsed.data.caller_id);
    } catch {
      return res.status(200).json(publicContext());
    }

    const supabase = createSupabaseAdminClient();
    const { data: identity } = await supabase
      .from('channel_identities')
      .select('organization_id,user_id')
      .eq('channel', 'phone')
      .eq('external_id_hash', hashChannelIdentity('phone', callerId))
      .not('verified_at', 'is', null)
      .maybeSingle();
    if (!identity?.user_id) return res.status(200).json(publicContext());

    const [{ data: organization }, { data: membership }] = await Promise.all([
      supabase
        .from('organizations')
        .select('id,name,timezone,locale,plan_code,status')
        .eq('id', identity.organization_id)
        .maybeSingle(),
      supabase
        .from('organization_members')
        .select('role,status')
        .eq('organization_id', identity.organization_id)
        .eq('user_id', identity.user_id)
        .maybeSingle(),
    ]);
    if (!organization || organization.status !== 'active' || membership?.status !== 'active') {
      return res.status(200).json(publicContext());
    }

    const contextToken = createVoiceContextToken(
      {
        organizationId: organization.id,
        actorId: identity.user_id,
        role: membership.role,
        plan: organization.plan_code,
        channel: 'phone',
      },
      2 * 60 * 60,
    );
    const context = {
      type: 'conversation_initiation_client_data',
      user_id: identity.user_id,
      dynamic_variables: {
        organization_id: organization.id,
        organization_name: organization.name,
        actor_id: identity.user_id,
        role: membership.role,
        verification_level: 'caller_id_matched',
        timezone: organization.timezone,
        locale: organization.locale,
        plan: organization.plan_code,
        secret__voice_context_token: contextToken,
      },
      environment: process.env.ELEVENLABS_ENVIRONMENT || 'production',
    };
    return res.status(200).json(context);
  } catch (error) {
    return sendError(res, error);
  }
}
