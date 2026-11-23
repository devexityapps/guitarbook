# Guitarbook — Chrome Extension v1 Spec

Companion to the app spec (`../SPEC.md`). Same Firebase project, same data model, same signed-in Google account. Read the app spec first; this file only covers what's different.

---

## 1. Goal

A toolbar popup for saving the page you're on to Guitarbook and editing what's already saved, without leaving the page.

### In scope
- Popup that knows whether the current page is already saved (matched by link, not by title).
- **Saved page:** show that song's details and let the user edit them.
- **Unsaved page:** show a form prefilled from the page, to save as a new song or attach to an existing one.
- Open the library (or this song in the library) in a new tab.
- Google sign-in, using the same account as the app.
- Keyboard shortcut to open the popup.

### Out of scope (v1)
- A toolbar badge showing "saved" while browsing. It needs broad permissions; see §8.
- Automatically logging opens when you visit a saved page.
- Anything that changes or reads inside YouTube, Ultimate Guitar or Songsterr pages beyond §5. No loops, speed controls or player buttons.
- A library view inside the popup (the app is the library).
- Publishing to the Chrome Web Store. v1 runs as an unpacked extension.

---

## 2. Stack and repo rules

- **Folder:** lives in `extension/`. Imports link parsing, normalization and types from `shared/`.
- **Build:** Manifest V3. Vite + React + TypeScript, built as a multi-page Vite project: `popup.html`, `offscreen.html`, and a background service worker. Ask before adding an extension build plugin.
- **Firebase:**
  - Same project and web config as the app (`extension/.env.local`).
  - **Auth must be imported from `firebase/auth/web-extension`** (SDK ≥ 10.8) in all extension code. Plain `firebase/auth` is only used inside the hosted sign-in page (§3).
  - Firestore (`firebase/firestore`) works normally in the popup.
  - All Firebase code is bundled; MV3 forbids loading remote code.
- **Stable extension ID:** put a `key` in the manifest so the ID doesn't change between unpacked reloads. The ID has to be on Firebase's authorized-domains list.
- **Permissions:** keep them minimal, so installing shows no warnings.

| Permission | Why |
|---|---|
| `activeTab` | Read the current tab's URL and title when the popup opens. Grants nothing until the user clicks the icon. |
| `scripting` | Read the YouTube video's current playback position to offer a start time (§5), and on other pages check whether the page is plain text and read that text to offer saving it as a chart (§5.1). Only works on the active tab after a click, via `activeTab`. |
| `offscreen` | Google sign-in (§3). |
| `storage` | Pass sign-in progress and errors between the popup and the background worker (§3). |

No `tabs`, no `history`, no host permissions.

---

## 3. Sign-in

Google sign-in can't run directly in an MV3 extension. Use Firebase's documented offscreen-document approach:

1. **A small hosted sign-in page** on the app's Firebase Hosting (e.g. `app/public/extension-auth.html` → `https://<project>.web.app/extension-auth.html`). It runs `signInWithPopup` with `GoogleAuthProvider` using normal `firebase/auth`. It returns the Google OAuth credential (ID token and access token) to its parent frame by `postMessage`, and only to the extension's own origin.
2. **An offscreen document** (`offscreen.html`) embeds that page in an iframe and relays messages between the iframe and the background service worker.
3. **The background service worker:**
   - takes the returned credential
   - calls `signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken))` using `firebase/auth/web-extension`
   - closes the offscreen document
4. **Auth persistence:** the auth state persists in the extension's IndexedDB and is shared by the popup and the service worker. Sign-in happens once.

**Setup the user does (Claude Code should give these instructions):**
- Add `chrome-extension://<extension-id>` to Firebase Console → Authentication → Settings → Authorized domains.
- Deploy the app so the sign-in page is live.

