/**
 * Three-way merge for synced values.
 *
 * Each stored key (tasks, notes, projects, settings, ...) is one JSON value.
 * When two devices both changed a key since they last agreed, we merge
 * against that last agreed copy (the "base") instead of letting one side
 * overwrite the other:
 *
 * - Lists of objects with an `id` (tasks, notes, projects, a project's lists
 *   and items) merge item by item, so a task added on the phone and a note
 *   edited on the desktop both survive.
 * - Plain objects (settings, a single task, weekly reflections) merge field by
 *   field. Fields this code has never heard of merge the same way, so new
 *   features carry through without changes here.
 * - Lists of plain values (a streak's check-in days) merge as sets.
 * - If both sides changed the very same field, this device's value wins.
 *
 * With no base (the first sync on a device), everything is unioned, so
 * nothing on either side is lost.
 */

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** JSON with sorted keys, so equal values compare equal regardless of key order. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (isObj(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

export const same = (a: unknown, b: unknown) => a === b || stableStringify(a) === stableStringify(b)

const hasId = (v: unknown): v is Obj & { id: string | number } =>
  isObj(v) && (typeof v.id === 'string' || typeof v.id === 'number')
const isIdList = (v: unknown): v is (Obj & { id: string | number })[] => Array.isArray(v) && v.every(hasId)
const isScalarList = (v: unknown): v is unknown[] => Array.isArray(v) && v.every((x) => !isObj(x) && !Array.isArray(x))

export function merge3(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, remote)) return local
  if (base !== undefined) {
    if (same(local, base)) return remote
    if (same(remote, base)) return local
  }
  // Both changed (or there is no base). Merge by shape.
  if (local === undefined) return remote
  if (remote === undefined) return local // edited here, removed there: keep the edit
  if (isIdList(local) && isIdList(remote) && (base === undefined || isIdList(base))) return mergeIdLists(base, local, remote)
  if (isScalarList(local) && isScalarList(remote) && (base === undefined || isScalarList(base))) return mergeSets(base, local, remote)
  if (isObj(local) && isObj(remote) && (base === undefined || isObj(base))) return mergeObjects(base, local, remote)
  return local
}

function mergeObjects(base: Obj | undefined, local: Obj, remote: Obj): Obj {
  const out: Obj = {}
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const k of keys) {
    const v = merge3(base?.[k], local[k], remote[k])
    if (v !== undefined) out[k] = v
  }
  return out
}

function mergeSets(base: unknown[] | undefined, local: unknown[], remote: unknown[]): unknown[] {
  const key = stableStringify
  const inBase = new Set((base ?? []).map(key))
  const inRemote = new Set(remote.map(key))
  const inLocal = new Set(local.map(key))
  // Keep local items unless the other device removed them; add what it added.
  const out = local.filter((x) => !(inBase.has(key(x)) && !inRemote.has(key(x))))
  for (const x of remote) if (!inLocal.has(key(x)) && !inBase.has(key(x))) out.push(x)
  return out
}

type Item = Obj & { id: string | number }

function mergeIdLists(base: Item[] | undefined, local: Item[], remote: Item[]): Item[] {
  const b = new Map((base ?? []).map((x) => [x.id, x]))
  const r = new Map(remote.map((x) => [x.id, x]))
  const l = new Map(local.map((x) => [x.id, x]))
  const out: Item[] = []

  // This device's order first.
  for (const item of local) {
    const theirs = r.get(item.id)
    const was = b.get(item.id)
    if (theirs) out.push(merge3(was, item, theirs) as Item)
    else if (!was) out.push(item) // added here
    else if (!same(item, was)) out.push(item) // removed there but edited here: keep the edit
    // else removed on the other device: drop
  }

  // Then what only the other device has, placed after its neighbour there.
  remote.forEach((item, i) => {
    if (l.has(item.id)) return
    const was = b.get(item.id)
    if (was && same(item, was)) return // removed here
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((x) => x.id === remote[j].id)
      if (idx >= 0) {
        at = idx + 1
        break
      }
    }
    out.splice(at, 0, item)
  })
  return out
}
