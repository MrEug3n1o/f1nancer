"""add money_location cash/card

Revision ID: k8l9m0n1o2p3
Revises: j7k8l9m0n1o2
Create Date: 2026-09-06 18:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k8l9m0n1o2p3"
down_revision: Union[str, None] = "j7k8l9m0n1o2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "money_location",
                sa.String(length=10),
                nullable=False,
                server_default="card",
            )
        )
    with op.batch_alter_table("recurring_rules") as batch_op:
        batch_op.add_column(
            sa.Column(
                "money_location",
                sa.String(length=10),
                nullable=False,
                server_default="card",
            )
        )
    with op.batch_alter_table("deposits") as batch_op:
        batch_op.add_column(
            sa.Column(
                "money_location",
                sa.String(length=10),
                nullable=False,
                server_default="card",
            )
        )

    op.execute("UPDATE transactions SET money_location = 'card' WHERE money_location IS NULL")
    op.execute(
        "UPDATE recurring_rules SET money_location = 'card' WHERE money_location IS NULL"
    )
    op.execute("UPDATE deposits SET money_location = 'card' WHERE money_location IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("deposits") as batch_op:
        batch_op.drop_column("money_location")
    with op.batch_alter_table("recurring_rules") as batch_op:
        batch_op.drop_column("money_location")
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("money_location")
