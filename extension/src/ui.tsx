import { useState } from 'react'
import { mergeTags } from '@shared'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function Chips<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip${o.value === value ? ' on' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const commit = () => {
    if (text.trim()) onChange(mergeTags(tags, text.split(',')))
    setText('')
    setAdding(false)
  }
  return (
    <div className="field">
      <span className="field-label">Tags</span>
      <div className="chips">
        {tags.map((t) => (
          <button key={t} type="button" className="chip tag" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            {t} ×
          </button>
        ))}
        {adding ? (
          <input
            className="tag-input"
            autoFocus
            value={text}
            placeholder="tag"
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commit()
              }
              if (e.key === 'Escape') { setText(''); setAdding(false) }
            }}
          />
        ) : (
          <button type="button" className="chip tag add" onClick={() => setAdding(true)}>+ Add</button>
        )}
      </div>
    </div>
  )
}
