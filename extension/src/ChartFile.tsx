// Popup states 6.6 and 6.7 (extension/SPEC.md §5.1): a plain-text page, saved as one of the user's own charts.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  CHART_MAX_LENGTH, chartKeyForFile, chartTitle, deriveFields, fileBaseName, fileChartSource, findSongByTitle, guessFromFileName,
} from '@shared'
import { createSong, findSongBySourceKey, listSongs, patchSong, recordOpen, type SongDoc, type SourceDoc } from './data'
import { chartUrl, libraryUrl, songUrl } from './config'
import { openedText } from './format'
import { Footer, Header } from './layout'
import { Field } from './ui'
import { NEW_SONG_STATUS } from './NewSong'
import { SongPicker } from './SongPicker'

/** How much of the file the preview shows. */
const PREVIEW_LINES = 12

type Lookup =
  | { kind: 'loading' }
  | { kind: 'saved'; song: SongDoc; chart: SourceDoc }
  /** Not saved yet: every song for the picker, the song the file name points to (if any), and the status a new song gets. */
  | { kind: 'new'; songs: SongDoc[]; preselect: SongDoc | null }
  | { kind: 'error'; message: string }

interface Props {
  uid: string
  /** The text file's URL (file: or http(s)). */
  url: string
  /** The file's text, exactly as Chrome shows it. */
  text: string
  email: string | null
  onSignOut: () => void
  /** Web pages only: switch to saving the page as an ordinary link. */
  onSaveAsLink?: () => void
}

