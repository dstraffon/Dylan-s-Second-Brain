import { useEffect, useState } from 'react'
import { syncEngine, useSyncStatus, type SyncStatus } from '../lib/sync/engine'

const EMAIL_KEY = 'sbsync:email'

function ago(t: number, now: number) {
  const s = Math.round((now - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function syncLine(s: SyncStatus, now = Date.now()) {
  const waiting = s.pending === 1 ? '1 change' : `${s.pending} changes`
  switch (s.state) {
    case 'syncing':
      return 'Syncing…'
    case 'synced':
      return s.lastSynced ? `Synced ${ago(s.lastSynced, now)}` : 'Synced'
    case 'offline':
      return s.pending ? `Offline. ${waiting} will sync when you’re back online.` : 'Offline. Changes will sync when you’re back online.'
    case 'error':
      return `Couldn’t sync. ${s.error ?? ''}`.trim()
    default:
      return ''
  }
}

/** The "Sync" section of Settings: sign in by email, then see that everything is saved. */
export function SyncSettings() {
  const status = useSyncStatus()
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(t)
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (err) {
      setMsg((err as Error)?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (status.state === 'off') {
    return (
      <p className="muted small">
        Everything is saved in this browser only. Export a backup now and then, or to move your data to another device.
      </p>
    )
  }

  if (status.state === 'signed-out') {
    return (
      <div className="sync-box">
        <p className="small">
          Sign in to keep your tasks, notes, links, streaks and projects the same on your phone and computer. Anything already on
          this device is kept and merged in.
        </p>
        {!sent ? (
          <form
            className="sync-form"
            onSubmit={(e) => {
              e.preventDefault()
              const v = email.trim()
              if (!v) return
              void run(async () => {
                await syncEngine.sendSignInEmail(v)
                localStorage.setItem(EMAIL_KEY, v)
                setSent(true)
              })
            }}
          >
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn primary" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        ) : (
          <form
            className="sync-form"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => syncEngine.verifyCode(email.trim(), code.trim()))
            }}
          >
            <p className="muted small">
              Sent to <strong>{email}</strong>. Enter the code from the email, or open its link on this device.
            </p>
            <input
              className="sync-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              aria-label="Sign-in code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <div className="row">
              <button className="btn primary" disabled={busy || code.length < 6}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSent(false)
                  setCode('')
                  setMsg('')
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
        {msg && <p className="small sync-msg">{msg}</p>}
      </div>
    )
  }

  const backup = syncEngine.backupFile()
  return (
    <div className="sync-box">
      <p className="sync-status" data-state={status.state} role="status">
        <span className="sync-dot" aria-hidden="true" />
        <span>{syncLine(status, now)}</span>
      </p>
      <p className="muted small">
        Signed in as <strong>{status.email}</strong>. Changes save on this device first, so the app works offline, then sync to
        your other devices.
      </p>
      <div className="row">
        <button className="btn" disabled={status.state === 'syncing'} onClick={() => void syncEngine.syncNow()}>
          Sync now
        </button>
        <button className="btn" onClick={() => void run(() => syncEngine.signOut())}>
          Sign out
        </button>
      </div>
      {backup && (
        <button
          className="link-btn small"
          onClick={() => {
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `second-brain-before-sync-${backup.savedAt.slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Download this device’s data from before sync
        </button>
      )}
      {msg && <p className="small sync-msg">{msg}</p>}
    </div>
  )
}
