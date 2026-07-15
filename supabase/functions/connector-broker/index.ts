import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

type JsonObject = Record<string, unknown>;
type Operation =
  | 'gmail.search'
  | 'gmail.read'
  | 'gmail.draft'
  | 'gmail.send'
  | 'gmail.reply'
  | 'gmail.trash'
  | 'calendar.list'
  | 'calendar.freebusy'
  | 'calendar.create'
  | 'calendar.update'
  | 'calendar.delete';

type CommandRow = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  intent: string;
  retry_class: 'safe_read' | 'provider_idempotent' | 'never';
  idempotency_key: string;
  canonical_payload_hash: string;
  correlation_id: string;
  status: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  dispatch_started_at: string | null;
};

type GoogleTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  created_at?: number;
  scope?: string;
};

const allowedOperations = new Set<Operation>([
  'gmail.search',
  'gmail.read',
  'gmail.draft',
  'gmail.send',
  'gmail.reply',
  'gmail.trash',
  'calendar.list',
  'calendar.freebusy',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
]);

const providerMutationOperations = new Set<Operation>([
  'gmail.draft',
  'gmail.send',
  'gmail.reply',
  'gmail.trash',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
]);

const approvalRequiredOperations = new Set<Operation>([
  'gmail.send',
  'gmail.reply',
  'gmail.trash',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
]);

const requiredScopes: Record<Operation, string> = {
  'gmail.search': 'https://www.googleapis.com/auth/gmail.modify',
  'gmail.read': 'https://www.googleapis.com/auth/gmail.modify',
  'gmail.draft': 'https://www.googleapis.com/auth/gmail.compose',
  'gmail.send': 'https://www.googleapis.com/auth/gmail.compose',
  'gmail.reply': 'https://www.googleapis.com/auth/gmail.compose',
  'gmail.trash': 'https://www.googleapis.com/auth/gmail.modify',
  'calendar.list': 'https://www.googleapis.com/auth/calendar.events',
  'calendar.freebusy': 'https://www.googleapis.com/auth/calendar.events',
  'calendar.create': 'https://www.googleapis.com/auth/calendar.events',
  'calendar.update': 'https://www.googleapis.com/auth/calendar.events',
  'calendar.delete': 'https://www.googleapis.com/auth/calendar.events',
};

class BrokerError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  uncertain: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { retryable?: boolean; uncertain?: boolean } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.uncertain = Boolean(options.uncertain);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorResponse(error: BrokerError, correlationId: string) {
  return json({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      uncertain: error.uncertain,
      correlationId,
    },
  }, error.status);
}

async function secureEqual(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(actualHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireUuid(value: unknown, field: string) {
  const result = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new BrokerError(400, 'invalid_request', `${field} is invalid.`);
  }
  return result;
}

function requireString(value: unknown, field: string, maxLength: number, allowEmpty = false) {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((!allowEmpty && !result) || result.length > maxLength) {
    throw new BrokerError(400, 'invalid_request', `${field} is invalid.`);
  }
  return result;
}

function requireHeader(value: unknown, field: string, maxLength: number) {
  const result = requireString(value, field, maxLength);
  if (/\r|\n/.test(result)) throw new BrokerError(400, 'invalid_header', `${field} is invalid.`);
  return result;
}

function normalizeEmail(value: unknown) {
  const email = requireString(value, 'email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    throw new BrokerError(400, 'invalid_email', 'An email address is invalid.');
  }
  return email;
}

function normalizeEmails(value: unknown, field: string, required = false) {
  const input = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const emails = [...new Set(input.map(normalizeEmail))];
  if ((required && !emails.length) || emails.length > 50) {
    throw new BrokerError(400, 'invalid_email_list', `${field} is invalid.`);
  }
  return emails;
}

function normalizeDateTime(value: unknown, field: string) {
  const input = requireString(value, field, 64);
  const date = new Date(input);
  if (Number.isNaN(date.getTime()) || !/[zZ]|[+-]\d{2}:\d{2}$/.test(input)) {
    throw new BrokerError(400, 'invalid_datetime', `${field} must include an explicit UTC offset.`);
  }
  return input;
}

function normalizeTimeZone(value: unknown) {
  const timeZone = requireString(value, 'timeZone', 80);
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    throw new BrokerError(400, 'invalid_timezone', 'timeZone is invalid.');
  }
  return timeZone;
}

