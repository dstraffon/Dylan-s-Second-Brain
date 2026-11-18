import { useState } from 'react'
import { reloadToNewVersion, useNewVersion } from '../lib/useNewVersion'

/** A small pill at the bottom of the screen when a newer version has been deployed. */
export function UpdateBanner() {
  const available = useNewVersion()
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)
  if (!available || dismissed) return null
  return (
    <div className="update-banner" role="status">
      <button
        className="update-main"
        disabled={reloading}
        onClick={() => {
          setReloading(true)
          void reloadToNewVersion()
        }}
      >
        <span className="update-dot" aria-hidden="true" />
        <span>New version available</span>
        <span className="update-cta">{reloading ? 'Refreshing…' : <><span className="cta-touch">Tap to refresh</span><span className="cta-mouse">Refresh</span></>}</span>
      </button>
      <button className="update-close" aria-label="Dismiss" title="Not now" onClick={() => setDismissed(true)}>
        ×
      </button>
    </div>
  )
}