**Flow:**
- The popup's "Sign in with Google" sends a message to the service worker, then shows "Finish signing in in the Google window."
- Chrome closes the popup when the Google window opens. That's expected. On the next click, the popup shows the signed-in state.
- **Wrong account guard:** show the signed-in email in the popup footer. If the library is empty, add a hint: "Signed in as X. Your songs are on a different account?" with a Sign out link. The app and extension must use the same Google account.

---

## 4. Data model changes (also go in the app spec)

The popup has to find, with one query instead of loading the whole library:
- whether this exact link is saved, and
- whether a song with this title and artist exists.

Add two **derived fields** to every song doc:

```
users/{uid}/songs/{songId}
  sourceKeys: string[]   // = sources.map(s => s.canonicalKey)
  matchKey: string | null  // normalized "title|artist" (same normalization as the app's duplicate-song match); null if title empty
```

- **One shared helper.** A pure function in `shared/` computes both fields from a song. **Every write** that changes sources, title or artist, from app or extension, runs it.
- **Repair on load.** When the app loads the library, it fixes any song whose derived fields are missing or don't match. That covers songs saved before this change.
- **Queries:** `where('sourceKeys', 'array-contains', key)` and `where('matchKey', '==', key)`. Both use automatic single-field indexes; no composite index needed.

---

## 5. Reading the current page (prefill)

When the popup opens:
1. **Get the tab's `url` and `title`** via `activeTab`.
2. **Skip pages that can't be saved:** if the URL isn't http(s) (`chrome://`, the Web Store, new tab page), show "Guitarbook can't save this page." with only the "Open library" button. The exception is a local `file:` page that is plain text, which can be saved as a chart (§5.1).
3. **Parse:** run the shared `parseLink(url, titleHint)` from `shared/`, with the tab title as the hint. It returns site, canonical key, title and artist guesses, and suggested tags.
4. **Look up:**
   - query `sourceKeys array-contains canonicalKey` → saved (§6.2)
   - else, if title and artist were guessed, query `matchKey` → "matches an existing song" (§6.3)
   - else → new (§6.4)

### Site-specific prefill

The parser already handles URLs; these are extra rules for tab titles.

- **YouTube:**
  - **Title cleanup:** strip a leading notification count like `(3) ` and a trailing ` - YouTube`.
  - **Artist/song split:** "Artist - Song" splits on the first " - ".
  - **Start time:**
    - If the URL has `t=`, use it.
    - Otherwise, on a `watch` page, the popup may run one `chrome.scripting.executeScript` on the active tab that returns `document.querySelector('video')?.currentTime` and nothing else.
    - Show it as an unchecked option: "Start at 3:42 (where you are now)". Checked → `ytStartSec`.
    - If the script fails, hide the option silently.
  - **Non-video YouTube pages** (home, search, channel): save as site 'other' with the cleaned title. Playlist pages: per the app spec (`ytpl:` key).
- **Ultimate Guitar:** prefer the tab title if it clearly contains song and artist. Otherwise use the URL slugs. Check the title pattern against real pages before relying on it.
- **Songsterr:** the tab title usually separates song and artist better than the URL slug. Find the pattern from real pages; don't assume one. If unsure, prefill the whole title and leave artist empty.
- **Any other site:** title = cleaned tab title; artist empty.

**Saving a page stores its tab title as the link's own `title`**, separate from the song's title (app spec §3). It is the title the user already sees, prefilled and editable in the app.

**Never read page content beyond what's listed here.** No scraping of tab text, chords, lyrics, comments or video descriptions. URL, tab title, (YouTube only) playback position and (plain-text pages only, §5.1) the page's text are all the extension reads.

