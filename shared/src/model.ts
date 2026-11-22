import type { Role, Site } from './types.ts'

// Data model (SPEC §3). `T` is the timestamp type, so this folder needs no Firebase import:
// the app uses Song<Timestamp>.

export type SongType = 'song' | 'lesson'
export type Status = 'wishlist' | 'learning' | 'canplay' | 'shelved'
export type KeyMode = 'major' | 'minor'

export interface Source<T> {
  id: string
  site: Site
  url: string
  canonicalKey: string
  role: Role
  label: string | null
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
  type: SongType
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
}

export const KEY_ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'] as const

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'learning', label: 'Learning' },
  { value: 'canplay', label: 'Can play' },
  { value: 'shelved', label: 'Shelved' },
]

export const ROLES: { value: Role; label: string }[] = [
  { value: 'lesson', label: 'Lesson' },
  { value: 'tab', label: 'Tab' },
  { value: 'chords', label: 'Chords' },
  { value: 'backing', label: 'Backing track' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
]

export const SITE_NAMES: Record<Site, string> = {
  youtube: 'YouTube',
  ultimateguitar: 'Ultimate Guitar',
  songsterr: 'Songsterr',
  other: 'Other',
}
