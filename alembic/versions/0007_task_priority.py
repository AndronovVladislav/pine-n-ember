"""add priority to tasks

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: Union[str, Sequence[str], None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tasks', sa.Column('priority', sa.String(), nullable=False, server_default='low'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tasks', 'priority')
