import { useMemo, useState } from 'react'
import type { Category, Note } from '../types'
import { usePersisted } from '../lib/storage'
import { timeAgo } from '../lib/dates'
import { uid } from '../lib/id'
import { Card } from './Card'
import { ALL, CategoryBar, NONE, categoryForNew, matchesFilter } from './CategoryBar'

export function NotesPanel() {
  const [notes, setNotes] = usePersisted<Note[]>('notes', [])
  const [cats, setCats] = usePersisted<Category[]>('noteCategories', [])
  const [filter, setFilter] = usePersisted<string>('ui:noteFilter', ALL)
  const [text, setText] = useState('')

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const n of notes) {
      const k = n.categoryId && catById.has(n.categoryId) ? n.categoryId : NONE
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [notes, catById])

  const shown = useMemo(
    () =>
      notes
        .filter((n) => matchesFilter(n.categoryId && catById.has(n.categoryId) ? n.categoryId : null, filter))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt)),
    [notes, filter, catById],
  )

  const add = () => {
    const t = text.trim()
    if (!t) return
    setNotes((ns) => [
      { id: uid(), text: t, categoryId: categoryForNew(filter), createdAt: new Date().toISOString() },
      ...ns,
    ])
    setText('')
  }

  const update = (id: string, patch: Partial<Note>) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)))

  const target = categoryForNew(filter)

  return (
    <Card title="Notes" className="notes" id="notes">
      <CategoryBar
        categories={cats}
        onChange={setCats}
        selected={filter}
        onSelect={setFilter}
        counts={counts}
        onDelete={(id) => setNotes((ns) => ns.map((n) => (n.categoryId === id ? { ...n, categoryId: null } : n)))}
      />
      <div className="quick-add note-add">
        <textarea
          id="quick-note"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Jot something down${target ? ` in ${catById.get(target)?.name}` : ''}…`}
          title="Enter to save, Shift+Enter for a new line"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              add()
            }
          }}
        />
        <button className="btn primary" onClick={add} disabled={!text.trim()}>
          Save
        </button>
      </div>
      <ul className="note-list">
        {shown.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            category={n.categoryId ? catById.get(n.categoryId) : undefined}
            categories={cats}
            update={update}
            remove={(id) => setNotes((ns) => ns.filter((x) => x.id !== id))}
          />
        ))}
      </ul>
      {shown.length === 0 && <p className="empty">No notes{filter !== ALL ? ' in this category' : ''} yet.</p>}
    </Card>
  )
}

function NoteRow(props: {
  note: Note
  category?: Category
  categories: Category[]
  update: (id: string, patch: Partial<Note>) => void
  remove: (id: string) => void
}) {
  const { note: n } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(n.text)

  const save = () => {
    const t = draft.trim()
    if (t && t !== n.text) props.update(n.id, { text: t })
    setEditing(false)
  }

  return (
    <li className={`note ${n.pinned ? 'pinned' : ''}`} style={{ '--chip': props.category?.color ?? 'var(--border)' } as React.CSSProperties}>
      {editing ? (
        <textarea
          className="inline-edit"
          autoFocus
          rows={Math.min(8, draft.split('\n').length + 1)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            }
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <p
          className="note-text"
          onClick={() => {
            setDraft(n.text)
            setEditing(true)
          }}
        >
          {n.text}
        </p>
      )}
      <div className="meta">
        <select
          className="cat-select"
          aria-label="Category"
          value={props.category ? n.categoryId! : ''}
          onChange={(e) => props.update(n.id, { categoryId: e.target.value || null })}
        >
          <option value="">No category</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="muted">{timeAgo(n.createdAt)}</span>
        <span className="spacer" />
        <button
          className={`icon-btn subtle ${n.pinned ? 'on' : ''}`}
          aria-label={n.pinned ? 'Unpin' : 'Pin'}
          title={n.pinned ? 'Unpin' : 'Pin to top'}
          onClick={() => props.update(n.id, { pinned: !n.pinned })}
        >
          ★
        </button>
        <button className="icon-btn subtle" aria-label="Delete note" onClick={() => props.remove(n.id)}>
          ×
        </button>
      </div>
    </li>
  )
}
