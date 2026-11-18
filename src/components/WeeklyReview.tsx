import { useMemo, useState } from 'react'
import type { LinkItem, Note, Streak, Task, WeekReflection } from '../types'
import { usePersisted } from '../lib/storage'
import { addDays, fmt, startOfWeek, toKey, weekDays, weekdayShort, type DayKey } from '../lib/dates'
import { completionsBetween, isDone } from '../lib/tasks'
import { Card } from './Card'

const EMPTY: WeekReflection = { wins: '', blockers: '', focus: '' }

export function WeeklyReview({ today }: { today: DayKey }) {
  const [tasks] = usePersisted<Task[]>('tasks', [])
  const [streaks] = usePersisted<Streak[]>('streaks', [])
  const [notes] = usePersisted<Note[]>('notes', [])
  const [links] = usePersisted<LinkItem[]>('links', [])
  const [reflections, setReflections] = usePersisted<Record<string, WeekReflection>>('reflections', {})
  const [week, setWeek] = useState(() => startOfWeek(today))

  const days = weekDays(week)
  const end = days[6]
  const isThisWeek = week === startOfWeek(today)
  const inWeek = (iso: string | null) => {
    if (!iso) return false
    const k = toKey(new Date(iso))
    return k >= week && k <= end
  }

  const done = useMemo(() => completionsBetween(tasks, week, end), [tasks, week, end])
  const oneOffs = done.filter((d) => !d.task.repeatDaily)
  const perDay = days.map((d) => done.filter((x) => x.day === d).length)
  const max = Math.max(1, ...perDay)
  const checkins = streaks.reduce((n, s) => n + s.checkins.filter((d) => d >= week && d <= end).length, 0)
  const notesAdded = notes.filter((n) => inWeek(n.createdAt)).length
  const linksRead = links.filter((l) => inWeek(l.readAt)).length
  const linksAdded = links.filter((l) => inWeek(l.createdAt)).length
  const stillOpen = tasks.filter((t) => !t.repeatDaily && !isDone(t, today) && (t.scope === 'week' || t.scope === 'day'))
  const repeating = tasks.filter((t) => t.repeatDaily)

  const r = reflections[week] ?? EMPTY
  const setR = (patch: Partial<WeekReflection>) => setReflections((all) => ({ ...all, [week]: { ...(all[week] ?? EMPTY), ...patch } }))

  return (
    <div className="review">
      <div className="review-head">
        <button className="btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
          ←
        </button>
        <div>
          <h1>{isThisWeek ? 'This week' : `Week of ${fmt(week, { month: 'short', day: 'numeric' })}`}</h1>
          <p className="muted">
            {fmt(week, { month: 'short', day: 'numeric' })} – {fmt(end, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <button className="btn" onClick={() => setWeek(addDays(week, 7))} disabled={isThisWeek} aria-label="Next week">
          →
        </button>
      </div>

      <div className="stats">
        <Stat n={oneOffs.length} label="tasks finished" />
        <Stat n={checkins} label="streak days logged" />
        <Stat n={notesAdded} label="notes written" />
        <Stat n={linksRead} label={`links read (${linksAdded} saved)`} />
      </div>

      <div className="review-grid">
        <Card title="Done each day">
          <div className="bars">
            {days.map((d, i) => (
              <div key={d} className={`bar-col ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`}>
                <span className="bar-n">{perDay[i] || ''}</span>
                <div className="bar" style={{ height: `${(perDay[i] / max) * 100}%` }} />
                <span className="muted small">{weekdayShort(d)}</span>
              </div>
            ))}
          </div>
          {oneOffs.length > 0 ? (
            <ul className="done-list">
              {oneOffs
                .sort((a, b) => a.day.localeCompare(b.day))
                .map(({ task, day }) => (
                  <li key={task.id + day}>
                    <span className="muted small">{weekdayShort(day)}</span> {task.title}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="empty">No one-off tasks finished this week.</p>
          )}
        </Card>

        <Card title="Habits">
          {streaks.length + repeating.length === 0 ? (
            <p className="empty">Streaks and daily tasks show up here.</p>
          ) : (
            <table className="habit-grid">
              <thead>
                <tr>
                  <th />
                  {days.map((d) => (
                    <th key={d} className="muted small">
                      {weekdayShort(d).slice(0, 2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {streaks.map((s) => (
                  <HabitRow key={s.id} name={s.name} days={days} hits={s.checkins} today={today} />
                ))}
                {repeating.map((t) => (
                  <HabitRow key={t.id} name={`↻ ${t.title}`} days={days} hits={t.completions} today={today} />
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {isThisWeek && (
          <Card title={`Still open (${stillOpen.length})`}>
            {stillOpen.length === 0 ? (
              <p className="empty">Nothing left on today’s or this week’s list.</p>
            ) : (
              <ul className="done-list">
                {stillOpen.map((t) => (
                  <li key={t.id}>
                    <span className="muted small">{t.scope === 'day' ? 'Day' : 'Week'}</span> {t.title}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Reflect" className="reflect">
          <label>
            <span>What went well?</span>
            <textarea rows={3} value={r.wins} onChange={(e) => setR({ wins: e.target.value })} />
          </label>
          <label>
            <span>What got in the way?</span>
            <textarea rows={3} value={r.blockers} onChange={(e) => setR({ blockers: e.target.value })} />
          </label>
          <label>
            <span>One focus for next week</span>
            <textarea rows={2} value={r.focus} onChange={(e) => setR({ focus: e.target.value })} />
          </label>
          <p className="muted small">Saves as you type.</p>
        </Card>
      </div>
    </div>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="stat">
      <strong>{n}</strong>
      <span className="muted small">{label}</span>
    </div>
  )
}

function HabitRow({ name, days, hits, today }: { name: string; days: DayKey[]; hits: DayKey[]; today: DayKey }) {
  return (
    <tr>
      <td className="habit-name">{name}</td>
      {days.map((d) => (
        <td key={d}>
          <span className={`cell ${hits.includes(d) ? 'on' : ''} ${d > today ? 'future' : ''}`} />
        </td>
      ))}
    </tr>
  )
}