function normalizeParams(operation: Operation, input: unknown): JsonObject {
  const params = input && typeof input === 'object' && !Array.isArray(input) ? input as JsonObject : {};
  if (operation === 'gmail.search') {
    return {
      query: requireString(params.query, 'query', 500, true),
      limit: Math.max(1, Math.min(Number(params.limit || 10), 25)),
    };
  }
  if (operation === 'gmail.read' || operation === 'gmail.trash') {
    return { messageId: requireString(params.messageId, 'messageId', 200) };
  }
  if (operation === 'gmail.draft' || operation === 'gmail.send' || operation === 'gmail.reply') {
    const normalized: JsonObject = {
      to: normalizeEmails(params.to, 'to', true),
      cc: normalizeEmails(params.cc, 'cc'),
      bcc: normalizeEmails(params.bcc, 'bcc'),
      subject: requireHeader(params.subject, 'subject', 998),
      body: requireString(params.body, 'body', 100_000, true),
    };
    if (operation === 'gmail.reply') {
      normalized.threadId = requireString(params.threadId, 'threadId', 200);
      normalized.inReplyTo = requireHeader(params.inReplyTo, 'inReplyTo', 998);
    }
    return normalized;
  }

  const calendarId = requireString(params.calendarId || 'primary', 'calendarId', 512);
  if (operation === 'calendar.list' || operation === 'calendar.freebusy') {
    const timeMin = normalizeDateTime(params.timeMin, 'timeMin');
    const timeMax = normalizeDateTime(params.timeMax, 'timeMax');
    if (new Date(timeMax) <= new Date(timeMin)) {
      throw new BrokerError(400, 'invalid_time_range', 'timeMax must be after timeMin.');
    }
    return {
      calendarId,
      timeMin,
      timeMax,
      timeZone: normalizeTimeZone(params.timeZone || 'Africa/Lagos'),
    };
  }
  if (operation === 'calendar.delete') {
    return {
      calendarId,
      eventId: requireString(params.eventId, 'eventId', 1024),
    };
  }

  const start = normalizeDateTime(params.start, 'start');
  const end = normalizeDateTime(params.end, 'end');
  if (new Date(end) <= new Date(start)) {
    throw new BrokerError(400, 'invalid_time_range', 'Calendar event end must be after start.');
  }
  const normalized: JsonObject = {
    calendarId,
    title: requireString(params.title, 'title', 512),
    description: requireString(params.description, 'description', 10_000, true),
    start,
    end,
    timeZone: normalizeTimeZone(params.timeZone),
    attendees: normalizeEmails(params.attendees, 'attendees'),
    createMeet: Boolean(params.createMeet),
  };
  if (operation === 'calendar.update') {
    normalized.eventId = requireString(params.eventId, 'eventId', 1024);
  }
  return normalized;
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new BrokerError(503, 'broker_not_configured', 'Connector broker is not configured.', { retryable: true });
  return value;
}

