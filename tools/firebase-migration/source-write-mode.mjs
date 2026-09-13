import process from 'node:process';
import pg from 'pg';
import { getTemporarySupabaseAccess } from './supabase-temp-access.mjs';

const SOURCE_PROJECT_REF = 'xtqudnqthpakdaonrwir';
const TABLES = [
  'profiles', 'currencies', 'categories', 'settings', 'goals', 'deposits',
  'credit_debts', 'recurring_rules', 'budgets', 'transactions',
];
const args = new Set(process.argv.slice(2));
const modes = ['--check', '--freeze', '--unfreeze'].filter(value => args.has(value));

if (modes.length !== 1) {
  console.error('Choose exactly one of --check, --freeze, or --unfreeze.');
  process.exit(1);
}

const mode = modes[0].slice(2);
if (mode !== 'check' && !args.has(`--confirm-project=${SOURCE_PROJECT_REF}`)) {
  console.error(`Changing source write mode requires --confirm-project=${SOURCE_PROJECT_REF}.`);
  process.exit(1);
}

const repositoryRoot = new URL('../..', import.meta.url).pathname;
const temporaryAccess = getTemporarySupabaseAccess(repositoryRoot);
const client = new pg.Client({ connectionString: temporaryAccess.connectionString });

async function setTrustedRole() {
  if (!['postgres', 'supabase_admin'].includes(temporaryAccess.role)) {
    throw new Error('Temporary Supabase access did not provide an allow-listed role.');
  }
  await client.query(`SET LOCAL ROLE ${temporaryAccess.role}`);
}

async function setRecurringJobActive(active) {
  const available = (await client.query("select to_regclass('cron.job') is not null as available")).rows[0].available;
  if (!available) return;
  const jobs = (await client.query(
    "select jobid::bigint from cron.job where jobname = 'f1nancer-process-recurring'",
  )).rows;
  for (const job of jobs) {
    await client.query('select cron.alter_job(job_id := $1, active := $2)', [job.jobid, active]);
  }
}

async function readStatus() {
  const tableStatus = (await client.query(`
    select table_name,
      has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as can_insert,
      has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as can_update,
      has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as can_delete
    from unnest($1::text[]) as table_name
    order by table_name
  `, [TABLES])).rows;
  const functions = (await client.query(`
    select
      has_function_privilege('authenticated', 'public.apply_sync_batch(uuid,jsonb)', 'EXECUTE') as public_sync,
      has_function_privilege('authenticated', 'f1_sync_private.apply_sync_batch(uuid,jsonb)', 'EXECUTE') as private_sync,
      has_function_privilege('authenticated', 'public.process_due_recurring_rules()', 'EXECUTE') as recurring
  `)).rows[0];
  const cronAvailable = (await client.query("select to_regclass('cron.job') is not null as available")).rows[0].available;
  const activeRecurringJobs = cronAvailable
    ? Number((await client.query("select count(*)::int as count from cron.job where jobname = 'f1nancer-process-recurring' and active")).rows[0].count)
    : 0;
  const writableTables = tableStatus.filter(row => row.can_insert || row.can_update || row.can_delete).map(row => row.table_name);
  const executableWriteFunctions = Object.entries(functions).filter(([, allowed]) => allowed).map(([name]) => name);
  return {
    project: SOURCE_PROJECT_REF,
    writesFrozen: writableTables.length === 0 && executableWriteFunctions.length === 0 && activeRecurringJobs === 0,
    writableTables,
    executableWriteFunctions,
    activeRecurringJobs,
  };
}

try {
  await client.connect();
  await client.query('BEGIN');
  await setTrustedRole();
  if (mode === 'freeze') {
    await client.query(`REVOKE INSERT, UPDATE, DELETE ON TABLE ${TABLES.map(table => `public.${table}`).join(', ')} FROM authenticated`);
    await client.query('REVOKE EXECUTE ON FUNCTION public.apply_sync_batch(uuid, jsonb) FROM authenticated');
    await client.query('REVOKE EXECUTE ON FUNCTION f1_sync_private.apply_sync_batch(uuid, jsonb) FROM authenticated');
    await client.query('REVOKE EXECUTE ON FUNCTION public.process_due_recurring_rules() FROM authenticated');
    await setRecurringJobActive(false);
  } else if (mode === 'unfreeze') {
    await client.query(`GRANT INSERT, UPDATE, DELETE ON TABLE ${TABLES.map(table => `public.${table}`).join(', ')} TO authenticated`);
    await client.query('GRANT EXECUTE ON FUNCTION public.apply_sync_batch(uuid, jsonb) TO authenticated');
    await client.query('GRANT EXECUTE ON FUNCTION f1_sync_private.apply_sync_batch(uuid, jsonb) TO authenticated');
    await client.query('GRANT EXECUTE ON FUNCTION public.process_due_recurring_rules() TO authenticated');
    await setRecurringJobActive(true);
  }
  const status = await readStatus();
  await client.query('COMMIT');
  console.log(JSON.stringify({ mode, ...status, passed: mode === 'unfreeze' ? !status.writesFrozen : mode === 'check' || status.writesFrozen }, null, 2));
  if (mode === 'freeze' && !status.writesFrozen) process.exitCode = 2;
  if (mode === 'unfreeze' && status.writesFrozen) process.exitCode = 2;
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`Source write-mode command stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
