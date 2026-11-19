import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note, Project, TodoItem, TodoList } from '../types'
import { PROJECT_COLORS, newItem, newList, plural, reopenProject, resolveProject, resolvedLabel, useProjects } from '../lib/projects'
import { uid } from '../lib/id'
import { useSortable } from '../lib/useSortable'
import { Card } from './Card'
import { NoteComposer, NoteRow } from './NotesPanel'

type Tab = 'lists' | 'notes'

/** Lists get a bit under two thirds of the width until the divider is moved. */
const DEFAULT_SPLIT = 0.64
/** Neither side gets narrower than this while dragging. */
const MIN_SIDE = 280

/** One project, full screen: its titled to-do lists beside its notes. On a phone, one at a time. */
export function ProjectView(props: { id: string; onClose: () => void; backLabel: string }) {
  const { projects, setProjects, updateProject } = useProjects()
  const p = projects.find((x) => x.id === props.id)
  const [tab, setTab] = useState<Tab>('lists')

  if (!p) {
    return (
      <Card title="Project" className="project-view" expanded onClose={props.onClose} backLabel={props.backLabel}>
        <p className="empty">This project isn’t here anymore. It may have been deleted.</p>
      </Card>
    )
  }

  const change = (fn: (p: Project) => Project) => updateProject(p.id, fn)
  const setLists = (fn: (ls: TodoList[]) => TodoList[]) => change((x) => ({ ...x, lists: fn(x.lists) }))
  const setNotes = (fn: (ns: Note[]) => Note[]) => change((x) => ({ ...x, notes: fn(x.notes) }))
  const openItems = p.lists.reduce((n, l) => n + l.items.filter((i) => !i.done).length, 0)

  const remove = () => {
    props.onClose()
    setProjects((ps) => ps.filter((x) => x.id !== p.id))
  }

  return (
    <Card
      title={<ProjectName project={p} onRename={(name) => change((x) => ({ ...x, name }))} />}
      className="project-view"
      expanded
      onClose={props.onClose}
      backLabel={props.backLabel}
      actions={
        <>
          <button
            className="icon-btn subtle color-btn"
            style={{ '--chip': p.color } as React.CSSProperties}
            title="Change color"
            aria-label="Change project color"
            onClick={() => change((x) => ({ ...x, color: PROJECT_COLORS[(PROJECT_COLORS.indexOf(x.color) + 1) % PROJECT_COLORS.length] }))}
          >
            <span className="dot" />
          </button>
          {!p.resolvedAt && (
            <button className="btn small resolve-btn" title="Mark this project done. It moves to Resolved, and you can reopen it any time." onClick={() => change(resolveProject)}>
              ✓ Resolve<span className="hide-sm"> project</span>
            </button>
          )}
          <ConfirmButton
            className="btn small"
            label={<>Delete<span className="hide-sm"> project</span></>}
            confirm={`Delete it${p.lists.length || p.notes.length ? ` and its ${[p.lists.length && plural(p.lists.length, 'list'), p.notes.length && plural(p.notes.length, 'note')].filter(Boolean).join(' and ')}` : ''}?`}
            onConfirm={remove}
          />
        </>
      }
    >
      {p.resolvedAt && (
        <div className="resolved-strip" role="status">
          <span className="resolved-check" aria-hidden>
            ✓
          </span>
          <span>
            Resolved {resolvedLabel(p.resolvedAt)}. It now sits under Resolved in Projects.
          </span>
          <button className="btn small" onClick={() => change(reopenProject)}>
            Reopen
          </button>
        </div>
      )}
      <div className="tabs project-switch" role="tablist" aria-label="Project sections">
        {(['lists', 'notes'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'lists' ? 'To-do lists' : 'Notes'}
            {(t === 'lists' ? openItems : p.notes.length) > 0 && <span className="count">{t === 'lists' ? openItems : p.notes.length}</span>}
          </button>
        ))}
      </div>
      <div className={`project-body show-${tab}`} style={{ '--split': p.split ?? DEFAULT_SPLIT } as React.CSSProperties}>
        <section className="project-col project-lists-col" aria-label="To-do lists">
          <h3 className="group-head project-col-head">To-do lists</h3>
          {/* New lists go on top, like new notes and the dashboard's add boxes. */}
          <NewListForm first={p.lists.length === 0} onAdd={(title) => setLists((ls) => [newList(title), ...ls])} />
          {p.lists.length > 0 && (
            <div className="todo-lists">
              {p.lists.map((l) => (
                <TodoListCard
                  key={l.id}
                  list={l}
                  color={p.color}
                  onChange={(fn) => setLists((ls) => ls.map((x) => (x.id === l.id ? fn(x) : x)))}
                  onDelete={() => setLists((ls) => ls.filter((x) => x.id !== l.id))}
                />
              ))}
            </div>
          )}
        </section>
        <SplitHandle value={p.split ?? DEFAULT_SPLIT} onChange={(split) => change((x) => ({ ...x, split: split === DEFAULT_SPLIT ? undefined : split }))} />
        <section className="project-col project-notes-col" aria-label="Notes">
          <h3 className="group-head project-col-head">Notes</h3>
          <NoteComposer
            placeholder={`A note for ${p.name}…`}
            onAdd={(title, text) =>
              setNotes((ns) => [{ id: uid(), ...(title ? { title } : {}), text, categoryId: null, createdAt: new Date().toISOString() }, ...ns])
            }
          />
          <ul className="note-list">
            {[...p.notes]
              .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt))
              .map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  category={{ id: '', name: '', color: p.color }}
                  update={(id, patch) => setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, ...patch } : x)))}
                  remove={(id) => setNotes((ns) => ns.filter((x) => x.id !== id))}
                />
              ))}
          </ul>
          {p.notes.length === 0 && <p className="empty">No notes yet. They stay inside this project.</p>}
        </section>
      </div>
    </Card>
  )
}

