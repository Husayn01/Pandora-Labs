import crypto from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../server/vercel-types';
import {
  createSupabaseAdminClient,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../server/api-utils';
import { resolveTenant } from '../server/tenant';

const bodySchema = z.object({
  message: z.string().trim().min(1).max(8000),
  conversationId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().optional(),
});

const DEFAULT_AGENT_NAME = 'Pandora';
const DEFAULT_AGENT_ICON = 'Shield';

function parseRequestBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function parseWorkflowResponse(body: string): Record<string, unknown> {
  if (!body) return {};

  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(502, 'Pandora workflow returned an invalid response.');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    const parsed = bodySchema.safeParse(parseRequestBody(req.body));
    if (!parsed.success) throw new HttpError(400, 'Invalid command payload.');

    const tenant = await resolveTenant(supabase, user, parsed.data.organizationId);
    const idempotencyHeader = req.headers['idempotency-key'];
    const idempotencyKey =
      (Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader) ||
      crypto.randomUUID();
    if (idempotencyKey.length > 128) throw new HttpError(400, 'Invalid idempotency key.');

    const { data: duplicate } = await supabase
      .from('workflow_events')
      .select('id')
      .eq('organization_id', tenant.organizationId)
      .eq('idempotency_key', `command:${idempotencyKey}`)
      .maybeSingle();
    if (duplicate) throw new HttpError(409, 'This command has already been accepted.');

    const { data: reserved, error: quotaError } = await supabase.rpc(
      'reserve_web_command_usage',
      {
        p_organization_id: tenant.organizationId,
        p_source_id: idempotencyKey,
        p_period_key: new Date().toISOString().slice(0, 7),
      },
    );
    if (quotaError) throw quotaError;
    if (!reserved) {
      throw new HttpError(402, 'Your monthly web command allowance has been used.');
    }

    let conversationId = parsed.data.conversationId ?? null;
    if (conversationId) {
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('organization_id', tenant.organizationId)
        .maybeSingle();
      if (!data) throw new HttpError(404, 'Conversation not found.');
    } else {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          organization_id: tenant.organizationId,
          user_id: user.id,
          actor_user_id: user.id,
          title: parsed.data.message.slice(0, 70),
          channel: 'web',
        })
        .select('id')
        .single();
      if (error) throw error;
      conversationId = data.id;
    }

    const correlationId = crypto.randomUUID();
    const { error: messageError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'user',
      content: parsed.data.message,
      metadata: { correlation_id: correlationId },
    });
    if (messageError) throw messageError;

    const { error: eventError } = await supabase.from('workflow_events').insert({
      organization_id: tenant.organizationId,
      actor_user_id: user.id,
      conversation_id: conversationId,
      workflow_name: 'Pandora — Handle Command',
      correlation_id: correlationId,
      event_type: 'command_received',
      status: 'info',
      summary: 'Authenticated web command received.',
      redacted_payload: { channel: 'web' },
      idempotency_key: `command:${idempotencyKey}`,
    });
    if (eventError) throw eventError;

    const webhookUrl = process.env.N8N_PANDORA_COMMAND_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_PANDORA_WEBHOOK_SECRET;
    if (!webhookUrl || !webhookSecret) {
      throw new HttpError(503, 'Pandora operations are not configured yet.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let workflowResponse: Record<string, unknown>;

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Pandora-Webhook-Secret': webhookSecret,
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          requestId: idempotencyKey,
          correlationId,
          organizationId: tenant.organizationId,
          actorId: user.id,
          role: tenant.role,
          channel: 'web',
          conversationId,
          message: parsed.data.message,
          locale: tenant.locale,
          timezone: tenant.timezone,
          authContext: { verificationLevel: 'linked' },
          entitlementSnapshot: { plan: tenant.plan },
        }),
      });
      const responseText = await response.text();
      workflowResponse = parseWorkflowResponse(responseText);
      if (!response.ok) {
        throw new HttpError(
          response.status >= 500 ? 502 : response.status,
          String(workflowResponse.error || 'Pandora workflow failed.'),
        );
      }
    } catch (error) {
      const summary =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Pandora workflow timed out.'
          : error instanceof HttpError
            ? error.message
            : 'Pandora workflow request failed.';

      await supabase.from('workflow_events').insert({
        organization_id: tenant.organizationId,
        actor_user_id: user.id,
        conversation_id: conversationId,
        workflow_name: 'Pandora — Handle Command',
        correlation_id: correlationId,
        event_type: 'command_failed',
        status: 'error',
        summary,
        redacted_payload: { channel: 'web' },
        idempotency_key: `failed:${idempotencyKey}`,
      });

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new HttpError(504, 'Pandora workflow timed out.');
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'Pandora workflow request failed.');
    } finally {
      clearTimeout(timeout);
    }

    const reply = String(
      workflowResponse.reply ||
        workflowResponse.response ||
        workflowResponse.message ||
        'Pandora completed the operation but returned no message.',
    );
    const routedTo = String(
      workflowResponse.routedTo || workflowResponse.routed_to || 'pandora-core',
    );
    const executionId = workflowResponse.executionId || workflowResponse.execution_id;

    const { error: replyError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content: reply,
      metadata: { correlation_id: correlationId, execution_id: executionId ?? null },
    });
    if (replyError) throw replyError;

    await supabase.from('workflow_events').insert({
      organization_id: tenant.organizationId,
      actor_user_id: user.id,
      conversation_id: conversationId,
      workflow_name: 'Pandora — Handle Command',
      execution_id: executionId ? String(executionId) : null,
      correlation_id: correlationId,
      event_type: 'command_completed',
      status: 'success',
      summary: `Command routed to ${routedTo}.`,
      redacted_payload: { channel: 'web', routedTo },
      idempotency_key: `completed:${idempotencyKey}`,
    });

    return res.status(200).json({
      reply,
      routedTo,
      reasoning: String(
        workflowResponse.reasoning || 'Handled by the shared Pandora workflow.',
      ),
      agentName: String(
        workflowResponse.agentName || workflowResponse.agent_name || DEFAULT_AGENT_NAME,
      ),
      agentIcon: String(
        workflowResponse.agentIcon || workflowResponse.agent_icon || DEFAULT_AGENT_ICON,
      ),
      conversationId,
      actions: workflowResponse.actions,
      executionId,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
