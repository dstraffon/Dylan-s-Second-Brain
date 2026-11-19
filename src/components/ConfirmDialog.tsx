import { useEffect, useRef } from 'react'
import { closeConfirm, useConfirmRequest } from '../lib/confirm'
import { useSyncStatus } from '../lib/sync/engine'

/**
 * The "Delete …?" dialog. Centered on wider screens, a bottom sheet on a phone
 * so both buttons sit under the thumb. Cancel has focus, so a stray Enter or a
 * second tap in the same spot never deletes. Esc or a tap outside cancels.
 */
export function ConfirmDialog() {
  const req = useConfirmRequest()
  const sync = useSyncStatus()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!req) return
    returnTo.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus({ preventScroll: true })
    // Capture phase, so Esc closes only this dialog and not the view or sheet behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        closeConfirm()
      } else if (e.key === 'Tab') {
        // Keep focus on the two buttons.
        const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('.confirm-dialog button'))
        const i = btns.indexOf(document.activeElement as HTMLButtonElement)
        e.preventDefault()
        btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length]?.focus()
      } else if (!(e.target as HTMLElement).closest?.('.confirm-dialog')) {
        // The app's quick keys (t, n, l…) shouldn't fire behind the dialog.
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const el = returnTo.current
      if (el && el.isConnected) el.focus({ preventScroll: true })
    }
  }, [req])

  if (!req) return null
  const synced = sync.state !== 'off' && sync.state !== 'signed-out'

  return (
    <div className="confirm-backdrop" onClick={closeConfirm}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{req.title}</h2>
        <div id="confirm-desc" className="confirm-body">
          {req.name && <p className="confirm-name">“{req.name}”</p>}
          {req.detail && <p>{req.detail}</p>}
          <p className="muted">
            {req.footnote ?? `This can’t be undone${synced ? ', and it’s removed from your other devices too' : ''}.`}
          </p>
        </div>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={closeConfirm}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger-solid"
            onClick={() => {
              const run = req.onConfirm
              closeConfirm()
              run()
            }}
          >
            {req.action ?? 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
