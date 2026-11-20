import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { Category, LinkItem, LinkKind } from '../types'
import { usePersisted } from '../lib/storage'
import { confirmDelete } from '../lib/confirm'
import { timeAgo } from '../lib/dates'
import { uid } from '../lib/id'
import {
  detectKind,
  faviconOf,
  fetchPreview,
  fetchVideoTitle,
  hostOf,
  isAutoTitle,
  isLater,
  parseLinkInput,
  previewImageOf,
  PREVIEW_VERSION,
  titleFromUrl,
} from '../lib/links'
import { Card, type FocusProps } from './Card'
import { ALL, CategoryBar, NONE, categoryForNew, matchesFilter } from './CategoryBar'

type Sort = 'manual' | 'newest' | 'oldest' | 'category'
type KindFilter = 'all' | LinkKind
type View = 'columns' | 'list'
type Status = 'all' | 'later'
type Drag = { id: string; x: number; y: number; dx: number; dy: number; w: number; over: string | null; index: number }

const SORT_LABEL: Record<Sort, string> = { manual: 'My order', newest: 'Newest first', oldest: 'Oldest first', category: 'By category' }

/** Missing order (links saved before ordering) falls back to newest first, matching new links' -Date.now(). */
const orderKey = (l: LinkItem) => l.order ?? -Date.parse(l.createdAt)

/**
 * Read / watch later on the dashboard; the whole link library in the full view.
 * Every saved link stays in the library. "Read later" is a flag on any link: the tile shows
 * that queue, and Done takes a link off the queue without hiding it from the library.
 */
