import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getTemporarySupabaseAccess } from './supabase-temp-access.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const migrationArguments = process.argv.slice(2);

if (migrationArguments.length === 0) {
  console.error('Choose a migration mode, for example --source-only or --dry-run.');
  process.exit(1);
}

let temporaryAccess;
try {
  temporaryAccess = getTemporarySupabaseAccess(repositoryRoot);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not obtain temporary Supabase access.');
  process.exit(1);
}

const migration = spawnSync(process.execPath, [resolve(toolDirectory, 'migrate.mjs'), ...migrationArguments], {
  cwd: toolDirectory,
  env: { ...process.env, SUPABASE_DB_URL: temporaryAccess.connectionString, SUPABASE_DB_ROLE: temporaryAccess.role },
  stdio: 'inherit',
});

process.exit(migration.status ?? 1);
