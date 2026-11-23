import type { ParsedLink } from './types.ts'
import { fixShouting, slugToTitle } from './text.ts'

const TRACKING_PARAMS = new Set(['si', 'feature', 'fbclid', 'gclid'])

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Returns a URL object with https forced and tracking params/fragment removed, or null if it isn't a web URL. */
function normalizeUrl(input: string): URL | null {
  let text = input.trim()
  if (!text || /\s/.test(text)) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}` // "www.youtube.com/..." pasted without a scheme
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname.includes('.')) return null
  url.protocol = 'https:'
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) url.searchParams.delete(key)
  }
  return url
}

/** Clean up a bookmark title / page title before parsing: "(4) " notification counts, " - YouTube". */
export function cleanPageTitle(hint: string | undefined): string | null {
  if (!hint) return null
  const text = hint
    .trim()
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/\s+-\s+YouTube$/i, '')
    .trim()
  return text || null
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])
const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** "90", "90s", "1m30s", "1h2m3s" -> seconds. */
export function parseTimeParam(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

function youtubeVideoId(url: URL): string | undefined {
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | undefined
  if (url.hostname === 'youtu.be') id = parts[0]
  else if (parts[0] === 'watch') id = url.searchParams.get('v') ?? undefined
  else if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) id = parts[1]
  return id && YT_ID.test(id) ? id : undefined
}

const LESSON_WORDS = /\b(lessons?|how to play|tutorials?|licks|scales?|exercises?)\b/i
// Covers often put the song first and the artist second ("Black Star - Radiohead (cover)"), so "Artist - Song" can't be trusted.
const COVER_WORDS = /\bcover\b/i
const NOISE_SUFFIX =
  /\s*[(\[]\s*(?:official[^)\]]*|video oficial|with lyrics|lyrics?|lyric video|audio|visuali[sz]er)\s*[)\]]\s*$/i

function stripNoise(text: string): string {
  let prev: string
  let out = text.replace(/\s+#\w+/g, '').trim() // hashtags
  do {
    prev = out
    out = out.replace(NOISE_SUFFIX, '').trim()
  } while (out !== prev)
  return out
}

function parseYouTube(url: URL, hint: string | null): ParsedLink | null {
  const videoId = youtubeVideoId(url)
  const playlistId = url.searchParams.get('list') ?? undefined
  const isPlaylistPage = url.hostname !== 'youtu.be' && url.pathname === '/playlist' && playlistId
  if (!videoId && !isPlaylistPage) return null

  const result: ParsedLink = {
    site: 'youtube',
    url: url.toString(),
    canonicalKey: videoId ? `yt:${videoId}` : `ytpl:${playlistId}`,
    titleGuess: null,
    artistGuess: null,
    suggestedTags: [],
    confidence: 'low',
  }
  if (videoId) {
    result.ytVideoId = videoId
    const start = parseTimeParam(url.searchParams.get('t') ?? url.searchParams.get('start'))
    if (start !== undefined) result.ytStartSec = start
  }
  if (playlistId) result.ytPlaylistId = playlistId

  if (hint) {
    // Lesson and cover titles don't follow "Artist - Song", so keep the whole title and guess no artist.
    if (LESSON_WORDS.test(hint) || COVER_WORDS.test(hint)) {
      result.titleGuess = stripNoise(hint)
    } else {
      const text = stripNoise(hint)
      const dash = text.indexOf(' - ')
      if (dash > 0 && dash + 3 < text.length) {
        result.artistGuess = text.slice(0, dash).trim()
        result.titleGuess = stripNoise(text.slice(dash + 3).trim())
        result.confidence = 'high'
      } else {
        result.titleGuess = text
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Ultimate Guitar
// ---------------------------------------------------------------------------

const UG_HOST = /(^|\.)ultimate-guitar\.com$/
// "SONG CHORDS (ver 2) by Artist @ Ultimate-Guitar.Com" (also "TAB", "UKULELE CHORDS", Spanish "ACORDES ... por")
const UG_TITLE =
  /^(.+?)\s+(?:(?:UKULELE|BASS|GUITAR PRO|PRO|OFFICIAL|DRUMS?|POWER)\s+)?(CHORDS|TABS?|ACORDES)(?:\s+\([^)]*\))?\s+(?:by|por)\s+(.+?)\s*@\s*Ultimate-Guitar\.Com$/i


function parseUltimateGuitar(url: URL, hint: string | null): ParsedLink | null {
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'tab') return null

  let tabId: string | undefined
  let type: string | undefined
  let artistSlug: string | undefined
  let songSlug: string | undefined

  if (parts.length === 2 && /^\d+$/.test(parts[1]!)) {
    tabId = parts[1] // es.ultimate-guitar.com/tab/<id>: no slugs at all
  } else if (parts.length === 3) {
    artistSlug = parts[1]
    const m = /^(.+?)[-_]([a-z]+)[-_](\d+)$/i.exec(parts[2]!)
    if (m) {
      songSlug = m[1]
      type = m[2]!.toLowerCase()
      tabId = m[3]
    }
  }
  if (!tabId) return null

  const fromTitle = hint ? UG_TITLE.exec(hint) : null
  if (!type && fromTitle) {
    const t = fromTitle[2]!.toLowerCase()
    type = t === 'acordes' ? 'chords' : t.startsWith('tab') ? 'tabs' : t
  }
  type ??= 'tabs'

  let titleGuess: string | null = null
  let artistGuess: string | null = null
  if (fromTitle) {
    titleGuess = fixShouting(fromTitle[1]!.trim())
    artistGuess = fixShouting(fromTitle[3]!.trim())
  } else {
    if (songSlug) titleGuess = slugToTitle(songSlug)
    if (artistSlug) artistGuess = slugToTitle(artistSlug)
  }

  return {
    site: 'ultimateguitar',
    url: url.toString(),
    canonicalKey: `ug:${tabId}`,
    ugType: type,
    ugTabId: tabId,
    titleGuess,
    artistGuess,
    suggestedTags: type === 'ukulele' ? ['ukulele'] : [],
    confidence: titleGuess && artistGuess ? 'high' : 'low',
  }
}

// ---------------------------------------------------------------------------
// Songsterr
// ---------------------------------------------------------------------------

const SS_PATH = /^\/a\/(?:wsa|wa)\/(.+?)-(?:(?:bass|drums?)-)?(?:tab|chords)-s(\d+)(?:t\d+)?$/i
// "Song Tab by Artist | Songsterr ..." plus "Solo Tab", "Vocal Tab", and a " - Track name" suffix after the artist.
const SS_TITLE = /^(.+?)\s+(?:(?:Solo|Vocal|Bass|Drums?)\s+)?(?:Tab|Chords)\s+by\s+(.+?)(?:\s+-\s+.+)?\s*\|\s*Songsterr/i

function parseSongsterr(url: URL, hint: string | null): ParsedLink | null {
  const m = SS_PATH.exec(url.pathname.replace(/\/$/, ''))
  if (!m) return null
  const [, slug, songId] = m
  const fromTitle = hint ? SS_TITLE.exec(hint) : null

  const result: ParsedLink = {
    site: 'songsterr',
    url: url.toString(),
    canonicalKey: `ss:${songId}`, // anything after the id (track suffix) is ignored
    ssSongId: songId,
    titleGuess: null,
    artistGuess: null,
    suggestedTags: [],
    confidence: 'low',
  }
  if (fromTitle) {
    result.titleGuess = fromTitle[1]!.trim()
    result.artistGuess = fromTitle[2]!.trim()
    result.confidence = 'high'
  } else {
    // The slug joins artist and song with hyphens and can't be split reliably.
    result.titleGuess = slugToTitle(slug!)
  }
  return result
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse a pasted or bookmarked link. Returns null when the input is not a web URL.
 * `titleHint` is the bookmark title (or the page title) and is the main source of names.
 */
export function parseLink(input: string, titleHint?: string): ParsedLink | null {
  const url = normalizeUrl(input)
  if (!url) return null
  const hint = cleanPageTitle(titleHint)

  let parsed: ParsedLink | null = null
  if (YT_HOSTS.has(url.hostname)) parsed = parseYouTube(url, hint)
  else if (UG_HOST.test(url.hostname)) parsed = parseUltimateGuitar(url, hint)
  else if (url.hostname === 'www.songsterr.com') parsed = parseSongsterr(url, hint)
  if (parsed) return parsed

  const normalized = url.toString().replace(/\/$/, '')
  return {
    site: 'other',
    url: url.toString(),
    canonicalKey: `url:${normalized}`,
    titleGuess: hint,
    artistGuess: null,
    suggestedTags: [],
    confidence: 'low',
  }
}