export function LinksPanel(focus: FocusProps) {
  const expanded = !!focus.expanded
  const [links, setLinks] = usePersisted<LinkItem[]>('links', [])
  const [cats, setCats] = usePersisted<Category[]>('linkCategories', [])
  const [filter, setFilter] = usePersisted<string>('ui:linkFilter', ALL)
  const [tileSort, setTileSort] = usePersisted<Sort>('ui:linkSort', 'newest')
  const [boardSort, setBoardSort] = usePersisted<Sort>('ui:linkBoardSort', 'manual')
  const [kind, setKind] = usePersisted<KindFilter>('ui:linkKind', 'all')
  const [view, setView] = usePersisted<View>('ui:linkView', 'columns')
  const [status, setStatus] = usePersisted<Status>('ui:linkStatus', 'all')
  const [saveLater, setSaveLater] = usePersisted<boolean>('ui:linkSaveLater', true)
  const [showDone, setShowDone] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const q = expanded ? query.trim().toLowerCase() : ''

  const board = expanded && view === 'columns'
  const sort: Sort = expanded ? boardSort : tileSort
  const setSort = expanded ? setBoardSort : setTileSort
  // The board already groups by category, so "By category" falls back to your own order there.
  const sortBy: Sort = board && sort === 'category' ? 'manual' : sort

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const catOf = (l: LinkItem) => (l.categoryId && catById.has(l.categoryId) ? l.categoryId : null)
  const colKey = (l: LinkItem) => catOf(l) ?? NONE

  const queue = links.filter(isLater)
  const doneCount = links.filter((l) => !isLater(l) && l.readAt).length

  /** Links this view covers before the category and search filters: the tile is the queue, the full view is the library. */
  const inScope = (l: LinkItem) =>
    expanded ? status === 'all' || isLater(l) : showDone ? !isLater(l) && !!l.readAt : isLater(l)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of links) if (inScope(l)) c[colKey(l)] = (c[colKey(l)] ?? 0) + 1
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, catById, expanded, status, showDone])

  const shown = useMemo(() => {
    const list = links.filter(
      (l) =>
        inScope(l) &&
        (board || matchesFilter(catOf(l), filter)) &&
        (kind === 'all' || l.kind === kind) &&
        (!q || `${l.title} ${l.url} ${l.note ?? ''} ${l.description ?? ''}`.toLowerCase().includes(q)),
    )
    const byDate = (a: LinkItem, b: LinkItem) => b.createdAt.localeCompare(a.createdAt)
    const catIdx = new Map(cats.map((c, i) => [c.id, i]))
    const cmp = (a: LinkItem, b: LinkItem) => {
      if (showDone && !expanded) return (b.readAt ?? '').localeCompare(a.readAt ?? '')
      const pin = Number(!!b.pinned) - Number(!!a.pinned)
      if (pin) return pin
      if (sortBy === 'oldest') return -byDate(a, b)
      if (sortBy === 'manual') return orderKey(a) - orderKey(b) || byDate(a, b)
      if (sortBy === 'category')
        return (catIdx.get(catOf(a) ?? '') ?? 999) - (catIdx.get(catOf(b) ?? '') ?? 999) || orderKey(a) - orderKey(b)
      return byDate(a, b)
    }
    return list.sort(cmp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, expanded, status, showDone, filter, kind, sortBy, cats, catById, q, board])

  const update = (id: string, patch: Partial<LinkItem>) => setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  /** Links already looked up (or being looked up) this session, so a new link isn't fetched twice. */
  const backfilled = useRef(new Set<string>())

  /** Fill in title, preview image, icon and description. Replaces the title only when we made it up from the URL. */
  const lookup = async (l: LinkItem) => {
    backfilled.current.add(l.id)
    const p = await fetchPreview(l.url)
    let title = p?.title
    if (!title && l.kind === 'video') title = (await fetchVideoTitle(l.url)) ?? undefined
    // Nothing came back at all (offline, slow, rate-limited): leave previewAt unset so it's tried again next visit.
    if (!p && !title) return
    setLinks((ls) =>
      ls.map((x) => {
        if (x.id !== l.id) return x
        const next: LinkItem = { ...x, previewAt: new Date().toISOString(), previewV: PREVIEW_VERSION }
        if (title && isAutoTitle(x)) next.title = title
        if (p?.image) next.image = p.image
        if (p?.icon) next.icon = p.icon
        if (p?.description) next.description = p.description
        return next
      }),
    )
  }

  // Older links get looked up a few at a time while the library is open: ones never looked up, and ones an
  // older lookup left without an image. previewAt / previewV sync, so each link is looked up once across devices.
  useEffect(() => {
    if (!expanded || !navigator.onLine) return
    const todo = links
      .filter((l) => (!l.previewAt || (!l.image && (l.previewV ?? 1) < PREVIEW_VERSION)) && !backfilled.current.has(l.id))
      .slice(0, 6)
    if (!todo.length) return
    let stop = false
    ;(async () => {
      for (const l of todo) {
        if (stop) return
        await lookup(l)
        await new Promise((r) => setTimeout(r, 400))
      }
    })()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, links.length])

  const add = () => {
    const parsed = parseLinkInput(text)
    if (!parsed) {
      setError('That doesn’t look like a link.')
      return
    }
    const toQueue = !expanded || saveLater
    const existing = links.find((l) => l.url === parsed.url)
    if (existing) {
      if (toQueue && !isLater(existing)) {
        update(existing.id, { later: true })
        setText('')
        setError('Already in your library. Moved it back to Read later.')
      } else setError(isLater(existing) ? 'Already on your list.' : 'Already in your library.')
      return
    }
    const item: LinkItem = {
      id: uid(),
      url: parsed.url,
      title: parsed.title || titleFromUrl(parsed.url),
      kind: detectKind(parsed.url),
      categoryId: categoryForNew(filter),
      createdAt: new Date().toISOString(),
      readAt: null,
      later: toQueue,
      order: -Date.now(),
    }
    setLinks((ls) => [item, ...ls])
    setText('')
    setError('')
    lookup(item)
  }

  // ---- Board: one column per category. Drag a card's grip to move it to another column or place it within one. ----
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const columns = useMemo(() => {
    const keys = filter === ALL || !board ? [...cats.map((c) => c.id), NONE] : [filter]
    return keys
      .map((key) => ({ key, cat: catById.get(key), items: shown.filter((l) => colKey(l) === key) }))
      .filter((c) => c.key !== NONE || c.items.length > 0 || !!drag || cats.length === 0 || filter === NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats, catById, shown, filter, board, !!drag])

  /** Put a link into a column at a position: renumbers that column's order and switches the board to "My order". */
  const place = (id: string, key: string, index: number) => {
    const col = shown.filter((l) => colKey(l) === key && l.id !== id)
    const ids = [...col.slice(0, index).map((l) => l.id), id, ...col.slice(index).map((l) => l.id)]
    const pos = new Map(ids.map((x, i) => [x, i]))
    setLinks((ls) =>
      ls.map((l) => {
        if (!pos.has(l.id)) return l
        const next = { ...l, order: pos.get(l.id)! }
        if (l.id === id) next.categoryId = key === NONE ? null : key
        return next
      }),
    )
    if (boardSort !== 'manual') setBoardSort('manual')
  }

  /** Which column is under the pointer, and where in it the card would land. */
  const hit = (x: number, y: number, id: string) => {
    const colEl = document.elementFromPoint(x, y)?.closest('[data-col]') as HTMLElement | null
    if (!colEl) return { over: null, index: 0 }
    const rows = [...colEl.querySelectorAll<HTMLElement>('[data-link]')].filter((r) => r.dataset.link !== id)
    const index = rows.filter((r) => {
      const b = r.getBoundingClientRect()
      return b.top + b.height / 2 < y
    }).length
    return { over: colEl.dataset.col ?? null, index }
  }

  const refocus = (id: string) =>
    requestAnimationFrame(() => {
      const g = document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(id)}"]`)
      g?.focus()
      g?.closest('.link')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })

  const grip = (l: LinkItem) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const card = e.currentTarget.closest('.link') as HTMLElement
      const r = card.getBoundingClientRect()
      const col = shown.filter((x) => colKey(x) === colKey(l))
      setOpenId(null)
      setDrag({ id: l.id, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, over: colKey(l), index: col.indexOf(l) })
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
      setDrag({ ...drag, x: e.clientX, y: e.clientY, ...hit(e.clientX, e.clientY, l.id) })
    },
    onPointerUp: () => {
      if (drag?.over) {
        const col = shown.filter((x) => colKey(x) === drag.over)
        const unchanged = drag.over === colKey(l) && col.indexOf(l) === drag.index
        if (!unchanged) place(l.id, drag.over, drag.index)
      }
      setDrag(null)
    },
    onPointerCancel: () => setDrag(null),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const key = colKey(l)
      const col = shown.filter((x) => colKey(x) === key)
      const at = col.indexOf(l)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const keys = columns.map((c) => c.key)
        const next = keys[keys.indexOf(key) + (e.key === 'ArrowLeft' ? -1 : 1)]
        if (!next) return
        e.preventDefault()
        place(l.id, next, 0)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const to = at + (e.key === 'ArrowUp' ? -1 : 1)
        if (to < 0 || to >= col.length) return
        e.preventDefault()
        place(l.id, key, to)
      } else return
      refocus(l.id)
    },
  })

  const row = (l: LinkItem, opts: { header?: boolean; inBoard?: boolean } = {}) => {
    const cat = catOf(l) ? catById.get(catOf(l)!) : undefined
    const later = isLater(l)
    const open = openId === l.id
    const lift = drag?.id === l.id
    return (
      <li key={l.id} className="link-group-item" data-link={l.id}>
        {opts.header && <div className="group-label">{cat?.name ?? 'Uncategorized'}</div>}
        <div className={`link ${!later && !expanded ? 'read' : ''} ${opts.inBoard ? 'board-card' : ''} ${lift ? 'lifted' : ''} ${open ? 'open' : ''}`}>
          {opts.inBoard && previewImageOf(l) && (
            <a className="link-thumb" href={l.url} target="_blank" rel="noreferrer noopener" tabIndex={-1} aria-hidden>
              <img src={previewImageOf(l)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.parentElement!.style.display = 'none')} />
            </a>
          )}
          <div className="link-row">
            {opts.inBoard && (
              <button
                type="button"
                className="drag-handle"
                data-grip={l.id}
                aria-label={`Move ${l.title}. Drag, or use the arrow keys: left and right change category, up and down change its place.`}
                title="Drag to move"
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
            <SiteIcon link={l} />
            <div className="link-body">
              <a href={l.url} target="_blank" rel="noreferrer noopener">
                {l.pinned && (
                  <span className="pin-mark" aria-label="Pinned">
                    ★{' '}
                  </span>
                )}
                {l.title}
              </a>
              <div className="meta">
                <span className="muted meta-site">
                  {hostOf(l.url)} · {timeAgo(l.createdAt)}
                </span>
                {expanded && later && status === 'all' && <span className="later-tag">Read later</span>}
                {cat && !opts.inBoard && (
                  <span className="tag" style={{ '--chip': cat.color } as CSSProperties}>
                    {cat.name}
                  </span>
                )}
              </div>
              {l.note && !open && <p className="link-note">{l.note}</p>}
            </div>
            <div className="row-actions always">
              {later ? (
                <button
                  className={`btn small ${opts.inBoard ? 'done-mini' : ''}`}
                  title="Done: take it off Read later. It stays in your library."
                  aria-label={opts.inBoard ? `Mark ${l.title} as done` : undefined}
                  onClick={() => update(l.id, { later: false, readAt: new Date().toISOString() })}
                >
                  ✓{opts.inBoard ? '' : ' Done'}
                </button>
              ) : (
                !expanded && (
                  <button className="btn small" onClick={() => update(l.id, { later: true })}>
                    Put back
                  </button>
                )
              )}
              <button
                className={`icon-btn subtle more-btn ${open ? 'on' : ''}`}
                aria-label={`Details for ${l.title}`}
                aria-expanded={open}
                title="Note, pin, category and more"
                onClick={() => setOpenId(open ? null : l.id)}
              >
                ⋯
              </button>
            </div>
          </div>
          {open && <LinkDetails link={l} cats={cats} onChange={(p) => update(l.id, p)} onRefresh={() => lookup(l)} onDelete={() => {
            confirmDelete({
              title: 'Delete this link?',
              name: l.title,
              onConfirm: () => {
                setOpenId(null)
                setLinks((ls) => ls.filter((x) => x.id !== l.id))
              },
            })
          }} />}
        </div>
      </li>
    )
  }
  const dragged = drag ? links.find((l) => l.id === drag.id) : undefined

  return (
    <Card
      title={
        expanded ? (
          <>
            Link library <span className="muted small">{links.length}</span>
          </>
        ) : (
          <>
            Read / watch later <span className="muted small">{queue.length}</span>
          </>
        )
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
          placeholder={expanded ? 'Paste a link to save it to your library…' : 'Paste a link (optionally with a title)…'}
          autoComplete="off"
          inputMode="url"
          enterKeyHint="done"
        />
        {expanded && (
          <button
            type="button"
            className={`chip later-toggle ${saveLater ? 'on' : ''}`}
            aria-pressed={saveLater}
            title="Also put new links on Read later"
            onClick={() => setSaveLater((v) => !v)}
          >
            {saveLater ? '✓ ' : '+ '}Read later
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Save
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}

      <div className="toolbar">
        {expanded && (
          <div className="seg" role="group" aria-label="Layout">
            {(['columns', 'list'] as const).map((v) => (
              <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === 'columns' ? 'Columns' : 'List'}
              </button>
            ))}
          </div>
        )}
        {expanded && (
          <div className="seg" role="group" aria-label="Show">
            {(['all', 'later'] as const).map((s) => (
              <button key={s} className={status === s ? 'on' : ''} aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === 'all' ? 'All links' : `Read later ${queue.length}`}
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
        {!(showDone && !expanded) && (
          <select aria-label="Sort links" value={sortBy} onChange={(e) => setSort(e.target.value as Sort)}>
            {(['manual', 'newest', 'oldest', 'category'] as const)
              .filter((s) => !(board && s === 'category'))
              .map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
          </select>
        )}
        {!expanded && (
          <button className={`chip ghost small ${showDone ? 'on' : ''}`} onClick={() => setShowDone((s) => !s)}>
            {showDone ? 'Back to Read later' : `Done (${doneCount})`}
          </button>
        )}
        {expanded && (
          <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes, sites…" aria-label="Search links" />
        )}
      </div>

      {board ? (
        <div className={`link-board ${drag ? 'is-dragging' : ''}`} ref={boardRef}>
          {columns.map((c) => {
            const isOver = drag?.over === c.key
            // The lifted card stays faded in its old spot; a line shows where it would land.
            const lineAt = isOver ? drag!.index : -1
            let seen = 0
            const body = c.items.flatMap((l) => {
              if (l.id === drag?.id) return [row(l, { inBoard: true })]
              const line = seen++ === lineAt ? [<li key="drop-line" className="drop-line" aria-hidden />] : []
              return [...line, row(l, { inBoard: true })]
            })
            if (lineAt >= seen) body.push(<li key="drop-line" className="drop-line" aria-hidden />)
            return (
              <section
                key={c.key}
                className={`link-col ${isOver ? 'drop-over' : ''}`}
                data-col={c.key}
                style={{ '--chip': c.cat?.color ?? 'var(--muted)' } as CSSProperties}
                aria-label={c.cat?.name ?? 'Uncategorized'}
              >
                <header className="link-col-head">
                  <span className="dot" aria-hidden />
                  <span className="link-col-name">{c.cat?.name ?? 'Uncategorized'}</span>
                  <span className="muted small">{c.items.length}</span>
                </header>
                <ul className="link-list">{body}</ul>
                {c.items.length === 0 && !isOver && <p className="link-col-empty">{drag ? 'Drop here' : 'Nothing here yet'}</p>}
              </section>
            )
          })}
        </div>
      ) : (
        <ul className={`link-list ${expanded ? 'grid' : ''}`}>
          {shown.map((l, i) => row(l, { header: sortBy === 'category' && (i === 0 || catOf(shown[i - 1]) !== catOf(l)) }))}
        </ul>
      )}
      {drag && dragged && (
        <div className="link-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }} aria-hidden>
          <SiteIcon link={dragged} />
          <span className="link-ghost-title">{dragged.title}</span>
        </div>
      )}
      {shown.length === 0 && !board && (
        <p className="empty">
          {showDone && !expanded
            ? 'Nothing marked done yet.'
            : expanded
              ? 'No links match.'
              : 'Nothing to read or watch. Paste a link above.'}
        </p>
      )}
    </Card>
  )
}

/** The site's icon, with a small ▶ for videos. Falls back to the old article / video badge when there's no icon. */
function SiteIcon({ link }: { link: LinkItem }) {
  const src = link.icon ?? faviconOf(link.url)
  const [failed, setFailed] = useState<string | null>(null)
  const ok = src && failed !== src
  return (
    <span className={`site-icon ${link.kind} ${ok ? '' : 'fallback'}`} title={link.kind === 'video' ? 'Video' : 'Article'}>
      {ok ? (
        <img src={src} alt="" width={20} height={20} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
      ) : link.kind === 'video' ? (
        '▶'
      ) : (
        '¶'
      )}
      {ok && link.kind === 'video' && (
        <span className="video-mark" aria-hidden>
          ▶
        </span>
      )}
    </span>
  )
}

/** Opens under a link from its ⋯ button: title, note, Read later, pin, category, type, refresh, delete. */
function LinkDetails(props: {
  link: LinkItem
  cats: Category[]
  onChange: (p: Partial<LinkItem>) => void
  onRefresh: () => Promise<void> | void
  onDelete: () => void
}) {
  const l = props.link
  const [title, setTitle] = useState(l.title)
  const [note, setNote] = useState(l.note ?? '')
  const [refreshing, setRefreshing] = useState(false)
  const later = isLater(l)
  const commitTitle = () => title.trim() && title.trim() !== l.title && props.onChange({ title: title.trim() })
  const commitNote = () => note.trim() !== (l.note ?? '') && props.onChange({ note: note.trim() || undefined })
  return (
    <div className="link-details">
      <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => e.key === 'Enter' && commitTitle()} />
      <textarea
        aria-label="Note"
        placeholder="Add a note: why you saved it, what to look for…"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commitNote}
        autoFocus={!l.note}
      />
      {l.description && <p className="link-desc">{l.description}</p>}
      <div className="link-details-actions">
        <button className={`chip small ${later ? 'on' : ''}`} aria-pressed={later} onClick={() => props.onChange(later ? { later: false } : { later: true })}>
          {later ? '✓ Read later' : '+ Read later'}
        </button>
        <button className={`chip small ${l.pinned ? 'on' : ''}`} aria-pressed={!!l.pinned} onClick={() => props.onChange({ pinned: !l.pinned || undefined })}>
          {l.pinned ? '★ Pinned' : '☆ Pin'}
        </button>
        <select aria-label="Category" className="cat-select" value={l.categoryId ?? ''} onChange={(e) => props.onChange({ categoryId: e.target.value || null })}>
          <option value="">No category</option>
          {props.cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Type" className="cat-select" value={l.kind} onChange={(e) => props.onChange({ kind: e.target.value as LinkKind })}>
          <option value="article">Article</option>
          <option value="video">Video</option>
        </select>
        <button
          className="chip small ghost"
          disabled={refreshing}
          title="Look up the title, preview image and icon again"
          onClick={async () => {
            setRefreshing(true)
            await props.onRefresh()
            setRefreshing(false)
          }}
        >
          {refreshing ? 'Looking up…' : '↻ Preview'}
        </button>
        <button className="chip small ghost danger" onClick={props.onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
