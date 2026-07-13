# n8n multi-tenant architecture

Pandora uses one shared workflow suite, not one workflow or one set of n8n credentials per customer. n8n is a private, headless orchestration plane. Supabase owns tenant identity and operational state, while the Supabase Connector Broker owns customer OAuth tokens and calls Google APIs.

## Decision

Use shared n8n workflows with tenant-aware inputs and dynamic HTTP Request nodes. Do **not** create a Google credential in n8n for every Pandora customer.

The suggested "headless n8n + dynamic HTTP nodes" pattern is correct only with an important boundary: dynamic nodes may select an allow-listed operation and pass validated tenant context, but they must never receive a customer refresh token or an arbitrary URL. The Connector Broker resolves encrypted credentials for the trusted `organizationId`, enforces plan and approval rules, calls the provider, rotates tokens, and returns a sanitized result.

This gives Pandora:

- one workflow version to test and release;
- tenant isolation enforced in Supabase rather than by workflow naming conventions;
- no customer OAuth secrets in execution data, node expressions, or n8n credentials;
- a single audit trail across phone and web;
- horizontal scaling without cloning workflows.

## Request path

```text
Web / ElevenLabs / Twilio / future messaging channel
  -> authenticated channel adapter
  -> PandoraCommand envelope
  -> Handle Pandora Command workflow
  -> intent + required-field extraction
  -> clarify, read, draft, approve, or execute
  -> capability sub-workflow
  -> Supabase Connector Broker
  -> Google/provider API
  -> workflow_events + usage_events
  -> channel response
```

The `organizationId` is never accepted as proof of tenancy. A trusted channel adapter derives it from:

- the Supabase user membership for web requests;
- a verified `channel_identities` record for phone, SMS, Telegram, or WhatsApp;
- a one-time channel-link flow completed from the authenticated dashboard.

## Shared command contract

Every channel produces the schema in `n8n/contracts/pandora-command.schema.json`. Required controls are:

- `requestId`: unique channel request identifier;
- `correlationId`: trace identifier propagated to every event and provider call;
- `organizationId`: trusted workspace identity;
- `actorId` and `role`: membership-derived when linked;
- `channel`: web, voice, SMS, Telegram, WhatsApp, or USSD;
- `authContext.verificationLevel`: anonymous, caller-ID matched, OTP verified, or linked;
- `entitlementSnapshot.plan`: rechecked by the broker before a paid operation;
- `locale` and IANA `timezone`.

No workflow may read an `organizationId` supplied directly by an untrusted end user and act on it.

## Workflow suite

Build these workflows once and use sub-workflows for repeatable capabilities. n8n documents sub-workflows as modular, microservice-like workflows using Execute Sub-workflow and Execute Sub-workflow Trigger: <https://docs.n8n.io/flow-logic/subworkflows/>.

1. **Pandora — Handle Command**: shared router, clarification state, approval creation, and response assembly.
2. **Pandora — Resolve Channel Identity**: caller/chat identity lookup and verification-level assignment.
3. **Pandora — Clarify Scheduling Request**: extracts attendee email, date, local time, duration, timezone, title, conferencing choice, and confirmation.
4. **Pandora — Google Read**: Gmail search/read and Calendar list/free-busy through the broker.
5. **Pandora — Google Draft**: creates an email draft only.
6. **Pandora — Request Approval**: writes a hashed action preview with an expiry and returns a confirmation prompt.
7. **Pandora — Execute Approved Action**: re-reads the approval, checks expiry/status/hash, then calls the broker.
8. **Pandora — Tasks and Reminders**: idempotent Supabase writes and scheduled reminder delivery.
9. **Pandora — Log Event**: append-only sanitized operational event.
10. **Pandora — Error Handler**: retry classification, dead-letter event, and operator alert.
11. Channel shells for web, ElevenLabs tools, ElevenLabs post-call, SMS, Telegram, and WhatsApp.

## Dynamic HTTP node rules

The HTTP Request node that calls the Connector Broker has a fixed base URL and fixed custom-header credential. Only these body fields are dynamic:

```json
{
  "organizationId": "validated UUID",
  "operation": "calendar.freebusy",
  "params": {},
  "approvalId": null,
  "idempotencyKey": "channel request + action sequence"
}
```

Rules:

- `operation` is selected from a Switch node allow-list, never generated as an arbitrary URL or method.
- Use one n8n credential for `X-Pandora-Connector-Secret`; rotate it independently of customer OAuth credentials.
- Set `X-Correlation-Id` on every broker request.
- Do not enable full response/body logging for nodes that may contain personal information.
- Never place refresh tokens, authorization codes, webhook secrets, or raw email bodies in pinned production data.
- Treat all LLM-generated tool arguments as untrusted and validate them before the HTTP node.

The current broker allows Gmail search/read/draft/send/trash and Calendar list/free-busy/create/update/delete. Send, trash, create, update, and delete require a current approval. Paid-plan enforcement is repeated inside the broker so a forged n8n payload cannot bypass it.

