import { useState } from 'react'
import { KEY_ROOTS, SITE_NAMES, STATUSES, isStale, mergeTags, type KeyMode, type Song, type Status } from '@shared'
import type { Timestamp } from 'firebase/firestore'
import { deleteSong, patchSong, recordOpen, setSources, useSettings, useSongs, useUid, type SongDoc, type SourceDoc } from '../data'
import { lastOpenedText, openedText, toDate } from '../format'
import { Field, Header, IconBack, IconDots, IconOut, IconPlus, InlineText, PillSelect, SITE_ICONS, Sheet, TagInput, Thumb } from '../ui'
import { goBack, navigate } from '../router'

const KEY_OPTIONS = [{ value: '', label: 'No key' }, ...KEY_ROOTS.map((k) => ({ value: k as string, label: k }))]
const MODE_OPTIONS: { value: KeyMode; label: string }[] = [{ value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }]

const defaultLabel = (s: SourceDoc) => { try { return new URL(s.url).hostname.replace(/^www\./, '') } catch { return SITE_NAMES[s.site] } }

export function SongDetail({ id }: { id: string }) {
  const songs = useSongs()
  const uid = useUid()
  const { staleDays, showThumbnails } = useSettings()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<SourceDoc | null>(null)
  /** An empty field the user just opened from its "+" button; it closes again if left empty. */
  const [adding, setAdding] = useState<'tags' | 'notes' | null>(null)

  if (songs === null) return <main className="screen"><p className="muted pad">Loading…</p></main>
  const song = songs.find((s) => s.id === id)
  if (!song) {
    return (
      <main className="screen">
        <Header left={<a className="icon-btn" href="#/" aria-label="Back to library"><IconBack /></a>} />
        <p className="muted pad">That song isn't in your library (it may have been deleted).</p>
      </main>
    )
  }

  const now = new Date()
  const save = (patch: Partial<Omit<Song<Timestamp>, 'sourceKeys' | 'matchKey'>>) => patchSong(uid, song, patch)
  const remove = (src: SourceDoc) => {
    if (!window.confirm('Remove this link from the song?')) return
    setSources(uid, song, song.sources.filter((s) => s.id !== src.id))
    setMenuFor(null)
  }
  const removeSong = async () => {
    if (!window.confirm(`Delete "${song.title}" and its open history? This can't be undone.`)) return
    await deleteSong(uid, song.id)
    navigate('/', true)
  }

  return (
    <main className="screen">
      <Header left={<button className="icon-btn" aria-label="Back" onClick={() => goBack('/')}><IconBack /></button>} />
      <div className="pad">
        <h1 className="song-title">
          <InlineText label="Title" value={song.title} required onSave={(title) => save({ title })} />
        </h1>
        <InlineText className="song-artist" label="Artist" placeholder="Add artist" value={song.artist ?? ''} onSave={(a) => save({ artist: a || null })} />
        <p className="muted small last-opened">{lastOpenedText(song.lastOpenedAt, song.openCount, now)}</p>
        <div className="pills">
          <PillSelect<Status> label="Status" className={`pill-${song.status}`} value={song.status} options={STATUSES} onChange={(status) => save({ status })}>
            {STATUSES.find((s) => s.value === song.status)?.label ?? song.status}
          </PillSelect>
        </div>

        {/* Empty Tags, Key and Notes show only a dashed "+ field" button, with no heading. */}
        {song.tags.length > 0 || adding === 'tags' ? (
          <>
            <h2 className="section">Tags</h2>
            <TagInput
              label={null}
              tags={song.tags}
              autoFocus={adding === 'tags'}
              onChange={(t) => { save({ tags: mergeTags([], t) }); if (t.length === 0) setAdding(null) }}
              onBlur={(added) => { if (!added) setAdding(null) }}
            />
          </>
        ) : (
          <button type="button" className="add-field" onClick={() => setAdding('tags')}>+ tags</button>
        )}

        {song.keyRoot ? (
          <>
            <h2 className="section">Key</h2>
            <div className="pills">
              <PillSelect label="Key" className="pill-key" value={song.keyRoot} options={KEY_OPTIONS} onChange={(k) => save(k ? { keyRoot: k } : { keyRoot: null, keyMode: null })}>
                Key of {song.keyRoot}
              </PillSelect>
              <PillSelect<KeyMode> label="Mode" className="pill-key" value={song.keyMode ?? 'major'} options={MODE_OPTIONS} onChange={(keyMode) => save({ keyMode })}>
                {song.keyMode === 'minor' ? 'Minor' : 'Major'}
              </PillSelect>
            </div>
          </>
        ) : (
          <PillSelect label="Key" className="add-field" chevron={false} value="" options={KEY_OPTIONS} onChange={(k) => { if (k) save({ keyRoot: k }) }}>
            + key
          </PillSelect>
        )}

        {song.notes || adding === 'notes' ? (
          <>
            <h2 className="section">Notes</h2>
            <InlineText
              className="notes"
              label="Notes"
              placeholder="Add notes"
              multiline
              autoFocus={adding === 'notes'}
              value={song.notes}
              onSave={(notes) => save({ notes })}
              onDone={(v) => { if (!v) setAdding(null) }}
            />
          </>
        ) : (
          <button type="button" className="add-field" onClick={() => setAdding('notes')}>+ notes</button>
        )}

        <h2 className="section">Links</h2>
        <div className="stack">
          {song.sources.map((src) => {
            const stale = isStale(toDate(src.lastOpenedAt), now, staleDays)
            return (
              <div key={src.id} className="card source">
                <a className="source-link" href={src.url} target="_blank" rel="noopener" onClick={() => recordOpen(uid, song, src.id)}>
                  {showThumbnails && src.site === 'youtube' && src.ytVideoId && <Thumb videoId={src.ytVideoId} />}
                  {SITE_ICONS[src.site] && <img className="site-icon" src={SITE_ICONS[src.site]} width={40} height={40} alt="" />}
                  <div className="source-body">
                    <div className="eyebrow">{SITE_NAMES[src.site]}{src.title && src.label ? ` · ${src.label}` : ''}</div>
                    <div className="source-label">{src.title || src.label || defaultLabel(src)}</div>
                    <div className={`source-opened${stale ? ' stale' : ''}`}>{openedText(src.lastOpenedAt, now)}</div>
                  </div>
                  <IconOut />
                </a>
                <button className="icon-btn" aria-label={`Options for ${src.title || src.label || defaultLabel(src)}`} onClick={() => setMenuFor(src.id)}><IconDots /></button>
              </div>
            )
          })}
          {song.sources.length === 0 && <p className="muted">No links yet.</p>}
        </div>
        <a className="add-link" href={`#/add?song=${song.id}`}><IconPlus /> Add a link</a>

        <button className="btn danger delete-song" type="button" onClick={removeSong}>Delete song</button>
      </div>

      {menuFor && (() => {
        const src = song.sources.find((s) => s.id === menuFor)
        if (!src) return null
        return (
          <Sheet title={src.title || src.label || defaultLabel(src)} onClose={() => setMenuFor(null)}>
            <button className="btn" onClick={() => { setEditing(src); setMenuFor(null) }}>Edit title and label</button>
            <button className="btn danger" onClick={() => remove(src)}>Remove link</button>
            <button className="btn ghost" onClick={() => setMenuFor(null)}>Cancel</button>
          </Sheet>
        )
      })()}
      {editing && <EditSource song={song} source={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

function EditSource({ song, source, onClose }: { song: SongDoc; source: SourceDoc; onClose: () => void }) {
  const uid = useUid()
  const [label, setLabel] = useState(source.label ?? '')
  const [title, setTitle] = useState(source.title ?? '')
  const save = () => {
    setSources(uid, song, song.sources.map((s) => (s.id === source.id ? { ...s, label: label.trim() || null, title: title.trim() || null } : s)))
    onClose()
  }
  return (
    <Sheet title="Edit link" onClose={onClose}>
      <Field label="Link title (optional)"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The page's title" /></Field>
      <Field label="Label (optional)"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Simplified chords" /></Field>
      <button className="btn primary" onClick={save}>Save</button>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
    </Sheet>
  )
}
