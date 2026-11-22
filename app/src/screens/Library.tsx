import { useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import {
  KEY_ROOTS, NO_FILTERS, SORTS, STATUSES, activeFilterCount, collectTags, filterSongs, isStale, sortSongs,
  type Filters, type Site, type SongType, type SortKey,
} from '@shared'
import { auth } from '../firebase'
import { useSettings, useSongs, type SongDoc } from '../data'
import { keyText, sinceOpened, toDate } from '../format'
import { Chips, IconGuitar, IconPlay, IconPlus, IconSearch, Sheet, StatusPill } from '../ui'

const SORT_KEY = 'guitarbook.sort'

function loadSort(): SortKey {
  try {
    const v = window.localStorage.getItem(SORT_KEY)
    if (SORTS.some((s) => s.value === v)) return v as SortKey
  } catch {
    /* storage unavailable (private window, blocked): use the default */
  }
  return 'untouched'
}

function saveSort(sort: SortKey) {
  try {
    window.localStorage.setItem(SORT_KEY, sort)
  } catch {
    /* ignore */
  }
}

const SITE_SHORT: { site: Site; label: string }[] = [
  { site: 'youtube', label: 'YouTube' },
  { site: 'ultimateguitar', label: 'UG' },
  { site: 'songsterr', label: 'Songsterr' },
]

/** First YouTube source with a video id (SPEC §4.2); playlist-only links have none. */
const thumbVideoId = (song: SongDoc) => song.sources.find((s) => s.site === 'youtube' && s.ytVideoId)?.ytVideoId

/** SPEC §7: built from the video id at render time, never stored or proxied. */
function Thumb({ videoId }: { videoId: string | undefined }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (videoId && failed !== videoId) {
    return (
      <span className="thumb">
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(videoId)} />
        <span className="thumb-play"><IconPlay /></span>
      </span>
    )
  }
  return <span className="thumb placeholder"><IconGuitar /></span>
}

function Row({ song, showThumb, staleDays, now }: { song: SongDoc; showThumb: boolean; staleDays: number; now: Date }) {
  const sites = SITE_SHORT.filter((s) => song.sources.some((src) => src.site === s.site)).map((s) => s.label)
  const sub = [song.artist ?? (song.type === 'lesson' ? 'Lesson' : null), keyText(song.keyRoot, song.keyMode)].filter(Boolean).join(' · ')
  const since = sinceOpened(song.lastOpenedAt, now)
  const stale = isStale(toDate(song.lastOpenedAt), now, staleDays)
  return (
    <li>
      <a className="row-link" href={`#/song/${song.id}`}>
        {showThumb && <Thumb videoId={thumbVideoId(song)} />}
        <div className="row-main">
          <div className="row-title">{song.title}</div>
          {sub && <div className="row-sub">{sub}</div>}
          <div className="row-meta">
            <StatusPill status={song.status} />
            {sites.length > 0 && <span className="row-sites">{sites.join(' · ')}</span>}
          </div>
        </div>
        <div className={`row-since${stale ? ' stale' : ''}`}>
          <div className="since-big">{since.big}</div>
          <div className="since-small">{since.small}</div>
        </div>
      </a>
    </li>
  )
}

