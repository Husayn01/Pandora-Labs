# Pandora Labs

Pandora is a voice-first business operations agent for web and telephone. ElevenLabs handles live voice, Twilio provides telephony, n8n orchestrates business operations, and Supabase provides identity, tenant isolation, durable state, audit logs, integrations, approvals, and billing records.

## Architecture

- React/Vite dashboard and web voice surface
- Vercel authenticated API and signed webhook adapters
- ElevenLabs Agents Platform for web and telephone conversations
- Twilio number for inbound and outbound telephony
- n8n shared multi-tenant workflow suite
- Supabase Auth, Postgres, RLS, Vault, and Edge Functions
- Paystack hosted subscription billing for Nigeria

Pandora uses one shared n8n workflow suite. Customer OAuth tokens never enter n8n; the Supabase Connector Broker resolves encrypted credentials by trusted workspace identity.

## Local setup

1. Install Node.js 22 or later.
2. Copy `.env.example` to `.env.local` and add non-production credentials.
3. Run `npm install`.
4. Run `npm run dev`.
5. Before a change is released, run `npm run verify` and `npm audit`.

## Production guides

- [ElevenLabs and Twilio setup](docs/ELEVENLABS_SETUP.md)
- [n8n multi-tenancy](docs/N8N_MULTI_TENANCY.md)
- [Production setup and release gates](docs/PRODUCTION_SETUP.md)
- [Pricing and unit economics](docs/PRICING_AND_UNIT_ECONOMICS.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Incident response](docs/INCIDENT_RESPONSE.md)
- [Backup and restoration](docs/BACKUP_RESTORE.md)
- [Rollback procedure](docs/ROLLBACK.md)
- [Versioned ElevenLabs configuration](elevenlabs/README.md)
- [n8n workflow build sequence](n8n/README.md)
- [Project lifecycle rules](AGENTS.md)

Production is intentionally fail-closed: voice, billing, Google, and n8n endpoints return a clear unavailable response until their server-only credentials are configured.
