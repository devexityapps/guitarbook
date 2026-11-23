import { useState } from 'react'
import { KEY_ROOTS, SITE_NAMES, STATUSES, chartTitle, isChart, isStale, mergeTags, type KeyMode, type Song, type Status } from '@shared'
import type { Timestamp } from 'firebase/firestore'
import { deleteSong, patchSong, recordOpen, setSources, useSettings, useSongs, useUid, type SongDoc, type SourceDoc } from '../data'
import { lastOpenedText, openedText, toDate } from '../format'
import { Field, Header, IconBack, IconDots, IconOut, IconPage, IconPlus, InlineText, PillSelect, SITE_ICONS, Sheet, TagInput, Thumb } from '../ui'
import { goBack, navigate } from '../router'
import { chartOpensInNewTab, chartPath } from './Chart'

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
  const [addMenuOpen, setAddMenuOpen] = useState(false)

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
  /** A resource's display name: a chart's title (else the song's title and artist), or a link's title, label or host. */
  const name = (src: SourceDoc) => (isChart(src) ? chartTitle(src, song) : src.title || src.label || defaultLabel(src))
  const remove = (src: SourceDoc) => {
    if (!window.confirm(isChart(src) ? 'Remove this chart from the song? Its text will be deleted.' : 'Remove this link from the song?')) return
    setSources(uid, song, song.sources.filter((s) => s.id !== src.id))
    setMenuFor(null)
  }
  /** The Link / Chart menu under "+ Add" (aligned to its right end) or "+ resource" (aligned to its start). */
  const addMenu = (align: 'start' | 'end') => (
    <>
      <div className="menu-backdrop" onClick={() => setAddMenuOpen(false)} />
      <div className={`top-menu inline-menu${align === 'start' ? ' start' : ''}`} id="add-resource-menu" role="menu" aria-label="Add a resource" onKeyDown={(e) => { if (e.key === 'Escape') setAddMenuOpen(false) }}>
        <a role="menuitem" href={`#/add?song=${song.id}`}>Link</a>
        <a role="menuitem" href={`#${chartPath(song.id, 'new')}`}>Chart</a>
      </div>
    </>
  )
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
          <button type="button" className="add-field" onClick={() => setAdding('tags')}>+ tag</button>
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
          <button type="button" className="add-field" onClick={() => setAdding('notes')}>+ note</button>
        )}

        {/* Like Tags, Key and Notes: with no resources, just a dashed "+ resource" button that opens the Link / Chart menu. */}
        {song.sources.length === 0 ? (
          <div className="add-resource">
            <button type="button" className="add-field" aria-haspopup="menu" aria-expanded={addMenuOpen} aria-controls="add-resource-menu" onClick={() => setAddMenuOpen((o) => !o)}>
              + resource
            </button>
            {addMenuOpen && addMenu('start')}
          </div>
        ) : (
          <>
            <div className="section-row">
              <h2 className="section">Resources</h2>
              <div className="add-resource">
                <button type="button" className="add-link" aria-haspopup="menu" aria-expanded={addMenuOpen} aria-controls="add-resource-menu" onClick={() => setAddMenuOpen((o) => !o)}>
                  <IconPlus /> Add
                </button>
                {addMenuOpen && addMenu('end')}
              </div>
            </div>
            <div className="stack">
              {song.sources.map((src) => {
                const stale = isStale(toDate(src.lastOpenedAt), now, staleDays)
                const chart = isChart(src)
                // Links and charts both open in a new tab and log the open (SPEC §6, §4.8); in the installed app a chart opens in place.
                const newTab = !chart || chartOpensInNewTab()
                return (
                  <div key={src.id} className="card source">
                    <a
                      className="source-link"
                      href={chart ? `#${chartPath(song.id, src.id)}` : src.url}
                      target={newTab ? '_blank' : undefined}
                      rel="noopener"
                      onClick={() => recordOpen(uid, song, src.id)}
                    >
                      {showThumbnails && src.site === 'youtube' && src.ytVideoId && <Thumb videoId={src.ytVideoId} />}
                      {SITE_ICONS[src.site] && <img className="site-icon" src={SITE_ICONS[src.site]} width={40} height={40} alt="" />}
                      <div className="source-body">
                        <div className="eyebrow">{SITE_NAMES[src.site]}{src.title && src.label ? ` · ${src.label}` : ''}</div>
                        <div className="source-label">{name(src)}</div>
                        <div className={`source-opened${stale ? ' stale' : ''}`}>{openedText(src.lastOpenedAt, now)}</div>
                      </div>
                      {chart ? <IconPage /> : <IconOut />}
                    </a>
                    <button className="icon-btn" aria-label={`Options for ${name(src)}`} onClick={() => setMenuFor(src.id)}><IconDots /></button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <button className="btn danger delete-song" type="button" onClick={removeSong}>Delete song</button>
      </div>

      {menuFor && (() => {
        const src = song.sources.find((s) => s.id === menuFor)
        if (!src) return null
        return (
          <Sheet title={name(src)} onClose={() => setMenuFor(null)}>
            {isChart(src) ? (
              <>
                <button className="btn" onClick={() => navigate(`${chartPath(song.id, src.id)}/edit`)}>Edit chart</button>
                <button className="btn danger" onClick={() => remove(src)}>Remove chart</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => { setEditing(src); setMenuFor(null) }}>Edit title and label</button>
                <button className="btn danger" onClick={() => remove(src)}>Remove link</button>
              </>
            )}
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
