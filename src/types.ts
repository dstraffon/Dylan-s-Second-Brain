import type { DayKey } from './lib/dates'

export type TaskScope = 'day' | 'week' | 'month' | 'general'

export interface Task {
  id: string
  title: string
  scope: TaskScope
  repeatDaily: boolean
  createdAt: string // ISO
  createdOn: DayKey
  /** Day a one-off task was checked off. */
  completedOn: DayKey | null
  /** Days a repeating task was checked off. */
  completions: DayKey[]
  /** Optional due day. When set, it decides which list the task shows in. Missing on older saved tasks. */
  dueOn?: DayKey | null
  /** Position set by dragging, within the task's list. Lower comes first. Missing until a task is dragged. */
  order?: number
}

export interface Category {
  id: string
  name: string
  color: string
}

export interface Note {
  id: string
  /** Optional heading. Notes saved before titles existed simply have none. */
  title?: string
  /** Plain text; lines starting with "- " show as bullets. May be empty when there's a title. */
  text: string
  categoryId: string | null
  createdAt: string
  pinned?: boolean
  /** Folded down to its title on the dashboard. Only titled notes fold. */
  collapsed?: boolean
}

export type LinkKind = 'video' | 'article'

export interface LinkItem {
  id: string
  url: string
  title: string
  kind: LinkKind
  categoryId: string | null
  createdAt: string
  readAt: string | null
}

export interface Streak {
  id: string
  name: string
  createdAt: string
  checkins: DayKey[]
  /** When true, missing a day sets the streak back to 0. Off by default. */
  autoReset: boolean
  /** Check-ins before this day don't count (set by a manual reset). */
  countFrom: DayKey | null
  best: number
  /** Days added on top of the logged days, from "Set length". Counted from countFrom. Missing on older saved streaks. */
  bonus?: number
}

export interface Settings {
  showQuote: boolean
}

export interface WeekReflection {
  wins: string
  blockers: string
  focus: string
}
