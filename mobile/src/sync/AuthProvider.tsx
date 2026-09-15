import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createSerialQueue, FINANCE_TABLES, formatSyncError, syncFirestoreAccount,
  validatePassword, type SyncStatusError,
} from '@f1nancer/domain';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload,
  sendEmailVerification, signInWithEmailAndPassword, signOut as firebaseSignOut,
  verifyBeforeUpdateEmail, type User,
} from 'firebase/auth';
import { firebaseAuth } from './firebaseClient';
import { isSyncConfigured } from './config';
import { FirebaseCloudAdapter } from './firestoreCloud';
import {
  finishAccountEmailMigration, loadAccountProfile, seedFirebaseAccount,
  updateMarketingEmailConsent,
  type AccountProfile,
} from './firebaseAccount';

const LEGACY_EMAIL_SUFFIX = '@users.f1nancer.local';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export interface AppSession { user: { id: string; email: string | null } }
export interface SyncInfo { connected: boolean; hasSynced: boolean; pendingUploads: number; lastSyncedAt: string | null }
interface AuthContextValue {
  session: AppSession | null; email: string | null;
  loading: boolean; configured: boolean; dbReady: boolean; dbError: string | null;
  syncError: SyncStatusError | null; syncInfo: SyncInfo; dataRevision: number;
  requiresEmailMigration: boolean;
  requiresEmailVerification: boolean;
  marketingEmailConsent: boolean;
  signIn(identifier: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>; retrySync(): Promise<void>;
  requestEmailMigration(email: string): Promise<void>; refreshEmailMigration(): Promise<void>;
  resendEmailVerification(): Promise<void>; refreshEmailVerification(): Promise<void>;
  setMarketingEmailConsent(consent: boolean): Promise<void>;
}
const serializeAuth = createSerialQueue();
const AuthContext = createContext<AuthContextValue | null>(null);
const emptySync: SyncInfo = { connected: false, hasSynced: false, pendingUploads: 0, lastSyncedAt: null };

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  if (email.endsWith(LEGACY_EMAIL_SUFFIX)) throw new Error('Enter your real email address.');
  return email;
}
function isFirebaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === code;
}

async function sendVerificationEmail(user: User): Promise<void> {
  try {
    await sendEmailVerification(user);
  } catch (error) {
    if (isFirebaseErrorCode(error, 'auth/too-many-requests')) {
      throw new Error('Too many verification emails were sent recently. Wait about an hour, then try again — check spam too.');
    }
    throw error;
  }
}

