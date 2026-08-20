# Joplin Geodata

A Joplin plugin to **view and edit** a note's geolocation — built for the Android app,
where Joplin can open the coordinates on a map but not change them.

It exists because of travel journalling: in shared notebooks Joplin often fails to record
a position when a note is created, and without a way to edit it, that note stays without a
place forever.

## Features

- **View** the coordinates in decimal degrees and in degrees/minutes/seconds, with links to
  OpenStreetMap and to the device's maps app (`geo:` URI)
- **Get the current location** — one tap fills position, altitude and accuracy into the
  fields; nothing is written until you press Save, so fetching a fix never changes the note
  by itself
- **Map** (OpenStreetMap): shows where the note is, and a tap or a dragged pin sets a new
  point — again saved only on request. Leaflet ships inside the plugin, so only the tiles
  need a network; without one, everything else keeps working. Can be turned off under
  Settings → Geodata.
- **Edit by hand**, with validation of latitude, longitude and altitude
- **Paste & detect**: a field that digs the coordinates out of just about anything a maps
  app hands you, with a live preview before anything is saved:

  | Input | Example |
  |---|---|
  | `geo:` URI | `geo:52.5163,13.3777` · `geo:0,0?q=52.5163,13.3777(Target)` |
  | Decimal degrees | `52.5163, 13.3777` · `52,5163 13,3777` · `N 52.5163 E 13.3777` |
  | Degrees/minutes/seconds | `52°30'58.7"N 13°22'39.7"E` |
  | OpenStreetMap | `…/?mlat=52.5163&mlon=13.3777` · `…/#map=15/52.5163/13.3777` |
  | Google Maps | `…/@52.5163,13.3777,15z` · `…!3d52.5163!4d13.3777` · `?q=…` |
  | Apple/Bing and others | `?ll=52.5163,13.3777` |

  Shortened links (`maps.app.goo.gl`) carry no coordinates at all and are rejected with an
  explanation rather than failing silently.
- **Insert the location as text** into the note, at the cursor, from the panel. The
  template is yours to configure:

  | Placeholder | Result |
  |---|---|
  | `{lat}` `{lon}` `{alt}` | `52.5163` · `13.3777` · altitude in metres, empty if unknown |
  | `{dms}` | `52°30'58.7"N 13°22'39.7"E` |
  | `{geo}` | `geo:` URI, opens the device's maps app |
  | `{osm}` | link to OpenStreetMap |
  | `{date}` `{time}` | `2026-08-15` · `14:35` |
  | `{place}` | place name from OpenStreetMap (needs a network, empty otherwise) |

  Default: `📍 [{lat}, {lon}]({geo})` — on a phone the `geo:` link opens the maps app
  directly. What gets inserted is whatever the panel currently shows, including a point you
  just picked on the map; the note's own coordinates are left untouched.

  **If the notes are read on an iPhone or a Mac, use `{osm}` instead of `{geo}`.** Apple
  platforms have no handler for `geo:` URIs — tapping such a link there does nothing at all.
  What lands in the note is stored text and travels to every device, so it cannot adapt
  itself; an OpenStreetMap link opens everywhere, and map apps like OsmAnd or Organic Maps
  offer to take it over. The links the panel draws for itself do adapt: on Apple platforms
  they point at `maps.apple.com`.

- **Insert the location as a map**: the same position as a `gpx` block with one waypoint,
  which the note viewer draws as a small map with a pin, with altitude and time below it.
  Markdown editor only — the rich text editor would escape the fence.
- **Copy the coordinates**: long-press the coordinates at the top of the panel and they go
  to the clipboard as `52.5163, 13.3777`; long-press the line below for degrees, minutes and
  seconds. A long press rather than a tap, because the clipboard belongs to whatever you are
  writing and should not be overwritten in passing.

  In the **rich text editor** only the text is inserted, without the link: that editor
  takes inserted text literally and escapes the brackets when it writes Markdown back, so
  the note would end up holding `\[52.5, 13.3\](geo:…)`.
