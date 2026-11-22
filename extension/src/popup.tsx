import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth/web-extension'
import { parseLink } from '@shared'
import { auth } from './firebase'
import { libraryUrl } from './config'
import { findSongBySourceKey, libraryIsEmpty, type SongDoc } from './data'
import { AUTH_ERROR_KEY } from './messages'
import { Footer, Header } from './layout'
import { SavedSong } from './SavedSong'
import './popup.css'

type Page = { url: string; title: string; canonicalKey: string } | 'unsavable' | null

function usePage(): Page {
  const [page, setPage] = useState<Page>(null)
  useEffect(() => {
    // With activeTab, url and title are readable once the user has clicked the icon (or used the shortcut).
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      // parseLink only accepts http(s) pages; chrome://, the Web Store's new-tab page, file: etc. give null.
      const parsed = tab?.url && /^https?:\/\//i.test(tab.url) ? parseLink(tab.url, tab.title) : null
      setPage(parsed ? { url: tab!.url!, title: tab!.title ?? '', canonicalKey: parsed.canonicalKey } : 'unsavable')
    }, () => setPage('unsavable'))
  }, [])
  return page
}

/** undefined until Firebase has restored the saved sign-in; null when signed out. */
function useUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

const openLibrary = () => {
  void chrome.tabs.create({ url: libraryUrl() })
  window.close()
}

function SignedOut() {
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // An attempt that failed while the popup was closed leaves its error here.
    chrome.storage.local.get(AUTH_ERROR_KEY).then((v) => {
      if (typeof v[AUTH_ERROR_KEY] === 'string') setError(v[AUTH_ERROR_KEY])
      void chrome.storage.local.remove(AUTH_ERROR_KEY)
    }, () => {})
    // Errors arrive while the popup is open too (e.g. the browser blocked the Google window).
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const next = changes[AUTH_ERROR_KEY]?.newValue
      if (area === 'local' && typeof next === 'string') {
        setError(next)
        setWaiting(false)
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  const signIn = async () => {
    setError(null)
    setWaiting(true)
    try {
      // Chrome closes the popup when the Google window opens; that's expected.
      const res = (await chrome.runtime.sendMessage({ type: 'gb:sign-in' })) as { ok: boolean; error?: string } | undefined
      if (res && !res.ok) throw new Error(res.error)
    } catch (err) {
      setWaiting(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="popup signed-out">
      <img className="hero" src="icons/icon-128.png" width={72} height={72} alt="" />
      <h1 className="hero-name">Guitarbook</h1>
      <p className="muted">Use the same Google account as the Guitarbook app.</p>
      <button className="btn primary wide" onClick={signIn} disabled={waiting}>Sign in with Google</button>
      {waiting && <p className="muted small">Finish signing in in the Google window.</p>}
      {error && <p className="error small">Couldn't sign in: {error}</p>}
    </div>
  )
}

type Lookup =
  | { kind: 'loading' }
  | { kind: 'saved'; song: SongDoc }
  | { kind: 'new'; empty: boolean }
  | { kind: 'error'; message: string }

function SignedIn({ user }: { user: User }) {
  const page = usePage()
  const [lookup, setLookup] = useState<Lookup>({ kind: 'loading' })
  const email = user.email
  const out = () => void signOut(auth)

  const run = useCallback(async () => {
    if (page === null || page === 'unsavable') return
    setLookup({ kind: 'loading' })
    try {
      const song = await findSongBySourceKey(user.uid, page.canonicalKey)
      if (song) setLookup({ kind: 'saved', song })
      else setLookup({ kind: 'new', empty: await libraryIsEmpty(user.uid) })
    } catch {
      setLookup({ kind: 'error', message: "Can't reach Guitarbook right now." })
    }
  }, [page, user.uid])
  useEffect(() => { void run() }, [run])

  if (page === null) return <div className="popup"><Header /></div>

  if (page === 'unsavable') {
    return (
      <div className="popup">
        <Header />
        <main className="body">
          <h1>Guitarbook can't save this page.</h1>
          <p className="muted">Browser pages like this one (settings, new tab, the Web Store) can't be saved. Go to the lesson or tab you want to keep and click the icon there.</p>
        </main>
        <Footer openLabel="Open library" onOpen={openLibrary} email={email} onSignOut={out} />
      </div>
    )
  }

  if (lookup.kind === 'saved') {
    return (
      <SavedSong
        key={lookup.song.id}
        uid={user.uid}
        initial={lookup.song}
        canonicalKey={page.canonicalKey}
        email={email}
        onSignOut={out}
        onChanged={() => void run()}
      />
    )
  }

  return (
    <div className="popup">
      <Header />
      <main className="body">
        {lookup.kind === 'loading' && <p className="muted">Checking your library…</p>}
        {lookup.kind === 'error' && (
          <>
            <p className="error">{lookup.message}</p>
            <button className="btn" onClick={() => void run()}>Try again</button>
          </>
        )}
        {lookup.kind === 'new' && (
          <>
            <h1>Not saved yet</h1>
            <p className="muted">This page isn't in your library. Saving from here comes next.</p>
            <div className="label top">Page title</div>
            <p className="value">{page.title || '(no title)'}</p>
            {lookup.empty && (
              <p className="hint">Signed in as {email}. Your songs are on a different account? <button className="link" onClick={out}>Sign out</button></p>
            )}
          </>
        )}
      </main>
      <Footer openLabel="Open library" onOpen={openLibrary} email={email} onSignOut={out} />
    </div>
  )
}

function Popup() {
  const user = useUser()
  if (user === undefined) return <div className="popup"><Header /></div>
  return user ? <SignedIn user={user} /> : <SignedOut />
}

createRoot(document.getElementById('root')!).render(<StrictMode><Popup /></StrictMode>)
