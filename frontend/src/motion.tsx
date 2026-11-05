import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

const preference = matchMedia('(prefers-reduced-motion: reduce)')
const travel = { duration: 240, easing: 'cubic-bezier(0.45, 0, 0.1, 1)' }

function subscribe(callback: () => void): () => void {
  preference.addEventListener('change', callback)
  return () => preference.removeEventListener('change', callback)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => preference.matches)
}

export function useBoardMotion(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const previous = useRef(new Map<string, { x: number; y: number; node: HTMLElement }>())
  const animations = useRef<Animation[]>([])
  const flights = useRef(new Map<string, HTMLElement>())
  const cleanups = useRef(new Set<() => void>())
  const initialized = useRef(false)
  function stop(): void {
    animations.current.forEach((animation) => animation.cancel())
    animations.current = []
    for (const cleanup of [...cleanups.current]) cleanup()
  }

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return

    const oldPositions = new Map<string, { x: number; y: number }>()
    for (const [key, position] of previous.current) {
      const visual = flights.current.get(key) ?? position.node
      const transform = visual.isConnected ? getComputedStyle(visual).transform : 'none'
      const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform)
      oldPositions.set(key, { x: position.x + matrix.m41, y: position.y + matrix.m42 })
    }
    stop()
    const bounds = root.getBoundingClientRect()
    const unclipped = [...root.querySelectorAll<HTMLElement>('.cards')].filter(
      (list) => list.scrollHeight <= list.clientHeight + 1,
    )
    const next = new Map<string, { x: number; y: number; node: HTMLElement }>()
    for (const node of root.querySelectorAll<HTMLElement>('[data-motion-key]')) {
      const key = node.dataset.motionKey!
      const rect = node.getBoundingClientRect()
      const position = { x: rect.left - bounds.left, y: rect.top - bounds.top, node }
      next.set(key, position)
      const old = oldPositions.get(key)

      if (!reduced && initialized.current) {
        if (old && (Math.abs(old.x - position.x) > 0.5 || Math.abs(old.y - position.y) > 0.5)) {
          let visual = node

          if (previous.current.get(key)?.node !== node || Math.abs(old.x - position.x) > 0.5) {
            // Копия летит вне прокручиваемой области; настоящий элемент сохраняет место и семантику.
            const ghost = node.cloneNode(true) as HTMLElement
            ghost.removeAttribute('data-motion-key')
            ghost.setAttribute('aria-hidden', 'true')
            ghost.inert = true
            Object.assign(ghost.style, {
              position: 'fixed',
              left: `${rect.left}px`,
              top: `${rect.top}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              margin: '0',
              pointerEvents: 'none',
              zIndex: '4',
            })
            document.body.append(ghost)
            const visibility = node.style.visibility
            node.style.visibility = 'hidden'
            flights.current.set(key, ghost)
            let active = true
            const cleanup = (): void => {
              if (!active) return

              active = false
              node.style.visibility = visibility
              ghost.remove()
              flights.current.delete(key)
              cleanups.current.delete(cleanup)
            }
            cleanups.current.add(cleanup)
            visual = ghost
          }

          animations.current.push(
            visual.animate(
              [
                { transform: `translate(${old.x - position.x}px, ${old.y - position.y}px)` },
                { transform: 'translate(0, 0)' },
              ],
              travel,
            ),
          )
        } else if (!old) {
          animations.current.push(
            node.animate(
              [
                { opacity: 0, transform: 'translateY(6px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              travel,
            ),
          )
        }
      }
    }
    if (animations.current.length) {
      for (const list of unclipped) {
        const overflow = list.style.overflow
        list.style.overflow = 'visible'
        const cleanup = (): void => {
          list.style.overflow = overflow
          cleanups.current.delete(cleanup)
        }
        cleanups.current.add(cleanup)
      }
      const running = animations.current
      void Promise.all(running.map((animation) => animation.finished.catch(() => {}))).then(() => {
        if (animations.current === running) {
          for (const cleanup of [...cleanups.current]) cleanup()
        }
      })
    }

    previous.current = next
    initialized.current = true
  }, [key, reduced])
  useLayoutEffect(() => {
    const root = ref.current

    if (!root) return

    const board = root
    function remember(): void {
      stop()
      const bounds = board.getBoundingClientRect()
      for (const node of board.querySelectorAll<HTMLElement>('[data-motion-key]')) {
        const rect = node.getBoundingClientRect()
        previous.current.set(node.dataset.motionKey!, {
          x: rect.left - bounds.left,
          y: rect.top - bounds.top,
          node,
        })
      }
    }
    let width = root.clientWidth
    const observer = new ResizeObserver(() => {
      if (width === root.clientWidth) return

      width = root.clientWidth
      remember()
    })
    observer.observe(root)
    document.addEventListener('scroll', remember, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('scroll', remember, true)
    }
  }, [key])
  useLayoutEffect(
    () => () => {
      stop()
    },
    [],
  )
  return ref
}

export function useReveal(key: string) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const changed = last.current !== key
    last.current = key

    if (reduced || !changed || !ref.current) return

    const animation = ref.current.animate(
      [
        { opacity: 0.4, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'ease-out' },
    )
    return () => animation.cancel()
  }, [key, reduced])
  return ref
}

export function ChangingValue({ value }: { value: string }) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState({ current: value, previous: value })
  const current = useRef<HTMLSpanElement>(null)
  const previous = useRef<HTMLSpanElement>(null)

  if (display.current !== value) {
    setDisplay({ current: value, previous: display.current })
  }

  useLayoutEffect(() => {
    if (display.previous === display.current) return

    if (reduced) {
      setDisplay({ current: value, previous: value })
      return
    }

    let cancelled = false
    const options = { duration: 320, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' }
    const incoming = current.current!.animate(
      [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      options,
    )
    const outgoing = previous.current!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], {
      ...options,
      fill: 'forwards',
    })
    void incoming.finished
      .then(() => {
        if (!cancelled) setDisplay({ current: value, previous: value })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      incoming.cancel()
      outgoing.cancel()
    }
  }, [display, reduced, value])
  return (
    <span className="motion-value">
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="motion-value-track">
        {display.previous !== display.current && (
          <span ref={previous} className="motion-value-previous">
            {display.previous}
          </span>
        )}
        <span ref={current}>{value}</span>
      </span>
    </span>
  )
}

export function ButtonLabel({ pending, idle }: { pending: boolean; idle: string }) {
  return (
    <span className="button-label">
      <span aria-hidden={pending}>{idle}</span>
      <span aria-hidden={!pending}>Сохранение…</span>
    </span>
  )
}
