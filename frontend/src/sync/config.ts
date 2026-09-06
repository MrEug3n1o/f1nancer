export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const powerSyncUrl = import.meta.env.VITE_POWERSYNC_URL ?? "";

export function isSyncConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && powerSyncUrl);
}
