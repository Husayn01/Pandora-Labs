# Pandora operations runbook

## Daily checks

1. Review authentication, webhook rejection, command failure, uncertain mutation, reminder failure, payment drift, and voice-cost alerts.
2. Check n8n queue/concurrency, worker health, execution latency, and failure-workflow delivery.
3. Check Google refresh failures, revoked scopes, Paystack webhook lag, ElevenLabs concurrency, Twilio spend/geographic anomalies, and Supabase advisor changes.
4. Review only redacted events by correlation ID. Never paste tokens, complete email bodies, OTPs, card data, or raw transcripts into tickets.

## Release procedure

1. Confirm the target is isolated staging and side effects are mocked or allowlisted.
2. Apply migrations to a fresh staging database, then run the migration, RLS/BOLA, lease, approval, replay, and retention tests.
3. Validate n8n node configuration, saved connections, inactive error branches, pinned fixtures, and restart recovery. Activate only the tested workflow versions.
4. Compare the versioned ElevenLabs config with the environment export, query the current LLM/model status, and run all scenarios. High-risk scenarios run ten times.
5. Validate Twilio inbound routing/OTP/signatures and Paystack test-mode signed lifecycle fixtures.
6. Run repository gates, accessibility/performance checks, dependency/secret scans, and the required load/chaos profile.
7. Promote the exact tested deployment. Record commit, deployment ID, migration versions, workflow IDs/versions, agent branch/environment, operator, and rollback point.

## Kill switches

Keep independent environment flags for `PANDORA_VOICE_MUTATIONS_ENABLED`, `PANDORA_BILLING_ENFORCEMENT_ENABLED`, and `PANDORA_OUTBOUND_CALLING_ENABLED`. Default every missing flag to disabled. Disabling a mutation path must preserve reads, audit access, and existing customer data.

## Credential rotation

- Rotate webhook/connector/signing secrets by accepting current and next versions for a short controlled window, update consumers, verify, then revoke the old value.
- Rotate Google client credentials without exposing customer refresh tokens. Test refresh-token rotation and revoked-grant recovery in staging.
- Record owner, creation, last rotation, next due date, and affected environments. Never store the secret value in the record.

## Capacity triggers

Move n8n to tested queue mode before sustained execution/concurrency exceeds 70% of the current quota. Alert before ElevenLabs minutes/concurrency, Supabase connections/storage, Twilio spend, Paystack drift, or Vercel function limits reach 70%. Paid onboarding pauses when safe headroom is unavailable.

## Current release blockers

Production remains blocked until isolated staging credentials, n8n commercial licensing confirmation, Nigerian number/SIP strategy, provider business verification, monitoring destinations, backup/restore evidence, and the complete release gate are verified.
