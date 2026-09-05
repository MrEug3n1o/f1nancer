"""add dashboard widget layout

Revision ID: i6j7k8l9m0n1
Revises: h5i6j7k8l9m0
Create Date: 2026-09-05 00:35:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.models import DEFAULT_DASHBOARD_WIDGET_LAYOUT

revision: str = "i6j7k8l9m0n1"
down_revision: Union[str, None] = "h5i6j7k8l9m0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        batch.add_column(
            sa.Column(
                "dashboard_widget_layout",
                sa.Text(),
                nullable=False,
                server_default="[]",
            )
        )
    op.get_bind().execute(
        sa.text(
            "UPDATE settings SET dashboard_widget_layout = :val "
            "WHERE dashboard_widget_layout = '[]' OR dashboard_widget_layout IS NULL"
        ),
        {"val": DEFAULT_DASHBOARD_WIDGET_LAYOUT},
    )


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch:
        batch.drop_column("dashboard_widget_layout")
