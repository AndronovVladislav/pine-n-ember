"""backfill queue for tasks without one

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-21 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, Sequence[str], None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ponytail: очередь теперь обязательна (specs/0015) - у задач, созданных до этого правила,
    # backfill в служебную очередь-заглушку, а не удаление/блокировка миграции
    op.execute("""
        INSERT INTO queues (key, label, bg, text_color)
        SELECT 'general', 'GENERAL', '#7FA37B4d', '#7FA37B'
        WHERE NOT EXISTS (SELECT 1 FROM queues WHERE key = 'general')
    """)
    op.execute("UPDATE tasks SET queue_key = 'general' WHERE queue_key IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    # backfill необратим по смыслу (нет способа отличить "было пусто" от "было general") -
    # оставляем как есть, downgrade схему не трогает
    pass
