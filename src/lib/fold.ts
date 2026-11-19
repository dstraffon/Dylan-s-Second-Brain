import { useCallback } from 'react'
import { store, usePersisted } from './storage'

/**
 * Which dashboard tiles are folded down to their header. Kept per device
 * (the ui: prefix keeps it out of sync), since a phone usually wants long
 * tiles folded while the desktop has room for everything.
 */
const KEY = 'ui:folded'
type Folded = Record<string, true>

export function useFold(id: string | undefined) {
  const [folded, setFolded] = usePersisted<Folded>(KEY, {})
  const toggle = useCallback(() => {
    if (!id) return
    setFolded((f) => {
      const next = { ...f }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }, [id, setFolded])
  return [!!id && !!folded[id], toggle] as const
}

/** Opens a tile, e.g. before a quick key focuses the input inside it. */
export function unfold(id: string) {
  const f = store.get<Folded>(KEY, {})
  if (!f[id]) return
  const next = { ...f }
  delete next[id]
  store.set(KEY, next)
}
