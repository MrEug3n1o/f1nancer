import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatSyncError, syncErrorFromStatus, usernameToEmail, validatePassword, validateUsername, createSerialQueue, FINANCE_TABLES, type SyncStatusError } from "@f1nancer/domain";
import type { Session } from "@supabase/supabase-js";
import { isSyncConfigured, supabaseAnonKey, supabaseUrl } from "./config";
import { getSupabase, supabase, readCachedSession } from "./supabaseClient";
import { bindDataLayer } from "../data/repo";

export interface SyncInfo { connected: boolean; hasSynced: boolean; pendingUploads: number; lastSyncedAt: string | null; conflicts: number }
interface AuthContextValue {
  session: Session | null; username: string | null; loading: boolean; configured: boolean;
  dbReady: boolean; dbError: string | null; syncError: SyncStatusError | null;
  syncInfo: SyncInfo; dataRevision: number;
  signIn(username: string, password: string): Promise<void>;
  signUp(username: string, password: string): Promise<void>;
  signOut(): Promise<void>; retrySync(): Promise<void>;
}
const serializeAuth = createSerialQueue();
const AuthContext = createContext<AuthContextValue | null>(null);
const emptySync: SyncInfo = { connected: false, hasSynced: false, pendingUploads: 0, lastSyncedAt: null, conflicts: 0 };
async function authUsername(action: "signin" | "signup", username: string, password: string) {
  const normalized = validateUsername(username);
  validatePassword(password);
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/auth-username`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ action, username: normalized, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "Authentication failed");
  }
  if (body.session) {
    const { error } = await supabase.auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(normalized),
    password,
  });
  if (error) throw new Error(error.message);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [readyUser, setReadyUser] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<SyncStatusError | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncInfo>(emptySync);
  const [dataRevision, setDataRevision] = useState(0);
  const retry = useRef<(() => Promise<void>) | null>(null);
  const configured = isSyncConfigured();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      let cached = await readCachedSession();
      if (cancelled) return;
      if (cached) { setSession(cached); setLoading(false); }
      let eventReceived = false;
      const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
        if (cancelled) return;
        if (event === 'SIGNED_OUT') cached = null;
        if (event === 'INITIAL_SESSION' && !next && cached) return;
        eventReceived = true;
        setSession(next); setLoading(false);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled || eventReceived) return;
        if (error) setSyncError({ kind: 'download', message: 'Cloud sign-in could not refresh. Your saved local data is available; reconnect or sign in again.' });
        else setSession(data.session);
      } catch (err) {
        if (!cancelled) setSyncError({ kind: 'download', message: formatSyncError(err) });
      } finally { if (!cancelled) setLoading(false); }
    })().catch(err => { if (!cancelled) { setDbError(formatSyncError(err)); setLoading(false); } });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [configured]);

  useEffect(() => {
    let cancelled = false;
    const cleanup: (() => void)[] = [];
    setReadyUser(null); setDbError(null); setSyncError(null); setSyncInfo(emptySync);
    retry.current = null;
    if (!userId) {
      bindDataLayer(null, null);
      return;
    }
    void Promise.all([import("./database"), import("./powersyncConnector")]).then(([m, { SupabaseConnector }]) => m.serializeSync(async () => {
      if (cancelled) return;
      const { db, instanceId } = await m.openAccountDatabase(userId);
      if (cancelled) { await db.disconnect(); return; }
      bindDataLayer(db, userId);
      cleanup.push(() => { void m.serializeSync(() => db.disconnect()).catch(() => undefined); });
      const connector = new SupabaseConnector(userId, instanceId);
      let refreshing = false;
      const refreshStatus = async () => {
        if (cancelled || refreshing) return;
        refreshing = true;
        try {
          const stats = await db.getUploadQueueStats();
          const [conflicts] = await db.getAll<{ count: number }>('SELECT count(*) AS count FROM f1_conflicts');
          const status = db.currentStatus;
          if (!cancelled) {
            setSyncError(syncErrorFromStatus(status));
            setSyncInfo({ connected: status.connected, hasSynced: Boolean(status.hasSynced), pendingUploads: stats.count,
              lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null, conflicts: conflicts?.count ?? 0 });
          }
        } catch (err) { if (!cancelled) setSyncError({ kind: 'download', message: formatSyncError(err) }); }
        finally { refreshing = false; }
      };
      cleanup.push(db.registerListener({ statusChanged: () => { void refreshStatus(); } }));
      cleanup.push(db.onChange({ onChange: () => { if (!cancelled) { setDataRevision(v => v + 1); void refreshStatus(); } } }, { tables: [...FINANCE_TABLES] }));
      const interval = setInterval(() => { void refreshStatus(); }, 3000);
      cleanup.push(() => clearInterval(interval));
      retry.current = () => m.serializeSync(async () => {
        if (cancelled) return;
        await db.disconnect(); await db.connect(connector); await refreshStatus();
      });
      setReadyUser(userId);
      await refreshStatus();
      try { await db.connect(connector); }
      catch (err) { if (!cancelled) setSyncError({ kind: 'download', message: formatSyncError(err) }); }
    })).catch(err => { if (!cancelled) setDbError(formatSyncError(err)); });
    return () => { cancelled = true; retry.current = null; cleanup.forEach(dispose => dispose()); bindDataLayer(null, null); };
  }, [userId]);

  const signIn = useCallback((username: string, password: string) => serializeAuth(() => authUsername('signin', username, password)), []);
  const signUp = useCallback((username: string, password: string) => serializeAuth(() => authUsername('signup', username, password)), []);
  const signOut = useCallback(() => serializeAuth(async () => {
    const m = await import('./database');
    await m.serializeSync(async () => {
      await m.disconnectDatabase();
      const { error } = await getSupabase().auth.signOut({ scope: 'local' });
      if (error) throw error;
    });
  }), []);
  const retrySync = useCallback(async () => {
    try { setSyncError(null); await retry.current?.(); }
    catch (err) { setSyncError({ kind: 'download', message: formatSyncError(err) }); }
  }, []);
  const username = useMemo(() => session?.user.user_metadata?.username || session?.user.email?.split('@')[0] || null, [session]);
  return <AuthContext.Provider value={{ session, username, loading, configured, dbReady: !!userId && readyUser === userId,
    dbError, syncError, syncInfo, dataRevision, signIn, signUp, signOut, retrySync }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used within AuthProvider'); return ctx; }
