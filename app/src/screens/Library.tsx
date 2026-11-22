import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useSongs } from '../data'
import { keyText } from '../format'
import { IconPlus, StatusPill } from '../ui'

// Step 3 stub: a plain list so songs can be reached. Search, filters, sorting and staleness come in step 4.
export function Library() {
  const songs = useSongs()
  const sorted = [...(songs ?? [])].sort((a, b) => a.title.localeCompare(b.title))
  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="big-title">Library</h1>
        <button className="link-btn" onClick={() => signOut(auth)}>Sign out</button>
      </header>
      {songs === null ? (
        <p className="muted pad">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="empty">
          <p className="muted">Nothing here yet. Paste a link to a song or lesson to start your library.</p>
          <a className="btn primary" href="#/add">Add link</a>
        </div>
      ) : (
        <>
          <p className="count">{sorted.length} {sorted.length === 1 ? 'item' : 'items'}</p>
          <ul className="list">
            {sorted.map((s) => (
              <li key={s.id}>
                <a className="row-link" href={`#/song/${s.id}`}>
                  <div className="row-main">
                    <div className="row-title">{s.title}</div>
                    <div className="row-sub">{[s.artist ?? (s.type === 'lesson' ? 'Lesson' : null), keyText(s.keyRoot, s.keyMode)].filter(Boolean).join(' · ')}</div>
                    <StatusPill status={s.status} />
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <a className="fab" href="#/add"><IconPlus /> Add link</a>
    </main>
  )
}
