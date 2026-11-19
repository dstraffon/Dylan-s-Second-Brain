import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { localStorageAdapter as local, type StorageAdapter } from '../storage'
import { isDeviceOnly, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './config'
import { merge3, same } from './merge'

/**
 * Cross-device sync, offline first.
 *
 * The app keeps reading and writing localStorage exactly as before, so it
 * works with no connection. This engine mirrors every stored key (except
 * device-only ones) to one row in a Supabase table:
 *
 *   kv(user_id, key, value jsonb, version int, updated_at)
 *
 * - A local write marks the key "dirty"; dirty keys are pushed shortly after,
 *   and again whenever the app comes back online or into view.
 * - A push only succeeds if the row's version is the one this device last
 *   saw. If another device got there first, we fetch its copy, three-way
 *   merge (see merge.ts) and try again, so neither side's edits are lost.
 * - Other devices' changes arrive live (Supabase Realtime), plus a full
 *   check on load, on focus and every minute as a fallback.
 *
 * Keys are synced as opaque JSON, so new fields and new keys need no
 * changes here.
 */

export type SyncState = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  email?: string
  lastSynced?: number
  /** Keys changed here and not yet saved to the cloud. */
  pending: number
  error?: string
  /** A copy of this device's data from just before its first sync. */
  backupAt?: string
}

interface Row {
  key: string
  value: unknown
  version: number
}
interface Meta {
  /** Version of the cloud row this device last agreed with. */
  v: number
  /** That agreed value: the base for three-way merges. */
  base: unknown
}

const META = 'sbsync:m:'
const DIRTY = 'sbsync:dirty'
const UID = 'sbsync:uid'
const BACKUP = 'sbsync:backup'
const TABLE = 'kv'

