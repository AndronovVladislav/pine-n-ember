"""topics blocks concepts

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-18 23:47:59.805838

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'blocks',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.rename_table('entities', 'topics')
    op.rename_table('entity_items', 'concepts')

    op.alter_column('concepts', 'entity_id', new_column_name='topic_id')
    op.drop_column('topics', 'kind')
    op.drop_column('concepts', 'kind')

    op.add_column('topics', sa.Column('block_id', sa.Text(), nullable=True))
    op.create_foreign_key('topics_block_id_fkey', 'topics', 'blocks', ['block_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('topics_block_id_fkey', 'topics', type_='foreignkey')
    op.drop_column('topics', 'block_id')

    op.add_column('concepts', sa.Column('kind', sa.Text(), server_default='command', nullable=False))
    op.add_column('topics', sa.Column('kind', sa.Text(), server_default='skill', nullable=False))
    op.alter_column('concepts', 'topic_id', new_column_name='entity_id')

    op.rename_table('concepts', 'entity_items')
    op.rename_table('topics', 'entities')

    op.drop_table('blocks')
