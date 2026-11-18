import { useEffect, useState } from 'react'

/** Local calendar day as YYYY-MM-DD. All day-based data uses these keys. */
export type DayKey = string

const pad = (n: number) => String(n).padStart(2, '0')

export const toKey = (d: Date): DayKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayKey = () => toKey(new Date())

export const parseKey = (k: DayKey) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (k: DayKey, n: number) => {
  const d = parseKey(k)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

/** Monday of the week containing k. */
export const startOfWeek = (k: DayKey) => {
  const d = parseKey(k)
  const offset = (d.getDay() + 6) % 7
  return addDays(k, -offset)
}

export const weekDays = (weekStart: DayKey) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
export const sameWeek = (a: DayKey, b: DayKey) => startOfWeek(a) === startOfWeek(b)
export const sameMonth = (a: DayKey, b: DayKey) => a.slice(0, 7) === b.slice(0, 7)
export const daysBetween = (a: DayKey, b: DayKey) =>
  Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000)

export const fmt = (k: DayKey, opts: Intl.DateTimeFormatOptions) => parseKey(k).toLocaleDateString(undefined, opts)
export const weekdayShort = (k: DayKey) => fmt(k, { weekday: 'short' })

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Today's key, refreshed when the clock passes midnight (the page is often left open overnight). */
export function useToday() {
  const [today, setToday] = useState(todayKey)
  useEffect(() => {
    const tick = () => setToday((prev) => (prev === todayKey() ? prev : todayKey()))
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}
