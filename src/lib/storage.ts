import { useCallback, useSyncExternalStore } from 'react'

/**
 * Storage layer.
 *
 * Every feature reads and writes through `store`, never through
 * localStorage directly. To add sync later (Supabase, Firebase, a small
 * API), write another StorageAdapter that keeps a local cache for
 * synchronous reads and pushes writes to the backend in the background,
 * then pass it to `setStorageAdapter` in main.tsx.
 */
export interface StorageAdapter {
  read<T>(key: string): T | undefined
  write<T>(key: string, value: T): void
  remove(key: string): void
  keys(): string[]
  /** Called when data changes outside this tab (another tab, a sync push). */
  subscribe?(onExternalChange: (key: string) => void): () => void
}

const PREFIX = 'sb:'

export const localStorageAdapter: StorageAdapter = {
  read<T>(key: string) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key)
      return raw == null ? undefined : (JSON.parse(raw) as T)
    } catch {
      return undefined
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch (err) {
      console.warn('Could not save', key, err)
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignore */
    }
  },
  keys() {
    try {
      return Object.keys(window.localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .map((k) => k.slice(PREFIX.length))
    } catch {
      return []
    }
  },
  subscribe(onExternalChange) {
    const handler = (e: StorageEvent) => {
      if (e.key?.startsWith(PREFIX)) onExternalChange(e.key.slice(PREFIX.length))
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  },
}

type Listener = () => void

class Store {
  private adapter: StorageAdapter = localStorageAdapter
  private cache = new Map<string, unknown>()
  private listeners = new Map<string, Set<Listener>>()
  private unsubscribeAdapter?: () => void

  constructor() {
    this.attach()
  }

  setAdapter(adapter: StorageAdapter) {
    this.unsubscribeAdapter?.()
    this.adapter = adapter
    this.cache.clear()
    this.attach()
    this.listeners.forEach((set) => set.forEach((l) => l()))
  }

  private attach() {
    if (typeof window === 'undefined') return
    this.unsubscribeAdapter = this.adapter.subscribe?.((key) => {
      this.cache.delete(key)
      this.emit(key)
    })
  }

  get<T>(key: string, fallback: T): T {
    if (!this.cache.has(key)) {
      const v = this.adapter.read<T>(key)
      this.cache.set(key, v === undefined ? fallback : v)
    }
    return this.cache.get(key) as T
  }

  set<T>(key: string, value: T) {
    this.cache.set(key, value)
    this.adapter.write(key, value)
    this.emit(key)
  }

  subscribe(key: string, l: Listener) {
    let set = this.listeners.get(key)
    if (!set) this.listeners.set(key, (set = new Set()))
    set.add(l)
    return () => set!.delete(l)
  }

  private emit(key: string) {
    this.listeners.get(key)?.forEach((l) => l())
  }

  /** Everything, for backup/export. */
  exportAll(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const k of this.adapter.keys()) out[k] = this.adapter.read(k)
    return out
  }

  importAll(data: Record<string, unknown>) {
    for (const [k, v] of Object.entries(data)) this.set(k, v)
  }
}

export const store = new Store()
export const setStorageAdapter = (a: StorageAdapter) => store.setAdapter(a)

/** useState that persists through the storage layer and stays in sync across components and tabs. */
export function usePersisted<T>(key: string, fallback: T) {
  const value = useSyncExternalStore(
    (l) => store.subscribe(key, l),
    () => store.get(key, fallback),
  )
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = store.get(key, fallback)
      const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      store.set(key, v)
    },
    // fallback is intentionally excluded: it only matters on first read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  return [value, setValue] as const
}
