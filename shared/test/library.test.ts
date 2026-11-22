import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSongByKey, findMatchingSong, mergeTags, sourceFromParsed, parseLink, relativeDays, calendarDaysBetween, isStale } from '../src/index.ts'

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
  const s = sourceFromParsed(parsed, { id: 'x', role: 'lesson', label: '  Intro  ', now: 'NOW' })
  assert.deepEqual(s, {
    id: 'x', site: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=90', canonicalKey: 'yt:dQw4w9WgXcQ',
    role: 'lesson', label: 'Intro', addedAt: 'NOW', lastOpenedAt: null, ytVideoId: 'dQw4w9WgXcQ', ytStartSec: 90,
  })
  assert.equal('ugType' in s, false)
  assert.equal(sourceFromParsed(parsed, { id: 'y', role: 'tab', label: '   ', now: 1 }).label, null)
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
