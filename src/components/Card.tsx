import type { ReactNode } from 'react'

/** Passed to a tile so its header can open the full view, or lead back to the dashboard. */
export interface FocusProps {
  expanded?: boolean
  onExpand?: () => void
  onClose?: () => void
}

export function Card(
  props: {
    title?: ReactNode
    actions?: ReactNode
    className?: string
    id?: string
    children: ReactNode
  } & FocusProps,
) {
  const { expanded, onExpand, onClose } = props
  return (
    <section className={`card ${expanded ? 'expanded' : ''} ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && (
        <header className="card-head">
          {expanded && onClose && (
            <button className="btn small back-btn" onClick={onClose} title="Back to the dashboard (Esc)">
              ← <span className="hide-sm">Dashboard</span>
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
          {props.actions && <div className="card-actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  )
}
