import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  Timestamp, collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import type { Song, Source } from '@shared'
import { db } from './firebase'

export type SongDoc = Song<Timestamp> & { id: string }
export type SourceDoc = Source<Timestamp>

const SongsContext = createContext<SongDoc[] | null>(null)
const UidContext = createContext<string>('')

export function DataProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [songs, setSongs] = useState<SongDoc[] | null>(null)
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users', uid, 'songs'),
        (snap) => setSongs(snap.docs.map((d) => ({ ...(d.data() as Song<Timestamp>), id: d.id }))),
        (err) => console.error('songs listener', err),
      ),
    [uid],
  )
  return (
    <UidContext.Provider value={uid}>
      <SongsContext.Provider value={songs}>{children}</SongsContext.Provider>
    </UidContext.Provider>
  )
}

/** null until the first snapshot (from cache or server) has arrived. */
export const useSongs = () => useContext(SongsContext)
export const useUid = () => useContext(UidContext)

export function newSongRef(uid: string) {
  return doc(collection(db, 'users', uid, 'songs'))
}

export const newSourceId = () => crypto.randomUUID()

const fail = (what: string) => (err: unknown) => {
  console.error(what, err)
  window.alert(`Couldn't ${what}: ${err instanceof Error ? err.message : String(err)}`)
}

// Writes are fired, not awaited: with the offline cache they resolve only once the server acknowledges,
// and the local listener updates immediately either way.

export function createSong(uid: string, id: string, data: Omit<Song<Timestamp>, 'createdAt' | 'updatedAt' | 'lastOpenedAt' | 'openCount'>) {
  const now = Timestamp.now()
  void setDoc(doc(db, 'users', uid, 'songs', id), { ...data, createdAt: now, updatedAt: now, lastOpenedAt: null, openCount: 0 }).catch(fail('save the song'))
}

export function patchSong(uid: string, id: string, patch: Partial<Song<Timestamp>>) {
  void updateDoc(doc(db, 'users', uid, 'songs', id), { ...patch, updatedAt: Timestamp.now() }).catch(fail('save the song'))
}

/** Latest lastOpenedAt across sources, or null. */
export function latestOpened(sources: SourceDoc[]): Timestamp | null {
  let best: Timestamp | null = null
  for (const s of sources) if (s.lastOpenedAt && (!best || s.lastOpenedAt.toMillis() > best.toMillis())) best = s.lastOpenedAt
  return best
}

export function setSources(uid: string, song: SongDoc, sources: SourceDoc[], extra: Partial<Song<Timestamp>> = {}) {
  patchSong(uid, song.id, { ...extra, sources, lastOpenedAt: latestOpened(sources) })
}

/** Deletes the song and its events. Events are found by songId (single-field query, no index needed). */
export async function deleteSong(uid: string, id: string) {
  const events = await getDocs(query(collection(db, 'users', uid, 'events'), where('songId', '==', id)))
  const refs = [doc(db, 'users', uid, 'songs', id), ...events.docs.map((d) => d.ref)]
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((r) => batch.delete(r))
    void batch.commit().catch(fail('delete the song'))
  }
}
