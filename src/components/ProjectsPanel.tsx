import { useState } from 'react'
import type { Project } from '../types'
import { newProject, projectStats, projectSummary, useProjects } from '../lib/projects'
import { Card, type FocusProps } from './Card'

/**
 * The Projects tile: a short list of projects, each opening its own view.
 * The full view (#/projects) shows them as larger cards.
 */
export function ProjectsPanel(props: FocusProps & { onOpen: (id: string) => void }) {
  const { onOpen, ...focus } = props
  const { projects, setProjects } = useProjects()
  const [name, setName] = useState('')

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
      {projects.length > 0 && (
        <ul className={`project-list ${focus.expanded ? 'grid' : ''}`}>
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} big={focus.expanded} onOpen={() => onOpen(p.id)} />
          ))}
        </ul>
      )}
      {projects.length === 0 && <p className="empty">No projects yet. Name one above to start its lists and notes.</p>}
    </Card>
  )
}

function ProjectRow({ project: p, big, onOpen }: { project: Project; big?: boolean; onOpen: () => void }) {
  const s = projectStats(p)
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0
  return (
    <li className="project" style={{ '--chip': p.color } as React.CSSProperties}>
      <button className="project-btn" onClick={onOpen} title={`Open ${p.name}`}>
        <span className="project-top">
          <span className="dot" aria-hidden />
          <span className="project-name">{p.name}</span>
          {s.open > 0 && (
            <span className="count" title={`${s.open} to do`}>
              {s.open}
            </span>
          )}
          <span className="chev" aria-hidden>
            ›
          </span>
        </span>
        <span className="project-meta muted">
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
    </li>
  )
}
