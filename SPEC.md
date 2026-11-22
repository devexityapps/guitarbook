# Guitarbook — App v1 Spec

**Product name:** Guitarbook (current name; may change). Use it in user-facing places that are easy to change: the PWA manifest `name`/`short_name`, the page title, the sign-in screen. Don't put it anywhere permanent: Firebase project ID, domain, package names.

**Icon:** `design/icon.svg` (full) and `design/icon-small.svg` (32px and below).
- **Design:** a closed amber book (`#F0A63A`) on a dark tile (`#121417`), with cream page edges (`#EDE3D1`) on the right and a G major chord diagram drawn on the cover in dark lines.
- **Small sizes:** at 32px and below (favicon), use the simplified diagram from the mockup (3 strings, 2 frets, heavier lines).
- **Files:** the two SVGs in `design/` are the source. Export PNGs at 192 and 512, plus a maskable 512 with the book kept inside the safe zone (roughly the central 80%).
- **Originality:** the icon is an original design; don't swap in stock guitar or brand imagery.

**Mockups:** screenshots in `design/` (Library, Song detail, Add link, Import bookmarks, Settings). Match their layout and colors; the sample songs and numbers in them are placeholder data.

**Theme:**
- Background `#121417`, surfaces `#1C1F24`, borders `#2F343C`.
- Text `#ECEEF1`, secondary text `#A3AAB5`.
- Accent / amber `#F0A63A` (amber text `#F5B971`), "Can play" teal `#7FDCC6`.
- Fonts: Inter for body text, Space Grotesk for headings.

---

## 1. Goal

A phone-first web app (installable PWA) for one guitarist to organize links to songs and lessons on YouTube, Ultimate Guitar and Songsterr, tag them, and see when each was last opened.

v1 is **organization + open tracking only**. There's no review scheduling yet, but the data captured now (open events) must make it possible later.

### In scope
- Song/lesson items with multiple links each
- Tags, key, status, notes
- Paste-a-link add flow with site detection, link parsing and duplicate detection
- Tracking when each item and each link was last opened from the app
- One-time import from a Chrome bookmarks HTML export
- Search, filter, sort (default: longest untouched)
- JSON export of all data

### Out of scope (do not build)
- Spaced repetition / review scheduling / "due" queues
- Embedded YouTube player, loops, speed, pitch
- Scale or chord display
- Chrome extension, marketing site
- Sharing, public pages, multiple users collaborating
- Payments, analytics, ads

---

## 2. Stack and repo rules

- **Repo:** single git repo at `guitarbook/`. Folders: `app/`, `shared/`, `extension/` (empty), `site/` (empty).
- **Work only in `app/` and `shared/`.** Do not scaffold anything in `extension/` or `site/`.
- **`shared/`** holds code more than one part will need later: link parsing, URL normalization, data types. `app/` imports from it. No React or Firebase imports in `shared/`.
- **App:** Vite + React + TypeScript. Keep dependencies few.
- **Backend:** Firebase Auth (Google sign-in only), Firestore, Firebase Hosting. No Cloud Functions in v1.
- **PWA:** installable manifest and icons, app shell cached for offline (e.g. `vite-plugin-pwa`).
- **Firestore offline cache:** enable persistent local cache (`initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager`). Required so open events survive the page being backgrounded when a link opens another app.
- **Firebase project ID:** neutral (e.g. `practice-library`). Project IDs can't be renamed.

---

## 3. Data model (Firestore)

All data lives under the signed-in user.

```
users/{uid}
  settings: {
    staleDays: number             // default 30; see §4.7
    showThumbnails: boolean       // default true; see §4.2
  }

users/{uid}/songs/{songId}
  type: 'song' | 'lesson'
  title: string
  artist: string | null           // null for most lessons
  keyRoot: string | null          // 'C','C#','Db',...,'B'
  keyMode: 'major' | 'minor' | null
  tags: string[]                  // de-duplicated case-insensitively; keep the user's casing
  status: 'wishlist' | 'learning' | 'canplay' | 'shelved'
  notes: string
  sources: Source[]               // embedded array, not a subcollection
  createdAt: Timestamp
  updatedAt: Timestamp
  lastOpenedAt: Timestamp | null  // max of sources[].lastOpenedAt
  openCount: number               // total opens across all sources

Source {
  id: string                      // client-generated
  site: 'youtube' | 'ultimateguitar' | 'songsterr' | 'other'
  url: string                     // as the user gave it, minus tracking params
  canonicalKey: string            // 'yt:<videoId>', 'ug:<tabId>', 'ss:<songId>', or 'url:<normalized url>'
  role: 'lesson' | 'tab' | 'chords' | 'backing' | 'performance' | 'other'
  label: string | null            // user's own label, e.g. "Simplified chords"
  ytVideoId?: string
  ytStartSec?: number             // from t= param
  ytPlaylistId?: string
  ugType?: string                 // 'chords','tabs','bass','ukulele','pro','official', ... (see §5)
  ugTabId?: string
  ssSongId?: string
  addedAt: Timestamp
  lastOpenedAt: Timestamp | null
}

users/{uid}/events/{eventId}
  songId: string
  sourceId: string
  action: 'open'
  at: Timestamp
```

