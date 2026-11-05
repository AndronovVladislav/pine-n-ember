import { useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react'
import { api, type BalancePoint, type Breakdown, type Category, type Dashboard, type Kind, type Operation } from './api'
import { Field, FormDialog, LoadState, readStorage, text, useAction, useRemote, writeStorage } from './shared'

import { ButtonLabel, ChangingValue, useReveal } from './motion'

import './finance.css'

type Range = { preset: 'month' | '30d' | 'custom'; from: string; to: string }
const colors = ['#e8b18d', '#a6b898', '#cbbf8f', '#7fa69a', '#d97b5f']
const rub = (value: string | number): string =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value))} ₽`
const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
function presetRange(preset: 'month' | '30d'): Range {
  const now = new Date()
  const start = new Date(now)
  if (preset === 'month') start.setDate(1)
  else start.setDate(start.getDate() - 29)
  return { preset, from: localDate(start), to: localDate(now) }
}
function restoreRange(): Range {
  try {
    const saved = JSON.parse(readStorage('financeRange') ?? 'null') as Range | null
    if (saved?.preset === 'month' || saved?.preset === '30d') return presetRange(saved.preset)
    const valid = (value: unknown): value is string =>
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    if (saved?.preset === 'custom' && valid(saved.from) && valid(saved.to) && saved.from <= saved.to) return saved
  } catch {
    /* Повреждённые настройки не мешают открыть финансы. */
  }
  return presetRange('month')
}

export function Finance({ categoryId }: { categoryId?: string }) {
  const [range, setRange] = useState<Range>(restoreRange)
  const [custom, setCustom] = useState(range.preset === 'custom')
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  const action = useAction()
  const query = `date_from=${range.from}&date_to=${range.to}`
  const remote = useRemote(
    `finance:${query}`,
    async () => {
      const [dashboard, expense, income] = await Promise.all([
        api<Dashboard>(`/finance/dashboard?${query}`),
        api<Category[]>('/finance/expense-categories'),
        api<Category[]>('/finance/income-categories'),
      ])
      return { dashboard, expense, income, range }
    },
    true,
  )
  const data = remote.data
  const shownRange = categoryId ? range : (data?.range ?? range)
  const stale = shownRange.from !== range.from || shownRange.to !== range.to
  const chooseRange = (value: Range): void => {
    setRange(value)
    writeStorage('financeRange', JSON.stringify(value))
  }
  async function remove(category: Breakdown): Promise<void> {
    if (!confirm(`Удалить категорию «${category.category_name}»? Все операции этой категории тоже будут удалены.`))
      return
    await action.run(async () => {
      await api(`/finance/categories/${category.category_id}`, 'DELETE')
      await remote.refresh()
    })
  }
  function categories(title: string, rows: Breakdown[], total: string | number) {
    return (
      <section className="fin-panel">
        <h2>{title}</h2>
        {!rows.length && <p className="finance-empty-note">Пока нет операций за период</p>}
        <ul className="fin-categories">
          {rows.map((row, index) => {
            const percent = Number(total) > 0 ? (Number(row.amount_rub) / Number(total)) * 100 : 0
            return (
              <li key={row.category_id}>
                <div className="fin-category-line">
                  <a
                    href={`#/finance/categories/${row.category_id}`}
                    aria-label={`Операции категории ${row.category_name}`}
                  >
                    <span className="fin-dot" style={{ background: colors[index % colors.length] }} />
                    <span>{row.category_name}</span>
                    <strong>{rub(row.amount_rub)}</strong>
                  </a>
                  <span className="fin-category-actions">
                    <button
                      className="plain"
                      aria-label={`Переименовать категорию ${row.category_name}`}
                      onClick={() => setRename({ id: row.category_id, name: row.category_name })}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="plain"
                      disabled={action.pending}
                      aria-label={`Удалить категорию ${row.category_name}`}
                      onClick={() => void remove(row)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
                <div className="fin-category-track">
                  <span style={{ width: `${Math.min(100, percent)}%`, background: colors[index % colors.length] }} />
                </div>
              </li>
            )
          })}
        </ul>
        <div className="fin-panel-foot">
          <span>Всего</span>
          <span>{rub(total)}</span>
        </div>
      </section>
    )
  }
  return (
    <section className="finance-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Личный учёт</span>
          <h1>Финансы</h1>
          <p>
            {shownRange.from} — {shownRange.to} ·{' '}
            {remote.loading && data ? 'Обновление…' : stale ? 'Предыдущие итоги' : 'Все суммы в рублях'}
          </p>
        </div>
        <div className="range-control" role="group" aria-label="Период">
          {(['month', '30d', 'custom'] as const).map((preset, index) => (
            <button
              type="button"
              key={preset}
              className={`range-btn ${range.preset === preset ? 'active' : ''}`}
              aria-pressed={range.preset === preset}
              onClick={() => {
                if (preset === 'custom') setCustom(true)
                else {
                  setCustom(false)
                  chooseRange(presetRange(preset))
                }
              }}
            >
              {['Месяц', '30 дней', 'Диапазон…'][index]}
            </button>
          ))}
        </div>
      </header>
      {custom && (
        <form
          className="custom-range"
          onInput={(event) => {
            event.currentTarget.querySelector<HTMLInputElement>('[name="to"]')?.setCustomValidity('')
          }}
          onSubmit={(event) => {
            event.preventDefault()
            const values = new FormData(event.currentTarget)
            const from = text(values, 'from')
            const to = text(values, 'to')
            if (from > to) {
              const end = event.currentTarget.querySelector<HTMLInputElement>('[name="to"]')!
              end.setCustomValidity('Дата окончания раньше начала.')
              end.reportValidity()
              return
            }
            chooseRange({ preset: 'custom', from, to })
          }}
        >
          <label>
            Начало периода
            <input type="date" name="from" defaultValue={range.from} required />
          </label>
          <label>
            Конец периода
            <input type="date" name="to" defaultValue={range.to} required />
          </label>
          <button className="btn">Применить</button>
        </form>
      )}
      <LoadState {...remote} loading={remote.loading && !data} retry={() => void remote.refresh()} />
      {action.error && (
        <p role="alert" className="error-note">
          {action.error}
        </p>
      )}
      {categoryId ? (
        <CategoryOperations
          key={categoryId}
          id={categoryId}
          query={query}
          name={
            [...(data?.expense ?? []), ...(data?.income ?? [])].find((category) => category.id === categoryId)?.name
          }
        />
      ) : (
        data && (
          <>
            <div className="fin-overview" aria-busy={remote.loading}>
              <section className="fin-balance">
                <div>
                  Баланс за период <ArrowUpRight size={20} />
                </div>
                <strong>
                  <ChangingValue value={rub(data.dashboard.balance_rub)} />
                </strong>
                <p>Разница между доходами и расходами</p>
                <div className="fin-balance-rule" />
              </section>
              <section className="fin-panel fin-stat">
                <div>
                  <ArrowDownLeft size={16} />
                  Доходы
                </div>
                <strong>
                  <ChangingValue value={rub(data.dashboard.income_total_rub)} />
                </strong>
                <p>Доходы за выбранный период</p>
              </section>
              <section className="fin-panel fin-stat">
                <div>
                  <ArrowUpRight size={16} />
                  Расходы
                </div>
                <strong>
                  <ChangingValue value={rub(data.dashboard.expense_total_rub)} />
                </strong>
                <p>Расходы за выбранный период</p>
              </section>
            </div>
            <div className="fin-details" aria-busy={remote.loading}>
              {categories(
                'Расходы по категориям',
                data.dashboard.expense_by_category,
                data.dashboard.expense_total_rub,
              )}
              {categories('Доходы по категориям', data.dashboard.income_by_category, data.dashboard.income_total_rub)}
              <section className="fin-panel">
                <h2>Динамика баланса</h2>
                <BalanceChart series={data.dashboard.balance_series} />
                <div className="fin-panel-foot">
                  <span>На конец периода</span>
                  <span>{rub(data.dashboard.balance_rub)}</span>
                </div>
              </section>
            </div>
            <OperationForm expense={data.expense} income={data.income} refresh={remote.refresh} />
            <p className="fin-note">RUB / BYN · Курс сохраняется с операцией</p>
          </>
        )
      )}
      {rename && (
        <FormDialog
          title="Переименовать категорию"
          close={() => setRename(null)}
          save={async (values) => {
            await api(`/finance/categories/${rename.id}`, 'PATCH', { name: text(values, 'name') })
            await remote.refresh()
          }}
        >
          <Field label="Название" name="name" value={rename.name} required />
        </FormDialog>
      )}
    </section>
  )
}

