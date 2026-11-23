// Extension SPEC §6.6: the one song field when saving a text file as a chart.
import { useId, useState } from 'react'
import { suggestSongs } from '@shared'
import type { SongDoc } from './data'
import { songUrl } from './config'

/**
 * §6.6's one song field: type to pick an existing song from the suggestions, or type a new song's title. When the
 * box holds an existing song's title, an icon opens that song in the app.
 */
export function SongPicker({ songs, value, picked, onType, onPick }: {
  songs: SongDoc[]
  value: string
  /** The existing song the chart will be added to, or null for a new song. */
  picked: SongDoc | null
  onType: (v: string) => void
  onPick: (s: SongDoc) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  // Nothing to offer once the box already names the picked song.
  const suggestions = picked && picked.title === value ? [] : suggestSongs(songs, value)
  const showList = open && suggestions.length > 0
  const pick = (s: SongDoc) => { onPick(s); setOpen(false); setActive(-1) }

  return (
    <div className="field">
      <span className="field-label">Song</span>
      <div className="song-picker">
        <input
          className="input"
          value={value}
          placeholder="Pick a song or type a new title"
          role="combobox"
          aria-label="Song"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { onType(e.target.value); setOpen(true); setActive(-1) }}
          onKeyDown={(e) => {
            if (!showList) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)) }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]!) }
            else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
          }}
        />
        {picked && (
          <a className="song-open" href={songUrl(picked.id)} target="_blank" rel="noopener" title={`Open ${picked.title} in Guitarbook`} aria-label={`Open ${picked.title} in Guitarbook`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9" /></svg>
          </a>
        )}
        {showList && (
          <ul className="song-suggestions" id={listId} role="listbox" aria-label="Your songs">
            {suggestions.map((s, i) => (
              // mousedown, not click: keeps focus in the box, so its blur doesn't close the list first
              <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : undefined} onMouseDown={(e) => { e.preventDefault(); pick(s) }}>
                <span className="song-suggestion-title">{s.title}</span>
                {s.artist && <span className="muted small">{s.artist}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="hint">{picked ? `Adds the chart to this song${picked.artist ? ` by ${picked.artist}` : ''}.` : value.trim() ? 'Creates a new song with this title.' : 'Type to find one of your songs.'}</span>
    </div>
  )
}

