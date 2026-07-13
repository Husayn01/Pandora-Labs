# Pandora Production Setup and Release Gates

## Environment separation

Create isolated staging and production projects for Supabase, n8n, ElevenLabs, Twilio, Google OAuth and Paystack. Never point preview deployments at production side-effect credentials.

### Vercel server variables

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SITE_URL`
- `N8N_PANDORA_COMMAND_WEBHOOK_URL`, `N8N_PANDORA_VOICE_WEBHOOK_URL`, `N8N_PANDORA_WEBHOOK_SECRET`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_INIT_WEBHOOK_SECRET`, `ELEVENLABS_TOOL_PROXY_SECRET`, `ELEVENLABS_ENVIRONMENT`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `PANDORA_TWILIO_NUMBER`, `CHANNEL_IDENTITY_PEPPER`, `VOICE_CONTEXT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `PAYSTACK_SECRET_KEY`, `PAYSTACK_SOLO_PLAN_CODE`, `PAYSTACK_BUSINESS_PLAN_CODE`, `PAYSTACK_SCALE_PLAN_CODE`
- Twilio voice credentials belong in ElevenLabs/n8n. Vercel uses Twilio credentials only for the authenticated phone-link verification boundary.

### Browser variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or the current Supabase publishable key

No browser variable may contain a service secret.

### Supabase Edge Function secrets

Set `PANDORA_CONNECTOR_SERVICE_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` for `connector-broker`. Use the same connector secret only in an n8n credential, never a node text field.

## Supabase

1. Apply migrations in order and generate TypeScript types.
2. Confirm every business table is organization-scoped and RLS enabled.
3. Enable leaked-password protection, email verification, production SMTP, MFA options, CAPTCHA/rate limits and exact redirect allowlists in the Supabase dashboard.
4. Set JWT expiry appropriate to the risk model and require fresh verification for sensitive actions.
5. Run security/performance advisors and fix new externally facing warnings.
6. Configure backups/PITR, rehearse a restore, and document data export/deletion.
7. Ensure `integration_connections` contains only Vault references and metadata. Revoke/delete legacy `user_connectors` tokens.

## Paystack

1. Complete business verification and create NGN monthly plans for Solo, Business and Scale.
2. Add each plan code to Vercel. Use Paystack hosted checkout; Pandora never collects card details.
3. Configure the webhook URL `/api/webhooks/paystack` and verify HTTPS.
4. Exercise signed success, duplicate, out-of-order, failed invoice, disabled subscription and refund fixtures.
5. Keep failed subscriptions in a grace state; notify the owner, disable new paid mutations after the grace window, and never delete data during downgrade.
6. Cards/direct debit are recurring methods. Bank transfer and USSD fund prepaid credit or manual renewals.

## n8n deployment

For self-hosted production, use PostgreSQL, Redis queue mode, main process, webhook processors and workers with one shared `N8N_ENCRYPTION_KEY`. Configure TLS, MFA/restricted editor access, SSRF protections, blocked risky nodes, bounded concurrency, timeouts, error-only execution retention, pruning and security audits.

Obtain written n8n licensing confirmation before commercial launch. Customers never see n8n, and their OAuth credentials/API execution remain outside n8n in the connector broker, but licensing confirmation is still mandatory.

## Observability

- Propagate `correlationId` through Vercel, ElevenLabs/Twilio, n8n, Supabase, Google and Paystack.
- Alert on webhook signature failures, elevated 5xx, queue depth, failed workflows, provider disconnects, billing webhook lag, voice cost spikes and cross-tenant policy failures.
- Store redacted structured logs and error codes; do not store secrets or complete sensitive payloads.
- Target: API availability 99.9%, webhook acknowledgement p95 below two seconds, ordinary tool response p95 below five seconds where providers allow, and zero cross-tenant leakage.

## Required automated verification

- `npm run verify`
- `npm audit` with no high/critical findings
- Supabase RLS/BOLA tests with at least two users in separate organizations
- OAuth state replay/expiry and revoked-token tests
- ElevenLabs and Paystack forged/duplicate/stale webhook tests
- n8n schema validation, pinned tests, error branches and `get_workflow_details` verification
- Browser tests for signup, verification, login, callback, logout, protected routes, workspace loading, Google connect and plan checkout
- Load tests for concurrent chat/voice webhooks, database connections, worker saturation and retry idempotency
- Chaos tests for Google, ElevenLabs, Twilio, n8n worker, Redis, Supabase and Paystack failure

## Rollout

1. Internal staging with mocked side effects.
2. Pandora Labs organization on real providers with allowlisted recipients/calendars/numbers.
3. Two managed Abuja pilot businesses with isolated organizations and daily log review.
4. Increase concurrency only after cost, latency, clarification accuracy and failure rates are measured.
5. General availability only after Nigerian phone/SIP routing, privacy/legal documents, incident response, provider verification and n8n licensing are complete.