export function Library() {
  const songs = useSongs()
  const { staleDays, showThumbnails } = useSettings()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>(loadSort)
  const [sheet, setSheet] = useState<'tags' | 'more' | null>(null)

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const all = songs ?? []
  const shown = useMemo(() => sortSongs(filterSongs(all, filters), sort), [all, filters, sort])
  const allTags = useMemo(() => collectTags(all), [all])
  const roots = useMemo(() => KEY_ROOTS.filter((k) => all.some((s) => s.keyRoot === k)), [all])
  const now = new Date()

  const filtered = filters.query.trim() !== '' || filters.status !== null || filters.tags.length > 0 || activeFilterCount(filters, 'more') > 0
  const tagCount = activeFilterCount(filters, 'tags')
  const moreCount = activeFilterCount(filters, 'more')

  const statusOptions = [{ value: 'all' as const, label: 'All' }, ...STATUSES.filter((s) => s.value !== 'wishlist' && s.value !== 'shelved'), STATUSES[0]!, STATUSES[3]!]

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="big-title">Library</h1>
        <button className="link-btn" onClick={() => signOut(auth)}>Sign out</button>
      </header>

      {songs === null ? (
        <p className="muted pad">Loading…</p>
      ) : all.length === 0 ? (
        <div className="empty">
          <p className="muted">Nothing here yet. Paste a link to a song or lesson to start your library.</p>
          <a className="btn primary" href="#/add">Add link</a>
        </div>
      ) : (
        <>
          <div className="pad">
            <label className="search">
              <IconSearch />
              <input type="search" aria-label="Search songs, artists, tags" placeholder="Search songs, artists, tags" value={filters.query} onChange={(e) => set({ query: e.target.value })} />
            </label>
          </div>

          <div className="chip-scroll" role="group" aria-label="Filters">
            {statusOptions.map((o) => {
              const on = o.value === 'all' ? filters.status === null : filters.status === o.value
              return (
                <button key={o.value} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ status: o.value === 'all' ? null : o.value })}>
                  {o.label}
                </button>
              )
            })}
            <button type="button" className={`chip${tagCount ? ' on-soft' : ''}`} onClick={() => setSheet('tags')}>Tags{tagCount ? ` · ${tagCount}` : ''}</button>
            <button type="button" className={`chip${moreCount ? ' on-soft' : ''}`} onClick={() => setSheet('more')}>More filters{moreCount ? ` · ${moreCount}` : ''}</button>
          </div>

          <div className="count-line">
            <span className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? 'item' : 'items'}</span>
            <label className="sort">
              <span className="sr-only">Sort by</span>
              <select value={sort} onChange={(e) => { const v = e.target.value as SortKey; setSort(v); saveSort(v) }}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              <p className="muted">Nothing matches these filters.</p>
              {filtered && <button className="btn" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}
            </div>
          ) : (
            <ul className="list">
              {shown.map((s) => <Row key={s.id} song={s} showThumb={showThumbnails} staleDays={staleDays} now={now} />)}
            </ul>
          )}
        </>
      )}

      <a className="fab" href="#/add"><IconPlus /> Add link</a>

      {sheet === 'tags' && (
        <Sheet title="Filter by tags" onClose={() => setSheet(null)}>
          {allTags.length === 0 ? (
            <p className="muted">No tags yet. Add tags when you create or edit a song.</p>
          ) : (
            <>
              <p className="muted small">Songs must have all the tags you pick.</p>
              <div className="chips">
                {allTags.map((t) => {
                  const on = filters.tags.some((x) => x.toLowerCase() === t.toLowerCase())
                  return (
                    <button key={t} type="button" aria-pressed={on} className={`chip tag${on ? ' on' : ''}`} onClick={() => set({ tags: on ? filters.tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...filters.tags, t] })}>
                      {t}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          <div className="row">
            <button className="btn" disabled={!tagCount} onClick={() => set({ tags: [] })}>Clear</button>
            <button className="btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </Sheet>
      )}

      {sheet === 'more' && (
        <Sheet title="More filters" onClose={() => setSheet(null)}>
          <div className="field">
            <span className="field-label">Site</span>
            <Chips<'any' | Site> label="Site" value={filters.site ?? 'any'} onChange={(v) => set({ site: v === 'any' ? null : v })} options={[{ value: 'any', label: 'Any' }, { value: 'youtube', label: 'YouTube' }, { value: 'ultimateguitar', label: 'UG' }, { value: 'songsterr', label: 'Songsterr' }]} />
          </div>
          <div className="field">
            <span className="field-label">Type</span>
            <Chips<'any' | SongType> label="Type" value={filters.type ?? 'any'} onChange={(v) => set({ type: v === 'any' ? null : v })} options={[{ value: 'any', label: 'Any' }, { value: 'song', label: 'Songs' }, { value: 'lesson', label: 'Lessons' }]} />
          </div>
          <label className="field">
            <span className="field-label">Key</span>
            <select className="input" value={filters.keyRoot ?? ''} onChange={(e) => set({ keyRoot: e.target.value || null })}>
              <option value="">Any key</option>
              {roots.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <div className="row">
            <button className="btn" disabled={!moreCount} onClick={() => set({ site: null, type: null, keyRoot: null })}>Clear</button>
            <button className="btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
