import { useEffect, useState } from "react";
import {
  cloudLooksEmpty,
  fetchLocalExport,
  importLocalPayload,
} from "../data/importLocal";
import { useApp } from "../context";

const DISMISS_KEY = "f1nancer.importLegacyDismissed";

export function ImportBanner() {
  const { refreshCurrencies, refreshSettings } = useApp();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") return;
    void (async () => {
      const payload = await fetchLocalExport();
      if (!payload?.transactions?.length && !payload?.categories?.length) return;
      if (!(await cloudLooksEmpty())) return;
      setVisible(true);
    })();
  }, []);

  if (!visible) return null;

  async function onImport() {
    setBusy(true);
    setError(null);
    try {
      const payload = await fetchLocalExport();
      if (!payload) throw new Error("No local database found");
      await importLocalPayload(payload);
      localStorage.setItem(DISMISS_KEY, "true");
      setVisible(false);
      await refreshCurrencies();
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-banner">
      <div>
        <strong>Bring in your old local data?</strong>
        <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
          A previous SQLite file was found on this computer.
          {error ? ` ${error}` : ""}
        </p>
      </div>
      <div className="form-actions">
        <button className="btn primary" type="button" disabled={busy} onClick={() => void onImport()}>
          {busy ? "Importing…" : "Import"}
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "true");
            setVisible(false);
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
