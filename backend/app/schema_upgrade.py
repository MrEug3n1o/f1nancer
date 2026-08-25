"""Lightweight SQLite schema upgrades for local installs (create_all does not alter)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.iso_currencies import currency_name
from app.models import DEFAULT_DASHBOARD_WIDGETS, DEFAULT_STATS_CHARTS


def ensure_schema(engine: Engine) -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if "settings" not in tables:
        return

    with engine.begin() as conn:
        if "currencies" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE currencies (
                        code VARCHAR(3) NOT NULL PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        created_at DATETIME NOT NULL
                    )
                    """
                )
            )

        settings_cols = {c["name"] for c in inspect(engine).get_columns("settings")}
        default_code = "USD"
        if "default_currency_code" in settings_cols:
            row = conn.execute(
                text("SELECT default_currency_code FROM settings LIMIT 1")
            ).fetchone()
            if row and row[0]:
                default_code = str(row[0]).upper()
        elif "currency_code" in settings_cols:
            row = conn.execute(
                text("SELECT currency_code FROM settings LIMIT 1")
            ).fetchone()
            if row and row[0]:
                default_code = str(row[0]).upper()

        cur_count = conn.execute(text("SELECT COUNT(*) FROM currencies")).scalar() or 0
        if cur_count == 0:
            conn.execute(
                text(
                    "INSERT INTO currencies (code, name, created_at) VALUES (:code, :name, :created)"
                ),
                {
                    "code": default_code,
                    "name": currency_name(default_code) or default_code,
                    "created": datetime.utcnow().isoformat(sep=" "),
                },
            )

        money_tables = [
            "transactions",
            "recurring_rules",
            "budgets",
            "goals",
            "goal_contributions",
        ]
        for table in money_tables:
            if table not in tables and table not in set(inspect(engine).get_table_names()):
                continue
            cols = {c["name"] for c in inspect(engine).get_columns(table)}
            if "currency_code" not in cols:
                conn.execute(
                    text(
                        f"ALTER TABLE {table} ADD COLUMN currency_code VARCHAR(3) DEFAULT '{default_code}'"
                    )
                )
                conn.execute(
                    text(
                        f"UPDATE {table} SET currency_code = :code WHERE currency_code IS NULL"
                    ),
                    {"code": default_code},
                )

        settings_cols = {c["name"] for c in inspect(engine).get_columns("settings")}
        if "currency_code" in settings_cols and "default_currency_code" not in settings_cols:
            conn.execute(
                text(
                    "ALTER TABLE settings ADD COLUMN default_currency_code VARCHAR(3)"
                )
            )
            conn.execute(
                text(
                    "UPDATE settings SET default_currency_code = currency_code "
                    "WHERE default_currency_code IS NULL"
                )
            )

        settings_cols = {c["name"] for c in inspect(engine).get_columns("settings")}
        extras = [
            ("theme", "VARCHAR(20)", "system"),
            ("locale", "VARCHAR(20)", ""),
            ("first_day_of_week", "VARCHAR(10)", "monday"),
            ("dashboard_widgets", "TEXT", DEFAULT_DASHBOARD_WIDGETS.replace("'", "''")),
            ("stats_charts", "TEXT", DEFAULT_STATS_CHARTS.replace("'", "''")),
        ]
        for col, typ, default in extras:
            if col not in settings_cols:
                # SQLite default for empty string
                default_sql = f"'{default}'"
                conn.execute(
                    text(
                        f"ALTER TABLE settings ADD COLUMN {col} {typ} DEFAULT {default_sql}"
                    )
                )
                conn.execute(
                    text(
                        f"UPDATE settings SET {col} = :val WHERE {col} IS NULL"
                    ),
                    {"val": default},
                )

        # Ensure default currency row exists after any rename
        row = conn.execute(
            text("SELECT default_currency_code FROM settings LIMIT 1")
        ).fetchone()
        if row and row[0]:
            code = str(row[0]).upper()
            exists = conn.execute(
                text("SELECT 1 FROM currencies WHERE code = :code"), {"code": code}
            ).fetchone()
            if not exists:
                conn.execute(
                    text(
                        "INSERT INTO currencies (code, name, created_at) VALUES (:code, :name, :created)"
                    ),
                    {
                        "code": code,
                        "name": currency_name(code) or code,
                        "created": datetime.utcnow().isoformat(sep=" "),
                    },
                )

        # Migrate budgets unique key to include currency_code
        if "budgets" in set(inspect(engine).get_table_names()):
            uniq = inspect(engine).get_unique_constraints("budgets")
            names = {u.get("name") for u in uniq}
            col_sets = {tuple(u.get("column_names") or []) for u in uniq}
            needs_rebuild = (
                "uq_budget_category_month" in names
                or ("category_id", "month") in col_sets
            ) and ("category_id", "month", "currency_code") not in col_sets
            if needs_rebuild:
                conn.execute(
                    text(
                        """
                        CREATE TABLE budgets_new (
                            id INTEGER NOT NULL PRIMARY KEY,
                            category_id INTEGER NOT NULL,
                            limit_cents INTEGER NOT NULL,
                            month VARCHAR(7) NOT NULL,
                            currency_code VARCHAR(3) NOT NULL,
                            FOREIGN KEY(category_id) REFERENCES categories (id),
                            FOREIGN KEY(currency_code) REFERENCES currencies (code),
                            UNIQUE (category_id, month, currency_code)
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        INSERT INTO budgets_new (id, category_id, limit_cents, month, currency_code)
                        SELECT id, category_id, limit_cents, month, currency_code FROM budgets
                        """
                    )
                )
                conn.execute(text("DROP TABLE budgets"))
                conn.execute(text("ALTER TABLE budgets_new RENAME TO budgets"))
