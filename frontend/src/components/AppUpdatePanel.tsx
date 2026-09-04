import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export type UpdateInfo = {
  version?: string;
  status: string;
  message: string;
  error: string | null;
  current_version?: string;
  latest_version?: string | null;
  current_sha: string | null;
  latest_sha: string | null;
  update_available: boolean;
  can_update: boolean;
  mode?: string;
  source?: string | null;
  progress?: number;
  phase?: string;
  log: string;
  github_repo?: string;
  branch?: string;
};

function shortSha(sha: string | null | undefined): string {
  if (!sha) return "—";
  return sha.slice(0, 7);
}

function statusMeta(info: UpdateInfo | null): {
  label: string;
  tone: "neutral" | "ok" | "warn" | "busy" | "danger";
} {
  switch (info?.status) {
    case "up_to_date":
      return { label: "Up to date", tone: "ok" };
    case "available":
      return { label: "Update available", tone: "warn" };
    case "checking":
      return { label: "Checking", tone: "busy" };
    case "updating":
      return { label: "Updating", tone: "busy" };
    case "ready":
      return { label: "Ready to install", tone: "warn" };
    case "relaunching":
      return { label: "Restarting", tone: "busy" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    default:
      return { label: "Idle", tone: "neutral" };
  }
}

type Props = {
  onError: (message: string | null) => void;
};

export function AppUpdatePanel({ onError }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);
  const active =
    info?.status === "updating" ||
    info?.status === "checking" ||
    info?.status === "relaunching";

  useEffect(() => {
    void api
      .get<UpdateInfo>("/system/info")
      .then((data) => {
        setInfo(data);
        if (data.status === "failed" || data.log) setShowLog(data.status === "failed");
      })
      .catch(() => setInfo(null));
    // Quiet auto-check so the badge is meaningful on open.
    void api
      .post<UpdateInfo>("/system/update/check", {})
      .then(setInfo)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      void api
        .get<UpdateInfo>("/system/update")
        .then((data) => {
          setInfo(data);
          if (data.status === "failed") setShowLog(true);
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!showLog || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [info?.log, showLog]);

  async function checkForUpdates() {
    onError(null);
    setBusy(true);
    try {
      const data = await api.post<UpdateInfo>("/system/update/check", {});
      setInfo(data);
      if (data.status === "failed") setShowLog(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not check for updates");
    } finally {
      setBusy(false);
    }
  }

  async function startAppUpdate() {
    onError(null);
    setBusy(true);
    setShowLog(false);
    try {
      const data = await api.post<UpdateInfo>("/system/update", {});
      setInfo(data);
      if (data.status === "failed") {
        setShowLog(true);
        onError(data.error || data.message || "Update failed");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not start update");
    } finally {
      setBusy(false);
    }
  }

  async function installAndRestart() {
    onError(null);
    setBusy(true);
    try {
      setInfo(await api.post<UpdateInfo>("/system/update/relaunch", {}));
    } catch (err) {
      setBusy(false);
      onError(err instanceof Error ? err.message : "Could not restart");
    }
  }

  const meta = statusMeta(info);
  const version = info?.current_version ?? info?.version ?? "…";
  const latestLabel = info?.latest_version || shortSha(info?.latest_sha);
  const progress = Math.max(0, Math.min(100, info?.progress ?? 0));
  const cannotInstall = info?.can_update === false;
  const disabled = busy || active;
  const primaryLabel =
    info?.status === "updating"
      ? "Updating…"
      : info?.status === "relaunching"
        ? "Restarting…"
        : "Update & restart";

  return (
    <section className="section update-panel">
      <div className="update-panel-head">
        <div>
          <h2>App updates</h2>
          <p className="muted update-lead">
            One click downloads the latest build from GitHub, installs it, and
            restarts. Your data stays on this computer.
          </p>
        </div>
        <span className={`update-status update-status-${meta.tone}`}>
          {meta.label}
        </span>
      </div>

      <div className="update-version-card">
        <div>
          <div className="update-version-label">Current version</div>
          <div className="update-version-value">{version}</div>
        </div>
        <div className="update-meta-grid">
          <div>
            <span className="muted small">Installed</span>
            <strong>{shortSha(info?.current_sha)}</strong>
          </div>
          <div>
            <span className="muted small">Latest</span>
            <strong>{latestLabel}</strong>
          </div>
        </div>
      </div>

      {info?.message ? (
        <p
          className={
            info.status === "failed" ? "update-message danger-text" : "update-message"
          }
        >
          {info.message}
          {info.error ? (
            <span className="update-error-detail"> {info.error}</span>
          ) : null}
        </p>
      ) : null}

      {(info?.status === "updating" || info?.status === "relaunching") && (
        <div className="update-progress-block">
          <div className="row-between">
            <span className="muted small">{info.phase || "Working…"}</span>
            <span className="muted small">{progress}%</span>
          </div>
          <div className="progress-track update-progress-track">
            <div
              className="progress-fill update-progress-fill"
              style={{ width: `${Math.max(progress, 6)}%` }}
            />
          </div>
        </div>
      )}

      <div className="update-actions">
        <button
          type="button"
          className="btn ghost"
          disabled={disabled}
          onClick={() => void checkForUpdates()}
        >
          Check
        </button>
        {info?.status === "ready" ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void installAndRestart()}
          >
            Install &amp; restart
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            disabled={disabled || cannotInstall}
            onClick={() => void startAppUpdate()}
          >
            {primaryLabel}
          </button>
        )}
      </div>

      {(info?.status === "updating" ||
        info?.status === "failed" ||
        info?.status === "ready" ||
        info?.status === "relaunching") &&
        info?.log && (
        <details
          className="update-log-details"
          open={showLog || info.status === "failed"}
          onToggle={(e) => setShowLog((e.target as HTMLDetailsElement).open)}
        >
          <summary>Show details</summary>
          <pre className="update-log" ref={logRef} aria-live="polite">
            {info.log}
          </pre>
        </details>
      )}
    </section>
  );
}
