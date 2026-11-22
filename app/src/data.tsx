import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  Timestamp, collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { DEFAULT_SETTINGS, deriveFields, derivedFieldsStale, type Settings, type Song, type Source } from '@shared'
import { db } from './firebase'

export type SongDoc = Song<Timestamp> & { id: string }
export type SourceDoc = Source<Timestamp>

const SongsContext = createContext<SongDoc[] | null>(null)
const UidContext = createContext<string>('')
const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS)

/** Derived fields (SPEC §3) the app computes itself; callers never pass them. */
type Derived = 'sourceKeys' | 'matchKey'

export function DataProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [songs, setSongs] = useState<SongDoc[] | null>(null)
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users', uid, 'songs'),
        (snap) => {
          const list = snap.docs.map((d) => ({ ...(d.data() as Song<Timestamp>), id: d.id }))
          setSongs(list)
          repairDerived(uid, list)
        },
        (err) => console.error('songs listener', err),
      ),
    [uid],
  )
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => setSettings({ ...DEFAULT_SETTINGS, ...(snap.data()?.settings as Partial<Settings> | undefined) }),
        (err) => console.error('settings listener', err),
      ),
    [uid],
  )
  return (
    <UidContext.Provider value={uid}>
      <SettingsContext.Provider value={settings}>
        <SongsContext.Provider value={songs}>{children}</SongsContext.Provider>
      </SettingsContext.Provider>
    </UidContext.Provider>
  )
}

/** null until the first snapshot (from cache or server) has arrived. */
export const useSongs = () => useContext(SongsContext)
export const useUid = () => useContext(UidContext)
/** The user's settings, with defaults until (or unless) they have saved any. */
export const useSettings = () => useContext(SettingsContext)

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

export function createSong(uid: string, id: string, data: Omit<Song<Timestamp>, 'createdAt' | 'updatedAt' | 'lastOpenedAt' | 'openCount' | Derived>) {
  const now = Timestamp.now()
  void setDoc(doc(db, 'users', uid, 'songs', id), { ...data, ...deriveFields(data), createdAt: now, updatedAt: now, lastOpenedAt: null, openCount: 0 }).catch(fail('save the song'))
}

/** Applies a patch to a song and re-derives sourceKeys and matchKey from the result (SPEC §3). */
export function patchSong(uid: string, song: SongDoc, patch: Partial<Omit<Song<Timestamp>, Derived>>) {
  const next = { ...song, ...patch }
  void updateDoc(doc(db, 'users', uid, 'songs', song.id), { ...patch, ...deriveFields(next), updatedAt: Timestamp.now() }).catch(fail('save the song'))
}

/** Latest lastOpenedAt across sources, or null. */
export function latestOpened(sources: SourceDoc[]): Timestamp | null {
  let best: Timestamp | null = null
  for (const s of sources) if (s.lastOpenedAt && (!best || s.lastOpenedAt.toMillis() > best.toMillis())) best = s.lastOpenedAt
  return best
}

export function setSources(uid: string, song: SongDoc, sources: SourceDoc[], extra: Partial<Omit<Song<Timestamp>, Derived>> = {}) {
  patchSong(uid, song, { ...extra, sources, lastOpenedAt: latestOpened(sources) })
}

const repairing = new Set<string>()

/** On library load, fix any song whose derived fields are missing or stale. Doesn't touch updatedAt. */
function repairDerived(uid: string, songs: SongDoc[]) {
  for (const s of songs) if (!derivedFieldsStale(s)) repairing.delete(s.id) // fixed: allow repairing again if it goes stale later
  const stale = songs.filter((s) => derivedFieldsStale(s) && !repairing.has(s.id))
  for (let i = 0; i < stale.length; i += 450) {
    const batch = writeBatch(db)
    for (const s of stale.slice(i, i + 450)) {
      repairing.add(s.id)
      batch.update(doc(db, 'users', uid, 'songs', s.id), deriveFields(s))
    }
    void batch.commit().catch((err) => {
      stale.slice(i, i + 450).forEach((s) => repairing.delete(s.id))
      console.error('repair derived fields', err)
    })
  }
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
