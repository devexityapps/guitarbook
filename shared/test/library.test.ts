import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSongByKey, findMatchingSong, deriveFields, derivedFieldsStale, mergeTags, sourceFromParsed, chartSource, isChart, chartTitle, parseLink, relativeDays, calendarDaysBetween, isStale } from '../src/index.ts'

const songs = [
  { id: 'a', title: 'Pride and Joy', artist: 'Stevie Ray Vaughan', sources: [{ canonicalKey: 'ug:123' }] },
  { id: 'b', title: 'Blackbird', artist: 'The Beatles', sources: [{ canonicalKey: 'ss:57' }] },
  { id: 'c', title: 'Nashville numbers, explained', artist: null, sources: [{ canonicalKey: 'yt:abcdefghijk' }] },
]

test('findSongByKey', () => {
  assert.equal(findSongByKey(songs, 'ug:123')?.id, 'a')
  assert.equal(findSongByKey(songs, 'ug:999'), undefined)
})

test('findMatchingSong: normalized title + artist, ignoring "The", case, punctuation, accents', () => {
  assert.equal(findMatchingSong(songs, 'PRIDE AND JOY!', 'stevie ray vaughan')?.id, 'a')
  assert.equal(findMatchingSong(songs, 'Blackbird', 'Beatles')?.id, 'b')
  assert.equal(findMatchingSong(songs, 'Blackbird', 'Someone Else'), undefined)
})

test('findMatchingSong: needs both title and artist', () => {
  assert.equal(findMatchingSong(songs, 'Nashville numbers, explained', null), undefined)
  assert.equal(findMatchingSong(songs, null, 'The Beatles'), undefined)
})

test('mergeTags: case-insensitive de-dup, keeps first casing', () => {
  assert.deepEqual(mergeTags(['Texas blues', 'solo'], ['SOLO', 'ukulele', ' ', 'texas BLUES']), ['Texas blues', 'solo', 'ukulele'])
})

test('sourceFromParsed: copies only the fields that exist, trims the label', () => {
  const parsed = parseLink('https://youtu.be/dQw4w9WgXcQ?t=90')!
  const s = sourceFromParsed(parsed, { id: 'x', label: '  Intro  ', now: 'NOW' })
  assert.deepEqual(s, {
    id: 'x', site: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=90', canonicalKey: 'yt:dQw4w9WgXcQ',
    label: 'Intro', addedAt: 'NOW', lastOpenedAt: null, ytVideoId: 'dQw4w9WgXcQ', ytStartSec: 90,
  })
  assert.equal('ugType' in s, false)
  assert.equal(sourceFromParsed(parsed, { id: 'y', label: '   ', now: 1 }).label, null)
})

test('relativeDays: calendar days, not 24-hour blocks', () => {
  const now = new Date(2026, 10, 22, 0, 30) // 12:30am
  assert.equal(relativeDays(new Date(2026, 10, 22, 0, 5), now), 'Today')
  assert.equal(relativeDays(new Date(2026, 10, 21, 23, 55), now), '1 day') // 35 minutes earlier, previous calendar day
  assert.equal(relativeDays(new Date(2026, 10, 12, 12), now), '10 days')
  assert.equal(relativeDays(new Date(2025, 10, 22, 12), now), '365 days')
  assert.equal(relativeDays(new Date(2025, 10, 21, 12), now), 'Over a year')
})

test('calendarDaysBetween across a DST change counts whole days', () => {
  assert.equal(calendarDaysBetween(new Date(2026, 2, 7, 23, 0), new Date(2026, 2, 9, 1, 0)), 2)
})

test('isStale: never opened, or older than staleDays', () => {
  const now = new Date(2026, 10, 22, 12)
  assert.equal(isStale(null, now, 30), true)
  assert.equal(isStale(new Date(2026, 9, 23, 12), now, 30), false) // 30 days: not more than 30
  assert.equal(isStale(new Date(2026, 9, 22, 12), now, 30), true) // 31 days
})

test('deriveFields: sourceKeys in order, matchKey is normalized title|artist', () => {
  const d = deriveFields({ title: 'Pride & Joy!', artist: 'The Stevie Ray Vaughan', sources: [{ canonicalKey: 'ug:1' }, { canonicalKey: 'yt:abcdefghijk' }] })
  assert.deepEqual(d.sourceKeys, ['ug:1', 'yt:abcdefghijk'])
  assert.equal(d.matchKey, 'pride joy|stevie ray vaughan')
  assert.equal(deriveFields({ title: 'Blackbird', artist: 'The Beatles', sources: [] }).matchKey, deriveFields({ title: 'blackbird', artist: 'Beatles', sources: [] }).matchKey)
})

test('deriveFields: no artist gives "title|"; empty title gives null', () => {
  assert.equal(deriveFields({ title: 'Nashville numbers', artist: null, sources: [] }).matchKey, 'nashville numbers|')
  assert.equal(deriveFields({ title: '  ', artist: 'X', sources: [] }).matchKey, null)
  assert.equal(deriveFields({ title: '!!!', artist: 'X', sources: [] }).matchKey, null)
})

test('derivedFieldsStale', () => {
  const base = { title: 'Blackbird', artist: 'The Beatles', sources: [{ canonicalKey: 'ss:57' }] }
  const good = { ...base, ...deriveFields(base) }
  assert.equal(derivedFieldsStale(good), false)
  assert.equal(derivedFieldsStale(base), true)
  assert.equal(derivedFieldsStale({ ...good, title: 'Blackbird 2' }), true)
  assert.equal(derivedFieldsStale({ ...good, sources: [] }), true)
  assert.equal(derivedFieldsStale({ ...good, matchKey: null }), true)
})

test('sourceFromParsed: link title is kept separately, trimmed, and left out when empty', () => {
  const parsed = parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!
  const withTitle = sourceFromParsed(parsed, { id: 's1', label: null, title: '  Blues Soloing - Lesson 1  ', now: 1 })
  assert.equal(withTitle.title, 'Blues Soloing - Lesson 1')
  const without = sourceFromParsed(parsed, { id: 's2', label: null, title: '   ', now: 1 })
  assert.equal('title' in without, false)
  assert.equal('title' in sourceFromParsed(parsed, { id: 's3', label: null, now: 1 }), false)
})

test('chartSource: a chart resource with no URL, keyed chart:<id>, text kept exactly', () => {
  const text = 'Am7        D9\n  e|---0---|\n  B|---1---|\n'
  const c = chartSource({ id: 'c1', title: '  Intro tab  ', text, now: 5 })
  assert.deepEqual(c, { id: 'c1', site: 'chart', url: '', canonicalKey: 'chart:c1', label: null, title: 'Intro tab', text, addedAt: 5, lastOpenedAt: null })
  assert.equal(isChart(c), true)
  assert.equal(isChart({ site: 'youtube' }), false)
  assert.deepEqual(deriveFields({ title: 'Kiss of Life', artist: 'Sade', sources: [c] }).sourceKeys, ['chart:c1'])
})

test('chart title is optional: empty becomes null, and the song title + artist stand in for it', () => {
  const untitled = chartSource({ id: 'c2', title: '   ', text: 'Am', now: 1 })
  assert.equal(untitled.title, null)
  assert.equal(chartTitle(untitled, { title: 'Kiss of Life', artist: 'Sade' }), 'Kiss of Life · Sade')
  assert.equal(chartTitle(untitled, { title: 'Scale drills', artist: null }), 'Scale drills')
  assert.equal(chartTitle({ title: 'Intro tab' }, { title: 'Kiss of Life', artist: 'Sade' }), 'Intro tab')
})
