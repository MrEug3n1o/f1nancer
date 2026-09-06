export function dollarsToCents(value: string): number {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n) || n <= 0) {
    throw new Error("Enter a positive amount");
  }
  return Math.round(n * 100);
}

export function percentToBps(value: string): number {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n) || n < 0) {
    throw new Error("Enter a non-negative interest rate");
  }
  return Math.round(n * 100);
}

export function bpsToPercentInput(bps: number): string {
  return (bps / 100).toFixed(2);
}

export function centsToDollarsInput(cents: number): string {
  return (cents / 100).toFixed(2);
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
