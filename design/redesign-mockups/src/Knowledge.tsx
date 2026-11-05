import { useState } from 'react'
import { ArrowUpRight, BookOpen, ChevronRight, Folder, Plus } from 'lucide-react'
import { Badge, Card, Row, Text } from '../kit'
import { conceptBody, topics, type Direction, type Topic } from './data'
import { Action, type Overlay } from './ui'

function TopicCard({ topic, onOpen }: { topic: Topic; onOpen: (overlay: Overlay) => void }) {
  return (
    <Card pad="large" gap={20} className="topic-card">
      <div className="topic-card-heading">
        <BookOpen size={20} />
        <Badge>Понятий: {topic.count}</Badge>
      </div>
      <div>
        <div className="topic-title">{topic.name}</div>
        <p className="topic-summary">{topic.summary}</p>
      </div>
      <div className="concept-list">
        {topic.concepts.map((concept) => (
          <Action
            key={concept}
            variant="ghost"
            aria-label={`Открыть понятие: ${concept}`}
            onClick={() => onOpen({ kind: 'concept', title: concept })}
            trailingIcon={<ChevronRight size={14} />}
          >
            {concept}
          </Action>
        ))}
      </div>
      <Action
        variant="ghost"
        size="small"
        icon={<Plus size={14} />}
        onClick={() => onOpen({ kind: 'create', entity: 'Новое понятие' })}
      >
        Добавить понятие
      </Action>
    </Card>
  )
}

function ReadingPane({ topic, onOpen }: { topic: Topic; onOpen: (overlay: Overlay) => void }) {
  const title = topic.concepts[0]
  return (
    <Card pad="large" gap={20} className="reading-pane">
      <div className="reading-crumb">
        <span>{topic.block}</span>
        <ChevronRight size={12} />
        <span>{topic.name}</span>
      </div>
      <div className="reading-title">{title}</div>
      <Badge>Понятие</Badge>
      <article className="reading-prose">
        <p>{topic.name === 'PostgreSQL' ? conceptBody[0] : topic.summary}</p>
        <div className="note-block">
          <div className="panel-title">Главное</div>
          <p>
            {topic.name === 'PostgreSQL'
              ? 'Быстрый поиск вместо полного просмотра таблицы. Цена — дополнительное место и работа при записи.'
              : 'Короткая запись помогает быстро вспомнить идею и вернуться к подробностям.'}
          </p>
        </div>
        <p>
          {topic.name === 'PostgreSQL'
            ? conceptBody[1]
            : 'Собирайте связанные понятия в одной теме и дополняйте их своими примерами.'}
        </p>
      </article>
      <div className="reading-footer">
        <span className="muted">Понятий в теме: {topic.count}</span>
        <Action
          variant="ghost"
          aria-label={`Открыть понятие: ${title}`}
          onClick={() => onOpen({ kind: 'concept', title })}
          trailingIcon={<ArrowUpRight size={14} />}
        >
          Открыть
        </Action>
      </div>
    </Card>
  )
}

export function Knowledge({ direction, onOpen }: { direction: Direction; onOpen: (overlay: Overlay) => void }) {
  const [selected, setSelected] = useState(0)
  const [block, setBlock] = useState('Все блоки')
  const blocks = ['Все блоки', 'Разработка', 'Дизайн', 'Повседневное']
  return (
    <div className="knowledge-screen screen">
      <div className="screen-heading">
        <div>
          <div className="eyebrow">Личная библиотека</div>
          <div className="screen-title">База знаний</div>
          <div className="screen-subtitle">
            3 блока <span className="subtitle-dot">·</span> 4 темы
            <span className="subtitle-dot">·</span> 23 понятия
          </div>
        </div>
        <div className="knowledge-actions">
          <Action icon={<Folder size={14} />} onClick={() => onOpen({ kind: 'create', entity: 'Новый блок' })}>
            Новый блок
          </Action>
          <Action
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() => onOpen({ kind: 'create', entity: 'Новая тема' })}
          >
            Новая тема
          </Action>
        </div>
      </div>
      {direction === 'desk' ? (
        <div className="knowledge-workspace">
          <div className="topic-index">
            <div className="index-title">Темы</div>
            {topics.map((topic, index) => (
              <Row
                key={topic.name}
                role="button"
                tabIndex={0}
                selected={selected === index}
                className="topic-index-row"
                title={<Text>{topic.name}</Text>}
                subtitle={<Text>{topic.block}</Text>}
                meta={<Text>{String(topic.count)}</Text>}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelected(index)
                  }
                }}
              />
            ))}
            <div className="topic-index-concepts">
              <div className="index-title">В этой теме</div>
              {topics[selected].concepts.map((concept, index) => (
                <Action
                  key={concept}
                  variant="ghost"
                  aria-label={`Открыть понятие: ${concept}`}
                  onClick={() => onOpen({ kind: 'concept', title: concept })}
                >
                  <span className="concept-index">{String(index + 1).padStart(2, '0')}</span> {concept}
                </Action>
              ))}
            </div>
          </div>
          <ReadingPane topic={topics[selected]} onOpen={onOpen} />
        </div>
      ) : (
        <>
          <div className="knowledge-filter" aria-label="Блоки знаний">
            {blocks.map((name) => (
              <Action
                key={name}
                variant={block === name ? 'tertiary' : 'ghost'}
                aria-pressed={block === name}
                onClick={() => setBlock(name)}
              >
                {name}
              </Action>
            ))}
          </div>
          {direction === 'ember' && (block === 'Все блоки' || block === 'Разработка') && (
            <div className="knowledge-feature">
              <div className="knowledge-intro">
                <div className="eyebrow">Разработка / PostgreSQL</div>
                <div className="feature-title">
                  Знания, которые
                  <br />
                  остаются с вами.
                </div>
                <p>
                  Не просто ссылки. Понятия, примеры
                  <br className="desktop-break" /> и ваши собственные объяснения.
                </p>
                <Action
                  variant="primary"
                  aria-label="Открыть понятие: Индексы"
                  onClick={() => onOpen({ kind: 'concept', title: 'Индексы' })}
                  trailingIcon={<ArrowUpRight size={15} />}
                >
                  Открыть понятие
                </Action>
              </div>
              <ReadingPane topic={topics[0]} onOpen={onOpen} />
            </div>
          )}
          <div className="knowledge-blocks">
            {blocks
              .slice(1)
              .filter((name) => block === 'Все блоки' || name === block)
              .map((name) => (
                <section key={name}>
                  <div className="block-heading">
                    <Folder size={16} />
                    <span>{name}</span>
                    <span className="muted">Тем: {topics.filter((topic) => topic.block === name).length}</span>
                  </div>
                  <div className="topics-grid">
                    {topics
                      .filter((topic) => topic.block === name)
                      .map((topic) => (
                        <TopicCard key={topic.name} topic={topic} onOpen={onOpen} />
                      ))}
                  </div>
                </section>
              ))}
          </div>
        </>
      )}
      <div className="screen-bottom-note">
        <span>Блок → тема → понятие</span>
        <span>Всё важное — своими словами</span>
      </div>
    </div>
  )
}
