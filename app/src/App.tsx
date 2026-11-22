import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from './firebase'
import { DataProvider } from './data'
import { useDesktop } from './layout'
import { useRoute } from './router'
import { SignIn } from './screens/SignIn'
import { Library } from './screens/Library'
import { AddLink } from './screens/AddLink'
import { SongDetail } from './screens/SongDetail'
import { EditSong } from './screens/EditSong'

function Routes() {
  const { path, query } = useRoute()
  const desktop = useDesktop()
  const isAdd = path[0] === 'add'
  const isSong = path[0] === 'song' && !!path[1]
  const isEdit = isSong && path[2] === 'edit'

  if (!desktop) {
    if (isAdd) return <AddLink />
    if (isSong) return isEdit ? <EditSong id={path[1]!} /> : <SongDetail id={path[1]!} />
    return <Library />
  }

  // Desktop: the Library stays on the left, the song on the right; Add and Edit open as a dialog on top.
  const detailId = isSong ? path[1] : isAdd ? query.get('song') : null
  return (
    <div className="shell">
      <aside className="pane-list" aria-label="Library">
        <Library selectedId={detailId ?? undefined} />
      </aside>
      <section className="pane-detail">
        {detailId ? <SongDetail id={detailId} /> : <div className="pane-empty muted">Select a song, or add a link.</div>}
      </section>
      {(isAdd || isEdit) && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            {isAdd ? <AddLink /> : <EditSong id={path[1]!} />}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  if (user === undefined) return <main className="center muted">Loading…</main>
  if (!user) return <SignIn />
  return (
    <DataProvider uid={user.uid}>
      <Routes />
    </DataProvider>
  )
}