**Why it's shaped this way:**
- Sources are embedded: one read per song, and a song has only a handful of links.
- The events log is append-only. Nothing in v1 reads it except export, but the review feature will need the history.
- No scheduling fields. Firestore is schemaless; those get added when review is built.
- No instrument field. The app is scoped to guitar; other instruments are handled with tags (e.g. `ukulele`). An instrument field gets added only if scale/chord diagrams are built and need it.

### Security rules
`rules_version = '2'` is required so the recursive wildcard also matches the `users/{uid}` settings doc itself.
```
rules_version = '2';
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

### Querying
Load the user's whole `songs` collection once (live listener) and filter, search and sort in memory. The expected size is hundreds of items. Don't create composite indexes.

---

## 4. Screens

Phone-first (390px wide target), works at desktop width. Dark theme as in the mockups. Touch targets ≥ 44px. Real `<button>`, `<a>`, `<input>`, `<label>` elements.

### 4.1 Sign-in
Single "Sign in with Google" button. After sign-in, go to Library.

### 4.2 Library (home)
- **Header:** "Library" title, "Import" link, settings icon (sign out, export).
- **Search:** matches title, artist, tags, source labels (case-insensitive, accent-insensitive).
- **Filters:**
  - Status chips: All, Learning, Can play, Wishlist, Shelved. Single-select. "All" includes Shelved items.
  - "Tags" chip opens a tag picker; multi-select, AND logic.
  - Secondary filters, behind a "More filters" control: site, key, type (song/lesson).
- **Count line:** "N items" reflecting active filters.
- **Sort options:**
  - Longest untouched (default): never-opened first, then oldest `lastOpenedAt`.
  - Recently opened
  - Recently added
  - A–Z by title
  - Persist the chosen sort in localStorage, wrapped in try/catch.
- **Row contents:** title; artist · key; status pill; sites present (YouTube · UG · Songsterr); right column "Never opened" / "Today" / "N days since opened".
- **Staleness:** highlight the right column in amber when the item has never been opened or was last opened more than `settings.staleDays` days ago.
- **Thumbnails** (when `settings.showThumbnails` is on):
  - Show a small 16:9 thumbnail at the left of the row (about 72×40), from the song's first YouTube source.
  - Songs with no YouTube source get a same-size neutral placeholder with a small guitar glyph, so rows line up.
  - Rules for loading the image: see §7.
- **Navigation:** tapping a row goes to Song detail.
- **Floating "Add link" button** goes to Add.
- **Empty state:** short text plus two buttons, "Add link" and "Import bookmarks".

### 4.3 Song detail
- **Back link.** "Edit" opens the edit form (§4.5).
- **Header:** title, artist, key pill, status pill, "Last opened X · opened N times".
- **Links section:** one large tappable card per source. Each card shows site · role (uppercase label), the user's label (or a default like "Chords" / the role), and "Opened X ago" / "Never opened". Stale per-link times use the same amber rule.
- **Tapping a card** opens the URL (see §6) and logs the open.
- **"Add a link"** goes to Add, pre-targeted to this song.
- **Each source has a menu:** edit label/role, remove link (confirm).
- **Tags and Notes** sections.

### 4.4 Add link
- **URL field** with paste support. On input, run the parser (§5) and show what was detected, e.g. "Ultimate Guitar · Chords · Stevie Ray Vaughan / Pride and Joy". Unknown sites are allowed with site = 'other'.
- **If the link's `canonicalKey` already exists on any song:** say so ("Already saved on *Song*"), with a button to open that song. Don't add a duplicate.
- **Else if the parsed title + artist match an existing song** (normalized: lowercase, strip punctuation and a leading "the"): show the "Already in your library" panel with two options, **Add to this song** (default) and **New song**.
- **Else:** show the new-song form, prefilled from the parse: type, title, artist, key, status (default Wishlist), tags (including any tag the parser suggests, e.g. `ukulele`).
- **Link fields:** optional label, plus a role chosen from chips (Lesson / Tab / Chords / Backing track / Performance / Other), prefilled from the parse.
- **Primary button:** "Add to *Song*" or "Create song".
- **Entered from Song detail:** skip matching and attach to that song.

### 4.5 Edit song
- Same fields as the new-song form.
- Delete song (confirm). This also deletes that song's events.

### 4.6 Import bookmarks
1. **File picker** for a Chrome bookmarks export (`bookmarks_*.html`, Netscape bookmark format). Parse it in the browser. Nothing is uploaded except the resulting songs.
2. **Keep only links** where the parser returns youtube, ultimateguitar or songsterr. Show "N links kept: YouTube a · UG b · Songsterr c. Everything else was skipped."
3. **Skip duplicates:** links whose `canonicalKey` already exists in the library, with a count.
4. **Group links into proposed songs** by normalized title + artist. Use the bookmark's title text as the primary source of names; use the URL as a fallback (§5).
5. **Two tabs:**
   - **Ready:** groups with a confident title and artist. Each has a checkbox, default checked.
   - **Check names:** groups needing a decision:
     - a Songsterr link whose artist/song split is unknown (editable Artist and Song fields, prefilled with a best guess)
     - a YouTube link that could be a song or a lesson (Song / Lesson toggle)
     - anything with no usable title
6. **One status for all imported items** (default Wishlist).
7. **"Import N items"** writes in batches (Firestore batch limit is 500 operations), then returns to Library.

Imported sources get `lastOpenedAt: null`. Bookmark add dates are not opens.

### 4.7 Settings (minimal)
- **Highlight items not opened in:** choice of 7, 14, 30, 60 or 90 days (default 30). Saved to `users/{uid}.settings.staleDays`, so it applies on every device.
- **Show thumbnails:** on/off (default on). Saved to `users/{uid}.settings.showThumbnails`.
- Sign out.
- **Export JSON:** downloads `{ settings, songs, events }` for the user.

---

## 5. Link parsing (`shared/`)

A pure function `parseLink(url: string, titleHint?: string)` returns `{ site, canonicalKey, role, fields..., titleGuess, artistGuess, suggestedTags, confidence }`. Unit-test it with fixtures taken from real bookmarks (ask the user for 20–30 sample URLs and titles before finalizing the patterns).

**Normalization (all sites):** trim; force https; strip `utm_*`, `si`, `feature`, `fbclid`, `gclid`; drop the fragment except where noted.

**YouTube:** hosts `youtube.com`, `www.`, `m.`, `music.`, `youtu.be`.
- **Video ID** from `watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`.
- **`t=` / `start=` → `ytStartSec`.** Accept `90`, `90s` and `1m30s` formats.
- **`list=` → `ytPlaylistId`.** A playlist URL with no video is a source with canonicalKey `ytpl:<id>`.
- **Role:** default 'lesson'. Use 'backing' if the title hint contains "backing track"; use 'performance' if it contains "official video", "live" or "official audio". This is a guess; the user can change it.
- **Title and artist come only from the hint** (bookmark title, minus a trailing " - YouTube"). If the hint looks like "Artist - Song", split on the first " - ". If it contains lesson words ("lesson", "how to play", "tutorial", "licks", "scale", "exercise"), the item goes to "Check names" as song-or-lesson.

**Ultimate Guitar:** hosts `tabs.ultimate-guitar.com`, `www.ultimate-guitar.com`.
- **Path shape:** `/tab/<artist-slug>/<song-slug>-<type>-<id>`. The artist is the first segment. The trailing `-<type>-<id>` comes off the second segment, and the rest is the song.
- **Slugs → display text:** hyphens to spaces, Title Case. Prefer the hint when present; UG page titles are assumed to contain the song and artist, but verify against fixtures.
- **Type → role:** chords → 'chords'; tabs, bass, ukulele, pro, official, drums → 'tab'.
- **Ukulele:** type 'ukulele' adds a suggested tag `ukulele` (returned as `suggestedTags` from the parser and applied when creating a new song or attaching to one).
- **Verify the type list against real URLs before trusting it.** Unknown types → role 'tab', and keep the raw `ugType`.

**Songsterr:** host `www.songsterr.com`.
- **Path shape:** `/a/wsa/<slug>-tab-s<id>`. Anything after the id (e.g. a track suffix) is ignored for the canonical key.
- **The slug joins artist and song with hyphens, and they can't be reliably separated.** Use the hint if it parses cleanly. Inspect real exported Songsterr bookmark titles to find their pattern; don't assume one. Otherwise set `confidence: 'low'`, put the whole slug in `titleGuess`, and route the item to "Check names".
- **Role:** 'tab'.

**Other:** site 'other'; canonicalKey `url:<normalized url>`; role 'other'.

---

## 6. Open tracking

When a source card is tapped:
1. **Let the link open.** Render it as `<a href={url} target="_blank" rel="noopener">` and don't call `preventDefault`. On phones this hands off to the YouTube / UG / Songsterr app or browser.
2. **In the same click handler, fire (don't await):**
   - add an `events` doc
   - update the song: `lastOpenedAt = now`, `openCount = increment(1)`, the tapped source's `lastOpenedAt = now`, `updatedAt` unchanged
3. **Offline persistence** queues the writes if the page is suspended. They sync when the user returns.

"Opened" means opened from this app. Visits made directly in YouTube etc. are not counted; this is accepted.

**Relative time display:**
- **Today:** same calendar day (local).
- **"1 day":** the previous calendar day.
- **Otherwise "N days":** whole local calendar days between the two dates.
- **Lifetime:** never shows "N days" beyond 365; shows "Over a year" instead.

---

## 7. Third-party terms (constraints, not suggestions)

- **Store URLs, IDs, and the user's own titles, labels and notes. Never store or cache page content** (tab text, chords, lyrics, video data).
- **Never iframe or frame Ultimate Guitar or Songsterr pages.** UG's terms prohibit framing. No embedded YouTube player in v1.
- **No scraping:** no fetching of UG or Songsterr pages, from the app or a server.
- **YouTube thumbnails:**
  - Build the URL from the video ID at render time: `https://i.ytimg.com/vi/<id>/mqdefault.jpg`.
  - Never download, store or proxy the images.
  - No API key or quota is involved.
  - Use `loading="lazy"`, `referrerpolicy="no-referrer"`, and a `decoding="async"` `<img>` with empty `alt` (the row's title already labels it).
  - If an image fails to load (deleted or private video), fall back to the placeholder.
- **YouTube oEmbed for title prefill: not in v1.** Titles come from the user or the bookmark title.

---

## 8. Build order

Each step ends with something usable. Stop after each one for the user to check.

1. **Scaffold.** Vite + React + TS in `app/`, Firebase config via env vars, Google sign-in, Firestore with offline cache, security rules, Hosting deploy.
   - **Check:** sign in on phone and desktop; a test doc is readable only by its owner.
2. **Parser in `shared/`** with unit tests over the user's real sample URLs.
   - **Check:** all fixtures parse as expected; Songsterr low-confidence cases are flagged.
3. **Add link + Song detail + Edit**, including duplicate detection and attach-to-existing.
   - **Check:** add the same UG link twice; the second is refused. Add a Songsterr link to an existing song.
4. **Library** with search, filters, sorts and staleness highlighting.
   - **Check:** filters combine correctly; the default sort puts never-opened first.
5. **Open tracking.**
   - **Check:** tapping a link on the phone opens the app; on return, "Today" and the count are updated. Works in airplane mode, then syncs.
6. **Bookmark import.**
   - **Check:** import the user's real export; review "Check names"; spot-check 10 items.
7. **PWA install + Settings** (staleness threshold, thumbnails toggle, sign out, export).
   - **Check:** install to the home screen with the Guitarbook name and icon; it opens offline with cached data; changing the threshold on the phone changes the highlighting on desktop; the export downloads.

---

## 9. Decisions made

- **Product name:** Guitarbook for now. Not used in any permanent identifier.
- **Icon:** B1, the amber chord book (see top of spec).
- **Shelved:** not hidden from "All".
- **Staleness threshold:** adjustable in Settings (7/14/30/60/90 days, default 30), synced per user.
- **Thumbnails:** on by default for YouTube sources, with a placeholder for the rest and a Settings toggle to turn them off.
