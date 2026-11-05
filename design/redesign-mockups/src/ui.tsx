import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronRight } from 'lucide-react'
import { Button, Card, Field, Badge, Segmented, type ButtonProps } from '../kit'
import { conceptText, expenses, incomes, money, operations, statuses, topics, type Direction, type Task } from './data'

export function Action({ onClick, ...props }: Omit<ButtonProps, 'onClick'> & { onClick?: () => void }) {
  return (
    <Button
      {...props}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.()
        }
      }}
    />
  )
}

export function Panel({
  title,
  meta,
  children,
  className = '',
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card pad="large" gap={16} className={`panel ${className}`}>
      <div className="panel-heading">
        <div className="panel-title">{title}</div>
        {meta}
      </div>
      {children}
    </Card>
  )
}

export function QuickForm({ onSave, vertical = false }: { onSave: () => void; vertical?: boolean }) {
  const [income, setIncome] = useState(false)
  const [currency, setCurrency] = useState(0)
  return (
    <div className={`quick-form ${vertical ? 'vertical' : ''}`}>
      <div className="form-caption">
        <span>Новая операция</span>
        <div role="group" aria-label="Тип операции">
          <Segmented
            value={income ? 1 : 0}
            items={['Расход', 'Доход'].map((label, index) => (
              <Action
                key={label}
                size="small"
                variant="ghost"
                aria-pressed={income === Boolean(index)}
                onClick={() => setIncome(Boolean(index))}
              >
                {label}
              </Action>
            ))}
          />
        </div>
      </div>
      <div className="form-fields">
        <Field label="Категория" value={income ? 'Зарплата' : 'Продукты'} trailing={<ChevronRight size={14} />} />
        <Field label="Описание" value="" placeholder={income ? 'Откуда поступление?' : 'На что потратили?'} />
        <Field label={`Сумма · ${currency ? 'BYN' : 'RUB'}`} value="" placeholder="0,00" className="amount-field" />
        <Field label="Дата" value="04.11.2026" />
      </div>
      <div className="form-bottom">
        <div role="group" aria-label="Валюта">
          <Segmented
            value={currency}
            items={['RUB', 'BYN'].map((label, index) => (
              <Action
                key={label}
                size="small"
                variant="ghost"
                aria-pressed={currency === index}
                onClick={() => setCurrency(index)}
              >
                {label}
              </Action>
            ))}
          />
        </div>
        <Action variant="primary" onClick={onSave}>
          Добавить операцию
        </Action>
      </div>
    </div>
  )
}

export type Overlay =
  | { kind: 'task'; task: Task }
  | { kind: 'concept'; title: string }
  | { kind: 'category'; name: string; income?: boolean }
  | { kind: 'create'; entity: string }
  | { kind: 'range' }

