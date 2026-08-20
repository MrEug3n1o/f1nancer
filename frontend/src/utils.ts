export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function dollarsToCents(value: string): number {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error("Enter a positive amount");
  }
  return Math.round(n * 100);
}

export function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
