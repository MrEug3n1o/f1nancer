import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { FINANCE_COLUMNS, FINANCE_TABLES, validateFinanceTables, type FinanceTables } from '../src/financeTables';
import { initializeSyncStorage } from '../src/syncStorage';
import { createSerialQueue, openOwnedDatabase } from '../src/accountDatabase';
import { uploadSyncBatch } from '../src/syncUpload';
import { parseCachedSession } from '../src/cachedSession';
import { coerceSyncRecord } from '../src/syncCoerce';
import { syncFirestoreAccount } from '../src/firestoreSync';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = 'https://example.supabase.co';
const ts = '2026-09-09T12:00:00.000Z';
function fixture(): FinanceTables {
  const tables: any = Object.fromEntries(FINANCE_TABLES.map(t => [t, []]));
  const row = (table: string, fields: any) => {
    const values = Object.fromEntries(FINANCE_COLUMNS[table].map(k => [k, null]));
    const r = { ...values, id: randomUUID(), user_id: USER, created_at: ts, updated_at: ts, ...fields }; tables[table].push(r); return r;
  };
  row('currencies', { code: 'USD', name: 'US Dollar' });
  row('settings', { default_currency_code: 'USD', theme: 'dark', locale: 'en-US', dashboard_widgets: '[]', stats_charts: '[]', dashboard_widget_views: '{}', dashboard_widget_layout: '[]' });
  const category = row('categories', { name: 'Salary', type: 'income', color: '#fff' });
  const goal = row('goals', { name: 'Goal', target_amount: 100000, current_amount: 123, currency_code: 'USD', status: 'completed' });
  row('deposits', { name: 'Deposit', type: 'bank', principal_cents: 1000, currency_code: 'USD', start_date: '2026-01-01', end_date: '2026-12-01', status: 'matured', money_location: 'card' });
  const credit = row('credit_debts', { name: 'Loan', direction: 'debt', source: 'bank', principal_cents: 1000, currency_code: 'USD', start_date: '2026-01-01', status: 'paid' });
  const recurring = row('recurring_rules', { amount: 10, currency_code: 'USD', category_id: category.id, type: 'income', cadence: 'monthly', billing_day: 1, next_run_date: '2026-10-01', active: 0, money_location: 'cash' });
  row('budgets', { category_id: category.id, limit_cents: 1000, currency_code: 'USD' });
  row('transactions', { amount: 123, currency_code: 'USD', date: '2026-09-01', type: 'income', category_id: category.id, goal_id: goal.id, credit_debt_id: credit.id, recurring_id: recurring.id, money_location: 'card', note: '' });
  return tables;
}
function sqlite() {
  const sql = new DatabaseSync(':memory:');
  for (const t of FINANCE_TABLES) sql.exec(`CREATE TABLE ${t} (${FINANCE_COLUMNS[t].map(k => `${k} ${k === 'id' ? 'TEXT PRIMARY KEY' : ['amount','limit_cents','current_amount','target_amount','annual_rate_bps','principal_cents','active','billing_day'].includes(k) ? 'INTEGER' : 'TEXT'}`).join(', ')}, _metadata TEXT)`);
  sql.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY)');
  const db = {
    async getAll(sqlText: string, params: any[] = []) { return sql.prepare(sqlText).all(...params); },
    async execute(sqlText: string, params: any[] = []) { return sql.prepare(sqlText).run(...params); },
    async writeTransaction(fn: any) { sql.exec('BEGIN'); try { const result = await fn(db); sql.exec('COMMIT'); return result; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
    async readTransaction(fn: any) { return db.writeTransaction(fn); },
    async waitForReady() {}, async disconnect() {}, async close() {},
  };
  return { db: db as any, sql };
}
async function seed(db: any, tables: FinanceTables) {
  for (const t of FINANCE_TABLES) for (const r of tables[t]) {
    await db.execute(`INSERT INTO ${t} (${FINANCE_COLUMNS[t].join(', ')}) VALUES (${FINANCE_COLUMNS[t].map(() => '?').join(', ')})`, FINANCE_COLUMNS[t].map(k => r[k]));
  }
}

test('invalid ownership, references, dates, numbers, columns and duplicate unique keys are rejected', () => {
  assert.equal(validateFinanceTables(fixture(), USER).transactions.length, 1);
  assert.throws(() => validateFinanceTables(fixture(), OTHER), /Invalid ownership/);
  for (const change of [(t: any) => t.categories = [], (t: any) => t.transactions[0].date = '2026-02-30', (t: any) => t.transactions[0].amount = NaN, (t: any) => t.currencies.push({ ...t.currencies[0], id: randomUUID() }), (t: any) => t.categories[0].extra = 'x', (t: any) => t.goals[0].status = 'unknown']) {
    const t = fixture(); change(t); assert.throws(() => validateFinanceTables(t, USER));
  }
});
test('Firebase UIDs are valid account owners while finance references remain UUIDs', () => {
  const firebaseUid = 'firebase_User-123';
  const tables = fixture();
  for (const table of FINANCE_TABLES) for (const row of tables[table]) row.user_id = firebaseUid;
  assert.equal(validateFinanceTables(tables, firebaseUid), tables);
  tables.transactions[0].category_id = firebaseUid;
  assert.throws(() => validateFinanceTables(tables, firebaseUid), /Invalid reference/);
});
test('uploader never acknowledges errors or incomplete receipts; conflict evidence is durable before acknowledgement', async () => {
  const { db } = sqlite(); await initializeSyncStorage(db, randomUUID); let completed = 0;
  db.getNextCrudTransaction = async () => ({ crud: [{ clientId: 1, table: 'categories', id: randomUUID(), op: 'PUT', opData: {} }], complete: async () => { assert.equal((await db.getAll('SELECT * FROM f1_conflicts')).length, 1); completed++; } });
  await assert.rejects(uploadSyncBatch(db, { rpc: async () => ({ data: null, error: { code: '23505' } }) }, randomUUID()));
  await assert.rejects(uploadSyncBatch(db, { rpc: async () => ({ data: [], error: null }) }, randomUUID()), /Incomplete/);
  assert.equal(completed, 0);
  await uploadSyncBatch(db, { rpc: async () => ({ data: [{ op_id: '1', conflict: true }], error: null }) }, randomUUID()); assert.equal(completed, 1);
  assert.deepEqual(coerceSyncRecord('recurring_rules', { active: '0', note: '' }), { active: false, note: '' });
  assert.deepEqual(coerceSyncRecord('transactions', { note: 'updated' }), { note: 'updated' });
});
test('Firestore uploads keep recurring_rules.active as the 0/1 integer the owner rules require', async () => {
  const { db, sql } = sqlite(); await initializeSyncStorage(db, randomUUID); const b = fixture();
  await seed(db, b);
  sql.exec('CREATE TABLE IF NOT EXISTS ps_crud (data TEXT)');
  const rule = b.recurring_rules[0];
  let batches = [{ crud: [{ clientId: 1, table: 'recurring_rules', id: rule.id, op: 'PUT', opData: {} }], complete: async () => {} }];
  db.getNextCrudTransaction = async () => batches.shift() ?? null;
  const sent: any[] = [];
  const cloud = { readAll: async (table: string) => (b as any)[table], apply: async (ops: any[]) => { sent.push(...ops); return ops.map(op => ({ opId: op.opId })); } };
  await syncFirestoreAccount(db, cloud, USER, randomUUID());
  assert.equal(sent[0].row.active, 0);
});
test('account databases isolate users and preserve the legacy file and persistent instance ID', async () => {
  const files = new Map(); const values = new Map();
  const factory = (name: string) => { if (!files.has(name)) files.set(name, sqlite().db); return files.get(name); };
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, v: string) => { values.set(key, v); } };
  const a = await openOwnedDatabase(USER, PROJECT, factory, storage, randomUUID);
  await a.db.execute('INSERT INTO categories (id,user_id,name) VALUES (?,?,?)', [randomUUID(),USER,'offline']);
  const b = await openOwnedDatabase(OTHER, PROJECT, factory, storage, randomUUID);
  assert.notEqual(a.db, b.db); assert.equal((await b.db.getAll('SELECT * FROM categories')).length, 0);
  const again = await openOwnedDatabase(USER, PROJECT, factory, storage, randomUUID);
  assert.equal(a.instanceId, again.instanceId); assert.equal((await again.db.getAll('SELECT * FROM categories')).length, 1);
  const firebaseProject = 'https://f1nancer.firebaseapp.com';
  const migrated = await openOwnedDatabase(USER, firebaseProject, factory, storage, randomUUID, [PROJECT]);
  assert.equal(migrated.db, a.db);
  assert.equal((await migrated.db.getAll('SELECT * FROM categories')).length, 1);
  assert.equal(values.get(`f1nancer.database.f1nancer.firebaseapp.com.${USER}`), 'f1nancer.sqlite');
  assert.equal((await migrated.db.getAll<{ value: string }>("SELECT value FROM f1_sync_meta WHERE key='project'"))[0].value, 'f1nancer.firebaseapp.com');
});
test('auth transition queue serializes connect/disconnect and recovers after errors', async () => {
  const queue = createSerialQueue(); const events: string[] = []; let release!: () => void;
  const gate = new Promise<void>(r => release = r);
  const a = queue(async () => { events.push('open'); await gate; events.push('connected'); });
  const b = queue(async () => { events.push('disconnected'); throw new Error('expired'); });
  const c = queue(async () => { events.push('next-account'); });
  release(); await a; await assert.rejects(b); await c;
  assert.deepEqual(events, ['open','connected','disconnected','next-account']);
});

