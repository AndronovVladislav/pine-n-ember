import { useRef, useState, type DragEvent } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { api, type BoardData, type Priority, type Task } from './api'
import { useBoardMotion } from './motion'
import {
  Align,
  Dialog,
  Field,
  FormDialog,
  LoadState,
  readStorage,
  reorder,
  text,
  useAction,
  useAlign,
  useRemote,
  writeStorage,
} from './shared'

const priorities: Record<Priority, { label: string; color: string; order: number }> = {
  critical: { label: 'Критичный', color: '#d9534f', order: 0 },
  high: { label: 'Высокий', color: '#c97d4f', order: 1 },
  medium: { label: 'Средний', color: '#d9a441', order: 2 },
  low: { label: 'Низкий', color: '#8a9a5b', order: 3 },
  lowest: { label: 'Самый низкий', color: '#4f6e58', order: 4 },
}
type Drag = { kind: 'task' | 'status' | 'queue'; id: string }
type Editor = { kind: 'new' } | { kind: 'status' | 'queue'; id: string; name: string }

export function Board({ taskId }: { taskId?: string }) {
  const remote = useRemote('board', () => api<BoardData>('/board'))
  const action = useAction()
  const align = useAlign('boardAlign')
  const [selected, setSelected] = useState(() => readStorage('boardActiveQueue'))
  const [editor, setEditor] = useState<Editor | null>(null)
  const [over, setOver] = useState('')
  const [dragged, setDragged] = useState('')
  const drag = useRef<Drag | null>(null)
  const data = remote.data
  const motion = useBoardMotion(
    JSON.stringify([
      data?.statuses,
      data?.tasks.map((item) => [item.id, item.status, item.queue, item.title, item.priority]),
      selected,
      align.value,
    ]),
  )
  const queue = data?.queues.find((item) => item.key === selected) ?? data?.queues[0]
  const chooseQueue = (key: string): void => {
    setSelected(key)
    writeStorage('boardActiveQueue', key)
  }
  const close = (): void => {
    location.hash = '#'
  }
  const task = data?.tasks.find((item) => item.id === taskId)
  async function mutate(path: string, method: string, payload?: object): Promise<void> {
    await api(path, method, payload)
    await remote.refresh()
  }
  function start(event: DragEvent, value: Drag): void {
    event.stopPropagation()
    drag.current = value
    setDragged(value.kind === 'task' ? value.id : '')
    event.dataTransfer.setData('text/plain', value.id)
    event.dataTransfer.effectAllowed = 'move'
  }
  function end(): void {
    drag.current = null
    setDragged('')
    setOver('')
  }
  function allow(event: DragEvent, target: string): void {
    if (!drag.current || action.pending) return
    event.preventDefault()
    setOver(target)
  }
  function dropColumn(event: DragEvent, key: string): void {
    event.preventDefault()
    const source = drag.current
    end()
    if (!source || !data || action.pending) return
    if (source.kind === 'task' && data.tasks.find((item) => item.id === source.id)?.status !== key) {
      void action.run(() => mutate(`/tasks/${source.id}/move`, 'PUT', { status: key }))
    } else if (source.kind === 'status' && source.id !== key) {
      void action.run(() =>
        mutate('/statuses/reorder', 'PUT', {
          keys: reorder(
            data.statuses.map((item) => item.key),
            source.id,
            key,
          ),
        }),
      )
    }
  }
  const visibleTasks = data?.tasks.filter((item) => item.queue === queue?.key) ?? []
  return (
    <section className="board-page">
      <header className="page-heading">
        <div>
          <h1>Задачи</h1>
          <p>{visibleTasks.length} задач</p>
        </div>
        <div className="header-actions">
          <Align {...align} />
          <button className="add-btn" onClick={() => setEditor({ kind: 'new' })}>
            <Plus size={14} />
            Новая задача
          </button>
        </div>
      </header>
      <LoadState {...remote} loading={remote.loading && !data} retry={() => void remote.refresh()} />
      {action.error && (
        <p role="alert" className="error-note">
          {action.error}
        </p>
      )}
      {data && (
        <>
          <div className="queue-crumbs" role="group" aria-label="Очередь">
            {data.queues.map((item, index) => (
              <span key={item.key} className="queue-part">
                {index > 0 && <span className="queue-crumb-sep">/</span>}
                <button
                  draggable
                  className={`queue-crumb ${queue?.key === item.key ? 'active' : ''}`}
                  aria-pressed={queue?.key === item.key}
                  onClick={() => chooseQueue(item.key)}
                  onDoubleClick={() => setEditor({ kind: 'queue', id: item.key, name: item.label })}
                  onDragStart={(event) => start(event, { kind: 'queue', id: item.key })}
                  onDragEnd={end}
                  onDragOver={(event) => {
                    if (drag.current?.kind === 'queue') allow(event, item.key)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const source = drag.current
                    end()
                    if (source?.kind === 'queue' && source.id !== item.key)
                      void action.run(() =>
                        mutate('/queues/reorder', 'PUT', {
                          keys: reorder(
                            data.queues.map((entry) => entry.key),
                            source.id,
                            item.key,
                          ),
                        }),
                      )
                  }}
                >
                  {item.label}
                </button>
              </span>
            ))}
          </div>
          {!queue && <p className="empty-hint">Пока нет очередей — создайте первую задачу.</p>}
          <div ref={motion} className={`board align-${align.value}`}>
            {data.statuses.map((status, index) => {
              const items = visibleTasks.filter((item) => item.status === status.key)
              if (index !== data.statuses.length - 1)
                items.sort((a, b) => priorities[a.priority].order - priorities[b.priority].order)
              return (
                <section
                  className={`column ${over === status.key ? 'drag-over' : ''}`}
                  key={status.key}
                  data-status={status.key}
                  onDragOver={(event) => allow(event, status.key)}
                  onDrop={(event) => dropColumn(event, status.key)}
                >
                  <div
                    className="column-head"
                    draggable
                    onDragStart={(event) => start(event, { kind: 'status', id: status.key })}
                    onDragEnd={end}
                  >
                    <GripVertical size={13} className="column-drag-handle" />
                    <span className="dot" style={{ background: status.color }} />
                    <button
                      className="plain column-title"
                      onClick={() => setEditor({ kind: 'status', id: status.key, name: status.label })}
                    >
                      {status.label}
                    </button>

                    <button
                      className="icon-button column-remove"
                      aria-label={`Удалить группу ${status.label}`}
                      disabled={action.pending}
                      onClick={() => {
                        if (confirm('Удалить группу?'))
                          void action.run(() => mutate(`/statuses/${status.key}`, 'DELETE'))
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="cards">
                    {items.map((item) => (
                      <div className="task-wrap" key={item.id} data-motion-key={item.id}>
                        <div
                          className={`card ${status.key === 'done' ? 'done' : ''} ${
                            dragged === item.id ? 'dragging' : ''
                          }`}
                          draggable
                          role="button"
                          tabIndex={0}
                          aria-label={`Открыть задачу ${item.title}`}
                          style={{
                            borderLeftColor:
                              index === data.statuses.length - 1 ? '#4f6e58' : priorities[item.priority].color,
                          }}
                          onDragStart={(event) => start(event, { kind: 'task', id: item.id })}
                          onDragEnd={end}
                          onClick={() => {
                            location.hash = `#/task/${item.id}`
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              location.hash = `#/task/${item.id}`
                            }
                          }}
                        >
                          <p className="card-title">{item.title}</p>
                        </div>
                        <button
                          className="icon-button task-remove"
                          aria-label={`Удалить задачу ${item.title}`}
                          disabled={action.pending}
                          onClick={() => {
                            void action.run(() => mutate(`/tasks/${item.id}`, 'DELETE'))
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {!items.length && <span className="empty-hint">пусто</span>}
                  </div>
                </section>
              )
            })}
          </div>
          {editor &&
            (editor.kind === 'new' ? (
              <TaskForm
                key="new"
                data={data}
                queue={queue?.label ?? ''}
                close={() => setEditor(null)}
                save={(values) => mutate('/tasks', 'POST', values)}
              />
            ) : (
              <FormDialog
                title={editor.kind === 'queue' ? 'Переименовать очередь' : 'Переименовать группу'}
                close={() => setEditor(null)}
                save={(values) =>
                  mutate(`/${editor.kind === 'queue' ? 'queues' : 'statuses'}/${editor.id}`, 'PATCH', {
                    label: text(values, 'label'),
                  })
                }
              >
                <Field label="Название" name="label" value={editor.name} required />
              </FormDialog>
            ))}
          {taskId &&
            (task ? (
              <TaskForm
                key={task.id}
                data={data}
                task={task}
                queue={data.queues.find((item) => item.key === task.queue)?.label ?? ''}
                close={close}
                save={(values) => mutate(`/tasks/${task.id}`, 'PATCH', values)}
              />
            ) : (
              !remote.loading && (
                <Dialog title="Задача не найдена" close={close}>
                  {(dismiss) => (
                    <>
                      <p>Запись удалена или недоступна.</p>
                      <button className="btn" onClick={dismiss}>
                        Вернуться к доске
                      </button>
                    </>
                  )}
                </Dialog>
              )
            ))}
        </>
      )}
    </section>
  )
}

function TaskForm({
  data,
  task,
  queue,
  close,
  save,
}: {
  data: BoardData
  task?: Task
  queue: string
  close: () => void
  save: (values: object) => Promise<void>
}) {
  return (
    <FormDialog
      title={task ? task.title : 'Новая задача'}
      close={close}
      submit={task ? 'Сохранить' : 'Добавить'}
      save={(values) =>
        save({
          title: text(values, 'title'),
          queue: text(values, 'queue'),
          status: text(values, 'status') || null,
          priority: text(values, 'priority'),
          ...(task ? { description: text(values, 'description') } : {}),
        })
      }
    >
      <Field label="Название" name="title" value={task?.title} required />
      <label className="field">
        Очередь
        <input name="queue" defaultValue={queue} list="queue-options" required />
      </label>
      <datalist id="queue-options">
        {data.queues.map((item) => (
          <option key={item.key} value={item.label} />
        ))}
      </datalist>
      <label className="field">
        Статус
        <input
          name="status"
          list="status-options"
          defaultValue={
            data.statuses.find((item) => item.key === task?.status)?.label ?? data.statuses[0]?.label ?? 'Черновик'
          }
        />
      </label>
      <datalist id="status-options">
        {data.statuses.map((item) => (
          <option key={item.key} value={item.label} />
        ))}
      </datalist>
      <label className="field">
        Приоритет
        <select aria-label="Приоритет" name="priority" defaultValue={task?.priority ?? 'low'}>
          {Object.entries(priorities).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      {task && <Field label="Описание" name="description" value={task.description} multiline />}
    </FormDialog>
  )
}
