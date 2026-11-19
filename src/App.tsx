import { useEffect, useRef, useState } from 'react'
import type { Settings } from './types'
import { usePersisted } from './lib/storage'
import { useToday } from './lib/dates'
import { DayLine } from './components/DayLine'
import { FocusQuote } from './components/FocusQuote'
import { TasksPanel } from './components/TasksPanel'
import { StreaksPanel } from './components/StreaksPanel'
import { NotesPanel } from './components/NotesPanel'
import { LinksPanel } from './components/LinksPanel'
import { WeeklyReview } from './components/WeeklyReview'
import { SettingsPanel } from './components/SettingsPanel'
import { applyTheme } from './lib/theme'
import { UpdateBanner } from './components/UpdateBanner'
import { ProjectsPanel } from './components/ProjectsPanel'
import { ProjectView } from './components/ProjectView'
import { SettingsButton } from './components/SettingsButton'

type View = 'today' | 'review'
type Panel = 'tasks' | 'notes' | 'streaks' | 'links' | 'projects'

const PANELS: Panel[] = ['tasks', 'notes', 'streaks', 'links', 'projects']

/** A full view: one tile (#/tasks), or one project (#/projects/<id>). */
export type Route = { panel: Panel; projectId?: string }

const toHash = (r: Route) => `#/${r.panel}${r.projectId ? `/${encodeURIComponent(r.projectId)}` : ''}`

