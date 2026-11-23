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
- Accent / amber `#F0A63A` (amber text `#F5B971`), "Ready" teal `#7FDCC6`.
- Fonts: Inter for body text, Space Grotesk for headings.

---

## 1. Goal

A phone-first web app (installable PWA) for one guitarist to organize links to songs and lessons on YouTube, Ultimate Guitar and Songsterr, tag them, and see when each was last opened.

v1 is **organization + open tracking only**. There's no review scheduling yet, but the data captured now (open events) must make it possible later.

### In scope
- Items (a song or a lesson) with multiple resources each: links, and the user's own charts (chord or tab text they wrote, §4.8)
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
  title: string
  artist: string | null           // null when there is none (most lessons)
  keyRoot: string | null          // 'C','C#','Db',...,'B'
  keyMode: 'major' | 'minor' | null
  tags: string[]                  // de-duplicated case-insensitively; keep the user's casing
  status: 'wishlist' | 'learning' | 'polishing' | 'canplay'
  notes: string
  sources: Source[]               // embedded array, not a subcollection
  createdAt: Timestamp
  updatedAt: Timestamp
  lastOpenedAt: Timestamp | null  // max of sources[].lastOpenedAt
  openCount: number               // total opens across all sources
  sourceKeys: string[]            // derived: sources.map(s => s.canonicalKey)
  matchKey: string | null         // derived: normalized "title|artist" (same normalization as the duplicate-song match); null if title empty