function createSupabase() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readRequest(req: Request) {
  const raw = await req.text();
  if (!raw || new TextEncoder().encode(raw).length > 256_000) {
    throw new BrokerError(raw ? 413 : 400, raw ? 'payload_too_large' : 'invalid_request', raw ? 'Request payload is too large.' : 'Request body is required.');
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed as JsonObject;
  } catch {
    throw new BrokerError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

async function loadCommand(supabase: SupabaseClient, commandId: string, leaseToken: string, attempt: number) {
  const { data, error } = await supabase
    .from('orchestration_commands')
    .select('id,organization_id,actor_user_id,intent,retry_class,idempotency_key,canonical_payload_hash,correlation_id,status,lease_token,lease_expires_at,attempt_count,dispatch_started_at')
    .eq('id', commandId)
    .maybeSingle();
  if (error) throw new BrokerError(503, 'command_lookup_failed', 'Command state is unavailable.', { retryable: true });
  const command = data as CommandRow | null;
  if (!command || command.status !== 'executing' || command.lease_token !== leaseToken || command.attempt_count !== attempt) {
    throw new BrokerError(409, 'command_lease_mismatch', 'Command lease is no longer valid.');
  }
  if (!command.lease_expires_at || new Date(command.lease_expires_at) <= new Date()) {
    throw new BrokerError(409, 'command_lease_expired', 'Command lease has expired.');
  }
  return command;
}

async function authorizeApproval(
  supabase: SupabaseClient,
  command: CommandRow,
  approvalId: string,
  operation: Operation,
  actionHash: string,
) {
  const { data: approval, error } = await supabase
    .from('approval_requests')
    .select('id,status,expires_at,action_type,action_payload_hash,idempotency_key')
    .eq('id', approvalId)
    .eq('organization_id', command.organization_id)
    .maybeSingle();
  if (error || !approval) throw new BrokerError(409, 'approval_required', 'A current approval is required.');
  if (
    approval.status !== 'approved'
    || new Date(approval.expires_at) <= new Date()
    || approval.action_type !== operation
    || approval.action_payload_hash !== actionHash
    || approval.idempotency_key !== command.idempotency_key
  ) {
    throw new BrokerError(409, 'approval_binding_mismatch', 'Approval does not match this exact action.');
  }

  const { data: decision } = await supabase
    .from('approval_decisions')
    .select('decision,action_type,action_payload_hash,approval_idempotency_key')
    .eq('approval_request_id', approvalId)
    .maybeSingle();
  if (
    !decision
    || decision.decision !== 'approved'
    || decision.action_type !== operation
    || decision.action_payload_hash !== actionHash
    || decision.approval_idempotency_key !== command.idempotency_key
  ) {
    throw new BrokerError(409, 'approval_decision_mismatch', 'Approval decision ledger does not match this action.');
  }
}

async function loadGoogleConnection(supabase: SupabaseClient, organizationId: string, operation: Operation) {
  const { data: organization } = await supabase
    .from('organizations')
    .select('plan_code,status')
    .eq('id', organizationId)
    .maybeSingle();
  if (!organization || !['active', 'past_due'].includes(organization.status)) {
    throw new BrokerError(403, 'workspace_inactive', 'Workspace is not active.');
  }
  if (providerMutationOperations.has(operation) && organization.status !== 'active') {
    throw new BrokerError(402, 'workspace_past_due', 'Workspace billing must be current before external actions.');
  }
  if (approvalRequiredOperations.has(operation)) {
    const { data: entitlement, error: entitlementError } = await supabase
      .from('plan_entitlements')
      .select('features')
      .eq('plan_code', organization.plan_code)
      .maybeSingle();
    if (entitlementError || !entitlement) {
      throw new BrokerError(503, 'entitlement_unavailable', 'Workspace entitlement is unavailable.', { retryable: true });
    }
    const features = entitlement.features && typeof entitlement.features === 'object'
      ? entitlement.features as JsonObject
      : {};
    if (features.external_sends !== true) {
      throw new BrokerError(402, 'plan_upgrade_required', 'This external operation requires a plan upgrade.');
    }
  }

  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id,vault_secret_id,status,scopes')
    .eq('organization_id', organizationId)
    .eq('provider', 'google_workspace')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle();
  if (!connection?.vault_secret_id) {
    throw new BrokerError(409, 'google_not_connected', 'Google Workspace is not connected.');
  }
  if (!Array.isArray(connection.scopes) || !connection.scopes.includes(requiredScopes[operation])) {
    throw new BrokerError(409, 'google_scope_missing', 'Google Workspace must be reconnected with the required permission.');
  }
  return connection as { id: string; vault_secret_id: string; scopes: string[] };
}

async function refreshGoogleToken(
  supabase: SupabaseClient,
  organizationId: string,
  connection: { id: string; vault_secret_id: string },
  current: GoogleTokens,
) {
  if (!current.refresh_token) {
    throw new BrokerError(409, 'google_reauthorization_required', 'Google Workspace must be reconnected.');
  }
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getEnv('GOOGLE_CLIENT_ID'),
        client_secret: getEnv('GOOGLE_CLIENT_SECRET'),
        refresh_token: current.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
  } catch {
    throw new BrokerError(503, 'google_token_refresh_unavailable', 'Google authentication is temporarily unavailable.', { retryable: true });
  }
  const payload = await response.json().catch(() => ({})) as GoogleTokens & { error?: string };
  if (!response.ok || !payload.access_token) {
    throw new BrokerError(409, 'google_reauthorization_required', 'Google Workspace must be reconnected.');
  }

  const tokens: GoogleTokens = { ...current, ...payload, created_at: Date.now() };
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
  const { data: rotatedId, error } = await supabase.rpc('rotate_connection_secret', {
    p_organization_id: organizationId,
    p_connection_id: connection.id,
    p_provider: 'google_workspace',
    p_expected_secret_id: connection.vault_secret_id,
    p_secret_value: JSON.stringify(tokens),
    p_token_expires_at: expiresAt,
  });
  if (error) throw new BrokerError(503, 'credential_rotation_failed', 'Google credential rotation failed.', { retryable: true });
  if (!rotatedId) {
    const { data: currentSecret } = await supabase.rpc('read_connection_secret', {
      p_organization_id: organizationId,
      p_connection_id: connection.id,
      p_provider: 'google_workspace',
    });
    if (currentSecret) return JSON.parse(String(currentSecret)) as GoogleTokens;
  }
  return tokens;
}

async function getGoogleTokens(
  supabase: SupabaseClient,
  organizationId: string,
  connection: { id: string; vault_secret_id: string },
) {
  const { data: secret, error } = await supabase.rpc('read_connection_secret', {
    p_organization_id: organizationId,
    p_connection_id: connection.id,
    p_provider: 'google_workspace',
  });
  if (error || !secret) throw new BrokerError(503, 'credential_unavailable', 'Connected credential is unavailable.', { retryable: true });
  let tokens: GoogleTokens;
  try {
    tokens = JSON.parse(String(secret)) as GoogleTokens;
  } catch {
    throw new BrokerError(503, 'credential_invalid', 'Connected credential is invalid.');
  }
  const expiresAt = Number(tokens.created_at || 0) + Number(tokens.expires_in || 0) * 1000;
  if (!tokens.access_token || Date.now() >= expiresAt - 60_000) {
    tokens = await refreshGoogleToken(supabase, organizationId, connection, tokens);
  }
  if (!tokens.access_token) throw new BrokerError(409, 'google_reauthorization_required', 'Google Workspace must be reconnected.');
  return tokens;
}

function bytesToBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function encodeEmail(params: JsonObject, messageId: string) {
  const lines = [
    `To: ${(params.to as string[]).join(', ')}`,
    ...(Array.isArray(params.cc) && params.cc.length ? [`Cc: ${(params.cc as string[]).join(', ')}`] : []),
    ...(Array.isArray(params.bcc) && params.bcc.length ? [`Bcc: ${(params.bcc as string[]).join(', ')}`] : []),
    `Subject: ${String(params.subject)}`,
    ...(params.inReplyTo ? [`In-Reply-To: ${String(params.inReplyTo)}`, `References: ${String(params.inReplyTo)}`] : []),
    `Message-ID: <${messageId}@actions.pandora.invalid>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    String(params.body || ''),
  ];
  return bytesToBase64Url(lines.join('\r\n'));
}

function calendarEvent(params: JsonObject, eventId?: string) {
  return {
    ...(eventId ? { id: eventId } : {}),
    summary: params.title,
    description: params.description,
    start: { dateTime: params.start, timeZone: params.timeZone },
    end: { dateTime: params.end, timeZone: params.timeZone },
    attendees: (params.attendees as string[]).map((email) => ({ email })),
    conferenceData: params.createMeet
      ? { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      : undefined,
  };
}

function decodeBase64Url(value: string) {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(normalized);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    return '';
  }
}

function extractPlainText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const part = payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[] };
  if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts || []) {
    const text = extractPlainText(child);
    if (text) return text;
  }
  return '';
}

async function googleFetch(
  url: string,
  init: RequestInit,
  operation: Operation,
  safeToRetry: boolean,
) {
  const attempts = safeToRetry ? 2 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      if (safeToRetry && attempt < attempts) continue;
      throw new BrokerError(504, 'google_timeout', 'Google did not confirm the operation in time.', {
        retryable: safeToRetry,
        uncertain: !safeToRetry,
      });
    }
    const raw = await response.text();
    let data: unknown = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = {}; }
    }
    if (response.ok) return data;
    if (safeToRetry && attempt < attempts && (response.status === 429 || response.status >= 500)) continue;
    if (!safeToRetry && response.status >= 500) {
      throw new BrokerError(502, 'google_result_uncertain', 'Google did not confirm whether the operation completed.', { uncertain: true });
    }
    if (response.status === 401 || response.status === 403) {
      throw new BrokerError(409, 'google_reauthorization_required', 'Google Workspace must be reconnected.');
    }
    throw new BrokerError(response.status === 429 ? 429 : 400, 'google_request_rejected', `Google rejected ${operation}.`, { retryable: response.status === 429 });
  }
  throw new BrokerError(502, 'google_request_failed', 'Google request failed.');
}

async function executeGoogle(operation: Operation, params: JsonObject, accessToken: string, providerOperationId: string) {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  let url = '';
  let method = 'GET';
  let body: unknown;

  switch (operation) {
    case 'gmail.search':
      url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${params.limit}&q=${encodeURIComponent(String(params.query))}`;
      break;
    case 'gmail.read':
      url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(params.messageId))}?format=full`;
      break;
    case 'gmail.draft':
      url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
      method = 'POST';
      body = { message: { raw: encodeEmail(params, providerOperationId) } };
      break;
    case 'gmail.send':
      url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
      method = 'POST';
      body = { raw: encodeEmail(params, providerOperationId) };
      break;
    case 'gmail.reply':
      url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
      method = 'POST';
      body = { raw: encodeEmail(params, providerOperationId), threadId: params.threadId };
      break;
    case 'gmail.trash':
      url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(params.messageId))}/trash`;
      method = 'POST';
      body = {};
      break;
    case 'calendar.list':
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(params.calendarId))}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(String(params.timeMin))}&timeMax=${encodeURIComponent(String(params.timeMax))}&maxResults=25`;
      break;
    case 'calendar.freebusy':
      url = 'https://www.googleapis.com/calendar/v3/freeBusy';
      method = 'POST';
      body = { timeMin: params.timeMin, timeMax: params.timeMax, timeZone: params.timeZone, items: [{ id: params.calendarId }] };
      break;
    case 'calendar.create':
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(params.calendarId))}/events?conferenceDataVersion=1&sendUpdates=all`;
      method = 'POST';
      body = calendarEvent(params, providerOperationId);
      break;
    case 'calendar.update':
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(params.calendarId))}/events/${encodeURIComponent(String(params.eventId))}?conferenceDataVersion=1&sendUpdates=all`;
      method = 'PATCH';
      body = calendarEvent(params);
      break;
    case 'calendar.delete':
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(String(params.calendarId))}/events/${encodeURIComponent(String(params.eventId))}?sendUpdates=all`;
      method = 'DELETE';
      break;
  }

  return googleFetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, operation, !providerMutationOperations.has(operation));
}

