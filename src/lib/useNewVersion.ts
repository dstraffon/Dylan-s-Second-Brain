import { useEffect, useState } from 'react'

declare const __BUILD_ID__: string

const CHECK_EVERY = 5 * 60 * 1000 // while the tab is open and visible
const MIN_GAP = 30 * 1000 // between checks triggered by focus

/**
 * Watches for a newer deploy. Each build writes its id into the bundle and
 * into version.json next to index.html. The app fetches version.json (never
 * from cache) on load, when the tab or home-screen app comes back into view,
 * and every few minutes. When the ids differ, a newer build is live.
 */
export function useNewVersion() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let last = 0
    let stopped = false
    const check = async (force = false) => {
      if (stopped || document.visibilityState !== 'visible') return
      if (!force && Date.now() - last < MIN_GAP) return
      last = Date.now()
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const { id } = (await res.json()) as { id?: string }
        if (id && id !== __BUILD_ID__ && !stopped) setAvailable(true)
      } catch {
        // Offline or a blip: try again next time.
      }
    }
    const onVisible = () => void check()
    check(true)
    const timer = window.setInterval(() => check(true), CHECK_EVERY)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return available
}

/**
 * Reloads onto the new build. GitHub Pages lets browsers keep index.html for
 * up to 10 minutes, so a plain reload can come back with the old page. Fetching
 * it with cache: 'reload' first replaces the cached copy, then the reload uses it.
 * Saved data lives in localStorage and is untouched; the hash keeps the open view.
 */
export async function reloadToNewVersion() {
  try {
    await fetch(window.location.pathname, { cache: 'reload' })
  } catch {
    // Reload anyway.
  }
  window.location.reload()
}
