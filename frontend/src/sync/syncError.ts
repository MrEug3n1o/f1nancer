export function formatSyncError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("PSYNC_S2105") ||
    msg.includes('Unexpected "aud" claim') ||
    msg.includes("Unexpected 'aud' claim")
  ) {
    return 'Cloud sync rejected this login token. In the PowerSync Dashboard open Client Auth, enable “Use Supabase Auth” (audience authenticated), then Save and Deploy.';
  }
  return msg || "Cloud sync is unavailable.";
}

export function syncErrorFromStatus(status: {
  dataFlowStatus?: { downloadError?: Error; uploadError?: Error };
}): string | null {
  const err = status.dataFlowStatus?.downloadError ?? status.dataFlowStatus?.uploadError;
  return err ? formatSyncError(err) : null;
}
