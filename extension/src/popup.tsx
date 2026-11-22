import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth/web-extension'
import { auth } from './firebase'
import { libraryUrl } from './config'
import { AUTH_ERROR_KEY } from './messages'
import './popup.css'

type Page = { url: string; title: string } | 'unsavable' | null

const isWebUrl = (url: string | undefined) => !!url && /^https?:\/\//i.test(url)

function usePage(): Page {
  const [page, setPage] = useState<Page>(null)
  useEffect(() => {
    // With activeTab, url and title are readable once the user has clicked the icon (or used the shortcut).
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setPage(tab && isWebUrl(tab.url) ? { url: tab.url!, title: tab.title ?? '' } : 'unsavable')
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

function Header() {
  return (
    <header className="head">
      <img src="icons/icon-32.png" width={24} height={24} alt="" />
      <span className="name">Guitarbook</span>
    </header>
  )
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

function SignedIn({ user }: { user: User }) {
  const page = usePage()
  return (
    <div className="popup">
      <Header />
      <main className="body">
        {page === null ? null : page === 'unsavable' ? (
          <>
            <h1>Guitarbook can't save this page.</h1>
            <p className="muted">Browser pages like this one (settings, new tab, the Web Store) can't be saved. Go to the lesson or tab you want to keep and click the icon there.</p>
          </>
        ) : (
          <>
            <div className="label">Page title</div>
            <p className="value">{page.title || '(no title)'}</p>
            <div className="label">URL</div>
            <p className="value url">{page.url}</p>
          </>
        )}
      </main>
      <footer className="foot">
        <button className="btn primary" onClick={openLibrary}>Open library</button>
        <div className="who">
          <span className="email" title={user.email ?? ''}>{user.email}</span>
          <button className="link" onClick={() => void signOut(auth)}>Sign out</button>
        </div>
      </footer>
    </div>
  )
}

function Popup() {
  const user = useUser()
  if (user === undefined) return <div className="popup"><Header /></div>
  return user ? <SignedIn user={user} /> : <SignedOut />
}

createRoot(document.getElementById('root')!).render(<StrictMode><Popup /></StrictMode>)