### 5.1 Plain-text pages (save as a chart)
A text file the user opens in Chrome, local (`file:///…/Kiss of Life.txt`) or on the web, can be saved as one of their own charts (app SPEC §4.8) instead of as a link.
- **Detect:** on a `file:` page, or an http(s) page the parser calls site 'other' (never YouTube, UG or Songsterr), the popup runs one `chrome.scripting.executeScript` that returns the page's text only if `document.contentType === 'text/plain'` (the `<pre>` Chrome renders the file in, so spacing is exact), else nothing.
- **Local files:** Chrome only lets an extension run on `file:` pages when "Allow access to file URLs" is on for it. If the script fails on a `file:` page, show "To save local files, turn on 'Allow access to file URLs' for Guitarbook," with a button that opens its page in `chrome://extensions`.
- **Too long:** text over 50,000 characters can't be saved as a chart; say so (a web page can still be saved as a link).
- **Which file:** the chart keeps the file's URL as its `url` and gets the key `chart:<url>` (http(s) URLs normalized as the parser does; `file:` URLs without the fragment), so the popup finds it again with the usual `sourceKeys` query.
- **Guess from the file name:** without the extension, underscores read as spaces, split on the first " - " as "Artist - Song" (like YouTube titles); with no " - ", the whole name is the title.
- **Then:** look up `chart:<url>` → already saved as a chart (§6.7). Otherwise load the song list for the song picker (§6.6; only on text pages, from the offline cache when it can) → §6.6.
- This is the only time the extension reads a page's text, and it's always a page the user opened and chose to save.

---

## 6. Popup states

