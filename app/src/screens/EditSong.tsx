import { useState } from 'react'
import { deleteSong, patchSong, useSongs, useUid, type SongDoc } from '../data'
import { Header, SongFields, songFieldsFrom, type SongFormValues } from '../ui'
import { goBack, navigate } from '../router'

export function EditSong({ id }: { id: string }) {
  const songs = useSongs()
  const song = songs?.find((s) => s.id === id)
  if (songs === null) return <main className="screen"><p className="muted pad">Loading…</p></main>
  if (!song) return <main className="screen"><Header left={<a className="link-btn" href="#/">Library</a>} /><p className="muted pad">Song not found.</p></main>
  return <Editor key={song.id} song={song} />
}

function Editor({ song }: { song: SongDoc }) {
  const uid = useUid()
  const [form, setForm] = useState<SongFormValues>({
    type: song.type,
    title: song.title,
    artist: song.artist ?? '',
    keyRoot: song.keyRoot ?? '',
    keyMode: song.keyMode ?? 'major',
    status: song.status,
    tags: song.tags,
    notes: song.notes,
  })

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    patchSong(uid, song.id, songFieldsFrom(form))
    navigate(`/song/${song.id}`, true)
  }
  const remove = async () => {
    if (!window.confirm(`Delete "${song.title}" and its open history? This can't be undone.`)) return
    await deleteSong(uid, song.id)
    navigate('/', true)
  }

  return (
    <main className="screen">
      <Header left={<button className="link-btn" type="button" onClick={() => goBack(`/song/${song.id}`)}>Cancel</button>} title="Edit song" />
      <form className="pad stack" onSubmit={save}>
        <SongFields value={form} onChange={setForm} />
        <button className="btn primary" type="submit">Save</button>
        <button className="btn danger" type="button" onClick={remove}>Delete song</button>
      </form>
    </main>
  )
}
