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
import { ChartEditor, ChartViewer, NewChart } from './screens/Chart'
import { Settings } from './screens/Settings'

function Routes() {
  const { path } = useRoute()
  if (path[0] === 'add') return <AddLink />
  if (path[0] === 'settings') return <Settings />
  if (path[0] === 'new') return path[1] === 'chart' ? <NewChart /> : <NewSong />
  if (path[0] === 'song' && path[1]) {
    // Charts (SPEC §4.8): #/song/<id>/chart/new, #/song/<id>/chart/<sourceId>, #/song/<id>/chart/<sourceId>/edit
    if (path[2] === 'chart' && path[3]) {
      if (path[3] === 'new') return <ChartEditor songId={path[1]} sourceId={null} />
      return path[4] === 'edit' ? <ChartEditor songId={path[1]} sourceId={path[3]} /> : <ChartViewer songId={path[1]} sourceId={path[3]} />
    }
    // Song detail edits in place; an old "#/song/<id>/edit" link lands here too.
    return <SongDetail id={path[1]} />
  }
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
