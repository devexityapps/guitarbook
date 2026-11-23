// Popup states 6.3 and 6.4 (extension/SPEC.md): this page isn't saved yet.
import { useRef, useState, type ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import { KEY_ROOTS, SITE_NAMES, STATUSES, cleanPageTitle, mergeTags, sourceFromParsed, type KeyMode, type ParsedLink, type Status } from '@shared'
import { createSong, patchSong, type SongDoc } from './data'
import { libraryUrl } from './config'
import { Footer, Header } from './layout'
import { Field, TagInput } from './ui'

const LAST_STATUS_KEY = 'lastStatus'
const isStatus = (v: unknown): v is Status => STATUSES.some((s) => s.value === v)
export async function lastUsedStatus(): Promise<Status> {
  try {
    const v = (await chrome.storage.local.get(LAST_STATUS_KEY))[LAST_STATUS_KEY]
    return isStatus(v) ? v : 'wishlist'
  } catch {
    return 'wishlist'
  }
}

const KEY_OPTIONS = KEY_ROOTS.flatMap((r) => (['major', 'minor'] as const).map((m) => ({ value: `${r}|${m}`, label: `${r} ${m}` })))

/** 222 -> "3:42", 3725 -> "1:02:05". */
function clock(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

const SHORT_SITE: Record<ParsedLink['site'], string> = { youtube: 'YouTube', ultimateguitar: 'UG', songsterr: 'Songsterr', other: 'Link' }
const linkSummary = (song: SongDoc) => song.sources.map((s) => SHORT_SITE[s.site]).join(', ')

interface Props {
  uid: string
  parsed: ParsedLink
  /** The tab's title: kept on the link as its own title, separate from the song's title. */
  pageTitle: string
  /** A song with the same title and artist, if there is one. */
  match: SongDoc | null
  initialStatus: Status
  email: string | null
  onSignOut: () => void
  /** YouTube: where the video is now, in seconds (offered as the link's start time). */
  playbackSec?: number
  /** Saved: show the saved-song view. */
  onSaved: (song: SongDoc) => void
  /** Shown at the bottom, e.g. the wrong-account hint. */
  hint?: ReactNode
}

export function NewSong({ uid, parsed, pageTitle, match, initialStatus, playbackSec, email, onSignOut, onSaved, hint }: Props) {
  // Fixed per form, so a retry after a failed save overwrites the same song and link instead of adding another.
  const songId = useRef(crypto.randomUUID())
  const sourceId = useRef(crypto.randomUUID())
  const [useStart, setUseStart] = useState(false)
  const [mode, setMode] = useState<'match' | 'form'>(match ? 'match' : 'form')
  const [linkTitle, setLinkTitle] = useState(cleanPageTitle(pageTitle) ?? '')
  const [type, setType] = useState<'song' | 'lesson'>(parsed.site === 'other' || parsed.typeGuess === 'lesson' ? 'lesson' : 'song')
  const [title, setTitle] = useState(parsed.titleGuess ?? '')
  const [artist, setArtist] = useState(parsed.artistGuess ?? '')
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<Status>(initialStatus)
  const [tags, setTags] = useState<string[]>(parsed.suggestedTags)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const source = () => {
    const src = sourceFromParsed(parsed, { id: sourceId.current, label: null, title: linkTitle, now: Timestamp.now() })
    if (useStart && playbackSec !== undefined) {
      // The app opens a link's url as it is, so the time goes into the url too (the canonical key ignores it).
      const url = new URL(src.url)
      url.searchParams.set('t', String(playbackSec))
      src.url = url.toString()
      src.ytStartSec = playbackSec
    }
    return src
  }
  const where = parsed.site === 'other' ? 'this page' : `this ${SITE_NAMES[parsed.site]} page`

  const run = async (job: () => Promise<SongDoc>) => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await job())
    } catch (err) {
      // Keep the form as it is (SPEC §6: never close or reset silently).
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const attach = () =>
    run(() => patchSong(uid, match!, { sources: [...match!.sources, source()], tags: mergeTags(match!.tags, parsed.suggestedTags) }))

  const create = () =>
    run(async () => {
      const [keyRoot, keyMode] = key ? (key.split('|') as [string, KeyMode]) : [null, null]
      const song = await createSong(
        uid,
        songId.current,
        { type, title: title.trim(), artist: artist.trim() || null, keyRoot, keyMode, tags: mergeTags([], tags), status },
        source(),
      )
      void chrome.storage.local.set({ [LAST_STATUS_KEY]: status }).catch(() => {})
      return song
    })

  const openLibrary = () => { void chrome.tabs.create({ url: libraryUrl() }); window.close() }
  const header = <Header right={<span>Not saved yet</span>} />

  // Everything about the link comes first; the song's own fields follow under their own heading.
  const linkSection = (
    <section className="section first">
      <h2 className="eyebrow">This link · {SITE_NAMES[parsed.site]}</h2>
      <Field label="Link title">
        <input className="input" value={linkTitle} placeholder="The page's title" onChange={(e) => setLinkTitle(e.target.value)} />
      </Field>
      {playbackSec !== undefined && (
        <label className="check">
          <input type="checkbox" checked={useStart} onChange={(e) => setUseStart(e.target.checked)} />
          <span>Start at {clock(playbackSec)} (where you are now)</span>
        </label>
      )}
    </section>
  )

  if (mode === 'match' && match) {
    return (
      <div className="popup">
        {header}
        <main className="body">
          {linkSection}
          <div className="banner warn match">
            <div className="banner-title">Already in your library</div>
            <div className="match-song">{match.title}</div>
            <div className="banner-sub">
              {match.artist ? `${match.artist} · ` : ''}{match.sources.length} {match.sources.length === 1 ? 'link' : 'links'} ({linkSummary(match)})
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => void attach()}>{busy ? 'Adding…' : 'Add to this song'}</button>
              <button className="btn" disabled={busy} onClick={() => setMode('form')}>New song</button>
            </div>
          </div>
          {error && <p className="error small">{error}</p>}
          {hint}
        </main>
        <Footer openLabel="Open library" onOpen={openLibrary} email={email} onSignOut={onSignOut} />
      </div>
    )
  }

  return (
    <div className="popup">
      {header}
      <main className="body">
        <p className="status-line">Filled in from {where}. Check and save.</p>
        {linkSection}
        <section className="section">
          <h2 className="eyebrow">Song</h2>
          <div className="seg" role="group" aria-label="Type">
            {(['song', 'lesson'] as const).map((t) => (
              <button key={t} type="button" className={`chip${type === t ? ' on' : ''}`} aria-pressed={type === t} onClick={() => setType(t)}>
                {t === 'song' ? 'Song' : 'Lesson'}
              </button>
            ))}
          </div>
        <div className="stack">
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label={type === 'lesson' ? 'Artist (optional for lessons)' : 'Artist'}>
            <input className="input" value={artist} placeholder="Artist" onChange={(e) => setArtist(e.target.value)} />
          </Field>
          <div className="row">
            <Field label="Key">
              <select className="input" value={key} onChange={(e) => setKey(e.target.value)}>
                <option value="">None</option>
                {KEY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        </section>
        {error && <p className="error small">Couldn't save: {error}</p>}
        {hint}
      </main>
      <Footer
        openLabel="Open library"
        onOpen={openLibrary}
        email={email}
        onSignOut={onSignOut}
        primary={<button className="btn primary big" disabled={busy || !title.trim()} onClick={() => void create()}>{busy ? 'Saving…' : 'Save to Guitarbook'}</button>}
      />
    </div>
  )
}
