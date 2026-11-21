import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import {
  addColumn,
  fitColumns,
  groupColumns,
  MAX_COLUMNS,
  MIN_RESIZE,
  moveTile,
  removeColumn,
  setHidden,
  type DashLayout,
} from '../lib/dashboardLayout'
import { confirmDelete } from '../lib/confirm'
import { MODULES, moduleById, type ModuleContext } from './modules'

type Update = (fn: (l: DashLayout) => DashLayout) => void

const gapFor = () => (window.innerWidth >= 1500 ? 16 : 14)

/** The default widths for the original three columns: Tasks, Notes, and the side rail. */
function defaultTracks(n: number): string[] | null {
  if (n !== 3) return null
  return window.innerWidth >= 1500
    ? ['minmax(0, 1.15fr)', 'minmax(0, 1fr)', 'minmax(360px, 440px)']
    : ['minmax(0, 1.2fr)', 'minmax(0, 1fr)', 'minmax(0, 0.9fr)']
}

interface Drag {
  id: string
  /** Shown column and position (among the other tiles there) it would drop at. */
  col: number
  index: number
  x: number
  y: number
  w: number
}

/**
 * The dashboard: columns of tiles from the module registry, arranged by the
 * saved layout. In arrange mode (`editing`) tiles get a handle to drag them
 * between and within columns, a button to hide them, and the gaps between
 * columns become dividers to resize them, the same way as the divider inside
 * a project.
 *
 * On narrower screens the saved columns fold together (see groupColumns), so
 * one layout works from a phone to a 1920 monitor. Resizing only happens when
 * every column fits side by side; on a phone, arranging is reorder and hide.
 */
