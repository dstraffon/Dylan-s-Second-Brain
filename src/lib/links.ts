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

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim() || undefined
const httpsOnly = (s?: string | null) => (s && /^https:\/\//.test(s) ? s : undefined)

async function getJson<T>(url: string, ms: number): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Microlink, free and keyless (about 50 a day). It renders the page, so it can be slow on heavy sites. */
async function fromMicrolink(url: string): Promise<LinkPreview | null> {
  const body = await getJson<{
    status?: string
    data?: { title?: string | null; description?: string | null; image?: { url?: string } | null; logo?: { url?: string } | null }
  }>(`https://api.microlink.io/?url=${encodeURIComponent(url)}&palette=false&audio=false&video=false&iframe=false`, 20000)
  if (body?.status !== 'success' || !body.data) return null
  const d = body.data
  return { title: clean(d.title), description: clean(d.description), image: httpsOnly(d.image?.url), icon: httpsOnly(d.logo?.url) }
}

/** Dub's free page-tag reader: a second opinion for sites that turn Microlink away (news paywalls and the like). */
async function fromDub(url: string): Promise<LinkPreview | null> {
  const d = await getJson<{ title?: string | null; description?: string | null; image?: string | null }>(
    `https://api.dub.co/metatags?url=${encodeURIComponent(url)}`,
    12000,
  )
  if (!d) return null
  const title = clean(d.title)
  // It echoes the URL back as the title when it found nothing.
  return { title: title && title !== url ? title : undefined, description: clean(d.description), image: httpsOnly(d.image) }
}

/** Posts on x.com / twitter.com, which block page readers. FxTwitter's free API returns the post itself. */
async function fromTweet(url: string): Promise<LinkPreview | null> {
  let id: string | undefined
  try {
    const u = new URL(url)
    if (!/^(www\.|mobile\.)?(x|twitter)\.com$/.test(u.hostname)) return null
    id = u.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1]
  } catch {
    return null
  }
  if (!id) return null
  const body = await getJson<{
    tweet?: {
      text?: string
      author?: { name?: string; avatar_url?: string }
      media?: { photos?: { url?: string }[]; videos?: { thumbnail_url?: string }[] }
    }
  }>(`https://api.fxtwitter.com/status/${id}`, 10000)
  const t = body?.tweet
  if (!t) return null
  const text = clean(t.text)
  const short = text && text.length > 90 ? text.slice(0, 88).trimEnd() + '…' : text
  return {
    title: t.author?.name ? `${t.author.name}${short ? `: ${short}` : ''}` : short,
    description: text,
    image: httpsOnly(t.media?.photos?.[0]?.url ?? t.media?.videos?.[0]?.thumbnail_url),
    icon: undefined,
  }
}

/**
 * Title, description, preview image and icon for a page. Posts on X go to FxTwitter; everything else
 * goes to Microlink, then Dub fills in whatever Microlink couldn't. The page's URL is sent to those
 * services. Returns null when every source failed (offline, timed out, rate-limited), so the caller
 * can try again later instead of giving up on the link for good.
 */
/** v2 added FxTwitter and Dub and a longer wait, so links v1 couldn't preview get another try. */
export const PREVIEW_VERSION = 2

export async function fetchPreview(url: string): Promise<LinkPreview | null> {
  const tweet = await fromTweet(url)
  if (tweet?.image || tweet?.title) return finish(tweet)
  const a = await fromMicrolink(url)
  if (a?.image && a.title) return finish(a)
  const b = await fromDub(url)
  if (!a && !b) return tweet ? finish(tweet) : null
  return finish({
    title: a?.title ?? b?.title ?? tweet?.title,
    description: a?.description ?? b?.description,
    image: a?.image ?? b?.image,
    icon: a?.icon,
  })
}

const finish = (p: LinkPreview): LinkPreview => ({ ...p, description: p.description?.slice(0, 280) })

/** YouTube's own thumbnail for a video link, straight from the video id (no lookup). Null for anything else. */
export function youtubeThumb(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www|m|music)\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? null
    }
    return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
  } catch {
    return null
  }
}

/** The picture to show on a card: the looked-up preview, else YouTube's thumbnail. */
export const previewImageOf = (l: LinkItem) => l.image ?? youtubeThumb(l.url) ?? undefined
