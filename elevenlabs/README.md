# Pandora ElevenLabs configuration

This directory is the versioned source for the single shared Pandora agent. It contains no API keys, tenant IDs, phone numbers, or production tool IDs.

## Deployment contract

1. Create separate staging and production ElevenLabs environments.
2. Create the four webhook tools from `tool_configs/`, using the fixed environment-specific Pandora domain. Attach a secret auth header for `X-Pandora-ElevenLabs-Secret`; never paste the secret into JSON.
3. Replace only `${...}` deployment placeholders. Load `PANDORA_SYSTEM_PROMPT.md` as the agent prompt and attach the returned tool IDs.
4. Keep signed-URL authentication enabled. Do not configure an origin allowlist on the same private agent.
5. Select a production-licensed voice only after the Nigerian-name/GSM evaluation scorecard passes. Do not commit a chosen voice ID until licensing and staging approval are recorded.
6. Enable the `skip_turn`, `end_call`, and `transfer_to_number` system tools in the ElevenLabs editor. Transfer destinations must be verified environment configuration, not model parameters.
7. Disable call audio storage and set transcript retention to 30 days, or use Zero Retention Mode when the account supports it. Pandora persists only the redacted post-call record it needs.
8. Link a staging Twilio number and enable inbound conversation-initiation data. Point the initiation webhook at `/api/telephony/twilio/context` (the legacy `/api/voice/init` alias may remain during migration).
9. Run the complete scenario set repeatedly before promoting the agent branch/environment.

The preferred LLM is `gpt-4o`. ElevenLabs manages provider fallback through its production LLM cascading mechanism; `gpt-4o-mini` must not be configured as a fallback because the current model-list documentation marks it deprecated. Query `GET /v1/convai/llm/list` with the environment API key before each release and block deployment when the preferred model is deprecated or unavailable.

Some dashboard/API field names change as ElevenLabs evolves. Treat `agent-config.template.json` as a reviewed deployment specification and compare it with `GET /v1/convai/agents/{agent_id}` before applying. Never blindly upload a template to production.
