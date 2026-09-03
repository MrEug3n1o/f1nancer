import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import (
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_DASHBOARD_WIDGET_VIEWS,
    DEFAULT_STATS_CHARTS,
    Settings,
)
from app.schemas import SettingsOut, SettingsUpdate
from app.seed import parse_json_list

router = APIRouter(prefix="/settings", tags=["settings"])

VALID_DASHBOARD = {
    "pocket",
    "overview",
    "spend_by_category",
    "budgets",
    "goals",
    "category_table",
    "deposits",
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
    "spend_by_category": "donut",
    "budgets": "bars",
    "category_table": "table",
    "goals": "rings",
    "deposits": "rings",
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
        first_day_of_week=settings.first_day_of_week or "monday",
        dashboard_widgets=merged_widgets,
        stats_charts=charts,
        dashboard_widget_views=_parse_widget_views(settings.dashboard_widget_views),
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
    if "first_day_of_week" in data and data["first_day_of_week"] is not None:
        settings.first_day_of_week = data["first_day_of_week"]
    if "dashboard_widgets" in data and data["dashboard_widgets"] is not None:
        widgets = [w for w in data["dashboard_widgets"] if w in VALID_DASHBOARD]
        settings.dashboard_widgets = json.dumps(widgets)
    if "stats_charts" in data and data["stats_charts"] is not None:
        charts = [c for c in data["stats_charts"] if c in VALID_STATS]
        settings.stats_charts = json.dumps(charts)
    if "dashboard_widget_views" in data and data["dashboard_widget_views"] is not None:
        merged = _sanitize_widget_views(data["dashboard_widget_views"])
        settings.dashboard_widget_views = json.dumps(merged)

    db.commit()
    db.refresh(settings)
    return _to_out(settings)
