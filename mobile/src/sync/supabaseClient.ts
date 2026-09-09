import { parseCachedSession } from "@f1nancer/domain";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { isSyncConfigured, supabaseAnonKey, supabaseUrl } from "./config";

const storageKey = supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token` : "f1nancer-unconfigured";

export async function readCachedSession(): Promise<Session | null> {
  try { return parseCachedSession(await AsyncStorage.getItem(storageKey)) as Session | null; } catch { return null; }
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  if (!isSyncConfigured()) {
    throw new Error("Sync is not configured. Missing EXPO_PUBLIC_SUPABASE_* / POWERSYNC_URL.");
  }
  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      storage: AsyncStorage,
      detectSessionInUrl: false,
    },
  });
  const client = _supabase;
  if (AppState.currentState === 'active') client.auth.startAutoRefresh();
  else client.auth.stopAutoRefresh();
  AppState.addEventListener('change', state => {
    if (state === 'active') client.auth.startAutoRefresh(); else client.auth.stopAutoRefresh();
  });
  return client;
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
