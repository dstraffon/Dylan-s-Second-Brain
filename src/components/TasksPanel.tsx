import { useMemo, useRef, useState } from 'react'
import type { Task, TaskScope } from '../types'
import { usePersisted } from '../lib/storage'
import { daysBetween, weekdayShort, type DayKey } from '../lib/dates'
import { SCOPES, isDone, isVisible, newTask, toggleTask } from '../lib/tasks'
import { Card } from './Card'

export function TasksPanel({ today }: { today: DayKey }) {
  const [tasks, setTasks] = usePersisted<Task[]>('tasks', [])
  const [scope, setScope] = usePersisted<TaskScope>('ui:taskScope', 'day')
  const [text, setText] = useState('')
  const [repeat, setRepeat] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const openCounts = useMemo(() => {
    const c: Record<TaskScope, number> = { day: 0, week: 0, month: 0, general: 0 }
    for (const t of tasks) if (!isDone(t, today)) c[t.scope]++
    return c
  }, [tasks, today])

  const visible = useMemo(() => {
    const list = tasks.filter((t) => t.scope === scope && isVisible(t, today))
    const open = list.filter((t) => !isDone(t, today))
    const done = list.filter((t) => isDone(t, today))
    // Repeating tasks first, then oldest first so carried-over work stays on top.
    open.sort((a, b) => Number(b.repeatDaily) - Number(a.repeatDaily) || a.createdAt.localeCompare(b.createdAt))
    return { open, done }
  }, [tasks, scope, today])

  const add = () => {
    const title = text.trim()
    if (!title) return
    setTasks((ts) => [...ts, newTask(title, scope, repeat && scope === 'day', today)])
    setText('')
    setRepeat(false)
    inputRef.current?.focus()
  }

  const update = (id: string, fn: (t: Task) => Task) => setTasks((ts) => ts.map((t) => (t.id === id ? fn(t) : t)))
  const remove = (id: string) => setTasks((ts) => ts.filter((t) => t.id !== id))

  return (
    <Card title="Tasks" className="tasks" id="tasks">
      <div className="tabs" role="tablist">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={scope === s.id}
            className={`tab ${scope === s.id ? 'on' : ''}`}
            onClick={() => {
              setScope(s.id)
              inputRef.current?.focus({ preventScroll: true })
            }}
          >
            {s.label}
            {openCounts[s.id] > 0 && <span className="count">{openCounts[s.id]}</span>}
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
          placeholder={`Add to ${SCOPES.find((s) => s.id === scope)!.label.toLowerCase()}…`}
          autoComplete="off"
          enterKeyHint="done"
        />
        {scope === 'day' && (
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

      <ul className="task-list">
        {visible.open.map((t) => (
          <TaskRow key={t.id} task={t} today={today} done={false} update={update} remove={remove} />
        ))}
        {visible.done.map((t) => (
          <TaskRow key={t.id} task={t} today={today} done update={update} remove={remove} />
        ))}
      </ul>
      {visible.open.length === 0 && visible.done.length === 0 && (
        <p className="empty">Nothing here yet. Type above and press Enter.</p>
      )}
      {visible.open.length === 0 && visible.done.length > 0 && <p className="empty">All clear.</p>}
    </Card>
  )
}

function TaskRow(props: {
  task: Task
  today: DayKey
  done: boolean
  update: (id: string, fn: (t: Task) => Task) => void
  remove: (id: string) => void
}) {
  const { task: t, today, done } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(t.title)
  const age = daysBetween(t.createdOn, today)
  const carried = t.scope === 'day' && !t.repeatDaily && !done && age > 0

  const save = () => {
    const title = draft.trim()
    if (title && title !== t.title) props.update(t.id, (x) => ({ ...x, title }))
    setEditing(false)
  }

  return (
    <li className={`task ${done ? 'done' : ''}`}>
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
      {carried && (
        <span className="badge warn" title="Carried over from an earlier day">
          {age === 1 ? 'yesterday' : `since ${weekdayShort(t.createdOn)}`}
        </span>
      )}
      <div className="row-actions">
        {!t.repeatDaily && (
          <select
            aria-label="Move to list"
            value={t.scope}
            onChange={(e) => props.update(t.id, (x) => ({ ...x, scope: e.target.value as Task['scope'] }))}
          >
            {SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button className="icon-btn subtle" aria-label="Delete task" onClick={() => props.remove(t.id)}>
          ×
        </button>
      </div>
    </li>
  )
}
