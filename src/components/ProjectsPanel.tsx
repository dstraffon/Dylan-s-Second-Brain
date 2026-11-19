import { useState } from 'react'
import type { Project } from '../types'
import { newProject, projectStats, projectSummary, reopenProject, resolvedLabel, splitProjects, useProjects } from '../lib/projects'
import { Card, type FocusProps } from './Card'

/** Set by the tile's "N resolved" link, so the full view opens with that section showing. */
let showResolvedNext = false

/**
 * The Projects tile: a short list of open projects, each opening its own view.
 * The full view (#/projects) shows them as larger cards, with resolved ones
 * tucked into a section below that opens on demand.
 */
export function ProjectsPanel(props: FocusProps & { onOpen: (id: string) => void }) {
  const { onOpen, ...focus } = props
  const { projects, setProjects, updateProject } = useProjects()
  const { active, resolved } = splitProjects(projects)
  const [name, setName] = useState('')
  const [showResolved, setShowResolved] = useState(() => {
    const v = showResolvedNext
    showResolvedNext = false
    return v
  })

  const add = () => {
    const n = name.trim()
    if (!n) return
    const p = newProject(n, projects)
    setProjects((ps) => [p, ...ps])
    setName('')
    // A new project is empty, so go straight in to add its first list.
    onOpen(p.id)
  }

  return (
    <Card title="Projects" className="projects" id="projects" {...focus}>
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          id="quick-project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project…"
          autoComplete="off"
          enterKeyHint="go"
          maxLength={80}
        />
        <button type="submit" className="btn primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {active.length > 0 && (
        <ul className={`project-list ${focus.expanded ? 'grid' : ''}`}>
          {active.map((p) => (
            <ProjectRow key={p.id} project={p} big={focus.expanded} onOpen={() => onOpen(p.id)} />
          ))}
        </ul>
      )}
      {active.length === 0 && (
        <p className="empty">
          {resolved.length ? 'Every project is resolved. Name a new one above.' : 'No projects yet. Name one above to start its lists and notes.'}
        </p>
      )}
      {resolved.length > 0 && !focus.expanded && focus.onExpand && (
        <button
          type="button"
          className="resolved-link"
          onClick={() => {
            showResolvedNext = true
            focus.onExpand!()
          }}
        >
          {resolved.length} resolved <span aria-hidden>›</span>
        </button>
      )}
      {resolved.length > 0 && focus.expanded && (
        <div className="resolved-section">
          <button type="button" className="resolved-toggle" aria-expanded={showResolved} onClick={() => setShowResolved((v) => !v)}>
            <span className="caret" aria-hidden>
              ›
            </span>
            Resolved
            <span className="count">{resolved.length}</span>
          </button>
          {showResolved && (
            <ul className="project-list grid resolved">
              {resolved.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  big
                  onOpen={() => onOpen(p.id)}
                  onReopen={() => updateProject(p.id, reopenProject)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function ProjectRow({ project: p, big, onOpen, onReopen }: { project: Project; big?: boolean; onOpen: () => void; onReopen?: () => void }) {
  const s = projectStats(p)
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
  return (
    <li className={`project ${onReopen ? 'is-resolved' : ''}`} style={{ '--chip': p.color } as React.CSSProperties}>
      <button className="project-btn" onClick={onOpen} title={`Open ${p.name}`}>
        <span className="project-top">
          <span className="dot" aria-hidden />
          <span className="project-name">{p.name}</span>
          {s.open > 0 && !p.resolvedAt && (
            <span className="count" title={`${s.open} to do`}>
              {s.open}
            </span>
          )}
          {!onReopen && (
            <span className="chev" aria-hidden>
              ›
            </span>
          )}
        </span>
        <span className="project-meta muted">
          {p.resolvedAt && <>Resolved {resolvedLabel(p.resolvedAt)} · </>}
          {projectSummary(p)}
          {s.total > 0 && ` · ${s.done} of ${s.total} done`}
        </span>
        {s.total > 0 && (
          <span className="progress" aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
        {big && p.lists.length > 0 && (
          <span className="project-lists">
            {p.lists.slice(0, 4).map((l) => {
              const open = l.items.filter((i) => !i.done).length
              return (
                <span key={l.id} className="chip small">
                  {l.title}
                  {open > 0 && <span className="count">{open}</span>}
                </span>
              )
            })}
            {p.lists.length > 4 && <span className="muted small">+{p.lists.length - 4} more</span>}
          </span>
        )}
      </button>
      {onReopen && (
        <button type="button" className="btn small reopen-btn" onClick={onReopen} title={`Move ${p.name} back to your projects`}>
          Reopen
        </button>
      )}
    </li>
  )
}
