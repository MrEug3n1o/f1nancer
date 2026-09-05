"""Lightweight SQLite schema upgrades for local installs (create_all does not alter)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine

from app.iso_currencies import currency_name
from app.models import (
    DEFAULT_DASHBOARD_WIDGETS,
    DEFAULT_DASHBOARD_WIDGET_LAYOUT,
    DEFAULT_DASHBOARD_WIDGET_VIEWS,
    DEFAULT_STATS_CHARTS,
)

GOALS_CATEGORY_NAME = "Goals"
GOALS_CATEGORY_COLOR = "#5B8C5A"


def migrate_goal_contributions_to_transactions(conn: Connection) -> None:
    """Turn the parallel contribution ledger into tagged expense transactions."""
    tables = set(inspect(conn).get_table_names())
    if "goal_contributions" not in tables or "transactions" not in tables:
        return
    if "goals" not in tables or "categories" not in tables:
        return

    txn_cols = {c["name"] for c in inspect(conn).get_columns("transactions")}
    if "goal_id" not in txn_cols:
        conn.execute(text("ALTER TABLE transactions ADD COLUMN goal_id INTEGER"))

    contrib_cols = {c["name"] for c in inspect(conn).get_columns("goal_contributions")}
    if "currency_code" not in contrib_cols:
        default_code = "USD"
        settings_tables = set(inspect(conn).get_table_names())
        if "settings" in settings_tables:
            settings_cols = {c["name"] for c in inspect(conn).get_columns("settings")}
            if "default_currency_code" in settings_cols:
                row = conn.execute(
                    text("SELECT default_currency_code FROM settings LIMIT 1")
                ).fetchone()
                if row and row[0]:
                    default_code = str(row[0]).upper()
        conn.execute(
            text(
                f"ALTER TABLE goal_contributions ADD COLUMN currency_code VARCHAR(3) DEFAULT '{default_code}'"
            )
        )
        conn.execute(
            text(
                "UPDATE goal_contributions SET currency_code = :code WHERE currency_code IS NULL"
            ),
            {"code": default_code},
        )

    existing = conn.execute(
        text(
            "SELECT id FROM categories WHERE name = :name AND type = :type LIMIT 1"
        ),
        {"name": GOALS_CATEGORY_NAME, "type": "expense"},
    ).fetchone()
    if not existing:
        conn.execute(
            text(
                "INSERT INTO categories (name, type, color) VALUES (:name, :type, :color)"
            ),
            {
                "name": GOALS_CATEGORY_NAME,
                "type": "expense",
                "color": GOALS_CATEGORY_COLOR,
            },
        )

    conn.execute(
        text(
            "DELETE FROM transactions "
            "WHERE goal_id IS NOT NULL AND note LIKE 'Goal completed:%'"
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO transactions (
                amount, currency_code, date, type, category_id, note, goal_id, created_at
            )
            SELECT
                gc.amount,
                gc.currency_code,
                gc.date,
                'expense',
                (
                    SELECT id FROM categories
                    WHERE name = :name AND type = 'expense'
                    LIMIT 1
                ),
                'Saved toward ' || g.name,
                gc.goal_id,
                gc.created_at
            FROM goal_contributions gc
            JOIN goals g ON g.id = gc.goal_id
            """
        ),
        {"name": GOALS_CATEGORY_NAME},
    )
    conn.execute(
        text(
            """
            INSERT INTO transactions (
                amount, currency_code, date, type, category_id, note, goal_id, created_at
            )
            SELECT
                g.current_amount - COALESCE(s.total, 0),
                g.currency_code,
                COALESCE(date(g.created_at), date('now')),
                'expense',
                (
                    SELECT id FROM categories
                    WHERE name = :name AND type = 'expense'
                    LIMIT 1
                ),
                'Saved toward ' || g.name,
                g.id,
                datetime('now')
            FROM goals g
            LEFT JOIN (
                SELECT goal_id, SUM(amount) AS total
                FROM transactions
                WHERE type = 'expense' AND goal_id IS NOT NULL
                GROUP BY goal_id
            ) s ON s.goal_id = g.id
            WHERE g.current_amount > COALESCE(s.total, 0)
            """
        ),
        {"name": GOALS_CATEGORY_NAME},
    )
    conn.execute(
        text(
            """
            UPDATE goals
            SET current_amount = COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                WHERE t.goal_id = goals.id AND t.type = 'expense'
            ), 0)
            """
        )
    )
    conn.execute(text("DROP TABLE goal_contributions"))


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
            ("dashboard_widgets", "TEXT", DEFAULT_DASHBOARD_WIDGETS.replace("'", "''")),
            ("stats_charts", "TEXT", DEFAULT_STATS_CHARTS.replace("'", "''")),
            (
                "dashboard_widget_views",
                "TEXT",
                DEFAULT_DASHBOARD_WIDGET_VIEWS.replace("'", "''"),
            ),
            (
                "dashboard_widget_layout",
                "TEXT",
                DEFAULT_DASHBOARD_WIDGET_LAYOUT.replace("'", "''"),
            ),
        ]
        for col, typ, default in extras:
            if col not in settings_cols:
                # SQLite default for empty string. Use driver SQL so JSON
                # colons (e.g. "span":2) are not treated as bind params.
                default_sql = f"'{default}'"
                conn.exec_driver_sql(
                    f"ALTER TABLE settings ADD COLUMN {col} {typ} DEFAULT {default_sql}"
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

        # Collapse per-month budgets into standing monthly limits
        if "budgets" in set(inspect(engine).get_table_names()):
            budget_cols = {c["name"] for c in inspect(engine).get_columns("budgets")}
            if "month" in budget_cols:
                conn.execute(
                    text(
                        """
                        CREATE TABLE budgets_standing (
                            id INTEGER NOT NULL PRIMARY KEY,
                            category_id INTEGER NOT NULL,
                            limit_cents INTEGER NOT NULL,
                            currency_code VARCHAR(3) NOT NULL,
                            FOREIGN KEY(category_id) REFERENCES categories (id),
                            FOREIGN KEY(currency_code) REFERENCES currencies (code),
                            UNIQUE (category_id, currency_code)
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        INSERT INTO budgets_standing (id, category_id, limit_cents, currency_code)
                        SELECT b.id, b.category_id, b.limit_cents, b.currency_code
                        FROM budgets b
                        WHERE b.id = (
                            SELECT b2.id
                            FROM budgets b2
                            WHERE b2.category_id = b.category_id
                              AND b2.currency_code = b.currency_code
                            ORDER BY b2.month DESC, b2.id DESC
                            LIMIT 1
                        )
                        """
                    )
                )
                conn.execute(text("DROP TABLE budgets"))
                conn.execute(text("ALTER TABLE budgets_standing RENAME TO budgets"))

        tables_now = set(inspect(engine).get_table_names())
        if "deposits" not in tables_now and "currencies" in tables_now:
            conn.execute(
                text(
                    """
                    CREATE TABLE deposits (
                        id INTEGER NOT NULL PRIMARY KEY,
                        name VARCHAR(200) NOT NULL,
                        type VARCHAR(20) NOT NULL,
                        principal_cents INTEGER NOT NULL,
                        currency_code VARCHAR(3) NOT NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NOT NULL,
                        annual_rate_bps INTEGER,
                        counterparty VARCHAR(200),
                        note TEXT,
                        status VARCHAR(20) NOT NULL,
                        created_at DATETIME NOT NULL,
                        FOREIGN KEY(currency_code) REFERENCES currencies (code)
                    )
                    """
                )
            )

        # Link goal-completion expenses back to goals
        tables_now = set(inspect(engine).get_table_names())
        if "transactions" in tables_now and "goals" in tables_now:
            txn_cols = {c["name"] for c in inspect(engine).get_columns("transactions")}
            if "goal_id" not in txn_cols:
                conn.execute(
                    text("ALTER TABLE transactions ADD COLUMN goal_id INTEGER")
                )

        tables_now = set(inspect(engine).get_table_names())
        if "recurring_rules" in tables_now:
            recurring_cols = {
                c["name"] for c in inspect(engine).get_columns("recurring_rules")
            }
            if "billing_day" not in recurring_cols:
                conn.execute(
                    text(
                        "ALTER TABLE recurring_rules ADD COLUMN billing_day INTEGER DEFAULT 1"
                    )
                )
                conn.execute(
                    text(
                        """
                        UPDATE recurring_rules
                        SET billing_day = CAST(strftime('%d', next_run_date) AS INTEGER)
                        WHERE billing_day IS NULL
                        """
                    )
                )
                conn.execute(
                    text(
                        "UPDATE recurring_rules SET billing_day = 1 WHERE billing_day IS NULL"
                    )
                )

        migrate_goal_contributions_to_transactions(conn)

        tables_now = set(inspect(engine).get_table_names())
        if "credit_debts" not in tables_now and "currencies" in tables_now:
            conn.execute(
                text(
                    """
                    CREATE TABLE credit_debts (
                        id INTEGER NOT NULL PRIMARY KEY,
                        name VARCHAR(200) NOT NULL,
                        direction VARCHAR(20) NOT NULL,
                        source VARCHAR(20) NOT NULL,
                        principal_cents INTEGER NOT NULL,
                        currency_code VARCHAR(3) NOT NULL,
                        start_date DATE NOT NULL,
                        due_date DATE,
                        annual_rate_bps INTEGER,
                        counterparty VARCHAR(200),
                        note TEXT,
                        status VARCHAR(20) NOT NULL,
                        created_at DATETIME NOT NULL,
                        FOREIGN KEY(currency_code) REFERENCES currencies (code)
                    )
                    """
                )
            )

        tables_now = set(inspect(engine).get_table_names())
        if "transactions" in tables_now and "credit_debts" in tables_now:
            txn_cols = {c["name"] for c in inspect(engine).get_columns("transactions")}
            if "credit_debt_id" not in txn_cols:
                conn.execute(
                    text("ALTER TABLE transactions ADD COLUMN credit_debt_id INTEGER")
                )
