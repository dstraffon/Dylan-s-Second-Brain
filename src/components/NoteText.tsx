import { Fragment } from 'react'
import { linkify } from '../lib/linkify'

/**
 * Plain note text with any web addresses turned into links. Use it anywhere a
 * note's words are shown (titles, paragraphs, bullets) so links work the same
 * everywhere. React escapes the text, so nothing in a note is read as HTML.
 *
 * A click on a link opens it in a new tab and goes no further, so it doesn't
 * also open the note for editing or fold it.
 */
export function NoteText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        p.kind === 'text' ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : (
          <a
            key={i}
            className="note-link"
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            title={p.href}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {p.label}
          </a>
        ),
      )}
    </>
  )
}
