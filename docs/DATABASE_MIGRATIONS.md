# Database migration lifecycle

Pandora has two migration lineages that must not be confused:

- `00001` through `00011` are the consolidated reset baseline used to build a fresh local or staging database from zero.
- Timestamped migrations are forward-only product changes applied after that baseline.
- The existing production project predates the consolidated reset baseline and therefore has different historical version numbers. Production history is never rewritten to resemble the repository.

## Baseline assumption

The reset baseline intentionally preserves the legacy-to-multi-tenant transition so it can prove that old user-owned rows are migrated safely. `00003_voice_first_multitenant_platform.sql` explicitly adds every tenant column to the tables created by `00002`, backfills one isolated organization per legacy user, removes plaintext/legacy ownership columns, removes legacy auth triggers and policies, and then creates the tenant-scoped policy set.

A fresh reset should not contain real customer rows. The legacy backfill exists as a structural and regression safeguard, not as the production rollout mechanism. Production data changes must be tested on an isolated staging copy with representative fixtures first.

## Production drift snapshot — 2026-07-15

The connected production project reports these relevant later versions:

| Production version | Logical migration |
|---|---|
| `20260712214925` | `voice_first_multitenant_platform` |
| `20260712221343` | `integration_oauth_vault` |
| `20260712223154` | `entitlements_and_usage_counters` |
| `20260712225105` | `remove_legacy_agent_store_and_harden` |
| `20260713134236` | `messages_conversation_index` |
| `20260713142553` | `phone_identity_linking` |
| `20260713144832` | `billing_state_rpcs` |
| `20260713145735` | `channel_identity_privacy` |
| `20260713151215` | `atomic_command_quota` |
| `20260715153233` | `approval_decision_ledger` |

The repository uses short versions for the consolidated baseline and a different source timestamp for the approval ledger. This is expected historical drift. Do not run a generic `supabase db push` against production: it would treat consolidated baseline files as pending even though their logical schema changes already exist.

## Safe release process

1. Reset an isolated staging project from the complete repository chain.
2. Run `npm run test:migrations`, RLS/BOLA tests, approval concurrency/replay tests, and Supabase database advisors.
3. Compare staging and production schemas by object definition, policy, grant, trigger, and function body—not only by migration version.
4. Apply only reviewed forward timestamped migrations to production through the controlled migration runner.
5. Record the production-assigned version beside the source migration in the release evidence.
6. Generate TypeScript types from the promoted database and verify the PostgREST schema cache reload.

Never use `supabase migration repair` or direct writes to `supabase_migrations.schema_migrations` merely to make the numbers match. A history repair requires a separately reviewed runbook, a schema-equivalence proof, backup/restore verification, and explicit release authorization.

## Forward migrations awaiting staging

The following source migrations are intentionally present in the repository but must not be applied to production before the isolated staging reset and upgrade rehearsal:

| Source version | Purpose |
|---|---|
| `20260714143318` | Move privileged bodies to `private`, narrow Vault access, tenant-bind billing customers, and harden billing/quota state changes |
| `20260714143445` | Durable command, webhook, reminder, voice-session, phone-assignment, and wallet runtime with leases and bounded recovery |
| `20260715161116` | Tenant knowledge sources/chunks, private storage bucket, vector retrieval, ingestion controls, and deletion propagation |
| `20260715164500` | Immutable approval binding, tenant-bound identity records, membership role controls, and browser privilege reduction |

The repository migration checker is a static safety gate. It verifies naming, ordering, final-table RLS coverage, private `SECURITY DEFINER` placement and revocation, sensitive browser-policy removal, critical tenant foreign keys, bounded retry markers, Realtime membership, and approval/knowledge invariants. It is not a PostgreSQL parser and cannot replace a real database replay.

At this checkpoint, Docker's database engine is not running and an isolated Supabase staging project has not been authorized, so the full chain has not yet been executed against a disposable Postgres instance. `npm run test:migrations` passing means the static contract is green; it does not mean the migrations are promoted or production-ready.

## Required staging preflight

Before applying the four forward migrations, fail the release if any of these audits return rows:

