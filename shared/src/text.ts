const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'con', 'de', 'del', 'el', 'en', 'for', 'in', 'la', 'las',
  'los', 'of', 'on', 'or', 'por', 'the', 'to', 'y',
])

/** "back-on-the-chain-gang" -> "Back on the Chain Gang". Hyphens and underscores become spaces. */
export function slugToTitle(slug: string): string {
  return titleCase(decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim())
}

export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Title-case only when the text is shouting (UG page titles are ALL CAPS). */
export function fixShouting(text: string): string {
  const letters = text.replace(/[^\p{L}]/gu, '')
  return letters.length > 1 && letters === letters.toUpperCase() ? titleCase(text) : text
}

/**
 * Key for matching songs by name (SPEC §4.4): lowercase, strip punctuation and a leading "the".
 * Accents are also stripped so "Así Es la Vida" matches "Asi Es la Vida" (see the report).
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the\s+/, '')
}
