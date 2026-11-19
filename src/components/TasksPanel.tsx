import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task, TaskScope } from '../types'
import { usePersisted } from '../lib/storage'
import { daysBetween, weekdayShort, type DayKey } from '../lib/dates'
import {
  SCOPES,
  applyOrder,
  arrange,
  bucketOf,
  datePicks,
  dueLabel,
  isDone,
  isVisible,
  moveTo,
  newTask,
  setDue,
  toggleTask,
} from '../lib/tasks'
import { useSortable } from '../lib/useSortable'
import { Card, type FocusProps } from './Card'

type View = TaskScope | 'all'

const TABS: { id: View; label: string }[] = [...SCOPES, { id: 'all', label: 'All' }]

/** The All view, top to bottom. */
const GROUPS: { id: string; label: string; match: (t: Task, today: DayKey) => boolean }[] = [
  { id: 'today', label: 'Today', match: (t, d) => bucketOf(t, d) === 'day' },
  { id: 'later', label: 'Later this week', match: (t, d) => bucketOf(t, d) === 'week' && !!t.dueOn },
  { id: 'week', label: 'Weekly', match: (t, d) => bucketOf(t, d) === 'week' && !t.dueOn },
  { id: 'month', label: 'Monthly', match: (t, d) => bucketOf(t, d) === 'month' },
  { id: 'general', label: 'General', match: (t, d) => bucketOf(t, d) === 'general' },
]

/** Columns in the full Tasks view. */
const COLUMNS: { id: TaskScope; label: string; hint: string }[] = [
  { id: 'day', label: 'Daily', hint: 'Today, repeats and anything due' },
  { id: 'week', label: 'Weekly', hint: 'This week' },
  { id: 'month', label: 'Monthly', hint: 'This month' },
  { id: 'general', label: 'General', hint: 'Someday, no rush' },
]

const scopeLabel = (s: TaskScope) => SCOPES.find((x) => x.id === s)!.label

type Update = (id: string, fn: (t: Task) => Task) => void

export function TasksPanel({ today, ...focus }: { today: DayKey } & FocusProps) {
  const [tasks, setTasks] = usePersisted<Task[]>('tasks', [])
  const [view, setView] = usePersisted<View>('ui:taskScope', 'day')
  const inputRef = useRef<HTMLInputElement>(null)

  const openCounts = useMemo(() => {
    const c: Record<View, number> = { day: 0, week: 0, month: 0, general: 0, all: 0 }
    for (const t of tasks)
      if (!isDone(t, today)) {
        c[bucketOf(t, today)]++
        c.all++
      }
    return c
  }, [tasks, today])

  const shown = useMemo(() => tasks.filter((t) => isVisible(t, today)), [tasks, today])
  const inList = (s: TaskScope) => shown.filter((t) => bucketOf(t, today) === s)

  const update: Update = (id, fn) => setTasks((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))
  const remove = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id))
  const reorder = (ids: string[]) => setTasks((ts) => applyOrder(ts, ids))
  const listProps = { today, update, remove, reorder }

  if (focus.expanded) {
    return (
      <Card title="Tasks" className="tasks tasks-full" id="tasks" {...focus}>
        <TaskBoard today={today} counts={openCounts} lists={COLUMNS.map((c) => inList(c.id))} listProps={listProps} />
      </Card>
    )
  }

  // New tasks go to the open tab, or Today from the All view, unless a date is picked.
  const addScope: TaskScope = view === 'all' ? 'day' : view
  const list = view === 'all' ? [] : inList(view)
  const groups =
    view === 'all' ? GROUPS.map((g) => ({ ...g, tasks: shown.filter((t) => g.match(t, today)) })).filter((g) => g.tasks.length) : []
  const empty = view === 'all' ? groups.length === 0 : list.length === 0
  const allClear = view !== 'all' && list.length > 0 && list.every((t) => isDone(t, today))

  return (
    <Card title="Tasks" className="tasks" id="tasks" foldId="tasks" foldedSummary={openCounts.day ? `${openCounts.day} open today` : 'Today is clear'} {...focus}>
      <div className="tabs" role="tablist">
        {TABS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={view === s.id}
            className={`tab ${view === s.id ? 'on' : ''}`}
            onClick={() => {
              setView(s.id)
              inputRef.current?.focus({ preventScroll: true })
            }}
          >
            {s.label}
            {s.id !== 'all' && openCounts[s.id] > 0 && <span className="count">{openCounts[s.id]}</span>}
          </button>
        ))}
      </div>

      <TaskAdd today={today} scope={addScope} inputId="quick-task" inputRef={inputRef} flashUnless={view === 'all' ? null : view} />

      {view === 'all' ? (
        groups.map((g) => (
          <section key={g.id} className="task-group">
            <h3 className="group-head">
              {g.label}
              {g.tasks.some((t) => !isDone(t, today)) && (
                <span className="count">{g.tasks.filter((t) => !isDone(t, today)).length}</span>
              )}
            </h3>
            <TaskList tasks={g.tasks} view="all" {...listProps} />
          </section>
        ))
      ) : (
        <TaskList tasks={list} view={view} {...listProps} />
      )}
      {empty && <p className="empty">Nothing here yet. Type above and press Enter.</p>}
      {allClear && <p className="empty">All clear.</p>}
    </Card>
  )
}

