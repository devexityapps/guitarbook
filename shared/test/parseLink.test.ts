import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLink, parseTimeParam, normalizeForMatch } from '../src/index.ts'
import type { ParsedLink } from '../src/index.ts'

type Expected = Partial<ParsedLink>

interface Case {
  name: string
  url: string
  hint?: string
  expect: Expected
}

function run(cases: Case[]) {
  for (const c of cases) {
    test(c.name, () => {
      const got = parseLink(c.url, c.hint)
      assert.ok(got, 'expected a parse result')
      const picked: Record<string, unknown> = {}
      for (const key of Object.keys(c.expect)) picked[key] = (got as unknown as Record<string, unknown>)[key]
      assert.deepEqual(picked, c.expect)
    })
  }
}

// ---------------------------------------------------------------------------
// Real bookmarks: the "Guitar" folder of the user's Chrome export (bookmarks_11_22_26.html).
// ---------------------------------------------------------------------------

run([
  // --- YouTube ---
  {
    name: 'yt: Artist - Song (Official Visualiser) -> performance, parenthetical stripped',
    url: 'https://www.youtube.com/watch?v=oTp9MZa2RVY',
    hint: "Joesef - Let's Stay Together (Official Visualiser) - YouTube",
    expect: { site: 'youtube', canonicalKey: 'yt:oTp9MZa2RVY', artistGuess: 'Joesef', titleGuess: "Let's Stay Together", confidence: 'high' },
  },
  {
    name: 'yt: Artist - Song (Video Oficial) -> performance',
    url: 'https://www.youtube.com/watch?v=Y0U12sjwseU',
    hint: 'Vicente Fernández - Para Siempre (Video Oficial) - YouTube',
    expect: { artistGuess: 'Vicente Fernández', titleGuess: 'Para Siempre', confidence: 'high' },
  },
  {
    name: 'yt: Artist - Song (Official Music Video) -> performance',
    url: 'https://www.youtube.com/watch?v=vEtbfzMLVWU',
    hint: 'Stray Cats - Stray Cat Strut (Official Music Video) - YouTube',
    expect: { artistGuess: 'Stray Cats', titleGuess: 'Stray Cat Strut', confidence: 'high' },
  },
  {
    name: 'yt: notification count prefix is dropped',
    url: 'https://www.youtube.com/watch?v=aFwZDNsG-Os',
    hint: '(4) Kings Of Convenience - Me in You - YouTube',
    expect: { artistGuess: 'Kings Of Convenience', titleGuess: 'Me in You', confidence: 'high' },
  },
  {
    name: 'yt: accents are kept',
    url: 'https://www.youtube.com/watch?v=a1Q6Zg8LPM4',
    hint: 'Pedro Infante - Las mañanitas - YouTube',
    expect: { artistGuess: 'Pedro Infante', titleGuess: 'Las mañanitas', confidence: 'high' },
  },
  {
    name: 'yt: split on the FIRST " - " only',
    url: 'https://www.youtube.com/watch?v=U2RhYy1va1M',
    hint: 'Radiohead - Black Star (Acoustic) - Restaurang Två Plan, Stockholm - YouTube',
    expect: { artistGuess: 'Radiohead', titleGuess: 'Black Star (Acoustic) - Restaurang Två Plan, Stockholm', confidence: 'high' },
  },
  {
    name: 'yt: "Artist - Song Unplugged"',
    url: 'https://www.youtube.com/watch?v=7M7zBMKfOyA',
    hint: 'Radiohead - Black Star Unplugged - YouTube',
    expect: { artistGuess: 'Radiohead', titleGuess: 'Black Star Unplugged', confidence: 'high' },
  },
  {
    // KNOWN LIMITATION: the spec's "Artist - Song" split gets this one backwards, and it is marked high confidence.
    name: 'yt: hashtags dropped (and "Song - Artist" order is mis-split, known limitation)',
    url: 'https://www.youtube.com/shorts/NuDgowdDGSU',
    hint: 'What You Won’t Do For Love - Bobby Caldwell #rnbmusic #guitarchords #guitarlesson - YouTube',
    expect: { canonicalKey: 'yt:NuDgowdDGSU', artistGuess: 'What You Won’t Do For Love', titleGuess: 'Bobby Caldwell', confidence: 'high' },
  },
  {
    name: 'yt: no dash -> title only, low confidence',
    url: 'https://www.youtube.com/watch?v=5jg-T4ZycH8',
    hint: 'PARA SIEMPRE - YouTube',
    expect: { titleGuess: 'PARA SIEMPRE', artistGuess: null, confidence: 'low' },
  },
  {
    name: 'yt: "Title | extra" is not split -> low',
    url: 'https://www.youtube.com/watch?v=2nkAJogQioc',
    hint: 'Never Going Back Again | Lindsey Buckingham with David Belasco at USC - YouTube',
    expect: { titleGuess: 'Never Going Back Again | Lindsey Buckingham with David Belasco at USC', artistGuess: null, confidence: 'low' },
  },
  {
    name: 'yt: shorts URL, parenthetical that is not noise is kept -> low',
    url: 'https://www.youtube.com/shorts/1zGKQyhw3D0',
    hint: 'Just the Two of Us ( Guitar Chords ) - YouTube',
    expect: { canonicalKey: 'yt:1zGKQyhw3D0', titleGuess: 'Just the Two of Us ( Guitar Chords )', confidence: 'low' },
  },
  {
    name: 'yt: "tutorial" -> lesson, goes to Check names',
    url: 'https://www.youtube.com/watch?v=vXLE-h3N9tA',
    hint: 'PARA SIEMPRE vicente fernandez en Guitarra TUTORIAL (1/2) - YouTube',
    expect: { artistGuess: null, confidence: 'low' },
  },
  {
    name: 'yt: "cover" -> order unreliable, goes to Check names ("Song - Artist")',
    url: 'https://www.youtube.com/watch?v=QH-3tWYxE9o',
    hint: 'Black Star - Radiohead (cover) - YouTube',
    expect: { artistGuess: null, titleGuess: 'Black Star - Radiohead (cover)', confidence: 'low' },
  },
  {
    name: 'yt: "cover" -> Check names ("Song - Artist Guitarra Cover")',
    url: 'https://www.youtube.com/watch?v=mejdLm8rWMM',
    hint: 'Para Siempre - Vicente Fernandez Guitarra Cover - YouTube',
    expect: { artistGuess: null, confidence: 'low' },
  },
  {
    name: 'yt: "cover" -> Check names (no dash at all)',
    url: 'https://www.youtube.com/watch?v=9nzT8ImhC0Q',
    hint: 'Stray Cat Strut : Stray Cats : Acoustic cover - YouTube',
    expect: { artistGuess: null, confidence: 'low' },
  },
  {
    name: 'yt: "cover" -> Check names (quotes and "ft.")',
    url: 'https://www.youtube.com/watch?v=OVqrvim0MLs',
    hint: "'DREAMS' - FLEETWOOD MAC COVER ft. Megan Sayer - YouTube",
    expect: { artistGuess: null, confidence: 'low' },
  },
  {
    name: 'yt: "(acoustic cover)" -> Check names',
    url: 'https://www.youtube.com/watch?v=sxd_KtgTBK4',
    hint: 'Do It Again - Steely Dan (acoustic cover) - YouTube',
    expect: { artistGuess: null, confidence: 'low' },
  },

  // --- Ultimate Guitar ---
  {
    name: 'ug: chords, ALL CAPS title is title-cased',
    url: 'https://tabs.ultimate-guitar.com/tab/joesef/lets-stay-together-chords-4924723',
    hint: 'LETS STAY TOGETHER CHORDS by Joesef @ Ultimate-Guitar.Com',
    expect: { site: 'ultimateguitar', canonicalKey: 'ug:4924723', ugTabId: '4924723', ugType: 'chords', titleGuess: 'Lets Stay Together', artistGuess: 'Joesef', confidence: 'high', suggestedTags: [] },
  },
  {
    name: 'ug: "(1) " prefix, "LA CHONA CHORDS by Mixed Case Artist"',
    url: 'https://tabs.ultimate-guitar.com/tab/los-tucanes-de-tijuana/la-chona-chords-980031',
    hint: '(1) LA CHONA CHORDS by Los Tucanes de Tijuana @ Ultimate-Guitar.Com',
    expect: { canonicalKey: 'ug:980031', titleGuess: 'La Chona', artistGuess: 'Los Tucanes de Tijuana', confidence: 'high' },
  },
  {
    name: 'ug: es. host, Spanish title with (ver 2) and "por"',
    url: 'https://es.ultimate-guitar.com/tab/elefante/asi-es-la-vida-chords-3410642',
    hint: '(1) ASI ES LA VIDA ACORDES (ver 2) por Elefante @ Ultimate-Guitar.Com',
    expect: { canonicalKey: 'ug:3410642', ugType: 'chords', titleGuess: 'Asi Es la Vida', artistGuess: 'Elefante', confidence: 'high' },
  },
  {
    name: 'ug: es. host /tab/<id> with no slugs: type and names come from the title',
    url: 'https://es.ultimate-guitar.com/tab/1546820',
    hint: '(1) DE LA NOCHE A LA MAÑANA ACORDES por Elefante @ Ultimate-Guitar.Com',
    expect: { canonicalKey: 'ug:1546820', ugType: 'chords', titleGuess: 'De la Noche a la Mañana', artistGuess: 'Elefante', confidence: 'high' },
  },
  {
    name: 'ug: es. host /tab/<id> with no hint -> low, no names',
    url: 'https://es.ultimate-guitar.com/tab/1546820',
    expect: { canonicalKey: 'ug:1546820', titleGuess: null, artistGuess: null, confidence: 'low' },
  },
  {
    name: 'ug: underscore slugs and "tabs" type',
    url: 'https://tabs.ultimate-guitar.com/tab/kings_of_convenience/me_in_you_tabs_1417679',
    hint: 'ME IN YOU TAB (ver 2) by Kings of Convenience @ Ultimate-Guitar.Com',
    expect: { canonicalKey: 'ug:1417679', ugType: 'tabs', titleGuess: 'Me in You', artistGuess: 'Kings of Convenience', confidence: 'high' },
  },
  {
    name: 'ug: no hint -> names from the slugs',
    url: 'https://tabs.ultimate-guitar.com/tab/pretenders/back-on-the-chain-gang-chords-79556',
    expect: { canonicalKey: 'ug:79556', titleGuess: 'Back on the Chain Gang', artistGuess: 'Pretenders', confidence: 'high' },
  },
  {
    // From the same export, outside the Guitar folder; the folder has no ukulele links.
    name: 'ug: ukulele -> the suggested tag "ukulele"',
    url: 'https://tabs.ultimate-guitar.com/tab/arthur-godfrey/my-little-grass-shack-ukulele-1371624',
    hint: 'MY LITTLE GRASS SHACK UKULELE CHORDS by Arthur Godfrey @ Ultimate-Guitar.Com',
    expect: { canonicalKey: 'ug:1371624', ugType: 'ukulele', suggestedTags: ['ukulele'], titleGuess: 'My Little Grass Shack', artistGuess: 'Arthur Godfrey' },
  },

  // --- Songsterr ---
  {
    name: 'ss: plain "Tab by"',
    url: 'https://www.songsterr.com/a/wsa/lindsey-buckingham-never-going-back-again-tab-s72781',
    hint: 'Never Going Back Again Tab by Lindsey Buckingham | Songsterr Tabs with Rhythm',
    expect: { site: 'songsterr', canonicalKey: 'ss:72781', ssSongId: '72781', titleGuess: 'Never Going Back Again', artistGuess: 'Lindsey Buckingham', confidence: 'high' },
  },
  {
    name: 'ss: "Solo Tab"',
    url: 'https://www.songsterr.com/a/wsa/radiohead-black-star-tab-s51258',
    hint: 'Black Star Solo Tab by Radiohead | Songsterr Tabs with Rhythm',
    expect: { canonicalKey: 'ss:51258', titleGuess: 'Black Star', artistGuess: 'Radiohead', confidence: 'high' },
  },
  {
    name: 'ss: short id',
    url: 'https://www.songsterr.com/a/wsa/beatles-blackbird-tab-s57',
    hint: 'Blackbird Tab by The Beatles | Songsterr Tabs with Rhythm',
    expect: { canonicalKey: 'ss:57', titleGuess: 'Blackbird', artistGuess: 'The Beatles', confidence: 'high' },
  },
  {
    name: 'ss: apostrophe in title',
    url: 'https://www.songsterr.com/a/wsa/doobie-brothers-long-train-runnin-tab-s22496',
    hint: "Long Train Runnin' Tab by The Doobie Brothers | Songsterr Tabs with Rhythm",
    expect: { canonicalKey: 'ss:22496', titleGuess: "Long Train Runnin'", artistGuess: 'The Doobie Brothers', confidence: 'high' },
  },
  {
    name: 'ss: accented title and artist',
    url: 'https://www.songsterr.com/a/wsa/elefante-asi-es-la-vida-tab-s33871',
    hint: 'Así Es la Vida Tab by Elefante | Songsterr Tabs with Rhythm',
    expect: { canonicalKey: 'ss:33871', titleGuess: 'Así Es la Vida', artistGuess: 'Elefante', confidence: 'high' },
  },
  {
    name: 'ss: track suffix t1 on the URL is ignored; track name after the artist is dropped',
    url: 'https://www.songsterr.com/a/wsa/aretha-franklin-respect-tab-s25745t1',
    hint: 'Respect Tab by Aretha Franklin - Electric Guitar (clean) (regenerated) - Electric Guitar (clean) | Songsterr Tabs with Rhythm',
    expect: { canonicalKey: 'ss:25745', ssSongId: '25745', titleGuess: 'Respect', artistGuess: 'Aretha Franklin', confidence: 'high' },
  },
  {
    name: 'ss: track suffix t0 and a track list after the artist',
    url: 'https://www.songsterr.com/a/wsa/kings-of-convenience-me-in-you-tab-s413698t0',
    hint: 'Me In You Tab by Kings Of Convenience - Rhythm Guitar (Eirik) - Acoustic Guitar (nylon) | Songsterr Tabs with Rhythm',
    expect: { canonicalKey: 'ss:413698', titleGuess: 'Me In You', artistGuess: 'Kings Of Convenience', confidence: 'high' },
  },
  {
    name: 'ss: no hint -> whole slug as the title, low confidence',
    url: 'https://www.songsterr.com/a/wsa/beatles-blackbird-tab-s57',
    expect: { canonicalKey: 'ss:57', titleGuess: 'Beatles Blackbird', artistGuess: null, confidence: 'low' },
  },
  {
    name: 'ss: hint that does not match the pattern -> slug, low',
    url: 'https://www.songsterr.com/a/wsa/beatles-blackbird-tab-s57',
    hint: 'Songsterr',
    expect: { titleGuess: 'Beatles Blackbird', artistGuess: null, confidence: 'low' },
  },

  // --- Other sites in the Guitar folder ---
  {
    name: 'other: chordie',
    url: 'https://www.chordie.com/chord.pere/www.azchords.com/s/sade-tabs-7932/noordinarylove3-tabs-881656.html',
    hint: 'No Ordinary Love Sade Chords and Lyrics for Guitar',
    expect: { site: 'other', canonicalKey: 'url:https://www.chordie.com/chord.pere/www.azchords.com/s/sade-tabs-7932/noordinarylove3-tabs-881656.html', confidence: 'low' },
  },
  {
    name: 'other: fragment is dropped from the key',
    url: 'https://docs.google.com/spreadsheets/d/1_SMZ7OdMlk9l1epydgDZFQSvBWDc80rINLE8lH28Arw/edit?gid=0#gid=0',
    hint: 'Music - Google Sheets',
    expect: { site: 'other', canonicalKey: 'url:https://docs.google.com/spreadsheets/d/1_SMZ7OdMlk9l1epydgDZFQSvBWDc80rINLE8lH28Arw/edit?gid=0' },
  },
  {
    name: 'other: facebook video (query kept: it identifies the page)',
    url: 'https://www.facebook.com/watch/?v=341300952229811',
    hint: '(20+) Video | Facebook',
    expect: { site: 'other', canonicalKey: 'url:https://www.facebook.com/watch/?v=341300952229811', titleGuess: 'Video | Facebook' },
  },
])

