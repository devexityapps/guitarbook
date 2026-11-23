import { useEffect, useRef, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { CHART_MAX_LENGTH, chartSource, chartTitle, findMatchingSong, isChart } from '@shared'
import { createSong, newSongRef, newSourceId, setSources, useSongs, useUid, type SongDoc, type SourceDoc } from '../data'
import { Field, Header, IconBack, SongFields, emptySongForm, songFieldsFrom, type SongFormValues } from '../ui'
import { goBack } from '../router'

// The user's own charts: chord or tab text stored on the song as a resource (SPEC §4.8).

export const chartPath = (songId: string, sourceId: string) => `/song/${songId}/chart/${sourceId}`

/**
 * Charts open in a new tab like links (SPEC §4.8), except in the installed home-screen app: on iPhone it keeps its
 * sign-in separate from Safari, so a new tab would land there signed out.
 */
export function chartOpensInNewTab(): boolean {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return !standalone
}

const SIZE_KEY = 'guitarbook.chartFontSize'
const SIZES = [11, 12, 13, 14, 16, 18, 20, 22, 25, 28, 32]
const DEFAULT_SIZE = 14

function loadSize(): number {
  try {
    const n = Number(window.localStorage.getItem(SIZE_KEY))
    if (SIZES.includes(n)) return n
  } catch {
    /* storage unavailable: use the default */
  }
  return DEFAULT_SIZE
}

function saveSize(n: number) {
  try {
    window.localStorage.setItem(SIZE_KEY, String(n))
  } catch {
    /* ignore */
  }
}

/** Keep the screen on while a chart is open, where the browser supports it (Screen Wake Lock API). */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let done = false
    const request = async () => {
      try {
        const l = await navigator.wakeLock.request('screen')
        if (done) void l.release()
        else lock = l
      } catch {
        /* refused (battery saver, not visible): the screen just behaves as usual */
      }
    }
    // The lock is dropped whenever the page is hidden; ask again when it comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') void request() }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
}

/** Ask before the tab is closed or reloaded with unsaved changes. */
function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

function findChart(songs: SongDoc[] | null, songId: string, sourceId: string) {
  const song = songs?.find((s) => s.id === songId)
  const chart = song?.sources.find((s) => s.id === sourceId && isChart(s))
  return { song, chart }
}

function Missing({ songs, what }: { songs: SongDoc[] | null; what: string }) {
  return (
    <main className="screen">
      <Header left={<a className="icon-btn" href="#/" aria-label="Back to library"><IconBack /></a>} />
      <p className="muted pad">{songs === null ? 'Loading…' : `That ${what} isn't in your library (it may have been removed).`}</p>
    </main>
  )
}

// ---- viewer -----------------------------------------------------------------

export function ChartViewer({ songId, sourceId }: { songId: string; sourceId: string }) {
  const songs = useSongs()
  const { song, chart } = findChart(songs, songId, sourceId)
  if (!song || !chart) return <Missing songs={songs} what="chart" />
  return <Viewer song={song} chart={chart} />
}

function Viewer({ song, chart }: { song: SongDoc; chart: SourceDoc }) {
  const [size, setSize] = useState(loadSize)
  const [full, setFull] = useState(false)
  const pageRef = useRef<HTMLElement>(null)
  useWakeLock()

  // Leaving browser full screen another way (Escape, the OS gesture) ends our full-screen state too.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull(false) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  // Without the Fullscreen API (iPhone Safari) full screen just hides the header; Escape still leaves it.
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  const enterFull = () => {
    setFull(true)
    const el = pageRef.current
    if (document.fullscreenEnabled && el?.requestFullscreen) el.requestFullscreen().catch(() => { /* refused: the hidden-header mode still applies */ })
  }
  const exitFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    setFull(false)
  }
  const step = (dir: 1 | -1) => {
    const i = Math.max(0, SIZES.indexOf(size))
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, i + dir))]!
    setSize(next)
    saveSize(next)
  }
  const sizeButtons = (
    <>
      <button type="button" className="btn small-btn" aria-label="Smaller text" disabled={size === SIZES[0]} onClick={() => step(-1)}>A−</button>
      <button type="button" className="btn small-btn" aria-label="Larger text" disabled={size === SIZES[SIZES.length - 1]} onClick={() => step(1)}>A+</button>
    </>
  )

  return (
    <main ref={pageRef} className={`chart-page${full ? ' full' : ''}`}>
      {!full && (
        <>
          <header className="topbar chart-top">
            <a className="icon-btn" href={`#/song/${song.id}`} aria-label={`Back to ${song.title}`}><IconBack /></a>
            <div className="chart-heading">
              <h1>{chartTitle(chart, song)}</h1>
              {/* An untitled chart is already called by the song's title and artist, so don't repeat them. */}
              {chart.title?.trim() && <p className="muted small">{chartTitle({}, song)}</p>}
            </div>
            <a className="link-btn" href={`#${chartPath(song.id, chart.id)}/edit`}>Edit</a>
          </header>
          <div className="chart-tools">
            {sizeButtons}
            <button type="button" className="btn small-btn" onClick={enterFull}>Full screen</button>
          </div>
        </>
      )}
      <pre className="chart-text" style={{ fontSize: `${size}px` }}>{chart.text ?? ''}</pre>
      {full && (
        <div className="chart-float">
          {sizeButtons}
          <button type="button" className="btn small-btn" onClick={exitFull}>Exit full screen</button>
        </div>
      )}
    </main>
  )
}

// ---- editor -----------------------------------------------------------------

