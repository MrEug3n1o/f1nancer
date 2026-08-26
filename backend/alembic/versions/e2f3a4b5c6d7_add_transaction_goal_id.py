"""add transaction goal_id

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-26 14:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(sa.Column("goal_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_transactions_goal_id_goals",
            "goals",
            ["goal_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint("fk_transactions_goal_id_goals", type_="foreignkey")
        batch_op.drop_column("goal_id")
