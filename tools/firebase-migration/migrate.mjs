import crypto from 'node:crypto';
import process from 'node:process';
import 'dotenv/config';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const REHEARSAL = args.has('--rehearsal');
const PROJECT_ID = REHEARSAL ? 'f1nancer-rules-test' : 'f1nancer';
const SOURCE_PROJECT_REF = 'xtqudnqthpakdaonrwir';
const LEGACY_EMAIL_SUFFIX = '@users.f1nancer.local';
const SOURCE_WRITE_TABLES = [
  'profiles', 'currencies', 'categories', 'settings', 'goals', 'deposits',
  'credit_debts', 'recurring_rules', 'budgets', 'transactions',
];
const TABLES = {
  currencies: ['id', 'user_id', 'created_at', 'updated_at', 'code', 'name'],
  categories: ['id', 'user_id', 'created_at', 'updated_at', 'name', 'type', 'color'],
  settings: ['id', 'user_id', 'created_at', 'updated_at', 'default_currency_code', 'theme', 'locale', 'dashboard_widgets', 'stats_charts', 'dashboard_widget_views', 'dashboard_widget_layout'],
  goals: ['id', 'user_id', 'created_at', 'updated_at', 'name', 'target_amount', 'current_amount', 'currency_code', 'deadline', 'status'],
  deposits: ['id', 'user_id', 'created_at', 'updated_at', 'name', 'type', 'principal_cents', 'currency_code', 'start_date', 'end_date', 'annual_rate_bps', 'counterparty', 'note', 'status', 'money_location'],
  credit_debts: ['id', 'user_id', 'created_at', 'updated_at', 'name', 'direction', 'source', 'principal_cents', 'currency_code', 'start_date', 'due_date', 'annual_rate_bps', 'counterparty', 'note', 'status'],
  recurring_rules: ['id', 'user_id', 'created_at', 'updated_at', 'amount', 'currency_code', 'category_id', 'type', 'cadence', 'billing_day', 'next_run_date', 'note', 'active', 'money_location'],
  budgets: ['id', 'user_id', 'created_at', 'updated_at', 'category_id', 'limit_cents', 'currency_code'],
  transactions: ['id', 'user_id', 'created_at', 'updated_at', 'amount', 'currency_code', 'date', 'type', 'category_id', 'note', 'recurring_id', 'goal_id', 'credit_debt_id', 'money_location'],
};
const mode = REHEARSAL ? 'rehearsal' : args.has('--source-only') ? 'source-only'
  : args.has('--apply') ? 'apply' : args.has('--verify') ? 'verify' : 'dry-run';
if ([...args].filter(value => ['--apply', '--verify', '--dry-run', '--rehearsal', '--source-only'].includes(value)).length > 1) fail('Choose only one mode.');
if (REHEARSAL) validateRehearsalEnvironment();
if (mode === 'apply' && !args.has(`--confirm-project=${PROJECT_ID}`)) fail(`Apply requires --confirm-project=${PROJECT_ID}.`);
if (mode === 'apply' && process.env.SUPABASE_BACKUP_CONFIRMED !== 'yes') fail('Apply requires SUPABASE_BACKUP_CONFIRMED=yes after a fresh pg_dump backup.');
if (!REHEARSAL) {
  if (!process.env.SUPABASE_DB_URL) fail('Set SUPABASE_DB_URL in the ignored .env file or shell. Do not commit or paste it into logs.');
  validateSourceUrl(process.env.SUPABASE_DB_URL);
}

