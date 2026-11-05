import { useState, type ReactNode } from 'react'
import { ArrowUpRight, Monitor, Smartphone } from 'lucide-react'
import { sections, type Section } from './data'

export function RefinedGallery({
  section,
  onSection,
  product,
}: {
  section: Section
  onSection: (section: Section) => void
  product: ReactNode
}) {
  const [mobile, setMobile] = useState(false)
  const name = sections.find((item) => item.id === section)!.name
  return (
    <div className="gallery refined-gallery">
      <header className="gallery-header">
        <a href="?" className="gallery-brand">
          Pine <span>&</span> Ember
        </a>
        <a className="archive-link" href="?direction=forest&section=finance">
          Предыдущие направления <ArrowUpRight size={14} />
        </a>
      </header>
      <section className="gallery-intro">
        <div className="intro-copy">
          <div className="gallery-eyebrow">Макет по вашему выбору</div>
          <h1>
            Финансы и навигация.
            <br />
            <span>Доска и БЗ — как прежде.</span>
          </h1>
        </div>
        <p>
          Финансы из «Тихого леса», сайдбар из «Рабочего стола» и исходный порядок разделов. Без решений из «Тёплого
          фокуса».
        </p>
      </section>
      <div className="refinement-notes">
        <div>
          <span className="gallery-eyebrow">Финансы</span>
          <strong>Тихий лес</strong>
          <p>Те же сводки, категории, график и форма операции.</p>
        </div>
        <div>
          <span className="gallery-eyebrow">Навигация</span>
          <strong>Рабочий стол</strong>
          <p>Трекер → база знаний → финансы.</p>
        </div>
        <div>
          <span className="gallery-eyebrow">База знаний</span>
          <strong>Текущий дизайн</strong>
          <p>Прежние блоки и карточки. Дополнение — номера понятий.</p>
        </div>
      </div>
      <div className="gallery-controls">
        <nav className="section-picker" aria-label="Экран макета">
          {sections.map((item) => (
            <button type="button" key={item.id} aria-pressed={section === item.id} onClick={() => onSection(item.id)}>
              {item.name}
            </button>
          ))}
        </nav>
        <div className="device-picker">
          <button type="button" aria-label="Широкий экран" aria-pressed={!mobile} onClick={() => setMobile(false)}>
            <Monitor size={17} />
          </button>
          <button type="button" aria-label="Мобильный экран" aria-pressed={mobile} onClick={() => setMobile(true)}>
            <Smartphone size={17} />
          </button>
        </div>
      </div>
      <div className="preview-description">
        <div>
          <strong>Объединённый макет</strong>
          <span>/ {name}</span>
        </div>
        <a href={`?direction=refined&section=${section}&capture=1`} target="_blank" rel="noreferrer">
          Открыть отдельно <ArrowUpRight size={14} />
        </a>
      </div>
      <div className={`previews ${mobile ? 'mobile-preview' : ''}`}>
        <section className="preview-item">{product}</section>
      </div>
      <footer className="gallery-footer">
        <span>Макет · вымышленные данные · без сохранения в приложение</span>
        <span>Уточнённый вариант</span>
      </footer>
    </div>
  )
}
