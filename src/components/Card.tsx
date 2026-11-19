import type { ReactNode } from 'react'
import { useFold } from '../lib/fold'

/** Passed to a tile so its header can open the full view, or lead back to the dashboard. */
export interface FocusProps {
  expanded?: boolean
  onExpand?: () => void
  onClose?: () => void
  /** Where the back button leads, when it isn't the dashboard. */
  backLabel?: string
}

export function Card(
  props: {
    title?: ReactNode
    actions?: ReactNode
    className?: string
    id?: string
    /** Lets the dashboard tile fold down to its header. Remembered per device under this name. */
    foldId?: string
    /** A short hint shown beside the title while folded, like "4 open". */
    foldedSummary?: ReactNode
    children: ReactNode
  } & FocusProps,
) {
  const { expanded, onExpand, onClose, backLabel = 'Dashboard' } = props
  const canFold = !!props.foldId && !expanded
  const [isFolded, toggleFold] = useFold(canFold ? props.foldId : undefined)
  const folded = canFold && isFolded
  const bodyId = props.id ? `${props.id}-body` : undefined
  return (
    <section className={`card ${expanded ? 'expanded' : ''} ${folded ? 'folded' : ''} ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions || canFold) && (
        <header className="card-head">
          {expanded && onClose && (
            <button className="btn small back-btn" onClick={onClose} title={`Back to ${backLabel === 'Dashboard' ? 'the dashboard' : backLabel} (Esc)`}>
              ← <span className="hide-sm">{backLabel}</span>
            </button>
          )}
          {props.title && (
            <h2>
              {onExpand && !expanded ? (
                <button className="card-title-btn" onClick={onExpand} title="Open the full view">
                  {props.title}
                  <span className="expand-ico" aria-hidden>
                    ⤢
                  </span>
                </button>
              ) : (
                props.title
              )}
            </h2>
          )}
          {folded && props.foldedSummary != null && <span className="fold-summary">{props.foldedSummary}</span>}
          {props.actions && !folded && <div className="card-actions">{props.actions}</div>}
          {canFold && <FoldButton folded={folded} onToggle={toggleFold} controls={bodyId} />}
        </header>
      )}
      {folded ? null : canFold ? (
        <div className="card-body" id={bodyId}>
          {props.children}
        </div>
      ) : (
        props.children
      )}
    </section>
  )
}

/** The chevron that folds a tile up to its header, or opens it again. */
export function FoldButton({ folded, onToggle, controls }: { folded: boolean; onToggle: () => void; controls?: string }) {
  return (
    <button
      className={`tile-fold ${folded ? 'is-folded' : ''}`}
      onClick={onToggle}
      aria-expanded={!folded}
      aria-controls={controls}
      aria-label={folded ? 'Unfold' : 'Fold up'}
      title={folded ? 'Unfold' : 'Fold up'}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
