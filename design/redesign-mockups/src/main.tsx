import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, BookOpen, Check, ChevronRight, Columns3, Monitor, Smartphone, Wallet } from 'lucide-react'
import { Stage, Window, type LookTokens } from '../kit'
import GoldReference from '../reference/static-card'
import { Board } from './Board'
import { ExistingBoard } from './ExistingBoard'
import { Finance } from './Finance'
import { Knowledge } from './Knowledge'
import { ExistingKnowledge } from './ExistingKnowledge'
import { RefinedGallery } from './RefinedGallery'
import { Action, Detail, type Overlay } from './ui'
import { directions, sections, type Direction, type Section } from './data'
import './style.css'

const icons = { finance: Wallet, board: Columns3, knowledge: BookOpen }
const tokens: LookTokens = {
  '--ss-font': '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--ss-mono': '"JetBrains Mono", "SF Mono", Menlo, monospace',
}

function Product({
  direction,
  section,
  onSection,
}: {
  direction: Direction
  section: Section
  onSection: (section: Section) => void
}) {
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [notice, setNotice] = useState(false)
  const onClose = useCallback(() => setOverlay(null), [])
  const demo = (): void => {
    setOverlay(null)
    setNotice(true)
  }
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(false), 4200)
    return () => clearTimeout(timer)
  }, [notice])
  return (
    <div
      className="product pine-theme"
      data-testid="product"
      data-direction={direction}
      data-section={section}
      data-shell={direction === 'desk' || direction === 'refined' ? 'sidebar' : undefined}
    >
      <header className="product-navigation">
        <div className="wordmark">
          <span>Pine</span> <span className="wordmark-amp">&</span> <span>Ember</span>
        </div>
        <div className="workspace-label">Личное пространство</div>
        <nav className="product-tabs" aria-label="Разделы приложения">
          {sections.map((item) => {
            const Icon = icons[item.id]
            return (
              <Action
                key={item.id}
                variant="ghost"
                aria-current={section === item.id ? 'page' : undefined}
                icon={<Icon size={17} />}
                onClick={() => onSection(item.id)}
              >
                {item.name}
              </Action>
            )
          })}
        </nav>
        <div className="nav-foot">
          <span className="nav-rule" />
          <span>В своём ритме.</span>
        </div>
      </header>
      <main className="product-main">
        {section === 'finance' && (
          <Finance direction={direction === 'refined' ? 'forest' : direction} onOpen={setOverlay} onDemo={demo} />
        )}
        {section === 'board' &&
          (direction === 'refined' ? (
            <ExistingBoard onOpen={setOverlay} onDemo={demo} />
          ) : (
            <Board direction={direction} onOpen={setOverlay} />
          ))}
        {section === 'knowledge' &&
          (direction === 'refined' ? (
            <ExistingKnowledge onOpen={setOverlay} onDemo={demo} />
          ) : (
            <Knowledge direction={direction} onOpen={setOverlay} />
          ))}
      </main>
      {notice && (
        <div className="demo-notice" role="status">
          <Check size={16} />
          <span>Демонстрация: действие показано, данные не сохранены.</span>
        </div>
      )}
      {overlay && <Detail value={overlay} direction={direction} onClose={onClose} onConfirm={demo} />}
    </div>
  )
}

function ResponsiveStage({ children, direction }: { children: ReactNode; direction: Direction }) {
  const host = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1240, height: 800 })
  useLayoutEffect(() => {
    const measure = (): void => {
      const width = Math.round(host.current?.clientWidth ?? 1240)
      const height = content.current?.getBoundingClientRect().height ?? 800
      const scale = width < 600 ? Math.min(1, width / 358) : 1
      const naturalHeight = height / scale
      setSize((previous) =>
        previous.width === width && previous.height === naturalHeight ? previous : { width, height: naturalHeight },
      )
    }
    const observer = new ResizeObserver(measure)
    if (host.current) observer.observe(host.current)
    if (content.current) observer.observe(content.current)
    measure()
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={host} className={`stage-host direction-${direction}`}>
      <Stage
        width={size.width}
        height={size.height}
        compact={{ below: 600, width: 358, height: size.height }}
        theme="dark"
        fidelity="realistic"
        tokens={tokens}
        className="product-stage"
      >
        {() => (
          <div ref={content} className="measured-content">
            <Window className="app-frame">{children}</Window>
          </div>
        )}
      </Stage>
    </div>
  )
}

function readSelection(): { direction: Direction; section: Section } {
  const query = new URLSearchParams(location.search)
  return {
    direction: directions.find((item) => item.id === query.get('direction'))?.id ?? 'refined',
    section: sections.find((item) => item.id === query.get('section'))?.id ?? 'finance',
  }
}

