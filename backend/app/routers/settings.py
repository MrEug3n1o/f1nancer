import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import (
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_DASHBOARD_WIDGET_LAYOUT,
    DEFAULT_DASHBOARD_WIDGET_VIEWS,
    DEFAULT_STATS_CHARTS,
    Settings,
)
from app.schemas import DashboardWidgetLayoutItem, SettingsOut, SettingsUpdate
from app.seed import parse_json_list

router = APIRouter(prefix="/settings", tags=["settings"])

VALID_DASHBOARD = {
    "pocket",
    "overview",
    "money_location",
    "spend_by_category",
    "budgets",
    "goals",
    "category_table",
    "deposits",
    "credits_debts",
}
VALID_STATS = {
    "trends",
    "spend_by_category",
    "by_currency",
    "category_table",
    "budgets",
}

DEFAULT_WIDGET_VIEWS = {
    "pocket": "hero",
    "overview": "cards",
    "money_location": "cards",
    "spend_by_category": "donut",
    "budgets": "bars",
    "category_table": "table",
    "goals": "rings",
    "deposits": "rings",
    "credits_debts": "rings",
}

VALID_WIDGET_VIEWS = {
    "pocket": {"hero"},
    "overview": {
        "cards",
        "bar",
        "horizontal_bar",
        "stacked",
        "area",
        "line",
        "pie",
        "donut",
        "radial",
        "treemap",
    },
    "money_location": {
        "cards",
        "bar",
        "horizontal_bar",
        "stacked",
    },
    "spend_by_category": {
        "donut",
        "pie",
        "bar",
        "bar_vertical",
        "radial",
        "treemap",
        "area",
        "line",
    },
    "budgets": {
        "bars",
        "bar_chart",
        "bar_vertical",
        "stacked",
        "radial",
        "pie",
        "donut",
        "table",
    },
    "category_table": {
        "table",
        "bar",
        "bar_vertical",
        "pie",
        "donut",
        "radial",
        "treemap",
    },
    "goals": {
        "rings",
        "bars",
        "bar_vertical",
        "pie",
        "donut",
        "radial",
        "treemap",
    },
    "deposits": {
        "rings",
        "bars",
        "list",
        "bar_chart",
        "bar_vertical",
        "pie",
        "donut",
        "radial",
        "treemap",
    },
    "credits_debts": {
        "rings",
        "bars",
        "list",
        "bar_chart",
        "bar_vertical",
        "pie",
        "donut",
        "radial",
        "treemap",
    },
}


def _parse_widget_views(raw: str | None) -> dict[str, str]:
    defaults = dict(DEFAULT_WIDGET_VIEWS)
    if not raw:
        return defaults
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return defaults
    if not isinstance(parsed, dict):
        return defaults
    for widget_id, view in parsed.items():
        if widget_id not in VALID_WIDGET_VIEWS:
            continue
        if isinstance(view, str) and view in VALID_WIDGET_VIEWS[widget_id]:
            defaults[widget_id] = view
    return defaults


def _sanitize_widget_views(views: dict[str, str]) -> dict[str, str]:
    merged = dict(DEFAULT_WIDGET_VIEWS)
    for widget_id, view in views.items():
        if widget_id not in VALID_WIDGET_VIEWS:
            continue
        if view in VALID_WIDGET_VIEWS[widget_id]:
            merged[widget_id] = view
    return merged


DEFAULT_WIDGET_LAYOUT: list[dict[str, str | int]] = json.loads(
    DEFAULT_DASHBOARD_WIDGET_LAYOUT
)


def _sanitize_widget_layout(items: list | None) -> list[dict[str, str | int]]:
    seen: set[str] = set()
    result: list[dict[str, str | int]] = []
    pending_half: dict[str, str | int] | None = None
    for item in items or []:
        if not isinstance(item, dict):
            continue
        widget_id = item.get("id")
        if widget_id not in VALID_DASHBOARD or widget_id in seen:
            continue
        span = 1 if item.get("span") == 1 else 2
        has_col = item.get("col") in (0, 1)
        col = 1 if span == 1 and item.get("col") == 1 else 0
        next_item: dict[str, str | int] = {"id": widget_id, "span": span, "col": col}
        if span == 1 and not has_col:
            if pending_half is not None:
                pending_half["col"] = 0
                result.append(pending_half)
                next_item["col"] = 1
                result.append(next_item)
                pending_half = None
            else:
                pending_half = next_item
        else:
            if pending_half is not None:
                result.append(pending_half)
                pending_half = None
            result.append(next_item)
        seen.add(widget_id)
    if pending_half is not None:
        result.append(pending_half)
    for default in DEFAULT_WIDGET_LAYOUT:
        if default["id"] not in seen:
            result.append(dict(default))
    return result


