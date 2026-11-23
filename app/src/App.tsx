import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from './firebase'
import { DataProvider } from './data'
import { useRoute } from './router'
import { SignIn } from './screens/SignIn'
import { Library } from './screens/Library'
import { AddLink } from './screens/AddLink'
import { NewSong } from './screens/NewSong'
import { SongDetail } from './screens/SongDetail'

function Routes() {
  const { path } = useRoute()
  if (path[0] === 'add') return <AddLink />
  if (path[0] === 'new') return <NewSong />
  // Song detail edits in place; an old "#/song/<id>/edit" link lands here too.
  if (path[0] === 'song' && path[1]) return <SongDetail id={path[1]} />
  return <Library />
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
