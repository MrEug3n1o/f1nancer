import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, chmodSync, existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getTemporarySupabaseAccess } from './supabase-temp-access.mjs';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, '../..');
const outputArgument = process.argv.slice(2).find(argument => argument.startsWith('--output='));
const requestedOutput = outputArgument?.slice('--output='.length);

if (!requestedOutput || !isAbsolute(requestedOutput)) {
  console.error('Provide an absolute backup destination with --output=/secure/path/f1nancer-before-firebase.dump.');
  process.exit(1);
}

let output;
try {
  output = resolve(realpathSync(dirname(requestedOutput)), basename(requestedOutput));
} catch {
  console.error('The backup destination directory does not exist.');
  process.exit(1);
}
if (output === repositoryRoot || output.startsWith(`${repositoryRoot}${sep}`)) {
  console.error('The backup must be stored outside the Git repository.');
  process.exit(1);
}
if (existsSync(output)) {
  console.error('The backup destination already exists; refusing to overwrite it.');
  process.exit(1);
}

let access;
try {
  access = getTemporarySupabaseAccess(repositoryRoot);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not obtain temporary Supabase access.');
  process.exit(1);
}

const pgDump = existsSync('/opt/homebrew/opt/libpq/bin/pg_dump')
  ? '/opt/homebrew/opt/libpq/bin/pg_dump' : 'pg_dump';
const dumped = spawnSync(pgDump, [
  `--role=${access.role}`, '--format=custom', '--no-owner', '--no-privileges',
  '--schema=auth', '--schema=public', `--file=${output}`,
], { env: { ...process.env, ...access.pgEnvironment }, stdio: 'inherit' });
if (dumped.status !== 0) {
  console.error('Supabase backup failed.');
  process.exit(dumped.status || 1);
}
chmodSync(output, 0o600);

const pgRestore = existsSync('/opt/homebrew/opt/libpq/bin/pg_restore')
  ? '/opt/homebrew/opt/libpq/bin/pg_restore' : 'pg_restore';
const listed = spawnSync(pgRestore, ['--list', output], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (listed.status !== 0) {
  console.error('The backup was created but pg_restore could not read its catalog.');
  process.exit(2);
}
const requiredTables = [
  'auth users', 'public profiles', 'public currencies', 'public categories', 'public settings',
  'public goals', 'public deposits', 'public credit_debts', 'public recurring_rules',
  'public budgets', 'public transactions',
];
const missingTables = requiredTables.filter(table => !listed.stdout.includes(`TABLE DATA ${table} `));
if (missingTables.length) {
  console.error(`Backup catalog is missing ${missingTables.length} required table-data entries.`);
  process.exit(2);
}

const checksum = createHash('sha256');
await new Promise((resolvePromise, rejectPromise) => {
  const stream = createReadStream(output);
  stream.on('data', chunk => checksum.update(chunk));
  stream.on('end', resolvePromise);
  stream.on('error', rejectPromise);
});
console.log(JSON.stringify({
  output, bytes: statSync(output).size, sha256: checksum.digest('hex'),
  permissions: '0600', requiredTableDataEntries: requiredTables.length, passed: true,
}, null, 2));
