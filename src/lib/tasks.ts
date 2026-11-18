import type { Task, TaskScope } from '../types'
import { addDays, daysBetween, fmt, sameMonth, sameWeek, startOfWeek, weekdayShort, type DayKey } from './dates'
import { uid } from './id'

export const SCOPES: { id: TaskScope; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'general', label: 'General' },
]

export const isDone = (t: Task, today: DayKey) => (t.repeatDaily ? t.completions.includes(today) : t.completedOn != null)

/**
 * The list a task belongs in today. Undated tasks use their scope.
 * Dated tasks move on their own: due today or earlier → Today, later
 * this week → Week, later this month → Month, further out → General.
 */
export function bucketOf(t: Task, today: DayKey): TaskScope {
  const due = t.dueOn
  if (!due || t.repeatDaily) return t.scope
  if (due <= today) return 'day'
  if (sameWeek(due, today)) return 'week'
  if (sameMonth(due, today)) return 'month'
  return 'general'
}

/**
 * A task shows in its list while it's open. Once done, it stays visible
 * (struck through) until its period ends, then it drops out of view but
 * is kept for the weekly review.
 */
export function isVisible(t: Task, today: DayKey) {
  if (t.repeatDaily) return true
  if (!t.completedOn) return true
  switch (bucketOf(t, today)) {
    case 'day':
      return t.completedOn === today
    case 'week':
    case 'general':
      return sameWeek(t.completedOn, today)
    case 'month':
      return sameMonth(t.completedOn, today)
  }
}

export function newTask(title: string, scope: TaskScope, repeatDaily: boolean, today: DayKey, dueOn: DayKey | null = null): Task {
  const base: Task = {
    id: uid(),
    title,
    scope: repeatDaily ? 'day' : scope,
    repeatDaily,
    createdAt: new Date().toISOString(),
    createdOn: today,
    completedOn: null,
    completions: [],
  }
  if (dueOn && !repeatDaily) {
    base.dueOn = dueOn
    base.scope = bucketOf(base, today)
  }
  return base
}

export function toggleTask(t: Task, today: DayKey): Task {
  if (t.repeatDaily) {
    const has = t.completions.includes(today)
    const completions = has ? t.completions.filter((d) => d !== today) : [...t.completions, today].slice(-400)
    return { ...t, completions }
  }
  return { ...t, completedOn: t.completedOn ? null : today }
}

/** Set or clear a task's due day. The scope follows so the task stays put if the date is cleared later. */
export function setDue(t: Task, dueOn: DayKey | null, today: DayKey): Task {
  if (!dueOn) {
    const { dueOn: _drop, ...rest } = t
    return { ...rest, scope: bucketOf(t, today) }
  }
  const next = { ...t, dueOn, repeatDaily: false }
  return { ...next, scope: bucketOf(next, today) }
}

/** Moving a task to a list by hand drops its date, since the date would pull it back. */
export function moveTo(t: Task, scope: TaskScope): Task {
  const { dueOn: _drop, ...rest } = t
  return { ...rest, scope }
}

/** Quick picks for the date menu: today, tomorrow, the rest of this week, and next Monday. */
export function datePicks(today: DayKey): { day: DayKey; label: string }[] {
  const picks = [
    { day: today, label: 'Today' },
    { day: addDays(today, 1), label: 'Tomorrow' },
  ]
  const weekEnd = addDays(startOfWeek(today), 6)
  for (let d = addDays(today, 2); d <= weekEnd; d = addDays(d, 1)) picks.push({ day: d, label: weekdayShort(d) })
  picks.push({ day: addDays(startOfWeek(today), 7), label: 'Next Mon' })
  return picks
}

/** Short, friendly label for a due day relative to today. */
export function dueLabel(due: DayKey, today: DayKey) {
  const n = daysBetween(today, due)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1 && sameWeek(due, today)) return fmt(due, { weekday: 'long' })
  if (n > 1 && n < 14) return fmt(due, { weekday: 'short', month: 'short', day: 'numeric' })
  return fmt(due, { month: 'short', day: 'numeric' })
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
