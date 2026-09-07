function collectText(err: unknown, into: string[]): void {
  if (err == null) return;
  if (typeof err === "string") {
    if (err) into.push(err);
    return;
  }
  if (typeof err === "number" || typeof err === "boolean") {
    into.push(String(err));
    return;
  }
  if (err instanceof Error) {
    if (err.message) into.push(err.message);
    else if (err.name) into.push(err.name);
    return;
  }
  if (typeof err !== "object") {
    into.push(String(err));
    return;
  }
  const obj = err as Record<string, unknown>;
  for (const key of ["message", "error", "code", "error_description", "errorDescription"] as const) {
    const value = obj[key];
    if (typeof value === "string" && value) into.push(value);
    else if (value && typeof value === "object") collectText(value, into);
  }
}

function extractSyncErrorText(err: unknown): string {
  const parts: string[] = [];
  collectText(err, parts);
  if (parts.length) return parts.join(" ");
  if (err && typeof err === "object") {
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      /* circular */
    }
    return "Cloud sync is unavailable.";
  }
  return String(err ?? "");
}

export function formatSyncError(err: unknown): string {
  const msg = extractSyncErrorText(err);
  if (
    msg.includes("PSYNC_S2105") ||
    msg.includes('Unexpected "aud" claim') ||
    msg.includes("Unexpected 'aud' claim")
  ) {
    return 'Cloud sync rejected this login token. In the PowerSync Dashboard open Client Auth, add JWT Audience “authenticated” (and enable Use Supabase Auth if needed), then Save and Deploy.';
  }
  return msg || "Cloud sync is unavailable.";
}

export function syncErrorFromStatus(status: {
  dataFlowStatus?: { downloadError?: unknown; uploadError?: unknown };
}): string | null {
  const err = status.dataFlowStatus?.downloadError ?? status.dataFlowStatus?.uploadError;
  return err ? formatSyncError(err) : null;
}