/** The project's name as the page heading. Click it to rename. */
function ProjectName({ project: p, onRename }: { project: Project; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(p.name)
  const save = () => {
    const n = draft.trim()
    if (n && n !== p.name) onRename(n)
    setEditing(false)
  }
  if (editing)
    return (
      <input
        className="inline-edit project-name-input"
        autoFocus
        value={draft}
        maxLength={80}
        aria-label="Project name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            e.stopPropagation()
            setEditing(false)
          }
        }}
      />
    )
  return (
    <button
      className="project-title-btn"
      style={{ '--chip': p.color } as React.CSSProperties}
      title="Click to rename"
      onClick={() => {
        setDraft(p.name)
        setEditing(true)
      }}
    >
      <span className="dot" aria-hidden />
      {p.name}
      <span className="edit-ico" aria-hidden>
        ✎
      </span>
    </button>
  )
}

function NewListForm({ first, onAdd }: { first: boolean; onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  const add = () => {
    const t = title.trim()
    if (!t) return
    onAdd(t)
    setTitle('')
  }
  return (
    <form
      className="quick-add new-list"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={first ? 'Name your first list, like “Research” or “Launch”…' : 'New list title…'}
        aria-label="New list title"
        autoComplete="off"
        maxLength={80}
        enterKeyHint="done"
      />
      <button type="submit" className="btn" disabled={!title.trim()}>
        + Add list
      </button>
    </form>
  )
}

function TodoListCard(props: { list: TodoList; color: string; onChange: (fn: (l: TodoList) => TodoList) => void; onDelete: () => void }) {
  const { list: l, onChange } = props
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(l.title)
  const open = useMemo(() => l.items.filter((i) => !i.done), [l.items])
  const done = useMemo(() => l.items.filter((i) => i.done), [l.items])
  const openIds = useMemo(() => open.map((i) => i.id), [open])
  const byId = useMemo(() => new Map(open.map((i) => [i.id, i])), [open])
  const sort = useSortable(openIds, (ids) =>
    onChange((x) => ({ ...x, items: [...ids.map((id) => x.items.find((i) => i.id === id)!).filter(Boolean), ...x.items.filter((i) => i.done)] })),
  )

  const setItem = (id: string, patch: Partial<TodoItem>) => onChange((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const removeItem = (id: string) => onChange((x) => ({ ...x, items: x.items.filter((i) => i.id !== id) }))
  const add = () => {
    const t = text.trim()
    if (!t) return
    // New items join the end of the open ones, above anything already done.
    onChange((x) => {
      const o = x.items.filter((i) => !i.done)
      return { ...x, items: [...o, newItem(t), ...x.items.filter((i) => i.done)] }
    })
    setText('')
  }
  const rename = () => {
    const t = draft.trim()
    if (t && t !== l.title) onChange((x) => ({ ...x, title: t }))
    setRenaming(false)
  }

  return (
    <section className="todo-list" style={{ '--chip': props.color } as React.CSSProperties} aria-label={l.title}>
      <header className="todo-list-head">
        {renaming ? (
          <input
            className="inline-edit"
            autoFocus
            value={draft}
            maxLength={80}
            aria-label="List title"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') rename()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setRenaming(false)
              }
            }}
          />
        ) : (
          <h4
            className="todo-list-title"
            title="Click to rename"
            tabIndex={0}
            onClick={() => {
              setDraft(l.title)
              setRenaming(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setDraft(l.title)
                setRenaming(true)
              }
            }}
          >
            {l.title}
          </h4>
        )}
        {!renaming && l.items.length > 0 && (
          <span className="muted small">
            {done.length}/{l.items.length}
          </span>
        )}
        <ConfirmButton
          className="icon-btn subtle"
          label="×"
          ariaLabel={`Delete list ${l.title}`}
          confirm={l.items.length ? `Delete list and ${plural(l.items.length, 'item')}?` : 'Delete list?'}
          skip={l.items.length === 0}
          onConfirm={props.onDelete}
        />
      </header>
      <form
        className="quick-add compact"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do…" aria-label={`Add to ${l.title}`} autoComplete="off" enterKeyHint="done" />
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Add
        </button>
      </form>
      <ul className="task-list" ref={sort.listRef}>
        {sort.order.map((id) => {
          const i = byId.get(id)
          if (!i) return null
          return (
            <TodoRow
              key={i.id}
              item={i}
              set={setItem}
              remove={removeItem}
              dragging={sort.dragId === i.id}
              handle={open.length > 1 ? sort.handleProps(i.id) : undefined}
            />
          )
        })}
        {done.map((i) => (
          <TodoRow key={i.id} item={i} set={setItem} remove={removeItem} />
        ))}
      </ul>
      {l.items.length === 0 && <p className="empty">Nothing on this list yet.</p>}
      {done.length > 1 && (
        <button className="btn small ghost clear-done" onClick={() => onChange((x) => ({ ...x, items: x.items.filter((i) => !i.done) }))}>
          Clear {done.length} done
        </button>
      )}
    </section>
  )
}

