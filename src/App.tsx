import { useEffect, useRef, useState } from 'react'
import type { Settings } from './types'
import { usePersisted } from './lib/storage'
import { useToday } from './lib/dates'
import { DayLine } from './components/DayLine'
import { WeeklyReview } from './components/WeeklyReview'
import { SettingsPanel } from './components/SettingsPanel'
import { applyTheme } from './lib/theme'
import { UpdateBanner } from './components/UpdateBanner'
import { ProjectView } from './components/ProjectView'
import { SettingsButton } from './components/SettingsButton'
import { unfold } from './lib/fold'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MODULES, moduleById, type ModuleContext } from './dashboard/modules'
import { Dashboard } from './dashboard/Dashboard'
import { setHidden, useDashLayout } from './lib/dashboardLayout'

type View = 'today' | 'review'
/** A module with a full view (see MODULES). */
type Panel = string

const PANELS: Panel[] = MODULES.filter((m) => m.full).map((m) => m.id)

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
  const [arranging, setArranging] = useState(false)
  const [layout, updateLayout] = useDashLayout(MODULES, () => (stored.showQuote === false ? ['quote'] : []))
  const { route, open: openRoute, close: closePanel, home, parent } = useFocusRoute()
  const panel = route?.panel ?? null

  // Follows the setting live, including changes from another tab or an imported backup.
  useEffect(() => applyTheme(settings.theme ?? 'dark'), [settings.theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false)
        else if (document.querySelector('[data-esc-cancel]')) return
        else if (arranging && !panel) setArranging(false)
        else if (el.matches('input, textarea')) el.blur()
        else if (document.querySelector('[data-esc-cancel]')) return
        else if (panel) closePanel()
        else setView('today')
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || el.matches('input, textarea, select, [contenteditable]')) return
      if (arranging) return
      const focus = (id: string, tile: string) => {
        setView('today')
        // A folded tile hides its input, so open it first.
        unfold(tile)
        e.preventDefault()
        // A hidden tile's input lives in its full view.
        if (layout.hidden.includes(tile) && moduleById(tile)?.full) {
          if (!document.getElementById(id)) openRoute({ panel: tile })
        }
        // Quick keys jump to the dashboard unless the open full view has that input.
        else if (panel && !document.getElementById(id)) closePanel()
        const go = () => {
          const t = document.getElementById(id)
          t?.focus({ preventScroll: true })
          t?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return !!t
        }
        if (!go()) requestAnimationFrame(go)
      }
      const mod = MODULES.find((m) => m.key === e.key && m.inputId)
      if (mod) focus(mod.inputId!, mod.id)
      else if (e.key === 'r') setView((v) => (v === 'review' ? 'today' : 'review'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSettings, panel, route?.projectId, arranging, layout.hidden.join()])

  const focusProps = (p: Panel) => ({ expanded: panel === p && !route?.projectId, onExpand: () => openRoute({ panel: p }), onClose: closePanel })
  const openProject = (id: string) => openRoute({ panel: 'projects', projectId: id })
  const ctx = (p: Panel): ModuleContext => ({ today, focus: focusProps(p), openProject })
  const fullView = panel && !route?.projectId ? moduleById(panel)?.full : undefined

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
          {fullView?.(ctx(panel!))}
          {panel === 'projects' && route?.projectId && (
            <ProjectView id={route.projectId} onClose={closePanel} backLabel={parent() ? 'Projects' : 'Dashboard'} />
          )}
        </main>
      ) : view === 'today' ? (
        <Dashboard
          tileCtx={ctx}
          layout={layout}
          update={updateLayout}
          editing={arranging}
          onDone={() => setArranging(false)}
          onSettings={() => setShowSettings(true)}
        />
      ) : (
        <main>
          <WeeklyReview today={today} />
        </main>
      )}

      <UpdateBanner />

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          tiles={MODULES.map((m) => ({ id: m.id, name: m.name, blurb: m.blurb, shown: !layout.hidden.includes(m.id) }))}
          onShowTile={(id, show) => updateLayout((l) => setHidden(l, id, !show))}
          onArrange={() => {
            setShowSettings(false)
            setView('today')
            home()
            setArranging(true)
          }}
        />
      )}
      <ConfirmDialog />
    </div>
  )
}