export function Dashboard(props: { tileCtx: (id: string) => ModuleContext; layout: DashLayout; update: Update; editing: boolean; onDone: () => void; onSettings: () => void }) {
  const { layout, update, editing, tileCtx } = props
  const ref = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(() => Math.min(window.innerWidth, 1880) - 48)
  const [gap, setGap] = useState(gapFor)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [resizing, setResizing] = useState(false)
  const refocus = useRef<string | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      setWidth(el.clientWidth)
      setGap(gapFor())
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!refocus.current) return
    ref.current?.querySelector<HTMLElement>(`[data-grip="${refocus.current}"]`)?.focus()
    refocus.current = null
  })

  const hidden = new Set(layout.hidden)
  const visibleIn = (ci: number) => layout.columns[ci].filter((id) => !hidden.has(id))
  // Columns with nothing showing take no room, except while arranging (so tiles can be dropped there).
  const shown = layout.columns.map((_, i) => i).filter((i) => editing || visibleIn(i).length > 0)
  const k = Math.min(shown.length, fitColumns(width, gap))
  const groups = groupColumns(shown.length, k).map((g) => g.map((j) => shown[j]))
  const merged = groups.length < shown.length
  const canResize = editing && !merged && groups.length > 1
  const canAddColumn = editing && !merged && layout.columns.length < MAX_COLUMNS && fitColumns(width, gap) > layout.columns.length

  let tracks: string[]
  if (merged || !groups.length) tracks = groups.map(() => 'minmax(0, 1fr)')
  else if (layout.widths) tracks = shown.map((i) => `minmax(0, ${layout.widths![i]}fr)`)
  else tracks = (shown.length === layout.columns.length && defaultTracks(shown.length)) || shown.map(() => 'minmax(0, 1fr)')
  const template = tracks.join(` ${gap}px `)

  const tilesIn = (g: number) => groups[g].flatMap(visibleIn)

  const move = (id: string, g: number, index: number) => {
    update((l) => moveTile(l, id, groups[g], index))
  }

  /* ---------- dragging a tile ---------- */
  const target = (x: number, y: number, id: string) => {
    const cols = [...(ref.current?.querySelectorAll<HTMLElement>(':scope > .dash-col') ?? [])]
    if (!cols.length) return null
    let col = 0
    let best = Infinity
    cols.forEach((c, i) => {
      const r = c.getBoundingClientRect()
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      if (d < best) {
        best = d
        col = i
      }
    })
    const tiles = [...cols[col].querySelectorAll<HTMLElement>(':scope > .dash-mod')].filter((t) => t.dataset.mod !== id)
    let index = 0
    for (const t of tiles) {
      const r = t.getBoundingClientRect()
      if (r.top + r.height / 2 < y) index++
    }
    return { col, index }
  }

  const onGripDown = (id: string) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || dragRef.current) return
    const tile = e.currentTarget.closest<HTMLElement>('.dash-mod')
    if (!tile) return
    e.preventDefault()
    const rect = tile.getBoundingClientRect()
    const start = target(e.clientX, e.clientY, id)
    if (!start) return
    const d: Drag = { id, ...start, x: e.clientX, y: e.clientY, w: rect.width }
    dragRef.current = d
    setDrag(d)
    document.body.classList.add('sorting')
    let raf = 0
    const set = (x: number, y: number) => {
      const t = target(x, y, id)
      if (!t) return
      dragRef.current = { ...dragRef.current!, ...t, x, y }
      setDrag(dragRef.current)
    }
    const edge = () => {
      const cur = dragRef.current
      if (!cur) return
      const zone = 70
      const v = cur.y < zone ? -(zone - cur.y) / 5 : cur.y > window.innerHeight - zone ? (cur.y - (window.innerHeight - zone)) / 5 : 0
      if (v) {
        window.scrollBy(0, v)
        set(cur.x, cur.y)
      }
      raf = requestAnimationFrame(edge)
    }
    raf = requestAnimationFrame(edge)
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === e.pointerId) set(ev.clientX, ev.clientY)
    }
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      cancelAnimationFrame(raf)
      document.body.classList.remove('sorting')
      const cur = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (ev.type !== 'pointerup' || !cur) return
      if (tilesIn(cur.col).indexOf(id) === cur.index) return
      move(id, cur.col, cur.index)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onGripKey = (id: string, g: number) => (e: KeyboardEvent<HTMLElement>) => {
    const list = tilesIn(g)
    const i = list.indexOf(id)
    let to: [number, number] | null = null
    if (e.key === 'ArrowUp' && i > 0) to = [g, i - 1]
    else if (e.key === 'ArrowDown' && i < list.length - 1) to = [g, i + 1]
    else if (e.key === 'ArrowLeft' && g > 0) to = [g - 1, Math.min(i, tilesIn(g - 1).length)]
    else if (e.key === 'ArrowRight' && g < groups.length - 1) to = [g + 1, Math.min(i, tilesIn(g + 1).length)]
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    if (!to) return
    refocus.current = id
    move(id, to[0], to[1])
  }

  /* ---------- resizing columns ---------- */
  const colWidths = () => [...(ref.current?.querySelectorAll<HTMLElement>(':scope > .dash-col') ?? [])].map((c) => c.getBoundingClientRect().width)
  const saveWidths = (px: number[]) => {
    const total = px.reduce((a, b) => a + b, 0)
    const fr = px.map((w) => Math.round(((w / total) * px.length) * 1000) / 1000)
    update((l) => ({ ...l, widths: fr }))
  }
  const shift = (px: number[], i: number, dx: number) => {
    const out = [...px]
    const pair = px[i] + px[i + 1]
    const a = Math.min(pair - MIN_RESIZE, Math.max(MIN_RESIZE, px[i] + dx))
    out[i] = a
    out[i + 1] = pair - a
    return out
  }
  const onDividerDown = (i: number) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ref.current) return
    e.preventDefault()
    const el = ref.current
    const start = colWidths()
    const x0 = e.clientX
    let px = start
    setResizing(true)
    document.body.classList.add('resizing')
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      px = shift(start, i, ev.clientX - x0)
      el.style.gridTemplateColumns = px.map((w) => `minmax(0, ${w}fr)`).join(` ${gap}px `)
    }
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('resizing')
      setResizing(false)
      el.style.gridTemplateColumns = template
      if (ev.type === 'pointerup' && px !== start) saveWidths(px)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  const onDividerKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 24
    if (e.key === 'ArrowLeft') saveWidths(shift(colWidths(), i, -step))
    else if (e.key === 'ArrowRight') saveWidths(shift(colWidths(), i, step))
    else if (e.key === 'Enter') update((l) => ({ ...l, widths: undefined }))
    else return
    e.preventDefault()
  }

  const resetLayout = () =>
    confirmDelete({
      title: 'Reset the dashboard layout?',
      detail: 'Tiles go back to their original columns and widths. Hidden tiles stay hidden.',
      action: 'Reset',
      onConfirm: () =>
        update((l) => {
          const columns: string[][] = [[], [], []]
          for (const m of MODULES) columns[m.column].push(m.id)
          return { columns, hidden: l.hidden }
        }),
    })

  const hiddenMods = MODULES.filter((m) => hidden.has(m.id))
  const nothing = layout.columns.every((_, i) => visibleIn(i).length === 0)
  const pct = (i: number) => {
    const w = layout.widths
    if (!w) return undefined
    return Math.round((w[shown[i]] / (w[shown[i]] + w[shown[i + 1]])) * 100)
  }

  return (
    <>
      {editing && (
        <div className="arrange-bar" role="region" aria-label="Arrange dashboard">
          <div className="arrange-text">
            <strong>Arrange dashboard</strong>
            <span className="muted small">
              {groups.length <= 1
                ? 'Drag ⠿ to reorder tiles. Column widths are set on a wider screen.'
                : merged
                  ? 'Drag ⠿ to move tiles. Widen the window to resize columns.'
                  : 'Drag ⠿ to move tiles. Drag the lines between columns to resize them.'}
            </span>
          </div>
          {hiddenMods.length > 0 && (
            <div className="arrange-hidden">
              <span className="muted small">Hidden</span>
              {hiddenMods.map((m) => (
                <button key={m.id} className="chip" onClick={() => update((l) => setHidden(l, m.id, false))} title={`Show ${m.name} again`}>
                  + {m.name}
                </button>
              ))}
            </div>
          )}
          <div className="arrange-actions">
            {canAddColumn && (
              <button className="btn small" onClick={() => update(addColumn)}>
                + Column
              </button>
            )}
            <button className="btn small" onClick={resetLayout}>
              Reset
            </button>
            <button className="btn small primary" onClick={props.onDone}>
              Done
            </button>
          </div>
        </div>
      )}
      <main
        ref={ref}
        className={`dashboard ${editing ? 'editing' : ''} ${drag ? 'is-dragging' : ''} ${resizing ? 'is-resizing' : ''}`}
        style={{ gridTemplateColumns: template, '--dash-gap': `${gap}px` } as CSSProperties}
      >
        {nothing && !editing && (
          <div className="dash-nothing">
            <p className="muted">Every tile is hidden.</p>
            <button className="btn" onClick={props.onSettings}>
              Choose tiles in Settings
            </button>
          </div>
        )}
        {groups.flatMap((group, g) => {
          const tiles = tilesIn(g)
          const others = drag ? tiles.filter((x) => x !== drag.id) : tiles
          const dropAt = drag && drag.col === g ? others[drag.index] ?? null : undefined
          const lastFill = [...tiles].reverse()[0]
          const col = (
            <div className="dash-col" key={`col-${group.join('-')}`}>
              {tiles.map((id) => {
                const def = moduleById(id)!
                return [
                  dropAt === id && <div className="dash-drop" key="drop" aria-hidden />,
                  <div
                    key={id}
                    className={`dash-mod ${def.stretch && id === lastFill ? 'fill' : ''} ${drag?.id === id ? 'drag-src' : ''}`}
                    data-mod={id}
                  >
                    {editing && (
                      <div className="dash-mod-bar">
                        <button
                          className="dash-grip"
                          data-grip={id}
                          onPointerDown={onGripDown(id)}
                          onKeyDown={onGripKey(id, g)}
                          aria-label={`Move ${def.name}. Arrow keys move it.`}
                          title="Drag to move"
                        >
                          <span aria-hidden>⠿</span> {def.name}
                        </button>
                        <button className="icon-btn subtle dash-hide" onClick={() => update((l) => setHidden(l, id, true))} aria-label={`Hide ${def.name}`} title="Hide this tile (show it again from Settings)">
                          <EyeOff />
                        </button>
                      </div>
                    )}
                    <div className="dash-mod-body" inert={editing}>
                      {def.tile(tileCtx(id))}
                    </div>
                  </div>,
                ]
              })}
              {dropAt === null && <div className="dash-drop" key="drop-end" aria-hidden />}
              {editing && tiles.length === 0 && (
                <div className="dash-empty">
                  <span className="muted small">Drop a tile here</span>
                  {!merged && layout.columns.length > 1 && group.length === 1 && (
                    <button className="btn small" onClick={() => update((l) => removeColumn(l, group[0]))}>
                      Remove column
                    </button>
                  )}
                </div>
              )}
            </div>
          )
          if (g === groups.length - 1) return [col]
          return [
            col,
            canResize ? (
              <div
                key={`div-${g}`}
                className="dash-divider split-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize columns"
                aria-valuenow={pct(g)}
                tabIndex={0}
                title="Drag to resize · double-click to reset"
                onPointerDown={onDividerDown(g)}
                onKeyDown={onDividerKey(g)}
                onDoubleClick={() => update((l) => ({ ...l, widths: undefined }))}
              >
                <span className="split-grip" aria-hidden />
              </div>
            ) : (
              <div key={`div-${g}`} aria-hidden />
            ),
          ]
        })}
      </main>
      {drag && (
        <div className="dash-ghost" style={{ left: drag.x - 24, top: drag.y - 20, width: Math.min(drag.w, 360) }} aria-hidden>
          ⠿ {moduleById(drag.id)?.name}
        </div>
      )}
    </>
  )
}

function EyeOff() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      <path
        d="M3 10s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z M10 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z M3.5 3.5l13 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