- a reminder references a task from another organization;
- an approval request or workflow event references a conversation from another organization;
- a subscription references a billing customer from another organization;
- an approval decision carries a different organization than its approval request;
- a channel link token or linked channel identity references a user who is not a member of the same organization;
- a channel identity without a linked user carries an operator role;
- a tenant knowledge source still has an `elevenlabs_document_id` without an approved migration/deletion record;
- an approval payload hash is not canonical lowercase SHA-256;
- an existing approval decision cannot be tied to the original request actor, expiry, payload, action, and idempotency key.

Run both paths in staging:

1. Reset from `00001` through the final timestamped migration with fixtures present before `00003` to exercise the legacy-to-tenant transition.
2. Restore a scrubbed production-shaped schema/data snapshot, mark the logically deployed baseline migrations as already applied in the disposable environment, and run only the reviewed forward timestamped migrations.

Then verify:

- every final `public` table has RLS enabled and no unexpected permissive policy;
- `anon` and `authenticated` cannot execute private functions or mutate approvals, workflow events, channel identities, integration connections, knowledge ingestion state, wallet rows, or runtime lease fields;
- authenticated organization updates cannot change `plan_code`, account `status`, or ownership;
- admins cannot promote themselves, change owner membership, or modify another admin/owner; owners cannot create another owner without the trusted transfer path;
- column privileges hide `vault_secret_id`, provider account identifiers, identity hashes, routing hashes, and other server-only metadata;
- expired non-idempotent work becomes `uncertain`, safe/idempotent work retries only up to its configured bound, and stale lease tokens cannot finish newer attempts;
- wallet, approval, webhook, and command idempotency keys reject changed payloads and concurrent duplicate side effects;
- Supabase Realtime respects both RLS and column privileges for the published integration and identity tables; if a full-row payload exposes a restricted column, remove that table from the publication and publish a safe projection/event instead;
- the knowledge deletion trigger can remove chunks while direct browser writes remain denied;
- PostgREST reloads its schema and all service-role-only wrappers are callable only with the expected signatures.

After the replay, run Supabase security and performance advisors. The current live advisor snapshot has one configuration blocker: leaked-password protection is disabled. Enable it in Auth settings before production release. The current performance advisor also requires an index on `approval_decisions(actor_user_id)`; `20260715164500` now creates `approval_decisions_actor_user_idx`. Do not remove indexes merely because the current production dataset is young or empty.

## Action-plan durability boundary

The conversational planning command and the confirmed external mutation are two different durable records. The gateway cannot hash-bind an exact provider payload before n8n has normalized the user's utterance, collected missing fields, and produced the immutable preview.

Before voice mutations are enabled, add a separately reviewed, service-only action-plan artifact that stores the tenant, actor, conversation, normalized action type, canonical payload hash, redacted exact preview, expiry, risk, correlation ID, and planning idempotency key. Confirmation must reference that immutable plan and create or claim a child execution command whose canonical hash matches it. The browser, ElevenLabs prompt, and normal dynamic variables must never be allowed to insert or rewrite the canonical plan payload. Do not overload a public payload table or accept a confirmation request that resubmits a rewritten payload.

## Approval hardening validation

Before promotion of `20260715164500_approval_binding_hardening.sql`, staging must prove:

- authenticated clients can select only same-organization approval requests and decisions;
- authenticated clients cannot insert, update, or delete approval records directly;
- a suspended member, viewer, or ordinary member cannot decide an approval;
- only an active owner/admin can decide through the service-only RPC;
- payload, organization, actor, expiry, action type, or idempotency changes cause a binding failure;
- replaying the same decision idempotency key is safe, while a changed decision is rejected;
- expired and concurrent decisions cannot create more than one ledger row;
- decision rows and approval binding fields reject update/delete attempts;
- `NOTIFY pgrst, 'reload schema'` makes the new columns and wrapper visible to PostgREST.

The payload-hash format checks are added `NOT VALID` so legacy rows cannot block deployment. They still protect all new or changed rows. Validate those constraints only after the staging audit proves every historical payload hash is canonical lowercase SHA-256.
