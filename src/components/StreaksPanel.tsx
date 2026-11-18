import { useState } from 'react'
import type { Streak } from '../types'
import { usePersisted } from '../lib/storage'
import { addDays, weekdayShort, type DayKey } from '../lib/dates'
import { uid } from '../lib/id'
import { atRisk, currentCount, loggedToday, manualReset, setLength, toggleDay } from '../lib/streaks'
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
  const [editingLen, setEditingLen] = useState(false)
  const [lenDraft, setLenDraft] = useState('')
  const count = currentCount(s, today)
  const done = loggedToday(s, today)
  const risk = atRisk(s, today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  return (
    <div className={`streak ${done ? 'logged' : ''}`}>
      <div className="streak-main">
        <button
          className="streak-count"
          aria-label={`${count} days. Set length`}
          title="Set length"
          onClick={() => {
            setMenu(true)
            setLenDraft(String(count))
            setEditingLen(true)
          }}
        >
          {count}
          <span>{count === 1 ? 'day' : 'days'}</span>
        </button>
        <div className="streak-info">
          <div className="streak-name">
            {s.name} <span className="muted small">best {Math.max(s.best, count)}</span>
          </div>
          <div className="week-dots" aria-label="Last 7 days">
            {days.map((d) => {
              const on = s.checkins.includes(d)
              const locked = !!s.countFrom && d < s.countFrom
              // Days covered by a length set by hand show as filled.
              const setByHand = locked && !!s.bonus && d >= addDays(s.countFrom!, -s.bonus)
              return (
                <button
                  key={d}
                  className={`day-dot ${on || setByHand ? 'on' : ''} ${d === today ? 'today' : ''}`}
                  disabled={locked}
                  aria-label={weekdayShort(d)}
                  title={locked ? (setByHand ? 'Part of the length you set' : 'Before the count started') : `${on ? 'Unlog' : 'Log'} ${weekdayShort(d)}`}
                  onClick={() => props.update((x) => toggleDay(x, d, today))}
                >
                  {weekdayShort(d).slice(0, 1)}
                </button>
              )
            })}
          </div>
        </div>
        <button
          className={`btn log ${done ? 'on' : ''} ${risk && s.autoReset && count > 0 ? 'risk' : ''}`}
          onClick={() => props.update((x) => toggleDay(x, today, today))}
          aria-pressed={done}
          title={done ? 'Logged today' : risk && s.autoReset && count > 0 ? 'Log today to keep it' : 'Log today'}
        >
          {done ? '✓' : 'Log'}
        </button>
        <button className="icon-btn subtle" aria-label="Streak options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
      </div>
      {menu && editingLen && (
        <form
          className="streak-menu"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(lenDraft)
            if (lenDraft.trim() !== '' && Number.isFinite(n) && n >= 0) {
              props.update((x) => setLength(x, n, today))
              setEditingLen(false)
            }
          }}
        >
          <label className="len-field">
            <span>Current length</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              step={1}
              autoFocus
              value={lenDraft}
              onChange={(e) => setLenDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditingLen(false)}
            />
            <span className="muted small">days, including today if logged</span>
          </label>
          <div className="spacer" />
          <button type="submit" className="btn small primary" disabled={lenDraft.trim() === '' || Number(lenDraft) < 0}>
            Save
          </button>
          <button type="button" className="btn small" onClick={() => setEditingLen(false)}>
            Cancel
          </button>
        </form>
      )}
      {menu && !editingLen && (
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
              <button
                className="btn small"
                onClick={() => {
                  setLenDraft(String(count))
                  setEditingLen(true)
                }}
              >
                Set length
              </button>
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
