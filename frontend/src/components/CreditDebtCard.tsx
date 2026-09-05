import { useState, type FormEvent } from "react";
import { DatePicker } from "./DatePicker";
import { IconTrash } from "./NavIcons";
import { IconButton, Money, ProgressBar } from "./ui";
import { useApp } from "../context";
import type { CreditDebt } from "../types";
import { centsToDollarsInput, dollarsToCents, todayISO } from "../utils";

function formatDisplayDate(iso: string, locale?: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale || undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function directionLabel(direction: CreditDebt["direction"]): string {
  return direction === "credit" ? "Credit" : "Debt";
}

function sourceLabel(source: CreditDebt["source"]): string {
  return source === "bank" ? "Bank" : "Informal";
}

function statusLabel(status: CreditDebt["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function caption(item: CreditDebt): string {
  const parts: string[] = [sourceLabel(item.source)];
  if (item.counterparty) parts.push(item.counterparty);
  if (item.annual_rate_bps != null) {
    const rate = (item.annual_rate_bps / 100).toFixed(
      item.annual_rate_bps % 100 === 0 ? 1 : 2,
    );
    parts.push(`${rate}% p.a.`);
  }
  return parts.join(" · ");
}

export function CreditDebtCard({
  item,
  onPay,
  onDelete,
}: {
  item: CreditDebt;
  onPay: (id: number, amountCents: number, date: string, note: string) => Promise<void>;
  onDelete: (id: number) => void;
}) {
  const { locale } = useApp();
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const isCredit = item.direction === "credit";
  const owed = item.principal_cents + item.accrued_interest_cents;

  async function submitPay(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onPay(item.id, dollarsToCents(amount), payDate, note.trim());
      setAmount("");
      setNote("");
      setPayDate(todayISO());
    } finally {
      setSaving(false);
    }
  }

  async function payRemaining() {
    if (item.remaining_cents <= 0) return;
    setSaving(true);
    try {
      await onPay(item.id, item.remaining_cents, todayISO(), "");
      setAmount("");
      setNote("");
      setPayDate(todayISO());
    } finally {
      setSaving(false);
    }
  }

  const timing =
    item.days_remaining == null
      ? null
      : item.days_remaining > 1
        ? `${item.days_remaining} days left`
        : item.days_remaining === 1
          ? "Due tomorrow"
          : item.days_remaining === 0
            ? "Due today"
            : `${Math.abs(item.days_remaining)} days overdue`;

  return (
    <article className="deposit-card">
      <div className="row-between">
        <div>
          <strong>{item.name}</strong>
          <span className={`badge ${item.direction}`}>{directionLabel(item.direction)}</span>
          <span className={`badge ${item.source}`}>{sourceLabel(item.source)}</span>
          <span className={`badge ${item.status}`}>{statusLabel(item.status)}</span>
        </div>
        <IconButton label="Delete" danger onClick={() => onDelete(item.id)}>
          <IconTrash className="btn-icon" />
        </IconButton>
      </div>

      <p className="deposit-card-term muted">{caption(item)}</p>

      <div className="deposit-card-figures">
        <div className="deposit-figure">
          <span className="stat-label">Principal</span>
          <span className="deposit-figure-value">
            <Money cents={item.principal_cents} currency={item.currency_code} />
          </span>
        </div>
        {item.accrued_interest_cents > 0 ? (
          <div className="deposit-figure">
            <span className="stat-label">Interest</span>
            <span className="deposit-figure-value">
              <Money
                cents={item.accrued_interest_cents}
                currency={item.currency_code}
              />
            </span>
          </div>
        ) : null}
        <div className="deposit-figure">
          <span className="stat-label">Paid</span>
          <span className="deposit-figure-value">
            <Money cents={item.paid_cents} currency={item.currency_code} />
          </span>
        </div>
        <div className="deposit-figure">
          <span className="stat-label">{isCredit ? "Owed to you" : "You owe"}</span>
          <span className={`deposit-figure-value${isCredit ? " income" : " expense"}`}>
            <Money cents={item.remaining_cents} currency={item.currency_code} />
          </span>
        </div>
      </div>

      <ProgressBar value={item.paid_cents} max={owed} />
      <p className="muted small">{item.progress_pct}% paid</p>

      <div className="deposit-card-meta">
        <span>Started {formatDisplayDate(item.start_date, locale || undefined)}</span>
        {item.due_date ? (
          <>
            <span aria-hidden>·</span>
            <span>Due {formatDisplayDate(item.due_date, locale || undefined)}</span>
          </>
        ) : null}
        {timing ? (
          <>
            <span aria-hidden>·</span>
            <span>{timing}</span>
          </>
        ) : null}
      </div>

      {item.note ? <p className="deposit-card-note muted">{item.note}</p> : null}

      {item.status === "active" ? (
        <form className="form-grid goal-txn-form" onSubmit={(e) => void submitPay(e)}>
          <label>
            Payment
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder={centsToDollarsInput(item.remaining_cents)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            Date
            <DatePicker
              value={payDate}
              onChange={setPayDate}
              disabled={saving}
            />
          </label>
          <label>
            Note
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              disabled={saving}
            />
          </label>
          <div className="form-actions span-2">
            <button type="submit" className="btn primary small" disabled={saving}>
              Record payment
            </button>
            {item.remaining_cents > 0 ? (
              <button
                type="button"
                className="btn small"
                disabled={saving}
                onClick={() => void payRemaining()}
              >
                Pay remaining
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </article>
  );
}
