import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth/web-extension'
import { deriveFields, parseLink, type ParsedLink } from '@shared'
import { auth } from './firebase'
import { isOwnApp, libraryUrl } from './config'
import { findSongByMatchKey, findSongBySourceKey, libraryIsEmpty, type SongDoc } from './data'
import { AUTH_ERROR_KEY } from './messages'
import { Footer, Header } from './layout'
import { SavedSong } from './SavedSong'
import { NewSong } from './NewSong'
import { ChartFile } from './ChartFile'
import './popup.css'

type LinkPage = { title: string; parsed: ParsedLink; playbackSec?: number }
/** A plain-text page (SPEC §5.1): offered as a chart. `parsed` is null for a local file, which can't be a link. */
type TextPage = { title: string; url: string; parsed: ParsedLink | null; text: string }
type Page = LinkPage | TextPage | 'unsavable' | 'unsavable-file' | 'no-file-access' | 'own-app' | null

const isTextPage = (p: Page): p is TextPage => typeof p === 'object' && p !== null && 'text' in p

/**
 * SPEC §5.1: the page's text if it's a plain-text page (a .txt file), else null. Rejects when the script can't run,
 * which on a file: page means "Allow access to file URLs" is off.
 */
async function plainText(tabId: number): Promise<string | null> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    // Chrome shows a text file in a <pre>, whose textContent keeps the spacing exactly.
    func: () => (document.contentType === 'text/plain' ? (document.querySelector('body > pre')?.textContent ?? document.body?.textContent ?? '') : null),
  })
  const text = res?.result
  return typeof text === 'string' && text.trim() !== '' ? text : null
}

/** The video's current playback position (YouTube only). Hidden if anything fails. */
async function currentPlaybackSec(tabId: number): Promise<number | undefined> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.querySelector('video')?.currentTime })
    const t = res?.result
    return typeof t === 'number' && Number.isFinite(t) && t >= 1 ? Math.floor(t) : undefined
  } catch {
    return undefined
  }
}

