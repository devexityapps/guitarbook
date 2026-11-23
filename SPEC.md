# Guitarbook — App v1 Spec

**Product name:** Guitarbook (current name; may change). Use it in user-facing places that are easy to change: the PWA manifest `name`/`short_name`, the page title, the sign-in screen. Don't put it anywhere permanent: Firebase project ID, domain, package names.

**Icon:** `design/icon.svg` (full) and `design/icon-small.svg` (32px and below).
- **Design:** a closed amber book (`#F0A63A`) on a dark tile (`#121417`), with cream page edges (`#EDE3D1`) on the right and a G major chord diagram drawn on the cover in dark lines.
- **Small sizes:** at 32px and below (favicon), use the simplified diagram from the mockup (3 strings, 2 frets, heavier lines).
- **Files:** the two SVGs in `design/` are the source. Export PNGs at 192 and 512, plus a maskable 512 with the book kept inside the safe zone (roughly the central 80%).
- **Originality:** the icon is an original design; don't swap in stock guitar or brand imagery.

**Mockups:** screenshots in `design/` (Library, Song detail, Add link, Import bookmarks, Settings). Match their layout and colors; the sample songs and numbers in them are placeholder data. Where a screenshot and this spec disagree, the spec wins. In particular, `import-bookmarks.png` predates the folder picker, the 'other' links and the subfolder tags (§4.6).

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
- Import from a Chrome bookmarks HTML export, limited to folders the user picks
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
- **The Chrome extension** is specified in `extension/SPEC.md`. It shares this data model, and it needs two things from the app:
  - **Stable routes:** the extension links to `#/` (Library) and `#/song/<id>` (Song detail). Don't change these routes without updating the extension.
  - **A hosted sign-in page** (`app/public/extension-auth.html`), built in the extension's step 3.
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
  sourceKeys: string[]            // derived: sources.map(s => s.canonicalKey)
  matchKey: string | null         // derived: normalized "title|artist" (same normalization as the duplicate-song match); null if title empty

