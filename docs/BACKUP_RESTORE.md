# Pandora backup and restoration

## Backup scope

- Supabase/Postgres database, Vault references/metadata, storage objects, auth configuration, Edge Function source/config, and environment variable inventory.
- Versioned n8n workflow exports plus encrypted n8n database backup, encryption-key escrow, Redis/queue recovery procedure, and credential inventory.
- ElevenLabs agent/tool/test exports, Twilio number/routing configuration, Paystack plan mappings, Vercel deployment/environment inventory, and DNS configuration.

Secrets are backed up only in the approved secrets manager/escrow, never in Git or ordinary database exports.

## Restoration rehearsal

1. Restore into an isolated non-production environment with outbound network mutations disabled.
2. Restore Postgres/storage and verify migration versions, row counts, RLS, grants, checksums, Vault references, and retention state.
3. Restore n8n with the matching encryption key; keep workflows inactive. Validate connections and pinned mocked fixtures.
4. Restore provider configuration from versioned exports/inventories using staging credentials.
5. Run auth, BOLA, approval/idempotency, webhook replay, command recovery, reminder recovery, billing ledger, and dashboard smoke tests.
6. Record recovery-point loss, restoration time, mismatches, operator, artifacts, and remediation.

Perform the rehearsal before pilots and at least quarterly. A backup is not accepted until a clean environment can restore and pass the security checks.

## Data integrity after recovery

Commands with a dispatch marker but no verified terminal provider result become `uncertain`. Do not re-enqueue them automatically. Reconcile wallet/subscription records against signed Paystack events and verified transaction status before restoring billing enforcement.
