import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Note } from '../types'
import { usePersisted } from '../lib/storage'
import { timeAgo } from '../lib/dates'
import { uid } from '../lib/id'
import { searchText } from '../lib/noteText'
import { NoteBody, NoteEditor } from './NoteEditor'
import { NoteText } from './NoteText'
import { Card, type FocusProps } from './Card'
import { ALL, CategoryBar, NONE, categoryForNew, matchesFilter } from './CategoryBar'

export function NotesPanel(focus: FocusProps) {
  const [notes, setNotes] = usePersisted<Note[]>('notes', [])
  const [cats, setCats] = usePersisted<Category[]>('noteCategories', [])
  const [filter, setFilter] = usePersisted<string>('ui:noteFilter', ALL)
  const [query, setQuery] = useState('')
  const q = focus.expanded ? query.trim().toLowerCase() : ''

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
        .filter((n) => !q || searchText(n).includes(q))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt)),
    [notes, filter, catById, q],
  )

  const add = (title: string, text: string) =>
    setNotes((ns) => [
      { id: uid(), ...(title ? { title } : {}), text, categoryId: categoryForNew(filter), createdAt: new Date().toISOString() },
      ...ns,
    ])

  const update = (id: string, patch: Partial<Note>) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)))

  const target = categoryForNew(filter)

  return (
    <Card title="Notes" className="notes" id="notes" foldId="notes" foldedSummary={`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`} {...focus}>
      <CategoryBar
        categories={cats}
        onChange={setCats}
        selected={filter}
        onSelect={setFilter}
        counts={counts}
        onDelete={(id) => setNotes((ns) => ns.map((n) => (n.categoryId === id ? { ...n, categoryId: null } : n)))}
      />
      <NoteComposer
        onAdd={add}
        bodyId="quick-note"
        titleId="quick-note-title"
        placeholder={`Jot something down${target ? ` in ${catById.get(target)?.name}` : ''}…`}
      />
      {focus.expanded && (
        <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes" />
      )}
      <ul className={`note-list ${focus.expanded ? 'grid' : ''}`}>
        {shown.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            category={n.categoryId ? catById.get(n.categoryId) : undefined}
            categories={cats}
            update={update}
            searching={!!q}
            remove={(id) => setNotes((ns) => ns.filter((x) => x.id !== id))}
          />
        ))}
      </ul>
      {shown.length === 0 && <p className="empty">{q ? 'No notes match.' : `No notes${filter !== ALL ? ' in this category' : ''} yet.`}</p>}
    </Card>
  )
}

/** The quick-add box: one line at rest, opening into title, body and a List button while in use. */
export function NoteComposer(props: { onAdd: (title: string, text: string) => void; placeholder: string; bodyId?: string; titleId?: string }) {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [active, setActive] = useState(false)
  const afterPointer = useAfterPointer()

  const add = () => {
    const t = tidy(text)
    const ttl = title.trim()
    if (!t && !ttl) return
    props.onAdd(ttl, t)
    setText('')
    setTitle('')
  }
  const canSave = !!(text.trim() || title.trim())
  const open = active || !!title || !!text

  return (
    <div className={`quick-add note-add ${open ? 'open' : ''}`}>
      <NoteEditor
        className="compose"
        bodyId={props.bodyId}
        titleId={props.titleId}
        showTitle={open}
        title={title}
        text={text}
        rows={open ? Math.min(8, Math.max(2, text.split('\n').length + 1)) : 2}
        onTitle={setTitle}
        onText={setText}
        onSubmit={add}
        footer={
          <button type="button" className="btn small primary" onMouseDown={(e) => e.preventDefault()} onClick={add} disabled={!canSave}>
            Save
          </button>
        }
        placeholder={props.placeholder}
        onFocus={() => setActive(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) afterPointer(() => setActive(false))
        }}
      />
      {/* Once the box is open, Save moves into its toolbar so the fields get the full width. */}
      {!open && (
        <button className="btn primary" onClick={add} disabled={!canSave}>
          Save
        </button>
      )}
    </div>
  )
}

