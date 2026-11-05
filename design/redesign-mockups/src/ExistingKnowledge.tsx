import { useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card } from '../kit'
import { conceptText, topics, type Topic } from './data'
import { Action, type Overlay } from './ui'
import './refined.css'

function ExistingTopic({
  topic,
  onOpen,
  onDemo,
}: {
  topic: Topic
  onOpen: (overlay: Overlay) => void
  onDemo: () => void
}) {
  const [expanded, setExpanded] = useState<string[]>([])
  const toggle = (concept: string): void =>
    setExpanded((previous) =>
      previous.includes(concept) ? previous.filter((item) => item !== concept) : [...previous, concept],
    )
  return (
    <Card pad="medium" gap={0} className="existing-topic">
      <div className="existing-topic-heading">
        <div className="existing-topic-title">{topic.name}</div>
        <div className="existing-edit-actions">
          <Action
            variant="ghost"
            size="small"
            aria-label={`Редактировать тему: ${topic.name}`}
            icon={<Pencil size={13} />}
            onClick={() => onOpen({ kind: 'create', entity: 'Редактировать тему' })}
          />
          <Action
            variant="ghost"
            size="small"
            aria-label={`Удалить тему: ${topic.name}`}
            icon={<Trash2 size={13} />}
            onClick={onDemo}
          />
        </div>
      </div>
      <p className="existing-topic-description">{topic.summary}</p>
      <div className="existing-concepts">
        {topic.concepts.map((concept, index) => (
          <Card pad="small" gap={6} className="existing-concept" key={concept}>
            <div className="existing-concept-head">
              <Action
                variant="ghost"
                className="existing-concept-toggle"
                aria-label={`Раскрыть понятие: ${concept}`}
                aria-expanded={expanded.includes(concept)}
                onClick={() => toggle(concept)}
              >
                <span className="concept-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="existing-concept-name">{concept}</span>
              </Action>
              <div className="existing-edit-actions">
                <Action
                  variant="ghost"
                  size="small"
                  aria-label={`Редактировать понятие: ${concept}`}
                  icon={<Pencil size={12} />}
                  onClick={() => onOpen({ kind: 'create', entity: 'Редактировать понятие' })}
                />
                <Action
                  variant="ghost"
                  size="small"
                  aria-label={`Удалить понятие: ${concept}`}
                  icon={<Trash2 size={12} />}
                  onClick={onDemo}
                />
              </div>
            </div>
            {expanded.includes(concept) && (
              <p className="existing-concept-description">{conceptText(concept).join('\n\n')}</p>
            )}
          </Card>
        ))}
      </div>
      <Action
        variant="ghost"
        className="existing-add-concept"
        onClick={() => onOpen({ kind: 'create', entity: 'Новое понятие' })}
      >
        + понятие
      </Action>
    </Card>
  )
}

export function ExistingKnowledge({ onOpen, onDemo }: { onOpen: (overlay: Overlay) => void; onDemo: () => void }) {
  const [alignment, setAlignment] = useState(0)
  const alignments = [
    { name: 'По левому краю', icon: AlignLeft },
    { name: 'По центру', icon: AlignCenter },
    { name: 'По правому краю', icon: AlignRight },
  ]
  return (
    <div className="existing-knowledge screen">
      <div className="screen-heading">
        <div>
          <div className="screen-title">База знаний</div>
          <div className="screen-subtitle">4 темы, 12 понятий</div>
        </div>
        <div className="existing-toolbar">
          <div className="existing-align" role="group" aria-label="Выравнивание тем">
            {alignments.map(({ name, icon: Icon }, index) => (
              <Action
                key={name}
                size="small"
                variant={alignment === index ? 'primary' : 'ghost'}
                aria-label={name}
                aria-pressed={alignment === index}
                icon={<Icon size={15} />}
                onClick={() => setAlignment(index)}
              />
            ))}
          </div>
          <Action icon={<Plus size={14} />} onClick={() => onOpen({ kind: 'create', entity: 'Новый блок' })}>
            Новый блок
          </Action>
          <Action icon={<Plus size={14} />} onClick={() => onOpen({ kind: 'create', entity: 'Новая тема' })}>
            Новая тема
          </Action>
        </div>
      </div>
      <div className="existing-blocks">
        {['Разработка', 'Дизайн', 'Повседневное'].map((block) => (
          <section className="existing-block" key={block}>
            <div className="existing-block-heading">
              <div className="existing-block-title">
                <span className="existing-block-dot" />
                <span>{block}</span>
                <span className="existing-block-count">{topics.filter((topic) => topic.block === block).length}</span>
              </div>
              <div className="existing-edit-actions">
                <Action
                  variant="ghost"
                  size="small"
                  aria-label={`Переименовать блок: ${block}`}
                  icon={<Pencil size={13} />}
                  onClick={() => onOpen({ kind: 'create', entity: 'Переименовать блок' })}
                />
                <Action
                  variant="ghost"
                  size="small"
                  aria-label={`Удалить блок: ${block}`}
                  icon={<Trash2 size={13} />}
                  onClick={onDemo}
                />
              </div>
            </div>
            <div
              className="existing-topics"
              style={{ justifyContent: ['flex-start', 'center', 'flex-end'][alignment] }}
            >
              {topics
                .filter((topic) => topic.block === block)
                .map((topic) => (
                  <ExistingTopic key={topic.name} topic={topic} onOpen={onOpen} onDemo={onDemo} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
