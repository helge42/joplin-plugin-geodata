# Joplin Geodata

Ein Joplin-Plugin, um die Geodaten einer Notiz **anzusehen und zu bearbeiten** — gebaut
für die Android-App, wo Joplin die Koordinaten bisher nur als Karte öffnen, aber nicht
ändern kann.

Entstanden fürs Reisetagebuch: In geteilten Notizbüchern trägt Joplin beim Anlegen einer
Notiz oft keine Position ein, und ohne Bearbeitungsmöglichkeit bleibt die Notiz dann
dauerhaft ohne Ort.

## Funktionen

- **Anzeigen** der Koordinaten in Dezimalgrad und in Grad/Minuten/Sekunden, dazu Links zu
  OpenStreetMap und zur Karten-App des Geräts (`geo:`-URI)
- **Aktuellen Standort ermitteln** — ein Tap füllt Position und Höhe samt Genauigkeit in die
  Felder; gespeichert wird erst mit „Speichern", damit nichts ungefragt in die Notiz wandert
- **Karte** (OpenStreetMap): zeigt die Position der Notiz, ein Tap oder das Ziehen des Pins
  setzt einen neuen Punkt — gespeichert wird erst auf Knopfdruck. Leaflet ist im Plugin
  enthalten, nur die Kacheln brauchen Netz; ohne Verbindung bleibt der Rest voll bedienbar.
  Abschaltbar unter Einstellungen → Geodaten.
- **Manuell bearbeiten** mit Validierung von Breite, Länge und Höhe
- **Einfügen & erkennen**: ein Feld, das Koordinaten aus so ziemlich allem herausholt, was
  man aus einer Karten-App teilt — mit Live-Vorschau, bevor etwas gespeichert wird:

  | Eingabe | Beispiel |
  |---|---|
  | `geo:`-URI | `geo:52.5163,13.3777` · `geo:0,0?q=52.5163,13.3777(Ziel)` |
  | Dezimalgrad | `52.5163, 13.3777` · `52,5163 13,3777` · `N 52.5163 E 13.3777` |
  | Grad/Minuten/Sekunden | `52°30'58.7"N 13°22'39.7"E` |
  | OpenStreetMap | `…/?mlat=52.5163&mlon=13.3777` · `…/#map=15/52.5163/13.3777` |
  | Google Maps | `…/@52.5163,13.3777,15z` · `…!3d52.5163!4d13.3777` · `?q=…` |
  | Apple/Bing u. a. | `?ll=52.5163,13.3777` |

  Kurzlinks (`maps.app.goo.gl`) enthalten keine Koordinaten und werden mit einer
  Erklärung abgelehnt statt still zu scheitern.
- **Standort als Text in die Notiz einfügen** — an der Cursorposition, über den Knopf im
  Panel. Die Vorlage ist frei konfigurierbar:

  | Platzhalter | Ergebnis |
  |---|---|
  | `{lat}` `{lon}` `{alt}` | `52.5163` · `13.3777` · Höhe in Metern, leer wenn unbekannt |
  | `{dms}` | `52°30'58.7"N 13°22'39.7"E` |
  | `{geo}` | `geo:`-URI, öffnet die Karten-App des Geräts |
  | `{osm}` | Link auf OpenStreetMap |
  | `{date}` `{time}` | `2026-08-15` · `14:35` |
  | `{place}` | Ortsname von OpenStreetMap (braucht Netz, sonst leer) |

  Voreinstellung: `📍 [{lat}, {lon}]({geo})` — der `geo:`-Link öffnet auf dem Handy direkt
  die Karten-App. Eingefügt wird, was im Panel steht, auch ein gerade auf der Karte
  gesetzter Punkt; die Geodaten der Notiz bleiben davon unberührt.

  Im **Rich-Text-Editor** wird nur der Text ohne Link eingefügt: dieser Editor nimmt
  eingefügten Text wörtlich und maskiert beim Zurückschreiben die Klammern, sodass
  `\[52.5, 13.3\](geo:…)` in der Notiz stünde.
- **GPX-Tracks in der Notiz anzeigen**: ein Codeblock mit `gpx` als Sprache wird beim
  Betrachten als OpenStreetMap-Karte gezeichnet, mit Start- und Zielpunkt sowie Länge,
  Anstieg, Dauer und Punktzahl darunter.

  ````markdown
  ```gpx
  <?xml version="1.0"?>
  <gpx version="1.1"><trk><trkseg>
    <trkpt lat="47.98976" lon="7.87755"><ele>278</ele></trkpt>
    <trkpt lat="47.99512" lon="7.88301"><ele>295</ele></trkpt>
  </trkseg></trk></gpx>
  ```
  ````

  Aufnahmepausen werden nicht als Luftlinie durchgezogen, sehr lange Tracks zum Zeichnen
  ausgedünnt (die Statistik rechnet mit allen Punkten). Ohne Netz bleibt die Kartenfläche
  leer, die Zahlen stehen trotzdem da.
- **Breite/Länge tauschen** und **Löschen** (mit Bestätigungs-Tap)
- **Diagnose**-Bereich, der Umgebung und Standortzugriff des Plugin-WebViews prüft

## Installation

**Fertige Datei:** [neueste Version herunterladen](https://github.com/helge42/joplin-plugin-geodata/releases/latest)
(`io.github.helge42.geodata.jpl`).

Auf dem Handy: Einstellungen → Plugins → aus Datei installieren.
Auf dem Desktop: Werkzeuge → Optionen → Plugins → aus Datei installieren.

Benötigt Joplin 3.6 oder neuer, Desktop und Mobile.

**Selbst bauen:**

```bash
npm install
npm run dist   # erzeugt publish/io.github.helge42.geodata.jpl
```

## Entwicklung

```bash
npm test      # Parser-Tests, ohne Test-Framework
npm run dist  # baut dist/ und publish/*.jpl
```

Neue Version veröffentlichen: `version` in `src/manifest.json` hochziehen, committen, dann

```bash
git tag v0.2.0 && git push --tags
```

Der Workflow in `.github/workflows/release.yml` baut, testet und legt das Release mit der
`.jpl` an. Er bricht ab, wenn der Tag nicht zur Version im Manifest passt.

Aufbau: Die gesamte Logik (Parsen, Validieren, Speichern) liegt im Plugin-Prozess unter
`src/`; das Panel unter `src/panel/` ist bewusst dumme UI und schickt nur Absichten per
`webviewApi.postMessage`. Planung, Rechercheergebnisse und die offenen Punkte stehen in
[PLAN.md](PLAN.md).

## Lizenz

MIT
