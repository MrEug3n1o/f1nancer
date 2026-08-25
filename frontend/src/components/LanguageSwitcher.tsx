import { SegmentedControl } from "./ui";
import { LOCALE_OPTIONS, normalizeLocale } from "../locales";

export function LanguageSwitcher({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (locale: string) => void;
  compact?: boolean;
}) {
  const normalized = normalizeLocale(value);

  return (
    <SegmentedControl
      value={normalized}
      onChange={onChange}
      compact={compact}
      ariaLabel="Language"
      options={LOCALE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        short: opt.short,
        title: "title" in opt ? opt.title : undefined,
      }))}
    />
  );
}
