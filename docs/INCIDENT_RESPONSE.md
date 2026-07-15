# Pandora incident response

## Severity

- **SEV-1:** suspected cross-tenant access, secret/token disclosure, unauthorized external mutation, payment/wallet corruption, or broad outage.
- **SEV-2:** provider/action path materially degraded, reminder backlog, elevated webhook rejection, or subscription drift without confirmed unauthorized access.
- **SEV-3:** isolated recoverable defect or degraded non-critical reporting.

## First 15 minutes

1. Assign incident commander and scribe; record UTC/Lagos timestamps and correlation IDs.
2. Preserve redacted evidence. Do not copy secrets or sensitive payloads into chat/tickets.
3. Contain with the narrowest kill switch. For possible tenant compromise, suspend the organization/session; for possible systemic compromise, disable the affected mutation boundary.
4. Revoke/rotate exposed credentials, disable affected provider webhooks or workflow versions, and preserve immutable audit/provider references.
5. Classify whether an external side effect is `succeeded`, `failed`, or `uncertain`. Never retry `uncertain` blindly.

## Investigation

Trace the correlation ID across Vercel, n8n execution, Supabase command/event/approval/webhook records, and provider references. Confirm actor, tenant, canonical hash, idempotency key, lease attempt, approval fingerprint, dispatch marker, and provider result. Run a scoped BOLA/replay test before restoring mutations.

## Recovery and communication

Restore from a known-good workflow/config/deployment only after the exploit path is closed. Notify affected customers and regulators according to counsel and applicable timelines; do not minimize uncertain exposure. Provide verified impact, actions taken, customer steps, and next update time.

## Post-incident

Within five business days, publish an internal blameless review with detection gap, root cause, affected records/actions, timeline, control failures, remediation owner/date, regression tests, and documentation changes. A SEV-1 cannot close while a required control remains manual and untracked.
