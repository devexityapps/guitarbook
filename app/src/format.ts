import type { Timestamp } from 'firebase/firestore'
import { relativeDays } from '@shared'

export const DEFAULT_STALE_DAYS = 30 // becomes a per-user setting in step 7

export const toDate = (ts: Timestamp | null): Date | null => (ts ? ts.toDate() : null)

/** "Opened 3 days ago" / "Opened today" / "Never opened". */
export function openedText(ts: Timestamp | null, now = new Date()): string {
  if (!ts) return 'Never opened'
  const rel = relativeDays(ts.toDate(), now)
  if (rel === 'Today') return 'Opened today'
  if (rel === 'Over a year') return 'Opened over a year ago'
  return `Opened ${rel} ago`
}

export function lastOpenedText(ts: Timestamp | null, count: number, now = new Date()): string {
  if (!ts) return 'Never opened'
  const rel = relativeDays(ts.toDate(), now)
  const when = rel === 'Today' ? 'today' : rel === 'Over a year' ? 'over a year ago' : `${rel} ago`
  return `Last opened ${when} · opened ${count} ${count === 1 ? 'time' : 'times'}`
}

export function keyText(root: string | null, mode: 'major' | 'minor' | null): string | null {
  if (!root) return null
  return mode === 'minor' ? `${root}m` : root
}
