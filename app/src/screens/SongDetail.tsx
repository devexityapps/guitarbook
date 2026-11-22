import { useState } from 'react'
import { ROLES, SITE_NAMES, isStale, type Role } from '@shared'
import { setSources, useSongs, useUid, type SongDoc, type SourceDoc } from '../data'
import { DEFAULT_STALE_DAYS, keyText, lastOpenedText, openedText, toDate } from '../format'
import { Chips, Field, Header, IconBack, IconDots, IconOut, IconPlus, Sheet, StatusPill } from '../ui'
import { goBack } from '../router'

const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r
const defaultLabel = (s: SourceDoc) => (s.site === 'youtube' && s.role === 'lesson' ? 'Lesson' : roleLabel(s.role))

export function SongDetail({ id }: { id: string }) {
  const songs = useSongs()
  const uid = useUid()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<SourceDoc | null>(null)

  if (songs === null) return <main className="screen"><p className="muted pad">Loading…</p></main>
  const song = songs.find((s) => s.id === id)
  if (!song) {
    return (
      <main className="screen">
        <Header left={<a className="icon-btn mobile-only" href="#/" aria-label="Back to library"><IconBack /></a>} />
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
        left={<button className="icon-btn mobile-only" aria-label="Back" onClick={() => goBack('/')}><IconBack /></button>}
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
            const stale = isStale(toDate(src.lastOpenedAt), now, DEFAULT_STALE_DAYS)
            return (
              <div key={src.id} className="card source">
                <a className="source-link" href={src.url} target="_blank" rel="noopener">
                  <div className="source-body">
                    <div className="eyebrow">{SITE_NAMES[src.site]} · {roleLabel(src.role)}</div>
                    <div className="source-label">{src.label || defaultLabel(src)}</div>
                    <div className={`source-opened${stale ? ' stale' : ''}`}>{openedText(src.lastOpenedAt, now)}</div>
                  </div>
                  <IconOut />
                </a>
                <button className="icon-btn" aria-label={`Options for ${src.label || defaultLabel(src)}`} onClick={() => setMenuFor(src.id)}><IconDots /></button>
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
          <Sheet title={src.label || defaultLabel(src)} onClose={() => setMenuFor(null)}>
            <button className="btn" onClick={() => { setEditing(src); setMenuFor(null) }}>Edit label and role</button>
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
  const [role, setRole] = useState<Role>(source.role)
  const save = () => {
    setSources(uid, song, song.sources.map((s) => (s.id === source.id ? { ...s, label: label.trim() || null, role } : s)))
    onClose()
  }
  return (
    <Sheet title="Edit link" onClose={onClose}>
      <Field label="Label (optional)"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Simplified chords" /></Field>
      <div className="field"><span className="field-label">What is it?</span><Chips label="Role" value={role} onChange={setRole} options={ROLES} /></div>
      <button className="btn primary" onClick={save}>Save</button>
      <button className="btn ghost" onClick={onClose}>Cancel</button>
    </Sheet>
  )
}