**Size:** about 380 px wide, up to 600 px tall (Chrome's popup limit), scrolling inside. Same dark theme, fonts and components as the app.

**Header, all states:** small Guitarbook icon and name.

**Footer, all signed-in states:**
- **Open library** opens the app's URL in a new tab. On a saved page it says **Open in library** and goes to `#/song/<id>`.
- The signed-in email.

### 6.1 Signed out
"Sign in with Google" button, plus one line: "Use the same Google account as the Guitarbook app."

### 6.2 Page already saved
- **Banner:** "Saved in *Song title*", plus "Last opened X · opened N times" for this link.
- **Editable song fields:** title, artist, key, status, tags.
- **Editable fields for this link:** link title.
- **Notes and link labels are not in the popup** (any state). They're edited in the app; the popup stays for quick saves and fixes. Saving from the popup leaves `notes` empty for a new song and `label` null for a new link, and never overwrites existing values.
- **Saving:** autosaves on change (debounced ~600 ms), with a small "Saved" indicator. Edits made just before the popup closes must still be written: flush any pending save immediately on `pagehide` / `visibilitychange`.
- **Other resources on this song** (was "Other links"): compact list (site · label or link title · last opened). Clicking one opens it in a new tab and logs an open, exactly as in the app (event doc + `lastOpenedAt` + `openCount`).
  - The user's own charts (app SPEC §4.8) appear here too, as "My chart · *title*" (just "My chart" when it has no title). Clicking one opens the chart's viewer in the app (`#/song/<id>/chart/<sourceId>`) in a new tab and logs an open the same way.
- **"Mark opened now"** button: logs an open for this link. Opens aren't recorded automatically when you merely visit a saved page.
- **Remove this link** (confirm). If it's the song's last link, offer instead: "Delete the song too?" (confirm).

### 6.3 Not saved, but matches an existing song
- **Panel:** "Already in your library: *Song* — *Artist* (N links)", with **Add to this song** (default) / **New song**.
- **Add to this song:** saves the link at once and switches to 6.2.
- **New song:** goes to the 6.4 form.

### 6.4 Not saved, new
- **Form prefilled per §5:** title, artist, key (empty unless the parser found one), status (default: always Wishlist), tags (parser suggestions). On YouTube, the start-time option.
- **Save** creates the song, then switches to 6.2.
- Nothing is written until Save is clicked.

### 6.5 Can't save this page
See §5 step 2.

### 6.6 Plain-text page, not saved as a chart yet (§5.1)
- **Order, top to bottom:** song, chart title, then the chart's text.
- **Song:** one typeahead text box, and no other song fields.
  - Typing lists the user's songs that match (title words first, then artist, then anywhere; title with artist under it). Picking one adds the chart to that song.
  - If the box holds an existing song's title (picked, or typed exactly, same normalization as the duplicate-song match), the chart goes to that song, and an icon in the box opens the song in the app in a new tab.
  - Otherwise whatever is typed becomes the title of a new song (no artist, key or tags; status Wishlist).
  - Starts with the song the file name points to (title and artist, else title alone), or else the guessed title.
  - A line under the box says which: "Adds the chart to this song by *Artist*" or "Creates a new song with this title".
- **Chart title** (optional; its placeholder shows the name it gets without one: the song's title and artist).
- **Chart text:** labelled "Chart text · *file name*": the first lines of the text, monospace, not wrapped, in a short scrolling box.
- **Save** ("Add to *Song*" or "Save chart to Guitarbook") adds the chart, creating the song if needed, and switches to §6.7. Nothing is written until then.
- **"Save as a link instead"** (web pages only) switches to the normal link flow (§6.2–6.4) for this page.

### 6.7 Plain-text page already saved as a chart
- **Banner:** "Saved as a chart on *Song title*", plus the chart's name and "Last opened X".
- **If the file's text differs from the chart's:** "This file has changed since it was saved," with **Replace the chart's text** (replaces only the text, keeping the title; any edits made in the app are overwritten, so say that next to the button). Otherwise "Up to date with this file."
- **Open chart** opens the chart's viewer in the app in a new tab and logs an open, like the other resources (§6.2).
- **Footer:** **Open in library** goes to the song.

### Errors
- **Offline / Firestore unavailable:** "Can't reach Guitarbook right now." Keep the form contents, and allow retry.
- **Save failed:** keep the form contents and show the error inline. Never close or reset silently.

---

## 7. Keyboard shortcut
Manifest `commands` → `_execute_action`, suggested Alt+Shift+G. Users can change it at `chrome://extensions/shortcuts`.

---

## 8. Later, not v1
- **Badge on saved pages.** Needs to watch tab changes: either the `tabs` permission or host access to YouTube/UG/Songsterr. Installing would then warn "Read your browsing history" or "Read and change your data on…". Revisit if this goes public.
- **Logging opens on visit.** Same permission cost.
- **Chrome Web Store listing.**

---

## 9. Build order

Stop after each step for the user to check.

1. **Derived fields in the app** (§4): shared helper, every write path, repair on load.
   - **Check:** existing songs gain `sourceKeys` and `matchKey`; adding or removing a link updates them.
2. **Extension scaffold:** manifest with the permissions above, stable `key`, popup shows the current tab's URL and title, "Open library" works, keyboard shortcut works. Load unpacked.
   - **Check:** no permission warnings; the popup opens on any page.
3. **Sign-in** (§3), including the hosted page and the authorized-domain instructions.
   - **Check:** sign in once; close and reopen Chrome; still signed in as the same account as the app.
4. **Lookup + saved state** (§5 lookup, §6.2).
   - **Check:** on a page saved through the app, the popup shows that song; edits appear in the app.
5. **Prefill + unsaved states** (§5 site rules, §6.3, §6.4).
   - **Check:** on 10 real pages across the three sites plus one other site, the prefill is right or easy to fix; matching an existing song offers to attach.
6. **YouTube start-time option, errors, polish.**
   - **Check:** the start time saved from a lesson opens the video at that point from the app.
7. **Text files as charts** (§5.1, §6.6, §6.7; needs the app's charts, app SPEC §4.8).
   - **Check:** turn on "Allow access to file URLs"; open a local `.txt` chart named "Artist - Song.txt"; the popup offers "Save as a chart" with that song picked if it exists (open icon shown), else the title filled in; try picking another song and typing a new title; save; it shows as a chart in the app with spacing intact. Edit the file, reload it, and the popup offers to replace the chart's text. With file access off, the popup explains how to turn it on. A web `.txt` offers both chart and "Save as a link instead".

---

## 10. Open decisions (ask the user)
- The keyboard shortcut (default Alt+Shift+G).
- ~~Whether status should default to "last used" or always Wishlist.~~ Decided: always Wishlist.
