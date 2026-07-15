import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationsDir = resolve('supabase/migrations');
const entries = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
const errors = [];
const prefixes = new Set();
const sqlByName = new Map();
const resetBaseline = [
  '00001_initial_schema.sql',
  '00002_pandora_ops_backend.sql',
  '00003_voice_first_multitenant_platform.sql',
  '00004_integration_oauth_vault.sql',
  '00005_entitlements_and_usage_counters.sql',
  '00006_remove_legacy_agent_store_and_harden.sql',
  '00007_messages_conversation_index.sql',
  '00008_phone_identity_linking.sql',
  '00009_billing_state_rpcs.sql',
  '00010_channel_identity_privacy.sql',
  '00011_atomic_command_quota.sql',
];
const resetBaselineSet = new Set(resetBaseline);
const privilegedBoundaryVersion = '20260714143318';
// These deployed migrations are superseded by the private-schema hardening
// migration. Keep the exception explicit so no new unsafe function is added.
const legacySearchPathExceptions = new Set([
  '00001_initial_schema.sql',
  '00002_pandora_ops_backend.sql',
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const requirePattern = (sql, pattern, message) => {
  if (!pattern.test(sql)) errors.push(message);
};

for (const name of entries) {
  const prefix = name.split('_')[0];
  if (!/^\d{5,14}$/.test(prefix)) errors.push(`${name}: migration must start with a numeric version`);
  if (prefix.length !== 14 && !resetBaselineSet.has(name)) {
    errors.push(`${name}: new migrations must use a 14-digit timestamp; only 00001-00011 form the reset baseline`);
  }
  if (prefixes.has(prefix)) errors.push(`${name}: duplicate migration version ${prefix}`);
  prefixes.add(prefix);

  const path = resolve(migrationsDir, name);
  if ((await stat(path)).size === 0) errors.push(`${name}: migration is empty`);
  const sql = await readFile(path, 'utf8');
  sqlByName.set(name, sql);

  const functionStarts = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)\s*\(/gi)];
  for (let index = 0; index < functionStarts.length; index += 1) {
    const match = functionStarts[index];
    const start = match.index ?? 0;
    const end = functionStarts[index + 1]?.index ?? sql.length;
    const segment = sql.slice(start, end);
    const bodyStart = segment.search(/\bas\s+\$[A-Za-z0-9_]*\$/i);
    const header = bodyStart === -1 ? segment : segment.slice(0, bodyStart);
    const qualifiedName = match[1].replaceAll('"', '').toLowerCase();

    if (/\bsecurity\s+definer\b/i.test(header)) {
      if (!/\bset\s+search_path\s*=\s*''/i.test(header) && !legacySearchPathExceptions.has(name)) {
        errors.push(`${name}: SECURITY DEFINER function ${qualifiedName} must set an empty search_path`);
      }
      if (qualifiedName.startsWith('public.') && prefix.length === 14 && prefix >= privilegedBoundaryVersion) {
        errors.push(`${name}: new SECURITY DEFINER function ${qualifiedName} must live in an unexposed schema`);
      }
      if (!legacySearchPathExceptions.has(name)) {
        const unqualifiedName = qualifiedName.split('.').at(-1);
        const revokePattern = new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+[^\\s(]+\\.${escapeRegExp(unqualifiedName)}\\s*\\(`,
          'i',
        );
        if (!revokePattern.test(sql)) {
          errors.push(`${name}: SECURITY DEFINER function ${qualifiedName} must revoke default function execution`);
        }
      }
    }
  }

  if (
    /SECURITY\s+DEFINER/i.test(sql)
    && !/SET\s+search_path\s*=\s*''/i.test(sql)
    && !legacySearchPathExceptions.has(name)
  ) {
    errors.push(`${name}: SECURITY DEFINER migration must set an empty search_path`);
  }
  if (/GRANT\s+EXECUTE[\s\S]{0,240}\bTO\s+PUBLIC\b/i.test(sql)) {
    errors.push(`${name}: privileged function execution must not be granted to PUBLIC`);
  }
  if (prefix.length === 14 && /\bauth\.role\s*\(/i.test(sql)) {
    errors.push(`${name}: timestamped migrations must not use deprecated auth.role()`);
  }
  if (/grant\s+all(?:\s+privileges)?\s+on\s+(?:table\s+)?[^;]+\s+to\s+authenticated\b/i.test(sql)) {
    errors.push(`${name}: authenticated must never receive ALL table privileges`);
  }
}

for (const name of resetBaseline) {
  if (!sqlByName.has(name)) errors.push(`reset baseline is missing ${name}`);
}

const transitionSql = sqlByName.get('00003_voice_first_multitenant_platform.sql') ?? '';
const requiredTransitionColumns = new Map([
  ['profiles', ['onboarding_completed_at']],
  ['channel_identities', ['organization_id', 'external_id_hash', 'display_hint', 'role', 'verified_at']],
  ['tasks', ['organization_id', 'created_by', 'assignee_id', 'idempotency_key', 'metadata']],
  ['reminders', ['organization_id', 'created_by', 'idempotency_key', 'metadata']],
  ['workflow_events', ['organization_id', 'actor_user_id', 'correlation_id', 'redacted_payload', 'idempotency_key']],
]);

for (const [table, columns] of requiredTransitionColumns) {
  const statements = [...transitionSql.matchAll(new RegExp(`alter\\s+table\\s+public\\.${table}\\b[\\s\\S]*?;`, 'gi'))]
    .map((match) => match[0])
    .join('\n');
  for (const column of columns) {
    if (!new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, 'i').test(statements)) {
      errors.push(`00003_voice_first_multitenant_platform.sql: legacy ${table} transition must add ${column}`);
    }
  }
}

if (/create\s+policy\s+approvals\w*\s+on\s+public\.approval_requests\s+for\s+update/i.test(transitionSql)) {
  errors.push('00003_voice_first_multitenant_platform.sql: approval requests must not have a browser UPDATE policy');
}
if (/grant\s+select\s*,\s*update\s+on\s+public\.approval_requests\s+to\s+authenticated/i.test(transitionSql)) {
  errors.push('00003_voice_first_multitenant_platform.sql: authenticated users must have read-only approval request grants');
}
for (const legacyTrigger of ['on_auth_user_created_install_default_agents', 'on_auth_user_created_profile']) {
  if (!new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${legacyTrigger}\\s+on\\s+auth\\.users`, 'i').test(transitionSql)) {
    errors.push(`00003_voice_first_multitenant_platform.sql: transition must remove ${legacyTrigger}`);
  }
}

const cleanupSql = sqlByName.get('00006_remove_legacy_agent_store_and_harden.sql') ?? '';
for (const operation of ['upload', 'update', 'read', 'delete']) {
  const policy = `Users can ${operation} their own knowledge storage objects`;
  if (!cleanupSql.includes(`drop policy if exists "${policy}" on storage.objects`)) {
    errors.push(`00006_remove_legacy_agent_store_and_harden.sql: must remove legacy storage policy ${policy}`);
  }
}

const combinedSql = entries.map((name) => sqlByName.get(name) ?? '').join('\n');
const finalPublicTables = new Set();
for (const name of entries) {
  const sql = sqlByName.get(name) ?? '';
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
    finalPublicTables.add(match[1].toLowerCase());
  }
  for (const match of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
    finalPublicTables.delete(match[1].toLowerCase());
  }
}
for (const table of finalPublicTables) {
  const rlsPattern = new RegExp(`alter\\s+table\\s+public\\.${escapeRegExp(table)}\\s+enable\\s+row\\s+level\\s+security`, 'i');
  if (!rlsPattern.test(combinedSql)) {
    errors.push(`final public table ${table} must enable row level security`);
  }
}

const privilegedSql = sqlByName.get('20260714143318_privileged_function_boundaries.sql') ?? '';
for (const legacyFunction of [
  'store_integration_secret',
  'read_integration_secret',
  'delete_integration_secret',
  'apply_paystack_subscription_event',
  'set_subscription_status',
  'reserve_web_command_usage',
]) {
  requirePattern(
    privilegedSql,
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+private\\.${legacyFunction}\\s*\\(`, 'i'),
    `20260714143318_privileged_function_boundaries.sql: ${legacyFunction} implementation must live in private`,
  );
  requirePattern(
    privilegedSql,
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${legacyFunction}\\s*\\([\\s\\S]*?security\\s+invoker`, 'i'),
    `20260714143318_privileged_function_boundaries.sql: ${legacyFunction} public adapter must be SECURITY INVOKER`,
  );
}
requirePattern(
  privilegedSql,
  /foreign\s+key\s*\(billing_customer_id\s*,\s*organization_id\)[\s\S]*?references\s+public\.billing_customers\s*\(id\s*,\s*organization_id\)/i,
  '20260714143318_privileged_function_boundaries.sql: subscriptions must tenant-bind billing customers',
);

const runtimeSql = sqlByName.get('20260714143445_orchestration_runtime.sql') ?? '';
for (const tenantConstraint of [
  /foreign\s+key\s*\(task_id\s*,\s*organization_id\)[\s\S]*?references\s+public\.tasks\s*\(id\s*,\s*organization_id\)/i,
  /approval_requests_conversation_tenant_fk/i,
  /workflow_events_conversation_tenant_fk/i,
  /orchestration_commands_conversation_tenant_fk/i,
  /reminder_deliveries_reminder_tenant_fk/i,
  /voice_sessions_conversation_tenant_fk/i,
]) {
  requirePattern(
    runtimeSql,
    tenantConstraint,
    '20260714143445_orchestration_runtime.sql: every cross-resource runtime reference must be tenant-bound',
  );
}
for (const runtimeInvariant of [
  /for\s+update\s+of\s+r\s+skip\s+locked/i,
  /dispatch_started_at\s+is\s+not\s+null[\s\S]*?status\s*=\s*'uncertain'/i,
  /attempt_count\s*<\s*w\.max_attempts/i,
  /p_status\s*=\s*'succeeded'\s+and\s+p_result_fingerprint\s+is\s+null/i,
  /current_user\s*=\s*'authenticated'/i,
]) {
  requirePattern(
    runtimeSql,
    runtimeInvariant,
    '20260714143445_orchestration_runtime.sql: orchestration lease, retry, or client-field protection invariant is missing',
  );
}
for (const realtimeTable of [
  'tasks', 'reminders', 'workflow_events', 'approval_requests',
  'approval_decisions', 'integration_connections', 'channel_identities',
  'usage_counters', 'orchestration_commands', 'reminder_deliveries',
  'voice_sessions', 'voice_wallet_ledger',
]) {
  if (!runtimeSql.includes(`'${realtimeTable}'`)) {
    errors.push(`20260714143445_orchestration_runtime.sql: Realtime publication is missing ${realtimeTable}`);
  }
}

const knowledgeSql = sqlByName.get('20260715161116_tenant_knowledge_storage.sql') ?? '';
for (const policy of ['knowledge_admin_write', 'knowledge_admin_insert', 'knowledge_admin_update', 'knowledge_admin_delete']) {
  requirePattern(
    knowledgeSql,
    new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${policy}\\s+on\\s+public\\.knowledge_sources`, 'i'),
    `20260715161116_tenant_knowledge_storage.sql: browser knowledge mutation policy ${policy} must be removed`,
  );
}
requirePattern(
  knowledgeSql,
  /revoke\s+all\s+on\s+table\s+public\.knowledge_sources[\s\S]*?grant\s+select\s+on\s+table\s+public\.knowledge_sources\s+to\s+authenticated/i,
  '20260715161116_tenant_knowledge_storage.sql: tenant knowledge ingestion must be server-managed',
);
requirePattern(
  knowledgeSql,
  /create\s+or\s+replace\s+function\s+private\.purge_deleted_knowledge_chunks\s*\([\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*''/i,
  '20260715161116_tenant_knowledge_storage.sql: deletion propagation trigger must be a locked-down private definer',
);

const approvalSql = sqlByName.get('20260715164500_approval_binding_hardening.sql') ?? '';
for (const approvalInvariant of [
  /approval_decisions_request_tenant_fk/i,
  /decided approval requires a matching immutable ledger entry/i,
  /decision_idempotency_conflict/i,
  /organization_members_protect_binding/i,
  /channel_identities_membership_fk/i,
  /channel_link_tokens_membership_fk/i,
  /approval_decisions_actor_user_idx/i,
]) {
  requirePattern(
    approvalSql,
    approvalInvariant,
    '20260715164500_approval_binding_hardening.sql: approval, identity, membership, or advisor invariant is missing',
  );
}
for (const sensitiveWritePolicy of [
  'channels_admin_write', 'channels_admin_insert', 'channels_admin_update', 'channels_admin_delete',
  'integrations_admin_write', 'integrations_admin_insert', 'integrations_admin_update', 'integrations_admin_delete',
  'approvals_decider_update',
]) {
  requirePattern(
    approvalSql,
    new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${sensitiveWritePolicy}\\s+on`, 'i'),
    `20260715164500_approval_binding_hardening.sql: sensitive browser policy ${sensitiveWritePolicy} must be removed`,
  );
}
if (/create\s+policy\s+(?:channels|integrations|approvals)\w*[\s\S]{0,120}?for\s+(?:insert|update|delete|all)\s+to\s+authenticated/i.test(approvalSql)) {
  errors.push('20260715164500_approval_binding_hardening.sql: channel, integration, and approval mutations must remain server-only');
}
requirePattern(
  approvalSql,
  /grant\s+update\s*\(name\s*,\s*slug\s*,\s*timezone\s*,\s*locale\s*,\s*business_profile\)[\s\S]*?public\.organizations\s+to\s+authenticated/i,
  '20260715164500_approval_binding_hardening.sql: browser organization updates must exclude plan and account status',
);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${entries.length} Supabase migrations.`);
