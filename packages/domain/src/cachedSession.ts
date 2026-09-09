/** A cached session opens local data only; the SDK/server still authenticates every cloud request. */
export function parseCachedSession(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(session?.user?.id ?? '')) return null;
    return session;
  } catch { return null; }
}
