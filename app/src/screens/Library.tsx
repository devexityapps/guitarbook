import { useEffect, useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import {
  KEY_ROOTS, NO_FILTERS, SORTS, STATUSES, activeFilterCount, collectTags, filterSongs, isStale, sortSongs,
  type Filters, type Site, type SortKey,
} from '@shared'
import { auth } from '../firebase'
import { useSettings, useSongs, type SongDoc } from '../data'
import { keyText, sinceOpened, toDate } from '../format'
import { Chips, IconPlus, IconSearch, Sheet, SITE_ICONS, StatusPill, Thumb } from '../ui'

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

/** A song whose links are all on one tab site (Songsterr or Ultimate Guitar) gets that site's icon in place of the placeholder. */
function siteIcon(song: SongDoc): string | undefined {
  const site = song.sources[0]?.site
  return site && song.sources.every((s) => s.site === site) ? SITE_ICONS[site] : undefined
}


function Row({ song, showThumb, staleDays, now }: { song: SongDoc; showThumb: boolean; staleDays: number; now: Date }) {
  const sites = SITE_SHORT.filter((s) => song.sources.some((src) => src.site === s.site)).map((s) => s.label)
  const sub = [song.artist, keyText(song.keyRoot, song.keyMode)].filter(Boolean).join(' · ')
  const since = sinceOpened(song.lastOpenedAt, now)
  const stale = isStale(toDate(song.lastOpenedAt), now, staleDays)
  return (
    <li>
      <a className="row-link" href={`#/song/${song.id}`}>
        {showThumb && <Thumb videoId={thumbVideoId(song)} icon={siteIcon(song)} />}
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
  const [sheet, setSheet] = useState<'status' | 'tags' | 'site' | 'key' | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    if (!addOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen])

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const all = songs ?? []
  const shown = useMemo(() => sortSongs(filterSongs(all, filters), sort), [all, filters, sort])
  const allTags = useMemo(() => collectTags(all), [all])
  const roots = useMemo(() => KEY_ROOTS.filter((k) => all.some((s) => s.keyRoot === k)), [all])
  const now = new Date()

  const statusCount = activeFilterCount(filters, 'status')
  const tagCount = activeFilterCount(filters, 'tags')
  const siteLabel = SITE_SHORT.find((s) => s.site === filters.site)?.label
  const filtered = filters.query.trim() !== '' || statusCount > 0 || tagCount > 0 || filters.site !== null || filters.keyRoot !== null

  // Order in the status sheet (SPEC §4.2): the in-progress statuses, then Wishlist.
  const statusOrder = ['learning', 'polishing', 'canplay', 'wishlist'] as const
  const statusOptions = statusOrder.map((v) => STATUSES.find((s) => s.value === v)!)

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
            <button type="button" className={`chip${statusCount ? ' on-soft' : ''}`} onClick={() => setSheet('status')}>Status{statusCount ? ` · ${statusCount}` : ''}</button>
            <button type="button" className={`chip${tagCount ? ' on-soft' : ''}`} onClick={() => setSheet('tags')}>Tags{tagCount ? ` · ${tagCount}` : ''}</button>
            <button type="button" className={`chip${filters.site ? ' on-soft' : ''}`} onClick={() => setSheet('site')}>Site{siteLabel ? ` · ${siteLabel}` : ''}</button>
            <button type="button" className={`chip${filters.keyRoot ? ' on-soft' : ''}`} onClick={() => setSheet('key')}>Key{filters.keyRoot ? ` · ${filters.keyRoot}` : ''}</button>
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

      {addOpen && <div className="add-backdrop" onClick={() => setAddOpen(false)} />}
      {addOpen && (
        <div className="add-menu" id="add-menu" role="menu" aria-label="Add">
          <a role="menuitem" href="#/new">Song</a>
          <a role="menuitem" href="#/add">Link</a>
        </div>
      )}
      <button type="button" className={`fab${addOpen ? ' open' : ''}`} aria-label="Add" aria-haspopup="menu" aria-expanded={addOpen} aria-controls="add-menu" onClick={() => setAddOpen((o) => !o)}><IconPlus /></button>

      {sheet === 'status' && (
        <Sheet title="Filter by status" onClose={() => setSheet(null)}>
          <p className="muted small">Songs with any of the statuses you pick.</p>
          <div className="chips">
            {statusOptions.map((o) => {
              const on = filters.statuses.includes(o.value)
              return (
                <button key={o.value} type="button" aria-pressed={on} className={`chip tag${on ? ' on' : ''}`} onClick={() => set({ statuses: on ? filters.statuses.filter((x) => x !== o.value) : [...filters.statuses, o.value] })}>
                  {o.label}
                </button>
              )
            })}
          </div>
          <div className="row">
            <button className="btn" disabled={!statusCount} onClick={() => set({ statuses: [] })}>Clear</button>
            <button className="btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </Sheet>
      )}

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

      {sheet === 'site' && (
        <Sheet title="Filter by site" onClose={() => setSheet(null)}>
          <p className="muted small">Songs with at least one link on this site.</p>
          <Chips<'any' | Site> label="Site" value={filters.site ?? 'any'} onChange={(v) => set({ site: v === 'any' ? null : v })} options={[{ value: 'any', label: 'Any' }, ...SITE_SHORT.map((s) => ({ value: s.site, label: s.label }))]} />
          <div className="row">
            <button className="btn" disabled={!filters.site} onClick={() => set({ site: null })}>Clear</button>
            <button className="btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </Sheet>
      )}

      {sheet === 'key' && (
        <Sheet title="Filter by key" onClose={() => setSheet(null)}>
          {roots.length === 0 ? (
            <p className="muted">No keys yet. Set a song's key on its page.</p>
          ) : (
            <Chips<string> label="Key" value={filters.keyRoot ?? 'any'} onChange={(v) => set({ keyRoot: v === 'any' ? null : v })} options={[{ value: 'any', label: 'Any' }, ...roots.map((k) => ({ value: k, label: k }))]} />
          )}
          <div className="row">
            <button className="btn" disabled={!filters.keyRoot} onClick={() => set({ keyRoot: null })}>Clear</button>
            <button className="btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
