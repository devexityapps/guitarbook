import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterSongs, sortSongs, matchesQuery, collectTags, suggestTags, activeFilterCount, NO_FILTERS, type QuerySong } from '../src/index.ts'

const t = (ms: number | null) => (ms === null ? null : { toMillis: () => ms })
const DAY = 86_400_000
const ago = (days: number) => (1000 - days) * DAY // a larger timestamp is more recent

function song(over: Partial<QuerySong> & { title: string; created?: number; opened?: number | null }): QuerySong & { id: string } {
  return {
    id: over.title,
    title: over.title,
    artist: over.artist ?? null,
    keyRoot: over.keyRoot ?? null,
    status: over.status ?? 'wishlist',
    tags: over.tags ?? [],
    sources: over.sources ?? [],
    createdAt: t(over.created ?? 0)!,
    lastOpenedAt: t(over.opened ?? null),
  }
}

const library = [
  song({ title: 'Landslide', artist: 'Fleetwood Mac', keyRoot: 'C', status: 'wishlist', created: 1 * DAY, opened: null, sources: [{ site: 'youtube', label: null }] }),
  song({ title: 'Little Wing', artist: 'Jimi Hendrix', keyRoot: 'E', status: 'canplay', created: 2 * DAY, opened: ago(40), sources: [{ site: 'youtube', label: null }, { site: 'ultimateguitar', label: 'Chords' }] }),
  song({ title: 'Minor pentatonic: all 5 boxes', keyRoot: 'A', status: 'learning', created: 3 * DAY, opened: ago(10), tags: ['Blues', 'scales'], sources: [{ site: 'youtube', label: 'Boxes' }] }),
  song({ title: 'Pride and Joy', artist: 'Stevie Ray Vaughan', keyRoot: 'E', status: 'learning', created: 4 * DAY, opened: ago(70), tags: ['blues', 'shuffle', 'Texas blues'], sources: [{ site: 'songsterr', label: 'Guitar tab' }, { site: 'ultimateguitar', label: null }] }),
  song({ title: 'Wonderful Tonight', artist: 'Eric Clapton', keyRoot: 'G', status: 'polishing', created: 0, opened: null, sources: [{ site: 'ultimateguitar', label: null }] }),
  song({ title: 'Así Es la Vida', artist: 'Elefante', status: 'canplay', created: 5 * DAY, opened: ago(20), sources: [] }),
]
const titles = (xs: { title: string }[]) => xs.map((x) => x.title)

test('search: title, artist, tags and source labels; case- and accent-insensitive', () => {
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'wing' })), ['Little Wing'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'CLAPTON' })), ['Wonderful Tonight'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'texas' })), ['Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'guitar tab' })), ['Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'asi es' })), ['Así Es la Vida'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'así' })), ['Así Es la Vida'])
})

test('search: every word must match, in any field, any order', () => {
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'vaughan pride' })), ['Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, query: 'vaughan wing' })), [])
  assert.equal(matchesQuery(library[0]!, '   '), true)
})

test('search: apostrophes and punctuation do not get in the way', () => {
  const s = song({ title: "Let's Stay Together", artist: 'Joesef' })
  assert.equal(matchesQuery(s, 'lets stay'), true)
  assert.equal(matchesQuery(s, "let's"), true)
  assert.equal(matchesQuery(s, 'together, joesef'), true)
})

test('status: none picked includes every status; picked statuses are OR', () => {
  assert.equal(filterSongs(library, NO_FILTERS).length, 6)
  assert.ok(filterSongs(library, NO_FILTERS).some((s) => s.status === 'polishing'))
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, statuses: ['learning'] })), ['Minor pentatonic: all 5 boxes', 'Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, statuses: ['polishing'] })), ['Wonderful Tonight'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, statuses: ['polishing', 'wishlist'] })), ['Landslide', 'Wonderful Tonight'])
})

test('tags: AND logic, case-insensitive', () => {
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, tags: ['blues'] })), ['Minor pentatonic: all 5 boxes', 'Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, tags: ['BLUES', 'shuffle'] })), ['Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, tags: ['blues', 'ukulele'] })), [])
})

test('more filters: site, key', () => {
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, sites: ['ultimateguitar'] })), ['Little Wing', 'Pride and Joy', 'Wonderful Tonight'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, sites: ['songsterr', 'youtube'] })), ['Landslide', 'Little Wing', 'Minor pentatonic: all 5 boxes', 'Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...NO_FILTERS, keyRoot: 'E' })), ['Little Wing', 'Pride and Joy'])
})