/** Daily, Weekly, Monthly and General side by side. On a phone, one column at a time: swipe or tap the switcher. */
function TaskBoard(props: {
  today: DayKey
  counts: Record<View, number>
  lists: Task[][]
  listProps: { today: DayKey; update: Update; remove: (id: string) => void; reorder: (ids: string[]) => void }
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const go = (i: number) => {
    const b = boardRef.current
    const col = b?.children[i] as HTMLElement | undefined
    if (b && col) b.scrollTo({ left: col.offsetLeft - b.offsetLeft, behavior: 'smooth' })
  }

  return (
    <>
      <div className="tabs board-switch" role="tablist" aria-label="Task lists">
        {COLUMNS.map((c, i) => (
          <button key={c.id} role="tab" aria-selected={active === i} className={`tab ${active === i ? 'on' : ''}`} onClick={() => go(i)}>
            {c.label}
            {props.counts[c.id] > 0 && <span className="count">{props.counts[c.id]}</span>}
          </button>
        ))}
      </div>
      <div
        className="board"
        ref={boardRef}
        onScroll={(e) => {
          const b = e.currentTarget
          setActive(Math.min(COLUMNS.length - 1, Math.max(0, Math.round(b.scrollLeft / b.clientWidth))))
        }}
      >
        {COLUMNS.map((c, i) => {
          const list = props.lists[i]
          return (
            <section key={c.id} className="board-col" aria-label={c.label}>
              <header className="board-col-head">
                <h3>{c.label}</h3>
                {props.counts[c.id] > 0 && <span className="count">{props.counts[c.id]}</span>}
                <span className="muted small board-hint">{c.hint}</span>
              </header>
              <TaskAdd today={props.today} scope={c.id} inputId={i === 0 ? 'quick-task' : undefined} flashUnless={c.id} compact />
              <TaskList tasks={list} view={c.id} {...props.listProps} />
              {list.length === 0 && <p className="empty">Nothing here.</p>}
            </section>
          )
        })}
      </div>
    </>
  )
}

/** The quick-add row: title, optional day, optional daily repeat. */
function TaskAdd(props: {
  today: DayKey
  scope: TaskScope
  inputId?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  /** Say where a dated task went when it lands somewhere other than this list. */
  flashUnless: TaskScope | null
  compact?: boolean
}) {
  const { today, scope } = props
  const [, setTasks] = usePersisted<Task[]>('tasks', [])
  const [text, setText] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [due, setDueDraft] = useState<DayKey | null>(null)
  const [picking, setPicking] = useState(false)
  const [flash, setFlash] = useState('')
  const ownRef = useRef<HTMLInputElement>(null)
  const inputRef = props.inputRef ?? ownRef
  const canRepeat = scope === 'day' && !due

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(''), 2500)
    return () => window.clearTimeout(id)
  }, [flash])

  const add = () => {
    const title = text.trim()
    if (!title) return
    const t = newTask(title, scope, repeat && canRepeat, today, due)
    setTasks((ts) => [...ts, t])
    const lands = bucketOf(t, today)
    if (due && props.flashUnless && lands !== props.flashUnless) setFlash(`Added to ${scopeLabel(lands)} · ${dueLabel(due, today)}`)
    setText('')
    setRepeat(false)
    setDueDraft(null)
    setPicking(false)
    inputRef.current?.focus()
  }

  const placeholder = due ? `Add for ${dueLabel(due, today).toLowerCase()}…` : `Add to ${scopeLabel(scope).toLowerCase()}…`

  return (
    <>
      <form
        className={`quick-add ${props.compact ? 'compact' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          ref={inputRef}
          id={props.inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && picking && setPicking(false)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="done"
        />
        <button
          type="button"
          className={`icon-btn ${due ? 'on' : ''}`}
          title="Pick a day"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          📅{due ? <span className="due-pill">{dueLabel(due, today)}</span> : !props.compact && <span className="hide-sm">Date</span>}
        </button>
        {canRepeat && (
          <button
            type="button"
            className={`icon-btn ${repeat ? 'on' : ''}`}
            title="Repeat every day"
            aria-pressed={repeat}
            onClick={() => {
              setRepeat((r) => !r)
              inputRef.current?.focus()
            }}
          >
            ↻ {!props.compact && <span className="hide-sm">Daily</span>}
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Add
        </button>
      </form>
      {picking && (
        <DateMenu
          today={today}
          value={due}
          onPick={(d) => {
            setDueDraft(d)
            setPicking(false)
            if (d) setRepeat(false)
            inputRef.current?.focus()
          }}
        />
      )}
      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}
    </>
  )
}

/** One list's tasks: open ones (drag the grip to reorder), then done ones. */
function TaskList(props: {
  tasks: Task[]
  today: DayKey
  view: View
  update: Update
  remove: (id: string) => void
  reorder: (ids: string[]) => void
}) {
  const { today, view } = props
  const { open, done } = useMemo(() => arrange(props.tasks, today), [props.tasks, today])
  const openIds = useMemo(() => open.map((t) => t.id), [open])
  const byId = useMemo(() => new Map(open.map((t) => [t.id, t])), [open])
  const sort = useSortable(openIds, props.reorder)
  const canDrag = open.length > 1

  return (
    <ul className="task-list" ref={sort.listRef}>
      {sort.order.map((id) => {
        const t = byId.get(id)
        if (!t) return null
        return (
          <TaskRow
            key={t.id}
            task={t}
            today={today}
            view={view}
            done={false}
            update={props.update}
            remove={props.remove}
            dragging={sort.dragId === t.id}
            handle={canDrag ? sort.handleProps(t.id) : undefined}
          />
        )
      })}
      {done.map((t) => (
        <TaskRow key={t.id} task={t} today={today} view={view} done update={props.update} remove={props.remove} />
      ))}
    </ul>
  )
}

/** Quick day picks plus a full date picker. */
function DateMenu(props: { today: DayKey; value: DayKey | null; onPick: (d: DayKey | null) => void }) {
  const { today, value } = props
  return (
    <div className="date-menu" onKeyDown={(e) => e.key === 'Escape' && props.onPick(value)}>
      {datePicks(today).map((p) => (
        <button key={p.day} type="button" className={`chip small ${value === p.day ? 'on' : ''}`} onClick={() => props.onPick(p.day)}>
          {p.label}
        </button>
      ))}
      <input
        type="date"
        className="date-input"
        aria-label="Pick any date"
        min={today}
        value={value ?? ''}
        onChange={(e) => e.target.value && props.onPick(e.target.value)}
      />
      {value && (
        <button type="button" className="chip small ghost" onClick={() => props.onPick(null)}>
          No date
        </button>
      )}
    </div>
  )
}

function TaskRow(props: {
  task: Task
  today: DayKey
  view: View
  done: boolean
  update: Update
  remove: (id: string) => void
  dragging?: boolean
  handle?: ReturnType<ReturnType<typeof useSortable>['handleProps']>
}) {
  const { task: t, today, done, view } = props
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState(t.title)
  const age = daysBetween(t.createdOn, today)
  const carried = !t.dueOn && t.scope === 'day' && !t.repeatDaily && !done && age > 0
  const overdue = !!t.dueOn && t.dueOn < today && !done
  // On Today, a task due today needs no date badge.
  const showDue = !!t.dueOn && !overdue && !(t.dueOn === today && (view === 'day' || view === 'all'))

  const save = () => {
    const title = draft.trim()
    if (title && title !== t.title) props.update(t.id, (x) => ({ ...x, title }))
    setEditing(false)
  }

  return (
    <li
      className={`task ${done ? 'done' : ''} ${picking ? 'picking' : ''} ${props.dragging ? 'dragging' : ''}`}
      data-sort-id={done ? undefined : t.id}
    >
      {props.handle ? (
        <button type="button" className="drag-handle" aria-label={`Reorder ${t.title}. Drag, or use the arrow keys.`} title="Drag to reorder" {...props.handle}>
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
        <input type="checkbox" checked={done} onChange={() => props.update(t.id, (x) => toggleTask(x, today))} />
        <span className="box" aria-hidden />
      </label>
      {/* Title and badges wrap together, so on a narrow row the badges drop under the title instead of squeezing it. */}
      <div className="task-main">
        {editing ? (
          <input
            className="inline-edit"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="task-title"
            onDoubleClick={() => {
              setDraft(t.title)
              setEditing(true)
            }}
            title="Double-click to edit"
          >
            {t.title}
          </span>
        )}
        {t.repeatDaily && (
          <span className="badge" title="Repeats every day">
            ↻
          </span>
        )}
        {showDue && (
          <span className="badge" title={`Due ${t.dueOn}`}>
            {dueLabel(t.dueOn!, today)}
          </span>
        )}
        {overdue && (
          <span className="badge warn" title={`Was due ${t.dueOn}`}>
            {daysBetween(t.dueOn!, today) === 1 ? 'due yesterday' : `due ${weekdayShort(t.dueOn!)}`}
          </span>
        )}
        {carried && (
          <span className="badge warn" title="Carried over from an earlier day">
            {age === 1 ? 'yesterday' : `since ${weekdayShort(t.createdOn)}`}
          </span>
        )}
      </div>
      <div className="row-actions">
        {!t.repeatDaily && (
          <>
            <button
              className={`icon-btn subtle date-btn ${picking ? "on" : ""}`}
              aria-label="Set a day"
              aria-expanded={picking}
              title={t.dueOn ? 'Change day' : 'Set a day'}
              onClick={() => setPicking((p) => !p)}
            >
              📅
            </button>
            <select
              aria-label="Move to list"
              value={bucketOf(t, today)}
              onChange={(e) => props.update(t.id, (x) => moveTo(x, e.target.value as TaskScope))}
            >
              {SCOPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        )}
        <button className="icon-btn subtle" aria-label="Delete task" onClick={() => props.remove(t.id)}>
          ×
        </button>
      </div>
      {picking && (
        <DateMenu
          today={today}
          value={t.dueOn ?? null}
          onPick={(d) => {
            props.update(t.id, (x) => setDue(x, d, today))
            setPicking(false)
          }}
        />
      )}
    </li>
  )
}
