from sqlalchemy import Column, ForeignKey, Integer, MetaData, Table, Text

metadata = MetaData()

statuses = Table(
    'statuses',
    metadata,
    Column('key', Text, primary_key=True),
    Column('label', Text, nullable=False),
    Column('color', Text, nullable=False),
    Column('position', Integer, nullable=False),
)

tags = Table(
    'tags',
    metadata,
    Column('key', Text, primary_key=True),
    Column('label', Text, nullable=False),
    Column('bg', Text, nullable=False),
    Column('text_color', Text, nullable=False),
)

tasks = Table(
    'tasks',
    metadata,
    Column('id', Text, primary_key=True),
    Column('title', Text, nullable=False),
    Column('tag_key', Text, ForeignKey('tags.key', ondelete='SET NULL')),
    Column('due', Text),
    Column('status_key', Text, ForeignKey('statuses.key'), nullable=False),
    Column('description', Text, server_default=''),
    Column('position', Integer, nullable=False, server_default='0'),
)

blocks = Table(
    'blocks',
    metadata,
    Column('id', Text, primary_key=True),
    Column('name', Text, nullable=False),
    Column('position', Integer, nullable=False, server_default='0'),
)

topics = Table(
    'topics',
    metadata,
    Column('id', Text, primary_key=True),
    Column('block_id', Text, ForeignKey('blocks.id', ondelete='SET NULL')),
    Column('name', Text, nullable=False),
    Column('description', Text, server_default=''),
    Column('position', Integer, nullable=False, server_default='0'),
)

concepts = Table(
    'concepts',
    metadata,
    Column('id', Text, primary_key=True),
    Column('topic_id', Text, ForeignKey('topics.id', ondelete='CASCADE'), nullable=False),
    Column('name', Text, nullable=False),
    Column('description', Text, server_default=''),
    Column('position', Integer, nullable=False, server_default='0'),
)
