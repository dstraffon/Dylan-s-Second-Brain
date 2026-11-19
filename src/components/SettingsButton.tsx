import { useSyncStatus } from '../lib/sync/engine'
import { syncLine } from './SyncSettings'

/**
 * The top-bar gear. When sync needs a look (not signed in on this device,
 * offline with unsaved changes, or an error) it carries a small dot, so the
 * dashboard stays quiet the rest of the time.
 */
export function SettingsButton({ onClick }: { onClick: () => void }) {
  const s = useSyncStatus()
  const flag =
    s.state === 'signed-out' ? 'Sign in to sync this device' : s.state === 'error' || (s.state === 'offline' && s.pending) ? syncLine(s) : ''
  const tone = s.state === 'error' ? 'bad' : s.state === 'offline' ? 'warn' : 'accent'
  return (
    <button className="icon-btn settings-btn" aria-label={flag ? `Settings. ${flag}` : 'Settings'} title={flag || 'Settings'} onClick={onClick}>
      ⚙{flag && <span className="settings-flag" data-tone={tone} aria-hidden="true" />}
    </button>
  )
}
