export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string, locale?: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale || undefined, {
    month: "long",
    year: "numeric",
  });
}

export function formatMoney(
  cents: number,
  currency = "USD",
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
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

export function resolveTheme(
  theme: "light" | "dark" | "system" | string | null | undefined,
): "light" | "dark" {
  if (theme === "dark" || theme === "light") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(
  theme: "light" | "dark" | "system" | string | null | undefined,
) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