## Clarification and confirmation state machine

For "schedule a Google Meet with Fatima tomorrow afternoon," the agent must not guess.

1. Extract known fields and normalize only unambiguous values.
2. Ask for missing attendee email, exact date, exact start time, duration, and timezone.
3. Read back the complete proposal, including who will receive invitations.
4. Check free/busy.
5. If there is a conflict, offer alternatives; do not silently move the meeting.
6. Create an approval whose payload hash covers title, attendees, start/end, timezone, conferencing, and notification behavior.
7. Execute only after explicit confirmation while the approval is unexpired.
8. Return the provider event ID and Meet link, then write a sanitized success event.

If speech recognition yields uncertain email characters, Pandora repeats the address in chunks and asks the caller to confirm it. Destructive and financial operations never rely on caller-ID matching alone; use a dashboard approval or OTP step.

## Identity linking

Customers connect Google from the authenticated web dashboard. The OAuth callback stores tokens in Supabase Vault through service-role-only RPCs. n8n sees only the workspace UUID and broker result.

Phone and messaging identities follow this enrollment model:

1. an authenticated user starts a link from the dashboard;
2. Pandora creates a short-lived, single-use token hash in `channel_link_tokens`;
3. the user proves control of the phone/chat identity with Twilio Verify or a bot command;
4. the backend stores only a keyed hash of the external identifier in `channel_identities`;
5. future channel requests resolve that hash to a workspace and verification level.

Unknown callers may use public company Q&A, but cannot access workspace data or perform an operation.

## Idempotency and retries

- Every ingress request uses a stable idempotency key.
- Supabase uniqueness constraints are the final duplicate barrier.
- Reads may retry with exponential backoff and jitter for network errors, 429s, and safe 5xx responses.
- Mutations retry only when the provider offers an idempotency guarantee or a preflight proves the action did not succeed.
- A timeout after an ambiguous provider write is marked `needs_reconciliation`, not blindly retried.
- Error workflows write sanitized events and operator alerts; they never expose stack traces to callers.

## Scaling n8n

Start with n8n Cloud while traffic is modest, then move to self-hosted queue mode when concurrency, data-residency, or predictable cost justifies it. n8n states that queue mode provides its best scalability: the main instance receives triggers, Redis queues execution IDs, and workers execute jobs against Postgres. All workers must share the same encryption key. See <https://docs.n8n.io/hosting/scaling/queue-mode/>.

Recommended production topology:

- one main/editor instance not exposed publicly except required webhooks;
- Postgres 13+ for n8n internal state;
- authenticated Redis with TLS/private networking;
- two or more workers across failure domains;
- separate webhook processors when sustained webhook volume requires them;
- fixed workflow and execution timeouts;
- execution pruning and no successful payload retention beyond the debugging window;
- Prometheus/OpenTelemetry alerts for queue depth, error rate, p95 latency, and stalled executions;
- a pinned n8n version upgraded in staging before production.

In regular self-hosted mode, set a production concurrency limit to prevent event-loop thrashing. n8n documents `N8N_CONCURRENCY_PRODUCTION_LIMIT`; queue-mode workers also support per-worker concurrency: <https://docs.n8n.io/hosting/scaling/concurrency-control/>.

## Secrets

For the current design, n8n stores only Pandora-owned machine credentials. Customer OAuth tokens remain in Supabase Vault. If Pandora later uses n8n Enterprise external secrets, n8n supports AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault, 1Password, and Infisical: <https://docs.n8n.io/external-secrets/>.

Required n8n-owned secrets:

- inbound webhook shared secrets per environment/channel;
- Connector Broker service secret;
- Gemini credential;
- Twilio credential for Pandora-owned number and verification service;
- alert-delivery credential.

Development, staging, and production use different instances, credentials, webhook URLs, Supabase projects, ElevenLabs environments, and Twilio/Paystack modes.

## Production test matrix

Before publishing a workflow, pass pinned-fixture tests for:

- linked tenant, unknown tenant, suspended membership, and forged workspace UUID;
- duplicate delivery before, during, and after execution;
- missing, malformed, expired, rejected, used, and payload-mismatched approvals;
- ambiguous dates, daylight-saving transitions, invalid timezones, and past dates;
- malformed or speech-confused emails, multiple attendees, conflicts, and partial provider failures;
- webhook secret mismatch and replay;
- provider 401 refresh, 403 missing scope, 429, 5xx, timeout, and invalid JSON;
- plan limit reached during an in-flight conversation;
- two simultaneous requests for the same action;
- worker termination after provider success but before event logging;
- redaction checks proving no refresh token, message body, invoice detail, or secret appears in execution logs.

Publish only after draft validation, `get_workflow_details` verification, pinned fixtures, and a staging end-to-end test with provider sandbox accounts.
