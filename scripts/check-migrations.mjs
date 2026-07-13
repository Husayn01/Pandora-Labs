import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const migrationsDir = resolve('supabase/migrations');
const entries = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
const errors = [];
const prefixes = new Set();
// These deployed migrations are superseded by the private-schema hardening
// migration. Keep the exception explicit so no new unsafe function is added.
const legacySearchPathExceptions = new Set([
  '00001_initial_schema.sql',
  '00002_pandora_ops_backend.sql',
]);

for (const name of entries) {
  const prefix = name.split('_')[0];
  if (!/^\d{5,14}$/.test(prefix)) errors.push(`${name}: migration must start with a numeric version`);
  if (prefixes.has(prefix)) errors.push(`${name}: duplicate migration version ${prefix}`);
  prefixes.add(prefix);

  const path = resolve(migrationsDir, name);
  if ((await stat(path)).size === 0) errors.push(`${name}: migration is empty`);
  const sql = await readFile(path, 'utf8');
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
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${entries.length} Supabase migrations.`);
