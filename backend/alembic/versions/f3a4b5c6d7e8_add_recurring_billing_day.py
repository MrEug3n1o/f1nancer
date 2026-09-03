"""add recurring billing_day

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-09-02 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("recurring_rules") as batch_op:
        batch_op.add_column(
            sa.Column("billing_day", sa.Integer(), nullable=False, server_default="1")
        )
    op.execute(
        """
        UPDATE recurring_rules
        SET billing_day = CAST(strftime('%d', next_run_date) AS INTEGER)
        WHERE cadence = 'monthly'
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("recurring_rules") as batch_op:
        batch_op.drop_column("billing_day")
