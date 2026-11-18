import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task, TaskScope } from '../types'
import { usePersisted } from '../lib/storage'
import { daysBetween, weekdayShort, type DayKey } from '../lib/dates'
import { SCOPES, bucketOf, datePicks, dueLabel, isDone, isVisible, moveTo, newTask, setDue, toggleTask } from '../lib/tasks'
import { Card } from './Card'

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

const scopeLabel = (s: TaskScope) => SCOPES.find((x) => x.id === s)!.label

/** Open first (repeating, then dated by day, then oldest), done after. */
function arrange(list: Task[], today: DayKey) {
  const open = list.filter((t) => !isDone(t, today))
  const done = list.filter((t) => isDone(t, today))
  open.sort(
    (a, b) =>
      Number(b.repeatDaily) - Number(a.repeatDaily) ||
      Number(!!b.dueOn) - Number(!!a.dueOn) ||
      (a.dueOn ?? '').localeCompare(b.dueOn ?? '') ||
      a.createdAt.localeCompare(b.createdAt),
  )
  return { open, done }
}

export function TasksPanel({ today }: { today: DayKey }) {
  const [tasks, setTasks] = usePersisted<Task[]>('tasks', [])
  const [view, setView] = usePersisted<View>('ui:taskScope', 'day')
  const [text, setText] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [due, setDueDraft] = useState<DayKey | null>(null)
  const [picking, setPicking] = useState(false)
  const [flash, setFlash] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(''), 2500)
    return () => window.clearTimeout(id)
  }, [flash])

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
  const list = useMemo(
    () => (view === 'all' ? null : arrange(shown.filter((t) => bucketOf(t, today) === view), today)),
    [shown, view, today],
  )
  const groups = useMemo(
    () =>
      view === 'all'
        ? GROUPS.map((g) => ({ ...g, ...arrange(shown.filter((t) => g.match(t, today)), today) })).filter(
            (g) => g.open.length + g.done.length > 0,
          )
        : [],
    [shown, view, today],
  )

  // New tasks go to the open tab, or Today from the All view, unless a date is picked.
  const addScope: TaskScope = view === 'all' ? 'day' : view
  const canRepeat = addScope === 'day' && !due

  const add = () => {
    const title = text.trim()
    if (!title) return
    const t = newTask(title, addScope, repeat && canRepeat, today, due)
    setTasks((ts) => [...ts, t])
    const lands = bucketOf(t, today)
    if (due && view !== 'all' && lands !== view) setFlash(`Added to ${scopeLabel(lands)} · ${dueLabel(due, today)}`)
    setText('')
    setRepeat(false)
    setDueDraft(null)
    setPicking(false)
    inputRef.current?.focus()
  }

  const update = (id: string, fn: (t: Task) => Task) => setTasks((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))
  const remove = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id))
  const row = (t: Task, done: boolean) => (
    <TaskRow key={t.id} task={t} today={today} view={view} done={done} update={update} remove={remove} />
  )

  const empty = view === 'all' ? groups.length === 0 : list!.open.length + list!.done.length === 0
  const allClear = view !== 'all' && list!.open.length === 0 && list!.done.length > 0
  const placeholder = due ? `Add for ${dueLabel(due, today).toLowerCase()}…` : `Add to ${scopeLabel(addScope).toLowerCase()}…`

  return (
    <Card title="Tasks" className="tasks" id="tasks">
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

      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          ref={inputRef}
          id="quick-task"
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
          📅{due ? <span className="due-pill">{dueLabel(due, today)}</span> : <span className="hide-sm">Date</span>}
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
            ↻ <span className="hide-sm">Daily</span>
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

      {view === 'all' ? (
        groups.map((g) => (
          <section key={g.id} className="task-group">
            <h3 className="group-head">
              {g.label}
              {g.open.length > 0 && <span className="count">{g.open.length}</span>}
            </h3>
            <ul className="task-list">
              {g.open.map((t) => row(t, false))}
              {g.done.map((t) => row(t, true))}
            </ul>
          </section>
        ))
      ) : (
        <ul className="task-list">
          {list!.open.map((t) => row(t, false))}
          {list!.done.map((t) => row(t, true))}
        </ul>
      )}
      {empty && <p className="empty">Nothing here yet. Type above and press Enter.</p>}
      {allClear && <p className="empty">All clear.</p>}
    </Card>
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
  update: (id: string, fn: (t: Task) => Task) => void
  remove: (id: string) => void
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
    <li className={`task ${done ? 'done' : ''} ${picking ? 'picking' : ''}`}>
      <label className="check">
        <input type="checkbox" checked={done} onChange={() => props.update(t.id, (x) => toggleTask(x, today))} />
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
