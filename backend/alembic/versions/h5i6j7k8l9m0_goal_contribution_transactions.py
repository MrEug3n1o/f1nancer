"""goal contributions as transactions

Revision ID: h5i6j7k8l9m0
Revises: g4h5i6j7k8l9
Create Date: 2026-09-04 18:30:00.000000
"""

from typing import Sequence, Union

from alembic import op

from app.schema_upgrade import migrate_goal_contributions_to_transactions

revision: str = "h5i6j7k8l9m0"
down_revision: Union[str, None] = "g4h5i6j7k8l9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    migrate_goal_contributions_to_transactions(op.get_bind())


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql(
        """
        CREATE TABLE goal_contributions (
            id INTEGER NOT NULL PRIMARY KEY,
            goal_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            currency_code VARCHAR(3) NOT NULL,
            date DATE NOT NULL,
            created_at DATETIME NOT NULL,
            FOREIGN KEY(goal_id) REFERENCES goals (id),
            FOREIGN KEY(currency_code) REFERENCES currencies (code)
        )
        """
    )
