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

/** Convert a percent string like "5.25" to integer basis points (525). */
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

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function shiftDateISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
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

type PywebviewApi = {
  set_title_bar_theme?: (theme: "light" | "dark") => Promise<unknown>;
};

function desktopApi(): PywebviewApi | undefined {
  return (
    window as Window & { pywebview?: { api?: PywebviewApi } }
  ).pywebview?.api;
}

function syncWindowsTitleBar(theme: "light" | "dark"): void {
  const api = desktopApi();
  if (typeof api?.set_title_bar_theme !== "function") return;
  void api.set_title_bar_theme(theme).catch(() => undefined);
}

export function applyTheme(
  theme: "light" | "dark" | "system" | string | null | undefined,
): "light" | "dark" {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  syncWindowsTitleBar(resolved);
  return resolved;
}

if (typeof window !== "undefined") {
  window.addEventListener("pywebviewready", () => {
    const current = document.documentElement.dataset.theme;
    if (current === "dark" || current === "light") {
      syncWindowsTitleBar(current);
    }
  });
}

function parseHexColor(
  color: string,
): { r: number; g: number; b: number } | null {
  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Lift stored category/goal colors so slices stay readable on dark cards. */
export function chartFill(
  color: string,
  theme: "light" | "dark",
): string {
  if (theme !== "dark") return color;
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const nextS = s < 0.18 ? s : Math.min(0.72, Math.max(s * 1.06, 0.42));
  const nextL =
    l >= 0.62 ? Math.min(0.74, l + 0.04) : Math.min(0.68, Math.max(0.56, l + 0.24));
  return hslToHex(h, nextS, nextL);
}
