import type { Source } from './model.ts'
import { parseLink } from './parseLink.ts'
import type { ParsedLink } from './types.ts'
import { normalizeForMatch, normalizeForSearch } from './text.ts'

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
  opts: { id: string; label: string | null; title?: string | null; now: T },
): Source<T> {
  const source: Source<T> = {
    id: opts.id,
    site: parsed.site,
    url: parsed.url,
    canonicalKey: parsed.canonicalKey,
    label: opts.label?.trim() || null,
    addedAt: opts.now,
    lastOpenedAt: null,
  }
  const title = opts.title?.trim()
  if (title) source.title = title
  if (parsed.ytVideoId !== undefined) source.ytVideoId = parsed.ytVideoId
  if (parsed.ytStartSec !== undefined) source.ytStartSec = parsed.ytStartSec
  if (parsed.ytPlaylistId !== undefined) source.ytPlaylistId = parsed.ytPlaylistId
  if (parsed.ugType !== undefined) source.ugType = parsed.ugType
  if (parsed.ugTabId !== undefined) source.ugTabId = parsed.ugTabId
  if (parsed.ssSongId !== undefined) source.ssSongId = parsed.ssSongId
  return source
}

/** The derived fields of SPEC §3. Run on every write that changes sources, title or artist. */
export function deriveFields(song: { title: string; artist: string | null; sources: { canonicalKey: string }[] }): {
  sourceKeys: string[]
  matchKey: string | null
} {
  const title = normalizeForMatch(song.title ?? '')
  return {
    sourceKeys: song.sources.map((s) => s.canonicalKey),
    matchKey: title ? `${title}|${normalizeForMatch(song.artist ?? '')}` : null,
  }
}

/** True when the stored derived fields are missing or don't match what deriveFields gives. */
export function derivedFieldsStale(song: {
  title: string
  artist: string | null
  sources: { canonicalKey: string }[]
  sourceKeys?: string[]
  matchKey?: string | null
}): boolean {
  const want = deriveFields(song)
  const have = song.sourceKeys
  return (
    !Array.isArray(have) ||
    have.length !== want.sourceKeys.length ||
    have.some((k, i) => k !== want.sourceKeys[i]) ||
    song.matchKey !== want.matchKey
  )
}

/** A new chart resource (SPEC §4.8): site 'chart', no URL, canonicalKey 'chart:<id>'. The text is kept exactly; the title is trimmed, and empty becomes null. */
export function chartSource<T>(opts: { id: string; title: string; text: string; now: T }): Source<T> {
  return {
    id: opts.id,
    site: 'chart',
    url: '',
    canonicalKey: `chart:${opts.id}`,
    label: null,
    title: opts.title.trim() || null,
    text: opts.text,
    addedAt: opts.now,
    lastOpenedAt: null,
  }
}

/** True for the user's own chart (SPEC §4.8), as opposed to a link. */
export const isChart = (s: { site: string }) => s.site === 'chart'

/** What a chart is called (SPEC §4.8): its own title, else the song's title and artist ("Kiss of Life · Sade"). */
export function chartTitle(chart: { title?: string | null }, song: { title: string; artist: string | null }): string {
  return chart.title?.trim() || [song.title, song.artist].filter(Boolean).join(' · ')
}

/**
 * The key for a chart saved from a text file (extension SPEC §5.1): 'chart:' + the file's URL, so saving the same
 * file again finds its chart. http(s) URLs are normalized as the parser does; others (file:) only lose the fragment.
 */
export function chartKeyForFile(url: string): string {
  return `chart:${fileUrlForChart(url)}`
}

function fileUrlForChart(url: string): string {
  if (/^https?:\/\//i.test(url)) return parseLink(url)?.url ?? url
  return url.split('#')[0]!
}

/** A chart saved from a text file: like chartSource, but it keeps the file's URL and is keyed by it. */
export function fileChartSource<T>(opts: { id: string; url: string; title: string; text: string; now: T }): Source<T> {
  return { ...chartSource(opts), url: fileUrlForChart(opts.url), canonicalKey: chartKeyForFile(opts.url) }
}

/** The file's name without folders or extension, underscores read as spaces: ".../Sade%20-%20Kiss_of_Life.txt" → "Sade - Kiss of Life". */
export function fileBaseName(url: string): string {
  let path = url.split(/[?#]/)[0]!
  path = path.slice(path.lastIndexOf('/') + 1)
  try {
    path = decodeURIComponent(path)
  } catch {
    /* keep it as it is */
  }
  return path.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Title and artist guessed from a text file's name, read as "Artist - Song" (like YouTube titles); else all of it is the title. */
export function guessFromFileName(url: string): { titleGuess: string | null; artistGuess: string | null } {
  const name = fileBaseName(url)
  const dash = name.indexOf(' - ')
  if (dash > 0 && dash + 3 < name.length) return { artistGuess: name.slice(0, dash).trim(), titleGuess: name.slice(dash + 3).trim() }
  return { titleGuess: name || null, artistGuess: null }
}

/**
 * Songs to offer as you type in a song picker (extension SPEC §6.6): titles with a word starting with the typed text
 * first, then artists that do, then titles or artists that only contain it. Each group keeps the order of `songs`.
 * Matching ignores case, accents and punctuation. Nothing typed suggests nothing.
 */
export function suggestSongs<S extends { title: string; artist: string | null }>(songs: S[], typed: string, limit = 6): S[] {
  const q = normalizeForSearch(typed)
  if (!q) return []
  const wordStart = (s: string) => s.startsWith(q) || s.includes(` ${q}`)
  const groups: S[][] = [[], [], []]
  for (const song of songs) {
    const title = normalizeForSearch(song.title)
    const artist = normalizeForSearch(song.artist ?? '')
    if (wordStart(title)) groups[0]!.push(song)
    else if (wordStart(artist)) groups[1]!.push(song)
    else if (title.includes(q) || artist.includes(q)) groups[2]!.push(song)
  }
  return groups.flat().slice(0, limit)
}

/** The song whose title is exactly this one (same normalization as the duplicate-song match, SPEC §4.4), if any. */
export function findSongByTitle<S extends { title: string }>(songs: S[], title: string): S | undefined {
  const t = normalizeForMatch(title)
  return t ? songs.find((s) => normalizeForMatch(s.title) === t) : undefined
}
