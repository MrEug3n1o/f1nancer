import { buildFirebaseAccountSeed } from '@f1nancer/domain';
import { doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { firestore } from './firebaseClient';

export interface AccountProfile {
  uid: string;
  email: string;
  legacy_username: string | null;
  email_migration_required: boolean;
  marketing_email_consent: boolean;
  marketing_email_consent_at: string | null;
  migration_source: 'firebase' | 'supabase';
  created_at: string;
  updated_at: string;
}

export async function seedFirebaseAccount(uid: string, email: string): Promise<void> {
  const seed = buildFirebaseAccountSeed(uid, email, () => crypto.randomUUID());
  const accountRef = doc(firestore, 'users', uid);
  await runTransaction(firestore, async transaction => {
    if ((await transaction.get(accountRef)).exists()) return;
    transaction.set(accountRef, seed.user);
    for (const item of seed.documents) {
      transaction.set(doc(firestore, 'users', uid, item.collection, item.id), item.data);
    }
  });
}

export async function loadAccountProfile(uid: string): Promise<AccountProfile | null> {
  const snapshot = await getDoc(doc(firestore, 'users', uid));
  return snapshot.exists() ? snapshot.data() as AccountProfile : null;
}

export async function finishAccountEmailMigration(uid: string, email: string): Promise<void> {
  await updateDoc(doc(firestore, 'users', uid), {
    email: email.trim().toLowerCase(),
    email_migration_required: false,
    updated_at: new Date().toISOString(),
  });
}

export async function updateMarketingEmailConsent(uid: string, consent: boolean): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(firestore, 'users', uid), {
    marketing_email_consent: consent,
    marketing_email_consent_at: consent ? now : null,
    updated_at: now,
  });
}
