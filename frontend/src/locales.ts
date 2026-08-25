export const LOCALE_OPTIONS = [
  { value: "", label: "Auto", short: "Auto", title: "Use browser language" },
  { value: "en-US", label: "English", short: "EN" },
  { value: "uk-UA", label: "Українська", short: "UA" },
] as const;

export type LocaleValue = (typeof LOCALE_OPTIONS)[number]["value"];

export function normalizeLocale(locale: string): LocaleValue {
  const v = locale.trim().toLowerCase();
  if (!v) return "";
  if (v === "eng" || v === "en" || v.startsWith("en-")) return "en-US";
  if (v === "ua" || v === "uk" || v.startsWith("uk-")) return "uk-UA";
  const match = LOCALE_OPTIONS.find((o) => o.value.toLowerCase() === v);
  return match?.value ?? "";
}
