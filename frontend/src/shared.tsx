import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Pencil, Trash2, X } from 'lucide-react'
import { ApiError } from './api'
import { ButtonLabel, useReducedMotion } from './motion'

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return 'Запись не найдена.'
  if (error instanceof ApiError && error.status === 502) return 'Не удалось получить курс валют. Попробуйте позже.'
  if (error instanceof ApiError && [400, 422].includes(error.status)) return 'Проверьте введённые данные.'
  return 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Работаем без сохранения настроек. */
  }
}

export function useRemote<T>(key: string, loader: () => Promise<T>, keepPrevious = false) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useRef(loader)
  load.current = loader
  const generation = useRef(0)
  const refresh = useCallback(async (): Promise<void> => {
    const current = ++generation.current
    setLoading(true)
    setError('')
    try {
      const result = await load.current()
      if (current === generation.current) setData(result)
    } catch (cause) {
      if (current === generation.current) setError(errorMessage(cause))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!keepPrevious) setData(null)

    void refresh()
    return () => {
      generation.current++
    }
  }, [key, refresh, keepPrevious])
  return { data, error, loading, refresh }
}

export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (locked.current) return false
    locked.current = true
    setPending(true)
    setError('')
    try {
      await action()
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      locked.current = false
      setPending(false)
    }
  }
  return { pending, error, run }
}

export function LoadState({ error, loading, retry }: { error: string; loading: boolean; retry: () => void }) {
  return (
    <>
      {loading && <p role="status">Загрузка…</p>}
      {error && (
        <div role="alert" className="error-note">
          {error}{' '}
          <button className="btn" onClick={retry}>
            Повторить
          </button>
        </div>
      )}
    </>
  )
}

export function Dialog({
  title,
  children,
  close,
  busy = false,
}: {
  title: string
  children: ReactNode | ((dismiss: () => void, closing: boolean) => ReactNode)
  close: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const reduced = useReducedMotion()
  const [closing, setClosing] = useState(false)
  const requested = useRef(false)
  const mounted = useRef(false)
  const onClose = useRef(close)
  onClose.current = close
  function dismiss(): void {
    if (!mounted.current || requested.current) return

    requested.current = true

    if (reduced) {
      onClose.current()
      return
    }

    setClosing(true)
  }
  useLayoutEffect(() => {
    mounted.current = true
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    dialog.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      mounted.current = false
      dialog.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  useLayoutEffect(() => {
    if (!closing) return

    let cancelled = false
    const animations = reduced ? [] : ref.current!.getAnimations()
    void Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
      if (!cancelled) onClose.current()
    })
    return () => {
      cancelled = true
    }
  }, [closing, reduced])
  return (
    <dialog
      ref={ref}
      className="app-dialog"
      data-closing={closing || undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) dismiss()
      }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (
          !busy &&
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          dismiss()
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Закрыть" disabled={busy || closing} onClick={dismiss}>
          <X size={18} />
        </button>
      </div>
      {typeof children === 'function' ? children(dismiss, closing) : children}
    </dialog>
  )
}

export function FormDialog({
  title,
  close,
  save,
  children,
  submit = 'Сохранить',
}: {
  title: string
  close: () => void
  save: (values: FormData) => Promise<void>
  children: ReactNode
  submit?: string
}) {
  const action = useAction()
  function onSubmit(event: FormEvent<HTMLFormElement>, dismiss: () => void): void {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    void action.run(async () => {
      await save(values)
      dismiss()
    })
  }
  return (
    <Dialog title={title} close={close} busy={action.pending}>
      {(dismiss, closing) => (
        <form
          onSubmit={(event) => {
            if (!closing) onSubmit(event, dismiss)
            else event.preventDefault()
          }}
        >
          <fieldset disabled={action.pending || closing}>{children}</fieldset>
          {action.error && (
            <p role="alert" className="error-note">
              {action.error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" disabled={action.pending || closing} onClick={dismiss}>
              Отмена
            </button>
            <button className="btn primary" disabled={action.pending || closing}>
              <ButtonLabel pending={action.pending} idle={submit} />
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function Field({
  label,
  name,
  value = '',
  multiline = false,
  required = false,
}: {
  label: string
  name: string
  value?: string
  multiline?: boolean
  required?: boolean
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} name={name} defaultValue={value} rows={10} required={required} />
      ) : (
        <input id={id} name={name} defaultValue={value} required={required} />
      )}
    </div>
  )
}
export const text = (values: FormData, name: string): string => String(values.get(name) ?? '').trim()

export function EditButtons({ name, edit, remove }: { name: string; edit: () => void; remove: () => void }) {
  return (
    <span className="edit-actions">
      <button className="icon-button" aria-label={`Редактировать ${name}`} onClick={edit}>
        <Pencil size={13} />
      </button>
      <button className="icon-button" aria-label={`Удалить ${name}`} onClick={remove}>
        <Trash2 size={13} />
      </button>
    </span>
  )
}

export function useAlign(key: string) {
  const [value, update] = useState(() => {
    const saved = readStorage(key)
    return saved === 'center' || saved === 'right' ? saved : 'left'
  })
  const set = (next: string): void => {
    update(next)
    writeStorage(key, next)
  }
  return { value, set }
}
export function Align({ value, set }: { value: string; set: (next: string) => void }) {
  return (
    <div className="align-control" role="group" aria-label="Выравнивание">
      {[
        ['left', 'По левому краю', AlignLeft],
        ['center', 'По центру', AlignCenter],
        ['right', 'По правому краю', AlignRight],
      ].map(([key, label, Icon]) => {
        const Glyph = Icon as typeof AlignLeft
        return (
          <button
            key={String(key)}
            className={`align-btn ${value === key ? 'active' : ''}`}
            aria-label={String(label)}
            aria-pressed={value === key}
            onClick={() => set(String(key))}
          >
            <Glyph size={15} />
          </button>
        )
      })}
    </div>
  )
}

export function reorder(keys: string[], source: string, target: string): string[] {
  const result = keys.filter((key) => key !== source)
  result.splice(result.indexOf(target), 0, source)
  return result
}
