/**
 * Finds web addresses in plain text so they can be shown as links. Notes stay
 * plain text: nothing is stored, the links are found each time a note renders.
 *
 * Matches "http://", "https://" and "www." addresses. Punctuation that usually
 * ends a sentence (".", ",", "!", "?", ":", ";", quotes) is left out of the
 * link, and so is a closing bracket that has no opening one inside the address,
 * so "(see example.com/a)" and "https://en.wikipedia.org/wiki/Foo_(bar)" both
 * come out right.
 *
 * A link shows the address without its "https://" or "www.", which keeps it
 * short enough to fit a phone line; the full address is in its tooltip.
 */

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string; label: string }

/** What a link shows: the address without "https://" or "www." or a bare trailing slash, so it reads shorter. */
export const linkLabel = (url: string) => url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')

const URL_START = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi
const TRAILING = /[.,!?:;'"’”*_]+$/
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function trimEnd(url: string): string {
  for (;;) {
    const before = url
    url = url.replace(TRAILING, '')
    const last = url[url.length - 1]
    const open = PAIRS[last]
    if (open) {
      const opens = url.split(open).length - 1
      const closes = url.split(last).length - 1
      if (closes > opens) url = url.slice(0, -1)
    }
    if (url === before) return url
  }
}

/** Only web addresses become links, so a note can never carry a script link. */
export function toHref(url: string): string | null {
  const href = /^www\./i.test(url) ? `https://${url}` : url
  try {
    const u = new URL(href)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u.href
  } catch {
    return null
  }
}

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const m of text.matchAll(URL_START)) {
    const start = m.index!
    const raw = trimEnd(m[0])
    const href = raw && toHref(raw)
    if (!href || raw.replace(/^(https?:\/\/|www\.)/i, '') === '') continue
    if (start > at) parts.push({ kind: 'text', text: text.slice(at, start) })
    parts.push({ kind: 'link', text: raw, href, label: linkLabel(raw) })
    at = start + raw.length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}
