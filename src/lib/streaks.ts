import type { Streak } from '../types'
import { addDays, type DayKey } from './dates'

const counted = (s: Streak) => {
  const set = new Set(s.checkins.filter((d) => !s.countFrom || d >= s.countFrom))
  return set
}

/**
 * Auto-reset on: the number of consecutive days logged, ending today
 * (or yesterday, if today isn't logged yet). A missed day sets it to 0.
 *
 * Auto-reset off (default): every logged day since the last manual reset
 * counts, and a missed day just doesn't add to it.
 */
export function currentCount(s: Streak, today: DayKey) {
  const days = counted(s)
  const bonus = s.bonus ?? 0
  if (!s.autoReset) return bonus + days.size
  let cursor = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(cursor)) {
    n++
    cursor = addDays(cursor, -1)
  }
  // A set length counts as an unbroken run up to the day it was set,
  // so it only carries over while every day since has been logged.
  if (bonus && s.countFrom && cursor < s.countFrom) n += bonus
  return n
}

export const loggedToday = (s: Streak, today: DayKey) => s.checkins.includes(today)

/** Not logged today. For auto-reset streaks with a run going, this is the one that will break at midnight. */
export function atRisk(s: Streak, today: DayKey) {
  if (loggedToday(s, today)) return false
  return s.autoReset ? currentCount(s, today) > 0 : true
}

export function toggleDay(s: Streak, day: DayKey, today: DayKey): Streak {
  const has = s.checkins.includes(day)
  const checkins = has ? s.checkins.filter((d) => d !== day) : [...s.checkins, day].sort()
  const next = { ...s, checkins }
  return { ...next, best: Math.max(s.best, currentCount(next, today)) }
}

export function manualReset(s: Streak, today: DayKey): Streak {
  // Today's log (if any) is cleared too, so the count truly starts over.
  return { ...s, countFrom: today, bonus: 0, checkins: s.checkins.filter((d) => d !== today) }
}

/**
 * Set the current length by hand, e.g. for a streak that started before
 * it was added here. Today's log (if any) is kept and counts toward n.
 */
export function setLength(s: Streak, n: number, today: DayKey): Streak {
  const len = Math.max(0, Math.floor(n))
  const logged = s.checkins.includes(today) && len > 0
  const checkins = logged ? s.checkins : s.checkins.filter((d) => d !== today)
  const next = { ...s, countFrom: today, checkins, bonus: len - (logged ? 1 : 0) }
  return { ...next, best: Math.max(s.best, len) }
}
