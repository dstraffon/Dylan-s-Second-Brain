import { useState } from 'react'
import type { Category } from '../types'
import { uid } from '../lib/id'

const COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#f7768e', '#7dcfff', '#ff9e64', '#73daca']

export const ALL = 'all'
export const NONE = 'none'
/** 'all' = no filter, 'none' = uncategorized, otherwise a category id. */
export type CategoryFilter = string

/**
 * Category chips. The selected chip filters the list AND is where new
 * items go, so adding to a category is just: tap the chip, type.
 */
export function CategoryBar(props: {
  categories: Category[]
  onChange: (c: Category[]) => void
  selected: CategoryFilter
  onSelect: (id: CategoryFilter) => void
  counts?: Record<string, number>
  onDelete?: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const add = () => {
    const n = name.trim()
    if (n) {
      const existing = props.categories.find((c) => c.name.toLowerCase() === n.toLowerCase())
      if (existing) props.onSelect(existing.id)
      else {
        const c = { id: uid(), name: n, color: COLORS[props.categories.length % COLORS.length] }
        props.onChange([...props.categories, c])
        props.onSelect(c.id)
      }
    }
    setName('')
    setAdding(false)
  }

  const chip = (id: string, label: string, color?: string) => (
    <button
      key={id}
      type="button"
      className={`chip ${props.selected === id ? 'on' : ''}`}
      style={color ? ({ '--chip': color } as React.CSSProperties) : undefined}
      onClick={() => props.onSelect(props.selected === id && id !== ALL ? ALL : id)}
    >
      {color && <span className="dot" />}
      {label}
      {props.counts?.[id] ? <span className="count">{props.counts[id]}</span> : null}
    </button>
  )

  return (
    <div className="chips">
      {chip(ALL, 'All')}
      {props.categories.map((c) =>
        editing ? (
          <span key={c.id} className="chip editing" style={{ '--chip': c.color } as React.CSSProperties}>
            <span className="dot" />
            {c.name}
            <button
              type="button"
              className="x"
              aria-label={`Delete category ${c.name}`}
              onClick={() => {
                props.onChange(props.categories.filter((x) => x.id !== c.id))
                props.onDelete?.(c.id)
                if (props.selected === c.id) props.onSelect(ALL)
              }}
            >
              ×
            </button>
          </span>
        ) : (
          chip(c.id, c.name, c.color)
        ),
      )}
      {props.counts?.[NONE] && props.categories.length > 0 && !editing ? chip(NONE, 'Uncategorized') : null}
      {adding ? (
        <input
          className="chip-input"
          autoFocus
          value={name}
          placeholder="Category name"
          onChange={(e) => setName(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') {
              setName('')
              setAdding(false)
            }
          }}
        />
      ) : (
        !editing && (
          <button type="button" className="chip ghost" onClick={() => setAdding(true)} aria-label="Add category">
            + Category
          </button>
        )
      )}
      {props.categories.length > 0 && (
        <button type="button" className="chip ghost small" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      )}
    </div>
  )
}

export const matchesFilter = (categoryId: string | null, f: CategoryFilter) =>
  f === ALL ? true : f === NONE ? categoryId == null : categoryId === f

export const categoryForNew = (f: CategoryFilter) => (f === ALL || f === NONE ? null : f)