- **Show GPX tracks in the note**: a code block with `gpx` as its language is drawn as an
  OpenStreetMap map when the note is viewed, with start and end markers and distance,
  ascent, duration and point count below it.

  ````markdown
  ```gpx
  <?xml version="1.0"?>
  <gpx version="1.1"><trk><trkseg>
    <trkpt lat="47.98976" lon="7.87755"><ele>278</ele></trkpt>
    <trkpt lat="47.99512" lon="7.88301"><ele>295</ele></trkpt>
  </trkseg></trk></gpx>
  ```
  ````

  Instead of pasting the GPX itself, the block can point at an **attached file** — the
  better way for real tracks, which would otherwise grow the note by hundreds of kilobytes.
  Attach the `.gpx` to the note and move the link Joplin inserts into the block:

  ````markdown
  ```gpx
  [tour.gpx](:/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6)
  ```
  ````

  **Please use the link form `[name](:/id)`**, not the bare ID: it is the only way Joplin
  recognises that the file belongs to this note. Without it the file counts as orphaned and
  can be removed when Joplin cleans up.

  Below the map you get **"Start point in maps app"**, and for an attached file also
  **"Open track in another app"** — that hands the `.gpx` to the system's app chooser
  through Joplin's own attachment handling, so it can go straight into OsmAnd.

  Gaps in a recording are not drawn as straight lines across the map, and very long tracks
  are thinned out for drawing (the statistics still use every point). Without a network the
  map area stays empty, but the numbers are there.
- **Swap latitude/longitude** and **clear** (with a confirming second tap)
- A **diagnostics** section that checks the plugin webview's environment and location access

## Languages

English and German. The plugin follows Joplin's own language setting and falls back to
English for anything else; a restart is needed after changing the language.

Adding a language means one block in `src/i18n/index.ts` — copy the English keys, translate
the values, and register the file under its language code. Missing keys fall back to
English, so a partial translation is still useful. Joplin has no translation mechanism for
plugins, so this is a plain string map rather than gettext.

## Installation

**Ready-made file:** [download the latest release](https://github.com/helge42/joplin-plugin-geodata/releases/latest)
(`io.github.helge42.geodata.jpl`).

On the phone: Settings → Plugins → install from file.
On the desktop: Tools → Options → Plugins → install from file.

Requires Joplin 3.6 or newer, on desktop and mobile. On iOS, Joplin only allows
recommended plugins from its repository, so this one cannot be installed there; the web
app at [app.joplincloud.com](https://app.joplincloud.com) does accept `.jpl` files.

In the **web app**, "Get current location" cannot work: Joplin puts plugin panels in a
sandboxed frame that is not granted the browser's location permission, so the request is
refused without a prompt — and no permission appears in the site settings that you could
grant by hand. The panel says so rather than pretending to search. Everything else works,
including paste & detect and the map.

**Build it yourself:**

```bash
npm install
npm run dist   # produces publish/io.github.helge42.geodata.jpl
```

## Development

```bash
npm test      # tests, no test framework involved
npm run dist  # builds dist/ and publish/*.jpl
```

Publishing a new version: raise `version` in `src/manifest.json`, commit, then

```bash
git tag v0.9.3 && git push --tags
```

Releases count up in the fourth segment and stay in the `0.9.4.x` line, so that the road to
a `1.0` stays long. Joplin does not validate the format, and its update check uses
`compare-versions`, whose pattern explicitly allows a fourth number — so such versions still
compare correctly. Note that strict semver tooling elsewhere (npm, should the plugin ever be
published there) only accepts three segments.

The workflow in `.github/workflows/release.yml` builds, tests and creates the release with
the `.jpl` attached. It refuses to run if the tag does not match the version in the
manifest.

Structure: all the logic — parsing, validation, storage — lives in the plugin process under
`src/`; the panel in `src/panel/` is deliberately dumb UI that only forwards intent through
`webviewApi.postMessage`. The plan, the research results and the open questions are in
[PLAN.md](PLAN.md).

## Licence

MIT
