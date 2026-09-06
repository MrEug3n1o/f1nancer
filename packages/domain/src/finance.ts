import { addDays, addMonths, addYears, daysBetween, todayISO } from "./dates";
import type {
  Cadence,
  CreditDebt,
  CreditDebtDirection,
  Deposit,
  Transaction,
} from "./types";

export function daysHeld(
  start: string,
  end: string,
  asOf: string = todayISO(),
): number {
  const capped = asOf.slice(0, 10) < end.slice(0, 10) ? asOf : end;
  return Math.max(0, daysBetween(start.slice(0, 10), capped.slice(0, 10)));
}

export function daysRemaining(end: string, asOf: string = todayISO()): number {
  return daysBetween(asOf.slice(0, 10), end.slice(0, 10));
}

export function simpleInterestCents(
  principalCents: number,
  annualRateBps: number,
  start: string,
  end: string,
  asOf: string = todayISO(),
): number {
  if (principalCents <= 0 || annualRateBps <= 0) return 0;
  const held = daysHeld(start, end, asOf);
  if (held <= 0) return 0;
  return Math.round((principalCents * annualRateBps * held) / (10000 * 365));
}

export function maturityInterestCents(
  principalCents: number,
  annualRateBps: number,
  start: string,
  end: string,
): number {
  return simpleInterestCents(principalCents, annualRateBps, start, end, end);
}

export function termProgressPct(
  start: string,
  end: string,
  asOf: string = todayISO(),
): number {
  const total = daysBetween(start.slice(0, 10), end.slice(0, 10));
  if (total <= 0) return asOf.slice(0, 10) >= end.slice(0, 10) ? 100 : 0;
  const held = daysHeld(start, end, asOf);
  return Math.min(100, Math.round((held / total) * 1000) / 10);
}

export function enrichDeposit(d: Deposit, asOf: string = todayISO()): Deposit {
  const rate = d.annual_rate_bps;
  const accrued =
    d.type === "bank" && rate != null
      ? simpleInterestCents(d.principal_cents, rate, d.start_date, d.end_date, asOf)
      : 0;
  const maturity =
    d.type === "bank" && rate != null
      ? d.principal_cents +
        maturityInterestCents(d.principal_cents, rate, d.start_date, d.end_date)
      : d.principal_cents;
  return {
    ...d,
    accrued_interest_cents: accrued,
    current_value_cents: d.principal_cents + accrued,
    maturity_value_cents: d.type === "bank" ? maturity : d.principal_cents,
    days_remaining: daysRemaining(d.end_date, asOf),
    term_progress_pct: termProgressPct(d.start_date, d.end_date, asOf),
  };
}

export function openingTxnType(direction: CreditDebtDirection): "income" | "expense" {
  return direction === "credit" ? "expense" : "income";
}

export function paymentTxnType(direction: CreditDebtDirection): "income" | "expense" {
  return direction === "credit" ? "income" : "expense";
}

export function creditAccruedInterest(
  item: Pick<CreditDebt, "annual_rate_bps" | "principal_cents" | "start_date" | "due_date">,
  asOf: string = todayISO(),
): number {
  if (!item.annual_rate_bps) return 0;
  const end = item.due_date || asOf;
  return simpleInterestCents(
    item.principal_cents,
    item.annual_rate_bps,
    item.start_date,
    end,
    asOf,
  );
}

export function paidCentsFor(
  transactions: Transaction[],
  creditDebtId: string,
  direction: CreditDebtDirection,
): number {
  const payType = paymentTxnType(direction);
  return transactions
    .filter((t) => t.credit_debt_id === creditDebtId && t.type === payType)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function remainingCentsFor(
  item: CreditDebt,
  transactions: Transaction[],
  asOf: string = todayISO(),
): number {
  if (item.status === "paid") return 0;
  const accrued = creditAccruedInterest(item, asOf);
  const paid = paidCentsFor(transactions, item.id, item.direction);
  return Math.max(0, item.principal_cents + accrued - paid);
}

export function progressPct(paid: number, principal: number, accrued: number): number {
  const total = principal + accrued;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((paid / total) * 1000) / 10);
}

export function enrichCreditDebt(
  item: CreditDebt,
  transactions: Transaction[],
  asOf: string = todayISO(),
): CreditDebt {
  const accrued = creditAccruedInterest(item, asOf);
  const paid = paidCentsFor(transactions, item.id, item.direction);
  const remaining =
    item.status === "paid" ? 0 : Math.max(0, item.principal_cents + accrued - paid);
  return {
    ...item,
    accrued_interest_cents: accrued,
    paid_cents: paid,
    remaining_cents: remaining,
    progress_pct: progressPct(paid, item.principal_cents, accrued),
    days_remaining: item.due_date ? daysRemaining(item.due_date, asOf) : null,
    transactions: transactions.filter((t) => t.credit_debt_id === item.id),
  };
}

export function goalSavedCents(transactions: Transaction[], goalId: string): number {
  return transactions
    .filter((t) => t.goal_id === goalId && t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
}

export function goalProgressPct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 1000) / 10);
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function billingDateInMonth(
  year: number,
  month: number,
  billingDay: number,
): string {
  const day = Math.min(billingDay, lastDayOfMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function advanceRunDate(
  current: string,
  cadence: Cadence,
  billingDay: number,
): string {
  const iso = current.slice(0, 10);
  if (cadence === "weekly") return addDays(iso, 7);
  if (cadence === "yearly") return addYears(iso, 1);
  const next = addMonths(`${iso.slice(0, 8)}01`, 1);
  const [y, m] = next.split("-").map(Number);
  return billingDateInMonth(y, m, billingDay);
}

export function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function asInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
