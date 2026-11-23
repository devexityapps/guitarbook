import {
  Timestamp, collection, doc, getCountFromServer, getDocsFromServer, increment, limit, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { deriveFields, type Song } from '@shared'
import { db } from './firebase'

export type SongDoc = Song<Timestamp> & { id: string }
export type SourceDoc = Song<Timestamp>['sources'][number]

const songsOf = (uid: string) => collection(db, 'users', uid, 'songs')
const asSong = (d: { id: string; data(): unknown }): SongDoc => ({ ...(d.data() as Song<Timestamp>), id: d.id })

/** Reads straight from the server: a cache-only miss would wrongly say "not saved". Rejects when offline. */
export async function findSongBySourceKey(uid: string, canonicalKey: string): Promise<SongDoc | null> {
  const snap = await getDocsFromServer(query(songsOf(uid), where('sourceKeys', 'array-contains', canonicalKey), limit(1)))
  return snap.docs[0] ? asSong(snap.docs[0]) : null
}

export async function libraryIsEmpty(uid: string): Promise<boolean> {
  return (await getDocsFromServer(query(songsOf(uid), limit(1)))).empty
}

/** How many times this link has been opened (events are logged per source). */
export async function countOpens(uid: string, sourceId: string): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'users', uid, 'events'), where('sourceId', '==', sourceId)))
  return snap.data().count
}

export type SongPatch = Partial<Pick<Song<Timestamp>, 'title' | 'artist' | 'keyRoot' | 'keyMode' | 'tags' | 'status' | 'sources' | 'lastOpenedAt'>>

const OFFLINE = "Can't reach Guitarbook right now."

/** Fail instead of hanging when the server can't be reached (the write itself stays queued in the cache). */
const withTimeout = <T,>(p: Promise<T>, ms = 10_000) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(OFFLINE)), ms))])

/**
 * Writes only the fields in `patch` (so notes and link labels are never overwritten), re-derives
 * sourceKeys and matchKey (SPEC §3), and leaves everything else alone. Returns the song as it now is.
 */
export async function patchSong(uid: string, song: SongDoc, patch: SongPatch): Promise<SongDoc> {
  const next = { ...song, ...patch }
  await withTimeout(updateDoc(doc(db, 'users', uid, 'songs', song.id), { ...patch, ...deriveFields(next), updatedAt: Timestamp.now() }))
  return next
}

/** Starts the write without waiting for it: used when the popup is closing. */
export function patchSongNow(uid: string, song: SongDoc, patch: SongPatch) {
  const next = { ...song, ...patch }
  void updateDoc(doc(db, 'users', uid, 'songs', song.id), { ...patch, ...deriveFields(next), updatedAt: Timestamp.now() }).catch(() => {})
}

export function latestOpened(sources: SourceDoc[]): Timestamp | null {
  let best: Timestamp | null = null
  for (const s of sources) if (s.lastOpenedAt && (!best || s.lastOpenedAt.toMillis() > best.toMillis())) best = s.lastOpenedAt
  return best
}

/** Same as the app (SPEC §6): an events doc, the source's lastOpenedAt, the song's lastOpenedAt and openCount; updatedAt unchanged. */
export function recordOpen(uid: string, song: SongDoc, sourceId: string): SongDoc {
  const now = Timestamp.now()
  const sources = song.sources.map((s) => (s.id === sourceId ? { ...s, lastOpenedAt: now } : s))
  const batch = writeBatch(db)
  batch.set(doc(collection(db, 'users', uid, 'events')), { songId: song.id, sourceId, action: 'open', at: now })
  batch.update(doc(db, 'users', uid, 'songs', song.id), { sources, lastOpenedAt: now, openCount: increment(1) })
  void batch.commit().catch((err) => console.error('record open', err))
  return { ...song, sources, lastOpenedAt: now, openCount: song.openCount + 1 }
}

/** Removes a link. The caller has already confirmed. */
export function removeSource(uid: string, song: SongDoc, sourceId: string): Promise<SongDoc> {
  const sources = song.sources.filter((s) => s.id !== sourceId)
  return patchSong(uid, song, { sources, lastOpenedAt: latestOpened(sources) })
}

/** Deletes the song and its events (events are found by songId; a single-field query needs no index). */
export async function deleteSong(uid: string, id: string) {
  const events = await withTimeout(getDocsFromServer(query(collection(db, 'users', uid, 'events'), where('songId', '==', id))))
  const refs = [doc(db, 'users', uid, 'songs', id), ...events.docs.map((d) => d.ref)]
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((r) => batch.delete(r))
    await withTimeout(batch.commit())
  }
}

/** A song with this normalized title and artist (matchKey, SPEC §3), if any. */
export async function findSongByMatchKey(uid: string, matchKey: string): Promise<SongDoc | null> {
  const snap = await getDocsFromServer(query(songsOf(uid), where('matchKey', '==', matchKey), limit(1)))
  return snap.docs[0] ? asSong(snap.docs[0]) : null
}

export type NewSongFields = Pick<Song<Timestamp>, 'title' | 'artist' | 'keyRoot' | 'keyMode' | 'tags' | 'status'>

/**
 * Creates a song with one source (SPEC §6.4). The caller picks the id, so retrying after a failure rewrites the
 * same document instead of creating a second song. Notes start empty and the link's label is null: both
 * are edited in the app. Returns the song as stored.
 */
export async function createSong(uid: string, id: string, fields: NewSongFields, source: SourceDoc): Promise<SongDoc> {
  const ref = doc(db, 'users', uid, 'songs', id)
  const now = Timestamp.now()
  const data: Song<Timestamp> = {
    ...fields,
    notes: '',
    sources: [source],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: null,
    openCount: 0,
    ...deriveFields({ title: fields.title, artist: fields.artist, sources: [source] }),
  }
  await withTimeout(setDoc(ref, data))
  return { ...data, id: ref.id }
}