function bounded(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : null;
}

function sanitizeResult(operation: Operation, raw: unknown): JsonObject {
  const result = raw && typeof raw === 'object' ? raw as JsonObject : {};
  if (operation === 'gmail.search') {
    const messages = Array.isArray(result.messages)
      ? result.messages.slice(0, 25).flatMap((item) => item && typeof item === 'object'
        ? [{ id: String((item as JsonObject).id || ''), threadId: String((item as JsonObject).threadId || '') }]
        : [])
      : [];
    return { messages, nextPageToken: result.nextPageToken || null, resultSizeEstimate: Number(result.resultSizeEstimate || 0) };
  }
  if (operation === 'gmail.read') {
    const payload = result.payload && typeof result.payload === 'object' ? result.payload as JsonObject : {};
    const headers = Array.isArray(payload.headers)
      ? payload.headers.flatMap((header) => {
        if (!header || typeof header !== 'object') return [];
        const name = String((header as JsonObject).name || '').toLowerCase();
        if (!['from', 'to', 'cc', 'subject', 'date', 'message-id'].includes(name)) return [];
        return [{ name, value: bounded((header as JsonObject).value, 2_000) }];
      }).slice(0, 12)
      : [];
    return {
      id: result.id,
      threadId: result.threadId,
      snippet: String(result.snippet || '').slice(0, 500),
      headers,
      bodyText: extractPlainText(result.payload).slice(0, 12_000),
    };
  }
  if (operation.startsWith('gmail.')) {
    const message = result.message && typeof result.message === 'object' ? result.message as JsonObject : {};
    return { id: result.id || message.id || null, threadId: result.threadId || message.threadId || null };
  }
  if (operation === 'calendar.freebusy') {
    const calendars = result.calendars && typeof result.calendars === 'object' ? result.calendars as JsonObject : {};
    return {
      calendars: Object.fromEntries(Object.entries(calendars).slice(0, 10).map(([id, value]) => {
        const calendar = value && typeof value === 'object' ? value as JsonObject : {};
        const busy = Array.isArray(calendar.busy)
          ? calendar.busy.slice(0, 50).flatMap((slot) => slot && typeof slot === 'object'
            ? [{ start: bounded((slot as JsonObject).start, 64), end: bounded((slot as JsonObject).end, 64) }]
            : [])
          : [];
        return [id.slice(0, 512), { busy }];
      })),
    };
  }
  if (operation === 'calendar.list') {
    const items = Array.isArray(result.items)
      ? result.items.slice(0, 25).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const event = item as JsonObject;
        const attendees = Array.isArray(event.attendees)
          ? event.attendees.slice(0, 50).flatMap((attendee) => attendee && typeof attendee === 'object'
            ? [{ email: bounded((attendee as JsonObject).email, 254), responseStatus: bounded((attendee as JsonObject).responseStatus, 32) }]
            : [])
          : [];
        return [{
          id: bounded(event.id, 1_024),
          status: bounded(event.status, 32),
          summary: bounded(event.summary, 512),
          start: event.start || null,
          end: event.end || null,
          location: bounded(event.location, 1_000),
          attendees,
          htmlLink: bounded(event.htmlLink, 2_048),
          hangoutLink: bounded(event.hangoutLink, 2_048),
        }];
      })
      : [];
    return { items, nextPageToken: bounded(result.nextPageToken, 2_048) };
  }
  return {
    id: result.id || null,
    summary: result.summary || null,
    start: result.start || null,
    end: result.end || null,
    htmlLink: result.htmlLink || null,
    hangoutLink: result.hangoutLink || null,
  };
}

