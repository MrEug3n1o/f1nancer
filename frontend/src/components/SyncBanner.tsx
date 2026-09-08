import { useAuth } from "../sync/AuthProvider";

export function SyncBanner() {
  const { syncError } = useAuth();
  if (!syncError) return null;
  const isUpload = syncError.kind === "upload";
  return (
    <div className="sync-banner" role="alert">
      <div>
        <strong>{isUpload ? "Cloud sync upload failed" : "Cloud sync is not connected"}</strong>
        <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
          {syncError.message}{" "}
          {isUpload
            ? "Your data on this computer is still here; changes are not reaching the cloud yet."
            : "Your data on this computer is still here; it just is not downloading from the cloud yet."}
        </p>
      </div>
    </div>
  );
}
