"""add credit debts

Revision ID: j7k8l9m0n1o2
Revises: i6j7k8l9m0n1
Create Date: 2026-09-05 02:20:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j7k8l9m0n1o2"
down_revision: Union[str, None] = "i6j7k8l9m0n1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "credit_debts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("principal_cents", sa.Integer(), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("annual_rate_bps", sa.Integer(), nullable=True),
        sa.Column("counterparty", sa.String(length=200), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(sa.Column("credit_debt_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_transactions_credit_debt_id_credit_debts",
            "credit_debts",
            ["credit_debt_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint(
            "fk_transactions_credit_debt_id_credit_debts", type_="foreignkey"
        )
        batch_op.drop_column("credit_debt_id")
    op.drop_table("credit_debts")