export function Detail({
  value,
  direction,
  onClose,
  onConfirm,
}: {
  value: Overlay
  direction: Direction
  onClose: () => void
  onConfirm: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const title =
    value.kind === 'task'
      ? value.task.title
      : value.kind === 'concept'
        ? value.title
        : value.kind === 'category'
          ? value.name
          : value.kind === 'range'
            ? 'Выбрать период'
            : value.entity
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = (): HTMLElement[] => [
      ...(root.current?.querySelectorAll<HTMLElement>('[tabindex="0"], button, input, select, textarea, a[href]') ??
        []),
    ]
    focusable()[0]?.focus()
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', handleKey)
      previous?.focus()
    }
  }, [onClose])
  return createPortal(
    <div className="mock-overlay pine-theme" data-direction={direction} onClick={onClose}>
      <Card
        className="mock-dialog"
        pad="large"
        gap={20}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div ref={root} className="dialog-content">
          <div className="dialog-top">
            <span className="eyebrow">{value.kind === 'category' ? 'Финансы / Категория' : 'Pine & Ember'}</span>
            <Action variant="ghost" aria-label="Закрыть" onClick={onClose} icon={<X size={18} />} />
          </div>
          <div id="dialog-title" className="dialog-title">
            {title}
          </div>
          {value.kind === 'task' && (
            <>
              <div className="dialog-meta">
                <Badge tone="accent">{statuses[value.task.status]}</Badge>
                <Badge>{value.task.priority} приоритет</Badge>
              </div>
              <p>Сохранить узнаваемость интерфейса и сделать основные действия заметнее.</p>
              <div className="note-block">
                <div className="panel-title">Что нужно сделать</div>
                <ul>
                  <li>Проверить сетку и отступы.</li>
                  <li>Упростить второстепенные элементы.</li>
                  <li>Посмотреть результат на узком экране.</li>
                </ul>
              </div>
              <div className="detail-properties">
                <Field label="Очередь" value="PET PROJECTS" />
                <Field label="Статус" value={statuses[value.task.status]} />
                <Field label="Приоритет" value={value.task.priority} />
              </div>
            </>
          )}
          {value.kind === 'concept' && (
            <>
              <div className="dialog-meta">
                <Badge>{topics.find((topic) => topic.concepts.includes(value.title))?.block}</Badge>
                <span className="muted">{topics.find((topic) => topic.concepts.includes(value.title))?.name}</span>
              </div>
              {conceptText(value.title).map((text) => (
                <p key={text}>{text}</p>
              ))}
              {value.title === 'Индексы' && (
                <div className="code-note">
                  EXPLAIN ANALYZE
                  <br />
                  SELECT * FROM notes WHERE topic_id = 42;
                </div>
              )}
              <Action onClick={onConfirm}>Редактировать понятие</Action>
            </>
          )}
          {value.kind === 'category' && (
            <>
              <div className="category-total">
                <span className="muted">За ноябрь 2026</span>
                <strong>
                  {money([...expenses, ...incomes].find((category) => category.name === value.name)!.amount)}
                </strong>
              </div>
              <div className="panel-title">Последние операции</div>
              <div className="operation-list">
                {(value.name === 'Продукты'
                  ? operations
                  : [
                      {
                        title: value.income ? 'Поступление' : 'Оплата',
                        date: '1 ноября',
                        currency: 'RUB',
                        amount: `${value.income ? '+' : '−'}${money(
                          [...expenses, ...incomes].find((category) => category.name === value.name)!.amount,
                        )}`,
                      },
                    ]
                ).map((operation) => (
                  <div className="operation" key={operation.title}>
                    <div>
                      <strong>{value.name === 'Продукты' || value.income ? operation.title : value.name}</strong>
                      <span>
                        {operation.date} · {operation.currency}
                      </span>
                    </div>
                    <div className="operation-right">
                      <span className="mono">{operation.amount}</span>
                      <Action size="small" variant="ghost" onClick={onConfirm}>
                        Изменить
                      </Action>
                    </div>
                  </div>
                ))}
              </div>
              <span className="muted">Демонстрационные записи, не ваши операции.</span>
            </>
          )}
          {value.kind === 'create' && (
            <>
              <span className="muted">Демонстрационная форма. Данные не отправляются в приложение.</span>
              <Field
                label="Название"
                value={value.entity === 'Новая задача' ? 'Подготовить следующий шаг' : 'Новая запись'}
              />
              <Field
                label={value.entity === 'Новая задача' ? 'Очередь' : 'Блок'}
                value={value.entity === 'Новая задача' ? 'PET PROJECTS' : 'Разработка'}
              />
              <Field label="Описание" value="Небольшое описание будущей записи" />
              <Action variant="primary" onClick={onConfirm}>
                Показать результат
              </Action>
            </>
          )}
          {value.kind === 'range' && (
            <>
              <span className="muted">Пример выбора произвольного диапазона.</span>
              <div className="detail-properties">
                <Field label="С даты" value="01.11.2026" />
                <Field label="По дату" value="30.11.2026" />
              </div>
              <Action variant="primary" onClick={onConfirm}>
                Применить
              </Action>
            </>
          )}
          <div className="dialog-footer">
            <span className="muted">Макет · без изменения данных</span>
            <Action onClick={onClose}>Закрыть</Action>
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
