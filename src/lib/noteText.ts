/**
 * Notes stay plain text. A line starting with "- ", "* " or "• " is a bullet,
 * and runs of bullet lines render as a list. No markup is stored beyond that,
 * so old notes keep working and the text reads fine anywhere it is copied.
 */

const BULLET = /^\s*[-*•]\s+/
const BULLET_ONLY = /^\s*[-*•]\s*$/

export const isBullet = (line: string) => BULLET.test(line)

export type NoteBlock = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

export function parseNote(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let para: string[] = []
  let list: string[] = []
  const flushPara = () => {
    // Trim blank lines at the edges of a paragraph but keep ones inside it.
    while (para.length && !para[0].trim()) para.shift()
    while (para.length && !para[para.length - 1].trim()) para.pop()
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') })
    para = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'ul', items: list })
    list = []
  }
  for (const line of text.split('\n')) {
    if (BULLET_ONLY.test(line)) {
      // An empty bullet left behind while typing: drop it.
      continue
    } else if (isBullet(line)) {
      flushPara()
      list.push(line.replace(BULLET, ''))
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks
}

/** Text used for searching: bullets without their markers. */
export const searchText = (n: { title?: string; text: string }) =>
  `${n.title ?? ''}\n${n.text.replace(/^\s*[-*•]\s+/gm, '')}`.toLowerCase()

export interface Edit {
  value: string
  start: number
  end: number
}

/** Turns the lines touched by the selection into bullets, or back into plain lines if they all are. */
export function toggleBullets(value: string, selStart: number, selEnd: number): Edit {
  const from = value.lastIndexOf('\n', selStart - 1) + 1
  const nl = value.indexOf('\n', selEnd)
  const to = nl === -1 ? value.length : nl
  const lines = value.slice(from, to).split('\n')
  const allBullets = lines.every((l) => isBullet(l) || (lines.length > 1 && !l.trim()))
  const next = lines.map((l) => {
    if (allBullets) return l.replace(BULLET, '')
    if (isBullet(l) || (lines.length > 1 && !l.trim())) return l
    return `- ${l.replace(/^\s+/, '')}`
  })
  const replaced = next.join('\n')
  const out = value.slice(0, from) + replaced + value.slice(to)
  if (lines.length === 1) {
    // Keep the caret where it was relative to the line's text.
    const shift = replaced.length - lines[0].length
    const caret = Math.max(from + (allBullets ? 0 : 2), selEnd + shift)
    return { value: out, start: caret, end: caret }
  }
  return { value: out, start: from, end: from + replaced.length }
}

/**
 * New line inside a list: carries the bullet on, or ends the list when the
 * current bullet is empty. Returns null when the caret isn't on a bullet line.
 */
export function continueList(value: string, selStart: number, selEnd: number): Edit | null {
  const from = value.lastIndexOf('\n', selStart - 1) + 1
  const line = value.slice(from, selStart)
  if (BULLET_ONLY.test(line) && value.slice(selEnd).split('\n')[0].trim() === '') {
    const out = value.slice(0, from) + value.slice(selStart)
    return { value: out, start: from, end: from }
  }
  const m = line.match(BULLET)
  if (!m) return null
  const marker = m[0]
  const insert = '\n' + marker
  const out = value.slice(0, selStart) + insert + value.slice(selEnd)
  const caret = selStart + insert.length
  return { value: out, start: caret, end: caret }
}