export function ChartFile({ uid, url, text, email, onSignOut, onSaveAsLink }: Props) {
  const [lookup, setLookup] = useState<Lookup>({ kind: 'loading' })
  const key = chartKeyForFile(url)

  const run = useCallback(async () => {
    setLookup({ kind: 'loading' })
    try {
      const song = await findSongBySourceKey(uid, key)
      const chart = song?.sources.find((s) => s.canonicalKey === key)
      if (song && chart) return setLookup({ kind: 'saved', song, chart })
      const songs = await listSongs(uid)
      // "Sade - Kiss of Life.txt": prefer the song with that title and artist; else any song with the guessed title.
      const guess = guessFromFileName(url)
      const matchKey = guess.titleGuess && guess.artistGuess ? deriveFields({ title: guess.titleGuess, artist: guess.artistGuess, sources: [] }).matchKey : null
      const preselect = (matchKey && songs.find((s) => s.matchKey === matchKey)) || (guess.titleGuess ? findSongByTitle(songs, guess.titleGuess) : undefined) || null
      setLookup({ kind: 'new', songs, preselect })
    } catch {
      setLookup({ kind: 'error', message: "Can't reach Guitarbook right now." })
    }
  }, [uid, key, url])
  useEffect(() => { void run() }, [run])

  const openLibrary = () => { void chrome.tabs.create({ url: libraryUrl() }); window.close() }

  if (text.length > CHART_MAX_LENGTH) {
    return (
      <div className="popup">
        <Header />
        <main className="body">
          <h1>This file is too long to save as a chart.</h1>
          <p className="muted">Charts can be up to {CHART_MAX_LENGTH.toLocaleString()} characters; this one has {text.length.toLocaleString()}.</p>
          {onSaveAsLink && <button className="btn wide" onClick={onSaveAsLink}>Save as a link instead</button>}
        </main>
        <Footer openLabel="Open library" onOpen={openLibrary} email={email} onSignOut={onSignOut} />
      </div>
    )
  }

  if (lookup.kind === 'saved') {
    return <SavedChart uid={uid} song={lookup.song} chart={lookup.chart} text={text} email={email} onSignOut={onSignOut} onChanged={(song, chart) => setLookup({ kind: 'saved', song, chart })} />
  }
  if (lookup.kind === 'new') {
    return (
      <NewChart
        uid={uid}
        url={url}
        text={text}
        songs={lookup.songs}
        preselect={lookup.preselect}
        email={email}
        onSignOut={onSignOut}
        onSaveAsLink={onSaveAsLink}
        onSaved={(song, chart) => setLookup({ kind: 'saved', song, chart })}
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
      <Footer openLabel="Open library" onOpen={openLibrary} email={email} onSignOut={onSignOut} />
    </div>
  )
}

function Preview({ text }: { text: string }) {
  const lines = text.split('\n')
  const shown = lines.slice(0, PREVIEW_LINES).join('\n')
  return (
    <div className="chart-preview">
      <pre>{shown}</pre>
      {lines.length > PREVIEW_LINES && <p className="muted small">…and {lines.length - PREVIEW_LINES} more lines</p>}
    </div>
  )
}

// ---- 6.6: not saved yet ---------------------------------------------------------

function NewChart({ uid, url, text, songs, preselect, email, onSignOut, onSaveAsLink, onSaved }: {
  uid: string
  url: string
  text: string
  songs: SongDoc[]
  preselect: SongDoc | null
  email: string | null
  onSignOut: () => void
  onSaveAsLink?: () => void
  onSaved: (song: SongDoc, chart: SourceDoc) => void
}) {
  // Fixed per form, so a retry after a failed save rewrites the same song and chart instead of adding another.
  const songId = useRef(crypto.randomUUID())
  const chartId = useRef(crypto.randomUUID())
  const [chartName, setChartName] = useState('')
  const [songText, setSongText] = useState(preselect?.title ?? guessFromFileName(url).titleGuess ?? '')
  /** A song picked from the suggestions (or the one the file name points to); typing clears it. */
  const [chosen, setChosen] = useState<SongDoc | null>(preselect)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The chart goes to the chosen song, else to a song whose title is exactly what's typed, else to a new song.
  const attachTo = chosen ?? findSongByTitle(songs, songText) ?? null
  const chart = () => fileChartSource({ id: chartId.current, url, title: chartName, text, now: Timestamp.now() })
  const untitledAs = chartTitle({}, attachTo ?? { title: songText.trim(), artist: null })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const c = chart()
      if (attachTo) {
        onSaved(await patchSong(uid, attachTo, { sources: [...attachTo.sources, c] }), c)
      } else {
        const song = await createSong(uid, songId.current, { title: songText.trim(), artist: null, keyRoot: null, keyMode: null, tags: [], status: NEW_SONG_STATUS }, c)
        onSaved(song, c)
      }
    } catch (err) {
      // Keep the form as it is (SPEC §6: never close or reset silently).
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }
  const openLibrary = () => { void chrome.tabs.create({ url: libraryUrl() }); window.close() }

  return (
    <div className="popup">
      <Header right={<span>Not saved yet</span>} />
      <main className="body">
        <section className="section first">
          {/* Order (SPEC §6.6): song, chart title, then the chart's text. */}
          <SongPicker
            songs={songs}
            value={songText}
            picked={attachTo}
            onType={(v) => { setSongText(v); setChosen(null) }}
            onPick={(s) => { setSongText(s.title); setChosen(s) }}
          />
          <Field label="Chart title (optional)">
            <input className="input" value={chartName} placeholder={untitledAs || 'The song’s title'} onChange={(e) => setChartName(e.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label">Chart text · {fileBaseName(url) || 'this file'}</span>
            <Preview text={text} />
          </div>
          {onSaveAsLink && <button className="link" onClick={onSaveAsLink}>Save as a link instead</button>}
        </section>
        {error && <p className="error small">Couldn't save: {error}</p>}
      </main>
      <Footer
        openLabel="Open library"
        onOpen={openLibrary}
        email={email}
        onSignOut={onSignOut}
        primary={
          <button className="btn primary big" disabled={busy || (!attachTo && !songText.trim())} onClick={() => void save()}>
            {busy ? 'Saving…' : attachTo ? `Add to ${attachTo.title}` : 'Save chart to Guitarbook'}
          </button>
        }
      />
    </div>
  )
}

// ---- 6.7: already saved as a chart -----------------------------------------------

function SavedChart({ uid, song, chart, text, email, onSignOut, onChanged }: {
  uid: string
  song: SongDoc
  chart: SourceDoc
  text: string
  email: string | null
  onSignOut: () => void
  onChanged: (song: SongDoc, chart: SourceDoc) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = (chart.text ?? '') !== text

  const replace = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = { ...chart, text }
      onChanged(await patchSong(uid, song, { sources: song.sources.map((s) => (s.id === chart.id ? next : s)) }), next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }
  const openChart = () => {
    recordOpen(uid, song, chart.id)
    void chrome.tabs.create({ url: chartUrl(song.id, chart.id) })
    window.close()
  }
  const openSong = () => { void chrome.tabs.create({ url: songUrl(song.id) }); window.close() }

  return (
    <div className="popup">
      <Header right={<span>Saved</span>} />
      <main className="body">
        <div className="banner">
          <div className="banner-title">Saved as a chart on {song.title}</div>
          <div className="banner-sub">{chartTitle(chart, song)} · {openedText(chart.lastOpenedAt)}</div>
        </div>
        {changed ? (
          <section className="section first">
            <p className="status-line">This file has changed since it was saved.</p>
            <button className="btn primary wide" disabled={busy} onClick={() => void replace()}>{busy ? 'Replacing…' : 'Replace the chart’s text'}</button>
            <p className="hint">Replaces only the text, keeping the chart’s title. Any edits made to the chart in Guitarbook are lost.</p>
          </section>
        ) : (
          <p className="status-line">Up to date with this file.</p>
        )}
        {error && <p className="error small">Couldn't save: {error}</p>}
        <button className="btn wide" onClick={openChart}>Open chart</button>
      </main>
      <Footer openLabel="Open in library" onOpen={openSong} email={email} onSignOut={onSignOut} />
    </div>
  )
}
