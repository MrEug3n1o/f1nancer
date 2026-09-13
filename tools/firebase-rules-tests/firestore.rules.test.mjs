import fs from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'f1nancer-rules-test';
const owner = 'legacy-owner-uid';
const other = 'other-user-uid';
const recordId = '11111111-1111-4111-8111-111111111111';
const transactionId = '22222222-2222-4222-8222-222222222222';
const referenceId = '33333333-3333-4333-8333-333333333333';
const now = '2026-09-12T10:00:00.000Z';
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await fs.readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await environment.cleanup(); });
beforeEach(async () => { await environment.clearFirestore(); });

function authenticatedDb(uid = owner, email = 'owner@example.com', emailVerified = true) {
  return environment.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore();
}
function account(overrides = {}) {
  return { uid: owner, email: 'owner@example.com', legacy_username: null,
    created_at: now, updated_at: now, email_migration_required: false,
    marketing_email_consent: false, marketing_email_consent_at: null,
    migration_source: 'firebase', ...overrides };
}
async function seedAccount(db) {
  await assertSucceeds(setDoc(doc(db, 'users', owner), account()));
}

function category(overrides = {}) {
  return { id: recordId, user_id: owner, created_at: now, updated_at: now,
    name: 'Groceries', type: 'expense', color: '#BC4749', ...overrides };
}
function transaction(overrides = {}) {
  return { id: transactionId, user_id: owner, created_at: now, updated_at: now,
    amount: 12345, currency_code: 'USD', date: '2026-09-12', type: 'expense',
    category_id: recordId, note: null, recurring_id: null, goal_id: null,
    credit_debt_id: null, money_location: 'card', ...overrides };
}

test('owner can create and read a valid private finance document', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  const ref = doc(db, 'users', owner, 'categories', recordId);
  await assertSucceeds(setDoc(ref, category()));
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(getDocs(collection(db, 'users', owner, 'categories')));
});

test('another signed-in account and an anonymous client cannot read owner data', async () => {
  const ownerDb = authenticatedDb();
  await seedAccount(ownerDb);
  await assertSucceeds(setDoc(doc(ownerDb, 'users', owner, 'categories', recordId), category()));
  const otherDb = authenticatedDb(other, 'other@example.com');
  await assertFails(getDoc(doc(otherDb, 'users', owner, 'categories', recordId)));
  await assertFails(setDoc(doc(otherDb, 'users', owner, 'categories', referenceId), category({ id: referenceId })));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'users', owner, 'categories', recordId)));
  await assertFails(getDocs(collection(environment.unauthenticatedContext().firestore(), 'users', owner, 'categories')));
});

test('schema smuggling and forged ownership are denied', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  await assertFails(setDoc(doc(db, 'users', owner, 'categories', recordId), category({ admin: true })));
  await assertFails(setDoc(doc(db, 'users', owner, 'categories', recordId), category({ user_id: other })));
});

test('record identity and creation time are immutable on update', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  const ref = doc(db, 'users', owner, 'categories', recordId);
  await assertSucceeds(setDoc(ref, category()));
  await assertFails(updateDoc(ref, { created_at: '2026-09-13T10:00:00.000Z' }));
  await assertFails(updateDoc(ref, { user_id: other }));
  await assertSucceeds(updateDoc(ref, { name: 'Food', updated_at: '2026-09-12T11:00:00.000Z' }));
});

test('account email must match the Firebase Auth token', async () => {
  const db = authenticatedDb();
  const base = account();
  await assertSucceeds(setDoc(doc(db, 'users', owner), base));
  await assertFails(setDoc(doc(db, 'users', owner), { ...base, email: 'attacker@example.com' }));
});

test('marketing email consent is explicit, reversible, and timestamped', async () => {
  const db = authenticatedDb();
  const ref = doc(db, 'users', owner);
  await seedAccount(db);
  await assertFails(updateDoc(ref, { marketing_email_consent: true, updated_at: '2026-09-12T11:00:00.000Z' }));
  await assertFails(updateDoc(ref, { marketing_email_consent_at: '2026-09-12T11:00:00.000Z', updated_at: '2026-09-12T11:00:00.000Z' }));
  await assertSucceeds(updateDoc(ref, {
    marketing_email_consent: true,
    marketing_email_consent_at: '2026-09-12T11:00:00.000Z',
    updated_at: '2026-09-12T11:00:00.000Z',
  }));
  await assertFails(updateDoc(ref, {
    marketing_email_consent_at: '2026-09-12T12:00:00.000Z',
    updated_at: '2026-09-12T12:00:00.000Z',
  }));
  await assertSucceeds(updateDoc(ref, {
    marketing_email_consent: false,
    marketing_email_consent_at: null,
    updated_at: '2026-09-12T12:00:00.000Z',
  }));
});

test('unknown collections are denied', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  await assertFails(setDoc(doc(db, 'users', owner, 'private_keys', recordId), category()));
});

test('finance references must resolve inside the same owner namespace', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  const ref = doc(db, 'users', owner, 'transactions', transactionId);
  await assertFails(setDoc(ref, transaction({ category_id: referenceId })));
  await assertSucceeds(setDoc(doc(db, 'users', owner, 'categories', referenceId), category({ id: referenceId })));
  await assertSucceeds(setDoc(ref, transaction({ category_id: referenceId })));
});

test('unverified email tokens cannot read or write account data', async () => {
  const unverifiedDb = authenticatedDb(owner, 'owner@example.com', false);
  await assertFails(setDoc(doc(unverifiedDb, 'users', owner), account()));
  await environment.withSecurityRulesDisabled(async context => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, 'users', owner), account());
    await setDoc(doc(adminDb, 'users', owner, 'categories', recordId), category());
  });
  await assertFails(getDoc(doc(unverifiedDb, 'users', owner)));
  await assertFails(getDoc(doc(unverifiedDb, 'users', owner, 'categories', recordId)));
  await assertFails(updateDoc(doc(unverifiedDb, 'users', owner), { updated_at: '2026-09-12T11:00:00.000Z' }));
});

test('orphaned finance documents are denied until the owner account exists', async () => {
  const db = authenticatedDb();
  await assertFails(setDoc(doc(db, 'users', owner, 'categories', recordId), category()));
  await seedAccount(db);
  await assertSucceeds(setDoc(doc(db, 'users', owner, 'categories', recordId), category()));
});

test('updates cannot remove required fields, change types, or exhaust storage', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  const ref = doc(db, 'users', owner, 'categories', recordId);
  await assertSucceeds(setDoc(ref, category()));
  await assertFails(updateDoc(ref, { name: 'x'.repeat(1000000), updated_at: '2026-09-12T11:00:00.000Z' }));
  await assertFails(updateDoc(ref, { name: 123, updated_at: '2026-09-12T11:00:00.000Z' }));
  await assertFails(updateDoc(ref, { name: deleteField(), updated_at: '2026-09-12T11:00:00.000Z' }));
});

test('negative and overflowing finance values are denied', async () => {
  const db = authenticatedDb();
  await seedAccount(db);
  await assertSucceeds(setDoc(doc(db, 'users', owner, 'categories', recordId), category()));
  const ref = doc(db, 'users', owner, 'transactions', transactionId);
  await assertFails(setDoc(ref, transaction({ amount: -1 })));
  await assertFails(setDoc(ref, transaction({ amount: 2147483648 })));
});
