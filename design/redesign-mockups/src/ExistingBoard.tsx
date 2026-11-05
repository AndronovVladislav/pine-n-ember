import { useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Card } from '../kit'
import { queues, statuses, tasks, type Task } from './data'
import { Action, type Overlay } from './ui'
import './existing-board.css'

const priorityOrder = { Высокий: 0, Средний: 1, Низкий: 2 }
const priorityColors = { Высокий: '#c97d4f', Средний: '#d9a441', Низкий: '#8a9a5b' }
const statusColors = ['#6b8f74', '#ff9e64', '#d9a441', '#7fa37b', '#4f6e58']

function ExistingTask({
  task,
  onOpen,
  onDemo,
}: {
  task: Task
  onOpen: (overlay: Overlay) => void
  onDemo: () => void
}) {
  const open = (): void => onOpen({ kind: 'task', task })
  return (
    <div className="existing-task-wrap">
      <Card
        className={`existing-task ${task.status === 4 ? 'existing-task-done' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Открыть задачу: ${task.title}`}
        style={{ borderLeftColor: task.status === 4 ? '#4f6e58' : priorityColors[task.priority] }}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            open()
          }
        }}
      >
        <p className="existing-task-title">{task.title}</p>
      </Card>
      <Action
        variant="ghost"
        size="small"
        className="existing-task-delete"
        aria-label={`Удалить задачу: ${task.title}`}
        icon={<Trash2 size={13} />}
        onClick={onDemo}
      />
    </div>
  )
}

export function ExistingBoard({ onOpen, onDemo }: { onOpen: (overlay: Overlay) => void; onDemo: () => void }) {
  const [queue, setQueue] = useState(0)
  const [alignment, setAlignment] = useState(0)
  const displayed =
    queue === 0
      ? tasks
      : queue === 1
        ? tasks.filter((task) => [0, 3, 4].includes(task.status))
        : tasks.filter((task) => task.status === 0)
  const alignments = [
    { name: 'По левому краю', icon: AlignLeft },
    { name: 'По центру', icon: AlignCenter },
    { name: 'По правому краю', icon: AlignRight },
  ]
  return (
    <div className="existing-board screen">
      <div className="screen-heading">
        <div>
          <div className="screen-title">Задачи</div>
          <div className="screen-subtitle">{displayed.length} задач</div>
        </div>
        <div className="existing-board-toolbar">
          <div className="existing-align" role="group" aria-label="Выравнивание доски">
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
          <Action icon={<Plus size={14} />} onClick={() => onOpen({ kind: 'create', entity: 'Новая задача' })}>
            Новая задача
          </Action>
        </div>
      </div>
      <div className="existing-queues" role="group" aria-label="Очередь">
        {queues.map((label, index) => (
          <span className="existing-queue-item" key={label}>
            {index > 0 && <span className="existing-queue-separator">/</span>}
            <Action
              variant="ghost"
              className="existing-queue"
              aria-pressed={queue === index}
              onClick={() => setQueue(index)}
            >
              {label}
            </Action>
          </span>
        ))}
      </div>
      <div className="existing-columns" style={{ justifyContent: ['flex-start', 'center', 'flex-end'][alignment] }}>
        {statuses.map((status, index) => {
          const group = displayed.filter((task) => task.status === index)
          if (index !== 4) group.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
          return (
            <Card className="existing-column" key={status} gap={0}>
              <div className="existing-column-heading">
                <GripVertical size={13} className="existing-column-grip" />
                <span className="existing-status-dot" style={{ background: statusColors[index] }} />
                <span className="existing-column-title">{status}</span>
                <span className="existing-column-count">{group.length}</span>
                <Action
                  variant="ghost"
                  size="small"
                  className="existing-column-delete"
                  aria-label={`Удалить группу: ${status}`}
                  icon={<Trash2 size={14} />}
                  onClick={onDemo}
                />
              </div>
              <div className="existing-cards">
                {group.map((task) => (
                  <ExistingTask key={task.id} task={task} onOpen={onOpen} onDemo={onDemo} />
                ))}
                {!group.length && <div className="existing-column-empty">пусто</div>}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