function TodoRow(props: {
  item: TodoItem
  set: (id: string, patch: Partial<TodoItem>) => void
  remove: (id: string) => void
  dragging?: boolean
  handle?: ReturnType<ReturnType<typeof useSortable>['handleProps']>
}) {
  const { item: i } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(i.title)
  const save = () => {
    const t = draft.trim()
    if (t && t !== i.title) props.set(i.id, { title: t })
    setEditing(false)
  }
  return (
    <li className={`task ${i.done ? 'done' : ''} ${props.dragging ? 'dragging' : ''}`} data-sort-id={i.done ? undefined : i.id}>
      {props.handle ? (
        <button type="button" className="drag-handle" aria-label={`Reorder ${i.title}. Drag, or use the arrow keys.`} title="Drag to reorder" {...props.handle}>
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
            {[3, 8, 13].map((y) => (
              <g key={y}>
                <circle cx="2.5" cy={y} r="1.4" />
                <circle cx="7.5" cy={y} r="1.4" />
              </g>
            ))}
          </svg>
        </button>
      ) : (
        <span className="drag-spacer" aria-hidden />
      )}
      <label className="check">
        <input type="checkbox" checked={i.done} onChange={() => props.set(i.id, { done: !i.done })} aria-label={i.done ? `Mark ${i.title} not done` : `Mark ${i.title} done`} />
        <span className="box" aria-hidden />
      </label>
      {editing ? (
        <input
          className="inline-edit"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setEditing(false)
            }
          }}
        />
      ) : (
        <span
          className="task-title"
          title="Double-click to edit"
          onDoubleClick={() => {
            setDraft(i.title)
            setEditing(true)
          }}
        >
          {i.title}
        </span>
      )}
      <div className="row-actions">
        <button className="icon-btn subtle" aria-label={`Delete ${i.title}`} onClick={() => props.remove(i.id)}>
          ×
        </button>
      </div>
    </li>
  )
}