function fail(message) { console.error(`Migration stopped: ${message}`); process.exit(1); }
function validateRehearsalEnvironment() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '';
  if (!/^(127\.0\.0\.1|localhost):9099$/.test(authHost)
    || !/^(127\.0\.0\.1|localhost):8080$/.test(firestoreHost)
    || process.env.GCLOUD_PROJECT !== 'f1nancer-rules-test') {
    fail('Rehearsal is allowed only against the local Auth and Firestore emulators for f1nancer-rules-test.');
  }
}
function validateSourceUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('SUPABASE_DB_URL is not a valid PostgreSQL URL.'); }
  let username = '';
  try { username = decodeURIComponent(url.username); } catch { fail('SUPABASE_DB_URL contains invalid percent encoding.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password
    || url.password.includes('REPLACE_WITH_')
    || !`${url.hostname}:${username}`.includes(SOURCE_PROJECT_REF)) {
    fail(`SUPABASE_DB_URL must target the expected source project ${SOURCE_PROJECT_REF} and include its password.`);
  }
}
function sourceConnectionString(value) {
  const url = new URL(value);
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  url.searchParams.set('uselibpqcompat', 'true');
  return url.toString();
}
function chunks(values, size) { const result = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size)); return result; }
function plain(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, plain(item)]));
  return value;
}
function canonical(value) { return JSON.stringify(plain(value)); }
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function asFirestoreRow(table, row) {
  const result = plain(row);
  if (table === 'recurring_rules') result.active = result.active ? 1 : 0;
  return result;
}
function tableCounts(source) { return Object.fromEntries(Object.entries(source.tables).map(([table, rows]) => [table, rows.length])); }
function accountCounts(source) {
  const legacySyntheticEmails = source.users.filter(user => user.email.toLowerCase().endsWith(LEGACY_EMAIL_SUFFIX)).length;
  return {
    legacySyntheticEmails,
    realEmails: source.users.length - legacySyntheticEmails,
    emailVerified: source.users.filter(user => Boolean(user.email_confirmed_at)).length,
    disabled: source.users.filter(user => Boolean(user.disabled)).length,
  };
}
function accountDocument(user) {
  return {
    uid: user.uid, email: user.email.toLowerCase(), legacy_username: user.username,
    created_at: user.created_at, updated_at: user.updated_at,
    email_migration_required: user.email.toLowerCase().endsWith(LEGACY_EMAIL_SUFFIX),
    marketing_email_consent: false, marketing_email_consent_at: null, migration_source: 'supabase',
  };
}

async function assertSourceWritesFrozen(client) {
  const tableRows = (await client.query(`
    select table_name,
      has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as can_insert,
      has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as can_update,
      has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as can_delete
    from unnest($1::text[]) as table_name
  `, [SOURCE_WRITE_TABLES])).rows;
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
  const hasTableWrites = tableRows.some(row => row.can_insert || row.can_update || row.can_delete);
  if (hasTableWrites || Object.values(functions).some(Boolean) || activeRecurringJobs > 0) {
    throw new Error('Supabase writes are still enabled. Run npm run freeze-source-writes before apply.');
  }
}

async function loadSource() {
  const client = new pg.Client({ connectionString: sourceConnectionString(process.env.SUPABASE_DB_URL) });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const requestedRole = process.env.SUPABASE_DB_ROLE;
    if (requestedRole) {
      if (!['postgres', 'supabase_admin'].includes(requestedRole)) throw new Error('SUPABASE_DB_ROLE is not allow-listed.');
      await client.query(`SET LOCAL ROLE ${requestedRole}`);
    }
    if (mode === 'apply') await assertSourceWritesFrozen(client);
    const authResult = await client.query(`
      select u.id::text as uid, u.email, u.encrypted_password, u.created_at as auth_created_at,
             u.email_confirmed_at,
             case when u.banned_until is not null and u.banned_until > now() then true else false end as disabled,
             p.username::text, p.created_at, p.updated_at
      from auth.users u join public.profiles p on p.id = u.id
      order by u.id
    `);
    const [{ auth_count: authCount, profile_count: profileCount }] = (await client.query(`
      select (select count(*)::int from auth.users) as auth_count,
             (select count(*)::int from public.profiles) as profile_count
    `)).rows;
    if (Number(authCount) !== authResult.rows.length || Number(profileCount) !== authResult.rows.length) {
      throw new Error('Supabase Auth users and profiles are not in an exact one-to-one relationship.');
    }
    const tables = {};
    for (const [table, columns] of Object.entries(TABLES)) {
      tables[table] = (await client.query(`select ${columns.map(column => `${column}${column === 'id' || column.endsWith('_id') ? '::text' : ''}`).join(', ')} from public.${table} order by id`)).rows.map(row => asFirestoreRow(table, row));
    }
    await client.query('COMMIT');
    return prepareSource(authResult.rows.map(row => plain(row)), tables);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

function prepareSource(users, tables) {
  validateSource(users, tables);
  const fingerprints = new Map(users.map(user => [user.uid, digest({
    user,
    tables: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.filter(row => row.user_id === user.uid)])),
  })]));
  return { users, tables, fingerprints };
}

