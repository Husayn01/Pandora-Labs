import crypto from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../../server/vercel-types';
import { HttpError, sendError } from '../../server/api-utils';
import { verifyVoiceContextToken } from '../../server/voice-context';

const allowedTools = [
  'get_business_context',
  'prepare_action',
  'check_calendar_availability',
  'create_email_draft',
  'create_calendar_draft',
  'confirm_action',
  'get_action_status',
] as const;

const bodySchema = z.object({
  tool: z.enum(allowedTools),
  requestId: z.string().min(8).max(128),
  conversationId: z.string().min(1).max(128),
  callSid: z.string().max(128).optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

function secureEqual(left: string, right: string) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  try {
    const expectedProxySecret = process.env.ELEVENLABS_TOOL_PROXY_SECRET;
    const proxyHeader = req.headers['x-pandora-elevenlabs-secret'];
    const suppliedProxySecret = Array.isArray(proxyHeader) ? proxyHeader[0] : proxyHeader;
    if (!expectedProxySecret) throw new HttpError(503, 'Voice tools are not configured.');
    if (!suppliedProxySecret || !secureEqual(suppliedProxySecret, expectedProxySecret)) {
      throw new HttpError(401, 'Unauthorized');
    }

    const contextHeader = req.headers['x-pandora-voice-context'];
    const contextToken = Array.isArray(contextHeader) ? contextHeader[0] : contextHeader;
    if (!contextToken) throw new HttpError(401, 'Missing trusted voice context.');
    const context = verifyVoiceContextToken(contextToken);
    if (!context.organizationId || !context.actorId || context.role === 'public_customer') {
      throw new HttpError(403, 'Link and verify your account in the web dashboard first.');
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid voice tool request.');
    const webhookUrl = process.env.N8N_PANDORA_VOICE_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_PANDORA_WEBHOOK_SECRET;
    if (!webhookUrl || !webhookSecret) {
      throw new HttpError(503, 'Pandora voice operations are not configured.');
    }

    const correlationId = crypto.randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Pandora-Webhook-Secret': webhookSecret,
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': parsed.data.requestId,
        },
        body: JSON.stringify({
          requestId: parsed.data.requestId,
          correlationId,
          organizationId: context.organizationId,
          actorId: context.actorId,
          role: context.role,
          channel: 'voice',
          sourceChannel: context.channel,
          conversationId: parsed.data.conversationId,
          callSid: parsed.data.callSid,
          tool: parsed.data.tool,
          parameters: parsed.data.parameters,
          authContext: { verificationLevel: 'signed_voice_context' },
          entitlementSnapshot: { plan: context.plan },
        }),
      });
      const responseText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
      } catch {
        throw new HttpError(502, 'Pandora workflow returned an invalid response.');
      }
      if (!response.ok) {
        throw new HttpError(
          response.status >= 500 ? 502 : response.status,
          String(data.error || 'Pandora voice workflow failed.'),
        );
      }
      return res.status(200).json(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new HttpError(504, 'Pandora voice workflow timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return sendError(res, error);
  }
}
