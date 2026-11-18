import type { LinkItem, Settings, Streak, Task } from '../types'
import { usePersisted } from '../lib/storage'
import { addDays, fmt, type DayKey } from '../lib/dates'
import { completionsBetween, isDone } from '../lib/tasks'
import { atRisk, currentCount } from '../lib/streaks'
import { useWeather, weatherLine } from '../lib/weather'

/**
 * The "here's your day" block at the top. Self-contained: it only reads
 * from the store, so removing it is deleting one line in App.tsx (or
 * switching it off in Settings).
 */
export function DailySummary({ today, settings }: { today: DayKey; settings: Settings }) {
  const [tasks] = usePersisted<Task[]>('tasks', [])
  const [streaks] = usePersisted<Streak[]>('streaks', [])
  const [links] = usePersisted<LinkItem[]>('links', [])
  const { data: weather } = useWeather()

  const dayTasks = tasks.filter((t) => t.scope === 'day')
  const openToday = dayTasks.filter((t) => !isDone(t, today))
  const doneToday = dayTasks.length - openToday.length
  const carried = openToday.filter((t) => !t.repeatDaily && t.createdOn < today).length
  const openWeek = tasks.filter((t) => t.scope === 'week' && !isDone(t, today)).length
  const yesterday = completionsBetween(tasks, addDays(today, -1), addDays(today, -1)).length
  const risky = streaks.filter((s) => atRisk(s, today))
  const breaking = risky.filter((s) => s.autoReset && currentCount(s, today) > 0)
  const unread = links.filter((l) => !l.readAt).length

  const hour = new Date().getHours()
  const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <section className="card summary">
      <div className="summary-head">
        <h1>
          {greet}
          {settings.name ? `, ${settings.name}` : ''}.
        </h1>
        <p className="muted">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <ul className="summary-items">
        <li>
          <button onClick={() => jump('tasks')}>
            <span className="label">Today</span>
            {dayTasks.length === 0 ? (
              <span>No tasks yet</span>
            ) : openToday.length === 0 ? (
              <span className="good">All {doneToday} done</span>
            ) : (
              <span>
                <strong>{openToday.length}</strong> to do
                {doneToday > 0 && <span className="muted">, {doneToday} done</span>}
                {carried > 0 && <span className="warn-text"> · {carried} carried over</span>}
              </span>
            )}
          </button>
        </li>
        <li>
          <button onClick={() => jump('streaks')}>
            <span className="label">Streaks</span>
            {streaks.length === 0 ? (
              <span className="muted">None yet</span>
            ) : risky.length === 0 ? (
              <span className="good">All logged</span>
            ) : (
              <span>
                {breaking.length > 0 ? (
                  <span className="warn-text">
                    {breaking.map((s) => s.name).join(', ')} {breaking.length === 1 ? 'breaks' : 'break'} tonight
                  </span>
                ) : (
                  <>
                    <strong>{risky.length}</strong> not logged yet
                  </>
                )}
              </span>
            )}
          </button>
        </li>
        <li>
          <button onClick={() => jump('weather')}>
            <span className="label">Weather</span>
            <span>{weather ? weatherLine(weather) : <span className="muted">Loading…</span>}</span>
          </button>
        </li>
        <li>
          <button onClick={() => jump('tasks')}>
            <span className="label">This week</span>
            <span>
              {openWeek} open{yesterday > 0 && <span className="muted"> · {yesterday} finished yesterday</span>}
            </span>
          </button>
        </li>
        {unread > 0 && (
          <li>
            <button onClick={() => jump('links')}>
              <span className="label">Saved</span>
              <span>{unread} to read or watch</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
