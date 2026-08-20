import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { ErrorBanner } from "../components/ui";
import { useApp } from "../context";
import type { Settings } from "../types";

export function SettingsPage() {
  const { currency, refreshSettings } = useApp();
  const [code, setCode] = useState(currency);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCode(currency);
  }, [currency]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const updated = await api.patch<Settings>("/settings", {
        currency_code: code.trim().toUpperCase(),
      });
      setCode(updated.currency_code);
      await refreshSettings();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      <section className="section">
        <h2>Settings</h2>
        <p className="muted">
          Data stays on this machine in a local SQLite file. Backup by copying{" "}
          <code>backend/data/f1nancer.db</code>.
        </p>
        <form className="form-grid narrow" onSubmit={onSubmit}>
          <label>
            Currency code
            <input
              required
              maxLength={3}
              minLength={3}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="USD"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary">
              Save
            </button>
            {saved ? <span className="success-text">Saved</span> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