export function NoteRow(props: {
  note: Note
  category?: Category
  /** Left out where notes have no categories (inside a project). */
  categories?: Category[]
  update: (id: string, patch: Partial<Note>) => void
  remove: (id: string) => void
  /** While searching, collapsed notes open so the match is visible. */
  searching?: boolean
}) {
  const { note: n } = props
  // Only titled notes fold: there's nothing meaningful to fold an untitled note down to.
  const canFold = !!n.title
  const folded = canFold && !!n.collapsed && !props.searching
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(n.text)
  const [draftTitle, setDraftTitle] = useState(n.title ?? '')

  const startEdit = () => {
    setDraft(n.text)
    setDraftTitle(n.title ?? '')
    setEditing(true)
  }
  const save = () => {
    const t = tidy(draft)
    const ttl = draftTitle.trim()
    // Clearing both fields isn't a delete; keep the note as it was.
    if ((t || ttl) && (t !== n.text || ttl !== (n.title ?? ''))) props.update(n.id, { text: t, title: ttl || undefined })
    setEditing(false)
  }

  return (
    <li className={`note ${n.pinned ? 'pinned' : ''} ${folded ? 'folded' : ''}`} style={{ '--chip': props.category?.color ?? 'var(--border)' } as React.CSSProperties}>
      {editing ? (
        <NoteEditor
          className="inline"
          showTitle
          autoFocus
          rows={Math.min(10, draft.split('\n').length + 1)}
          title={draftTitle}
          text={draft}
          onTitle={setDraftTitle}
          onText={setDraft}
          onSubmit={save}
          onCancel={() => setEditing(false)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) save()
          }}
          footer={
            <button type="button" className="btn small primary" onMouseDown={(e) => e.preventDefault()} onClick={save}>
              Done
            </button>
          }
        />
      ) : (
        <>
          {n.title && (
            <div className="note-head">
              <h3 className="note-title" onClick={folded ? () => props.update(n.id, { collapsed: false }) : startEdit} title={folded ? 'Show the note' : 'Click to edit'}>
                <NoteText text={n.title} />
              </h3>
              {folded && <span className="muted fold-summary">{foldSummary(n.text)}</span>}
              <button
                className="icon-btn subtle fold-btn"
                aria-expanded={!folded}
                aria-label={folded ? 'Expand note' : 'Collapse note to its title'}
                title={folded ? 'Expand' : 'Collapse to title'}
                onClick={() => props.update(n.id, { collapsed: !folded || undefined })}
                disabled={props.searching}
              >
                <span aria-hidden>›</span>
              </button>
            </div>
          )}
          {!folded && (
            <div className="note-content" onClick={startEdit} title="Click to edit">
              <NoteBody text={n.text} />
            </div>
          )}
        </>
      )}
      {!folded && <div className="meta">
        {props.categories && <select
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
        </select>}
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
      </div>}
    </li>
  )
}

/** Trims the edges and drops a dangling empty bullet left from typing. */
function tidy(text: string) {
  return text.replace(/(\n\s*[-*•]\s*)+$/, '').trim()
}

/** What a folded note hides, in a word or two: "3 items", "2 lines". */
function foldSummary(text: string) {
  const lines = text.split('\n').filter((l) => l.trim())
  if (!lines.length) return ''
  const items = lines.filter((l) => /^\s*[-*•]\s+/.test(l)).length
  if (items === lines.length) return `${items} item${items === 1 ? '' : 's'}`
  return `${lines.length} line${lines.length === 1 ? '' : 's'}`
}

/**
 * Runs a layout-changing callback once the current press is over. Closing the
 * composer the moment it loses focus would shift the list under the pointer
 * mid-click, so a click on a note's button could land on the wrong thing.
 */
function useAfterPointer() {
  const down = useRef(false)
  useEffect(() => {
    const on = () => (down.current = true)
    const off = () => setTimeout(() => (down.current = false))
    window.addEventListener('pointerdown', on, true)
    window.addEventListener('pointerup', off, true)
    window.addEventListener('pointercancel', off, true)
    return () => {
      window.removeEventListener('pointerdown', on, true)
      window.removeEventListener('pointerup', off, true)
      window.removeEventListener('pointercancel', off, true)
    }
  }, [])
  return (fn: () => void) => {
    if (!down.current) return fn()
    const done = () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
      setTimeout(fn)
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
  }
}
