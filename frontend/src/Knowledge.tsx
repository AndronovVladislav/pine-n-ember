import { useRef, useState, type DragEvent } from 'react'
import { Plus } from 'lucide-react'
import { api, type Block, type Concept, type KnowledgeData, type Topic } from './api'
import {
  Align,
  EditButtons,
  Field,
  FormDialog,
  LoadState,
  reorder,
  text,
  useAction,
  useAlign,
  useRemote,
} from './shared'

type Editor =
  | { kind: 'block'; value?: Block }
  | { kind: 'topic'; value?: Topic }
  | { kind: 'concept'; topicId: string; value?: Concept }
type Drag = { kind: 'block' | 'topic' | 'concept'; id: string }

export function Knowledge() {
  const remote = useRemote('knowledge', () => api<KnowledgeData>('/knowledge'))
  const action = useAction()
  const align = useAlign('knowledgeAlign')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [over, setOver] = useState<{ id: string; before: boolean } | null>(null)
  const drag = useRef<Drag | null>(null)
  const data = remote.data
  const topics = data ? [...data.blocks.flatMap((block) => block.topics), ...data.topics] : []
  const groups = data
    ? [...data.blocks, ...(data.topics.length ? [{ id: '', name: 'Без блока', position: 0, topics: data.topics }] : [])]
    : []
  async function mutate(path: string, method: string, payload?: object): Promise<void> {
    await api(path, method, payload)
    await remote.refresh()
  }
  function start(event: DragEvent, value: Drag): void {
    event.stopPropagation()
    drag.current = value
    event.dataTransfer.setData('text/plain', value.id)
    event.dataTransfer.effectAllowed = 'move'
  }
  function end(): void {
    drag.current = null
    setOver(null)
  }
  function allow(event: DragEvent, id: string, axis: 'x' | 'y' = 'y'): void {
    if (!drag.current || action.pending) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setOver({
      id,
      before: axis === 'x' ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2,
    })
  }
  function drop(event: DragEvent, block: Block, topic?: Topic, concept?: Concept): void {
    event.preventDefault()
    event.stopPropagation()
    const source = drag.current
    const before = over?.before ?? true
    end()
    if (!source || !data || action.pending) return
    if (source.kind === 'block' && block.id && block.id !== source.id) {
      void action.run(() =>
        mutate('/blocks/reorder', 'PUT', {
          keys: reorder(
            data.blocks.map((item) => item.id),
            source.id,
            block.id,
          ),
        }),
      )
    } else if (source.kind === 'topic') {
      if (topic?.id === source.id) return
      const payload: { block_id: string | null; position?: number } = { block_id: block.id || null }
      if (topic) {
        const siblings = block.topics.filter((item) => item.id !== source.id)
        payload.position = siblings.findIndex((item) => item.id === topic.id) + (before ? 0 : 1)
      } else if (topics.find((item) => item.id === source.id)?.block_id === payload.block_id) return
      void action.run(() => mutate(`/topics/${source.id}`, 'PATCH', payload))
    } else if (source.kind === 'concept' && topic && source.id !== concept?.id) {
      const payload: { topic_id: string; position?: number } = { topic_id: topic.id }
      if (concept) {
        const siblings = topic.concepts.filter((item) => item.id !== source.id)
        payload.position = siblings.findIndex((item) => item.id === concept.id) + (before ? 0 : 1)
      } else if (topic.concepts.some((item) => item.id === source.id)) return
      void action.run(() => mutate(`/concepts/${source.id}`, 'PATCH', payload))
    }
  }
  const marker = (id: string): string => (over?.id === id ? (over.before ? 'drop-before' : 'drop-after') : '')
  return (
    <section>
      <header className="page-heading">
        <div>
          <h1>База знаний</h1>
          <p>
            {topics.length} тем, {topics.reduce((sum, topic) => sum + topic.concepts.length, 0)} понятий
          </p>
        </div>
        <div className="header-actions">
          <Align {...align} />
          <button className="btn" onClick={() => setEditor({ kind: 'block' })}>
            <Plus size={14} /> Новый блок
          </button>
          <button className="add-btn" onClick={() => setEditor({ kind: 'topic' })}>
            <Plus size={14} /> Новая тема
          </button>
        </div>
      </header>
      <LoadState {...remote} retry={() => void remote.refresh()} />
      {action.error && (
        <p role="alert" className="error-note">
          {action.error}
        </p>
      )}
      {data && !groups.length && <p className="empty-hint">Пока нет тем — добавьте первую.</p>}
      {groups.map((block) => (
        <section
          key={block.id}
          className={`block-section ${marker(block.id)}`}
          onDragOver={(event) => allow(event, block.id)}
          onDrop={(event) => drop(event, block)}
        >
          <div className="block-section-head">
            <div
              className="block-section-heading"
              draggable={Boolean(block.id)}
              onDragStart={(event) => start(event, { kind: 'block', id: block.id })}
              onDragEnd={end}
            >
              <span className={`block-section-dot ${!block.id ? 'muted' : ''}`} />
              <h2 className="block-section-title">{block.name}</h2>
              <span className="block-section-count">{block.topics.length}</span>
            </div>
            {block.id && (
              <EditButtons
                name={`блок ${block.name}`}
                edit={() => setEditor({ kind: 'block', value: block })}
                remove={() => {
                  if (confirm('Удалить блок? Темы внутри него останутся, но станут без блока.'))
                    void action.run(() => mutate(`/blocks/${block.id}`, 'DELETE'))
                }}
              />
            )}
          </div>
          <div className={`topics-grid align-${align.value}`}>
            {!block.topics.length && <span className="empty-hint">Пока нет тем в этом блоке</span>}
            {block.topics.map((topic) => (
              <article
                key={topic.id}
                draggable
                className={`topic-card ${marker(topic.id)}`}
                onDragStart={(event) => start(event, { kind: 'topic', id: topic.id })}
                onDragEnd={end}
                onDragOver={(event) => {
                  if (drag.current?.kind !== 'block') allow(event, topic.id, 'x')
                }}
                onDrop={(event) => {
                  if (drag.current?.kind !== 'block') drop(event, block, topic)
                }}
              >
                <div className="topic-card-head">
                  <h3 className="topic-card-title">{topic.name}</h3>
                  <EditButtons
                    name={`тему ${topic.name}`}
                    edit={() => setEditor({ kind: 'topic', value: topic })}
                    remove={() => {
                      if (confirm('Удалить тему вместе со всеми её понятиями?'))
                        void action.run(() => mutate(`/topics/${topic.id}`, 'DELETE'))
                    }}
                  />
                </div>
                {topic.description && <p className="topic-card-desc">{topic.description}</p>}
                <div className="topic-concepts">
                  {!topic.concepts.length && <span className="empty-hint">Пока нет понятий</span>}
                  {topic.concepts.map((concept, index) => (
                    <div
                      key={concept.id}
                      draggable
                      className={`concept-row ${marker(concept.id)}`}
                      onDragStart={(event) => start(event, { kind: 'concept', id: concept.id })}
                      onDragEnd={end}
                      onDragOver={(event) => {
                        if (drag.current?.kind === 'concept') allow(event, concept.id)
                      }}
                      onDrop={(event) => {
                        if (drag.current?.kind === 'concept') drop(event, block, topic, concept)
                      }}
                    >
                      <div className="concept-head">
                        <button
                          className="plain concept-trigger"
                          aria-label={`Раскрыть понятие ${concept.name}`}
                          aria-expanded={expanded.has(concept.id)}
                          onClick={() => {
                            setExpanded((previous) => {
                              const next = new Set(previous)
                              if (next.has(concept.id)) next.delete(concept.id)
                              else next.add(concept.id)
                              return next
                            })
                          }}
                        >
                          <span className="concept-index">{String(index + 1).padStart(2, '0')}</span>
                          <span className="concept-name">{concept.name}</span>
                        </button>
                        <EditButtons
                          name={`понятие ${concept.name}`}
                          edit={() => setEditor({ kind: 'concept', topicId: topic.id, value: concept })}
                          remove={() => void action.run(() => mutate(`/concepts/${concept.id}`, 'DELETE'))}
                        />
                      </div>
                      <p className="concept-desc" hidden={!expanded.has(concept.id)}>
                        {concept.description || 'без описания'}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  className="topic-add-concept"
                  aria-label={`Добавить понятие в ${topic.name}`}
                  onClick={() => setEditor({ kind: 'concept', topicId: topic.id })}
                >
                  + понятие
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
      {editor && (
        <FormDialog
          title={
            editor.kind === 'block'
              ? editor.value
                ? 'Переименовать блок'
                : 'Новый блок'
              : editor.kind === 'topic'
                ? editor.value
                  ? 'Редактировать тему'
                  : 'Новая тема'
                : editor.value
                  ? 'Редактировать понятие'
                  : 'Новое понятие'
          }
          close={() => setEditor(null)}
          submit={editor.value ? 'Сохранить' : 'Добавить'}
          save={(values) => {
            const payload = { name: text(values, 'name') }
            if (editor.kind === 'block')
              return mutate(
                editor.value ? `/blocks/${editor.value.id}` : '/blocks',
                editor.value ? 'PATCH' : 'POST',
                payload,
              )
            if (editor.kind === 'topic')
              return mutate(editor.value ? `/topics/${editor.value.id}` : '/topics', editor.value ? 'PATCH' : 'POST', {
                ...payload,
                description: text(values, 'description'),
                block_id: text(values, 'block') || null,
              })
            return mutate(
              editor.value ? `/concepts/${editor.value.id}` : `/topics/${editor.topicId}/concepts`,
              editor.value ? 'PATCH' : 'POST',
              { ...payload, description: text(values, 'description') },
            )
          }}
        >
          <Field label="Название" name="name" value={editor.value?.name} required />
          {editor.kind !== 'block' && (
            <Field
              label="Описание"
              name="description"
              value={editor.value?.description}
              multiline={editor.kind === 'concept'}
            />
          )}
          {editor.kind === 'topic' && (
            <label className="field">
              Блок
              <select aria-label="Блок" name="block" defaultValue={editor.value?.block_id ?? ''}>
                <option value="">без блока</option>
                {data?.blocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </FormDialog>
      )}
    </section>
  )
}
