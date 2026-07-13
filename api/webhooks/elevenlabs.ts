import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import { createSupabaseAdminClient, HttpError, sendError } from '../../server/api-utils';
import { readRawBody, safeEqualHex } from '../../server/webhooks';
import { verifyVoiceContextToken } from '../../server/voice-context';

type ElevenLabsPayload = {
  type?: string;
  conversation_id?: string;
  data?: {
    agent_id?: string;
    conversation_id?: string;
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
    };
    metadata?: {
      call_duration_secs?: number;
      termination_reason?: string;
      phone_call?: { call_sid?: string };
    };
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    const expectedAgentId = process.env.ELEVENLABS_AGENT_ID;
    if (!secret || !expectedAgentId) {
      throw new HttpError(503, 'ElevenLabs webhook is not configured.');
    }
    const raw = await readRawBody(req, 2_000_000);
    const signatureHeader = req.headers['elevenlabs-signature'];
    const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!header) throw new HttpError(401, 'Missing signature.');

    const parts = Object.fromEntries(
      header.split(',').map((entry) => {
        const separator = entry.indexOf('=');
        return separator === -1
          ? [entry.trim(), '']
          : [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
      }),
    );
    const timestamp = Number(parts.t);
    if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      throw new HttpError(401, 'Stale signature.');
    }
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${parts.t}.${raw.toString('utf8')}`)
      .digest('hex');
    if (!parts.v0 || !safeEqualHex(parts.v0, expected)) {
      throw new HttpError(401, 'Invalid signature.');
    }

    let payload: ElevenLabsPayload;
    try {
      payload = JSON.parse(raw.toString('utf8')) as ElevenLabsPayload;
    } catch {
      throw new HttpError(400, 'Invalid webhook JSON.');
    }
    if (payload.type && payload.type !== 'post_call_transcription') {
      return res.status(200).json({ received: true, ignored: true });
    }
    if (payload.data?.agent_id !== expectedAgentId) {
      throw new HttpError(401, 'Unknown voice agent.');
    }

    const conversationId = String(
      payload.data?.conversation_id || payload.conversation_id || '',
    );
    if (!conversationId || conversationId.length > 128) {
      throw new HttpError(400, 'Missing conversation id.');
    }
    const dynamic = payload.data?.conversation_initiation_client_data?.dynamic_variables || {};
    const contextToken = String(dynamic.secret__voice_context_token || '');
    if (!contextToken) throw new HttpError(401, 'Missing trusted voice context.');
    const context = verifyVoiceContextToken(contextToken);
    if (!context.organizationId) {
      return res.status(200).json({ received: true, anonymous: true });
    }

    const supabase = createSupabaseAdminClient();
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('elevenlabs_conversation_id', conversationId)
      .maybeSingle();
    let localId = existing?.id;

    if (!localId) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          organization_id: context.organizationId,
          user_id: context.actorId,
          actor_user_id: context.actorId,
          channel: context.channel,
          elevenlabs_conversation_id: conversationId,
          title: context.channel === 'phone' ? 'Phone call with Pandora' : 'Web voice with Pandora',
          metadata: { call_sid: payload.data?.metadata?.phone_call?.call_sid || null },
        })
        .select('id')
        .single();
      if (error?.code === '23505') {
        const { data: raced } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', context.organizationId)
          .eq('elevenlabs_conversation_id', conversationId)
          .single();
        localId = raced?.id;
      } else if (error) {
        throw error;
      } else {
        localId = data.id;
      }
    }
    if (!localId) throw new HttpError(500, 'Unable to record voice conversation.');

    const rawDuration = Number(payload.data?.metadata?.call_duration_secs || 0);
    const duration = Number.isFinite(rawDuration)
      ? Math.max(0, Math.min(Math.round(rawDuration), 8 * 60 * 60))
      : 0;
    const { error: eventError } = await supabase.from('workflow_events').upsert(
      {
        organization_id: context.organizationId,
        actor_user_id: context.actorId,
        conversation_id: localId,
        workflow_name: 'Pandora — ElevenLabs Post Call',
        correlation_id: conversationId,
        event_type: 'voice_call_completed',
        status: 'success',
        summary: `Voice session completed in ${Math.ceil(duration / 60)} minute(s).`,
        redacted_payload: {
          duration_seconds: duration,
          channel: context.channel,
          termination_reason: payload.data?.metadata?.termination_reason || null,
        },
        idempotency_key: `elevenlabs:${conversationId}`,
      },
      { onConflict: 'organization_id,idempotency_key' },
    );
    if (eventError) throw eventError;

    const metric = context.channel === 'phone' ? 'voice_seconds' : 'web_voice_seconds';
    const { error: usageError } = await supabase.from('usage_events').upsert(
      {
        organization_id: context.organizationId,
        metric,
        quantity: duration,
        source_id: conversationId,
        period_key: new Date().toISOString().slice(0, 7),
        metadata: { channel: context.channel },
      },
      { onConflict: 'organization_id,metric,source_id' },
    );
    if (usageError) throw usageError;

    return res.status(200).json({ received: true });
  } catch (error) {
    return sendError(res, error);
  }
}
