// Shared types. No React or Firebase imports in this folder (SPEC §2).

export type Site = 'youtube' | 'ultimateguitar' | 'songsterr' | 'other'

export type Role = 'lesson' | 'tab' | 'chords' | 'backing' | 'performance' | 'other'

export type Confidence = 'high' | 'low'

export interface ParsedLink {
  site: Site
  /** The URL after normalization (https, tracking params and fragment removed). */
  url: string
  /** 'yt:<id>', 'ytpl:<id>', 'ug:<id>', 'ss:<id>' or 'url:<normalized url>'. */
  canonicalKey: string
  role: Role

  ytVideoId?: string
  ytStartSec?: number
  ytPlaylistId?: string
  ugType?: string
  ugTabId?: string
  ssSongId?: string

  titleGuess: string | null
  artistGuess: string | null
  /** 'lesson' when the hint has lesson words; 'song' when it looks like "Artist - Song"; else null. */
  typeGuess: 'song' | 'lesson' | null
  suggestedTags: string[]
  /** 'low' means the name guess needs the user to look at it ("Check names" in the import). */
  confidence: Confidence
}
