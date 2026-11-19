import { useSyncExternalStore, type ReactNode } from 'react'

/**
 * One confirm step for every delete in the app. A delete button calls
 * `confirmDelete(...)` instead of deleting; <ConfirmDialog /> (mounted once in
 * App) shows the question and runs `onConfirm` only if the person agrees.
 * The delete itself is unchanged, so it saves and syncs like any other edit.
 */
export interface ConfirmRequest {
  /** The question, e.g. "Delete this task?" */
  title: string
  /** What's being deleted, shown quoted under the title. */
  name?: string
  /** Anything else worth knowing, e.g. what goes with it. */
  detail?: ReactNode
  /** The confirm button's label. Defaults to "Delete". */
  action?: string
  /** Replaces the closing "This can't be undone" line. */
  footnote?: ReactNode
  onConfirm: () => void
}

let current: ConfirmRequest | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function confirmDelete(req: ConfirmRequest) {
  current = req
  emit()
}

export function closeConfirm() {
  current = null
  emit()
}

export function useConfirmRequest() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
}

/** "3 notes", "1 item". */
export const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
