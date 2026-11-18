import { useState } from 'react'
import type { Streak } from '../types'
import { usePersisted } from '../lib/storage'
import { addDays, weekdayShort, type DayKey } from '../lib/dates'
import { uid } from '../lib/id'
import { atRisk, currentCount, loggedToday, manualReset, toggleDay } from '../lib/streaks'
import { Card } from './Card'

export function StreaksPanel({ today }: { today: DayKey }) {
  const [streaks, setStreaks] = usePersisted<Streak[]>('streaks', [])
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const add = () => {
    const n = name.trim()
    if (n) {
      setStreaks((s) => [
        ...s,
        { id: uid(), name: n, createdAt: new Date().toISOString(), checkins: [], autoReset: false, countFrom: null, best: 0 },
      ])
    }
    setName('')
    setAdding(false)
  }

  const update = (id: string, fn: (s: Streak) => Streak) => setStreaks((ss) => ss.map((s) => (s.id === id ? fn(s) : s)))

  return (
    <Card
      title="Streaks"
      className="streaks"
      id="streaks"
      actions={
        !adding && (
          <button className="chip ghost small" onClick={() => setAdding(true)}>
            + New streak
          </button>
        )
      }
    >
      {adding && (
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            placeholder="e.g. Work out, Ship something, No phone in bed"
          />
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            Add
          </button>
        </form>
      )}
      <div className="streak-list">
        {streaks.map((s) => (
          <StreakRow
            key={s.id}
            streak={s}
            today={today}
            update={(fn) => update(s.id, fn)}
            remove={() => setStreaks((ss) => ss.filter((x) => x.id !== s.id))}
          />
        ))}
      </div>
      {streaks.length === 0 && !adding && <p className="empty">Track anything you want to do daily, like working out or a side project.</p>}
    </Card>
  )
}

function StreakRow(props: { streak: Streak; today: DayKey; update: (fn: (s: Streak) => Streak) => void; remove: () => void }) {
  const { streak: s, today } = props
  const [menu, setMenu] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const count = currentCount(s, today)
  const done = loggedToday(s, today)
  const risk = atRisk(s, today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  return (
    <div className={`streak ${done ? 'logged' : ''}`}>
      <div className="streak-main">
        <div className="streak-count" aria-label={`${count} days`}>
          {count}
          <span>{count === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="streak-info">
          <div className="streak-name">{s.name}</div>
          <div className="muted small">
            Best {Math.max(s.best, count)}
            {s.autoReset ? ' · resets if missed' : ''}
            {risk && s.autoReset && count > 0 && <span className="warn-text"> · log today to keep it</span>}
          </div>
        </div>
        <button
          className={`btn log ${done ? 'on' : ''}`}
          onClick={() => props.update((x) => toggleDay(x, today, today))}
          aria-pressed={done}
        >
          {done ? '✓ Logged' : 'Log today'}
        </button>
        <button className="icon-btn subtle" aria-label="Streak options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
      </div>
      <div className="week-dots" aria-label="Last 7 days">
        {days.map((d) => {
          const on = s.checkins.includes(d)
          const locked = !!s.countFrom && d < s.countFrom
          return (
            <button
              key={d}
              className={`day-dot ${on ? 'on' : ''} ${d === today ? 'today' : ''}`}
              disabled={locked}
              title={locked ? 'Before last reset' : `${on ? 'Unlog' : 'Log'} ${weekdayShort(d)}`}
              onClick={() => props.update((x) => toggleDay(x, d, today))}
            >
              <span>{weekdayShort(d).slice(0, 2)}</span>
            </button>
          )
        })}
      </div>
      {menu && (
        <div className="streak-menu">
          <label className="switch">
            <input
              type="checkbox"
              checked={s.autoReset}
              onChange={(e) => props.update((x) => ({ ...x, autoReset: e.target.checked }))}
            />
            <span>Reset to 0 if I miss a day</span>
          </label>
          <div className="spacer" />
          {confirmReset ? (
            <>
              <span className="muted small">Start over from 0?</span>
              <button
                className="btn small danger"
                onClick={() => {
                  props.update((x) => manualReset(x, today))
                  setConfirmReset(false)
                }}
              >
                Reset
              </button>
              <button className="btn small" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn small" onClick={() => setConfirmReset(true)}>
                Reset
              </button>
              <button className="btn small danger" onClick={props.remove}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