Source {                          // a "resource": a link, or one of the user's own charts
  id: string                      // client-generated
  site: 'youtube' | 'ultimateguitar' | 'songsterr' | 'other' | 'chart'
  url: string                     // as the user gave it, minus tracking params; for a chart, '' or the text file it was saved from (extension SPEC §5.1)
  canonicalKey: string            // 'yt:<videoId>', 'ug:<tabId>', 'ss:<songId>', 'url:<normalized url>', 'chart:<id>', or 'chart:<file url>' for a chart saved from a text file
  label: string | null            // user's own label, e.g. "Simplified chords"
  title?: string | null           // the link's own title (tab or bookmark title), separate from the song's title; prefilled on save, editable; absent on older links. Optional for a chart too (null when left empty).
  text?: string                   // charts only: the chart itself, plain text, at most 50,000 characters
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
- **Header:** "Library" title; on the right a search icon, a filters icon, then a hamburger menu. The menu holds Sign out (and Import bookmarks, Settings once those are built). Search and filters icons are hidden while the library is empty.
- **Search:** the box is hidden by default; the search icon opens it with the cursor in it. Tapping the icon again (or Escape in an empty box) closes it and clears the search. Matches title, artist, tags, source labels and link titles (case-insensitive, accent-insensitive).
- **Filters:** the filters icon opens one sheet with every filter; there are no filter buttons above the list. Changes apply as you tap. The sheet ends with "Clear all" and "Show N items" (closes it).
  - **Status** (Learning, Polishing, Ready, Wishlist): multi-select, OR logic (a song has one status). None picked = all statuses.
  - **Tags:** multi-select, AND logic.
  - **Site** (YouTube, UG, Songsterr, My charts): multi-select, OR logic: songs with a resource on any of the picked sites ("My charts" = has a chart). None picked = every site.
  - **Key** (Any, plus only the keys used in the library): single choice.
  - **Badge:** when any are on, the filters icon turns amber and shows the number of choices made (each status, tag and site, plus the key). The search text isn't counted.
- **Count line:** "N items" reflecting active filters.
- **Sort options:**
  - Longest untouched (default): never-opened first, then oldest `lastOpenedAt`.
  - Recently opened
  - Recently added
  - A–Z by title
  - Persist the chosen sort in localStorage, wrapped in try/catch.
- **Row contents:** title; artist · key; status pill; sites present (YouTube · UG · Songsterr · Chart); right column "Never opened" / "Today" / "N days since opened".
- **Staleness:** highlight the right column in amber when the item has never been opened or was last opened more than `settings.staleDays` days ago.
- **Thumbnails** (when `settings.showThumbnails` is on):
  - Show a small 16:9 thumbnail at the left of the row (about 72×40), from the song's first YouTube source.
  - Songs whose links are all on one tab site (Songsterr or Ultimate Guitar) show that site's icon in that slot; charts are ignored for this. Other songs with no YouTube source get a same-size neutral placeholder with a small guitar glyph, so rows line up.
  - Rules for loading the image: see §7.
- **Navigation:** tapping a row goes to Song detail.
- **Floating "+" button** opens a small menu: **Song** (a blank new-song form with the §4.4 song fields and no link; links are added later from Song detail), **Link** (goes to Add) or **Chart** (a new song with its first chart, §4.8).
- **Empty state:** short text plus two buttons, "Add link" and "Import bookmarks".

### 4.3 Song detail
- **Back link.** No Edit button: every field is edited in place (§4.5).
- **Header:** title, artist, "Last opened X · opened N times", then the status pill.
- **Section order:** Tags, Key, Notes, Resources, then Delete song.
- **Tags, Key, Notes and Resources:** with a value, a section with its heading (Key holds the key pill and the mode pill). When empty, no heading: just a dashed "+ tag" / "+ key" / "+ note" / "+ resource" button, and empty ones in a row sit side by side. "+ resource" opens the same Link / Chart menu as "+ Add".
- **Resources section** (formerly "Links"): one large tappable card per source, links and charts mixed in the order they were added. Each card shows the site (uppercase label: YOUTUBE, ULTIMATE GUITAR, SONGSTERR, OTHER or MY CHART), the title, else the user's label, else the link's host name, a YouTube thumbnail when there is one, and "Opened X ago" / "Never opened". Stale per-resource times use the same amber rule. A link card ends with the open-in-new arrow; a chart card with a page icon instead.
- **Tapping a card** opens the link or the chart viewer in a new tab (see §6 and §4.8), and logs the open either way.
- **"+ Add"** at the right of the Resources heading (replacing "Add a link" under the cards) opens a small menu: **Link** (goes to Add, pre-targeted to this song) or **Chart** (the chart editor for a new chart on this song, §4.8).
- **Each resource has a menu:** for a link, edit title and label and remove link (confirm); for a chart, edit chart (§4.8) and remove chart (confirm; the text is deleted).
- **Delete song** button at the bottom (§4.5).

### 4.4 Add link
- **URL field** with paste support. On input, run the parser (§5) and show what was detected, e.g. "Ultimate Guitar · Stevie Ray Vaughan / Pride and Joy". Unknown sites are allowed with site = 'other'.
- **If the link's `canonicalKey` already exists on any song:** say so ("Already saved on *Song*"), with a button to open that song. Don't add a duplicate.
- **Else if the parsed title + artist match an existing song** (normalized: lowercase, strip punctuation and a leading "the"): show the "Already in your library" panel with two options, **Add to this song** (default) and **New song**.
- **Else:** show the new-song form, prefilled from the parse: title, artist, key, status (default Wishlist), tags (including any tag the parser suggests, e.g. `ukulele`).
- **Link fields:** optional label (the link's title is kept from the page title when there is one, and can be edited from the link menu). There is no role or link-kind field.
- **Primary button:** "Add to *Song*" or "Create song".
- **Entered from Song detail:** skip matching and attach to that song.

### 4.5 Editing a song (in Song detail)
- There is no separate edit screen. Song detail shows the same fields as the new-song form, each editable where it is shown.
- **Title, artist, notes:** look like plain text; tap to edit. Saves on leaving the field (or Enter, except in notes); Escape puts the saved value back. An empty title isn't saved. An empty artist shows "Add artist".
- **"+ tag" / "+ note"** open that field with the cursor in it; left empty, it goes back to the button. **"+ key"** opens the key picker directly.
- **Key, mode, status:** each pill opens a picker and saves the choice at once. A song with a key and no mode shows Major. Choosing "No key" clears the mode too, and Key goes back to "+ key".
- **Tags:** edited in the tag box (below); saved at once. Removing the last tag goes back to "+ tag".
- **Tag box** (the same everywhere: here, the new-song form and Add link):
  - The song's tags are chips inside the field, each with a circled ×, followed by the text box. Backspace in an empty text box removes the last chip. A × at the right clears all tags.
  - On focus a dropdown opens over the page listing existing library tags the song doesn't have, most used first (scrolls past about five). Typing narrows it, ignoring case and accents: tags with a word starting with the typed text first, then ones that only contain it.
  - Tap one (or arrow keys + Enter) to add it. Enter with nothing highlighted adds the typed text as a new tag. Escape closes the dropdown.
- **Delete song** (confirm). This also deletes that song's events.

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
     - a YouTube link with no artist split from its title, e.g. a lesson (editable Title and Artist fields)
     - every 'other' link: the title is prefilled from the bookmark title, artist is empty
     - anything with no usable title
8. **One status for all imported items** (default Wishlist).
9. **"Import N items":** N is the number of checked groups. It writes in batches (Firestore batch limit is 500 operations), then returns to Library.

Imported sources get `lastOpenedAt: null`. Bookmark add dates are not opens.

### 4.7 Settings (minimal)
- **Highlight items not opened in:** choice of 7, 14, 30, 60 or 90 days (default 30). Saved to `users/{uid}.settings.staleDays`, so it applies on every device.
- **Show thumbnails:** on/off (default on). Saved to `users/{uid}.settings.showThumbnails`.
- Sign out.
- **Export JSON:** downloads `{ settings, songs, events }` for the user. Charts are inside `songs` (their `text`), so they're included.

### 4.8 Charts (the user's own chord or tab text)
A chart is a resource that holds text instead of pointing to a page: tab or chords the user wrote, e.g. their own tab for "Kiss of Life".
- **Stored** as a Source on the song with `site: 'chart'`, `url: ''` and `canonicalKey: 'chart:<id>'` (or, when saved from a text file by the extension, the file's URL and `'chart:<file url>'`), an optional `title` and the `text` (§3). Plain text only; spacing kept exactly.
- **Name:** the chart's title, or if it has none, the song's title and artist ("Kiss of Life · Sade"; just the title when there's no artist). Used on its card, its menu and the viewer header.
- **Opening:** a chart card opens the viewer **in a new tab**, just like a link (`<a href="#/song/<songId>/chart/<sourceId>" target="_blank" rel="noopener">`), and logs an open in the same click handler (§6). Reloading or returning to the viewer doesn't log another.
  - **Exception, installed app:** when running as an installed home-screen app (`display-mode: standalone`), open the viewer in the same window instead. On iPhone an installed app keeps its sign-in separate from Safari, so a new tab would land in Safari signed out.
- **Viewer** (route `#/song/<songId>/chart/<sourceId>`):
  - Header: the chart's name (above), with the song's title and artist under it only when the chart has its own title, a link to the song, an "Edit" link and a **Full screen** button.
  - The text in a monospace font with whitespace preserved and **no wrapping**, so chord-over-lyric lines and tab staves stay aligned. Wider lines scroll sideways.
  - **A− / A+** buttons change the text size. The size is remembered on this device (localStorage, wrapped in try/catch).
  - **Full screen:** uses the browser's Fullscreen API where it's available (desktop, Android, iPad). Where it isn't (iPhone Safari), it hides the header and the page's own chrome so the chart fills the window. Either way, a small floating "Exit full screen" button (and Escape on a keyboard) returns to normal; A−/A+ stay available as small floating buttons.
  - Keeps the screen on while open, using the Screen Wake Lock API where the browser supports it; nothing happens where it doesn't.
- **Editor** (the same route with `/edit`, or `#/song/<songId>/chart/new`):
  - An optional title field (empty to start, its placeholder showing the name it will get without one) and a large monospace text box with spellcheck, autocorrect and autocapitalize off, so pasted tab isn't altered.
  - "Save" (disabled while the text is empty) and "Cancel". Leaving with unsaved changes asks first.
  - Saving (a new chart is added at the end of the song's resources) returns to the previous view, like Cancel: the song, or the viewer if Edit was tapped there. With nothing to go back to, it goes to the song.
- **New song from a chart** (Library "+" → **Chart**, route `#/new/chart`):
  - One form: the new-song fields (§4.4: title, artist, status, tags, key, mode), then the chart's title and text as in the editor.
  - If the title + artist match an existing song (same normalized match as §4.4), show the "Already in your library" panel with **Add to this song** (default) and **New song**.
  - "Save" creates the song with the chart as its first resource (or adds the chart to the matched song) and returns to the previous view (the Library), like Cancel.
- **Search** matches chart titles like link titles; the chart text isn't searched.
- **Extension:** a plain-text page (a local or web `.txt` file) can be saved as a chart, and saved again later to update its text (extension SPEC §5.1, §6.6, §6.7). Otherwise charts never match a page. In the popup's list of the song's other resources, a chart shows as "My chart · *title*" (just "My chart" when it has no title) and opens its viewer in the app in a new tab, logging an open.

---

## 5. Link parsing (`shared/`)

A pure function `parseLink(url: string, titleHint?: string)` returns `{ site, canonicalKey, fields..., titleGuess, artistGuess, suggestedTags, confidence }`. Unit-test it with fixtures taken from real bookmarks (ask the user for 20–30 sample URLs and titles before finalizing the patterns).

**Normalization (all sites):** trim; force https; strip `utm_*`, `si`, `feature`, `fbclid`, `gclid`; drop the fragment except where noted.

**YouTube:** hosts `youtube.com`, `www.`, `m.`, `music.`, `youtu.be`.
- **Video ID** from `watch?v=`, `youtu.be/<id>`, `/shorts/<id>`, `/embed/<id>`, `/live/<id>`.
- **`t=` / `start=` → `ytStartSec`.** Accept `90`, `90s` and `1m30s` formats.
- **`list=` → `ytPlaylistId`.** A playlist URL with no video is a source with canonicalKey `ytpl:<id>`.
- **Title and artist come only from the hint** (bookmark title, minus a trailing " - YouTube"). If the hint looks like "Artist - Song", split on the first " - ". If it contains lesson words ("lesson", "how to play", "tutorial", "licks", "scale", "exercise"), the whole title is kept, no artist is guessed, and the item goes to "Check names".

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
1. **Let the link open.** Render it as `<a href={url} target="_blank" rel="noopener">` and don't call `preventDefault`. On phones this hands off to the YouTube / UG / Songsterr app or browser. A chart card opens its in-app viewer the same way, in a new tab (except in the installed app; §4.8).
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
  - The user's own charts (§4.8) are their writing, typed or pasted by them, so storing them is fine. The app never fills a chart from a site on its own: no import, fetch or "copy from this link". The one way text comes in from a page is the extension saving a plain-text file the user has open and chooses to save (extension SPEC §5.1).
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
8. **Resources and charts** (§4.3, §4.8; added later, can be built before 6 and 7). "Links" becomes "Resources", "+ Add" on Song detail offers Link or Chart, the Library "+" menu gains Chart, and the chart editor and viewer (with full screen) are added, plus the "My charts" site filter and the extension's chart row.
   - **Check:** add a chart with aligned chords over lyrics and a tab stave on the phone; tapping its card opens it in a new tab; it stays aligned, scrolls sideways when wide, and A−/A+ and Full screen work (on iPhone and desktop); opening it updates "Last opened"; it shows offline; editing and removing work; Library "+" → Chart creates a song with the chart, and offers "Add to this song" for a matching title + artist; the extension lists it and opens it in the app.

---

## 9. Decisions made

- **Product name:** Guitarbook for now. Not used in any permanent identifier.
- **Icon:** B1, the amber chord book (see top of spec).
- **Staleness threshold:** adjustable in Settings (7/14/30/60/90 days, default 30), synced per user.
- **Thumbnails:** on by default for YouTube sources, with a placeholder for the rest and a Settings toggle to turn them off.