function usePage(): Page {
  const [page, setPage] = useState<Page>(null)
  useEffect(() => {
    // With activeTab, url and title are readable once the user has clicked the icon (or used the shortcut).
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (tab?.url && isOwnApp(tab.url)) return setPage('own-app')
      // parseLink only accepts http(s) pages; chrome://, the Web Store's new-tab page, file: etc. give null.
      const parsed = tab?.url && /^https?:\/\//i.test(tab.url) ? parseLink(tab.url, tab.title) : null
      const isFile = !!tab?.url && /^file:/i.test(tab.url)
      if (!parsed && !isFile) return setPage('unsavable')
      // A local file, or a page that isn't YouTube/UG/Songsterr, may be a plain-text chart (SPEC §5.1).
      if ((isFile || parsed?.site === 'other') && tab!.id !== undefined) {
        try {
          const text = await plainText(tab!.id)
          if (text !== null) return setPage({ title: tab!.title ?? '', url: tab!.url!, parsed, text })
        } catch {
          if (isFile) return setPage('no-file-access')
        }
      }
      if (!parsed) return setPage('unsavable-file')
      const base = { title: tab!.title ?? '', parsed }
      setPage(base)
      // YouTube watch page without a t= in the URL: offer to start where the video is now (SPEC §5).
      if (parsed.site === 'youtube' && parsed.ytVideoId && parsed.ytStartSec === undefined && new URL(tab!.url!).pathname === '/watch' && tab!.id !== undefined) {
        void currentPlaybackSec(tab!.id).then((sec) => sec !== undefined && setPage({ ...base, playbackSec: sec }))
      }
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
  | { kind: 'new'; match: SongDoc | null; empty: boolean }
  | { kind: 'error'; message: string }

function SignedIn({ user }: { user: User }) {
  const page = usePage()
  const [lookup, setLookup] = useState<Lookup>({ kind: 'loading' })
  /** On a plain-text web page: the user chose "Save as a link instead". */
  const [asLink, setAsLink] = useState(false)
  const email = user.email
  const out = () => void signOut(auth)

  // Depends on the parse only: the playback position can arrive later and must not restart the lookup (and the form).
  // A plain-text page is a chart (its own lookup, in ChartFile) unless the user chose to save it as a link.
  const parsed = typeof page === 'object' && page && (!isTextPage(page) || asLink) ? page.parsed : null
  const run = useCallback(async () => {
    if (!parsed) return
    setLookup({ kind: 'loading' })
    try {
      const song = await findSongBySourceKey(user.uid, parsed.canonicalKey)
      if (song) {
        setLookup({ kind: 'saved', song })
        return
      }
      // Not saved: does a song with this title and artist exist? (Only when both were guessed.)
      const matchKey = parsed.titleGuess && parsed.artistGuess ? deriveFields({ title: parsed.titleGuess, artist: parsed.artistGuess, sources: [] }).matchKey : null
      const match = matchKey ? await findSongByMatchKey(user.uid, matchKey) : null
      setLookup({ kind: 'new', match, empty: match ? false : await libraryIsEmpty(user.uid) })
    } catch {
      setLookup({ kind: 'error', message: "Can't reach Guitarbook right now." })
    }
  }, [parsed, user.uid])
  useEffect(() => { void run() }, [run])

  if (page === null) return <div className="popup"><Header /></div>

  if (page === 'own-app') {
    return (
      <div className="popup">
        <Header />
        <main className="body">
          <h1>You're already in Guitarbook.</h1>
          <p className="muted">Open the lesson or tab you want to keep and click the icon there.</p>
        </main>
        <Footer email={email} onSignOut={out} />
      </div>
    )
  }

  if (page === 'no-file-access' || page === 'unsavable-file') {
    const openSettings = () => { void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }); window.close() }
    return (
      <div className="popup">
        <Header />
        <main className="body">
          {page === 'no-file-access' ? (
            <>
              <h1>Guitarbook can't read local files yet.</h1>
              <p className="muted">To save a text file from your computer as a chart, turn on “Allow access to file URLs” for Guitarbook, then reload this file and click the icon again.</p>
              <button className="btn wide" onClick={openSettings}>Open Guitarbook's settings</button>
            </>
          ) : (
            <>
              <h1>Guitarbook can't save this file.</h1>
              <p className="muted">Local files can be saved only if they're plain text (like a .txt file), as a chart.</p>
            </>
          )}
        </main>
        <Footer openLabel="Open library" onOpen={openLibrary} email={email} onSignOut={out} />
      </div>
    )
  }

  if (isTextPage(page) && !asLink) {
    const p = page.parsed
    return <ChartFile uid={user.uid} url={page.url} text={page.text} email={email} onSignOut={out} onSaveAsLink={p ? () => setAsLink(true) : undefined} />
  }
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

  // Past here the page is saved as a link, so it has a parse (a local text file never gets here).
  if (!page.parsed) return null
  const linkPage: LinkPage = { title: page.title, parsed: page.parsed, playbackSec: 'playbackSec' in page ? page.playbackSec : undefined }

  if (lookup.kind === 'saved') {
    return (
      <SavedSong
        key={lookup.song.id}
        uid={user.uid}
        initial={lookup.song}
        canonicalKey={linkPage.parsed.canonicalKey}
        email={email}
        onSignOut={out}
        onChanged={() => void run()}
      />
    )
  }

  if (lookup.kind === 'new') {
    return (
      <NewSong
          key={linkPage.parsed.canonicalKey}
          uid={user.uid}
          parsed={linkPage.parsed}
          pageTitle={linkPage.title}
          playbackSec={linkPage.playbackSec}
          match={lookup.match}
          email={email}
          onSignOut={out}
          onSaved={(song) => setLookup({ kind: 'saved', song })}
          hint={lookup.empty ? <p className="hint">Signed in as {email}. Your songs are on a different account? <button className="link" onClick={out}>Sign out</button></p> : null}
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