async function buildRehearsalSource() {
  const createdAt = '2024-02-03T10:20:30.000Z';
  const updatedAt = '2026-08-09T12:34:56.000Z';
  const uid = '11111111-1111-4111-8111-111111111111';
  const email = 'legacyfixture@users.f1nancer.local';
  const password = 'Legacy-Fixture-Password-9!';
  const ids = {
    currency: '21111111-1111-4111-8111-111111111111',
    category: '31111111-1111-4111-8111-111111111111',
    settings: '41111111-1111-4111-8111-111111111111',
    goal: '51111111-1111-4111-8111-111111111111',
    deposit: '61111111-1111-4111-8111-111111111111',
    debt: '71111111-1111-4111-8111-111111111111',
    recurring: '81111111-1111-4111-8111-111111111111',
    budget: '91111111-1111-4111-8111-111111111111',
    transaction: 'a1111111-1111-4111-8111-111111111111',
  };
  const owned = (id, values) => ({ id, user_id: uid, created_at: createdAt, updated_at: updatedAt, ...values });
  const users = [{
    uid, email, username: 'legacyfixture', created_at: createdAt, updated_at: updatedAt,
    auth_created_at: createdAt, email_confirmed_at: null, disabled: false,
    // Supabase GoTrue stores bcrypt in the $2a$ form; mirror that exact source format.
    encrypted_password: (await bcrypt.hash(password, 10)).replace(/^\$2b\$/, '$2a$'),
  }];
  const tables = {
    currencies: [owned(ids.currency, { code: 'EUR', name: 'Euro' })],
    categories: [owned(ids.category, { name: 'Salary', type: 'income', color: '#16a34a' })],
    settings: [owned(ids.settings, {
      default_currency_code: 'EUR', theme: 'dark', locale: 'en', dashboard_widgets: '["pocket"]',
      stats_charts: '["trends"]', dashboard_widget_views: '{}', dashboard_widget_layout: '[]',
    })],
    goals: [owned(ids.goal, {
      name: 'Emergency fund', target_amount: 100000, current_amount: 25000,
      currency_code: 'EUR', deadline: '2027-12-31', status: 'active',
    })],
    deposits: [owned(ids.deposit, {
      name: 'Savings', type: 'bank', principal_cents: 50000, currency_code: 'EUR',
      start_date: '2025-01-01', end_date: '2027-01-01', annual_rate_bps: 250,
      counterparty: 'Fixture bank', note: 'Migration rehearsal', status: 'active', money_location: 'card',
    })],
    credit_debts: [owned(ids.debt, {
      name: 'Card', direction: 'debt', source: 'bank', principal_cents: 12000,
      currency_code: 'EUR', start_date: '2025-05-01', due_date: '2026-10-01', annual_rate_bps: 0,
      counterparty: 'Fixture bank', note: null, status: 'active',
    })],
    recurring_rules: [owned(ids.recurring, {
      amount: 350000, currency_code: 'EUR', category_id: ids.category, type: 'income', cadence: 'monthly',
      billing_day: 1, next_run_date: '2026-10-01', note: 'Monthly salary', active: 1, money_location: 'card',
    })],
    budgets: [owned(ids.budget, { category_id: ids.category, limit_cents: 200000, currency_code: 'EUR' })],
    transactions: [owned(ids.transaction, {
      amount: 350000, currency_code: 'EUR', date: '2026-09-01', type: 'income', category_id: ids.category,
      note: 'Imported salary', recurring_id: ids.recurring, goal_id: ids.goal,
      credit_debt_id: ids.debt, money_location: 'card',
    })],
  };
  return { source: prepareSource(users, tables), credentials: { uid, email, password } };
}

