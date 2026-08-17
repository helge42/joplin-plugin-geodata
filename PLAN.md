# Joplin plugin "Travel journal / Geodata" — plan

Started: 2026-08-15

## 1. Goal

Extend Joplin (focus on **Android/mobile**) so that notes work as a travel journal with a
sense of place:

1. **MVP:** view and edit a note's geodata (by hand and from the current location)
2. Insert the current location into the note as text
3. Show GPX tracks in the note (OSM map), optionally saved as an image

---

## 2. Research results (verified facts)

| Question | Answer | Source |
|---|---|---|
| Are `latitude`/`longitude`/`altitude` writable through the plugin API? | **Yes**, they are ordinary note fields, `PUT /notes/:id` or `joplin.data.put` | [Data API](https://joplinapp.org/help/api/references/rest_api/) |
| Do plugins run on mobile? | Yes, since Joplin 3.x. Every plugin runs in an `iframe` inside a `WebView`. The manifest needs `"platforms": ["desktop","mobile"]` | [Mobile plugin debugging](https://joplinapp.org/help/api/references/mobile_plugin_debugging/), [Manifest](https://joplinapp.org/help/api/references/plugin_manifest/) |
| How does a panel appear on mobile? | Panels show up in a **tabbed dialog** opened from a toolbar button in the note editor. `panels.show()`/`.visible` behave differently than on desktop | [joplin.views.panels](https://joplinapp.org/api/references/plugin_api/classes/joplinviewspanels.html), [Forum](https://discourse.joplinapp.org/t/plugin-api-what-should-panels-show-and-panels-visible-do-on-mobile/37507) |
| Is there a geolocation API for plugins? | **No.** Laurent (maintainer) in the forum: *"We don't currently expose this API but a PR would be accepted if you're interested in implementing it."* | [Forum: Geolocation API](https://discourse.joplinapp.org/t/geolocation-api/47854) |
| Does `navigator.geolocation` work in the plugin webview? | **Yes, confirmed on Android.** Tested on Joplin for Android 3.6.21 (Xperia 5 III, Android 16, WebView Chrome 149): `getCurrentPosition` returns a real fix. — *Correction:* from `ExtendedWebView/index.tsx` (no `geolocationEnabled` prop) I had concluded the opposite; the device says otherwise. iOS is untested and remains doubtful. | Measured on the device, 2026-08-15 |
| Does Joplin set geodata when a note is created through the API? | **No.** `Note.updateGeolocation()` is called only when a *provisional* note is first saved from the editor UI (`packages/lib/components/shared/note-screen-shared.ts`), gated by the `trackLocation` setting. On top of that, the last position is cached for 10 minutes. | Joplin source, `dev` |
| Does an open editor overwrite coordinates written by the plugin? | **No.** The editor saves only changed fields (`fields: BaseModel.diffObjectsFields(lastSavedNote, note)`), and lat/lon are not in that diff. (The UI may show stale values until it reloads.) | Joplin source, `dev` |
| Can a plugin be installed from a file on the phone? | Yes, `PluginUploadButton` on the mobile config screen installs a `.jpl` directly. Not on iOS — see below. | Joplin source, `dev` |
| Can plugins be installed on iOS? | **Only recommended ones.** *"To adhere to AppStore guidelines, the iOS app only allows installing recommended plugins."* The web app at [app.joplincloud.com](https://app.joplincloud.com) does accept `.jpl` files, which makes it the practical route for iPhone users. | [Plugins](https://joplinapp.org/help/apps/plugins/), [Web app](https://joplinapp.org/help/apps/web/) |

### Consequence for "record the current location"

**Solved — `navigator.geolocation` works in the plugin panel on Android** (confirmed on the
device, see above). One tap fetches a real fix including accuracy. This is the main route.

The alternatives considered, kept so the decision stays traceable:

| Route | Status |
|---|---|
| **A — upstream PR** to Joplin (`joplin.geolocation` in the plugin API) | **no longer needed.** It would only have been the clean way if the webview blocked access, which it does not. |
| **B — paste and parse** from another app (`geo:` URI, Maps/OSM links, DMS, decimal degrees) | **kept as a fallback**, and a useful one: when no fix is available (indoors, in a tunnel) or when the coordinate belongs to a place you are not standing at — the normal case when writing up a trip afterwards. |
| ~~**C — detour via a new note**~~ | **rejected.** From practice: in shared notebooks Joplin almost never records a location (probably a timing problem between creating the note and getting a fix). Useless as a foundation — and precisely the reason this plugin exists. |
| **D — web version** of Joplin in the browser | relevant for development and for iPhone users |

iOS remains open: access there is untested and doubtful given WKWebView's behaviour. If it
ever matters, B is the fallback that will carry it.

---

## 3. Architecture

```
joplin-plugin-geodata/
├─ src/
│  ├─ manifest.json       platforms: ["desktop","mobile"]
│  ├─ index.ts            plugin main: panel, commands, settings, message router
│  ├─ location/
│  │   ├─ parse.ts        text → {lat,lon,alt}  (geo:, DD, DMS, Maps/OSM URLs)
│  │   ├─ format.ts       {lat,lon} → DD / DMS / geo: / links
│  │   └─ template.ts     insert template and its placeholders
│  ├─ geocode.ts          reverse geocoding via Nominatim, cached
│  ├─ notes.ts            reads/writes the note fields through joplin.data
│  ├─ panel/
│  │   ├─ markup.ts, panel.css, panel.js   UI in the webview
│  │   └─ vendor/leaflet.*                 bundled locally, no CDN
│  └─ gpx/
│      ├─ contentScript.ts   markdown-it rule for ```gpx blocks
│      ├─ gpxViewer.js/.css  Leaflet rendering inside the note viewer
│      └─ leaflet.*          second copy, see phase 4
```

**Data flow panel ↔ plugin:** `webviewApi.postMessage()` in the panel →
`panel.onMessage()` in the plugin → `joplin.data.get/put(['notes', id], …)`.
Refreshed on `workspace.onNoteSelectionChange` and `workspace.onNoteChange`.

**Offline first:** the journey happens without a network. Entering numbers, parsing,
formatting and GPX parsing must all work offline; map tiles and reverse geocoding
(Nominatim) are optional extras that can be switched off.

---

## 4. Phases

### Phase 0 — setup and spike ✅

Goal: the toolchain stands and the uncertain API questions are answered on a real device.

- [x] Node.js installed via apt (Debian 13 ships Node 20)
- [x] Scaffolding from the `generator-joplin` templates, placeholders filled in,
      `npm install`, `npm run dist` produces a `.jpl`
- [x] Tests: `npm test`, dependency-free

**Answered without a device:** the bundled API types in `api/*.d.ts` mark desktop-only
members with `<span class="platform-desktop">`, which settles the question:

| API | Mobile |
|---|---|
| `views.panels` (incl. `postMessage`/`onMessage`), `views.toolbarButtons`, `contentScripts`, `data`, `settings`, `commands`, `views.editors` | **available** |
| `workspace` | available, except `filterEditorContextMenu` |
| `views.dialogs` | available, except `showOpenDialog` |
| `ToolbarButtonLocation.EditorToolbar` | available — `NoteToolbar` is desktop-only |
| `views.menuItems`, `clipboard`, `imaging`, `fs`, `interop`, `window`, `ai`, `joplin.require` | **desktop-only** |

Consequences: the entry point is the panel plus `EditorToolbar` (no menu items on mobile);
no clipboard access, so a paste field is the right approach anyway; `imaging`/`fs` being
desktop-only means the image export in phase 4 is only conceivable through a `data:` URL
on mobile.

- [x] **Checked on the device** — Joplin for Android 3.6.21, Xperia 5 III, Android 16,
      WebView Chrome 149 (diagnostics section in the panel):
  - the panel and its toolbar button work
  - **an OSM tile loads (256×256) and `fetch` against Nominatim returns 200** — no CSP in
    the way, which clears the map in the panel, reverse geocoding and GPX rendering
  - `isSecureContext: true`
  - `getCurrentPosition` returns a real fix

A note on that last point: the first measurement only checked whether the objects existed,
which proved nothing. `navigator.geolocation` exists in Android's WebView even when access
is disabled, and `!!joplin.geolocation` is always true because the plugin sandbox answers
any property access with a proxy. Both were replaced by a real `getCurrentPosition` call
and a control probe against an invented API.

### Phase 1 — MVP: view and edit geodata ✅

The "Geodata" panel, opened from the plugin button in the note editor:

- **View:** latitude/longitude/altitude as values, in decimal degrees and DMS; a hint when
  there are none (0/0); links to OSM and to the local maps app (`geo:` URI)
- **Edit:** three fields with validation (-90..90 / -180..180), save/discard
- **Paste & detect:** one text field that swallows `geo:` URIs, decimal degrees, DMS and
  Google/OSM/Apple links, with a live preview
- **Current location:** one tap fills the fields via `navigator.geolocation`
  (`enableHighAccuracy`) and reports the accuracy; saving stays an explicit step
- **Map:** a small Leaflet map, tap or drag the pin to set coordinates
- **Swap latitude/longitude**, **clear** (with a confirming second tap)

About the map: Leaflet 1.9.4 is copied from `node_modules` into `src/panel/vendor/`
(`npm run vendor`, hooked into the `dist` script) and therefore travels inside the `.jpl` —
only the tiles need a network. The viewport only jumps when a different note is shown, so
your own panning and zooming survive a save. A run of `tileerror` events raises an offline
hint. The whole map can be switched off through the `showMap` setting. The pin is drawn in
CSS rather than using Leaflet's default icon, which would load PNGs.

Still open: a decimal/DMS toggle.

### Phase 2 — insert the location into the note ✅

A `geodata.insertLocation` command and a button in the panel. Text goes in through
`insertText` — the same command Joplin's own "Insert time" uses on both platforms — so it
lands at the cursor rather than at the end of the note (a `data.put` on `body` would
collide with the open editor).

The command tries for a fresh fix in the plugin process first and falls back to the
coordinates already stored on the note. Whether the plugin process can reach the GPS at all
is, unlike the panel, unproven, hence the hard timeout and the fallback. It has **no
toolbar button**: in practice the fallback always won, so the button would have inserted
the note's stored position nearly every time. It stays registered for the desktop command
palette. The panel button uses the values currently *displayed*, so a point just picked on
the map can go into the text without being saved first.

The template is configurable (`insertTemplate`); `{place}` goes through Nominatim with a
cache and degrades silently to an empty string. Unknown placeholders are left visible
rather than leaving a hole in the note.

### Phase 3 — comfort for the travel journal (open)

- setting: adopt geodata automatically when a note is created (from the last known position)
- show the place name in the panel (reverse geocoding, cached, optional, mind the Nominatim
  policy)
- bulk view: "all notes in this notebook without geodata", for filling them in quickly
- export a notebook's notes as GPX/GeoJSON (the route of a trip)

### Phase 4 — show GPX tracks ✅ (image export still open)

```gpx blocks are rendered as an OSM map in the note viewer.

Structure: `src/gpx/contentScript.ts` (built as an `extraScript`, because Joplin
`require()`s the file) only produces the container and passes the source through; the
drawing happens in `src/gpx/gpxViewer.js`. That viewer script has to stay **plain JS** —
content script assets are copied verbatim and loaded with a `<script>` tag, where the
CommonJS wrapper webpack puts around extra scripts (`exports.default = …`) would die with
"exports is not defined". Assets are resolved flat next to the content script, which is why
Leaflet sits in `src/gpx/` a second time (via `npm run vendor`).

The block is wrapped in `joplin-editable`/`joplin-source`: the rich text editor can rebuild
the code block from it, Joplin's own stylesheet hides the source, and the viewer script
reads the GPX back out of it. Multiple `<trkseg>` elements stay separate lines so that a
pause in recording is not drawn as a straight line across the map; drawing is thinned to
2000 points while the statistics use all of them. Ascent only counts gains of 3 m or more
against the last accepted value — without that threshold, GPS noise adds up to imaginary
climbing.

**Attached files:** if the block holds nothing but a resource reference, the track is
fetched along **two routes**, because neither works everywhere:

1. The viewer loads the file directly, through the URL the renderer also builds for images
   (`ruleOptions.resources` / `resourceBaseUrl` / `itemIdToUrl`, see Joplin's
   `imageReplacement`) — using **`XMLHttpRequest`, not `fetch`**. Chromium does not support
   the `file://` scheme in `fetch` at all, which always ends in "Failed to fetch"; XHR reads
   it, because Joplin has to grant the webview file access or images in notes would not
   appear either. **The only route that works on Android** (confirmed on the device,
   2026-08-17).
2. Asking the plugin process through `webviewApi.postMessage`, which uses
   `joplin.data.get(['resources', id, 'file'])`. **Works on the desktop**; on Android Joplin
   answers `Unsupported encoding: buffer`, because the mobile fsDriver does not know the
   `Buffer` encoding that the REST route hardcodes.

On route 2 the file body arrives as a Buffer, a serialised `{ type: 'Buffer', data: [...] }`,
a typed array or already as text, depending on the platform; `decodeToText()` normalises all
of them. Files above 20 MB are refused.

Below the map there are two links: the start point as a `geo:` URI, and — for attached
files — "open the track in another app", built exactly like Joplin's own resource links
(`joplin://<id>` plus the `postMessageSyntax` from `ruleOptions`) so the tap goes through
Joplin's attachment handling into the system's app chooser.

**Important for users:** the file must be linked as `[name](:/id)`, not as a bare ID.
`Note.linkedItemIds` uses `extractResourceUrls`, which only understands Markdown link syntax
(which is why Joplin's whiteboard needed a special case there). Without the link the
resource is not associated with the note: it does not appear in `ruleOptions.resources`, so
route 1 has no URL — and worse, it counts as orphaned and can be cleaned up.

Still open: the **image export**. `joplin.imaging` and `joplin.fs` are desktop-only; on
mobile the only conceivable way is a `data:` URL inside the note.

### ~~Phase A — upstream PR to Joplin~~ (dropped)

Would have added `joplin.geolocation.currentPosition()` to the plugin API. Moot, because
`navigator.geolocation` already works in the panel webview. It would only become relevant
if iOS support were wanted, or if some Joplin version closed the access again.

---

## 5. Risks and open points

- ~~**GPS from the plugin**~~ — done, works directly on Android. Residual risk: Joplin or
  Android could close the access again in a future version, which is why the paste route is
  kept as a full alternative rather than optimised away.
- ~~**CSP in the plugin webview**~~ — done, tiles and `fetch` are not blocked.
- **Theme variables** — do not mix Joplin's `--joplin-*` pairs: foreground and background
  have to come from the same colour scheme, or the dark theme turns unreadable (which is
  what `colorCorrect` on `color4` produced).
- **The mobile viewer rebuilds the note DOM more than once**, and not every pass announces
  itself with `joplin-noteDidUpdate`. Anything drawn in there has to survive that — hence
  the "already drawn" marker on the map element rather than on its container, plus a
  `MutationObserver`.
- **Nominatim** — usage policy (at most 1 request/s, a meaningful user agent), so it stays
  optional, cached and off by default.
- **Sync conflicts** — changing geodata is an ordinary note update; harmless, but it does
  raise `updated_time`.
- **Battery and accuracy** — use a timeout, show the accuracy, and do not trust the first
  fix blindly.

---

## 6. Things settled along the way

Decisions and findings that came up in passing and would otherwise only live in a chat log.

### Plugin IDs are reverse DNS

`io.github.helge42.geodata` follows the same convention as Java packages, Android
application IDs and macOS bundle identifiers; Joplin's generator asks for exactly that
("such as `com.example.MyPlugin` or a UUID"). The point is uniqueness without a central
registry — the namespace belongs to whoever owns the domain. Hence the move away from
`eu.muennich.…`, which was merely derived from an email domain: GitHub namespaces serve as
an equivalent proof of ownership in practice.

The ID is the plugin's identity. Changing it means every user has to uninstall and
reinstall, so it should be settled early.

### Distribution: releases rather than `publish/` in Git

A `.jpl` is a packed archive; practically every byte changes on each build, Git cannot
delta-compress it and stores a full copy each time. More importantly, readers of the repo
would only ever get "whatever is in `main` right now" — no version, no changelog. Hence
GitHub releases with a stable latest URL, and `publish/` stays ignored.

### Commit addresses before the first push

The first commits carried a private address. Since nothing had been pushed, the history was
rewritten with `git filter-branch` onto `19750682+helge42@users.noreply.github.com` before
the first push. In a public repository this can only be fixed by rewriting history later —
so check before pushing.

### The `workflow` scope for GitHub Actions

GitHub rejects pushes that create or change files under `.github/workflows/` when the app's
OAuth token lacks the `workflow` scope, regardless of repository permissions. Add it with
`gh auth refresh -h github.com -s workflow`.

### Node 20 deprecation on the runners

`actions/checkout@v4` and `actions/setup-node@v4` run on Node 20 and are forced onto Node 24
by GitHub, with a warning in the run. Moving to `@v5` settles it. This concerns the actions
themselves, not `node-version: '20'` for the build.

### `geo:` links work in the note viewer

Confirmed on the device: `[text](geo:52.5,13.4)` in rendered note text opens the maps app.
That is why `{geo}` is the default in the insert template.

### The rich text editor cannot take inserted Markdown syntax

It treats text inserted through `insertText` literally and escapes the brackets when
serialising back to Markdown — `[52.5, 13.3](geo:…)` becomes `\[52.5, 13.3\](geo:…)` and the
link is dead. There is no portable way to hand it a real link (desktop TinyMCE could do
`mceInsertContent`, the ProseMirror editor on mobile could not). The case is detected
through the `editor.codeView` setting (`false` means rich text; it exists for desktop **and**
mobile), and then the link syntax is stripped and only the label inserted.

### Plugins have to bring their own translations

Joplin's core is translated with gettext (`.pot`/`.po`, Poedit), but plugins cannot hook
into it, and the plugin API exposes nothing for translation. The
[forum thread on translatable plugins](https://discourse.joplinapp.org/t/translatable-plugins/13658)
ends without an official mechanism or a community standard; the maintainer's advice is to
"just implement a simple string mapping" like VS Code extensions do, and he advises against
i18next and friends.

So `src/i18n/index.ts` holds one dictionary per language, English is the source, and
missing keys fall back to English. The language comes from
`joplin.settings.globalValue('locale')`, read once at startup — changing Joplin's language
needs a restart.

The awkward part is the note viewer: the markdown-it content script runs in the renderer
and cannot read settings, so it cannot know the language. `gpxViewer.js` therefore asks the
plugin process for the dictionary through `webviewApi.postMessage` before drawing, and the
"open in another app" link is emitted with an empty label that the viewer fills in.

### Editor availability can be queried, if only indirectly

The plugin API has no "editor is open" state. But `CommandService.execute` throws
`Cannot execute a command without a runtime` when no editor is mounted, so an attempt with
the read-only `selectedText` command is a harmless probe — which is how "insert into note"
in the panel greys itself out while a note is merely being viewed.
