import { useState } from 'react'
import { quoteFor } from '../data/quotes'
import type { DayKey } from '../lib/dates'

export function FocusQuote({ today }: { today: DayKey }) {
  const [offset, setOffset] = useState(0)
  const q = quoteFor(today, offset)
  return (
    <section className="quote" aria-label="Daily focus">
      <span className="quote-label">Focus</span>
      <blockquote>
        <p>{q.text}</p>
        {q.by && <cite>{q.by}</cite>}
      </blockquote>
      <button className="icon-btn subtle" title="Another one" aria-label="Show another quote" onClick={() => setOffset((o) => o + 1)}>
        ↻
      </button>
    </section>
  )
}
