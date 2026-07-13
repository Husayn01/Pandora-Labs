# Pandora Labs Engineering Rules

## Product Contract
- Pandora is a voice-first, multi-tenant business operations agent. It serves public customers and verified business operators through one role-aware agent.
- Web and telephone are the first production channels. SMS follows the same core contract. Telegram and WhatsApp are linked only after web onboarding. USSD remains provider-dependent.
- “Phone accessible” means a customer can use an ordinary telephone without mobile data; Pandora itself is cloud-powered.

## Ownership Boundaries
- ElevenLabs owns voice, turn-taking, native knowledge answers, call testing, and Twilio/SIP transport.
- n8n is the orchestration brain. Channel normalization, clarification state, action planning, approvals, reminders, and business automations are shared workflows.
- Supabase is the durable source of truth for Auth, organizations, memberships, conversations, tasks, reminders, approvals, billing, usage, channel identities, and workflow events.
- React/Vercel owns the authenticated dashboard and thin authenticated API boundaries. Do not rebuild workflow orchestration inside Vercel functions.

## Multi-Tenancy Invariants
- Every business record must be keyed by `organization_id`; authorization is membership- and role-based.
- Never trust an organization, role, plan, user ID, or verification level supplied by a browser, channel webhook, LLM, or ElevenLabs prompt. Resolve it at a trusted gateway.
- One shared n8n workflow suite serves all tenants. Never clone a workflow or native n8n credential per customer.
- All external requests carry a correlation ID and idempotency key. Mutations must be safe to retry.
- Cross-tenant RLS tests are release blockers.

## Credentials
- Customer OAuth tokens live encrypted in Supabase Vault. Metadata tables store Vault references, never raw access or refresh tokens.
- n8n holds one credential for the Supabase connector broker. Dynamic HTTP nodes pass tenant/action parameters, not customer secrets.
- Browser code may contain only Supabase publishable keys. Service-role, ElevenLabs, Twilio, Paystack, Google client secrets, n8n webhook secrets, and connector secrets are server-only.
- ElevenLabs tools authenticate to n8n with a secret auth connection. Provider webhooks must verify raw-body signatures and reject stale/replayed requests.
- ElevenLabs web and telephone sessions carry `secret__voice_context_token`, signed by the trusted Vercel boundary. n8n and post-call handlers derive tenant context from this token and ignore normal dynamic tenant variables for authorization.

## Action Safety
- Reads and non-external drafts may run automatically within plan and role permissions.
- Email sends, replies, calendar writes, outbound messages, and trash operations require an exact preview and explicit confirmation.
- Destructive or financial actions require dashboard approval or OTP. Permanent Gmail deletion, money movement, tax filing, and irreversible ledger posting are outside v1.
- Calendar actions must collect title, attendees/emails, date, start, duration/end, timezone, calendar, meeting mode, and conflict policy. Never guess missing email addresses or ambiguous times.

## n8n Workflow Lifecycle
- Search existing workflows and subworkflows before creating anything. Use typed `Define Below` subworkflow inputs.
- Get exact live node types before configuration. Do not guess node parameters and avoid Code nodes unless expressions cannot safely express the logic.
- Every fallible production node needs an explicit error output, bounded retries, timeout handling, and redacted error logging.
- Validate before create/update, fetch details after every save to verify connections, test with pinned inputs, then publish only after credentials and side-effect tests pass.
- Never run a test that can send, write, bill, or call without pinning or explicit staging authorization.
- Store versioned workflow exports and test fixtures under `n8n/`; production editor access is restricted and MFA-protected.

## Database And Retention
- All exposed tables require RLS. Authorization must not use editable `user_metadata`.
- `SECURITY DEFINER` functions belong in an unexposed schema, must set an empty search path, check the caller where applicable, and revoke default `PUBLIC` execution.
- Workflow payloads are redacted. Never log OAuth tokens, webhook secrets, OTPs, complete email bodies, card data, or unnecessary personal information.
- Call audio is off by default. Redacted transcripts retain for 30 days; minimal action summaries and audit events may persist under the organization’s retention policy.

## Verification And Release
- Required gates: lint, typecheck, unit/integration tests, production build, dependency audit, RLS/BOLA tests, webhook replay tests, browser tests, n8n validation, ElevenLabs simulations, and load/queue recovery tests.
- Maintain separate staging and production Supabase, n8n, ElevenLabs, Twilio, Google OAuth, and Paystack configuration.
- Do not claim production readiness while credentials, provider verification, n8n licensing, a Nigerian number strategy, backups, monitoring, or incident response remain unverified.
- Expand documentation whenever an invariant, public contract, provider setup, or operational procedure changes.
