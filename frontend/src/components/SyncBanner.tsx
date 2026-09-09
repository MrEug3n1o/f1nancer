import { useAuth } from "../sync/AuthProvider";
export function SyncBanner() {
  const { syncError, syncInfo, retrySync } = useAuth();
  return <div className="sync-banner" role="status"><div>
    <strong>{syncError ? syncError.message : syncInfo.connected && !syncInfo.hasSynced ? "Downloading your data…" : syncInfo.connected ? "Cloud connected" : "Offline — local data available"}</strong>
    <p>{syncInfo.pendingUploads} changes waiting to upload · {syncInfo.lastSyncedAt ? `Last synced ${new Date(syncInfo.lastSyncedAt).toLocaleString()}` : "First cloud download not confirmed"}</p>
    {syncInfo.conflicts > 0 && <p>{syncInfo.conflicts} backup conflicts need review in Settings.</p>}
  </div><button className="btn" onClick={() => void retrySync()}>Retry sync</button></div>;
}
