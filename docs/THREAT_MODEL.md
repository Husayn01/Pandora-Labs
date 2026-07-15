# Pandora threat model

## Protected assets

- Customer identity, organization membership, role, verification level, and entitlements.
- Google OAuth refresh/access tokens stored in Supabase Vault.
- Email, calendar, knowledge, task, reminder, invoice, report, transcript, audit, and billing data.
- Connector, webhook, provider, payment, signing, OTP, and service-role secrets.
- Immutable approvals, idempotency records, wallet entries, and provider result state.

## Trust boundaries

The browser, caller ID, Twilio/ElevenLabs normal variables, model output, retrieved documents, and all user-provided fields are untrusted. Vercel verifies the authenticated web session or provider boundary and creates signed context. n8n may orchestrate only typed actions under that context. The fixed persistence boundary and connector broker derive organization and execution state from durable records. Supabase RLS remains the final tenant boundary.

## Primary abuse cases and controls

| Threat | Required controls | Release evidence |
|---|---|---|
| Browser or voice BOLA | Ignore supplied tenant/role; derive membership; RLS on every exposed table; composite tenant FKs | Two-user/two-organization endpoint and table tests |
| Caller-ID spoofing | Number is routing only; linked identity plus OTP/dashboard approval for private/high-risk work | Spoofed-number and expired-OTP tests |
| Prompt/document injection | Tool output is data; fixed operation allowlist; no dynamic URL/header; citation threshold | Spoken and document injection simulations |
| OAuth token theft | Vault storage; scoped read/rotation RPCs; no workflow/browser tokens; redacted logs | Grant audit and log scan |
| Duplicate external mutation | Canonical payload hash; unique idempotency key; execution lease/attempt; dispatch marker; uncertain state | Concurrent confirmation, timeout, and replay tests |
| Approval substitution | Bind org, actor, action, canonical hash, expiry, and idempotency key; immutable decision ledger | Changed-payload and expired-approval tests |
| Webhook forgery/replay | Exact raw-body signature; timestamp window where provided; durable provider-event dedupe; bounded body | Forged, stale, duplicate, oversized fixtures |
| SSRF/secret exfiltration | Environment-fixed hosts; allowlisted operations; no caller URL/auth headers; response bounds | SSRF and oversized-response tests |
| Wallet or subscription fraud | Signed Paystack receipt; server verification; atomic ledger; no caller-supplied balance/plan | Replay, mismatched amount/currency/plan tests |
| Cross-channel privilege escalation | Link channels only after web verification; secret signed context; session expiry/revocation | Channel-link and logged-out-session tests |
| Sensitive retention | Audio off; redacted transcript 30 days; deletion propagation; retention job evidence | Retention query and deletion rehearsal |

## Fail-closed rules

- Missing configuration, stale context, ambiguous identity, hash mismatch, expired approval, unavailable entitlement, or uncertain mutation returns a bounded error and creates no new external side effect.
- An uncertain provider mutation is investigated by idempotency/provider reference. It is never blindly retried.
- Kill switches independently disable voice mutations, billing enforcement, and outbound calling.

Review this model after every new channel, provider, action type, role, or data class. Any newly exposed table or operation requires a matching abuse case and test before release.