function validateSource(users, tables) {
  const userIds = new Set(users.map(user => user.uid));
  if (userIds.size !== users.length) throw new Error('Supabase contains a duplicate Auth UID.');
  const emails = new Set();
  for (const user of users) {
    const normalizedEmail = user.email?.toLowerCase();
    if (!normalizedEmail || emails.has(normalizedEmail)) throw new Error('Supabase contains a missing or duplicate auth email.');
    if (!user.username) throw new Error('Supabase contains an Auth user without a profile username.');
    if (normalizedEmail.endsWith(LEGACY_EMAIL_SUFFIX)
      && normalizedEmail !== `${user.username.trim().toLowerCase()}${LEGACY_EMAIL_SUFFIX}`) {
      throw new Error('A legacy synthetic email does not match its profile username.');
    }
    emails.add(normalizedEmail);
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.encrypted_password || '')) throw new Error('A Supabase password hash is absent or not supported bcrypt.');
  }
  for (const [table, rows] of Object.entries(tables)) {
    const ids = new Set();
    for (const row of rows) {
      if (!userIds.has(row.user_id) || ids.has(row.id)) throw new Error(`Invalid ownership or duplicate ID in ${table}.`);
      ids.add(row.id);
    }
  }
  const owners = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, new Map(rows.map(row => [row.id, row.user_id]))]));
  const hasOwnedReference = (table, id, userId) => owners[table].get(id) === userId;
  for (const row of tables.recurring_rules) if (!hasOwnedReference('categories', row.category_id, row.user_id)) throw new Error('Broken or cross-owner recurring category reference.');
  for (const row of tables.budgets) if (!hasOwnedReference('categories', row.category_id, row.user_id)) throw new Error('Broken or cross-owner budget category reference.');
  for (const row of tables.transactions) {
    if (!hasOwnedReference('categories', row.category_id, row.user_id)) throw new Error('Broken or cross-owner transaction category reference.');
    if (row.recurring_id && !hasOwnedReference('recurring_rules', row.recurring_id, row.user_id)) throw new Error('Broken or cross-owner transaction recurring reference.');
    if (row.goal_id && !hasOwnedReference('goals', row.goal_id, row.user_id)) throw new Error('Broken or cross-owner transaction goal reference.');
    if (row.credit_debt_id && !hasOwnedReference('credit_debts', row.credit_debt_id, row.user_id)) throw new Error('Broken or cross-owner transaction credit/debt reference.');
  }
}

function initFirebase() {
  const options = REHEARSAL ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID };
  const app = getApps()[0] ?? initializeApp(options);
  return { auth: getAuth(app), firestore: getFirestore(app) };
}

async function listFirebaseUsers(auth) {
  const users = []; let pageToken;
  do { const page = await auth.listUsers(1000, pageToken); users.push(...page.users); pageToken = page.pageToken; } while (pageToken);
  return users;
}

async function migrationStates(firestore, source) {
  const refs = source.users.map(user => firestore.collection('migration_state').doc(user.uid));
  const snapshots = [];
  for (const group of chunks(refs, 300)) snapshots.push(...await firestore.getAll(...group));
  return new Map(snapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, snapshot.data()]));
}

async function preflight(source, auth, firestore) {
  const firebaseUsers = await listFirebaseUsers(auth);
  const sourceUids = new Set(source.users.map(user => user.uid));
  if (firebaseUsers.some(user => !sourceUids.has(user.uid))) throw new Error('Firebase Auth contains a user outside this source migration.');
  const [accountDocuments, stateDocuments] = await Promise.all([
    firestore.collection('users').get(), firestore.collection('migration_state').get(),
  ]);
  if (accountDocuments.docs.some(document => !sourceUids.has(document.id))) throw new Error('Firestore contains an account outside this source migration.');
  if (stateDocuments.docs.some(document => !sourceUids.has(document.id))) throw new Error('Firestore contains migration state outside this source migration.');
  const byUid = new Map(firebaseUsers.map(user => [user.uid, user]));
  const byEmail = new Map(firebaseUsers.filter(user => user.email).map(user => [user.email.toLowerCase(), user]));
  const states = await migrationStates(firestore, source);
  let newUsers = 0; let resumedUsers = 0;
  for (const user of source.users) {
    const existingUid = byUid.get(user.uid); const existingEmail = byEmail.get(user.email.toLowerCase());
    const state = states.get(user.uid); const fingerprint = source.fingerprints.get(user.uid);
    if (existingEmail && existingEmail.uid !== user.uid) throw new Error('A Firebase email collision exists.');
    if (existingUid && existingUid.email?.toLowerCase() !== user.email.toLowerCase()) throw new Error('A Firebase UID collision exists.');
    if (existingUid && state?.fingerprint !== fingerprint) throw new Error('An existing Firebase user lacks matching migration state.');
    if (existingUid) resumedUsers++; else newUsers++;
  }
  return { firebaseUsers: firebaseUsers.length, newUsers, resumedUsers, states };
}

async function writeStates(firestore, source, phase) {
  for (const group of chunks(source.users, 450)) {
    const batch = firestore.batch();
    for (const user of group) batch.set(firestore.collection('migration_state').doc(user.uid), {
      fingerprint: source.fingerprints.get(user.uid), phase, source: 'supabase',
      auth_created_at: user.auth_created_at, updated_at: new Date().toISOString(),
    }, { merge: true });
    await batch.commit();
  }
}

