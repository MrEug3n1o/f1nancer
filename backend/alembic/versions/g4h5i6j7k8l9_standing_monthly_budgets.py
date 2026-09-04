"""standing monthly budgets

Revision ID: g4h5i6j7k8l9
Revises: f3a4b5c6d7e8
Create Date: 2026-09-04 17:50:00.000000
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect, text

revision: str = "g4h5i6j7k8l9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    cols = {c["name"] for c in inspect(conn).get_columns("budgets")}
    if "month" not in cols:
        return
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


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            CREATE TABLE budgets_monthly (
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
            INSERT INTO budgets_monthly (id, category_id, limit_cents, month, currency_code)
            SELECT id, category_id, limit_cents, strftime('%Y-%m', 'now'), currency_code
            FROM budgets
            """
        )
    )
    conn.execute(text("DROP TABLE budgets"))
    conn.execute(text("ALTER TABLE budgets_monthly RENAME TO budgets"))
