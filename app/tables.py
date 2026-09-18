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

entities = Table(
    'entities',
    metadata,
    Column('id', Text, primary_key=True),
    Column('kind', Text, nullable=False, server_default='skill'),
    Column('name', Text, nullable=False),
    Column('description', Text, server_default=''),
    Column('position', Integer, nullable=False, server_default='0'),
    Column('metadata', Text, nullable=False, server_default='{}'),
)

entity_items = Table(
    'entity_items',
    metadata,
    Column('id', Text, primary_key=True),
    Column('entity_id', Text, ForeignKey('entities.id', ondelete='CASCADE'), nullable=False),
    Column('kind', Text, nullable=False, server_default='command'),
    Column('name', Text, nullable=False),
    Column('description', Text, server_default=''),
    Column('position', Integer, nullable=False, server_default='0'),
    Column('metadata', Text, nullable=False, server_default='{}'),
)
