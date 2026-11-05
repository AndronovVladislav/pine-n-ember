import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronRight, Plus } from 'lucide-react'
import { Badge, Card, Chart, Row, Text } from '../kit'
import { balance, expenses, incomes, money, type Category, type Direction } from './data'
import { Action, Panel, QuickForm, type Overlay } from './ui'

function Categories({
  title,
  data,
  income = false,
  onOpen,
}: {
  title: string
  data: Category[]
  income?: boolean
  onOpen: (overlay: Overlay) => void
}) {
  return (
    <Panel title={title} meta={<span className="muted">RUB</span>} className="category-panel">
      <div className="category-list">
        {data.map((category) => (
          <div key={category.name} className="category-item">
            <Row
              role="button"
              tabIndex={0}
              className="category-row"
              aria-label={`Открыть категорию: ${category.name}`}
              onClick={() => onOpen({ kind: 'category', name: category.name, income })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen({ kind: 'category', name: category.name, income })
                }
              }}
              lead={<span className="category-swatch" style={{ background: category.color }} />}
              title={<Text>{category.name}</Text>}
              meta={<Text className="mono category-amount">{money(category.amount)}</Text>}
            >
              <ChevronRight size={14} />
            </Row>
            <div className="category-track" aria-hidden="true">
              <span style={{ width: `${category.percent}%`, background: category.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="category-panel-foot">
        <span>{income ? '3 поступления' : '29 операций'}</span>
        <span>{money(income ? 100000 : 43800)}</span>
      </div>
    </Panel>
  )
}

function BalanceChart({ compact = false }: { compact?: boolean }) {
  const plot = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(240)
  useLayoutEffect(() => {
    const measure = (): void => setWidth(Math.max(40, Math.round(plot.current?.clientWidth ?? 240)))
    const observer = new ResizeObserver(measure)
    if (plot.current) observer.observe(plot.current)
    measure()
    return () => observer.disconnect()
  }, [])
  return (
    <div className={`balance-chart ${compact ? 'compact-chart' : ''}`}>
      <div className="chart-title">
        <span>Баланс нарастающим итогом</span>
        <span className="muted">₽</span>
      </div>
      <div className="chart-area">
        <div className="chart-y">
          <span>100 тыс.</span>
          <span>50 тыс.</span>
          <span>0</span>
        </div>
        <div className="chart-plot" ref={plot}>
          <div className="chart-grid" />
          <Chart data={balance} width={width} height={compact ? 110 : 162} max={100000} dot area />
        </div>
      </div>
      <div className="chart-x">
        <span>1 нояб.</span>
        <span>10 нояб.</span>
        <span>20 нояб.</span>
        <span>30 нояб.</span>
      </div>
    </div>
  )
}

export function Finance({
  direction,
  onOpen,
  onDemo,
}: {
  direction: Direction
  onOpen: (overlay: Overlay) => void
  onDemo: () => void
}) {
  return (
    <div className="finance-screen screen" data-design={direction}>
      <div className="screen-heading">
        <div>
          <div className="eyebrow">Личный учёт</div>
          <div className="screen-title">Финансы</div>
          <div className="screen-subtitle">
            Ноябрь 2026 <span className="subtitle-dot">·</span> Все суммы в рублях
          </div>
        </div>
        <Action icon={<CalendarDays size={15} />} onClick={() => onOpen({ kind: 'range' })}>
          Ноябрь 2026
        </Action>
      </div>
      {direction === 'desk' && (
        <Card pad="large">
          <QuickForm onSave={onDemo} />
        </Card>
      )}
      <div className="finance-overview">
        <Card className="balance-hero" pad="large" gap={20}>
          <div className="balance-heading">
            <span>Баланс за период</span>
            <ArrowUpRight size={20} />
          </div>
          <div className="balance-number">
            56 200 <span>₽</span>
          </div>
          <span className="balance-explanation">Разница между доходами и расходами</span>
          {direction === 'ember' && <BalanceChart />}
          {direction !== 'ember' && (
            <div className="balance-rule">
              <span />
              <span />
            </div>
          )}
        </Card>
        <div className="finance-secondary">
          <Card className="finance-stat" pad="large">
            <div className="stat-label">
              <ArrowDownLeft size={16} />
              <span>Доходы</span>
            </div>
            <div className="stat-number">
              100 000 <span>₽</span>
            </div>
            <span className="muted">2 категории · 3 поступления</span>
          </Card>
          <Card className="finance-stat" pad="large">
            <div className="stat-label expense">
              <ArrowUpRight size={16} />
              <span>Расходы</span>
            </div>
            <div className="stat-number">
              43 800 <span>₽</span>
            </div>
            <span className="muted">4 категории · 29 операций</span>
          </Card>
        </div>
        {direction === 'ember' && (
          <Card className="finance-add-panel" pad="large">
            <QuickForm vertical onSave={onDemo} />
          </Card>
        )}
      </div>
      <div className="finance-details">
        <Categories title="Расходы по категориям" data={expenses} onOpen={onOpen} />
        <Categories title="Доходы по категориям" data={incomes} income onOpen={onOpen} />
        {direction !== 'ember' && (
          <Panel title="Динамика баланса" meta={<Badge>Ноябрь</Badge>} className="chart-panel">
            <BalanceChart compact={direction === 'desk'} />
            <div className="chart-foot">
              <span className="muted">На конец периода</span>
              <strong className="mono">56 200 ₽</strong>
            </div>
          </Panel>
        )}
      </div>
      {direction === 'forest' && (
        <Card className="finance-add-panel" pad="large">
          <QuickForm onSave={onDemo} />
        </Card>
      )}
      <div className="screen-bottom-note">
        <span>RUB / BYN · Курс сохраняется с операцией</span>
        <Action
          variant="ghost"
          size="small"
          icon={<Plus size={14} />}
          onClick={() => onOpen({ kind: 'create', entity: 'Новая категория' })}
        >
          Новая категория
        </Action>
      </div>
    </div>
  )
}
