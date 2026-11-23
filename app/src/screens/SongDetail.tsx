import { useState } from 'react'
import { SITE_NAMES, isStale } from '@shared'
import { recordOpen, setSources, useSettings, useSongs, useUid, type SongDoc, type SourceDoc } from '../data'
import { keyText, lastOpenedText, openedText, toDate } from '../format'
import { Field, Header, IconBack, IconDots, IconOut, IconPlus, Sheet, StatusPill, Thumb } from '../ui'
import { goBack } from '../router'

const defaultLabel = (s: SourceDoc) => { try { return new URL(s.url).hostname.replace(/^www\./, '') } catch { return SITE_NAMES[s.site] } }

export function SongDetail({ id }: { id: string }) {
  const songs = useSongs()
  const uid = useUid()
  const { staleDays, showThumbnails } = useSettings()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<SourceDoc | null>(null)

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
  const key = keyText(song.keyRoot, song.keyMode)
  const remove = (src: SourceDoc) => {
    if (!window.confirm('Remove this link from the song?')) return
    setSources(uid, song, song.sources.filter((s) => s.id !== src.id))
    setMenuFor(null)
  }

  return (
    <main className="screen">
      <Header
        left={<button className="icon-btn" aria-label="Back" onClick={() => goBack('/')}><IconBack /></button>}
        right={<a className="link-btn" href={`#/song/${song.id}/edit`}>Edit</a>}
      />
      <div className="pad">
        <h1 className="song-title">{song.title}</h1>
        {song.artist ? <p className="song-artist">{song.artist}</p> : song.type === 'lesson' && <p className="song-artist">Lesson</p>}
        <div className="pills">
          {key && <span className="pill pill-key">Key of {song.keyMode === 'minor' ? `${song.keyRoot} minor` : song.keyRoot}</span>}
          <StatusPill status={song.status} />
        </div>
        <p className="muted small">{lastOpenedText(song.lastOpenedAt, song.openCount, now)}</p>

        <h2 className="section">Links</h2>
        <div className="stack">
          {song.sources.map((src) => {
            const stale = isStale(toDate(src.lastOpenedAt), now, staleDays)
            return (
              <div key={src.id} className="card source">
                <a className="source-link" href={src.url} target="_blank" rel="noopener" onClick={() => recordOpen(uid, song, src.id)}>
                  {showThumbnails && src.site === 'youtube' && src.ytVideoId && <Thumb videoId={src.ytVideoId} />}
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

        {song.tags.length > 0 && (
          <>
            <h2 className="section">Tags</h2>
            <div className="chips">{song.tags.map((t) => <span key={t} className="chip tag static">{t}</span>)}</div>
          </>
        )}
        {song.notes && (
          <>
            <h2 className="section">Notes</h2>
            <p className="notes">{song.notes}</p>
          </>
        )}
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
