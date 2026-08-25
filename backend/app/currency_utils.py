"""Helpers for validating enabled currencies."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.iso_currencies import currency_name, is_valid_iso_code, normalize_code
from app.models import Currency


def require_enabled_currency(db: Session, code: str) -> str:
    normalized = normalize_code(code)
    if not is_valid_iso_code(normalized):
        raise HTTPException(status_code=400, detail=f"Unknown currency code: {normalized}")
    currency = db.get(Currency, normalized)
    if not currency:
        raise HTTPException(
            status_code=400,
            detail=f"Currency {normalized} is not enabled. Add it in Settings first.",
        )
    return normalized


def ensure_currency_row(db: Session, code: str) -> Currency:
    """Insert enabled currency from ISO catalog if missing; used by seed/migration helpers."""
    normalized = normalize_code(code)
    existing = db.get(Currency, normalized)
    if existing:
        return existing
    name = currency_name(normalized) or normalized
    row = Currency(code=normalized, name=name)
    db.add(row)
    db.flush()
    return row
