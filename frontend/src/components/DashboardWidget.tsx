import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconEye, IconEyeOff, IconMenuDots } from "./WidgetViewIcons";

function WidgetCustomizeMenu({
  title,
  visible,
  saving,
  onToggleVisibility,
  children,
}: {
  title: string;
  visible: boolean;
  saving: boolean;
  onToggleVisibility: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="widget-menu" ref={rootRef}>
      <button
        type="button"
        className={`btn ghost small widget-menu-btn${open ? " active" : ""}`}
        aria-label={`Customize ${title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <IconMenuDots className="widget-menu-icon" />
      </button>
      {open ? (
        <div className="widget-menu-panel" role="menu">
          {children ? (
            <div className="widget-menu-section" role="group">
              {children}
            </div>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={`widget-menu-item${visible ? " danger" : " accent"}`}
            disabled={saving}
            onClick={() => {
              onToggleVisibility();
              setOpen(false);
            }}
          >
            {visible ? (
              <IconEyeOff className="widget-menu-item-icon" />
            ) : (
              <IconEye className="widget-menu-item-icon" />
            )}
            {visible ? "Hide widget" : "Show widget"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardWidget({
  title,
  visible,
  customizing,
  saving,
  onToggleVisibility,
  headerActions,
  menuOptions,
  children,
}: {
  title: string;
  visible: boolean;
  customizing: boolean;
  saving: boolean;
  onToggleVisibility: () => void;
  headerActions?: ReactNode;
  menuOptions?: ReactNode;
  children: ReactNode;
}) {
  if (!visible && !customizing) return null;

  const hidden = customizing && !visible;

  return (
    <section
      className={`section widget-section${hidden ? " widget-section-hidden" : ""}`}
    >
      <div className="row-between widget-header">
        <h2>{title}</h2>
        <div className="widget-header-actions">
          {!hidden && headerActions ? headerActions : null}
          {customizing ? (
            <WidgetCustomizeMenu
              title={title}
              visible={visible}
              saving={saving}
              onToggleVisibility={onToggleVisibility}
            >
              {menuOptions}
            </WidgetCustomizeMenu>
          ) : null}
        </div>
      </div>
      {hidden ? (
        <p className="muted small widget-hidden-note">
          Hidden from your dashboard. Open customize options to show it again.
        </p>
      ) : (
        children
      )}
    </section>
  );
}
