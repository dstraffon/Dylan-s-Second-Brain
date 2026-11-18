import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { NoteText } from './NoteText'
import { continueList, parseNote, toggleBullets, type Edit } from '../lib/noteText'

const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/**
 * Title + body fields used both for a new note and for editing one.
 * Enter saves on a computer (Shift+Enter for a new line). On a touch screen
 * Enter adds a line, since there is no Shift key, and the button saves.
 * Inside a list a new line carries the bullet on; an empty bullet ends the list.
 */
export function NoteEditor(props: {
  title: string
  text: string
  onTitle: (t: string) => void
  onText: (t: string) => void
  onSubmit: () => void
  onCancel?: () => void
  /** Show the title field. The quick-add box only shows it once it's in use. */
  showTitle: boolean
  bodyId?: string
  titleId?: string
  placeholder?: string
  autoFocus?: boolean
  rows?: number
  className?: string
  footer?: ReactNode
  onFocus?: () => void
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void
}) {
  const body = useRef<HTMLTextAreaElement>(null)
  // Where the caret goes after a list edit, applied once React has rendered the new text.
  const pendingSel = useRef<[number, number] | null>(null)
  useLayoutEffect(() => {
    if (pendingSel.current && body.current) {
      body.current.setSelectionRange(...pendingSel.current)
      pendingSel.current = null
    }
  })

  const apply = (e: Edit) => {
    pendingSel.current = [e.start, e.end]
    props.onText(e.value)
  }

  const toggle = () => {
    const el = body.current
    if (!el) return
    apply(toggleBullets(el.value, el.selectionStart, el.selectionEnd))
    el.focus()
  }

  const onBodyKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const el = e.currentTarget
    if (e.key === 'Escape' && props.onCancel) {
      e.preventDefault()
      props.onCancel()
      return
    }
    // Cmd/Ctrl+Shift+8 is the usual bullet-list shortcut in docs apps.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '8' || e.key === '*' || e.code === 'Digit8')) {
      e.preventDefault()
      toggle()
      return
    }
    if (e.key !== 'Enter') return
    const newLine = e.shiftKey || coarse()
    if (!newLine) {
      e.preventDefault()
      props.onSubmit()
      return
    }
    const next = continueList(el.value, el.selectionStart, el.selectionEnd)
    if (next) {
      e.preventDefault()
      apply(next)
    }
  }

  const listOn = (() => {
    const el = body.current
    const pos = el ? el.selectionStart : props.text.length
    const lineStart = props.text.lastIndexOf('\n', pos - 1) + 1
    return /^\s*[-*•]\s/.test(props.text.slice(lineStart))
  })()

  return (
    <div className={`note-editor ${props.className ?? ''}`} onFocus={props.onFocus} onBlur={props.onBlur}>
      {props.showTitle && (
        <input
          id={props.titleId}
          className="note-title-input"
          value={props.title}
          onChange={(e) => props.onTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Note title"
          maxLength={120}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              body.current?.focus()
            }
            if (e.key === 'Escape' && props.onCancel) props.onCancel()
          }}
        />
      )}
      <textarea
        ref={body}
        id={props.bodyId}
        className="note-body-input"
        autoFocus={props.autoFocus}
        rows={props.rows ?? 2}
        value={props.text}
        onChange={(e) => props.onText(e.target.value)}
        placeholder={props.placeholder}
        aria-label="Note"
        onKeyDown={onBodyKey}
      />
      {props.showTitle && (
        <div className="note-editor-bar">
          <button
            type="button"
            className={`btn small list-btn ${listOn ? 'on' : ''}`}
            // Keep focus (and the selection) in the body while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggle}
            title="Bulleted list (Ctrl+Shift+8). Or start a line with “- ”"
            aria-pressed={listOn}
          >
            <span aria-hidden>•</span> List
          </button>
          <span className="muted hint hide-touch">Enter to save · Shift+Enter new line</span>
          <span className="spacer" />
          {props.footer}
        </div>
      )}
    </div>
  )
}

/** A note's body: plain paragraphs, with bullet lines shown as a list and web addresses as links. */
export function NoteBody({ text }: { text: string }) {
  const blocks = parseNote(text)
  if (!blocks.length) return null
  return (
    <div className="note-body">
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            <NoteText text={b.text} />
          </p>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <NoteText text={it} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}