test('cached sessions retain local access after expiry but malformed identities are rejected', () => {
  const expired = { user: { id: USER }, access_token: 'expired-token', refresh_token: 'refresh-token', expires_at: 1 };
  assert.deepEqual(parseCachedSession(JSON.stringify(expired)), expired);
  assert.equal(parseCachedSession('{'), null);
  assert.equal(parseCachedSession(JSON.stringify({ ...expired, user: { id: 'invalid' } })), null);
});

test('PostgreSQL RPC: retries, aliases, merge conflicts, ownership and rollback', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    // Extension availability is not under test. pgcrypto's gen_random_uuid is built into current Postgres.
    const initial = readFileSync('supabase/migrations/20260906120000_init_f1nancer.sql', 'utf8').replace(/create extension if not exists (citext|pgcrypto);/g, '').replace(/\bcitext\b/g, 'text');
    await pg.exec(initial);
    await pg.exec(readFileSync('supabase/migrations/20260909173234_reliable_sync.sql', 'utf8'));
    await pg.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3),($4,$5,$6)', [USER,'first@example.com','{"username":"first"}',OTHER,'second@example.com','{"username":"second"}']);
    await pg.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${USER}'`);
    const instance = randomUUID(); let seq = 0;
    const op = (table: string, id: string, action: string, data: any, merge = false) => ({ op_id: String(++seq), table, id, op: action, data, merge });
    const rpc = async (ops: any[]) => (await pg.query<any>('SELECT public.apply_sync_batch($1,$2::jsonb) AS result', [instance, JSON.stringify(ops)])).rows[0].result;
    const cid = randomUUID(); const put = op('categories', cid, 'PUT', { name: 'Test', type: 'expense', user_id: USER });
    const receipt = await rpc([put]); await rpc([op('categories', cid, 'PATCH', { name: 'Later' })]);
    assert.deepEqual(await rpc([put]), receipt);
    assert.equal((await pg.query<any>('SELECT name FROM public.categories WHERE id=$1', [cid])).rows[0].name, 'Later');
    const localCurrency = randomUUID(); const canonical = (await rpc([op('currencies',localCurrency,'PUT',{user_id:USER,code:'USD',name:'Dollar'})]))[0].id;
    assert.notEqual(canonical, localCurrency);
    await rpc([op('currencies',localCurrency,'PATCH',{name:'Canonical edit'})]);
    assert.equal((await pg.query<any>('SELECT name FROM currencies WHERE id=$1',[canonical])).rows[0].name,'Canonical edit');
    const conflict = await rpc([op('categories',cid,'PUT',{user_id:USER,name:'Merged value',type:'expense'},true)]);
    assert.equal(conflict[0].conflict,true);
    assert.equal((await pg.query<any>('SELECT name FROM categories WHERE id=$1',[cid])).rows[0].name,'Later');
    await assert.rejects(rpc([op('categories',randomUUID(),'PUT',{user_id:OTHER,name:'foreign',type:'expense'})]), /Wrong row owner/);
    await assert.rejects(rpc([op('sync_receipts',randomUUID(),'PUT',{})]), /Unsupported sync table/);
    const foreign = (await pg.query<any>('SELECT id FROM categories WHERE user_id=$1',[OTHER])).rows;
    assert.equal(foreign.length,0);
    const badRef = randomUUID();
    await assert.rejects(rpc([op('transactions',randomUUID(),'PUT',{user_id:USER,category_id:badRef,amount:1,date:'2026-09-09',type:'expense'})]), /reference/);
    const rolledBack = randomUUID();
    await assert.rejects(rpc([op('categories',rolledBack,'PUT',{user_id:USER,name:'rollback',type:'expense'}),op('transactions',randomUUID(),'PUT',{user_id:USER,category_id:badRef})]));
    assert.equal((await pg.query('SELECT id FROM categories WHERE id=$1',[rolledBack])).rows.length,0);
    const full = fixture();
    await rpc(FINANCE_TABLES.flatMap(t => full[t].map(r => op(t, r.id, 'PUT', coerceSyncRecord(t, r)))));
    const txn = (await pg.query<any>('SELECT * FROM transactions WHERE id=$1',[full.transactions[0].id])).rows[0];
    assert.equal(txn.goal_id, full.goals[0].id);
    assert.equal(txn.recurring_id, full.recurring_rules[0].id);
    assert.equal(txn.credit_debt_id, full.credit_debts[0].id);
    assert.equal(txn.amount, 123);
    assert.equal((await pg.query<any>('SELECT active FROM recurring_rules WHERE id=$1',[full.recurring_rules[0].id])).rows[0].active,false);
    await assert.rejects(rpc([op('categories',full.categories[0].id,'DELETE',{})]), /foreign key/);
    await pg.exec("RESET ROLE; SET ROLE anon; SET request.jwt.claim.sub = ''");
    await assert.rejects(rpc([put]), /permission denied/);
  } finally { await pg.close(); }
});
