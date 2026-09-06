export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const last = new Date(year, mon, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, "0")}`,
  };
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function daysBetween(start: string, end: string): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

export function addYears(iso: string, years: number): string {
  const d = parseISODate(iso);
  d.setFullYear(d.getFullYear() + years);
  return toISODate(d);
}

export function isoMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function inMonth(iso: string, month: string): boolean {
  return isoMonth(iso) === month;
}

export function dateLte(a: string, b: string): boolean {
  return a.slice(0, 10) <= b.slice(0, 10);
}

export function dateGte(a: string, b: string): boolean {
  return a.slice(0, 10) >= b.slice(0, 10);
}
