import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINANCE_TABLES, parseBackup } from '../src/backup.ts';

const OLD = 'e60065a8-e697-4d99-ad75-69daf37eb516';
const NEW = 'ESbrLJHPjYTBb301wuso6sC3QBV2';
const PROJECT = 'https://example.firebaseapp.com';
const ts = { stringValue: '2026-09-08T00:02:50.228Z' };
const doc = (fields: Record<string, unknown>) => ({ name: `users/${OLD}/x/${(fields.id as any).stringValue}`, fields: { user_id: { stringValue: OLD }, created_at: ts, updated_at: ts, ...fields } });

function snapshot() {
  const collections: Record<string, unknown[]> = Object.fromEntries(FINANCE_TABLES.map(t => [t, []]));
  collections.categories = [doc({ id: { stringValue: '0540a595-6192-4597-8e50-add97937567b' }, name: { stringValue: 'Subscriptions' }, type: { stringValue: 'expense' }, color: { stringValue: '#6C757D' } })];
  collections.recurring_rules = [doc({
    id: { stringValue: 'ed94d55d-94a1-4262-a85f-a3954d72d87b' }, amount: { integerValue: '1798' }, currency_code: { stringValue: 'EUR' },
    category_id: { stringValue: '0540a595-6192-4597-8e50-add97937567b' }, type: { stringValue: 'expense' }, cadence: { stringValue: 'monthly' },
    billing_day: { integerValue: '1' }, next_run_date: { stringValue: '2026-09-13T22:00:00.000Z' }, note: { stringValue: 'Cursor' },
    active: { booleanValue: true }, money_location: { stringValue: 'card' },
  })];
  return { format: 'f1nancer-cloud-snapshot', version: 1, project: 'f1nancer', account: { label: 'r1ch', uid: OLD }, exportedAt: '2026-09-13T23:30:40.840Z', collections };
}

test('cloud snapshots import into the signed-in account with calendar dates', () => {
  const backup = parseBackup(JSON.stringify(snapshot()), NEW, PROJECT);
  const rule = backup.tables.recurring_rules[0];
  assert.equal(backup.accountId, NEW);
  assert.equal(rule.user_id, NEW);
  assert.equal(rule.next_run_date, '2026-09-14');
  assert.equal(rule.amount, 1798);
  assert.equal(rule.active, 1);
});

test('cloud snapshots reject rows owned by another account', () => {
  const s = snapshot();
  (s.collections.categories[0] as any).fields.user_id = { stringValue: 'someone-else' };
  assert.throws(() => parseBackup(JSON.stringify(s), NEW, PROJECT), /Invalid ownership/);
});
