import { IconTrash } from "./NavIcons";
import { IconButton, Money } from "./ui";
import { useApp } from "../context";
import type { Deposit } from "../types";

function formatDisplayDate(iso: string, locale?: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale || undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function termCaption(d: Deposit): string {
  const start = new Date(d.start_date + "T12:00:00");
  const end = new Date(d.end_date + "T12:00:00");
  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  const months = Math.max(1, Math.round(days / 30.4375));
  let duration: string;
  if (days <= 40) duration = `${days} days`;
  else if (months < 18) duration = months === 1 ? "1 month" : `${months} months`;
  else {
    const years = Math.round(months / 12);
    duration = years === 1 ? "1 year" : `${years} years`;
  }

  if (d.type === "bank" && d.annual_rate_bps != null) {
    const rate = (d.annual_rate_bps / 100).toFixed(
      d.annual_rate_bps % 100 === 0 ? 1 : 2,
    );
    return `${duration} · ${rate}% p.a.`;
  }
  if (d.type === "rental") {
    return d.counterparty
      ? `Rental · ${d.counterparty}`
      : `Rental · ${duration}`;
  }
  return duration;
}

function statusLabel(status: Deposit["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "matured":
      return "Matured";
    case "returned":
      return "Returned";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function DepositAccrualRing({
  progressPct,
  accruedCents,
  currency,
  size = 180,
}: {
  progressPct: number;
  accruedCents: number;
  currency: string;
  size?: number;
}) {
  const stroke = Math.max(10, Math.round(size * 0.07));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, progressPct));
  const dash = (pct / 100) * c;
  const segment = c / 7;
  const gap = segment * 0.16;

  return (
    <div className="deposit-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="deposit-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${segment - gap} ${gap}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <circle
          className="deposit-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="deposit-ring-center">
        <span className="deposit-ring-badge">%</span>
        <strong className="deposit-ring-amount">
          <Money cents={accruedCents} currency={currency} />
        </strong>
        <span className="deposit-ring-label">Accrued</span>
      </div>
    </div>
  );
}

export function DepositCard({
  deposit,
  onComplete,
  onDelete,
}: {
  deposit: Deposit;
  onComplete?: (id: number) => void;
  onDelete?: (id: number) => void;
}) {
  const { locale } = useApp();
  const d = deposit;
  const isBank = d.type === "bank";
  const accrued = isBank ? d.accrued_interest_cents : 0;
  const timing =
    d.days_remaining > 0
      ? `${d.days_remaining} days left`
      : d.days_remaining === 0
        ? "Due today"
        : `${Math.abs(d.days_remaining)} days overdue`;

  return (
    <article className="deposit-card">
      <div className="row-between">
        <div>
          <strong>{d.name}</strong>
          <span className={`badge ${d.type}`}>{d.type}</span>
          <span className="badge">
            {d.money_location === "cash" ? "Cash" : "Card"}
          </span>
          <span className={`badge ${d.status}`}>{statusLabel(d.status)}</span>
        </div>
        {onDelete ? (
          <IconButton label="Delete" danger onClick={() => onDelete(d.id)}>
            <IconTrash className="btn-icon" />
          </IconButton>
        ) : null}
      </div>

      <p className="deposit-card-term muted">{termCaption(d)}</p>

      <div className="deposit-card-main">
        <div className="deposit-card-figures">
          <div className="deposit-figure">
            <span className="stat-label">Principal</span>
            <span className="deposit-figure-value">
              <Money cents={d.principal_cents} currency={d.currency_code} />
            </span>
          </div>
          {isBank ? (
            <>
              <div className="deposit-figure">
                <span className="stat-label">Accrued</span>
                <span className="deposit-figure-value income">
                  <Money
                    cents={d.accrued_interest_cents}
                    currency={d.currency_code}
                  />
                </span>
              </div>
              {d.maturity_value_cents != null ? (
                <div className="deposit-figure">
                  <span className="stat-label">At maturity</span>
                  <span className="deposit-figure-value">
                    <Money
                      cents={d.maturity_value_cents}
                      currency={d.currency_code}
                    />
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="deposit-figure">
              <span className="stat-label">To return</span>
              <span className="deposit-figure-value">
                <Money cents={d.principal_cents} currency={d.currency_code} />
              </span>
            </div>
          )}
        </div>
        <DepositAccrualRing
          progressPct={d.term_progress_pct}
          accruedCents={accrued}
          currency={d.currency_code}
          size={150}
        />
      </div>

      <div className="deposit-card-meta">
        <span>
          {isBank ? "Matures" : "Return"}{" "}
          {formatDisplayDate(d.end_date, locale || undefined)}
        </span>
        <span aria-hidden>·</span>
        <span>{timing}</span>
        <span aria-hidden>·</span>
        <span>
          {formatDisplayDate(d.start_date, locale || undefined)} →{" "}
          {formatDisplayDate(d.end_date, locale || undefined)}
        </span>
      </div>

      {d.note ? <p className="deposit-card-note muted">{d.note}</p> : null}

      {onComplete && d.status === "active" ? (
        <div className="contribute-row">
          <button
            type="button"
            className="btn primary small"
            onClick={() => onComplete(d.id)}
          >
            {isBank ? "Mark matured" : "Mark returned"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
