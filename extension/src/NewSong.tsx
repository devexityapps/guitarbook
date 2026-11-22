// Popup states 6.3 and 6.4 (extension/SPEC.md): this page isn't saved yet.
import { useState, type ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import { KEY_ROOTS, ROLES, SITE_NAMES, STATUSES, mergeTags, sourceFromParsed, type KeyMode, type ParsedLink, type Role, type Status } from '@shared'
import { createSong, patchSong, type SongDoc } from './data'
import { libraryUrl } from './config'
import { Footer, Header } from './layout'
import { Chips, Field, TagInput } from './ui'

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

/** The roles offered per site, as in the mockups; other sites get all of them. */
function roleOptions(site: ParsedLink['site']): { value: Role; label: string }[] {
  const pick = (values: Role[]) => ROLES.filter((r) => values.includes(r.value))
  if (site === 'youtube') return pick(['lesson', 'backing', 'performance', 'other'])
  if (site === 'ultimateguitar' || site === 'songsterr') return pick(['lesson', 'tab', 'chords', 'other'])
  return ROLES
}

const SHORT_SITE: Record<ParsedLink['site'], string> = { youtube: 'YouTube', ultimateguitar: 'UG', songsterr: 'Songsterr', other: 'Link' }
const roleName = (r: Role) => (ROLES.find((x) => x.value === r)?.label ?? r).toLowerCase()
const linkSummary = (song: SongDoc) => song.sources.map((s) => `${SHORT_SITE[s.site]} ${roleName(s.role)}`).join(', ')

interface Props {
  uid: string
  parsed: ParsedLink
  /** A song with the same title and artist, if there is one. */
  match: SongDoc | null
  initialStatus: Status
  email: string | null
  onSignOut: () => void
  /** Saved: show the saved-song view. */
  onSaved: (song: SongDoc) => void
  /** Shown at the bottom, e.g. the wrong-account hint. */
  hint?: ReactNode
}

export function NewSong({ uid, parsed, match, initialStatus, email, onSignOut, onSaved, hint }: Props) {
  const [mode, setMode] = useState<'match' | 'form'>(match ? 'match' : 'form')
  const [role, setRole] = useState<Role>(parsed.role)
  const [type, setType] = useState<'song' | 'lesson'>(parsed.site === 'other' || parsed.typeGuess === 'lesson' ? 'lesson' : 'song')
  const [title, setTitle] = useState(parsed.titleGuess ?? '')
  const [artist, setArtist] = useState(parsed.artistGuess ?? '')
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<Status>(initialStatus)
  const [tags, setTags] = useState<string[]>(parsed.suggestedTags)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const source = () => sourceFromParsed(parsed, { id: crypto.randomUUID(), role, label: null, now: Timestamp.now() })
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
        { type, title: title.trim(), artist: artist.trim() || null, keyRoot, keyMode, tags: mergeTags([], tags), status },
        source(),
      )
      void chrome.storage.local.set({ [LAST_STATUS_KEY]: status }).catch(() => {})
      return song
    })

  const openLibrary = () => { void chrome.tabs.create({ url: libraryUrl() }); window.close() }
  const header = <Header right={<span>Not saved yet</span>} />

  const roleChips = (
    <section className="section tight">
      <h2 className="eyebrow">This link · {SITE_NAMES[parsed.site]}</h2>
      <Chips label="Role" value={role} onChange={setRole} options={roleOptions(parsed.site)} />
    </section>
  )

  if (mode === 'match' && match) {
    return (
      <div className="popup">
        {header}
        <main className="body">
          <div className="banner warn">
            <div className="banner-title">Already in your library</div>
            <div className="match-song">{match.title}</div>
            <div className="banner-sub">
              {match.artist ? `${match.artist} · ` : ''}{match.sources.length} {match.sources.length === 1 ? 'link' : 'links'} ({linkSummary(match)})
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => setMode('match')}>Add to this song</button>
              <button className="btn" onClick={() => setMode('form')}>New song</button>
            </div>
          </div>
          {roleChips}
          {error && <p className="error small">{error}</p>}
          {hint}
        </main>
        <Footer
          openLabel="Open library"
          onOpen={openLibrary}
          email={email}
          onSignOut={onSignOut}
          primary={<button className="btn primary big" disabled={busy} onClick={() => void attach()}>{busy ? 'Adding…' : `Add to ${match.title}`}</button>}
        />
      </div>
    )
  }

  return (
    <div className="popup">
      {header}
      <main className="body">
        <p className="status-line">Filled in from {where}. Check and save.</p>
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
        {roleChips}
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
