import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createContext, useContext } from "react";
import { usernameToEmail, validatePassword, validateUsername } from "@f1nancer/domain";
import type { Session } from "@supabase/supabase-js";
import { isSyncConfigured, supabaseUrl } from "./config";
import { supabase, SupabaseConnector } from "./connector";
import { powerSync } from "./database";

interface AuthContextValue {
  session: Session | null;
  username: string | null;
  loading: boolean;
  configured: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const connector = new SupabaseConnector();

async function authUsername(action: "signin" | "signup", username: string, password: string) {
  const normalized = validateUsername(username);
  validatePassword(password);
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/auth-username`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, username: normalized, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Authentication failed");
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
  const configured = isSyncConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!session) {
      void powerSync.disconnect();
      return;
    }
    void powerSync.connect(connector);
  }, [session]);

  const signIn = useCallback(
    (username: string, password: string) => authUsername("signin", username, password),
    [],
  );
  const signUp = useCallback(
    (username: string, password: string) => authUsername("signup", username, password),
    [],
  );
  const signOut = useCallback(async () => {
    await powerSync.disconnectAndClear();
    await supabase.auth.signOut();
  }, []);

  const username = useMemo(() => {
    const meta = session?.user.user_metadata as { username?: string } | undefined;
    return meta?.username || session?.user.email?.split("@")[0] || null;
  }, [session]);

  return (
    <AuthContext.Provider
      value={{ session, username, loading, configured, signIn, signUp, signOut }}
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