async function loadOrSeedAccountProfile(user: User): Promise<AccountProfile> {
  let account = await loadAccountProfile(user.uid);
  if (!account && user.email && !user.email.endsWith(LEGACY_EMAIL_SUFFIX)) {
    await seedFirebaseAccount(user.uid, user.email);
    account = await loadAccountProfile(user.uid);
  }
  if (!account) throw new Error('Account data is not ready. Try again shortly.');
  return account;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountLoading, setAccountLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<SyncStatusError | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo>(emptySync);
  const [dataRevision, setDataRevision] = useState(0);
  const retry = useRef<(() => Promise<void>) | null>(null);
  const configured = isSyncConfigured();
  const userId = user?.uid ?? null;
  const profileUid = profile?.uid ?? null;

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    return onAuthStateChanged(firebaseAuth, next => {
      setUser(next); setEmailVerified(Boolean(next?.emailVerified)); setLoading(false); setAccountError(null);
      if (!next || !next.emailVerified) { setProfile(null); setAccountLoading(false); }
      else {
        setProfile(null);
        setAccountLoading(true);
        void loadOrSeedAccountProfile(next)
          .then(account => { if (firebaseAuth.currentUser?.uid === next.uid) setProfile(account); })
          .catch(error => { if (firebaseAuth.currentUser?.uid === next.uid) setAccountError(formatSyncError(error)); })
          .finally(() => { if (firebaseAuth.currentUser?.uid === next.uid) setAccountLoading(false); });
      }
    });
  }, [configured]);

  useEffect(() => {
    let cancelled = false; let syncing = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let unsubscribeLocal: (() => void) | undefined;
    setReadyUser(null); setDbError(null); setSyncError(null); setSyncInfo(emptySync); retry.current = null;
    if (!userId || !emailVerified || !profileUid) return;
    void Promise.all([import('./database')]).then(([m]) => m.serializeSync(async () => {
      const { db, instanceId } = await m.openAccountDatabase(userId);
      if (cancelled) { await db.close(); return; }
      setReadyUser(userId);
      const cloud = new FirebaseCloudAdapter(userId);
      const run = async () => {
        if (cancelled || syncing) return;
        syncing = true;
        try {
          const result = await syncFirestoreAccount(db, cloud, userId, instanceId);
          const queue = await db.getUploadQueueStats();
          if (!cancelled) {
            setSyncInfo({ connected: true, hasSynced: true, pendingUploads: queue.count,
              lastSyncedAt: result.syncedAt });
            setSyncError(null); setDataRevision(value => value + 1);
          }
        } catch (error) {
          const queue = await db.getUploadQueueStats().catch(() => ({ count: 0 }));
          if (!cancelled) {
            setSyncInfo(previous => ({ ...previous, connected: false, pendingUploads: queue.count }));
            setSyncError({ kind: 'download', message: formatSyncError(error) });
          }
        } finally { syncing = false; }
      };
      retry.current = run;
      unsubscribeLocal = db.onChange({ onChange: () => { if (!syncing) void run(); } }, { tables: [...FINANCE_TABLES] });
      interval = setInterval(() => { void run(); }, 10000);
      await run();
    })).catch(error => { if (!cancelled) setDbError(formatSyncError(error)); });
    return () => {
      cancelled = true; retry.current = null; unsubscribeLocal?.(); if (interval) clearInterval(interval);
      void import('./database').then(m => m.serializeSync(() => m.disconnectDatabase())).catch(() => undefined);
    };
  }, [userId, emailVerified, profileUid]);

  const signIn = useCallback((identifier: string, password: string) => serializeAuth(async () => {
    validatePassword(password); await signInWithEmailAndPassword(firebaseAuth, normalizedEmail(identifier), password);
  }), []);
  const signUp = useCallback((input: string, password: string) => serializeAuth(async () => {
    const email = normalizedEmail(input); validatePassword(password);
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await sendVerificationEmail(credential.user);
  }), []);
  const signOut = useCallback(() => serializeAuth(async () => {
    const m = await import('./database');
    await m.serializeSync(async () => { await m.disconnectDatabase(); await firebaseSignOut(firebaseAuth); });
  }), []);
  const retrySync = useCallback(async () => { setSyncError(null); await retry.current?.(); }, []);
  const requestEmailMigration = useCallback(async (input: string) => {
    if (!firebaseAuth.currentUser) throw new Error('Sign in again first.');
    await verifyBeforeUpdateEmail(firebaseAuth.currentUser, normalizedEmail(input));
  }, []);
  const refreshEmailMigration = useCallback(async () => {
    const current = firebaseAuth.currentUser;
    if (!current) throw new Error('Sign in again first.');
    await reload(current);
    if (!current.email || current.email.endsWith(LEGACY_EMAIL_SUFFIX)) throw new Error('The new email is not verified yet. Open the link we sent, then try again.');
    await current.getIdToken(true);
    await finishAccountEmailMigration(current.uid, current.email);
    setEmailVerified(current.emailVerified);
    setProfile(await loadAccountProfile(current.uid)); setUser(firebaseAuth.currentUser);
  }, []);
  const resendEmailVerification = useCallback(async () => {
    const current = firebaseAuth.currentUser;
    if (!current) throw new Error('Sign in again first.');
    if (current.emailVerified) return;
    await sendVerificationEmail(current);
  }, []);
  const refreshEmailVerification = useCallback(async () => {
    const current = firebaseAuth.currentUser;
    if (!current) throw new Error('Sign in again first.');
    await reload(current);
    if (!current.emailVerified) throw new Error('The email is not verified yet. Open the link we sent, then try again.');
    await current.getIdToken(true);
    const account = await loadOrSeedAccountProfile(current);
    setProfile(account); setEmailVerified(true); setUser(firebaseAuth.currentUser);
  }, []);
  const setMarketingEmailConsent = useCallback(async (consent: boolean) => {
    const current = firebaseAuth.currentUser;
    if (!current?.emailVerified) throw new Error('Verify your email before changing email preferences.');
    await updateMarketingEmailConsent(current.uid, consent);
    const account = await loadAccountProfile(current.uid);
    if (!account) throw new Error('Account data is not ready. Try again shortly.');
    setProfile(account);
  }, []);

  const session = useMemo<AppSession | null>(() => user ? { user: { id: user.uid, email: user.email } } : null, [user]);
  const requiresEmailMigration = Boolean(user?.email?.endsWith(LEGACY_EMAIL_SUFFIX) || profile?.email_migration_required);
  const requiresEmailVerification = Boolean(user && !emailVerified);
  return <AuthContext.Provider value={{ session, email: user?.email ?? null, loading: loading || accountLoading, configured,
    dbReady: !!userId && readyUser === userId, dbError: accountError ?? dbError, syncError, syncInfo, dataRevision,
    requiresEmailMigration, requiresEmailVerification,
    marketingEmailConsent: Boolean(profile?.marketing_email_consent),
    signIn, signUp, signOut, retrySync,
    requestEmailMigration, refreshEmailMigration, resendEmailVerification,
    refreshEmailVerification, setMarketingEmailConsent }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; }
