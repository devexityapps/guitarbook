// Popup state 6.2 (extension/SPEC.md): this page is already saved on a song.
import { useEffect, useRef, useState } from 'react'
import { KEY_ROOTS, SITE_NAMES, STATUSES, mergeTags, type KeyMode, type Status } from '@shared'
import { countOpens, deleteSong, patchSong, patchSongNow, recordOpen, removeSource, type SongDoc, type SongPatch, type SourceDoc } from './data'
import { openedText, timesText } from './format'
import { songUrl } from './config'
import { Footer, Header } from './layout'
import { Field, TagInput } from './ui'

interface Form { title: string; artist: string; key: string; status: Status; tags: string[]; linkTitle: string }

const keyValue = (root: string | null, mode: KeyMode | null) => (root ? `${root}|${mode ?? 'major'}` : '')
const KEY_OPTIONS = KEY_ROOTS.flatMap((r) => (['major', 'minor'] as const).map((m) => ({ value: `${r}|${m}`, label: `${r} ${m}` })))

const formOf = (song: SongDoc, src: SourceDoc | undefined): Form => ({
  title: song.title,
  artist: song.artist ?? '',
  key: keyValue(song.keyRoot, song.keyMode),
  status: song.status,
  tags: song.tags,
  linkTitle: src?.title ?? '',
})

/** What differs between the form and the saved song; null when nothing does. Only these fields are ever written. */
function diff(f: Form, song: SongDoc, canonicalKey: string): SongPatch | null {
  const patch: SongPatch = {}
  const title = f.title.trim()
  if (title && title !== song.title) patch.title = title
  const artist = f.artist.trim() || null
  if (artist !== song.artist) patch.artist = artist
  const [root, mode] = f.key ? (f.key.split('|') as [string, KeyMode]) : [null, null]
  if (root !== song.keyRoot || mode !== song.keyMode) { patch.keyRoot = root; patch.keyMode = mode }
  if (f.status !== song.status) patch.status = f.status
  const tags = mergeTags([], f.tags)
  if (JSON.stringify(tags) !== JSON.stringify(song.tags)) patch.tags = tags
  const src = song.sources.find((s) => s.canonicalKey === canonicalKey)
  const linkTitle = f.linkTitle.trim()
  if (src && (linkTitle !== (src.title ?? ''))) {
    patch.sources = song.sources.map((s) => (s.id === src.id ? { ...s, title: linkTitle || null } : s))
  }
  return Object.keys(patch).length ? patch : null
}

type Save = 'idle' | 'saving' | 'saved' | { error: string }