function Gallery() {
  const [selection, setSelection] = useState(readSelection)
  const [mobile, setMobile] = useState(false)
  const [compare, setCompare] = useState(false)
  const capture = new URLSearchParams(location.search).has('capture')
  const update = (patch: Partial<typeof selection>): void => {
    const next = { ...selection, ...patch }
    const url = new URL(location.href)
    url.searchParams.set('direction', next.direction)
    url.searchParams.set('section', next.section)
    history.pushState(null, '', url)
    setSelection(next)
  }
  useEffect(() => {
    const handleBack = (): void => setSelection(readSelection())
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])
  const section = sections.find((item) => item.id === selection.section)!
  const renderProduct = (id: Direction): ReactNode => (
    <ResponsiveStage key={id} direction={id}>
      <Product direction={id} section={selection.section} onSection={(id) => update({ section: id })} />
    </ResponsiveStage>
  )
  if (capture) return <div className="capture-page">{renderProduct(selection.direction)}</div>
  if (selection.direction === 'refined')
    return (
      <RefinedGallery
        section={selection.section}
        onSection={(section) => update({ section })}
        product={renderProduct('refined')}
      />
    )
  const direction = directions.find((item) => item.id === selection.direction)!
  return (
    <div className="gallery">
      <header className="gallery-header">
        <a href="?" className="gallery-brand">
          Pine <span>&</span> Ember
        </a>
        <span className="gallery-label">
          Исследование интерфейса <span className="gallery-year">/ 2026</span>
        </span>
      </header>
      <section className="gallery-intro">
        <div className="intro-copy">
          <div className="gallery-eyebrow">Три направления. Один характер.</div>
          <h1>
            Знакомое пространство.
            <br />
            <span>Больше ясности.</span>
          </h1>
        </div>
        <p>
          Лесная палитра, тёплый акцент и ваши привычные инструменты. Три взгляда на то, как они могут работать вместе.
        </p>
      </section>
      <nav className="direction-picker" aria-label="Направление дизайна">
        {directions.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`direction-choice ${item.id}`}
            aria-pressed={selection.direction === item.id}
            onClick={() => update({ direction: item.id })}
          >
            <span className="direction-top">
              <span className="direction-number">0{index + 1}</span>
              <span className="direction-swatches">
                <i />
                <i />
                <i />
              </span>
              {selection.direction === item.id && <Check size={15} />}
            </span>
            <span className="direction-name">{item.name}</span>
            <span className="direction-subtitle">{item.subtitle}</span>
          </button>
        ))}
      </nav>
      <div className="gallery-controls">
        <nav className="section-picker" aria-label="Экран макета">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selection.section === item.id}
              onClick={() => update({ section: item.id })}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <div className="view-controls">
          <button
            type="button"
            className="compare-button"
            aria-pressed={compare}
            onClick={() => setCompare((value) => !value)}
          >
            {compare ? 'Один вариант' : 'Сравнить три'}
          </button>
          <div className="device-picker">
            <button type="button" aria-label="Широкий экран" aria-pressed={!mobile} onClick={() => setMobile(false)}>
              <Monitor size={17} />
            </button>
            <button type="button" aria-label="Мобильный экран" aria-pressed={mobile} onClick={() => setMobile(true)}>
              <Smartphone size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="preview-description">
        <div>
          <span className="description-index">0{directions.indexOf(direction) + 1}</span>
          <strong>{direction.name}</strong>
          <ChevronRight size={12} />
          <span>{section.name}</span>
        </div>
        <a
          href={`?direction=${selection.direction}&section=${selection.section}&capture=1`}
          target="_blank"
          rel="noreferrer"
        >
          Открыть отдельно <ArrowUpRight size={14} />
        </a>
      </div>
      <div className={`previews ${mobile ? 'mobile-preview' : ''}`}>
        {(compare ? directions : [direction]).map((item) => (
          <section className="preview-item" key={item.id}>
            {compare && (
              <div className="comparison-title">
                <strong>{item.name}</strong>
                <span>{item.subtitle}</span>
              </div>
            )}
            {renderProduct(item.id)}
          </section>
        ))}
      </div>
      <div className="direction-explanation">
        <div>
          <span className="gallery-eyebrow">Что меняется</span>
          <p>{direction.description}</p>
        </div>
        <div>
          <span className="gallery-eyebrow">Что остаётся</span>
          <p>Зелёная палитра, персиковый акцент, структура данных и привычные действия.</p>
        </div>
      </div>
      <footer className="gallery-footer">
        <span>Макеты, не готовая функциональность. Все данные вымышлены.</span>
        <span>3 направления × 3 раздела</span>
      </footer>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(new URLSearchParams(location.search).get('reference') === 'gold' ? <GoldReference /> : <Gallery />)
