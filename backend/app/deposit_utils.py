"""Simple interest and deposit progress helpers."""

from __future__ import annotations

from datetime import date


def days_held(start: date, end: date, as_of: date | None = None) -> int:
    """Days from start through min(as_of, end), never negative."""
    today = as_of or date.today()
    capped = min(today, end)
    return max(0, (capped - start).days)


def days_remaining(end: date, as_of: date | None = None) -> int:
    today = as_of or date.today()
    return (end - today).days


def simple_interest_cents(
    principal_cents: int,
    annual_rate_bps: int,
    start: date,
    end: date,
    as_of: date | None = None,
) -> int:
    """Accrued simple interest (actual/365) for days held up to as_of or maturity."""
    if principal_cents <= 0 or annual_rate_bps <= 0:
        return 0
    held = days_held(start, end, as_of)
    if held <= 0:
        return 0
    # rate = bps / 10000; interest = principal * rate * days / 365
    return round(principal_cents * annual_rate_bps * held / (10000 * 365))


def maturity_interest_cents(
    principal_cents: int,
    annual_rate_bps: int,
    start: date,
    end: date,
) -> int:
    """Full-term simple interest through maturity."""
    return simple_interest_cents(
        principal_cents, annual_rate_bps, start, end, as_of=end
    )


def term_progress_pct(start: date, end: date, as_of: date | None = None) -> float:
    """0–100 progress through the deposit term."""
    today = as_of or date.today()
    total = (end - start).days
    if total <= 0:
        return 100.0 if today >= end else 0.0
    held = days_held(start, end, today)
    return min(100.0, round(held / total * 100, 1))
