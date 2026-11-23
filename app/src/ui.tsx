import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KEY_ROOTS, STATUSES, collectTags, mergeTags, suggestTags, type KeyMode, type ResourceSite, type Status } from '@shared'
import { useSongs } from './data'
import songsterrIcon from './assets/songsterr.webp'
import ultimateGuitarIcon from './assets/ultimateguitar.png'

/** Icons for the tab sites (YouTube links use the video thumbnail instead). */
export const SITE_ICONS: Partial<Record<ResourceSite, string>> = { songsterr: songsterrIcon, ultimateguitar: ultimateGuitarIcon }

// ---- icons -----------------------------------------------------------------
const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
export const IconBack = () => <svg {...svg}><path d="M15 5l-7 7 7 7" /></svg>
export const IconPlus = () => <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>
export const IconFilters = () => <svg {...svg}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
export const IconMenu = () => <svg {...svg}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
export const IconPage = () => <svg {...svg} width={20} height={20}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
export const IconX =() => <svg {...svg} width={22} height={22} strokeWidth={2.5}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const IconCircleX = () => <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--tag-chip-bg)" strokeWidth={2} strokeLinecap="round" /></svg>
export const IconChevronDown =() => <svg {...svg} width={14} height={14} strokeWidth={2.5}><path d="M6 9l6 6 6-6" /></svg>
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
export function TagInput({ tags, onChange, label = 'Tags', autoFocus = false, onBlur }: {
  tags: string[]
  onChange: (t: string[]) => void
  label?: string | null
  autoFocus?: boolean
  /** Called when the text box loses focus; `added` says whether that blur added a tag. */
  onBlur?: (added: boolean) => void
}) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false) // Escape hid the list until the next keystroke
  const [active, setActive] = useState(-1) // highlighted suggestion (arrow keys); -1 = none
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const songs = useSongs()
  const allTags = useMemo(() => collectTags(songs ?? []), [songs])
  const suggestions = suggestTags(allTags, tags, text, 50)
  const open = focused && !dismissed && suggestions.length > 0

  useEffect(() => {
    if (active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const add = (raw: string) => {
    const added = raw.trim() !== ''
    if (added) onChange(mergeTags(tags, raw.split(',')))
    setText('')
    setActive(-1)
    return added
  }
  // mousedown with preventDefault, not click: keeps focus in the text box, so its blur doesn't fire mid-edit
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      <div className="tag-box">
        <div className="tag-field" onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus() } }}>
          {tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onMouseDown={keepFocus} onClick={() => onChange(tags.filter((x) => x !== t))}>
                <IconCircleX />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={text}
            placeholder={tags.length ? 'Add a tag' : 'Type a tag and press Enter'}
            autoFocus={autoFocus}
            role="combobox"
            aria-label={label ?? 'Tags'}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            onFocus={() => setFocused(true)}
            onChange={(e) => { setText(e.target.value); setActive(-1); setDismissed(false) }}
            onBlur={() => { setFocused(false); setDismissed(false); onBlur?.(add(text)) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length) {
                e.preventDefault()
                setDismissed(false)
                setActive((i) => (i + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp' && suggestions.length) {
                e.preventDefault()
                setDismissed(false)
                setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
              } else if (e.key === 'Escape' && open) {
                e.preventDefault()
                setDismissed(true)
                setActive(-1)
              } else if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                add(open && active >= 0 && suggestions[active] ? suggestions[active] : text)
              } else if (e.key === 'Backspace' && text === '' && tags.length) {
                onChange(tags.slice(0, -1)) // like other chip inputs: backspace in an empty box removes the last tag
              }
            }}
          />
        </div>
        {(tags.length > 0 || text) && (
          <button type="button" className="tag-clear" aria-label="Clear all tags" onMouseDown={keepFocus} onClick={() => { setText(''); onChange([]) }}>
            <IconX />
          </button>
        )}
        {open && (
          <ul ref={listRef} className="tag-suggestions" id={listId} role="listbox" aria-label="Existing tags">
            {suggestions.map((t, i) => (
              <li key={t} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : undefined} onMouseDown={(e) => { keepFocus(e); add(t) }}>
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---- in-place editing (Song detail) -----------------------------------------

/**
 * Text that looks like plain text until tapped, then edits in place. Saves on blur or Enter (single-line);
 * Escape puts the saved value back. A required field that is cleared goes back to the saved value.
 */
export function InlineText({ value, onSave, label, placeholder, className = '', multiline = false, required = false, autoFocus = false, onDone }: {
  value: string
  onSave: (v: string) => void
  label: string
  placeholder?: string
  className?: string
  multiline?: boolean
  required?: boolean
  autoFocus?: boolean
  /** Called on blur with the value the field ends up holding (saved, or put back). */
  onDone?: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const cancelled = useRef(false)
  useEffect(() => setDraft(value), [value]) // the saved value changed (here or on another device)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const commit = () => {
    const v = multiline ? draft.trim() : draft.replace(/\s+/g, ' ').trim()
    if (cancelled.current || (required && !v) || v === value) {
      cancelled.current = false
      setDraft(value)
      onDone?.(value)
      return
    }
    onSave(v)
    onDone?.(v)
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`inline-edit ${className}`}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        } else if (e.key === 'Enter' && !multiline) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** A pill that opens a native picker when tapped (the select sits invisibly on top of it). */
export function PillSelect<V extends string>({ value, options, onChange, label, className = '', disabled = false, chevron = true, children }: {
  value: V
  options: { value: V; label: string }[]
  onChange: (v: V) => void
  label: string
  className?: string
  disabled?: boolean
  chevron?: boolean
  children: ReactNode
}) {
  return (
    <label className={`pill pill-select ${className}${disabled ? ' disabled' : ''}`}>
      {children}
      {chevron && !disabled && <IconChevronDown />}
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

// ---- song fields (shared by "new song" and Add link) -------------------------
export interface SongFormValues {
  title: string
  artist: string
  keyRoot: string
  /** '' = not set; shown and treated as major. */
  keyMode: KeyMode | ''
  status: Status
  tags: string[]
  notes: string
}

export function SongFields({ value, onChange }: { value: SongFormValues; onChange: (v: SongFormValues) => void }) {
  const set = <K extends keyof SongFormValues>(k: K, v: SongFormValues[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="stack">
      <Field label="Title">
        <input className="input" required value={value.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label="Artist (optional)">
        <input className="input" value={value.artist} onChange={(e) => set('artist', e.target.value)} />
      </Field>
      <div className="field">
        <span className="field-label">Status</span>
        <Chips label="Status" value={value.status} onChange={(v) => set('status', v)} options={STATUSES} />
      </div>
      <TagInput tags={value.tags} onChange={(t) => set('tags', t)} />
      <div className="row">
        <Field label="Key">
          <select className="input" value={value.keyRoot} onChange={(e) => onChange({ ...value, keyRoot: e.target.value, keyMode: e.target.value ? value.keyMode : '' })}>
            <option value="" aria-label="No key"></option>
            {KEY_ROOTS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Mode">
          <select className="input" value={value.keyMode} disabled={!value.keyRoot} onChange={(e) => set('keyMode', e.target.value as KeyMode | '')}>
            <option value="" aria-label="Not set (major)"></option>
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input" rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

export const emptySongForm: SongFormValues = { title: '', artist: '', keyRoot: '', keyMode: '', status: 'wishlist', tags: [], notes: '' }

/** Form values -> the fields stored on the song. */
export function songFieldsFrom(v: SongFormValues) {
  const artist = v.artist.trim()
  return {
    title: v.title.trim(),
    artist: artist || null,
    keyRoot: v.keyRoot || null,
    // A blank mode is stored as null, which reads as major (format.ts keyText).
    keyMode: v.keyRoot && v.keyMode ? v.keyMode : null,
    status: v.status,
    tags: mergeTags([], v.tags),
    notes: v.notes.trim(),
  }
}

/** SPEC §7: built from the video id at render time, never stored or proxied. */
export function Thumb({ videoId, icon }: { videoId: string | undefined; icon?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (videoId && failed !== videoId) {
    return (
      <span className="thumb">
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(videoId)} />
        <span className="thumb-play"><IconPlay /></span>
      </span>
    )
  }
  if (icon) return <span className="thumb icon"><img src={icon} alt="" /></span>
  return <span className="thumb placeholder"><IconGuitar /></span>
}
