import { useState } from 'react'
import { ArrowUpRight, Check, Circle, Columns3, LayoutList, Plus } from 'lucide-react'
import { Badge, Card, Row, Text } from '../kit'
import { queues, statuses, tasks, type Direction, type Task } from './data'
import { Action, type Overlay } from './ui'

function TaskCard({ task, onOpen }: { task: Task; onOpen: (overlay: Overlay) => void }) {
  const open = (): void => onOpen({ kind: 'task', task })
  const priority = task.priority === 'Высокий' ? 'high' : task.priority === 'Средний' ? 'medium' : 'low'
  return (
    <Card
      pad="medium"
      gap={16}
      className={`task-card priority-${priority}`}
      role="button"
      tabIndex={0}
      aria-label={`Открыть задачу: ${task.title}`}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      }}
    >
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <span className="priority-label">{task.priority}</span>
        {task.status === 4 ? <Check size={14} /> : <ArrowUpRight size={14} />}
      </div>
    </Card>
  )
}

export function Board({ direction, onOpen }: { direction: Direction; onOpen: (overlay: Overlay) => void }) {
  const [queue, setQueue] = useState(0)
  const [mobileStatus, setMobileStatus] = useState(1)
  const displayed =
    queue === 0
      ? tasks
      : queue === 1
        ? tasks.filter((task) => [0, 3, 4].includes(task.status))
        : tasks.filter((task) => task.status === 0)
  return (
    <div className="board-screen screen">
      <div className="screen-heading">
        <div>
          <div className="eyebrow">От идеи к результату</div>
          <div className="screen-title">Задачи</div>
          <div className="screen-subtitle">
            {displayed.length} задач <span className="subtitle-dot">·</span> {queues[queue]}
          </div>
        </div>
        <Action
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => onOpen({ kind: 'create', entity: 'Новая задача' })}
        >
          Новая задача
        </Action>
      </div>
      <div className="board-toolbar">
        <div className="queue-picker" aria-label="Очередь">
          {queues.map((label, index) => (
            <Action
              key={label}
              variant={queue === index ? 'tertiary' : 'ghost'}
              aria-pressed={queue === index}
              onClick={() => setQueue(index)}
            >
              {label}
            </Action>
          ))}
        </div>
        <span className="view-label">
          {direction === 'desk' ? <LayoutList size={15} /> : <Columns3 size={15} />}
          {direction === 'desk' ? 'По статусам' : 'Доска'}
        </span>
      </div>
      {direction === 'ember' && (
        <div className="board-summary">
          <span>
            <strong>{displayed.filter((task) => task.status === 1).length}</strong> в работе
          </span>
          <span>
            <strong>{displayed.filter((task) => task.status === 2).length}</strong> на проверке
          </span>
          <span className="summary-caption">Одно дело за другим.</span>
        </div>
      )}
      <div className="mobile-status-picker" aria-label="Статус задач">
        {statuses.map((label, index) => (
          <Action
            key={label}
            size="small"
            variant={mobileStatus === index ? 'primary' : 'ghost'}
            aria-pressed={mobileStatus === index}
            onClick={() => setMobileStatus(index)}
          >
            {label}
          </Action>
        ))}
      </div>
      <div className={`task-board ${direction === 'desk' ? 'list-board' : ''}`}>
        {statuses.map((status, index) => {
          const group = displayed.filter((task) => task.status === index)
          return (
            <section key={status} className={`task-lane status-${index}`} data-mobile-active={mobileStatus === index}>
              <div className="lane-heading">
                <span className="lane-label">
                  <Circle size={11} />
                  <span>{status}</span>
                  <span className="lane-count">{group.length}</span>
                </span>
                <Action
                  variant="ghost"
                  size="small"
                  aria-label={`Добавить задачу: ${status}`}
                  onClick={() => onOpen({ kind: 'create', entity: 'Новая задача' })}
                  icon={<Plus size={14} />}
                />
              </div>
              <div className="lane-content">
                {group.map((task) =>
                  direction === 'desk' ? (
                    <Row
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      className="task-table-row"
                      aria-label={`Открыть задачу: ${task.title}`}
                      title={<Text wrap>{task.title}</Text>}
                      meta={<Badge tone={task.priority === 'Высокий' ? 'accent' : 'neutral'}>{task.priority}</Badge>}
                      onClick={() => onOpen({ kind: 'task', task })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpen({ kind: 'task', task })
                        }
                      }}
                    >
                      <ArrowUpRight size={14} />
                    </Row>
                  ) : (
                    <TaskCard key={task.id} task={task} onOpen={onOpen} />
                  ),
                )}
                {!group.length && <div className="lane-empty">Пока нет задач</div>}
              </div>
            </section>
          )
        })}
      </div>
      <div className="screen-bottom-note">
        <span>Цвет отмечает приоритет, колонки — состояние задачи</span>
        <span>Нажмите на задачу, чтобы открыть</span>
      </div>
    </div>
  )
}
