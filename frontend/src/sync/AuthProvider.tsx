import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  formatSyncError,
  syncErrorFromStatus,
  usernameToEmail,
  validatePassword,
  validateUsername,
} from "@f1nancer/domain";
import type { Session } from "@supabase/supabase-js";
import { maybeAutoImportLegacy } from "../data/importLocal";
import { bindDataLayer } from "../data/repo";
import { isSyncConfigured, supabaseAnonKey, supabaseUrl } from "./config";
import { getSupabase } from "./supabaseClient";

interface AuthContextValue {
  session: Session | null;
  username: string | null;
  loading: boolean;
  configured: boolean;
  dbReady: boolean;
  dbError: string | null;
  syncError: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function withPowerSync<T>(
  fn: (api: {
    getPowerSync: typeof import("./database").getPowerSync;
    SupabaseConnector: typeof import("./powersyncConnector").SupabaseConnector;
  }) => Promise<T> | T,
): Promise<T> {
  const [{ getPowerSync }, { SupabaseConnector }] = await Promise.all([
    import("./database"),
    import("./powersyncConnector"),
  ]);
  return fn({ getPowerSync, SupabaseConnector });
}

async function authUsername(action: "signin" | "signup", username: string, password: string) {
  const normalized = validateUsername(username);
  validatePassword(password);
  const supabase = getSupabase();
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
    await supabase.auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    });
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
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const configured = isSyncConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      setDbReady(true);
      return;
    }
    const supabase = getSupabase();
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const userId = session?.user.id ?? null;

  // Connect once per signed-in user. Token refresh replaces `session` but must not
  // flip dbReady / remount the app (that feels like a logout).
  useEffect(() => {
    if (!userId) {
      bindDataLayer(null, null);
      setDbReady(true);
      setDbError(null);
      setSyncError(null);
      return;
    }
    let cancelled = false;
    let unregister: (() => void) | undefined;
    setDbReady(false);
    setDbError(null);
    setSyncError(null);
    void withPowerSync(async ({ getPowerSync, SupabaseConnector }) => {
      const db = getPowerSync();
      if (cancelled) return;
      await db.waitForReady();
      if (cancelled) return;
      bindDataLayer(db, userId);
      unregister = db.registerListener({
        statusChanged: (status) => {
          const next = syncErrorFromStatus(status);
          if (next) setSyncError(next);
          else if (status.connected) setSyncError(null);
        },
      });
      try {
        await db.connect(new SupabaseConnector());
        if (!cancelled) await db.waitForFirstSync();
      } catch (err) {
        if (!cancelled) setSyncError(formatSyncError(err));
      }
      try {
        await maybeAutoImportLegacy();
      } catch (err) {
        console.error("Legacy local import failed", err);
      }
      if (!cancelled) setDbReady(true);
    }).catch((err) => {
      if (cancelled) return;
      setDbError(formatSyncError(err));
      setDbReady(true);
    });
    return () => {
      cancelled = true;
      unregister?.();
    };
  }, [userId]);

  const signIn = useCallback(async (username: string, password: string) => {
    await authUsername("signin", username, password);
  }, []);

  const signUp = useCallback(async (username: string, password: string) => {
    await authUsername("signup", username, password);
  }, []);

  const signOut = useCallback(async () => {
    bindDataLayer(null, null);
    try {
      localStorage.removeItem("f1nancer.autoImportedLegacy");
    } catch {
      /* ignore */
    }
    try {
      await withPowerSync(async ({ getPowerSync }) => {
        await getPowerSync().disconnectAndClear();
      });
    } catch (err) {
      console.error("PowerSync disconnect failed", err);
    }
    await getSupabase().auth.signOut();
  }, []);

  const username = useMemo(() => {
    const meta = session?.user.user_metadata as { username?: string } | undefined;
    if (meta?.username) return String(meta.username);
    const email = session?.user.email ?? "";
    return email.split("@")[0] || null;
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        username,
        loading,
        configured,
        dbReady,
        dbError,
        syncError,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