test('filters combine (AND across kinds)', () => {
  const f = { ...NO_FILTERS, statuses: ['learning' as const], sites: ['ultimateguitar' as const], query: 'joy', tags: ['shuffle'], keyRoot: 'E' }
  assert.deepEqual(titles(filterSongs(library, f)), ['Pride and Joy'])
  assert.deepEqual(titles(filterSongs(library, { ...f, keyRoot: 'C' })), [])
  assert.deepEqual(titles(filterSongs(library, { ...f, statuses: ['canplay' as const] })), [])
})

test('sort: longest untouched = never-opened first (oldest added first), then oldest opened', () => {
  assert.deepEqual(titles(sortSongs(library, 'untouched')), [
    'Wonderful Tonight', // never opened, added day 0
    'Landslide', // never opened, added day 1
    'Pride and Joy', // 70 days
    'Little Wing', // 40
    'Así Es la Vida', // 20
    'Minor pentatonic: all 5 boxes', // 10
  ])
})

test('sort: recently opened, recently added, A-Z', () => {
  assert.deepEqual(titles(sortSongs(library, 'opened')), ['Minor pentatonic: all 5 boxes', 'Así Es la Vida', 'Little Wing', 'Pride and Joy', 'Landslide', 'Wonderful Tonight'])
  assert.deepEqual(titles(sortSongs(library, 'added')), ['Así Es la Vida', 'Pride and Joy', 'Minor pentatonic: all 5 boxes', 'Little Wing', 'Landslide', 'Wonderful Tonight'])
  assert.deepEqual(titles(sortSongs(library, 'az')), ['Así Es la Vida', 'Landslide', 'Little Wing', 'Minor pentatonic: all 5 boxes', 'Pride and Joy', 'Wonderful Tonight'])
})

test('sort does not mutate its input', () => {
  const before = titles(library)
  sortSongs(library, 'az')
  assert.deepEqual(titles(library), before)
})

test('collectTags: de-duplicated case-insensitively, most used first', () => {
  assert.deepEqual(collectTags(library), ['Blues', 'scales', 'shuffle', 'Texas blues'])
})

test('search also matches link titles', () => {
  const withTitle = song({ title: 'Wonderful Tonight', artist: 'Eric Clapton', keyRoot: 'G', status: 'learning', created: 0, opened: null, sources: [{ site: 'youtube', label: null, title: 'Slow blues rhythm lesson' }] })
  assert.equal(matchesQuery(withTitle, 'rhythm lesson'), true)
  assert.equal(matchesQuery(withTitle, 'jazz'), false)
})

test('suggestTags: word-start matches first, then contains; skips tags already on the item', () => {
  const all = ['blues', 'Texas blues', 'scales', 'shuffle', 'bluegrass', 'Ukulele']
  assert.deepEqual(suggestTags(all, [], 'blu'), ['blues', 'Texas blues', 'bluegrass'])
  assert.deepEqual(suggestTags(all, ['Blues'], 'blu'), ['Texas blues', 'bluegrass'])
  assert.deepEqual(suggestTags(all, [], 'ale'), ['scales'])
  assert.deepEqual(suggestTags(all, [], 'UKU'), ['Ukulele'])
  assert.deepEqual(suggestTags(all, [], 's', 2), ['scales', 'shuffle'])
})

test('suggestTags: nothing typed offers every tag the item does not have, in order', () => {
  const all = ['blues', 'Texas blues', 'scales']
  assert.deepEqual(suggestTags(all, ['SCALES'], '  '), ['blues', 'Texas blues'])
  assert.deepEqual(suggestTags(all, [], '', 1), ['blues'])
})

test('activeFilterCount: each status, tag and site, plus the key; not the search text', () => {
  assert.equal(activeFilterCount(NO_FILTERS), 0)
  assert.equal(activeFilterCount({ ...NO_FILTERS, query: 'joy' }), 0)
  assert.equal(activeFilterCount({ ...NO_FILTERS, statuses: ['learning', 'polishing'], tags: ['blues'], sites: ['youtube', 'songsterr'], keyRoot: 'E' }), 6)
})

test('charts: the site filter picks songs with a chart; search matches chart titles', () => {
  const withChart = song({ title: 'Kiss of Life', artist: 'Sade', sources: [{ site: 'chart', label: null, title: 'My intro tab' }] })
  const lib = [...library, withChart]
  assert.deepEqual(titles(filterSongs(lib, { ...NO_FILTERS, sites: ['chart'] })), ['Kiss of Life'])
  assert.deepEqual(titles(filterSongs(lib, { ...NO_FILTERS, sites: ['chart', 'songsterr'] })), ['Pride and Joy', 'Kiss of Life'])
  assert.equal(matchesQuery(withChart, 'intro tab'), true)
})