function OperationForm({
  expense,
  income,
  refresh,
}: {
  expense: Category[]
  income: Category[]
  refresh: () => Promise<void>
}) {
  const [kind, setKind] = useState<Kind>('expense')
  const [currency, setCurrency] = useState('RUB')
  const [selected, setSelected] = useState('')
  const [created, setCreated] = useState<Category | null>(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState('')
  const action = useAction()
  const list = [...(kind === 'expense' ? expense : income)]
  if (created?.kind === kind && !list.some((category) => category.id === created.id)) list.push(created)
  const categoryId =
    selected === '__new__' || list.some((category) => category.id === selected) ? selected : (list[0]?.id ?? '__new__')
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setMessage('')
    await action.run(async () => {
      let id = categoryId
      if (id === '__new__') {
        const category = await api<Category>(
          `/finance/${kind === 'expense' ? 'expense' : 'income'}-categories`,
          'POST',
          { name: newName.trim() },
        )
        setCreated(category)
        setSelected(category.id)
        id = category.id
      }
      await api(`/finance/${kind === 'expense' ? 'expenses' : 'incomes'}`, 'POST', {
        category_id: id,
        amount,
        currency,
        date: text(values, 'date'),
        ...(kind === 'expense' ? { description: description.trim() || null } : {}),
      })
      setAmount('')
      setDescription('')
      setNewName('')
      setMessage('Операция добавлена')
      await refresh()
    })
  }
  return (
    <section className="fin-panel fin-form">
      <h2>Новая операция</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={action.pending}>
          <div className="fin-form-kind" role="group" aria-label="Тип операции">
            {(['expense', 'income'] as const).map((value, index) => (
              <button
                key={value}
                type="button"
                className={`btn ${kind === value ? 'selected' : ''}`}
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value)
                  setSelected('')
                }}
              >
                {index ? 'Доход' : 'Расход'}
              </button>
            ))}
          </div>
          <div className="fin-fields">
            <label className="field">
              Категория
              <select aria-label="Категория" value={categoryId} onChange={(event) => setSelected(event.target.value)}>
                {list.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value="__new__">+ новая категория</option>
              </select>
            </label>
            {categoryId === '__new__' && (
              <label className="field">
                Название категории
                <input value={newName} required onChange={(event) => setNewName(event.target.value)} />
              </label>
            )}
            {kind === 'expense' && (
              <label className="field">
                Описание
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="На что потратили?"
                />
              </label>
            )}
            <label className="field">
              Сумма
              <input
                type="number"
                value={amount}
                min="0.01"
                step="0.01"
                required
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">
              Дата
              <input type="date" name="date" defaultValue={localDate(new Date())} required />
            </label>
          </div>
          <div className="fin-form-footer">
            <div role="group" aria-label="Валюта">
              {['RUB', 'BYN'].map((value) => (
                <button
                  key={value}
                  className={`btn ${currency === value ? 'selected' : ''}`}
                  aria-pressed={currency === value}
                  type="button"
                  onClick={() => setCurrency(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <button className="btn primary">
              <ButtonLabel pending={action.pending} idle="Добавить операцию" />
            </button>
          </div>
        </fieldset>
        <div className="form-feedback">
          {action.error && (
            <p role="alert" className="error-note">
              {action.error}
            </p>
          )}
          {message && (
            <p role="status" className="success-note">
              {message}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}

function CategoryOperations({ id, query, name }: { id: string; query: string; name?: string }) {
  const remote = useRemote(`${id}:${query}`, () => api<Operation[]>(`/finance/categories/${id}/operations?${query}`))
  const [editing, setEditing] = useState<Operation | null>(null)
  return (
    <section className="fin-category-page">
      <a className="finance-back-link" href="#/finance">
        Назад к финансам
      </a>
      <h2>{name ?? 'Операции категории'}</h2>
      <LoadState {...remote} retry={() => void remote.refresh()} />
      {remote.data && (
        <div className="fin-panel">
          {!remote.data.length && <p>Пока нет операций за период</p>}
          <ul className="operation-list">
            {remote.data.map((operation) => (
              <li key={operation.id}>
                <div>
                  <time>{operation.date}</time>
                  {operation.description && <p>{operation.description}</p>}
                  {operation.kind === 'expense' && (
                    <button className="plain" aria-label="Редактировать описание" onClick={() => setEditing(operation)}>
                      Изменить описание
                    </button>
                  )}
                </div>
                <strong className="mono">
                  {operation.kind === 'expense' ? '−' : '+'}
                  {operation.amount} {operation.currency}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <FormDialog
          title="Описание траты"
          close={() => setEditing(null)}
          save={async (values) => {
            await api(`/finance/operations/${editing.id}`, 'PATCH', {
              description: text(values, 'description') || null,
            })
            await remote.refresh()
          }}
        >
          <Field label="Описание" name="description" value={editing.description ?? ''} multiline />
        </FormDialog>
      )}
    </section>
  )
}

function BalanceChart({ series }: { series: BalancePoint[] }) {
  const reveal = useReveal(JSON.stringify(series))

  if (!series.length) return <p className="finance-empty-note">Пока нет операций за период</p>
  if (series.length === 1)
    return (
      <p className="finance-empty-note">
        Баланс на {series[0].date}: {rub(series[0].cumulative_rub)}
      </p>
    )
  const values = series.map((point) => Number(point.cumulative_rub))
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const y = (value: number): number => 172 - ((value - min) / span) * 164
  const points = values.map((value, index) => `${8 + (index / (values.length - 1)) * 584},${y(value)}`)
  return (
    <div ref={reveal} className="balance-chart">
      <div className="chart-values">
        <span>{rub(max)}</span>
        <span>{rub(min)}</span>
      </div>
      <svg viewBox="0 0 600 180" preserveAspectRatio="none" role="img" aria-label="Баланс нарастающим итогом">
        <line x1="8" y1={y(0)} x2="592" y2={y(0)} stroke="var(--border)" />
        <polygon points={`8,${y(0)} ${points.join(' ')} 592,${y(0)}`} fill="var(--accent)" opacity=".09" />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="592" cy={y(values[values.length - 1])} r="3" fill="var(--accent)" />
      </svg>
      <div className="chart-dates">
        <span>{series[0].date}</span>
        <span>{series[series.length - 1].date}</span>
      </div>
    </div>
  )
}
