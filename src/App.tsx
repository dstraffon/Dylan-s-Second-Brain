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

type View = 'today' | 'review'
type Panel = 'tasks' | 'notes' | 'streaks' | 'links'

const PANELS: Panel[] = ['tasks', 'notes', 'streaks', 'links']

/** The tile shown full screen, kept in the URL (#/tasks) so the back button and gesture return to the dashboard. */
function useFocusPanel() {
  const read = (): Panel | null => {
    const h = window.location.hash.replace(/^#\/?/, '') as Panel
    return PANELS.includes(h) ? h : null
  }
  const [panel, setPanel] = useState<Panel | null>(read)
  const pushed = useRef(false)
  useEffect(() => {
    const sync = () => setPanel(read())
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  const open = (p: Panel) => {
    if (read() === p) return
    if (read()) window.history.replaceState(null, '', `#/${p}`)
    else {
      window.history.pushState(null, '', `#/${p}`)
      pushed.current = true
    }
    setPanel(p)
    window.scrollTo(0, 0)
  }
  const close = () => {
    if (!read()) return
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setPanel(null)
  }
  return [panel, open, close] as const
}

const DEFAULT_SETTINGS: Settings = { showQuote: true }

export default function App() {
  const today = useToday()
  const [stored, setSettings] = usePersisted<Settings>('settings', DEFAULT_SETTINGS)
  const settings = { ...DEFAULT_SETTINGS, ...stored }
  const [view, setView] = useState<View>('today')
  const [showSettings, setShowSettings] = useState(false)
  const [panel, openPanel, closePanel] = useFocusPanel()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false)
        else if (el.matches('input, textarea')) el.blur()
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
      else if (e.key === 'r') setView((v) => (v === 'review' ? 'today' : 'review'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSettings, panel])

  const focusProps = (p: Panel) => ({ expanded: panel === p, onExpand: () => openPanel(p), onClose: closePanel })

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
              closePanel()
            }}
          >
            Today
          </button>
          <button className={view === 'review' ? 'on' : ''} onClick={() => setView('review')}>
            <span className="hide-sm">Weekly review</span>
            <span className="show-sm">Review</span>
          </button>
        </nav>
        <button className="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
          ⚙
        </button>
      </header>

      {view === 'today' && panel ? (
        <main className="focus-view">
          {panel === 'tasks' && <TasksPanel today={today} {...focusProps('tasks')} />}
          {panel === 'notes' && <NotesPanel {...focusProps('notes')} />}
          {panel === 'streaks' && <StreaksPanel today={today} {...focusProps('streaks')} />}
          {panel === 'links' && <LinksPanel {...focusProps('links')} />}
        </main>
      ) : view === 'today' ? (
        <main className="dashboard">
          <div className="area-tasks">
            <TasksPanel today={today} {...focusProps('tasks')} />
          </div>
          <div className="area-notes">
            <NotesPanel {...focusProps('notes')} />
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

      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
