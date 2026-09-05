import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context";
import { parseISODate, toISODate, todayISO } from "../utils";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "./NavIcons";

/** Monday-first weeks (ISO). JS getDay(): 0=Sun … 6=Sat → weekStart 1. */
const WEEK_START = 1;

function weekdayLabels(locale: string): string[] {
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + ((WEEK_START + i) % 7));
    return d.toLocaleDateString(locale || undefined, { weekday: "short" });
  });
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - WEEK_START + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      iso: toISODate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    };
  });
}

function viewFromValue(value: string) {
  const d = value ? parseISODate(value) : new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Choose date",
  allowClear = false,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  const { locale } = useApp();
  const loc = locale || undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasValue = Boolean(value);
  const selected = hasValue ? parseISODate(value) : new Date();
  const [view, setView] = useState(() => viewFromValue(value));

  const dows = useMemo(() => weekdayLabels(locale || "en-GB"), [locale]);
  const cells = useMemo(
    () => monthCells(view.year, view.month),
    [view.month, view.year],
  );
  const today = todayISO();

  useEffect(() => {
    if (!open) {
      setView(viewFromValue(value));
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = hasValue
    ? selected.toLocaleDateString(loc, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : placeholder;
  const monthTitle = new Date(view.year, view.month, 1).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function pick(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  function clear() {
    onChange("");
    setOpen(false);
  }

  return (
    <div className="date-picker" ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`date-trigger${open ? " open" : ""}${hasValue ? "" : " placeholder"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={hasValue ? `Date, ${label}` : "Choose date"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        <IconCalendar className="date-trigger-icon" />
        <span className="date-trigger-label">{label}</span>
      </button>
      {open ? (
        <div className="date-popover" role="dialog" aria-label="Choose date">
          <div className="cal-head">
            <button
              type="button"
              className="cal-nav"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <IconChevronLeft className="cal-nav-icon" />
            </button>
            <p className="cal-month">{monthTitle}</p>
            <button
              type="button"
              className="cal-nav"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <IconChevronRight className="cal-nav-icon" />
            </button>
          </div>
          <div className="cal-grid" role="grid" aria-label={monthTitle}>
            {dows.map((d, i) => (
              <span key={i} className="cal-dow" aria-hidden>
                {d}
              </span>
            ))}
            {cells.map((cell) => {
              const selectedDay = cell.iso === value;
              const isToday = cell.iso === today;
              const ariaLabel = parseISODate(cell.iso).toLocaleDateString(loc, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              });
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  aria-label={ariaLabel}
                  aria-selected={selectedDay}
                  className={`cal-day${cell.inMonth ? "" : " muted"}${isToday ? " today" : ""}${selectedDay ? " selected" : ""}`}
                  onClick={() => pick(cell.iso)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          {allowClear && hasValue ? (
            <button type="button" className="cal-clear" onClick={clear}>
              Clear date
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
