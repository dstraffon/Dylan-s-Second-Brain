import type { LinkItem, LinkKind } from '../types'

const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'tiktok.com',
  'twitch.tv',
  'dailymotion.com',
  'loom.com',
  'nebula.tv',
  'rumble.com',
  'ted.com',
]

export function normalizeUrl(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(s)) return null
    s = 'https://' + s
  }
  try {
    return new URL(s).toString()
  } catch {
    return null
  }
}

/** Pulls a URL out of pasted text; whatever is left over becomes the title. */
export function parseLinkInput(input: string) {
  const match = input.match(/https?:\/\/\S+/i) ?? input.match(/\b[\w-]+(\.[\w-]+)+\/\S*/)
  const url = normalizeUrl(match ? match[0] : input)
  if (!url) return null
  const rest = match ? input.replace(match[0], '').trim().replace(/^[-–—:|]+|[-–—:|]+$/g, '').trim() : ''
  return { url, title: rest }
}

export function detectKind(url: string): LinkKind {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (VIDEO_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
      if (host === 'ted.com' && !u.pathname.startsWith('/talks')) return 'article'
      return 'video'
    }
    if (host === 'instagram.com' && /^\/(reel|tv)\//.test(u.pathname)) return 'video'
    if ((host === 'x.com' || host === 'twitter.com') && u.pathname.includes('/video/')) return 'video'
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return 'video'
  } catch {
    /* fall through */
  }
  return 'article'
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Readable fallback title from the URL slug, e.g. /blog/how-to-sleep-better -> "How to sleep better". */
export function titleFromUrl(url: string) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const slug = parts.reverse().find((p) => /[a-z]/i.test(p) && p.length > 3 && !/^\d+$/.test(p))
    if (slug) {
      const words = decodeURIComponent(slug)
        .replace(/\.(html?|php|aspx?)$/i, '')
        .replace(/[-_+]+/g, ' ')
        .trim()
      if (words.length > 2) return words.charAt(0).toUpperCase() + words.slice(1)
    }
    return hostOf(url)
  } catch {
    return url
  }
}

/** Best-effort real title for video links via the keyless noembed.com oEmbed service. */
export async function fetchVideoTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { title?: string; error?: string }
    return data.title && !data.error ? data.title : null
  } catch {
    return null
  }
}

/** On the read / watch later queue. Links saved before the library existed have no flag: unread ones are on it. */
export const isLater = (l: LinkItem) => l.later ?? !l.readAt

/** True when the title is one we made up from the URL, so a looked-up title may replace it. */
export const isAutoTitle = (l: LinkItem) => l.title === titleFromUrl(l.url) || l.title === hostOf(l.url)

/** The site's own favicon, used until a lookup finds a better icon. */
export const faviconOf = (url: string) => {
  try {
    return new URL('/favicon.ico', url).toString()
  } catch {
    return ''
  }
}

export interface LinkPreview {
  title?: string
  description?: string
  image?: string
  icon?: string
}

/**
 * Title, description, preview image and icon for any page, from Microlink's free, keyless API
 * (about 50 lookups a day). The page's URL is sent to api.microlink.io. Returns null on any failure.
 */
export async function fetchPreview(url: string): Promise<LinkPreview | null> {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      status?: string
      data?: { title?: string | null; description?: string | null; image?: { url?: string } | null; logo?: { url?: string } | null }
    }
    if (body.status !== 'success' || !body.data) return null
    const d = body.data
    const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim() || undefined
    const https = (s?: string) => (s && /^https:\/\//.test(s) ? s : undefined)
    return {
      title: clean(d.title),
      description: clean(d.description)?.slice(0, 280),
      image: https(d.image?.url),
      icon: https(d.logo?.url),
    }
  } catch {
    return null
  }
}
