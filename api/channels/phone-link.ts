import crypto from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import {
  createSupabaseAdminClient,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../../server/api-utils';
import {
  hashChannelIdentity,
  normalizePhoneNumber,
  phoneDisplayHint,
} from '../../server/channel-identities';
import { resolveTenant } from '../../server/tenant';
import { sha256 } from '../../server/webhooks';

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    organizationId: z.string().uuid().optional(),
    phone: z.string().min(8).max(32),
  }),
  z.object({
    action: z.literal('verify'),
    organizationId: z.string().uuid().optional(),
    linkRequestId: z.string().uuid(),
    phone: z.string().min(8).max(32),
    code: z.string().regex(/^\d{4,10}$/),
  }),
  z.object({
    action: z.literal('unlink'),
    organizationId: z.string().uuid().optional(),
  }),
]);

interface VerifyResponse {
  status?: string;
  message?: string;
}

async function callTwilioVerify(operation: 'start' | 'check', phone: string, code?: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) {
    throw new HttpError(503, 'Phone verification is not configured.');
  }

  const resource = operation === 'start' ? 'Verifications' : 'VerificationCheck';
  const body =
    operation === 'start'
      ? new URLSearchParams({ To: phone, Channel: 'sms' })
      : new URLSearchParams({ To: phone, Code: code || '' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${resource}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    const data = (await response.json()) as VerifyResponse;
    if (!response.ok) {
      if (response.status === 429) throw new HttpError(429, 'Too many verification attempts.');
      if (response.status >= 500) throw new HttpError(502, 'Phone verification is unavailable.');
      throw new HttpError(400, data.message || 'Phone verification failed.');
    }
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError(504, 'Phone verification timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid phone verification request.');

    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    const tenant = await resolveTenant(supabase, user, parsed.data.organizationId);

    if (parsed.data.action === 'unlink') {
      const { error: unlinkError } = await supabase
        .from('channel_identities')
        .delete()
        .eq('organization_id', tenant.organizationId)
        .eq('user_id', user.id)
        .eq('channel', 'phone');
      if (unlinkError) throw unlinkError;
      return res.status(200).json({ unlinked: true });
    }

    const phone = normalizePhoneNumber(parsed.data.phone);
    const externalIdHash = hashChannelIdentity('phone', phone);

    const { data: existingIdentity } = await supabase
      .from('channel_identities')
      .select('organization_id,user_id,verified_at')
      .eq('channel', 'phone')
      .eq('external_id_hash', externalIdHash)
      .maybeSingle();
    if (existingIdentity?.verified_at) {
      if (
        existingIdentity.organization_id !== tenant.organizationId ||
        existingIdentity.user_id !== user.id
      ) {
        throw new HttpError(409, 'This phone number is linked to another account.');
      }
      return res.status(200).json({ verified: true, displayHint: phoneDisplayHint(phone) });
    }

    if (parsed.data.action === 'start') {
      const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count } = await supabase
        .from('channel_link_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('channel', 'phone')
        .gte('created_at', oneHourAgo);
      if ((count ?? 0) >= 5) {
        throw new HttpError(429, 'Too many verification requests. Try again later.');
      }

      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data: link, error: linkError } = await supabase
        .from('channel_link_tokens')
        .insert({
          organization_id: tenant.organizationId,
          user_id: user.id,
          channel: 'phone',
          token_hash: sha256(crypto.randomBytes(32)),
          external_id_hash: externalIdHash,
          display_hint: phoneDisplayHint(phone),
          expires_at: expiresAt,
        })
        .select('id')
        .single();
      if (linkError) throw linkError;

      try {
        await callTwilioVerify('start', phone);
      } catch (error) {
        await supabase.from('channel_link_tokens').delete().eq('id', link.id);
        throw error;
      }

      return res.status(200).json({
        verified: false,
        linkRequestId: link.id,
        displayHint: phoneDisplayHint(phone),
        expiresAt,
      });
    }

    const { data: link, error: linkError } = await supabase
      .from('channel_link_tokens')
      .select('id,attempt_count')
      .eq('id', parsed.data.linkRequestId)
      .eq('organization_id', tenant.organizationId)
      .eq('user_id', user.id)
      .eq('channel', 'phone')
      .eq('external_id_hash', externalIdHash)
      .is('redeemed_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) throw new HttpError(400, 'Verification request is invalid or expired.');
    if (link.attempt_count >= 5) throw new HttpError(429, 'Too many incorrect codes.');

    await supabase
      .from('channel_link_tokens')
      .update({ attempt_count: link.attempt_count + 1 })
      .eq('id', link.id)
      .eq('attempt_count', link.attempt_count);

    const verification = await callTwilioVerify('check', phone, parsed.data.code);
    if (verification.status !== 'approved') {
      throw new HttpError(400, 'The verification code is incorrect or expired.');
    }

    const channelRole = tenant.role === 'viewer' ? 'public_customer' : tenant.role;
    const { error: identityError } = await supabase.from('channel_identities').insert(
      {
        organization_id: tenant.organizationId,
        user_id: user.id,
        channel: 'phone',
        external_id_hash: externalIdHash,
        display_hint: phoneDisplayHint(phone),
        role: channelRole,
        verified_at: new Date().toISOString(),
        metadata: { verification_provider: 'twilio_verify' },
      },
    );
    if (identityError?.code === '23505') {
      throw new HttpError(409, 'This phone number is linked to another account.');
    }
    if (identityError) throw identityError;

    await supabase
      .from('channel_link_tokens')
      .update({ redeemed_at: new Date().toISOString() })
      .eq('id', link.id)
      .is('redeemed_at', null);

    return res.status(200).json({ verified: true, displayHint: phoneDisplayHint(phone) });
  } catch (error) {
    return sendError(res, error);
  }
}
