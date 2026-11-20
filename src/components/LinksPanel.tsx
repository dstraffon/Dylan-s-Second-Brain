import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { Category, LinkItem, LinkKind } from '../types'
import { usePersisted } from '../lib/storage'
import { confirmDelete } from '../lib/confirm'
import { timeAgo } from '../lib/dates'
import { uid } from '../lib/id'
import { detectKind, fetchVideoTitle, hostOf, parseLinkInput, titleFromUrl } from '../lib/links'
import { Card, type FocusProps } from './Card'
import { ALL, CategoryBar, NONE, categoryForNew, matchesFilter } from './CategoryBar'

type Sort = 'newest' | 'oldest' | 'category'
type KindFilter = 'all' | LinkKind
type View = 'columns' | 'list'

export function LinksPanel(focus: FocusProps) {
  const [links, setLinks] = usePersisted<LinkItem[]>('links', [])
  const [cats, setCats] = usePersisted<Category[]>('linkCategories', [])
  const [filter, setFilter] = usePersisted<string>('ui:linkFilter', ALL)
  const [sort, setSort] = usePersisted<Sort>('ui:linkSort', 'newest')
  const [kind, setKind] = usePersisted<KindFilter>('ui:linkKind', 'all')
  const [view, setView] = usePersisted<View>('ui:linkView', 'columns')
  const [showRead, setShowRead] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const q = focus.expanded ? query.trim().toLowerCase() : ''

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const catOf = (l: LinkItem) => (l.categoryId && catById.has(l.categoryId) ? l.categoryId : null)

  const unread = links.filter((l) => !l.readAt)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of links) if (!l.readAt) c[catOf(l) ?? NONE] = (c[catOf(l) ?? NONE] ?? 0) + 1
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, catById])

  const board = !!focus.expanded && view === 'columns'
  // The board already groups by category, so "By category" falls back to newest there.
  const sortBy: Sort = board && sort === 'category' ? 'newest' : sort

  const shown = useMemo(() => {
    const list = links.filter(
      (l) => (showRead ? !!l.readAt : !l.readAt) && (board || matchesFilter(catOf(l), filter)) && (kind === 'all' || l.kind === kind) &&
        (!q || `${l.title} ${l.url}`.toLowerCase().includes(q)),
    )
    const byDate = (a: LinkItem, b: LinkItem) => b.createdAt.localeCompare(a.createdAt)
    if (sortBy === 'oldest') list.sort((a, b) => -byDate(a, b))
    else if (sortBy === 'category') {
      const order = new Map(cats.map((c, i) => [c.id, i]))
      list.sort((a, b) => (order.get(catOf(a) ?? '') ?? 999) - (order.get(catOf(b) ?? '') ?? 999) || byDate(a, b))
    } else list.sort(byDate)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, showRead, filter, kind, sortBy, cats, catById, q, board])

  const add = () => {
    const parsed = parseLinkInput(text)
    if (!parsed) {
      setError('That doesn’t look like a link.')
      return
    }
    if (links.some((l) => l.url === parsed.url && !l.readAt)) {
      setError('Already on your list.')
      return
    }
    const k = detectKind(parsed.url)
    const item: LinkItem = {
      id: uid(),
      url: parsed.url,
      title: parsed.title || titleFromUrl(parsed.url),
      kind: k,
      categoryId: categoryForNew(filter),
      createdAt: new Date().toISOString(),
      readAt: null,
    }
    setLinks((ls) => [item, ...ls])
    setText('')
    setError('')
    if (k === 'video' && !parsed.title) {
      fetchVideoTitle(parsed.url).then((t) => {
        if (t) setLinks((ls) => ls.map((l) => (l.id === item.id ? { ...l, title: t } : l)))
      })
    }
  }

  const update = (id: string, patch: Partial<LinkItem>) => setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const readCount = links.length - unread.length

  // ---- Board: one column per category, drag a card's grip to another column to recategorize ----
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; dx: number; dy: number; w: number; over: string | null } | null>(null)
  const colKey = (l: LinkItem) => catOf(l) ?? NONE
  const columns = useMemo(() => {
    const keys = filter === ALL || !board ? [...cats.map((c) => c.id), NONE] : [filter]
    return keys
      .map((key) => ({ key, cat: catById.get(key), items: shown.filter((l) => colKey(l) === key) }))
      .filter((c) => c.key !== NONE || c.items.length > 0 || !!drag || cats.length === 0 || filter === NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats, catById, shown, filter, board, !!drag])

  const moveTo = (id: string, key: string) => update(id, { categoryId: key === NONE ? null : key })
  const colAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null)?.dataset.col ?? null

  const grip = (l: LinkItem) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const card = e.currentTarget.closest('.link') as HTMLElement
      const r = card.getBoundingClientRect()
      setDrag({ id: l.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, over: colKey(l) })
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.id !== l.id) return
      const b = boardRef.current
      if (b) {
        // Near the board's left/right edge, scroll it so far columns can be reached (phones, many categories).
        const r = b.getBoundingClientRect()
        if (e.clientX > r.right - 48) b.scrollLeft += 14
        else if (e.clientX < r.left + 48) b.scrollLeft -= 14
      }
      setDrag({ ...drag, x: e.clientX, y: e.clientY, over: colAt(e.clientX, e.clientY) })
    },
    onPointerUp: () => {
      if (drag && drag.over && drag.over !== colKey(l)) moveTo(l.id, drag.over)
      setDrag(null)
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const keys = [...cats.map((c) => c.id), NONE]
      const next = keys[keys.indexOf(colKey(l)) + (e.key === 'ArrowLeft' ? -1 : 1)]
      if (!next) return
      moveTo(l.id, next)
      requestAnimationFrame(() => {
        const g = document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(l.id)}"]`)
        g?.focus()
        g?.closest('.link')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    },
  })

  const row = (l: LinkItem, opts: { header?: boolean; inBoard?: boolean } = {}) => {
    const cat = catOf(l) ? catById.get(catOf(l)!) : undefined
    return (
      <li key={l.id} className="link-group-item">
        {opts.header && <div className="group-label">{cat?.name ?? 'Uncategorized'}</div>}
        <div className={`link ${l.readAt ? 'read' : ''} ${opts.inBoard ? 'board-card' : ''} ${drag?.id === l.id ? 'lifted' : ''}`}>
          {opts.inBoard && (
            <button
              type="button"
              className="drag-handle"
              data-grip={l.id}
              aria-label={`Move ${l.title} to another category. Drag, or use the left and right arrow keys.`}
              title="Drag to another column"
              {...grip(l)}
            >
              <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
                {[3, 8, 13].map((y) => (
                  <g key={y}>
                    <circle cx="2.5" cy={y} r="1.4" />
                    <circle cx="7.5" cy={y} r="1.4" />
                  </g>
                ))}
              </svg>
            </button>
          )}
          <button
            className={`kind ${l.kind}`}
            title="Tap to switch between article and video"
            onClick={() => update(l.id, { kind: l.kind === 'video' ? 'article' : 'video' })}
          >
            {l.kind === 'video' ? '▶' : '¶'}
          </button>
          <div className="link-body">
            <a href={l.url} target="_blank" rel="noreferrer noopener">
              {l.title}
            </a>
            <div className="meta">
              <span className="muted">{hostOf(l.url)}</span>
              <span className="muted">· {timeAgo(l.createdAt)}</span>
              {cat && !opts.inBoard && (
                <span className="tag" style={{ '--chip': cat.color } as CSSProperties}>
                  {cat.name}
                </span>
              )}
            </div>
          </div>
          <div className="row-actions always">
            {!opts.inBoard && (
              <select
                aria-label="Category"
                className="cat-select"
                value={catOf(l) ?? ''}
                onChange={(e) => update(l.id, { categoryId: e.target.value || null })}
              >
                <option value="">No category</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {l.readAt ? (
              <>
                <button className="btn small" onClick={() => update(l.id, { readAt: null })}>
                  Unread
                </button>
                <button
                  className="icon-btn subtle"
                  aria-label="Delete link"
                  onClick={() =>
                    confirmDelete({
                      title: 'Delete this link?',
                      name: l.title,
                      onConfirm: () => setLinks((ls) => ls.filter((x) => x.id !== l.id)),
                    })
                  }
                >
                  ×
                </button>
              </>
            ) : (
              <button
                className={`btn small ${opts.inBoard ? 'done-mini' : ''}`}
                title="Mark as done"
                aria-label={opts.inBoard ? `Mark ${l.title} as done` : undefined}
                onClick={() => update(l.id, { readAt: new Date().toISOString() })}
              >
                ✓{opts.inBoard ? '' : ' Done'}
              </button>
            )}
          </div>
        </div>
      </li>
    )
  }
  const dragged = drag ? links.find((l) => l.id === drag.id) : undefined

  return (
    <Card
      title={
        <>
          Read / watch later <span className="muted small">{unread.length}</span>
        </>
      }
      className="links"
      id="links"
      foldId="links"
      {...focus}
    >
      <CategoryBar
        categories={cats}
        onChange={setCats}
        selected={filter}
        onSelect={setFilter}
        counts={counts}
        noun="link"
        onDelete={(id) => setLinks((ls) => ls.map((l) => (l.categoryId === id ? { ...l, categoryId: null } : l)))}
      />
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          id="quick-link"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          placeholder="Paste a link (optionally with a title)…"
          autoComplete="off"
          inputMode="url"
          enterKeyHint="done"
        />
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Save
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        {focus.expanded && (
          <div className="seg" role="group" aria-label="Layout">
            {(['columns', 'list'] as const).map((v) => (
              <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'columns' ? 'Columns' : 'List'}
              </button>
            ))}
          </div>
        )}
        <div className="seg">
          {(['all', 'article', 'video'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'article' ? 'Articles' : 'Videos'}
            </button>
          ))}
        </div>
        <select aria-label="Sort links" value={sortBy} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          {!board && <option value="category">By category</option>}
        </select>
        <button className={`chip ghost small ${showRead ? 'on' : ''}`} onClick={() => setShowRead((s) => !s)}>
          {showRead ? 'Back to unread' : `Read (${readCount})`}
        </button>
        {focus.expanded && (
          <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links…" aria-label="Search links" />
        )}
      </div>

      {board ? (
        <div className={`link-board ${drag ? 'is-dragging' : ''}`} ref={boardRef}>
          {columns.map((c) => (
            <section
              key={c.key}
              className={`link-col ${drag?.over === c.key ? 'drop-over' : ''}`}
              data-col={c.key}
              style={{ '--chip': c.cat?.color ?? 'var(--muted)' } as CSSProperties}
              aria-label={c.cat?.name ?? 'Uncategorized'}
            >
              <header className="link-col-head">
                <span className="dot" aria-hidden />
                <span className="link-col-name">{c.cat?.name ?? 'Uncategorized'}</span>
                <span className="muted small">{c.items.length}</span>
              </header>
              <ul className="link-list">{c.items.map((l) => row(l, { inBoard: true }))}</ul>
              {c.items.length === 0 && <p className="link-col-empty">{drag ? 'Drop here' : 'Nothing here yet'}</p>}
            </section>
          ))}
        </div>
      ) : (
        <ul className={`link-list ${focus.expanded ? 'grid' : ''}`}>
          {shown.map((l, i) => row(l, { header: sortBy === 'category' && (i === 0 || catOf(shown[i - 1]) !== catOf(l)) }))}
        </ul>
      )}
      {drag && dragged && (
        <div className="link-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }} aria-hidden>
          <span className={`kind ${dragged.kind}`}>{dragged.kind === 'video' ? '▶' : '¶'}</span>
          <span className="link-ghost-title">{dragged.title}</span>
        </div>
      )}
      {shown.length === 0 && !board && (
        <p className="empty">{showRead ? 'Nothing marked as read yet.' : 'Nothing saved. Paste a link above.'}</p>
      )}
    </Card>
  )
}
