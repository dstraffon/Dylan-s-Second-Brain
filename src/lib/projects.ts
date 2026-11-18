import type { Project, TodoItem, TodoList } from '../types'
import { usePersisted } from './storage'
import { uid } from './id'

export const PROJECT_COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#7dcfff', '#ff9e64', '#73daca']

export function newProject(name: string, existing: Project[]): Project {
  return {
    id: uid(),
    name,
    color: PROJECT_COLORS[existing.length % PROJECT_COLORS.length],
    createdAt: new Date().toISOString(),
    lists: [],
    notes: [],
  }
}

export const newList = (title: string): TodoList => ({ id: uid(), title, items: [], createdAt: new Date().toISOString() })
export const newItem = (title: string): TodoItem => ({ id: uid(), title, done: false, createdAt: new Date().toISOString() })

export function projectStats(p: Project) {
  let open = 0
  let done = 0
  for (const l of p.lists) for (const i of l.items) i.done ? done++ : open++
  return { open, done, total: open + done, lists: p.lists.length, notes: p.notes.length }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "2 lists · 3 notes", or a nudge when the project is empty. */
export function projectSummary(p: Project) {
  const s = projectStats(p)
  const parts = []
  if (s.lists) parts.push(plural(s.lists, 'list'))
  if (s.notes) parts.push(plural(s.notes, 'note'))
  return parts.length ? parts.join(' · ') : 'Empty so far'
}

export { plural }

/** All projects, plus a helper to change one in place. */
export function useProjects() {
  const [projects, setProjects] = usePersisted<Project[]>('projects', [])
  const updateProject = (id: string, fn: (p: Project) => Project) => setProjects((ps) => ps.map((p) => (p.id === id ? fn(p) : p)))
  return { projects, setProjects, updateProject }
}
