import { useState } from 'react'
import { createSong, newSongRef, useUid } from '../data'
import { Header, SongFields, emptySongForm, songFieldsFrom, type SongFormValues } from '../ui'
import { goBack, navigate } from '../router'

/** A new song with no links yet; links are added later from Song detail. */
export function NewSong() {
  const uid = useUid()
  const [form, setForm] = useState<SongFormValues>(emptySongForm)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const ref = newSongRef(uid)
    createSong(uid, ref.id, { ...songFieldsFrom(form), sources: [] })
    navigate(`/song/${ref.id}`, true)
  }

  return (
    <main className="screen">
      <Header left={<button className="link-btn" type="button" onClick={() => goBack('/')}>Cancel</button>} title="New song" />
      <form className="pad stack" onSubmit={save}>
        <SongFields value={form} onChange={setForm} />
        <button className="btn primary" type="submit" disabled={!form.title.trim()}>Create song</button>
      </form>
    </main>
  )
}
