import type { Task, TaskScope } from '../types'
import { sameMonth, sameWeek, type DayKey } from './dates'
import { uid } from './id'

export const SCOPES: { id: TaskScope; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'general', label: 'General' },
]

export const isDone = (t: Task, today: DayKey) => (t.repeatDaily ? t.completions.includes(today) : t.completedOn != null)

/**
 * A task shows in its list while it's open. Once done, it stays visible
 * (struck through) until its period ends, then it drops out of view but
 * is kept for the weekly review.
 */
export function isVisible(t: Task, today: DayKey) {
  if (t.repeatDaily) return true
  if (!t.completedOn) return true
  switch (t.scope) {
    case 'day':
      return t.completedOn === today
    case 'week':
    case 'general':
      return sameWeek(t.completedOn, today)
    case 'month':
      return sameMonth(t.completedOn, today)
  }
}

export function newTask(title: string, scope: TaskScope, repeatDaily: boolean, today: DayKey): Task {
  return {
    id: uid(),
    title,
    scope: repeatDaily ? 'day' : scope,
    repeatDaily,
    createdAt: new Date().toISOString(),
    createdOn: today,
    completedOn: null,
    completions: [],
  }
}

export function toggleTask(t: Task, today: DayKey): Task {
  if (t.repeatDaily) {
    const has = t.completions.includes(today)
    const completions = has ? t.completions.filter((d) => d !== today) : [...t.completions, today].slice(-400)
    return { ...t, completions }
  }
  return { ...t, completedOn: t.completedOn ? null : today }
}

/** Every completion as [task, day], used by the summary and the weekly review. */
export function completionsBetween(tasks: Task[], from: DayKey, to: DayKey) {
  const out: { task: Task; day: DayKey }[] = []
  for (const t of tasks) {
    const days = t.repeatDaily ? t.completions : t.completedOn ? [t.completedOn] : []
    for (const d of days) if (d >= from && d <= to) out.push({ task: t, day: d })
  }
  return out
}
