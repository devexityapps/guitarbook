import { useEffect, useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import {
  KEY_ROOTS, NO_FILTERS, SORTS, STATUSES, activeFilterCount, collectTags, filterSongs, isChart, isStale, sortSongs,
  type Filters, type ResourceSite, type SortKey,
} from '@shared'
import { auth } from '../firebase'
import { useSettings, useSongs, type SongDoc } from '../data'
import { keyText, sinceOpened, toDate } from '../format'
import { Chips, IconFilters, IconMenu, IconPlus, IconSearch, Sheet, SITE_ICONS, StatusPill, Thumb } from '../ui'

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

/** Sites as named on a Library row and in the Site filter (SPEC §4.2). Charts are "Chart" on a row, "My charts" in the filter. */
const SITE_SHORT: { site: ResourceSite; label: string; filterLabel?: string }[] = [
  { site: 'youtube', label: 'YouTube' },
  { site: 'ultimateguitar', label: 'UG' },
  { site: 'songsterr', label: 'Songsterr' },
  { site: 'chart', label: 'Chart', filterLabel: 'My charts' },
]

/** First YouTube source with a video id (SPEC §4.2); playlist-only links have none. */
const thumbVideoId = (song: SongDoc) => song.sources.find((s) => s.site === 'youtube' && s.ytVideoId)?.ytVideoId

/** A song whose links are all on one tab site (Songsterr or Ultimate Guitar) gets that site's icon in place of the placeholder. Charts don't count. */
function siteIcon(song: SongDoc): string | undefined {
  const links = song.sources.filter((s) => !isChart(s))
  const site = links[0]?.site
  return site && links.every((s) => s.site === site) ? SITE_ICONS[site] : undefined
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (!addOpen && !menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAddOpen(false); setMenuOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen, menuOpen])

  /** The search box is hidden until the search icon opens it; closing it clears the search so nothing stays filtered out of sight. */
  const toggleSearch = () => {
    if (searchOpen) set({ query: '' })
    setSearchOpen(!searchOpen)
  }

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const all = songs ?? []
  const shown = useMemo(() => sortSongs(filterSongs(all, filters), sort), [all, filters, sort])
  const allTags = useMemo(() => collectTags(all), [all])
  const roots = useMemo(() => KEY_ROOTS.filter((k) => all.some((s) => s.keyRoot === k)), [all])
  const now = new Date()

  // Badge on the filters icon: every choice made in the filters sheet (the search box isn't counted).
  const filterCount = activeFilterCount(filters)
  const filtered = filters.query.trim() !== '' || filterCount > 0
  const clearSheetFilters = () => set({ statuses: [], tags: [], sites: [], keyRoot: null })

  // Order in the filters sheet (SPEC §4.2): the in-progress statuses, then Wishlist.
  const statusOrder = ['learning', 'polishing', 'canplay', 'wishlist'] as const
  const statusOptions = statusOrder.map((v) => STATUSES.find((s) => s.value === v)!)

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="big-title">Library</h1>
        <div className="topbar-actions">
          {all.length > 0 && (
            <button type="button" className={`icon-btn${searchOpen ? ' on' : ''}`} aria-label={searchOpen ? 'Close search' : 'Search'} aria-expanded={searchOpen} aria-controls="library-search" onClick={toggleSearch}>
              <IconSearch />
            </button>
          )}
          {all.length > 0 && (
            <button
              type="button"
              className={`icon-btn badge-host${filterCount ? ' on' : ''}`}
              aria-label={filterCount ? `Filters, ${filterCount} on` : 'Filters'}
              aria-haspopup="dialog"
              onClick={() => setFiltersOpen(true)}
            >
              <IconFilters />
              {filterCount > 0 && <span className="badge" aria-hidden="true">{filterCount}</span>}
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Menu" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="library-menu" onClick={() => setMenuOpen((o) => !o)}>
            <IconMenu />
          </button>
        </div>
        {menuOpen && (
          <>
            <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="top-menu" id="library-menu" role="menu" aria-label="Menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void signOut(auth) }}>Sign out</button>
            </div>
          </>
        )}
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
          {searchOpen && (
            <div className="pad" id="library-search">
              <label className="search">
                <IconSearch />
                <input
                  type="search"
                  autoFocus
                  aria-label="Search songs, artists, tags"
                  placeholder="Search songs, artists, tags"
                  value={filters.query}
                  onChange={(e) => set({ query: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Escape' && !filters.query) toggleSearch() }}
                />
              </label>
            </div>
          )}

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
          <a role="menuitem" href="#/new/chart">Chart</a>
        </div>
      )}
      <button type="button" className={`fab${addOpen ? ' open' : ''}`} aria-label="Add" aria-haspopup="menu" aria-expanded={addOpen} aria-controls="add-menu" onClick={() => setAddOpen((o) => !o)}><IconPlus /></button>

      {filtersOpen && (
        <Sheet title="Filters" onClose={() => setFiltersOpen(false)}>
          <section className="filter-group">
            <h3 className="field-label">Status <span className="hint">· any of these</span></h3>
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
          </section>

          <section className="filter-group">
            <h3 className="field-label">Tags <span className="hint">· all of these</span></h3>
            {allTags.length === 0 ? (
              <p className="muted small">No tags yet. Add tags on a song's page.</p>
            ) : (
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
            )}
          </section>

          <section className="filter-group">
            <h3 className="field-label">Site <span className="hint">· has any of these</span></h3>
            <div className="chips" role="group" aria-label="Site">
              {SITE_SHORT.map((s) => {
                const on = filters.sites.includes(s.site)
                return (
                  <button key={s.site} type="button" aria-pressed={on} className={`chip tag${on ? ' on' : ''}`} onClick={() => set({ sites: on ? filters.sites.filter((x) => x !== s.site) : [...filters.sites, s.site] })}>
                    {s.filterLabel ?? s.label}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="filter-group">
            <h3 className="field-label">Key</h3>
            {roots.length === 0 ? (
              <p className="muted small">No keys yet. Set a song's key on its page.</p>
            ) : (
              <Chips<string> label="Key" value={filters.keyRoot ?? 'any'} onChange={(v) => set({ keyRoot: v === 'any' ? null : v })} options={[{ value: 'any', label: 'Any' }, ...roots.map((k) => ({ value: k, label: k }))]} />
            )}
          </section>

          <div className="row sheet-actions">
            <button className="btn" disabled={!filterCount} onClick={clearSheetFilters}>Clear all</button>
            <button className="btn primary" onClick={() => setFiltersOpen(false)}>Show {shown.length} {shown.length === 1 ? 'item' : 'items'}</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
