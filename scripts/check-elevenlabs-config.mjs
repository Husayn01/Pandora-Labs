import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'elevenlabs');

async function json(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function propertyNames(schema) {
  if (!schema || typeof schema !== 'object') return [];
  const own = schema.properties ? Object.keys(schema.properties) : [];
  return own.concat(Object.values(schema).flatMap(propertyNames));
}

const agent = await json('agent-config.template.json');
assert(agent.name === 'Pandora Voice Operations', 'Unexpected shared agent name.');
assert(agent.conversation_config?.agent?.prompt?.llm === 'gpt-4o', 'Preferred LLM must be reviewed GPT-4o.');
assert(agent.platform_settings?.auth?.enable_auth === true, 'Private agent must require signed URL authentication.');
assert(agent.platform_settings?.privacy?.record_voice === false, 'Call audio storage must be disabled.');
assert(agent.platform_settings?.privacy?.retention_days === 30, 'Transcript retention must be 30 days.');

const expectedTools = [
  'pandora_lookup_knowledge',
  'pandora_plan_action',
  'pandora_confirm_action',
  'pandora_action_status',
];

for (const name of expectedTools) {
  const tool = await json(`tool_configs/${name}.json`);
  assert(tool.name === name, `Tool file/name mismatch for ${name}.`);
  assert(tool.type === 'webhook' && tool.method === 'POST', `${name} must be a POST webhook tool.`);
  assert(tool.url === '${PANDORA_BASE_URL}/api/voice/action', `${name} must use the fixed Pandora tool endpoint.`);
  assert(tool.headers?.['X-Pandora-Voice-Context'] === '{{secret__voice_context_token}}', `${name} must forward only the secret context token.`);
  assert(tool.body_schema?.additionalProperties === false, `${name} body must reject unknown fields.`);
  const acceptedProperties = propertyNames(tool.body_schema);
  assert(!acceptedProperties.some((property) => /^(organization(_id|Id)?|tenant(_id|Id)?|authorization|url|hostname|secret|token)$/i.test(property)), `${name} must not accept tenant, auth, URL, or secret input.`);
}

const suite = await json('evaluation_configs/scenarios.json');
assert(Array.isArray(suite.scenarios) && suite.scenarios.length >= 50, 'At least 50 ElevenLabs scenarios are required.');
assert(new Set(suite.scenarios.map(({ id }) => id)).size === suite.scenarios.length, 'Scenario IDs must be unique.');
const highRisk = suite.scenarios.filter(({ risk }) => risk === 'high');
assert(highRisk.length >= 10, 'At least ten high-risk scenarios are required.');
assert(suite.releasePolicy?.highRiskRepetitions >= 10, 'High-risk scenarios must run at least ten times.');
assert(suite.releasePolicy?.blockOnAnyUnauthorizedMutation === true, 'Unauthorized mutations must block release.');
assert(suite.releasePolicy?.blockOnAnyCrossTenantDisclosure === true, 'Cross-tenant disclosures must block release.');

console.log(`Validated Pandora ElevenLabs configuration: ${expectedTools.length} tools, ${suite.scenarios.length} scenarios, ${highRisk.length} high-risk.`);
