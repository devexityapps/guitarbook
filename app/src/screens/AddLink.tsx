import { useEffect, useMemo, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { SITE_NAMES, findMatchingSong, findSongByKey, mergeTags, parseLink, sourceFromParsed, type ParsedLink } from '@shared'
import { createSong, newSongRef, newSourceId, setSources, useSongs, useUid, type SongDoc } from '../data'
import { Field, Header, IconCheck, SongFields, emptySongForm, songFieldsFrom, type SongFormValues } from '../ui'
import { goBack, navigate, useRoute } from '../router'

function detectedText(p: ParsedLink): string {
  const names = p.titleGuess ? (p.artistGuess ? `${p.artistGuess} / ${p.titleGuess}` : p.titleGuess) : null
  if (p.site === 'other') return 'Website link · not YouTube, Ultimate Guitar or Songsterr'
  return [SITE_NAMES[p.site], names].filter(Boolean).join(' · ')
}

function initialForm(p: ParsedLink): SongFormValues {
  return {
    ...emptySongForm,
    title: p.titleGuess ?? '',
    artist: p.artistGuess ?? '',
    tags: p.suggestedTags,
  }
}

export function AddLink() {
  const songs = useSongs()
  const uid = useUid()
  const { query } = useRoute()
  const targetId = query.get('song')

  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState<'attach' | 'new'>('attach')
  const [form, setForm] = useState<SongFormValues>(emptySongForm)

  const parsed = useMemo(() => parseLink(url), [url])
  const key = parsed?.canonicalKey
  useEffect(() => {
    if (parsed) setForm(initialForm(parsed))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the link itself changes
  }, [key])

  const target = targetId ? songs?.find((s) => s.id === targetId) : undefined
  const duplicate = songs && parsed ? findSongByKey(songs, parsed.canonicalKey) : undefined
  const match = songs && parsed && !target ? findMatchingSong(songs, parsed.titleGuess, parsed.artistGuess) : undefined
  const matchId = match?.id
  useEffect(() => setMode('attach'), [matchId])

  const attachTo: SongDoc | undefined = target ?? (mode === 'attach' ? match : undefined)
  const ready = songs !== null && parsed !== null && !duplicate && (!targetId || target !== undefined)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || !parsed) return
    const now = Timestamp.now()
    const source = sourceFromParsed(parsed, { id: newSourceId(), label, now })
    if (attachTo) {
      setSources(uid, attachTo, [...attachTo.sources, source], { tags: mergeTags(attachTo.tags, parsed.suggestedTags) })
      navigate(`/song/${attachTo.id}`, true)
      return
    }
    if (!form.title.trim()) return
    const ref = newSongRef(uid)
    createSong(uid, ref.id, { ...songFieldsFrom({ ...form, tags: mergeTags(form.tags, parsed.suggestedTags) }), sources: [source] })
    navigate(`/song/${ref.id}`, true)
  }

  return (
    <main className="screen">
      <Header left={<button className="link-btn" type="button" onClick={() => goBack(targetId ? `/song/${targetId}` : '/')}>Cancel</button>} title="Add link" />
      <form className="pad stack" onSubmit={submit}>
        {targetId && songs && !target && <p className="error">That song no longer exists.</p>}
        {target && <p className="muted">Adding to <strong>{target.title}</strong></p>}

        <Field label="Paste a link">
          <input className="input" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>

        {url.trim() && !parsed && <p className="status-line bad">That doesn't look like a web link.</p>}
        {parsed && !duplicate && <p className="status-line good"><IconCheck /> <span>{detectedText(parsed)}</span></p>}

        {duplicate && (
          <div className="panel warn">
            <div className="panel-title">Already saved</div>
            <p className="panel-song">On “{duplicate.title}”</p>
            <p className="muted small">This link is already in your library, so it won't be added again.</p>
            <a className="btn primary" href={`#/song/${duplicate.id}`}>Open that song</a>
          </div>
        )}

        {parsed && !duplicate && match && !target && (
          <div className="panel warn">
            <div className="panel-title">Already in your library</div>
            <p className="panel-song">{match.title}</p>
            <p className="muted small">{match.artist} · {match.sources.length} {match.sources.length === 1 ? 'link' : 'links'}</p>
            <div className="row">
              <button type="button" className={`btn ${mode === 'attach' ? 'primary' : ''}`} onClick={() => setMode('attach')}>Add to this song</button>
              <button type="button" className={`btn ${mode === 'new' ? 'primary' : ''}`} onClick={() => setMode('new')}>New song</button>
            </div>
          </div>
        )}

        {parsed && !duplicate && (
          <>
            <Field label="Label (optional)"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Simplified chords" /></Field>
            {!attachTo && songs !== null && !targetId && (
              <>
                <h2 className="section">New song</h2>
                <SongFields value={form} onChange={setForm} />
              </>
            )}
            <button className="btn primary big" type="submit" disabled={!ready || (!attachTo && !form.title.trim())}>
              {attachTo ? `Add to ${attachTo.title}` : 'Create song'}
            </button>
          </>
        )}
      </form>
    </main>
  )
}