Source {
  id: string                      // client-generated
  site: 'youtube' | 'ultimateguitar' | 'songsterr' | 'other'
  url: string                     // as the user gave it, minus tracking params
  canonicalKey: string            // 'yt:<videoId>', 'ug:<tabId>', 'ss:<songId>', or 'url:<normalized url>'
  label: string | null            // user's own label, e.g. "Simplified chords"
  title?: string | null           // the link's own title (tab or bookmark title), separate from the song's title; prefilled on save, editable; absent on older links
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
- **Derived fields (`sourceKeys`, `matchKey`)** exist so the Chrome extension can find a song with one query instead of loading the library.
  - A single pure helper in `shared/` computes them.
  - Every write that changes sources, title or artist, from the app or the extension, runs it.
  - On library load, the app repairs any song whose derived fields are missing or stale.
  - The app itself keeps doing its matching in memory.
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
- **Search:** matches title, artist, tags, source labels and link titles (case-insensitive, accent-insensitive).
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
  - Songs whose links are all on one tab site (Songsterr or Ultimate Guitar) show that site's icon in that slot. Other songs with no YouTube source get a same-size neutral placeholder with a small guitar glyph, so rows line up.
  - Rules for loading the image: see §7.
- **Navigation:** tapping a row goes to Song detail.
- **Floating "Add link" button** goes to Add.
- **Empty state:** short text plus two buttons, "Add link" and "Import bookmarks".

### 4.3 Song detail
- **Back link.** "Edit" opens the edit form (§4.5).
- **Header:** title, artist, key pill, status pill, "Last opened X · opened N times".
- **Links section:** one large tappable card per source. Each card shows the site (uppercase label), the link's title, else the user's label, else the link's host name, a YouTube thumbnail when there is one, and "Opened X ago" / "Never opened". Stale per-link times use the same amber rule.
- **Tapping a card** opens the URL (see §6) and logs the open.
- **"Add a link"** goes to Add, pre-targeted to this song.
- **Each source has a menu:** edit title and label, remove link (confirm).
- **Tags and Notes** sections.

### 4.4 Add link
- **URL field** with paste support. On input, run the parser (§5) and show what was detected, e.g. "Ultimate Guitar · Stevie Ray Vaughan / Pride and Joy". Unknown sites are allowed with site = 'other'.
- **If the link's `canonicalKey` already exists on any song:** say so ("Already saved on *Song*"), with a button to open that song. Don't add a duplicate.
- **Else if the parsed title + artist match an existing song** (normalized: lowercase, strip punctuation and a leading "the"): show the "Already in your library" panel with two options, **Add to this song** (default) and **New song**.
- **Else:** show the new-song form, prefilled from the parse: type, title, artist, key, status (default Wishlist), tags (including any tag the parser suggests, e.g. `ukulele`).
- **Link fields:** optional label (the link's title is kept from the page title when there is one, and can be edited from the link menu). There is no role or link-kind field.
- **Primary button:** "Add to *Song*" or "Create song".
- **Entered from Song detail:** skip matching and attach to that song.

### 4.5 Edit song
- Same fields as the new-song form.
- Delete song (confirm). This also deletes that song's events.

### 4.6 Import bookmarks
1. **File picker** for a Chrome bookmarks export (`bookmarks_*.html`, Netscape bookmark format). Parse it in the browser, keeping the folder structure (`<H3>` folder headings and nested `<DL>` lists). Nothing is uploaded except the resulting songs. Chrome can't export a single folder, so expect the whole bookmark tree.
2. **Folder picker:**
   - Show the folder tree with counts per folder, including subfolders: links from the three sites, and other links.
   - The user checks one or more folders. Checking a folder includes all its subfolders.
   - Nothing is preselected. The "Next" button stays disabled until at least one folder is checked.
   - Only links inside the checked folders go on. Everything else in the file is discarded and never saved.
3. **Keep every link in the chosen folders:**
   - Links where the parser returns youtube, ultimateguitar or songsterr are handled as §5 describes.
   - Any other http(s) link is kept with site 'other'. Skip non-web bookmarks (`javascript:`, `chrome://`, `file:`) and say how many were skipped.
   - Summary line: "N links from the chosen folders: YouTube a · UG b · Songsterr c · Other d."
4. **Skip duplicates:** links whose `canonicalKey` already exists in the library, with a count.
5. **Subfolders as tags:**
   - Each link gets one suggested tag per folder between the chosen folder and the link. The chosen folder's own name is never a tag.
   - Example: choose "Guitar"; a link in Guitar > Blues > SRV gets `blues` and `srv`. A link sitting directly in "Guitar" gets none.
   - Tag text: folder name, trimmed and lowercased.
   - Before import, show every tag about to be created, with its item count and a checkbox (default checked). Unchecked tags aren't applied. Typical junk to untick: "misc", "new folder", "to sort".
   - Tags from subfolders are merged with any tags the parser suggests (e.g. `ukulele`).
6. **Group links into proposed songs** by normalized title + artist. Use the bookmark's title text as the primary source of names; use the URL as a fallback (§5). Links in the same group merge their tags.
7. **Two tabs:**
   - **Ready:** groups with a confident title and artist. Each has a checkbox, default checked.
   - **Check names:** groups needing a decision:
     - a Songsterr link whose artist/song split is unknown (editable Artist and Song fields, prefilled with a best guess)
     - a YouTube link that could be a song or a lesson (Song / Lesson toggle)
     - every 'other' link: the title is prefilled from the bookmark title, artist is empty, with a Song / Lesson toggle (default Lesson)
     - anything with no usable title
8. **One status for all imported items** (default Wishlist).
9. **"Import N items":** N is the number of checked groups. It writes in batches (Firestore batch limit is 500 operations), then returns to Library.

Imported sources get `lastOpenedAt: null`. Bookmark add dates are not opens.

### 4.7 Settings (minimal)
- **Highlight items not opened in:** choice of 7, 14, 30, 60 or 90 days (default 30). Saved to `users/{uid}.settings.staleDays`, so it applies on every device.
- **Show thumbnails:** on/off (default on). Saved to `users/{uid}.settings.showThumbnails`.
- Sign out.
- **Export JSON:** downloads `{ settings, songs, events }` for the user.

---

## 5. Link parsing (`shared/`)

A pure function `parseLink(url: string, titleHint?: string)` returns `{ site, canonicalKey, fields..., titleGuess, artistGuess, suggestedTags, confidence }`. Unit-test it with fixtures taken from real bookmarks (ask the user for 20–30 sample URLs and titles before finalizing the patterns).

**Normalization (all sites):** trim; force https; strip `utm_*`, `si`, `feature`, `fbclid`, `gclid`; drop the fragment except where noted.

**YouTube:** hosts `youtube.com`, `www.`, `m.`, `music.`, `youtu.be`.
- **Video ID** from `watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`.
- **`t=` / `start=` → `ytStartSec`.** Accept `90`, `90s` and `1m30s` formats.
- **`list=` → `ytPlaylistId`.** A playlist URL with no video is a source with canonicalKey `ytpl:<id>`.
- **Title and artist come only from the hint** (bookmark title, minus a trailing " - YouTube"). If the hint looks like "Artist - Song", split on the first " - ". If it contains lesson words ("lesson", "how to play", "tutorial", "licks", "scale", "exercise"), the item goes to "Check names" as song-or-lesson.

**Ultimate Guitar:** hosts `tabs.ultimate-guitar.com`, `www.ultimate-guitar.com`.
- **Path shape:** `/tab/<artist-slug>/<song-slug>-<type>-<id>`. The artist is the first segment. The trailing `-<type>-<id>` comes off the second segment, and the rest is the song.
- **Slugs → display text:** hyphens to spaces, Title Case. Prefer the hint when present; UG page titles are assumed to contain the song and artist, but verify against fixtures.
- **Ukulele:** type 'ukulele' adds a suggested tag `ukulele` (returned as `suggestedTags` from the parser and applied when creating a new song or attaching to one).
- **Verify the type list against real URLs before trusting it.** Keep the raw `ugType`.

**Songsterr:** host `www.songsterr.com`.
- **Path shape:** `/a/wsa/<slug>-tab-s<id>`. Anything after the id (e.g. a track suffix) is ignored for the canonical key.
- **The slug joins artist and song with hyphens, and they can't be reliably separated.** Use the hint if it parses cleanly. Inspect real exported Songsterr bookmark titles to find their pattern; don't assume one. Otherwise set `confidence: 'low'`, put the whole slug in `titleGuess`, and route the item to "Check names".

**Other:** site 'other'; canonicalKey `url:<normalized url>`.

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
   - **Check:** import the user's real export, choosing only the guitar folder(s):
     - nothing outside them comes in
     - subfolder tags look right, and junk ones can be unticked
     - 'other' links land in "Check names"
     - spot-check 10 items
7. **PWA install + Settings** (staleness threshold, thumbnails toggle, sign out, export).
   - **Check:** install to the home screen with the Guitarbook name and icon; it opens offline with cached data; changing the threshold on the phone changes the highlighting on desktop; the export downloads.

---

## 9. Decisions made

- **Product name:** Guitarbook for now. Not used in any permanent identifier.
- **Icon:** B1, the amber chord book (see top of spec).
- **Shelved:** not hidden from "All".
- **Staleness threshold:** adjustable in Settings (7/14/30/60/90 days, default 30), synced per user.
- **Thumbnails:** on by default for YouTube sources, with a placeholder for the rest and a Settings toggle to turn them off.
