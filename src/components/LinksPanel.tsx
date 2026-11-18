import { useMemo, useState } from 'react'
import type { Category, LinkItem, LinkKind } from '../types'
import { usePersisted } from '../lib/storage'
import { timeAgo } from '../lib/dates'
import { uid } from '../lib/id'
import { detectKind, fetchVideoTitle, hostOf, parseLinkInput, titleFromUrl } from '../lib/links'
import { Card } from './Card'
import { ALL, CategoryBar, NONE, categoryForNew, matchesFilter } from './CategoryBar'

type Sort = 'newest' | 'oldest' | 'category'
type KindFilter = 'all' | LinkKind

export function LinksPanel() {
  const [links, setLinks] = usePersisted<LinkItem[]>('links', [])
  const [cats, setCats] = usePersisted<Category[]>('linkCategories', [])
  const [filter, setFilter] = usePersisted<string>('ui:linkFilter', ALL)
  const [sort, setSort] = usePersisted<Sort>('ui:linkSort', 'newest')
  const [kind, setKind] = usePersisted<KindFilter>('ui:linkKind', 'all')
  const [showRead, setShowRead] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const catOf = (l: LinkItem) => (l.categoryId && catById.has(l.categoryId) ? l.categoryId : null)

  const unread = links.filter((l) => !l.readAt)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const l of links) if (!l.readAt) c[catOf(l) ?? NONE] = (c[catOf(l) ?? NONE] ?? 0) + 1
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, catById])

  const shown = useMemo(() => {
    const list = links.filter(
      (l) => (showRead ? !!l.readAt : !l.readAt) && matchesFilter(catOf(l), filter) && (kind === 'all' || l.kind === kind),
    )
    const byDate = (a: LinkItem, b: LinkItem) => b.createdAt.localeCompare(a.createdAt)
    if (sort === 'oldest') list.sort((a, b) => -byDate(a, b))
    else if (sort === 'category') {
      const order = new Map(cats.map((c, i) => [c.id, i]))
      list.sort((a, b) => (order.get(catOf(a) ?? '') ?? 999) - (order.get(catOf(b) ?? '') ?? 999) || byDate(a, b))
    } else list.sort(byDate)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, showRead, filter, kind, sort, cats, catById])

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

  return (
    <Card
      title={
        <>
          Read / watch later <span className="muted small">{unread.length}</span>
        </>
      }
      className="links"
      id="links"
    >
      <CategoryBar
        categories={cats}
        onChange={setCats}
        selected={filter}
        onSelect={setFilter}
        counts={counts}
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
        <div className="seg">
          {(['all', 'article', 'video'] as const).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'article' ? 'Articles' : 'Videos'}
            </button>
          ))}
        </div>
        <select aria-label="Sort links" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="category">By category</option>
        </select>
        <button className={`chip ghost small ${showRead ? 'on' : ''}`} onClick={() => setShowRead((s) => !s)}>
          {showRead ? 'Back to unread' : `Read (${readCount})`}
        </button>
      </div>

      <ul className="link-list">
        {shown.map((l, i) => {
          const cat = catOf(l) ? catById.get(catOf(l)!) : undefined
          const prev = shown[i - 1]
          const header = sort === 'category' && (i === 0 || catOf(prev) !== catOf(l))
          return (
            <li key={l.id} className="link-group-item">
              {header && <div className="group-label">{cat?.name ?? 'Uncategorized'}</div>}
              <div className={`link ${l.readAt ? 'read' : ''}`}>
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
                    {cat && (
                      <span className="tag" style={{ '--chip': cat.color } as React.CSSProperties}>
                        {cat.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="row-actions always">
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
                  {l.readAt ? (
                    <>
                      <button className="btn small" onClick={() => update(l.id, { readAt: null })}>
                        Unread
                      </button>
                      <button
                        className="icon-btn subtle"
                        aria-label="Delete link"
                        onClick={() => setLinks((ls) => ls.filter((x) => x.id !== l.id))}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <button className="btn small" onClick={() => update(l.id, { readAt: new Date().toISOString() })}>
                      ✓ Done
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {shown.length === 0 && (
        <p className="empty">{showRead ? 'Nothing marked as read yet.' : 'Nothing saved. Paste a link above.'}</p>
      )}
    </Card>
  )
}