export function SavedSong({ uid, initial, canonicalKey, email, onSignOut, onChanged }: {
  uid: string
  initial: SongDoc
  canonicalKey: string
  email: string | null
  onSignOut: () => void
  /** The link or the song is gone: look this page up again. */
  onChanged: () => void
}) {
  const [song, setSong] = useState(initial)
  const songRef = useRef(initial)
  const src = song.sources.find((s) => s.canonicalKey === canonicalKey)
  const [form, setForm] = useState(() => formOf(initial, initial.sources.find((s) => s.canonicalKey === canonicalKey)))
  const formRef = useRef(form)
  const [save, setSave] = useState<Save>('idle')
  const [opens, setOpens] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const writing = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const now = new Date()

  useEffect(() => {
    if (!src) return
    countOpens(uid, src.id).then(setOpens, () => setOpens(null))
  }, [uid, src?.id])

  const setLocal = (next: SongDoc) => { songRef.current = next; setSong(next) }

  /** Writes whatever differs, repeating if the form changed meanwhile. */
  const flush = async () => {
    if (writing.current) return
    writing.current = true
    try {
      for (;;) {
        const patch = diff(formRef.current, songRef.current, canonicalKey)
        if (!patch) break
        setSave('saving')
        setLocal(await patchSong(uid, songRef.current, patch))
        setSave('saved')
      }
    } catch (err) {
      setSave({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      writing.current = false
    }
  }

  const change = (next: Form) => {
    formRef.current = next
    setForm(next)
    setSave('idle')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 600)
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => change({ ...form, [k]: v })

  // The popup closes as soon as the user clicks elsewhere: write pending edits right away.
  useEffect(() => {
    const flushNow = () => {
      clearTimeout(timer.current)
      const patch = diff(formRef.current, songRef.current, canonicalKey)
      if (patch) patchSongNow(uid, songRef.current, patch)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flushNow() }
    window.addEventListener('pagehide', flushNow)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [uid, canonicalKey])

  const opened = (sourceId: string) => {
    setLocal(recordOpen(uid, songRef.current, sourceId))
    if (sourceId === src?.id) setOpens((n) => (n === null ? n : n + 1))
  }

  const remove = async () => {
    if (!src) return
    const only = songRef.current.sources.length === 1
    const ok = window.confirm(only ? "That's the song's only link. Delete the song too? This can't be undone." : 'Remove this link from the song?')
    if (!ok) return
    setError(null)
    try {
      clearTimeout(timer.current)
      await flush()
      if (only) await deleteSong(uid, songRef.current.id)
      else await removeSource(uid, songRef.current, src.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const others = song.sources.filter((s) => s.id !== src?.id)
  const indicator =
    save === 'saving' ? <span className="save">Saving…</span>
    : save === 'saved' ? <span className="save ok">✓ Saved</span>
    : null

  return (
    <div className="popup">
      <Header right={indicator} />
      <main className="body">
        <div className="banner">
          <div className="banner-title">Saved in {song.title}</div>
          {src && (
            <div className="banner-sub">
              This link: {openedText(src.lastOpenedAt, now)}
              {opens !== null && src.lastOpenedAt ? ` · ${timesText(opens)}` : ''}
            </div>
          )}
        </div>

        {src && (
          <section className="section first">
            <h2 className="eyebrow">This link · {SITE_NAMES[src.site]}</h2>
            <Field label="Link title">
              <input className="input" value={form.linkTitle} placeholder="The page's title" onChange={(e) => set('linkTitle', e.target.value)} />
            </Field>
            <div className="actions">
              <button className="link danger" onClick={() => void remove()}>Remove link</button>
            </div>
          </section>
        )}

        <section className={src ? 'section' : 'section first'}>
          <h2 className="eyebrow">Song</h2>
          <div className="stack">
            <Field label="Title"><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
            <Field label="Artist"><input className="input" value={form.artist} onChange={(e) => set('artist', e.target.value)} /></Field>
            <div className="row">
              <Field label="Key">
                <select className="input" value={form.key} onChange={(e) => set('key', e.target.value)}>
                  <option value="">None</option>
                  {KEY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as Status)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            </div>
            <TagInput tags={form.tags} onChange={(t) => set('tags', t)} />
          </div>
        </section>

        {others.length > 0 && (
          <section className="section">
            <h2 className="eyebrow">Other links on this song</h2>
            <div className="others">
              {others.map((o) => (
                <button key={o.id} className="other" onClick={() => { void chrome.tabs.create({ url: o.url }); opened(o.id) }}>
                  <span className="other-main">{SITE_NAMES[o.site]}{o.title || o.label ? ` · ${o.title || o.label}` : ""}</span>
                  <span className="other-sub">{openedText(o.lastOpenedAt, now)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {typeof save === 'object' && <p className="error small">Couldn't save: {save.error} Your changes are still here; they'll be retried when you edit again.</p>}
        {error && <p className="error small">{error}</p>}
      </main>
      <Footer
        openLabel="Open in library ↗"
        onOpen={() => { void chrome.tabs.create({ url: songUrl(song.id) }); window.close() }}
        email={email}
        onSignOut={onSignOut}
      />
    </div>
  )
}
