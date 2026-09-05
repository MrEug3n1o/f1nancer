import { useEffect, useId, useRef, useState } from "react";

export type PillOption = {
  value: string;
  label: string;
  swatch?: string;
};

export function PillSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  align = "right",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PillOption[];
  ariaLabel: string;
  className?: string;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

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

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div
      className={["pill-select", className].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button
        type="button"
        className={`pill-select-trigger${open ? " open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
      >
        {selected?.swatch ? (
          <span className="swatch" style={{ background: selected.swatch }} />
        ) : null}
        <span className="pill-select-label">{selected?.label ?? "—"}</span>
        <span className="pill-select-chevron" aria-hidden />
      </button>
      {open ? (
        <div
          id={listId}
          className={`pill-select-menu${align === "left" ? " align-left" : ""}`}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            const showSwatchSlot = options.some((o) => o.swatch);
            return (
              <button
                key={opt.value || "__all__"}
                type="button"
                role="option"
                aria-selected={active}
                className={`pill-select-option${active ? " selected" : ""}`}
                onClick={() => pick(opt.value)}
              >
                {showSwatchSlot ? (
                  opt.swatch ? (
                    <span className="swatch" style={{ background: opt.swatch }} />
                  ) : (
                    <span className="pill-select-dot" aria-hidden />
                  )
                ) : null}
                <span>{opt.label}</span>
                {active ? <span className="pill-select-check" aria-hidden>✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
