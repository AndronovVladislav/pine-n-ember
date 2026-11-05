import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, Columns3, Wallet } from 'lucide-react'
import { Board } from './Board'
import { Knowledge } from './Knowledge'
import { Finance } from './Finance'
import './legacy.css'
import './style.css'
import './motion.css'

function subscribe(callback: () => void): () => void {
  addEventListener('hashchange', callback)
  return () => removeEventListener('hashchange', callback)
}
function App() {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const taskId = hash.match(/^#\/tasks?\/([^/]+)$/)?.[1]
  const categoryId = hash.match(/^#\/finance\/categories\/([^/]+)$/)?.[1]
  const section = hash.startsWith('#/knowledge') ? 'knowledge' : hash.startsWith('#/finance') ? 'finance' : 'board'
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          Pine <span>&</span> Ember
        </div>
        <p>Личное пространство</p>
        <nav aria-label="Разделы приложения">
          {[
            { key: 'board', name: 'Трекер', href: '#', Icon: Columns3 },
            { key: 'knowledge', name: 'База знаний', href: '#/knowledge', Icon: BookOpen },
            { key: 'finance', name: 'Финансы', href: '#/finance', Icon: Wallet },
          ].map(({ key, name, href, Icon }) => (
            <a key={key} href={href} aria-current={section === key ? 'page' : undefined}>
              <Icon size={17} />
              {name}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">В своём ритме.</div>
      </aside>
      <main className="workspace">
        <div className="page-stage" key={section}>
          {section === 'board' ? (
            <Board taskId={taskId} />
          ) : section === 'knowledge' ? (
            <Knowledge />
          ) : (
            <Finance categoryId={categoryId} />
          )}
        </div>
      </main>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
