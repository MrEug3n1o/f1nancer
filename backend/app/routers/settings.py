import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.currency_utils import require_enabled_currency
from app.database import get_db
from app.models import (
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_STATS_CHARTS,
    Settings,
)
from app.schemas import SettingsOut, SettingsUpdate
from app.seed import parse_json_list

router = APIRouter(prefix="/settings", tags=["settings"])

VALID_DASHBOARD = {
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

    db.commit()
    db.refresh(settings)
    return _to_out(settings)