function redactedAudit(operation: Operation, result: JsonObject) {
  return {
    operation,
    providerObjectId: typeof result.id === 'string' ? result.id : null,
    resultCount: Array.isArray(result.messages) ? result.messages.length : Array.isArray(result.items) ? result.items.length : null,
  };
}

async function finishCommand(
  supabase: SupabaseClient,
  command: CommandRow,
  leaseToken: string,
  attempt: number,
  status: 'succeeded' | 'failed' | 'uncertain',
  result: JsonObject,
  error?: BrokerError,
) {
  const fingerprint = await sha256(canonicalJson({ status, result, errorCode: error?.code || null }));
  const { data, error: rpcError } = await supabase.rpc('finish_orchestration_command', {
    p_organization_id: command.organization_id,
    p_command_id: command.id,
    p_lease_token: leaseToken,
    p_attempt: attempt,
    p_status: status,
    p_result_redacted: result,
    p_result_fingerprint: fingerprint,
    p_error_code: error?.code || null,
    p_error_retryable: error?.retryable ?? null,
  });
  if (rpcError || !data?.ok) {
    throw new BrokerError(503, 'command_finalize_failed', 'Command result could not be finalized.', { uncertain: status === 'succeeded' });
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, 405);

  const correlationHeader = req.headers.get('x-correlation-id');
  let correlationId = /^[0-9a-f-]{36}$/i.test(correlationHeader || '') ? String(correlationHeader) : crypto.randomUUID();
  let supabase: SupabaseClient | null = null;
  let command: CommandRow | null = null;
  let leaseToken = '';
  let attempt = 0;
  let operation: Operation | null = null;
  let dispatchMarked = false;

  try {
    const expectedSecret = getEnv('PANDORA_CONNECTOR_SERVICE_SECRET');
    const suppliedSecret = req.headers.get('x-pandora-connector-secret') || '';
    if (!suppliedSecret || !(await secureEqual(suppliedSecret, expectedSecret))) {
      throw new BrokerError(401, 'unauthorized', 'Unauthorized.');
    }

    const body = await readRequest(req);
    const commandId = requireUuid(body.commandId, 'commandId');
    leaseToken = requireUuid(body.leaseToken, 'leaseToken');
    attempt = Number(body.attempt);
    if (!Number.isInteger(attempt) || attempt < 1) throw new BrokerError(400, 'invalid_request', 'attempt is invalid.');
    const requestedOperation = String(body.operation || '') as Operation;
    if (!allowedOperations.has(requestedOperation)) throw new BrokerError(400, 'operation_not_allowed', 'Operation is not allowed.');
    operation = requestedOperation;
    const params = normalizeParams(operation, body.params);

    supabase = createSupabase();
    command = await loadCommand(supabase, commandId, leaseToken, attempt);
    correlationId = command.correlation_id || correlationId;
    if (providerMutationOperations.has(operation) && command.retry_class === 'safe_read') {
      throw new BrokerError(409, 'retry_class_mismatch', 'External mutations cannot use a safe-read retry class.');
    }

    const actionHash = await sha256(canonicalJson({ operation, params }));
    if (actionHash !== command.canonical_payload_hash) {
      throw new BrokerError(409, 'command_payload_mismatch', 'Command does not match this exact action.');
    }

    const approvalId = approvalRequiredOperations.has(operation) ? requireUuid(body.approvalId, 'approvalId') : null;
    if (approvalId) await authorizeApproval(supabase, command, approvalId, operation, actionHash);

    const connection = await loadGoogleConnection(supabase, command.organization_id, operation);
    const tokens = await getGoogleTokens(supabase, command.organization_id, connection);

    if (providerMutationOperations.has(operation)) {
      const { data: dispatch, error: dispatchError } = await supabase.rpc('mark_orchestration_dispatch_started', {
        p_organization_id: command.organization_id,
        p_command_id: command.id,
        p_lease_token: leaseToken,
        p_attempt: attempt,
      });
      if (dispatchError || !dispatch?.ok) throw new BrokerError(409, 'command_lease_mismatch', 'Command lease is no longer valid.');
      if (dispatch.replayed) throw new BrokerError(409, 'dispatch_already_started', 'This external action has already been dispatched.', { uncertain: true });
      dispatchMarked = true;
    }

    const providerOperationId = (await sha256(`pandora:${command.idempotency_key}`)).slice(0, 40);
    const rawResult = await executeGoogle(operation, params, String(tokens.access_token), providerOperationId);
    const result = sanitizeResult(operation, rawResult);
    const audit = redactedAudit(operation, result);

    const { error: eventError } = await supabase.from('workflow_events').upsert({
      organization_id: command.organization_id,
      actor_user_id: command.actor_user_id,
      workflow_name: 'Pandora — Connector Broker',
      correlation_id: correlationId,
      event_type: operation.replace('.', '_'),
      status: 'success',
      summary: `Google operation ${operation} completed.`,
      redacted_payload: audit,
      idempotency_key: `connector:${command.idempotency_key}`,
    }, { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true });
    if (eventError) throw new BrokerError(503, 'audit_write_failed', 'Operation completed but its audit event could not be recorded.', { uncertain: providerMutationOperations.has(operation) });

    if (approvalId) {
      const { data: executedApproval, error: approvalError } = await supabase
        .from('approval_requests')
        .update({ status: 'executed' })
        .eq('id', approvalId)
        .eq('organization_id', command.organization_id)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle();
      if (approvalError || !executedApproval) throw new BrokerError(503, 'approval_finalize_failed', 'Operation completed but approval state could not be finalized.', { uncertain: true });
    }

    await finishCommand(supabase, command, leaseToken, attempt, 'succeeded', audit);
    return json({ ok: true, status: 'succeeded', result, correlationId });
  } catch (caught) {
    const error = caught instanceof BrokerError
      ? caught
      : new BrokerError(500, 'connector_operation_failed', 'Connector operation failed.');

    if (supabase && command && leaseToken && attempt > 0) {
      const terminalStatus = error.uncertain || (dispatchMarked && error.status >= 500) ? 'uncertain' : 'failed';
      try {
        await finishCommand(supabase, command, leaseToken, attempt, terminalStatus, {}, error);
      } catch {
        // The command lease may have expired. Recovery will move a dispatched
        // mutation to uncertain; do not attempt the provider call again here.
      }
    }

    console.error('[connector-broker] request failed', {
      code: error.code,
      correlationId,
      operation,
      uncertain: error.uncertain || dispatchMarked,
    });
    return errorResponse(error, correlationId);
  }
});