const raw = {
  get<T>(k: string): T | undefined {
    try {
      const v = localStorage.getItem(k)
      return v == null ? undefined : (JSON.parse(v) as T)
    } catch {
      return undefined
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch (err) {
      console.warn('Sync: could not save', k, err)
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

const getMeta = (key: string) => raw.get<Meta>(META + key)
const setMeta = (key: string, m: Meta) => raw.set(META + key, m)
const dirtyKeys = () => new Set(raw.get<string[]>(DIRTY) ?? [])
const saveDirty = (s: Set<string>) => raw.set(DIRTY, [...s])

const syncedLocalKeys = () => local.keys().filter((k) => !isDeviceOnly(k))

class SyncEngine {
  private status: SyncStatus = { state: syncConfigured() ? 'signed-out' : 'off', pending: 0 }
  private statusListeners = new Set<() => void>()
  private changeListeners = new Set<(key: string) => void>()
  private client?: SupabaseClient
  private session: Session | null = null
  private channel?: RealtimeChannel
  private running: Promise<void> | null = null
  private again = false
  private pushTimer?: number

  // ---- status, for the UI ----
  getStatus = () => this.status
  onStatus = (l: () => void) => {
    this.statusListeners.add(l)
    return () => void this.statusListeners.delete(l)
  }
  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, pending: dirtyKeys().size, backupAt: raw.get<{ at: string }>(BACKUP)?.at, ...patch }
    this.statusListeners.forEach((l) => l())
  }

  /** The storage adapter the app uses once sync is configured. */
  adapter: StorageAdapter = {
    read: (key) => local.read(key),
    keys: () => local.keys(),
    write: (key, value) => {
      local.write(key, value)
      this.touched(key)
    },
    remove: (key) => {
      local.remove(key)
      this.touched(key)
    },
    subscribe: (onChange) => {
      this.changeListeners.add(onChange)
      const offLocal = local.subscribe?.(onChange)
      return () => {
        this.changeListeners.delete(onChange)
        offLocal?.()
      }
    },
  }

  private touched(key: string) {
    if (isDeviceOnly(key)) return
    const d = dirtyKeys()
    d.add(key)
    saveDirty(d)
    this.setStatus({})
    window.clearTimeout(this.pushTimer)
    this.pushTimer = window.setTimeout(() => void this.syncNow(), 1200)
  }

  async init() {
    if (!syncConfigured()) return
    const { createClient } = await import('@supabase/supabase-js')
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit flow: the emailed link works in whichever browser opens it.
        flowType: 'implicit',
        storageKey: 'sbsync-auth',
      },
    })
    this.client.auth.onAuthStateChange((_event, session) => {
      // Supabase asks not to await its own calls inside this callback.
      setTimeout(() => this.onSession(session), 0)
    })
    const { data } = await this.client.auth.getSession()
    this.onSession(data.session)

    window.addEventListener('online', () => void this.syncNow())
    window.addEventListener('offline', () => this.session && this.setStatus({ state: 'offline' }))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncNow()
    })
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow()
    }, 60_000)
  }

  private onSession(session: Session | null) {
    const prevUid = this.session?.user.id
    this.session = session
    if (!session) {
      this.channel?.unsubscribe()
      this.channel = undefined
      this.setStatus({ state: 'signed-out', email: undefined })
      return
    }
    this.setStatus({ email: session.user.email })
    if (prevUid === session.user.id) return // just a token refresh

    if (raw.get<string>(UID) !== session.user.id) this.startFresh(session.user.id)
    this.listen(session.user.id)
    void this.syncNow()
  }

  /** First sync for this account on this device: keep a copy, then merge everything. */
  private startFresh(uid: string) {
    const keys = syncedLocalKeys()
    if (keys.length && !raw.get(BACKUP)) {
      const data: Record<string, unknown> = {}
      for (const k of keys) data[k] = local.read(k)
      raw.set(BACKUP, { at: new Date().toISOString(), data })
    }
    for (const k of Object.keys(localStorage)) if (k.startsWith(META)) raw.del(k)
    saveDirty(new Set(keys))
    raw.set(UID, uid)
  }

  private listen(uid: string) {
    this.channel?.unsubscribe()
    this.channel = this.client!.channel(`kv-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${uid}` }, (p) => {
        const row = p.new as Partial<Row> | undefined
        // Our own pushes echo back; skip those.
        if (row?.key && getMeta(row.key)?.v === row.version) return
        void this.syncNow()
      })
      .subscribe()
  }

  /** Pull, merge and push. Calls made while one is running fold into one more pass. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.cycle()
      } while (this.again)
    })().finally(() => (this.running = null))
    return this.running
  }

  private async cycle() {
    const db = this.client
    if (!db || !this.session) return
    if (!navigator.onLine) return this.setStatus({ state: 'offline' })
    this.setStatus({ state: 'syncing' })
    try {
      const { data, error } = await db.from(TABLE).select('key,value,version')
      if (error) throw error
      const seen = new Set<string>()
      for (const row of data as Row[]) {
        if (isDeviceOnly(row.key)) continue
        seen.add(row.key)
        this.reconcile(row)
      }
      // Anything here the cloud has never seen gets uploaded.
      const d = dirtyKeys()
      for (const k of syncedLocalKeys()) if (!seen.has(k) && !getMeta(k)) d.add(k)
      saveDirty(d)

      for (const k of dirtyKeys()) await this.push(k)
      this.setStatus({ state: 'synced', lastSynced: Date.now(), error: undefined })
    } catch (err) {
      console.warn('Sync failed', err)
      const offline = !navigator.onLine
      this.setStatus({ state: offline ? 'offline' : 'error', error: offline ? undefined : describe(err) })
    }
  }

  /** Bring a cloud row into this device, merging with any unsynced local edits. */
  private reconcile(row: Row) {
    const meta = getMeta(row.key)
    if (meta && meta.v === row.version) return // nothing new from the cloud
    const mine = local.read(row.key)
    const theirs = row.value === null ? undefined : row.value
    const merged = merge3(meta?.base, mine, theirs)
    if (!same(merged, mine)) {
      if (merged === undefined) local.remove(row.key)
      else local.write(row.key, merged)
      this.changeListeners.forEach((l) => l(row.key))
    }
    setMeta(row.key, { v: row.version, base: theirs })
    const d = dirtyKeys()
    if (same(merged, theirs)) d.delete(row.key)
    else d.add(row.key)
    saveDirty(d)
  }

  /** Save one key to the cloud, retrying through a merge if another device saved first. */
  private async push(key: string) {
    const db = this.client!
    for (let attempt = 0; attempt < 4; attempt++) {
      const meta = getMeta(key)
      const value = local.read(key)
      const payload = value === undefined ? null : value
      let saved: number | null = null
      if (meta) {
        const { data, error } = await db
          .from(TABLE)
          .update({ value: payload, version: meta.v + 1, updated_at: new Date().toISOString() })
          .eq('key', key)
          .eq('version', meta.v)
          .select('version')
        if (error) throw error
        if (data.length) saved = meta.v + 1
      } else {
        const { error } = await db.from(TABLE).insert({ key, value: payload, version: 1 })
        if (!error) saved = 1
        else if (error.code !== '23505') throw error // 23505: the row already exists
      }
      if (saved !== null) {
        setMeta(key, { v: saved, base: value })
        if (same(local.read(key), value)) {
          const d = dirtyKeys()
          d.delete(key)
          saveDirty(d)
        }
        return
      }
      // Another device saved first: take its copy, merge, and go again.
      const { data: row, error } = await db.from(TABLE).select('key,value,version').eq('key', key).maybeSingle()
      if (error) throw error
      if (row) this.reconcile(row as Row)
      else raw.del(META + key)
      if (!dirtyKeys().has(key)) return
    }
    throw new Error(`Kept colliding while saving ${key}`)
  }

  // ---- sign-in ----
  async sendSignInEmail(email: string) {
    const { error } = await this.client!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (error) throw error
  }
  async verifyCode(email: string, code: string) {
    const { error } = await this.client!.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw error
  }
  async signOut() {
    await this.client?.auth.signOut({ scope: 'local' })
  }

  /** The copy of this device's data from before its first sync, in the backup file format. */
  backupFile() {
    const b = raw.get<{ at: string; data: Record<string, unknown> }>(BACKUP)
    return b && { app: 'second-brain', version: 1, savedAt: b.at, data: b.data }
  }
}

function describe(err: unknown) {
  const msg = (err as { message?: string })?.message
  if (msg && /relation .*kv.* does not exist|Could not find the table/i.test(msg)) return 'The sync table is missing. Run supabase/schema.sql in Supabase.'
  if (msg && /JWT|token/i.test(msg)) return 'Your sign-in expired. Sign in again.'
  return msg || 'Something went wrong.'
}

export const syncEngine = new SyncEngine()

export function useSyncStatus() {
  return useSyncExternalStore(syncEngine.onStatus, syncEngine.getStatus)
}
