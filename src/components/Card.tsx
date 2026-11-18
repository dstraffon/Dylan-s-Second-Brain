import type { ReactNode } from 'react'

export function Card(props: {
  title?: ReactNode
  actions?: ReactNode
  className?: string
  id?: string
  children: ReactNode
}) {
  return (
    <section className={`card ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && (
        <header className="card-head">
          {props.title && <h2>{props.title}</h2>}
          {props.actions && <div className="card-actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  )
}
