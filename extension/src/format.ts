import type { Timestamp } from 'firebase/firestore'
import { relativeDays } from '@shared'

/** "opened 3 days ago" / "opened today" / "never opened". */
export function openedText(ts: Timestamp | null, now = new Date()): string {
  if (!ts) return 'never opened'
  const rel = relativeDays(ts.toDate(), now)
  if (rel === 'Today') return 'opened today'
  if (rel === 'Over a year') return 'opened over a year ago'
  return `opened ${rel} ago`
}

export const timesText = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`
