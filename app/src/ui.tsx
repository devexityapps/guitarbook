import { useState, type ReactNode } from 'react'
import { KEY_ROOTS, STATUSES, mergeTags, type KeyMode, type SongType, type Status } from '@shared'

// ---- icons -----------------------------------------------------------------
const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
export const IconBack = () => <svg {...svg}><path d="M15 5l-7 7 7 7" /></svg>
export const IconPlus = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>
export const IconOut = () => <svg {...svg} width={20} height={20}><path d="M7 17L17 7M8 7h9v9" /></svg>
export const IconCheck = () => <svg {...svg} width={20} height={20}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
export const IconDots = () => <svg {...svg}><circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" /></svg>
export const IconSearch = () => <svg {...svg} width={22} height={22}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
export const IconPlay = () => <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
export const IconGuitar = () => <svg {...svg} width={18} height={18}><path d="M14.5 9.5l5-5M17 3l4 4M10.5 10.5a3.5 3.5 0 10-4.2 5.2 3 3 0 004 4 3.5 3.5 0 000-9z" /></svg>

// ---- small pieces ----------------------------------------------------------
export function Header({ left, title, right }: { left?: ReactNode; title?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      {title && <h1 className="topbar-title">{title}</h1>}
      <div className="topbar-side end">{right}</div>
    </header>
  )
}

export function StatusPill({ status }: { status: Status }) {
  const label = STATUSES.find((s) => s.value === status)?.label ?? status
  return <span className={`pill pill-${status}`}>{label}</span>
}

export function Chips<V extends string>({ options, value, onChange, label }: {
  options: { value: V; label: string }[]
  value: V | null
  onChange: (v: V) => void
  label: string
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`chip${o.value === value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ---- tags ------------------------------------------------------------------
export function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState('')
  const commit = () => {
    if (text.trim()) onChange(mergeTags(tags, text.split(',')))
    setText('')
  }
  return (
    <div className="field">
      <span className="field-label">Tags</span>
      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <button key={t} type="button" className="chip tag" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              {t} ×
            </button>
          ))}
        </div>
      )}
      <input
        className="input"
        value={text}
        placeholder="Add a tag, press Enter"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}

// ---- song fields (shared by "new song" and "edit") ---------------------------
export interface SongFormValues {
  type: SongType
  title: string
  artist: string
  keyRoot: string
  keyMode: KeyMode
  status: Status
  tags: string[]
  notes: string
}

export function SongFields({ value, onChange }: { value: SongFormValues; onChange: (v: SongFormValues) => void }) {
  const set = <K extends keyof SongFormValues>(k: K, v: SongFormValues[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="stack">
      <div className="field">
        <span className="field-label">Type</span>
        <Chips label="Type" value={value.type} onChange={(v) => set('type', v)} options={[{ value: 'song', label: 'Song' }, { value: 'lesson', label: 'Lesson' }]} />
      </div>
      <Field label="Title">
        <input className="input" required value={value.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label="Artist (optional)">
        <input className="input" value={value.artist} onChange={(e) => set('artist', e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Key">
          <select className="input" value={value.keyRoot} onChange={(e) => set('keyRoot', e.target.value)}>
            <option value="">None</option>
            {KEY_ROOTS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Mode">
          <select className="input" value={value.keyMode} disabled={!value.keyRoot} onChange={(e) => set('keyMode', e.target.value as KeyMode)}>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Status</span>
        <Chips label="Status" value={value.status} onChange={(v) => set('status', v)} options={STATUSES} />
      </div>
      <TagInput tags={value.tags} onChange={(t) => set('tags', t)} />
      <Field label="Notes">
        <textarea className="input" rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

export const emptySongForm: SongFormValues = { type: 'song', title: '', artist: '', keyRoot: '', keyMode: 'major', status: 'wishlist', tags: [], notes: '' }

/** Form values -> the fields stored on the song. */
export function songFieldsFrom(v: SongFormValues) {
  const artist = v.artist.trim()
  return {
    type: v.type,
    title: v.title.trim(),
    artist: artist || null,
    keyRoot: v.keyRoot || null,
    keyMode: v.keyRoot ? v.keyMode : null,
    status: v.status,
    tags: mergeTags([], v.tags),
    notes: v.notes.trim(),
  }
}