async function applyMigration(source, auth, firestore, preflightResult) {
  await writeStates(firestore, source, 'started');
  const existing = new Set((await listFirebaseUsers(auth)).map(user => user.uid));
  const pending = source.users.filter(user => !existing.has(user.uid));
  let successfulAuthImports = 0;
  for (const group of chunks(pending, 1000)) {
    const result = await auth.importUsers(group.map(user => ({
      uid: user.uid, email: user.email, displayName: user.username,
      disabled: user.disabled, emailVerified: Boolean(user.email_confirmed_at),
      passwordHash: Buffer.from(user.encrypted_password),
    })), { hash: { algorithm: 'BCRYPT' } });
    if (result.failureCount) throw new Error(`Firebase Auth rejected ${result.failureCount} imported users.`);
    if (result.successCount !== group.length) throw new Error('Firebase Auth returned an unexpected import count.');
    successfulAuthImports += result.successCount;
  }
  const documents = [];
  for (const user of source.users) {
    documents.push({ ref: firestore.collection('users').doc(user.uid), data: accountDocument(user) });
  }
  for (const [table, rows] of Object.entries(source.tables)) for (const row of rows) {
    documents.push({ ref: firestore.collection('users').doc(row.user_id).collection(table).doc(row.id), data: row });
  }
  for (const group of chunks(documents, 450)) {
    const batch = firestore.batch(); for (const item of group) batch.set(item.ref, item.data); await batch.commit();
  }
  await writeStates(firestore, source, 'complete');
  return { importedAuthUsers: successfulAuthImports, resumedUsers: preflightResult.resumedUsers, writtenDocuments: documents.length };
}

async function verifyMigration(source, auth, firestore) {
  const firebaseUsers = new Map((await listFirebaseUsers(auth)).map(user => [user.uid, user]));
  const sourceUserIds = [...source.users.map(user => user.uid)].sort();
  const firebaseUserIds = [...firebaseUsers.keys()].sort();
  const accountDocuments = await firestore.collection('users').get();
  const accountDocumentIds = accountDocuments.docs.map(document => document.id).sort();
  const firebaseUserSetMismatches = digest(firebaseUserIds) === digest(sourceUserIds) ? 0 : 1;
  const accountDocumentSetMismatches = digest(accountDocumentIds) === digest(sourceUserIds) ? 0 : 1;
  let authMismatches = 0; let profileMismatches = 0;
  let rowMismatches = 0; let countMismatches = 0;
  let userRowMismatches = 0; let userCountMismatches = 0;
  for (const user of source.users) {
    const authUser = firebaseUsers.get(user.uid);
    if (authUser?.email?.toLowerCase() !== user.email.toLowerCase()
      || authUser.displayName !== user.username
      || authUser.emailVerified !== Boolean(user.email_confirmed_at)
      || authUser.disabled !== user.disabled) authMismatches++;
    const profile = await firestore.collection('users').doc(user.uid).get();
    if (!profile.exists || digest(plain(profile.data())) !== digest(accountDocument(user))) profileMismatches++;
  }
  const cloudTables = Object.fromEntries(Object.keys(TABLES).map(table => [table, []]));
  for (const user of source.users) for (const table of Object.keys(TABLES)) {
    const snapshot = await firestore.collection('users').doc(user.uid).collection(table).get();
    const cloudRows = snapshot.docs.map(document => plain({ ...document.data(), id: document.id })).sort((a, b) => a.id.localeCompare(b.id));
    const sourceRows = source.tables[table].filter(row => row.user_id === user.uid).sort((a, b) => a.id.localeCompare(b.id));
    if (sourceRows.length !== cloudRows.length) userCountMismatches++;
    if (digest(sourceRows) !== digest(cloudRows)) userRowMismatches++;
    cloudTables[table].push(...cloudRows);
  }
  for (const table of Object.keys(TABLES)) {
    const sourceRows = [...source.tables[table]].sort((a, b) => a.id.localeCompare(b.id));
    const cloudRows = [...cloudTables[table]].sort((a, b) => a.id.localeCompare(b.id));
    if (sourceRows.length !== cloudRows.length) countMismatches++;
    if (digest(sourceRows) !== digest(cloudRows)) rowMismatches++;
  }
  const states = await migrationStates(firestore, source);
  const allStateDocuments = await firestore.collection('migration_state').get();
  const stateDocumentIds = allStateDocuments.docs.map(document => document.id).sort();
  const stateDocumentSetMismatches = digest(stateDocumentIds) === digest(sourceUserIds) ? 0 : 1;
  const stateMismatches = source.users.filter(user => states.get(user.uid)?.phase !== 'complete'
    || states.get(user.uid)?.fingerprint !== source.fingerprints.get(user.uid)
    || plain(states.get(user.uid)?.auth_created_at) !== plain(user.auth_created_at)).length;
  const mismatchTotal = authMismatches + profileMismatches + countMismatches + rowMismatches
    + userCountMismatches + userRowMismatches + stateMismatches
    + firebaseUserSetMismatches + accountDocumentSetMismatches + stateDocumentSetMismatches;
  return { authMismatches, profileMismatches, firebaseUserSetMismatches, accountDocumentSetMismatches,
    countMismatches, rowMismatches, userCountMismatches, userRowMismatches,
    stateMismatches, stateDocumentSetMismatches, passed: mismatchTotal === 0 };
}