function ChartFields({ title, text, onTitle, onText, untitledAs, autoFocusText = false }: {
  title: string
  text: string
  onTitle: (v: string) => void
  onText: (v: string) => void
  /** What the chart is called if the title is left empty (the song's title and artist), shown as the placeholder. */
  untitledAs: string
  autoFocusText?: boolean
}) {
  return (
    <>
      <Field label="Chart title (optional)">
        <input className="input" value={title} maxLength={120} placeholder={untitledAs || 'The song’s title and artist'} onChange={(e) => onTitle(e.target.value)} />
      </Field>
      <Field label="Chart" hint={`Paste or type your chords or tab; spacing is kept exactly. Up to ${CHART_MAX_LENGTH.toLocaleString()} characters.`}>
        <textarea
          className="input chart-input"
          value={text}
          rows={14}
          wrap="off"
          maxLength={CHART_MAX_LENGTH}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          autoFocus={autoFocusText}
          placeholder={'Am7          D9\nWords go here\n\ne|-----0-----|\nB|---1---1---|'}
          onChange={(e) => onText(e.target.value)}
        />
      </Field>
    </>
  )
}

/** Edit a chart (`sourceId`), or write a new one on the song (`sourceId` null). */
export function ChartEditor({ songId, sourceId }: { songId: string; sourceId: string | null }) {
  const songs = useSongs()
  const song = songs?.find((s) => s.id === songId)
  const existing = sourceId ? song?.sources.find((s) => s.id === sourceId && isChart(s)) : undefined
  if (!song || (sourceId && !existing)) return <Missing songs={songs} what={sourceId ? 'chart' : 'song'} />
  return <Editor key={existing?.id ?? 'new'} song={song} existing={existing} />
}

function Editor({ song, existing }: { song: SongDoc; existing: SourceDoc | undefined }) {
  const uid = useUid()
  const startTitle = existing?.title ?? ''
  const startText = existing?.text ?? ''
  const [title, setTitle] = useState(startTitle)
  const [text, setText] = useState(startText)
  const dirty = title !== startTitle || text !== startText
  useUnsavedWarning(dirty)
  const canSave = text.trim() !== '' // the title is optional
  // Saving and cancelling both return to the previous view (the song, or the viewer if Edit was tapped there);
  // with nothing to go back to, to the song.
  const back = `/song/${song.id}`

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    if (existing) setSources(uid, song, song.sources.map((s) => (s.id === existing.id ? { ...s, title: title.trim() || null, text } : s)))
    else setSources(uid, song, [...song.sources, chartSource({ id: newSourceId(), title, text, now: Timestamp.now() })])
    goBack(back)
  }
  const cancel = () => {
    if (dirty && !window.confirm('Discard your changes to this chart?')) return
    goBack(back)
  }

  return (
    <main className="screen">
      <Header left={<button className="link-btn" type="button" onClick={cancel}>Cancel</button>} title={existing ? 'Edit chart' : 'New chart'} />
      <form className="pad stack" onSubmit={save}>
        <p className="muted">{existing ? 'On' : 'Adding to'} <strong>{song.title}</strong></p>
        <ChartFields title={title} text={text} onTitle={setTitle} onText={setText} untitledAs={chartTitle({}, song)} autoFocusText={!existing} />
        <button className="btn primary big" type="submit" disabled={!canSave}>Save</button>
      </form>
    </main>
  )
}

// ---- new song from a chart (Library "+" → Chart) ----------------------------

export function NewChart() {
  const songs = useSongs()
  const uid = useUid()
  const [form, setForm] = useState<SongFormValues>(emptySongForm)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'attach' | 'new'>('attach')

  const match = songs ? findMatchingSong(songs, form.title.trim(), form.artist.trim()) : undefined
  const matchId = match?.id
  useEffect(() => setMode('attach'), [matchId])
  const attachTo = mode === 'attach' ? match : undefined

  const dirty = form.title !== '' || form.artist !== '' || text !== '' || title !== ''
  useUnsavedWarning(dirty)
  const canSave = songs !== null && form.title.trim() !== '' && text.trim() !== '' // the chart title is optional

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const chart = chartSource({ id: newSourceId(), title, text, now: Timestamp.now() })
    if (attachTo) setSources(uid, attachTo, [...attachTo.sources, chart])
    else createSong(uid, newSongRef(uid).id, { ...songFieldsFrom(form), sources: [chart] })
    goBack('/') // back to the previous view (the Library), like Cancel
  }
  const cancel = () => {
    if (dirty && !window.confirm('Discard this chart?')) return
    goBack('/')
  }

  return (
    <main className="screen">
      <Header left={<button className="link-btn" type="button" onClick={cancel}>Cancel</button>} title="New chart" />
      <form className="pad stack" onSubmit={save}>
        <h2 className="section first">Song</h2>
        <SongFields value={form} onChange={setForm} />

        {match && (
          <div className="panel warn">
            <div className="panel-title">Already in your library</div>
            <p className="panel-song">{match.title}</p>
            <p className="muted small">{match.artist} · {match.sources.length} {match.sources.length === 1 ? 'resource' : 'resources'}</p>
            <div className="row">
              <button type="button" className={`btn ${mode === 'attach' ? 'primary' : ''}`} onClick={() => setMode('attach')}>Add to this song</button>
              <button type="button" className={`btn ${mode === 'new' ? 'primary' : ''}`} onClick={() => setMode('new')}>New song</button>
            </div>
            {mode === 'attach' && <p className="muted small">The chart is added to that song; its status, tags and key stay as they are.</p>}
          </div>
        )}

        <h2 className="section">Chart</h2>
        <ChartFields title={title} text={text} onTitle={setTitle} onText={setText} untitledAs={chartTitle({}, attachTo ?? { title: form.title.trim(), artist: form.artist.trim() || null })} />
        <button className="btn primary big" type="submit" disabled={!canSave}>{attachTo ? `Add to ${attachTo.title}` : 'Create song'}</button>
      </form>
    </main>
  )
}
