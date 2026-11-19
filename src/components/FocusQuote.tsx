import { useState } from 'react'
import { quoteFor } from '../data/quotes'
import type { DayKey } from '../lib/dates'
import { useFold } from '../lib/fold'
import { FoldButton } from './Card'

export function FocusQuote({ today }: { today: DayKey }) {
  const [offset, setOffset] = useState(0)
  const [folded, toggleFold] = useFold('quote')
  const q = quoteFor(today, offset)
  return (
    <section className={`quote ${folded ? 'folded' : ''}`} aria-label="Daily focus">
      <span className="quote-label">Focus</span>
      {folded ? (
        <span className="quote-spacer" />
      ) : (
        <>
          <blockquote id="quote-body">
            <p>{q.text}</p>
            {q.by && <cite>{q.by}</cite>}
          </blockquote>
          <button className="icon-btn subtle" title="Another one" aria-label="Show another quote" onClick={() => setOffset((o) => o + 1)}>
            ↻
          </button>
        </>
      )}
      <FoldButton folded={folded} onToggle={toggleFold} controls="quote-body" />
    </section>
  )
}