test('file:// bookmarks (local files in the Guitar folder) are not links', () => {
  assert.equal(parseLink('file:///Users/someone/Desktop/Dreams.txt', 'Dreams.txt'), null)
})

// ---------------------------------------------------------------------------
// Synthetic cases: formats the Guitar folder does not contain (SPEC §5).
// ---------------------------------------------------------------------------

run([
  { name: 'syn yt: youtu.be with si= and t=1m30s', url: 'https://youtu.be/dQw4w9WgXcQ?si=abc123&t=1m30s', expect: { site: 'youtube', canonicalKey: 'yt:dQw4w9WgXcQ', ytVideoId: 'dQw4w9WgXcQ', ytStartSec: 90, url: 'https://youtu.be/dQw4w9WgXcQ?t=1m30s' } },
  { name: 'syn yt: t=27420s', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=27420s', expect: { ytStartSec: 27420 } },
  { name: 'syn yt: start=90', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=90', expect: { ytStartSec: 90 } },
  { name: 'syn yt: m. host, utm/feature/fbclid/gclid stripped', url: 'http://m.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x&feature=share&fbclid=1&gclid=2', expect: { canonicalKey: 'yt:dQw4w9WgXcQ', url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ' } },
  { name: 'syn yt: music. host', url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', expect: { canonicalKey: 'yt:dQw4w9WgXcQ' } },
  { name: 'syn yt: /embed/', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expect: { canonicalKey: 'yt:dQw4w9WgXcQ' } },
  { name: 'syn yt: /live/', url: 'https://www.youtube.com/live/dQw4w9WgXcQ', expect: { canonicalKey: 'yt:dQw4w9WgXcQ' } },
  { name: 'syn yt: video inside a playlist keeps both', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&index=4', expect: { canonicalKey: 'yt:dQw4w9WgXcQ', ytPlaylistId: 'PLabc123' } },
  { name: 'syn yt: playlist with no video', url: 'https://www.youtube.com/playlist?list=PLabc123', expect: { site: 'youtube', canonicalKey: 'ytpl:PLabc123', ytPlaylistId: 'PLabc123' } },
  { name: 'syn yt: "Alive" is not "live"', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hint: 'Pearl Jam - Alive - YouTube', expect: { artistGuess: 'Pearl Jam', titleGuess: 'Alive' } },
  { name: 'syn yt: youtube search page is not a source', url: 'https://www.youtube.com/results?search_query=blues+licks', expect: { site: 'other' } },
  { name: 'syn yt: a cover lesson stays a lesson', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hint: 'Blackbird cover guitar lesson - YouTube', expect: { artistGuess: null } },
  { name: 'syn yt: "how to play" -> no artist guess', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hint: 'How To Play Blackbird - YouTube', expect: { confidence: 'low' } },
  { name: 'syn: pasted without a scheme', url: 'www.youtube.com/watch?v=dQw4w9WgXcQ', expect: { canonicalKey: 'yt:dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
  { name: 'syn ug: same tab on two hosts has the same key', url: 'https://www.ultimate-guitar.com/tab/pretenders/back-on-the-chain-gang-chords-79556', expect: { canonicalKey: 'ug:79556' } },
  { name: 'syn ug: unknown type keeps the raw type', url: 'https://tabs.ultimate-guitar.com/tab/band/some-song-power-123456', expect: { ugType: 'power', canonicalKey: 'ug:123456' } },
  { name: 'syn ug: a page that is not a tab is "other"', url: 'https://www.ultimate-guitar.com/news/general/some-article.html', expect: { site: 'other' } },
  { name: 'syn ss: bass tab', url: 'https://www.songsterr.com/a/wsa/some-band-some-song-bass-tab-s999', hint: 'Some Song Bass Tab by Some Band | Songsterr Tabs with Rhythm', expect: { canonicalKey: 'ss:999', titleGuess: 'Some Song', artistGuess: 'Some Band' } },
  { name: 'syn other: trailing slash is normalized in the key', url: 'https://example.com/a/b/', expect: { canonicalKey: 'url:https://example.com/a/b' } },
])

test('syn: non-URLs return null', () => {
  for (const bad of ['', '   ', 'hello world', 'ftp://example.com/x', 'not a url', 'localhost']) {
    assert.equal(parseLink(bad), null, JSON.stringify(bad))
  }
})

test('parseTimeParam', () => {
  assert.equal(parseTimeParam('90'), 90)
  assert.equal(parseTimeParam('90s'), 90)
  assert.equal(parseTimeParam('1m30s'), 90)
  assert.equal(parseTimeParam('1h2m3s'), 3723)
  assert.equal(parseTimeParam('2m'), 120)
  assert.equal(parseTimeParam('abc'), undefined)
  assert.equal(parseTimeParam(''), undefined)
  assert.equal(parseTimeParam(null), undefined)
})

test('normalizeForMatch: how the Guitar-folder UG and Songsterr names line up', () => {
  assert.equal(normalizeForMatch('The Beatles'), normalizeForMatch('Beatles'))
  assert.equal(normalizeForMatch('Así Es la Vida'), normalizeForMatch('Asi Es La Vida'))
  assert.equal(normalizeForMatch("Long Train Runnin'"), normalizeForMatch('Long Train Runnin'))
  assert.equal(normalizeForMatch('The Pretenders'), normalizeForMatch('Pretenders'))
  assert.notEqual(normalizeForMatch('Black Star'), normalizeForMatch('Black Star Unplugged'))
})