async function verifyRehearsalPassword(credentials, source) {
  const sourceHashVerified = await bcrypt.compare(credentials.password, source.users[0].encrypted_password);
  if (!sourceHashVerified) throw new Error('The rehearsal bcrypt source hash does not match its known password.');
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: credentials.email, password: credentials.password, returnSecureToken: true }),
  });
  const result = await response.json();
  if (response.ok && result.localId === credentials.uid && result.idToken) {
    return { sourceHashVerified, emulatorLogin: 'passed' };
  }
  // The Auth emulator stores imported hashes, but currently authenticates only its own
  // fakeHash test format. Production Identity Toolkit performs the documented BCRYPT check.
  if (result.error?.message === 'INVALID_PASSWORD') {
    return { sourceHashVerified, emulatorLogin: 'unsupported-external-hash' };
  }
  const reason = result.error?.message || `HTTP ${response.status}`;
  throw new Error(`Unexpected Firebase Auth emulator login result (${reason}).`);
}

try {
  const rehearsalFixture = REHEARSAL ? await buildRehearsalSource() : null;
  const source = rehearsalFixture?.source ?? await loadSource();
  const sourceReport = { mode, sourceUsers: source.users.length, sourceAccounts: accountCounts(source),
    sourceCounts: tableCounts(source), sourceChecksum: digest(source.tables) };
  if (mode === 'source-only') console.log(JSON.stringify({ ...sourceReport, passed: true }, null, 2));
  else {
    const { auth, firestore } = initFirebase();
    const check = await preflight(source, auth, firestore);
    const report = { ...sourceReport, project: PROJECT_ID, firebaseUsersBefore: check.firebaseUsers,
      newUsers: check.newUsers, resumableUsers: check.resumedUsers };
    if (mode === 'dry-run') console.log(JSON.stringify({ ...report, passed: true }, null, 2));
    else if (mode === 'apply' || mode === 'rehearsal') {
    const applied = await applyMigration(source, auth, firestore, check);
    const verification = await verifyMigration(source, auth, firestore);
    if (!verification.passed) process.exitCode = 2;
    if (mode === 'rehearsal') {
      const passwordHashCheck = await verifyRehearsalPassword(rehearsalFixture.credentials, source);
      const resumedCheck = await preflight(source, auth, firestore);
      const resumedApply = await applyMigration(source, auth, firestore, resumedCheck);
      const resumedVerification = await verifyMigration(source, auth, firestore);
      const passed = verification.passed && passwordHashCheck.sourceHashVerified && resumedVerification.passed
        && resumedApply.importedAuthUsers === 0 && resumedApply.resumedUsers === source.users.length;
      console.log(JSON.stringify({ ...report, ...applied, verification, passwordHashCheck,
        resume: { importedAuthUsers: resumedApply.importedAuthUsers, resumedUsers: resumedApply.resumedUsers, verification: resumedVerification }, passed }, null, 2));
      if (!passed) process.exitCode = 2;
    } else console.log(JSON.stringify({ ...report, ...applied, verification }, null, 2));
    } else {
      const verification = await verifyMigration(source, auth, firestore);
      console.log(JSON.stringify({ ...report, verification }, null, 2));
      if (!verification.passed) process.exitCode = 2;
    }
  }
} catch (error) {
  console.error(`Migration stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
}
