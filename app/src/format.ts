import type { Timestamp } from 'firebase/firestore'
import { relativeDays } from '@shared'

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

/** Right-hand column of a Library row: "Never / opened", "63 days / since opened". */
export function sinceOpened(ts: Timestamp | null, now = new Date()): { big: string; small: string } {
  if (!ts) return { big: 'Never', small: 'opened' }
  const rel = relativeDays(ts.toDate(), now)
  return { big: rel, small: rel === 'Today' ? 'opened' : 'since opened' }
}
