import type { Source } from './model.ts'
import type { ParsedLink, Role } from './types.ts'
import { normalizeForMatch } from './text.ts'

interface SongLike {
  id: string
  title: string
  artist: string | null
  sources: { canonicalKey: string }[]
}

/** The song that already holds a link with this canonical key, if any (SPEC §4.4: never add a duplicate). */
export function findSongByKey<S extends SongLike>(songs: S[], canonicalKey: string): S | undefined {
  return songs.find((s) => s.sources.some((src) => src.canonicalKey === canonicalKey))
}

/** A song with the same normalized title and artist (SPEC §4.4). Needs both a title and an artist. */
export function findMatchingSong<S extends SongLike>(songs: S[], title: string | null, artist: string | null): S | undefined {
  if (!title || !artist) return undefined
  const t = normalizeForMatch(title)
  const a = normalizeForMatch(artist)
  if (!t || !a) return undefined
  return songs.find((s) => s.artist && normalizeForMatch(s.title) === t && normalizeForMatch(s.artist) === a)
}

/** Add tags, keeping the existing casing and dropping case-insensitive duplicates. */
export function mergeTags(existing: string[], add: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...existing, ...add]) {
    const tag = raw.trim()
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/** Build a Source from a parse result. Optional fields are left out (Firestore rejects `undefined`). */
export function sourceFromParsed<T>(
  parsed: ParsedLink,
  opts: { id: string; role: Role; label: string | null; now: T },
): Source<T> {
  const source: Source<T> = {
    id: opts.id,
    site: parsed.site,
    url: parsed.url,
    canonicalKey: parsed.canonicalKey,
    role: opts.role,
    label: opts.label?.trim() || null,
    addedAt: opts.now,
    lastOpenedAt: null,
  }
  if (parsed.ytVideoId !== undefined) source.ytVideoId = parsed.ytVideoId
  if (parsed.ytStartSec !== undefined) source.ytStartSec = parsed.ytStartSec
  if (parsed.ytPlaylistId !== undefined) source.ytPlaylistId = parsed.ytPlaylistId
  if (parsed.ugType !== undefined) source.ugType = parsed.ugType
  if (parsed.ugTabId !== undefined) source.ugTabId = parsed.ugTabId
  if (parsed.ssSongId !== undefined) source.ssSongId = parsed.ssSongId
  return source
}
