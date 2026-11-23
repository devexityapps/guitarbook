import type { ResourceSite, Status } from './model.ts'
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
  sources: { site: ResourceSite; label: string | null; title?: string | null }[]
  createdAt: T
  lastOpenedAt: T | null
}

export interface Filters {
  query: string
  /** The song's status must be one of these (OR: a song has one status). Empty = all statuses. */
  statuses: Status[]
  /** Every listed tag must be on the song (AND), compared case-insensitively. */
  tags: string[]
  /** The song must have a link on at least one of these sites (OR). Empty = every site. */
  sites: ResourceSite[]
  keyRoot: string | null
}

export const NO_FILTERS: Filters = { query: '', statuses: [], tags: [], sites: [], keyRoot: null }

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
    if (f.statuses.length && !f.statuses.includes(s.status)) return false
    if (f.keyRoot && s.keyRoot !== f.keyRoot) return false
    if (f.sites.length && !s.sources.some((src) => f.sites.includes(src.site))) return false
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

/** How many choices are on in the filters sheet: each status, tag and site, plus the key. The search text isn't counted. */
export function activeFilterCount(f: Filters): number {
  return f.statuses.length + f.tags.length + f.sites.length + (f.keyRoot ? 1 : 0)
}

/**
 * Existing tags to offer while typing a new one: those whose words start with the typed text come before those that
 * merely contain it (each group keeps `allTags`' order, most used first). Tags the item already has are left out.
 * Matching ignores case, accents and punctuation. With nothing typed, every tag the item doesn't have is offered.
 */
export function suggestTags(allTags: string[], have: string[], typed: string, limit = 6): string[] {
  const q = normalizeForSearch(typed)
  const taken = new Set(have.map((t) => t.toLowerCase()))
  if (!q) return allTags.filter((t) => !taken.has(t.toLowerCase())).slice(0, limit)
  const starts: string[] = []
  const contains: string[] = []
  for (const tag of allTags) {
    if (taken.has(tag.toLowerCase())) continue
    const n = normalizeForSearch(tag)
    if (n.startsWith(q) || n.includes(` ${q}`)) starts.push(tag)
    else if (n.includes(q)) contains.push(tag)
  }
  return [...starts, ...contains].slice(0, limit)
}