def _parse_widget_layout(raw: str | None) -> list[dict[str, str | int]]:
    if not raw:
        return _sanitize_widget_layout(None)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return _sanitize_widget_layout(None)
    if not isinstance(parsed, list):
        return _sanitize_widget_layout(None)
    return _sanitize_widget_layout(parsed)


def _to_out(settings: Settings) -> SettingsOut:
    default_widgets = json.loads(DEFAULT_DASHBOARD_WIDGETS)
    default_charts = json.loads(DEFAULT_STATS_CHARTS)
    widgets = parse_json_list(settings.dashboard_widgets, default_widgets)
    charts = parse_json_list(settings.stats_charts, default_charts)
    # Promote deposits onto dashboards that still use the pre-deposits default set.
    legacy_without_deposits = {
        "overview",
        "spend_by_category",
        "budgets",
        "goals",
    }
    if "deposits" not in widgets and set(widgets) == legacy_without_deposits:
        widgets = [*widgets, "deposits"]
    if "credits_debts" not in widgets:
        without_new = set(widgets) - {"pocket", "credits_debts"}
        if without_new == {
            "overview",
            "spend_by_category",
            "budgets",
            "goals",
            "deposits",
        } or without_new == {
            "overview",
            "spend_by_category",
            "budgets",
            "goals",
        }:
            widgets = [*widgets, "credits_debts"]
    if "money_location" not in widgets:
        without_ml = set(widgets) - {"pocket", "money_location"}
        legacy_with_overview = {
            "overview",
            "spend_by_category",
            "budgets",
            "goals",
            "deposits",
            "credits_debts",
        }
        legacy_partial = {
            "overview",
            "spend_by_category",
            "budgets",
            "goals",
            "deposits",
        }
        if without_ml == legacy_with_overview or without_ml == legacy_partial:
            overview_idx = widgets.index("overview") if "overview" in widgets else -1
            if overview_idx >= 0:
                widgets = [
                    *widgets[: overview_idx + 1],
                    "money_location",
                    *widgets[overview_idx + 1 :],
                ]
            else:
                widgets = [*widgets, "money_location"]
    if "pocket" not in widgets:
        widgets = ["pocket", *widgets]
    merged_widgets = [
        w
        for w in dict.fromkeys(
            widgets + [c for c in charts if c in VALID_DASHBOARD]
        )
        if w in VALID_DASHBOARD
    ]
    return SettingsOut(
        id=settings.id,
        default_currency_code=settings.default_currency_code,
        theme=settings.theme or "system",
        locale=settings.locale or "",
        dashboard_widgets=merged_widgets,
        stats_charts=charts,
        dashboard_widget_views=_parse_widget_views(settings.dashboard_widget_views),
        dashboard_widget_layout=_parse_widget_layout(settings.dashboard_widget_layout),
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return _to_out(settings)


@router.patch("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")

    data = payload.model_dump(exclude_unset=True)

    if "default_currency_code" in data and data["default_currency_code"] is not None:
        settings.default_currency_code = require_enabled_currency(
            db, data["default_currency_code"]
        )
    if "theme" in data and data["theme"] is not None:
        settings.theme = data["theme"]
    if "locale" in data:
        settings.locale = data["locale"] or ""
    if "dashboard_widgets" in data and data["dashboard_widgets"] is not None:
        widgets = [w for w in data["dashboard_widgets"] if w in VALID_DASHBOARD]
        settings.dashboard_widgets = json.dumps(widgets)
    if "stats_charts" in data and data["stats_charts"] is not None:
        charts = [c for c in data["stats_charts"] if c in VALID_STATS]
        settings.stats_charts = json.dumps(charts)
    if "dashboard_widget_views" in data and data["dashboard_widget_views"] is not None:
        merged = _sanitize_widget_views(data["dashboard_widget_views"])
        settings.dashboard_widget_views = json.dumps(merged)
    if "dashboard_widget_layout" in data and data["dashboard_widget_layout"] is not None:
        raw_layout = data["dashboard_widget_layout"]
        layout_items = [
            item.model_dump() if isinstance(item, DashboardWidgetLayoutItem) else item
            for item in raw_layout
        ]
        settings.dashboard_widget_layout = json.dumps(
            _sanitize_widget_layout(layout_items)
        )

    db.commit()
    db.refresh(settings)
    return _to_out(settings)
