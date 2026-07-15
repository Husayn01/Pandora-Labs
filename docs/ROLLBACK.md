# Pandora rollback procedure

## Application

Promote immutable tested deployments. Roll back to the recorded prior deployment when error rate, authorization failures, latency, or critical user journeys breach release thresholds. Keep affected mutations disabled until compatibility with current database/workflows is confirmed.

## Database

Prefer forward fixes. Every migration must be safe for the currently deployed application and workflow versions. Destructive schema rollback requires a tested restoration plan, explicit incident approval, and reconciliation of commands/webhooks created after the backup point. Never delete an audit, approval decision, payment receipt, or wallet entry to make rollback easier.

## n8n and providers

- Deactivate the failing workflow version and restore the previously exported version with the same typed contract; verify saved connections before activation.
- Switch ElevenLabs to the previous tested agent branch/config. Verify tools and context secrets before accepting protected calls.
- Restore prior Twilio/Paystack webhook routing only after signature and replay fixtures pass.

## Exit criteria

Auth, tenant isolation, JSON API contracts, approval binding, idempotency/uncertain behavior, dashboard reads, provider webhook verification, and the affected end-to-end journey must pass. Record the rollback reason, identifiers, data reconciliation, residual risk, and follow-up owner.
