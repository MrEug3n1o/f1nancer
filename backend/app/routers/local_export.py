import json
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    DEFAULT_DASHBOARD_WIDGET_LAYOUT,
    DEFAULT_DASHBOARD_WIDGET_VIEWS,
    DEFAULT_DASHBOARD_WIDGETS,
    Budget,
    Category,
    CreditDebt,
    Currency,
    Deposit,
    Goal,
    RecurringRule,
    Settings,
    Transaction,
)

router = APIRouter(prefix="/local-export", tags=["local-export"])


def _jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _rows(db: Session, model) -> list[dict]:
    result = []
    for item in db.query(model).all():
        result.append(
            {col.name: _jsonable(getattr(item, col.name)) for col in item.__table__.columns}
        )
    return result


def _parse_json(raw: str | None, fallback):
    try:
        return json.loads(raw) if raw else fallback
    except json.JSONDecodeError:
        return fallback


@router.get("")
def local_export(request: Request):
    host = (request.client.host if request.client else "") or ""
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Export is only available on this machine.")
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        settings_out = None
        if settings is not None:
            settings_out = {
                "default_currency_code": settings.default_currency_code,
                "theme": settings.theme,
                "locale": settings.locale or "en-US",
                "dashboard_widgets": _parse_json(
                    settings.dashboard_widgets, json.loads(DEFAULT_DASHBOARD_WIDGETS)
                ),
                "dashboard_widget_views": _parse_json(
                    settings.dashboard_widget_views,
                    json.loads(DEFAULT_DASHBOARD_WIDGET_VIEWS),
                ),
                "dashboard_widget_layout": _parse_json(
                    settings.dashboard_widget_layout,
                    json.loads(DEFAULT_DASHBOARD_WIDGET_LAYOUT),
                ),
            }
        return {
            "currencies": _rows(db, Currency),
            "categories": _rows(db, Category),
            "transactions": _rows(db, Transaction),
            "budgets": _rows(db, Budget),
            "goals": _rows(db, Goal),
            "deposits": _rows(db, Deposit),
            "credit_debts": _rows(db, CreditDebt),
            "recurring_rules": _rows(db, RecurringRule),
            "settings": settings_out,
        }
    finally:
        db.close()