/**
 * A delete button that asks once, in place: the first press changes it to
 * "Delete …?", a second press confirms. It resets after a few seconds or when
 * focus leaves. No browser dialog, so it works the same on a phone.
 */
function ConfirmButton(props: {
  label: React.ReactNode
  confirm: string
  onConfirm: () => void
  className?: string
  ariaLabel?: string
  /** Nothing to lose: act on the first press. */
  skip?: boolean
}) {
  const [armed, setArmed] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <button
      ref={ref}
      type="button"
      className={`${props.className ?? ''} ${armed ? 'confirming' : ''}`}
      aria-label={armed ? props.confirm : props.ariaLabel}
      data-esc-cancel={armed ? '' : undefined}
      onBlur={() => setArmed(false)}
      onKeyDown={(e) => e.key === 'Escape' && armed && setArmed(false)}
      onClick={() => {
        if (armed || props.skip) {
          setArmed(false)
          props.onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? props.confirm : props.label}
    </button>
  )
}

/**
 * The divider between lists and notes. Drag it (mouse, pen or touch), or
 * focus it and use the arrow keys. Double-click puts it back. The split is
 * previewed live through a CSS variable and saved once, on release.
 */
function SplitHandle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const pct = Math.round(value * 100)

  const clamp = (v: number, width: number) => {
    const min = width > 0 ? Math.min(0.45, MIN_SIDE / width) : 0.25
    return Math.round(Math.min(1 - min, Math.max(min, v)) * 1000) / 1000
  }
  const body = () => ref.current?.parentElement as HTMLElement | null

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = body()
    if (!el) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const rect = el.getBoundingClientRect()
    const handleW = e.currentTarget.offsetWidth
    let next = value
    setDragging(true)
    document.body.classList.add('resizing')
    const move = (ev: PointerEvent) => {
      next = clamp((ev.clientX - rect.left - handleW / 2) / (rect.width - handleW), rect.width)
      el.style.setProperty('--split', String(next))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing')
      setDragging(false)
      const keep = ev.type === 'pointerup' && next !== value
      el.style.setProperty('--split', String(keep ? next : value))
      if (keep) onChange(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.03
    const w = body()?.offsetWidth ?? 0
    if (e.key === 'ArrowLeft') onChange(clamp(value - step, w))
    else if (e.key === 'ArrowRight') onChange(clamp(value + step, w))
    else if (e.key === 'Home') onChange(clamp(0, w))
    else if (e.key === 'End') onChange(clamp(1, w))
    else if (e.key === 'Enter') onChange(DEFAULT_SPLIT)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={ref}
      className={`split-handle ${dragging ? 'dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize to-do lists and notes"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`To-do lists ${pct}%, notes ${100 - pct}%`}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(DEFAULT_SPLIT)}
    >
      <span className="split-grip" aria-hidden />
    </div>
  )
}
