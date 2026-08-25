import type { ReactNode, SelectHTMLAttributes } from "react";
import { useApp } from "../context";
import { formatMoney } from "../utils";

export function Select({
  compact = false,
  wide = false,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  compact?: boolean;
  wide?: boolean;
}) {
  const wrapClass = [
    "select-wrap",
    compact && "compact",
    wide && "wide",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapClass}>
      <select className="select-field" {...props}>
        {children}
      </select>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  compact = false,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: {
    value: T;
    label: ReactNode;
    short?: ReactNode;
    title?: string;
  }[];
  compact?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`segmented${compact ? " compact" : ""}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segmented-btn${value === opt.value ? " active" : ""}`}
          aria-pressed={value === opt.value}
          title={opt.title}
          onClick={() => onChange(opt.value)}
        >
          {compact && opt.short != null ? opt.short : opt.label}
        </button>
      ))}
    </div>
  );
}

export function Money({
  cents,
  currency,
}: {
  cents: number;
  currency: string;
}) {
  const { locale } = useApp();
  return (
    <span className="money">{formatMoney(cents, currency, locale || undefined)}</span>
  );
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
