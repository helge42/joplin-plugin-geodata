# Joplin-Plugin "Reisetagebuch / Geodaten" — Plan

Stand: 2026-08-15

## 1. Ziel

Joplin (Schwerpunkt **Android/Mobile**) so erweitern, dass Notizen als Reisetagebuch mit
Geobezug nutzbar sind:

1. **MVP:** Geodaten einer Notiz ansehen und bearbeiten (manuell + "aktueller Standort")
2. Aktuellen Standort als Text in die Notiz einfügen
3. GPX-Tracks in der Notiz darstellen (OSM-Karte), optional als Bild sichern

---

## 2. Rechercheergebnisse (harte Fakten, verifiziert)

| Frage | Antwort | Quelle |
|---|---|---|
| Sind `latitude`/`longitude`/`altitude` per Plugin-API schreibbar? | **Ja**, normale Note-Felder, `PUT /notes/:id` bzw. `joplin.data.put` | [Data API](https://joplinapp.org/help/api/references/rest_api/) |
| Laufen Plugins auf Mobile? | Ja, seit Joplin 3.x. Jedes Plugin läuft in einem `iframe` in einer `WebView`. Manifest braucht `"platforms": ["desktop","mobile"]` | [Mobile Plugin Debugging](https://joplinapp.org/help/api/references/mobile_plugin_debugging/), [Manifest](https://joplinapp.org/help/api/references/plugin_manifest/) |
| Wie sieht man ein Panel auf Mobile? | Panels erscheinen in einem **Tab-Dialog**, der über einen Toolbar-Button im Notiz-Editor geöffnet wird. `panels.show()`/`.visible` verhalten sich anders als auf Desktop | [joplin.views.panels](https://joplinapp.org/api/references/plugin_api/classes/joplinviewspanels.html), [Forum](https://discourse.joplinapp.org/t/plugin-api-what-should-panels-show-and-panels-visible-do-on-mobile/37507) |
| Gibt es eine Geolocation-API für Plugins? | **Nein.** Laurent (Maintainer) im Forum: *"We don't currently expose this API but a PR would be accepted if you're interested in implementing it."* | [Forum: Geolocation API](https://discourse.joplinapp.org/t/geolocation-api/47854) |
| Geht `navigator.geolocation` im Plugin-WebView? | **Ja, auf Android bestätigt.** Getestet auf Joplin-Android 3.6.21 (Xperia 5 III, Android 16, WebView Chrome 149): `getCurrentPosition` liefert einen echten Fix. — *Korrektur:* aus `ExtendedWebView/index.tsx` (keine Prop `geolocationEnabled`) hatte ich das Gegenteil geschlossen; das Gerät sagt etwas anderes. iOS ist ungetestet und bleibt fraglich. | Messung am Gerät, 2026-08-15 |
| Setzt Joplin Geodaten beim Anlegen einer Notiz über die API? | **Nein.** `Note.updateGeolocation()` wird ausschließlich beim ersten Speichern einer *provisorischen* Notiz aus dem Editor-UI aufgerufen (`packages/lib/components/shared/note-screen-shared.ts`), gated durch Setting `trackLocation`. Zusätzlich: 10-Minuten-Cache der letzten Position. | Joplin-Quellcode `dev` |
| Überschreibt der offene Editor meine per Plugin geschriebenen Koordinaten? | **Nein.** Der Editor speichert nur geänderte Felder (`fields: BaseModel.diffObjectsFields(lastSavedNote, note)`). Lat/Lon sind nicht im Diff. (UI zeigt aber ggf. bis zum Neuladen alte Werte.) | Joplin-Quellcode `dev` |
| Plugin per Datei auf dem Handy installierbar? | Ja, `PluginUploadButton` im Mobile-Config-Screen → `.jpl` direkt installierbar | Joplin-Quellcode `dev` |

### Konsequenz für Feature "aktuellen Standort eintragen"

**Gelöst — `navigator.geolocation` funktioniert im Plugin-Panel auf Android** (am Gerät
bestätigt, s. o.). Ein Tap auf „Aktuellen Standort übernehmen“ holt einen echten Fix samt
Genauigkeit und schreibt ihn in die Notiz. Das ist der Hauptweg.

Historie der erwogenen Wege, damit die Entscheidung nachvollziehbar bleibt:

| Weg | Status |
|---|---|
| **A — Upstream-PR** an Joplin (`joplin.geolocation` in der Plugin-API) | **nicht mehr nötig.** Wäre nur der saubere Weg gewesen, wenn der WebView den Zugriff blockte — tut er nicht. |
| **B — Einfügen/Parsen** aus anderer App (`geo:`-URI, Maps-/OSM-Links, DMS, Dezimalgrad) | **bleibt als Fallback**, und zwar ein nützlicher: wenn kein Fix zu bekommen ist (drinnen, Tunnel) oder wenn die Koordinate zu einem Ort gehört, an dem man gerade nicht steht — beim Reisetagebuch der Normalfall beim Nachpflegen. |
| ~~**C — Umweg über neue Notiz**~~ | **verworfen.** Praxiserfahrung: in geteilten Notizbüchern trägt Joplin so gut wie nie eine Location ein (vermutlich Timing zwischen Notiz-Anlage und GPS-Fix). Als Fundament unbrauchbar — und genau der Grund für dieses Plugin. |
| **D — Web-Version** von Joplin im Browser | nur für Entwicklung/Test relevant |

Offen bleibt iOS: dort ist der Zugriff ungetestet und laut WKWebView-Verhalten fraglich.
Falls das je relevant wird, ist B die Rückfallebene, die dann trägt.

---

## 3. Architektur

```
joplin-plugin-geo/
├─ manifest.json          platforms: ["desktop","mobile"]
├─ src/
│  ├─ index.ts            Plugin-Main: Panel, Commands, Settings, Message-Router
│  ├─ location/
│  │   ├─ provider.ts     getCurrentPosition(): joplin.geolocation → navigator → null
│  │   ├─ parse.ts        Text → {lat,lon,alt}  (geo:, DD, DMS, Maps-/OSM-URLs)
│  │   └─ format.ts       {lat,lon} → DD / DMS / geo: / Links
│  ├─ notes.ts            read/write der Note-Felder via joplin.data
│  ├─ panel/
│  │   ├─ panel.html/.css/.js   UI im WebView (Werte, Formular, Karte)
│  │   └─ vendor/leaflet.*      lokal gebündelt (kein CDN, offline-tauglich)
│  └─ gpx/                (Phase 4)
│      ├─ contentScript.ts      markdown-it-Plugin für ```gpx-Blöcke
│      └─ viewer.js             Leaflet-Rendering im Notiz-Viewer
```

**Datenfluss Panel ↔ Plugin:** `webviewApi.postMessage()` im Panel →
`panel.onMessage()` im Plugin → `joplin.data.get/put(['notes', id], …)`.
Aktualisierung bei `workspace.onNoteSelectionChange` und `workspace.onNoteChange`.

**Grundsatz Offline-First:** Die Reise findet ohne Netz statt. Zahlen-Eingabe, Parser,
Formatierung, GPX-Parsing müssen komplett offline funktionieren; Kartenkacheln und
Reverse-Geocoding (Nominatim) sind optionale, abschaltbare Extras.

---

## 4. Phasen

### Phase 0 — Setup & Spike (halber Tag)

Ziel: Werkzeugkette steht und die unsicheren API-Fragen sind am echten Gerät beantwortet.

- [ ] Node.js installieren — **Entscheidung: per apt** (`sudo apt install nodejs npm`, Debian 13
      liefert Node 20; muss von dir mit sudo ausgeführt werden)
- [ ] `git init` im Projektverzeichnis (aktuell kein Repo)
- [ ] `npx yo joplin` → Gerüst, `platforms: ["desktop","mobile"]`
- [ ] Build `npm run dist` → `.jpl` → auf Handy per Einstellungen → Plugins → Datei installieren
- [x] Gerüst aus den Generator-Templates (`generator-joplin`), Platzhalter gefüllt,
      `npm install`, `npm run dist` → `.jpl` baut
- [x] Parser-Tests: `npm test` (26 Fälle, dependency-frei)

**Bereits ohne Gerät beantwortet:** Die mitgelieferten API-Typen in `api/*.d.ts` markieren
desktop-only Member mit `<span class="platform-desktop">`. Daraus ergibt sich verbindlich:

| API | Mobile |
|---|---|
| `views.panels` (inkl. `postMessage`/`onMessage`), `views.toolbarButtons`, `contentScripts`, `data`, `settings`, `commands`, `views.editors` | **verfügbar** |
| `workspace` | verfügbar, außer `filterEditorContextMenu` |
| `views.dialogs` | verfügbar, außer `showOpenDialog` |
| `ToolbarButtonLocation.EditorToolbar` | verfügbar — `NoteToolbar` ist desktop-only |
| `views.menuItems`, `clipboard`, `imaging`, `fs`, `interop`, `window`, `ai`, `joplin.require` | **desktop-only** |

Folgen: Einstiegspunkt ist Panel + `EditorToolbar` (keine Menüpunkte auf Mobile);
kein Clipboard-Zugriff → das Einfügefeld ist ohnehin der richtige Weg;
`imaging`/`fs` desktop-only → Bild-Export in Phase 4 ist auf Mobile nur über den
`data:`-URL-Umweg denkbar.

- [x] **Am Gerät geprüft** — Joplin-Android 3.6.21, Xperia 5 III, Android 16,
      WebView Chrome 149 (Diagnose-Bereich im Panel):
  - Panel und Panel-Button funktionieren
  - **OSM-Kachel lädt (256×256), `fetch` auf Nominatim liefert 200** — keine CSP-Sperre.
    Damit sind Karte im Panel, Reverse-Geocoding und GPX-Rendering technisch frei.
  - `isSecureContext: true`
- [ ] Offen: taugt `navigator.geolocation` wirklich etwas? Die erste Messung prüfte nur die
      Existenz des Objekts (in Androids WebView auch bei abgeschaltetem Zugriff vorhanden)
      und `!!joplin.geolocation`, was der Sandbox-Proxy immer mit „wahr“ beantwortet.
      Beides ist ersetzt durch eine echte `getCurrentPosition`-Abfrage und eine
      Kontrollprobe auf eine erfundene API.
- [ ] Offen: Öffnen `geo:`- und `https:`-Links aus dem Panel die jeweilige App?
- [ ] Offen: Bleibt ein per `data.put` geschriebener Wert stehen, während die Notiz offen ist?

### Phase 1 — MVP: Geodaten ansehen & bearbeiten (Kernziel)

Panel „Geodaten“, geöffnet über den Plugin-Button im Notiz-Editor:

- **Anzeigen:** Breite/Länge/Höhe als Werte, wahlweise Dezimalgrad oder DMS;
  Hinweis „keine Geodaten“ wenn 0/0; Links „In Karte öffnen“ (OSM, `geo:`-URI für lokale App)
- **Bearbeiten:**
  - zwei Zahlenfelder + Höhe, Validierung (-90..90 / -180..180), Speichern/Verwerfen
  - **Einfügen & Parsen**: ein Textfeld, das `geo:52.5,13.4`, `52.5163, 13.3777`,
    `52°30'58"N 13°22'40"E`, `google.com/maps/@…`, `openstreetmap.org/#map=…`,
    `maps.app.goo.gl`-Kurzlinks (nur online auflösbar) frisst
  - Buttons: **Löschen** (auf 0/0), **Lat/Lon tauschen**, **Von anderer Notiz übernehmen**
  - **Aktueller Standort**: ein Tap, holt den Fix per `navigator.geolocation`
    (`enableHighAccuracy`), schreibt ihn samt Höhe in die Notiz und meldet die Genauigkeit;
    scheitert die Abfrage, verweist die Meldung auf das Einfügefeld
- **Karte (optional, nur online):** kleine Leaflet-Karte, Pin verschiebbar → setzt Koordinaten

*Deliverable: installierbares `.jpl`, das den Hauptwunsch erfüllt.*

**Stand 2026-08-15:** Anzeige (dezimal + DMS), Bearbeiten der drei Felder mit Validierung,
Einfügen+Erkennen mit Live-Vorschau, aktueller Standort per Tap, Tauschen, Löschen (mit
Bestätigungs-Tap), Links zu OSM und Karten-App, Diagnose-Bereich — alles am Gerät bestätigt.

Dazu die **Karte**: Leaflet 1.9.4 wird aus `node_modules` nach `src/panel/vendor/` kopiert
(`npm run vendor`, hängt am `dist`-Skript) und ist damit im `.jpl` enthalten — nur die
Kacheln brauchen Netz. Tap oder Pin-Ziehen setzt die Koordinaten in die Felder, gespeichert
wird weiterhin erst auf Knopfdruck. Der Kartenausschnitt springt nur beim Notizwechsel,
damit eigenes Zoomen nicht bei jedem Speichern verlorengeht. Häufen sich `tileerror`s,
erscheint ein Offline-Hinweis. Abschaltbar über die Einstellung `showMap`.
Der Pin ist bewusst CSS statt Leaflets Standard-Icon, das PNGs nachladen würde.

Offen: „Von anderer Notiz übernehmen", Umschalter Dezimal/DMS.

### Phase 2 — Standort in die Notiz einfügen

- Command **„Standort einfügen“** (Editor-Toolbar/Menü, sofern auf Mobile verfügbar)
- Einfügeformat über Settings konfigurierbar, z. B.
  `📍 [52.5163, 13.3777](geo:52.5163,13.3777)` oder Markdown-Link auf OSM,
  optional mit Zeitstempel und (online) Ortsname via Nominatim
- Quelle der Koordinaten: aktueller Standort *oder* die Geodaten der Notiz
- Optional: Ortsname als Notiz-Titel-Vorschlag

### Phase 3 — Komfort fürs Reisetagebuch

- Setting „Geodaten beim Anlegen automatisch übernehmen“ (aus letzter bekannter Position)
- Panel zeigt Ortsnamen (Reverse-Geocoding, gecacht, abschaltbar, Nominatim-Policy beachten)
- Massenaktion: „Alle Notizen dieses Ordners ohne Geodaten anzeigen“ → schnelles Nachpflegen
- Export der Notizen eines Ordners als GPX/GeoJSON (Reiseroute)

### Phase 4 — GPX-Tracks darstellen

- **Content-Script** (`MarkdownItPlugin`) rendert Blöcke:
  ```` ```gpx ```` mit **inline GPX** *oder* Verweis `resource: :/<resourceId>` auf eine
  angehängte `.gpx`-Datei (empfohlen — inline bläht die Notiz auf; große Tracks kommen
  ohnehin aus OsmAnd/GPSLogger als Datei)
- Viewer-Script parst GPX, zeichnet Track + Start/Ziel auf Leaflet/OSM,
  zeigt Distanz, Dauer, Höhenprofil
- **Als Bild speichern:** offen — Rasterisierung über Canvas ist machbar, das *Speichern*
  als Joplin-Ressource braucht auf Mobile einen Weg ohne Dateisystem (in Phase 0 prüfen).
  Fallbacks: (a) Bild als `data:`-URL direkt in die Notiz, (b) Live-Rendering statt Bild
  (für ein Tagebuch meist ausreichend), (c) Bildexport nur auf Desktop.

### ~~Phase A — Upstream-PR an Joplin~~ (entfallen)

Sollte `joplin.geolocation.currentPosition()` in der Plugin-API nachrüsten. Hinfällig, weil
`navigator.geolocation` im Panel-WebView bereits funktioniert. Bliebe nur relevant, falls
iOS-Unterstützung dazukommen soll oder eine Joplin-Version den Zugriff wieder zumacht.

---

## 5. Risiken / offene Punkte

- ~~**GPS aus dem Plugin**~~ — erledigt, funktioniert auf Android direkt. Restrisiko: Joplin
  oder Android könnten den Zugriff in einer künftigen Version wieder schließen; deshalb
  bleibt der Einfüge-Weg als vollwertige Alternative erhalten und wird nicht wegoptimiert.
- ~~**CSP im Plugin-WebView**~~ — erledigt, Kacheln und `fetch` sind nicht blockiert.
- **Theme-Variablen** — Joplins `--joplin-*`-Paare nicht mischen: Vorder- und Hintergrundfarbe
  müssen aus demselben Farbschema stammen, sonst entsteht im Dark-Theme Unlesbares
  (passiert mit `colorCorrect` auf `color4`).
- **Mobile-API-Lücken** — Menüpunkte/Toolbar-Buttons evtl. nicht überall verfügbar; Fallback ist
  immer das Panel.
- **Nominatim** — Nutzungsbedingungen (max. 1 req/s, aussagekräftiger User-Agent), daher
  optional, gecacht und per Default aus.
- **Sync-Konflikte** — Geodaten-Änderung ist ein normales Note-Update; unkritisch, erhöht aber
  `updated_time`.
- **Batterie/Genauigkeit** — bei später verfügbarem GPS: Timeout + Genauigkeitsanzeige vorsehen,
  nicht blind auf den ersten Fix vertrauen.
