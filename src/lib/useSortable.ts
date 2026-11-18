import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Drag to reorder a vertical list, with mouse, pen or touch.
 *
 * Put `listRef` on the list, `data-sort-id` on each row, and spread
 * `handleProps(id)` on a grip inside the row. The grip uses
 * `touch-action: none`, so on a phone a drag starts right away on the grip
 * while swiping anywhere else still scrolls. Arrow keys on a focused grip
 * move the row too.
 *
 * During a drag, `order` is the live preview. `onCommit` gets the new id
 * order once, when the row is dropped somewhere new.
 */
export function useSortable(ids: string[], onCommit: (ids: string[]) => void) {
  const listRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null)
  const live = useRef({ y: 0, grabDy: 0, raf: 0, order: [] as string[], id: '' })
  const prevTops = useRef<Map<string, number> | null>(null)
  const order = drag ? drag.order : ids

  const row = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-sort-id="${CSS.escape(id)}"]`) ?? null

  const snapshotTops = () => {
    const m = new Map<string, number>()
    for (const id of live.current.order) {
      const el = row(id)
      if (el) m.set(id, el.offsetTop)
    }
    prevTops.current = m
  }

  /** Keep the dragged row under the pointer and move the others out of its way. */
  const place = useCallback(() => {
    const ul = listRef.current
    const { id, order: cur, y, grabDy } = live.current
    const el = id ? row(id) : null
    if (!ul || !el) return
    const top = y - ul.getBoundingClientRect().top - grabDy
    el.style.transform = `translateY(${top - el.offsetTop}px)`

    const center = top + el.offsetHeight / 2
    const others = cur.filter((x) => x !== id)
    const first = row(cur[0])
    let acc = first ? first.offsetTop : 0
    let idx = 0
    for (const o of others) {
      const h = row(o)?.offsetHeight ?? 0
      if (acc + h / 2 < center) idx++
      acc += h
    }
    if (cur.indexOf(id) !== idx || cur.indexOf(id) === -1) {
      const next = [...others.slice(0, idx), id, ...others.slice(idx)]
      if (next.join() !== cur.join()) {
        snapshotTops()
        live.current.order = next
        setDrag({ id, order: next })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After a live reorder: re-pin the dragged row and slide the others into their new spots.
  useLayoutEffect(() => {
    if (!drag) return
    place()
    const before = prevTops.current
    prevTops.current = null
    if (!before) return
    for (const id of drag.order) {
      if (id === drag.id) continue
      const el = row(id)
      const was = before.get(id)
      if (!el || was == null) continue
      const dy = was - el.offsetTop
      if (!dy) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${dy}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform 150ms ease'
        el.style.transform = ''
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const finish = (commit: boolean) => {
    const { id, order: cur } = live.current
    cancelAnimationFrame(live.current.raf)
    const el = row(id)
    if (el) {
      el.style.transform = ''
      el.style.transition = ''
    }
    live.current.id = ''
    document.body.classList.remove('sorting')
    setDrag(null)
    if (commit && cur.join() !== ids.join()) onCommit(cur)
  }

  const onPointerDown = (id: string) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || live.current.id) return
    const el = row(id)
    if (!el) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture?.(e.pointerId)
    live.current = { y: e.clientY, grabDy: e.clientY - el.getBoundingClientRect().top, raf: 0, order: ids, id }
    document.body.classList.add('sorting')
    setDrag({ id, order: ids })

    // Scroll the page when the row is dragged near the top or bottom edge.
    const edge = () => {
      const { y } = live.current
      const zone = 70
      const v = y < zone ? -(zone - y) / 5 : y > window.innerHeight - zone ? (y - (window.innerHeight - zone)) / 5 : 0
      if (v) {
        window.scrollBy(0, v)
        place()
      }
      live.current.raf = requestAnimationFrame(edge)
    }
    live.current.raf = requestAnimationFrame(edge)

    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      live.current.y = ev.clientY
      place()
    }
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      finish(ev.type === 'pointerup')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const i = ids.indexOf(id)
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return
    const next = [...ids]
    next.splice(i, 1)
    next.splice(j, 0, id)
    onCommit(next)
    requestAnimationFrame(() => row(id)?.querySelector<HTMLElement>('.drag-handle')?.focus())
  }

  const handleProps = (id: string) => ({
    onPointerDown: onPointerDown(id),
    onKeyDown: onKeyDown(id),
  })

  return { listRef, order, dragId: drag?.id ?? null, handleProps }
}
