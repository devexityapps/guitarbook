/** Whole local calendar days from `then` to `now` (SPEC §6): same day = 0, previous day = 1. */
export function calendarDaysBetween(then: Date, now: Date): number {
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** "Today", "1 day", "N days", or "Over a year" (never "N days" beyond 365). */
export function relativeDays(then: Date, now: Date): string {
  const days = calendarDaysBetween(then, now)
  if (days === 0) return 'Today'
  if (days > 365) return 'Over a year'
  return days === 1 ? '1 day' : `${days} days`
}

/** True when never opened, or opened more than `staleDays` days ago (SPEC §4.2). */
export function isStale(lastOpened: Date | null, now: Date, staleDays: number): boolean {
  return lastOpened === null || calendarDaysBetween(lastOpened, now) > staleDays
}