function readRoute(): Route | null {
  const [p, id] = window.location.hash.replace(/^#\/?/, '').split('/')
  if (!PANELS.includes(p as Panel)) return null
  return p === 'projects' && id ? { panel: 'projects', projectId: decodeURIComponent(id) } : { panel: p as Panel }
}

/**
 * The full view shown instead of the dashboard, kept in the URL so the back
 * button and gesture work. Going deeper (Projects, then one project) adds a
 * history entry, so back steps out one level at a time.
 */
function useFocusRoute() {
  const [route, setRoute] = useState<Route | null>(readRoute)
  // Views this app pushed history entries over, oldest first (null = the dashboard).
  const stack = useRef<(Route | null)[]>([])
  useEffect(() => {
    const sync = () => {
      const r = readRoute()
      setRoute(r)
      const s = stack.current
      if (!r) s.length = 0
      else if (s.length && s[s.length - 1] && toHash(s[s.length - 1]!) === toHash(r)) s.pop()
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  const open = (next: Route) => {
    const cur = readRoute()
    if (cur && toHash(cur) === toHash(next)) return
    const deeper = !cur || (cur.panel === 'projects' && !cur.projectId && !!next.projectId)
    if (deeper) {
      stack.current.push(cur)
      window.history.pushState(null, '', toHash(next))
    } else window.history.replaceState(null, '', toHash(next))
    setRoute(next)
    window.scrollTo(0, 0)
  }
  /** Where the back button leads from here. */
  const parent = (): Route | null => {
    if (stack.current.length) return stack.current[stack.current.length - 1]
    return route?.projectId ? { panel: 'projects' } : null
  }
  const close = () => {
    const cur = readRoute()
    if (!cur) return
    if (stack.current.length) {
      stack.current.pop()
      window.history.back()
      return
    }
    // Opened from a link straight to a project: step out to the projects list, then the dashboard.
    const up = parent()
    window.history.replaceState(null, '', up ? toHash(up) : window.location.pathname + window.location.search)
    setRoute(up)
  }
  /** Back to the dashboard from any depth. */
  const home = () => {
    if (!readRoute()) return
    const n = stack.current.length
    stack.current = []
    if (n > 0) window.history.go(-n)
    else window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setRoute(null)
  }
  return { route, open, close, home, parent }
}

const DEFAULT_SETTINGS: Settings = { showQuote: true, theme: 'dark' }

export default function App() {
  const today = useToday()
  const [stored, setSettings] = usePersisted<Settings>('settings', DEFAULT_SETTINGS)
  const settings = { ...DEFAULT_SETTINGS, ...stored }
  const [view, setView] = useState<View>('today')
  const [showSettings, setShowSettings] = useState(false)
  const { route, open: openRoute, close: closePanel, home, parent } = useFocusRoute()
  const panel = route?.panel ?? null

  // Follows the setting live, including changes from another tab or an imported backup.
  useEffect(() => applyTheme(settings.theme ?? 'dark'), [settings.theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false)
        else if (el.matches('input, textarea')) el.blur()
        else if (document.querySelector('[data-esc-cancel]')) return
        else if (panel) closePanel()
        else setView('today')
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || el.matches('input, textarea, select, [contenteditable]')) return
      const focus = (id: string) => {
        setView('today')
        e.preventDefault()
        // Quick keys jump to the dashboard unless the open full view has that input.
        if (panel && !document.getElementById(id)) closePanel()
        const go = () => {
          const t = document.getElementById(id)
          t?.focus({ preventScroll: true })
          t?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return !!t
        }
        if (!go()) requestAnimationFrame(go)
      }
      if (e.key === 't') focus('quick-task')
      else if (e.key === 'n') focus('quick-note')
      else if (e.key === 'l') focus('quick-link')
      else if (e.key === 'p') focus('quick-project')
      else if (e.key === 'r') setView((v) => (v === 'review' ? 'today' : 'review'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSettings, panel, route?.projectId])

  const focusProps = (p: Panel) => ({ expanded: panel === p && !route?.projectId, onExpand: () => openRoute({ panel: p }), onClose: closePanel })
  const openProject = (id: string) => openRoute({ panel: 'projects', projectId: id })

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="./icon.svg" alt="" />
          <span className="brand-name">Second Brain</span>
        </div>
        <DayLine today={today} />
        <nav className="seg" aria-label="View">
          <button
            className={view === 'today' ? 'on' : ''}
            onClick={() => {
              setView('today')
              home()
            }}
          >
            Today
          </button>
          <button className={view === 'review' ? 'on' : ''} onClick={() => setView('review')}>
            <span className="hide-sm">Weekly review</span>
            <span className="show-sm">Review</span>
          </button>
        </nav>
        <SettingsButton onClick={() => setShowSettings(true)} />
      </header>

      {view === 'today' && panel ? (
        <main className="focus-view">
          {panel === 'tasks' && <TasksPanel today={today} {...focusProps('tasks')} />}
          {panel === 'notes' && <NotesPanel {...focusProps('notes')} />}
          {panel === 'streaks' && <StreaksPanel today={today} {...focusProps('streaks')} />}
          {panel === 'links' && <LinksPanel {...focusProps('links')} />}
          {panel === 'projects' &&
            (route?.projectId ? (
              <ProjectView id={route.projectId} onClose={closePanel} backLabel={parent() ? 'Projects' : 'Dashboard'} />
            ) : (
              <ProjectsPanel {...focusProps('projects')} onOpen={openProject} />
            ))}
        </main>
      ) : view === 'today' ? (
        <main className="dashboard">
          <div className="area-tasks">
            <TasksPanel today={today} {...focusProps('tasks')} />
          </div>
          <div className="area-notes">
            <NotesPanel {...focusProps('notes')} />
          </div>
          <div className="area-projects">
            <ProjectsPanel {...focusProps('projects')} onOpen={openProject} />
          </div>
          {settings.showQuote && (
            <div className="area-quote">
              <FocusQuote today={today} />
            </div>
          )}
          <div className="area-streaks">
            <StreaksPanel today={today} {...focusProps('streaks')} />
          </div>
          <div className="area-links">
            <LinksPanel {...focusProps('links')} />
          </div>
        </main>
      ) : (
        <main>
          <WeeklyReview today={today} />
        </main>
      )}

      <UpdateBanner />

      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
