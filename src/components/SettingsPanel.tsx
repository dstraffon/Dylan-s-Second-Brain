import { useRef, useState } from 'react'
import type { Settings } from '../types'
import { store } from '../lib/storage'
import { syncConfigured } from '../lib/sync/config'
import { SyncSettings } from './SyncSettings'

export function SettingsPanel(props: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const { settings: s } = props
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'second-brain', version: 1, data: store.exportAll() }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `second-brain-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text())
      if (parsed?.app !== 'second-brain' || typeof parsed.data !== 'object') throw new Error()
      store.importAll(parsed.data)
      setMsg('Backup restored.')
    } catch {
      setMsg('That file isn’t a Second Brain backup.')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="card-head">
          <h2>Settings</h2>
          <button className="icon-btn subtle" aria-label="Close settings" onClick={props.onClose}>
            ×
          </button>
        </header>
        <h3>Appearance</h3>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.theme === 'light'}
            onChange={(e) => props.onChange({ ...s, theme: e.target.checked ? 'light' : 'dark' })}
          />
          <span>Light mode</span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={s.showQuote} onChange={(e) => props.onChange({ ...s, showQuote: e.target.checked })} />
          <span>Show daily focus quote</span>
        </label>

        <h3>{syncConfigured() ? 'Sync' : 'Your data'}</h3>
        <SyncSettings />
        {syncConfigured() && <h3>Backup</h3>}
        <p className="muted small">
          A backup file has everything, including your projects with their lists and notes.
        </p>
        <div className="row">
          <button className="btn" onClick={exportData}>
            Export backup
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            Import backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
          />
        </div>
        {msg && <p className="small">{msg}</p>}

        <h3>Shortcuts</h3>
        <p className="muted small">
          <kbd>t</kbd> new task · <kbd>n</kbd> new note · <kbd>l</kbd> new link · <kbd>p</kbd> new project · <kbd>r</kbd> weekly review · <kbd>Esc</kbd> back
        </p>
      </div>
    </div>
  )
}
