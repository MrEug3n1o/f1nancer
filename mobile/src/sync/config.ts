export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const powerSyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL ?? "";

export function isSyncConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && powerSyncUrl);
}
