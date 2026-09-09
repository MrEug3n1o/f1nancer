import { parseCachedSession } from "@f1nancer/domain";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { isSyncConfigured, supabaseAnonKey, supabaseUrl } from "./config";

const storageKey = supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token` : "f1nancer-unconfigured";

export async function readCachedSession(): Promise<Session | null> {
  try { return parseCachedSession(localStorage.getItem(storageKey)) as Session | null; } catch { return null; }
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  if (!isSyncConfigured()) {
    throw new Error("Sync is not configured. Missing VITE_SUPABASE_* / VITE_POWERSYNC_URL.");
  }
  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return _supabase;
}

/** Lazy proxy so call sites can keep using `supabase.*` without constructing at import time. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
});

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}
