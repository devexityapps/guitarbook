import type { Site } from './types.ts'

// Data model (SPEC §3). `T` is the timestamp type, so this folder needs no Firebase import:
// the app uses Song<Timestamp>.

export type Status = 'wishlist' | 'learning' | 'polishing' | 'canplay'
export type KeyMode = 'major' | 'minor'

/** What a song's resource is: a link on one of the parsed sites, or the user's own chart (SPEC §4.8). The parser never returns 'chart'. */
export type ResourceSite = Site | 'chart'

/** Longest chart text the app accepts (SPEC §3), well under Firestore's 1 MiB per document. */
export const CHART_MAX_LENGTH = 50_000

/** A song's resource (SPEC §3): a link, or a chart (site 'chart', url '', the text in `text`). */
export interface Source<T> {
  id: string
  site: ResourceSite
  url: string
  canonicalKey: string
  label: string | null
  /** The page's own title (tab or bookmark title), prefilled when the link is saved and editable after. Absent on older links. Required for a chart. */
  title?: string | null
  /** Charts only: the chart itself, plain text with spacing kept exactly. */
  text?: string
  ytVideoId?: string
  ytStartSec?: number
  ytPlaylistId?: string
  ugType?: string
  ugTabId?: string
  ssSongId?: string
  addedAt: T
  lastOpenedAt: T | null
}

export interface Song<T> {
  title: string
  artist: string | null
  keyRoot: string | null
  keyMode: KeyMode | null
  tags: string[]
  status: Status
  notes: string
  sources: Source<T>[]
  createdAt: T
  updatedAt: T
  lastOpenedAt: T | null
  openCount: number
  /** Derived (SPEC §3): sources.map(s => s.canonicalKey). See deriveFields. */
  sourceKeys: string[]
  /** Derived (SPEC §3): normalized "title|artist"; null if the title is empty. */
  matchKey: string | null
}

export const KEY_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'] as const

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'learning', label: 'Learning' },
  { value: 'polishing', label: 'Polishing' },
  { value: 'canplay', label: 'Ready' },
]


export const SITE_NAMES: Record<ResourceSite, string> = {
  youtube: 'YouTube',
  ultimateguitar: 'Ultimate Guitar',
  songsterr: 'Songsterr',
  other: 'Other',
  chart: 'My chart',
}

/** users/{uid}.settings (SPEC §3). */
export interface Settings {
  staleDays: number
  showThumbnails: boolean
}

export const DEFAULT_SETTINGS: Settings = { staleDays: 30, showThumbnails: true }
