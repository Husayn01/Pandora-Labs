# Pandora n8n Workflow Suite

The tenancy and scaling decision is documented in [`docs/N8N_MULTI_TENANCY.md`](../docs/N8N_MULTI_TENANCY.md).

Pandora uses one shared workflow suite for every organization. Tenant Google credentials never enter n8n; HTTP Request nodes call the deployed Supabase `connector-broker` with one service credential.

## Required shared workflows

1. **Pandora — Handle Command**: Webhook, secret validation, schema validation, tenant/entitlement lookup, intent classification, clarification state, subworkflow dispatch, response, and audit event.
2. **Pandora — Plan and Clarify Action**: Produces a deterministic action draft and a list of missing required fields. It asks one clarification at a time and never executes a mutation.
3. **Pandora — Google Workspace Action**: Typed tool subworkflow that calls only the connector broker operations documented below.
4. **Pandora — Tasks and Reminders**: Supabase-backed create/list/update/cancel operations with idempotency.
5. **Pandora — Invoice Draft and Reporting**: Draft-only invoice and summary operations.
6. **Pandora — Approval**: Creates an approval preview, waits for dashboard/OTP confirmation, validates expiry and payload hash, then releases the mutation.
7. **Pandora — Usage and Event Logger**: Appends redacted usage and workflow events.
8. **Pandora — Error Handler**: Captures execution metadata, redacts input, writes an error event, and alerts the operator without leaking secrets.
9. Channel shells: web, ElevenLabs action, post-call, SMS, Telegram and WhatsApp. Every shell emits the same `PandoraCommand` contract.

## Connector broker contract

`POST https://<project>.supabase.co/functions/v1/connector-broker`

Headers:

- `X-Pandora-Connector-Secret`: n8n credential; never an expression or text literal.
- `X-Correlation-Id`: propagated end to end.
- `Content-Type: application/json`

Body:

```json
{
  "organizationId": "uuid",
  "operation": "calendar.freebusy",
  "params": {
    "calendarId": "primary",
    "timeMin": "2026-07-14T13:00:00+01:00",
    "timeMax": "2026-07-14T13:30:00+01:00",
    "timeZone": "Africa/Lagos"
  },
  "approvalId": null,
  "idempotencyKey": "conversation:turn:action"
}
```

Allowed operations are `gmail.search`, `gmail.read`, `gmail.draft`, `gmail.send`, `gmail.trash`, `calendar.list`, `calendar.freebusy`, `calendar.create`, `calendar.update`, and `calendar.delete`. Mutating operations require an unexpired approved `approvalId` and a paid entitlement.

## Build and publish procedure

- Manually create the `Pandora Production` folder in the n8n project; MCP cannot create folders.
- Create credentials for Gemini, the connector broker custom header, Supabase service access where required, Twilio, and alert delivery. Customer Google credentials are not n8n credentials.
- Use the official n8n skill sequence: SDK reference, workflow best practices, node search, exact node types, node config validation, workflow validation, create/update, then `get_workflow_details` connection verification.
- Configure `saveDataSuccessExecution: none`, error-only execution retention, timeout, caller policy, timezone `Africa/Lagos`, error workflow, and bounded retries.
- Use pinned fixtures for the trigger, Gemini, broker HTTP node and all provider nodes. A test must not call real sends, writes, billing or telephony.
- Publish only after staging credentials exist and the tests in `docs/PRODUCTION_SETUP.md` pass.

## Current platform status

Direct workflow management is available through the authenticated official n8n MCP server. The first shared subworkflow, **Pandora — Google Workspace Action** (`Py2XzLnCUE1gnpKx`), exists on the live n8n workspace as an unpublished draft and is versioned at [`workflows/pandora-google-workspace-action.ts`](workflows/pandora-google-workspace-action.ts).

The workflow was built from live node definitions, validated by the n8n Workflow SDK, fetched after creation to verify every connection, and exercised with three pinned test executions:

- invalid operation rejection;
- read routing through the pinned connector-broker response;
- mutation routing through the pinned connector-broker response.

No test contacted Google or performed a write. Before publishing, create a dedicated n8n **Header Auth** credential whose header is `X-Pandora-Connector-Secret` and whose value matches the `PANDORA_CONNECTOR_SERVICE_SECRET` stored in the staging Supabase Edge Function. Attach it to both broker HTTP nodes, run staging read and approval-gated mutation tests, configure the workflow error handler, and then publish the verified version.
