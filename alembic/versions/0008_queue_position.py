"""add position to queues

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: Union[str, Sequence[str], None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('queues', sa.Column('position', sa.Integer(), nullable=False, server_default='0'))
    # ponytail: исходного порядка вставки в данных нет - детерминированный порядок по key
    op.execute("""
        UPDATE queues
        SET position = sub.rn
        FROM (SELECT key, ROW_NUMBER() OVER (ORDER BY key) - 1 AS rn FROM queues) sub
        WHERE queues.key = sub.key
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('queues', 'position')
