import { WIDGET_VIEW_OPTIONS, type DashboardWidgetId } from "../types";
import { WidgetViewIcon } from "./WidgetViewIcons";

export function WidgetViewPicker({
  widgetId,
  value,
  saving,
  onChange,
}: {
  widgetId: DashboardWidgetId;
  value: string;
  saving: boolean;
  onChange: (view: string) => void;
}) {
  const options = WIDGET_VIEW_OPTIONS[widgetId];

  return (
    <div className="widget-view-picker" role="radiogroup" aria-label="Display as">
      <p className="widget-view-heading">Display as</p>
      <div className="widget-view-options">
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              className={`widget-view-option${selected ? " selected" : ""}`}
              onClick={() => onChange(opt.id)}
            >
              <span className="widget-view-icon-wrap" aria-hidden>
                <WidgetViewIcon viewId={opt.id} className="widget-view-icon" />
              </span>
              <span className="widget-view-label">{opt.label}</span>
              {selected ? (
                <span className="widget-view-check" aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
