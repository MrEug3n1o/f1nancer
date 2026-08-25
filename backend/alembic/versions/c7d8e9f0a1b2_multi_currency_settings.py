"""multi-currency and settings customization

Revision ID: c7d8e9f0a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-08-25 22:50:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_DASHBOARD = '["overview","spend_by_category","budgets","goals"]'
DEFAULT_STATS = '["trends","spend_by_category","by_currency"]'


def upgrade() -> None:
    op.create_table(
        "currencies",
        sa.Column("code", sa.String(length=3), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )

    conn = op.get_bind()
    existing = conn.execute(sa.text("SELECT currency_code FROM settings LIMIT 1")).fetchone()
    default_code = (existing[0] if existing and existing[0] else "USD").upper()
    name_map = {
        "USD": "US Dollar",
        "EUR": "Euro",
        "UAH": "Ukrainian Hryvnia",
        "GBP": "British Pound",
    }
    conn.execute(
        sa.text(
            "INSERT INTO currencies (code, name, created_at) VALUES (:code, :name, CURRENT_TIMESTAMP)"
        ),
        {"code": default_code, "name": name_map.get(default_code, default_code)},
    )

    with op.batch_alter_table("transactions") as batch:
        batch.add_column(
            sa.Column("currency_code", sa.String(length=3), nullable=True)
        )
    with op.batch_alter_table("recurring_rules") as batch:
        batch.add_column(
            sa.Column("currency_code", sa.String(length=3), nullable=True)
        )
    with op.batch_alter_table("budgets") as batch:
        batch.add_column(
            sa.Column("currency_code", sa.String(length=3), nullable=True)
        )
    with op.batch_alter_table("goals") as batch:
        batch.add_column(
            sa.Column("currency_code", sa.String(length=3), nullable=True)
        )
    with op.batch_alter_table("goal_contributions") as batch:
        batch.add_column(
            sa.Column("currency_code", sa.String(length=3), nullable=True)
        )

    for table in (
        "transactions",
        "recurring_rules",
        "budgets",
        "goals",
        "goal_contributions",
    ):
        conn.execute(
            sa.text(f"UPDATE {table} SET currency_code = :code WHERE currency_code IS NULL"),
            {"code": default_code},
        )

    with op.batch_alter_table("transactions") as batch:
        batch.alter_column("currency_code", existing_type=sa.String(length=3), nullable=False)
        batch.create_foreign_key(
            "fk_transactions_currency", "currencies", ["currency_code"], ["code"]
        )
    with op.batch_alter_table("recurring_rules") as batch:
        batch.alter_column("currency_code", existing_type=sa.String(length=3), nullable=False)
        batch.create_foreign_key(
            "fk_recurring_currency", "currencies", ["currency_code"], ["code"]
        )
    with op.batch_alter_table("budgets") as batch:
        batch.alter_column("currency_code", existing_type=sa.String(length=3), nullable=False)
        batch.create_foreign_key(
            "fk_budgets_currency", "currencies", ["currency_code"], ["code"]
        )
        batch.drop_constraint("uq_budget_category_month", type_="unique")
        batch.create_unique_constraint(
            "uq_budget_category_month_currency",
            ["category_id", "month", "currency_code"],
        )
    with op.batch_alter_table("goals") as batch:
        batch.alter_column("currency_code", existing_type=sa.String(length=3), nullable=False)
        batch.create_foreign_key(
            "fk_goals_currency", "currencies", ["currency_code"], ["code"]
        )
    with op.batch_alter_table("goal_contributions") as batch:
        batch.alter_column("currency_code", existing_type=sa.String(length=3), nullable=False)
        batch.create_foreign_key(
            "fk_goal_contributions_currency", "currencies", ["currency_code"], ["code"]
        )

    with op.batch_alter_table("settings") as batch:
        batch.alter_column(
            "currency_code",
            new_column_name="default_currency_code",
            existing_type=sa.String(length=3),
            nullable=False,
        )
        batch.add_column(
            sa.Column("theme", sa.String(length=20), nullable=False, server_default="system")
        )
        batch.add_column(
            sa.Column("locale", sa.String(length=20), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column(
                "first_day_of_week",
                sa.String(length=10),
                nullable=False,
                server_default="monday",
            )
        )
        batch.add_column(
            sa.Column(
                "dashboard_widgets",
                sa.Text(),
                nullable=False,
                server_default=DEFAULT_DASHBOARD,
            )
        )
        batch.add_column(
            sa.Column(
                "stats_charts",
                sa.Text(),
                nullable=False,
                server_default=DEFAULT_STATS,
            )
        )
        batch.create_foreign_key(
            "fk_settings_default_currency",
            "currencies",
            ["default_currency_code"],
            ["code"],
        )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        batch.drop_constraint("fk_settings_default_currency", type_="foreignkey")
        batch.drop_column("stats_charts")
        batch.drop_column("dashboard_widgets")
        batch.drop_column("first_day_of_week")
        batch.drop_column("locale")
        batch.drop_column("theme")
        batch.alter_column(
            "default_currency_code",
            new_column_name="currency_code",
            existing_type=sa.String(length=3),
            nullable=False,
        )

    with op.batch_alter_table("goal_contributions") as batch:
        batch.drop_constraint("fk_goal_contributions_currency", type_="foreignkey")
        batch.drop_column("currency_code")
    with op.batch_alter_table("goals") as batch:
        batch.drop_constraint("fk_goals_currency", type_="foreignkey")
        batch.drop_column("currency_code")
    with op.batch_alter_table("budgets") as batch:
        batch.drop_constraint("uq_budget_category_month_currency", type_="unique")
        batch.create_unique_constraint(
            "uq_budget_category_month", ["category_id", "month"]
        )
        batch.drop_constraint("fk_budgets_currency", type_="foreignkey")
        batch.drop_column("currency_code")
    with op.batch_alter_table("recurring_rules") as batch:
        batch.drop_constraint("fk_recurring_currency", type_="foreignkey")
        batch.drop_column("currency_code")
    with op.batch_alter_table("transactions") as batch:
        batch.drop_constraint("fk_transactions_currency", type_="foreignkey")
        batch.drop_column("currency_code")

    op.drop_table("currencies")
