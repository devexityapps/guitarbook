import type { Status } from './model.ts'
import type { Site } from './types.ts'
import { normalizeForSearch } from './text.ts'

/** Anything with a millisecond reading: a Firestore Timestamp fits, so this folder needs no Firebase import. */
export interface TimeLike {
  toMillis(): number
}

export interface QuerySong<T extends TimeLike = TimeLike> {
  title: string
  artist: string | null
  keyRoot: string | null
  status: Status
  tags: string[]
  sources: { site: Site; label: string | null; title?: string | null }[]
  createdAt: T
  lastOpenedAt: T | null
}

export interface Filters {
  query: string
  /** null = All. */
  status: Status | null
  /** Every listed tag must be on the song (AND), compared case-insensitively. */
  tags: string[]
  site: Site | null
  keyRoot: string | null
}

export const NO_FILTERS: Filters = { query: '', status: null, tags: [], site: null, keyRoot: null }

export type SortKey = 'untouched' | 'opened' | 'added' | 'az'

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'untouched', label: 'Longest untouched' },
  { value: 'opened', label: 'Recently opened' },
  { value: 'added', label: 'Recently added' },
  { value: 'az', label: 'A–Z' },
]

/** Search matches title, artist, tags, source labels and link titles; every word of the query must appear somewhere. */
export function matchesQuery(song: QuerySong, query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeForSearch(
    [song.title, song.artist ?? '', ...song.tags, ...song.sources.flatMap((s) => [s.label ?? '', s.title ?? ''])].join(' '),
  )
  return words.every((w) => haystack.includes(w))
}

export function filterSongs<S extends QuerySong>(songs: S[], f: Filters): S[] {
  const wantTags = f.tags.map((t) => t.toLowerCase())
  return songs.filter((s) => {
    if (f.status && s.status !== f.status) return false
    if (f.keyRoot && s.keyRoot !== f.keyRoot) return false
    if (f.site && !s.sources.some((src) => src.site === f.site)) return false
    if (wantTags.length) {
      const have = new Set(s.tags.map((t) => t.toLowerCase()))
      if (!wantTags.every((t) => have.has(t))) return false
    }
    return matchesQuery(s, f.query)
  })
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

export function sortSongs<S extends QuerySong>(songs: S[], sort: SortKey): S[] {
  const last = (s: S) => s.lastOpenedAt?.toMillis() ?? null
  const added = (s: S) => s.createdAt.toMillis()
  const byTitle = (a: S, b: S) => collator.compare(a.title, b.title)
  const cmp: Record<SortKey, (a: S, b: S) => number> = {
    // Never-opened first (oldest added first), then the oldest last-opened.
    untouched: (a, b) => {
      const la = last(a), lb = last(b)
      if (la === null && lb === null) return added(a) - added(b) || byTitle(a, b)
      if (la === null) return -1
      if (lb === null) return 1
      return la - lb || byTitle(a, b)
    },
    // Most recently opened first; never-opened last (newest added first).
    opened: (a, b) => {
      const la = last(a), lb = last(b)
      if (la === null && lb === null) return added(b) - added(a) || byTitle(a, b)
      if (la === null) return 1
      if (lb === null) return -1
      return lb - la || byTitle(a, b)
    },
    added: (a, b) => added(b) - added(a) || byTitle(a, b),
    az: byTitle,
  }
  return [...songs].sort(cmp[sort])
}

/** Distinct tags across songs (first casing wins), most used first, for the tag picker. */
export function collectTags(songs: { tags: string[] }[]): string[] {
  const counts = new Map<string, { tag: string; n: number }>()
  for (const s of songs) {
    for (const tag of s.tags) {
      const key = tag.toLowerCase()
      const hit = counts.get(key)
      if (hit) hit.n += 1
      else counts.set(key, { tag, n: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || collator.compare(a.tag, b.tag)).map((x) => x.tag)
}

export function activeFilterCount(f: Filters, group: 'more' | 'tags'): number {
  if (group === 'tags') return f.tags.length
  return (f.site ? 1 : 0) + (f.keyRoot ? 1 : 0)
}
