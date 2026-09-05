import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { IconEye, IconEyeOff, IconGrip, IconMenuDots } from "./WidgetViewIcons";

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
        className={`widget-icon-btn${open ? " active" : ""}`}
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
            className="widget-view-option"
            disabled={saving}
            onClick={() => {
              onToggleVisibility();
              setOpen(false);
            }}
          >
            <span className="widget-view-icon-wrap" aria-hidden>
              {visible ? (
                <IconEyeOff className="widget-view-icon" />
              ) : (
                <IconEye className="widget-view-icon" />
              )}
            </span>
            <span className="widget-view-label">
              {visible ? "Hide widget" : "Show widget"}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type DashboardWidgetProps = {
  title: string;
  visible: boolean;
  customizing: boolean;
  saving: boolean;
  span?: 1 | 2;
  col?: 0 | 1;
  gridRow?: number;
  onToggleVisibility: () => void;
  headerActions?: ReactNode;
  menuOptions?: ReactNode;
  children: ReactNode;
  dragHandleRef?: (node: HTMLElement | null) => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  style?: CSSProperties;
};

export function DashboardWidget({
  title,
  visible,
  customizing,
  saving,
  span = 2,
  col = 0,
  gridRow,
  onToggleVisibility,
  headerActions,
  menuOptions,
  children,
  dragHandleRef,
  dragHandleProps,
  isDragging,
  style,
}: DashboardWidgetProps) {
  if (!visible && !customizing) return null;

  const hidden = customizing && !visible;
  const columnClass = span === 2 ? "widget-span-2" : col === 1 ? "widget-col-1" : "widget-col-0";

  return (
    <section
      style={{ ...style, gridRow: gridRow ? gridRow : undefined }}
      className={`section widget-section ${columnClass}${hidden ? " widget-section-hidden" : ""}${isDragging ? " widget-section-dragging" : ""}`}
    >
      <div className="row-between widget-header">
        <div className="widget-title-row">
          {customizing && dragHandleProps ? (
            <button
              type="button"
              className="widget-icon-btn widget-drag-handle"
              aria-label={`Move ${title}`}
              ref={dragHandleRef}
              {...dragHandleProps}
            >
              <IconGrip className="widget-menu-icon" />
            </button>
          ) : null}
          <h2>{title}</h2>
        </div>
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
        <div className="widget-body">{children}</div>
      )}
    </section>
  );
}

export function MovableDashboardWidget({
  id,
  disabled = false,
  ...props
}: DashboardWidgetProps & { id: string; disabled?: boolean }) {
  const drag = useDraggable({ id, disabled });

  return (
    <DashboardWidget
      {...props}
      isDragging={drag.isDragging}
      dragHandleRef={disabled ? undefined : drag.setNodeRef}
      dragHandleProps={disabled ? undefined : { ...drag.attributes, ...drag.listeners }}
    />
  );
}

type PlaceKind = "full" | "left" | "right";

function PlaceZone({
  id,
  kind,
  occupied = false,
}: {
  id: string;
  kind: PlaceKind;
  occupied?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const label =
    kind === "full" ? "Full width" : kind === "left" ? "Left" : "Right";

  return (
    <div
      ref={setNodeRef}
      className={`place-zone place-zone-${kind}${occupied ? " occupied" : " vacant"}${isOver ? " active" : ""}`}
      aria-label={label}
    >
      {isOver ? <span className="place-zone-label">{label}</span> : null}
    </div>
  );
}

export function DashboardLayoutRow({
  fullSlotId,
  leftSlotId,
  rightSlotId,
  leftOccupied,
  rightOccupied,
  splitExisting,
  children,
}: {
  fullSlotId: string;
  leftSlotId: string;
  rightSlotId: string;
  leftOccupied: boolean;
  rightOccupied: boolean;
  splitExisting?: 0 | 1 | null;
  children?: ReactNode;
}) {
  const splitClass =
    splitExisting === 0
      ? " split-existing-left"
      : splitExisting === 1
        ? " split-existing-right"
        : "";

  return (
    <div className={`dashboard-row${splitClass}`}>
      <PlaceZone id={fullSlotId} kind="full" />
      <div className="dashboard-row-body">
        <PlaceZone id={leftSlotId} kind="left" occupied={leftOccupied} />
        <PlaceZone id={rightSlotId} kind="right" occupied={rightOccupied} />
        {children}
      </div>
    </div>
  );
}

export function placementLabel(target: { span: 1 | 2; col: 0 | 1 } | null): string {
  if (!target) return "Choose a slot";
  if (target.span === 2) return "Full width";
  return target.col === 1 ? "Right · half" : "Left · half";
}
