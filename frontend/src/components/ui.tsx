import { useApp } from "../context";
import { formatMoney } from "../utils";

export function Money({ cents }: { cents: number }) {
  const { currency } = useApp();
  return <span className="money">{formatMoney(cents, currency)}</span>;
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="error-banner">{message}</div>;
}

export function ProgressBar({
  value,
  max,
  color = "var(--accent)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = value > max && max > 0;
  return (
    <div className="progress-track">
      <div
        className={`progress-fill${over ? " over" : ""}`}
        style={{ width: `${pct}%`, background: over ? "var(--danger)" : color }}
      />
    </div>
  );
}
