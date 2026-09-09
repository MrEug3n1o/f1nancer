import { uploadSyncBatch } from "@f1nancer/domain";
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web";
import { powerSyncUrl } from "./config";
import { getSupabase } from "./supabaseClient";

export class SupabaseConnector implements PowerSyncBackendConnector {
  readonly userId: string;
  readonly instanceId: string;
  constructor(userId: string, instanceId: string) { this.userId = userId; this.instanceId = instanceId; }
  async fetchCredentials() {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    if (!data.session || data.session.user.id !== this.userId) throw new Error("Sign in again to reconnect cloud sync.");
    return { endpoint: powerSyncUrl, token: data.session.access_token,
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000) : undefined };
  }
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== this.userId) throw new Error("Account changed. Pending changes have been retained.");
    await uploadSyncBatch(database, getSupabase(), this.instanceId);
  }
}
