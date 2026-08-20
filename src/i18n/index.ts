// Joplin has no translation mechanism for plugins - the core uses gettext, but plugins
// cannot hook into it. So this is the "simple string mapping" the maintainer suggests:
// English is the source language, other languages override individual keys, and anything
// missing falls back to English rather than showing a raw key.
//
// The user's language comes from joplin.settings.globalValue('locale') and is read once at
// startup; changing Joplin's language takes effect after a restart.

export type Translate = (key: string, params?: Record<string, string | number>) => string;
export type Dictionary = Record<string, string>;

const en: Dictionary = {
	// Settings
	'setting.section': 'Geodata',
	'setting.section.description': 'Viewing and editing the coordinates of a note.',
	'setting.showMap': 'Show the map in the panel',
	'setting.showMap.description': 'The map loads tiles from OpenStreetMap. Without it the panel works as before, just without a map.',
	'setting.insertTemplate': 'Template for "insert location"',
	'setting.insertTemplate.description': 'Placeholders: {placeholders} — {place} asks OpenStreetMap and needs a network.',

	// Commands
	'command.togglePanel': 'Show geodata',
	'command.insertLocation': 'Insert location into note',

	// Panel: labels
	'panel.noNote': 'No note selected',
	'panel.untitled': '(untitled)',
	'panel.noCoordinates': 'No geodata stored',
	'panel.latitude': 'Latitude',
	'panel.longitude': 'Longitude',
	'panel.altitude': 'Altitude (m)',
	'panel.save': 'Set note location',
	'panel.saveRemove': 'Remove location',
	'panel.discard': 'Reset',
	'panel.insertIntoNote': 'Insert into note',
	'panel.locate': 'Get current location',
	'panel.locating': 'Getting location …',
	'panel.paste': 'Paste & detect',
	'panel.pastePlaceholder': 'geo:… · maps link · 52.5163, 13.3777',
	'panel.swap': 'Swap latitude/longitude',
	'panel.clear': 'Clear',
	'panel.clearedFields': 'Fields emptied - saving removes the location from the note.',
	'panel.hideMap': 'Hide map',
	'panel.showMap': 'Show map',
	'panel.diagnostics': 'Diagnostics',
	'panel.probe': 'Check the environment',
	'panel.openStreetMap': 'OpenStreetMap',
	'panel.mapsApp': 'Maps app',

	// Panel: messages
	'panel.swapped': 'Swapped - press Save to keep it.',
	'panel.picked': 'Position picked - press Save to keep it.',
	'panel.located': 'Location found (±{accuracy} m) - press Save to keep it.',
	'panel.locateUnavailable': 'No location access in this plugin window. Share the location from a maps app and paste it below.',
	'panel.locateFailed': 'Location unavailable ({reason}). You can paste one below instead.',
	'panel.locateBlocked': 'The browser does not allow this plugin window to use the location - that is how the web app builds it, and no permission prompt can appear. Paste a position below instead.',
	'panel.editorClosed': 'Open the note for editing to insert.',
	'panel.noTiles': 'No map tiles - offline? Editing and saving still work.',
	'panel.noLeaflet': 'Map library not loaded.',
	'panel.probing': 'Checking … (the location request may take 20 s)',

	// Plugin messages
	'message.noNote': 'No note selected.',
	'message.saved': 'Saved.',
	'message.applied': 'Recognised: {source}',
	'message.cleared': 'Geodata cleared.',
	'message.inserted': 'Inserted: {text}',
	'message.insertedRichText': ' (rich text editor: as text, without a link)',
	'message.insertedFrom': 'Location inserted ({source}).',
	'message.sourceCurrent': 'current location',
	'message.sourceNote': 'the note\'s geodata',
	'message.noLocation': 'No location available. Fetch one in the Geodata panel and insert it there.',
	'message.editorClosed': 'The editor is not open. Open the note for editing, then insert.',
	'message.editorRefused': 'The editor did not accept the text. Open the note for editing and try again.',
	'message.invalidLatitude': 'Latitude has to be a number between -90 and 90.',
	'message.invalidLongitude': 'Longitude has to be a number between -180 and 180.',
	'message.invalidAltitude': 'Altitude has to be a number.',
	'message.invalidCoordinates': 'Received invalid coordinates.',
	'message.error': 'Error: {error}',
	'message.unknownMessage': 'Unknown message: {type}',
	'message.unknownRequest': 'Unknown request.',
	'message.resourceEmpty': 'The attached file is empty.',
	'message.resourceUnreadable': 'Attached file not readable: {error}',
	'message.resourceTooBig': 'The file is too big ({size} MB).',

	// Parser
	'parse.empty': 'Please paste something.',
	'parse.nothingFound': 'No coordinates recognised. Supported are geo: URIs, Google/OSM links, "52.5163, 13.3777" and 52°30\'58"N 13°22\'39"E.',
	'parse.shortLink': 'Shortened links carry no coordinates. Open the link in a maps app and copy the full address or the coordinates.',
	'parse.noneInLink': 'No coordinates found in this link.',
	'parse.latitudeRange': 'Latitude outside -90..90: {value}',
	'parse.longitudeRange': 'Longitude outside -180..180: {value}',
	'parse.source.geoUri': 'geo: URI',
	'parse.source.geoUriQuery': 'geo: URI (q=)',
	'parse.source.osmMarker': 'OpenStreetMap marker',
	'parse.source.osmLink': 'OpenStreetMap link',
	'parse.source.googlePlace': 'Google Maps place',
	'parse.source.googleCentre': 'Google Maps centre',
	'parse.source.mapLink': 'maps link',
	'parse.source.dms': 'degrees/minutes/seconds',
	'parse.source.decimal': 'decimal degrees',

	// GPX in the note viewer
	'gpx.loading': 'Loading track …',
	'gpx.noLeaflet': 'Map library (leaflet.js) was not loaded. After reinstalling the plugin, a restart of Joplin usually helps.',
	'gpx.invalidXml': 'The GPX could not be read (not valid XML).',
	'gpx.noPoints': 'No points found in the GPX.',
	'gpx.openInApp': 'Open track in another app',
	'gpx.openOrShare': 'Open or share track',
	'gpx.mimeWrong': 'File type is {mime} - mark as GPX',
	'gpx.mimeUnknown': 'File type is not set - mark as GPX',
	'gpx.mimeFixed': 'Marked as application/gpx+xml. Map apps should offer themselves now.',
	'gpx.mimeFailed': 'Could not change the file type: {error}',
	'gpx.startPoint': 'Start point in maps app',
	'gpx.reloadMap': 'Reload map',
	'gpx.points': '{count} points',
	'gpx.ascent': '{metres} m ascent',
	'gpx.noUrl': 'no resource URL - is the file linked as [name](:/id)?',
	'gpx.noPluginConnection': 'no plugin connection',
	'gpx.unknownError': 'unknown error',
	'gpx.emptyFile': 'file was empty',
	'gpx.unreadable': 'Attached file not readable ({problems}). URL: {url}',
};

const de: Dictionary = {
	'setting.section': 'Geodaten',
	'setting.section.description': 'Anzeige und Bearbeitung der Koordinaten einer Notiz.',
	'setting.showMap': 'Karte im Panel anzeigen',
	'setting.showMap.description': 'Die Karte lädt Kacheln von OpenStreetMap. Ohne Karte funktioniert das Panel unverändert, nur ohne Kartendarstellung.',
	'setting.insertTemplate': 'Vorlage für „Standort einfügen“',
	'setting.insertTemplate.description': 'Platzhalter: {placeholders} — {place} fragt OpenStreetMap und braucht Netz.',

	'command.togglePanel': 'Geodaten anzeigen',
	'command.insertLocation': 'Standort in Notiz einfügen',

	'panel.noNote': 'Keine Notiz ausgewählt',
	'panel.untitled': '(ohne Titel)',
	'panel.noCoordinates': 'Keine Geodaten hinterlegt',
	'panel.latitude': 'Breite',
	'panel.longitude': 'Länge',
	'panel.altitude': 'Höhe (m)',
	'panel.save': 'Notiz verorten',
	'panel.saveRemove': 'Verortung entfernen',
	'panel.discard': 'Zurücksetzen',
	'panel.insertIntoNote': 'In Notiz einfügen',
	'panel.locate': 'Aktuellen Standort ermitteln',
	'panel.locating': 'Standort wird ermittelt …',
	'panel.paste': 'Einfügen & erkennen',
	'panel.pastePlaceholder': 'geo:… · Maps-Link · 52.5163, 13.3777',
	'panel.swap': 'Breite/Länge tauschen',
	'panel.clear': 'Löschen',
	'panel.clearedFields': 'Felder geleert - Speichern entfernt die Verortung aus der Notiz.',
	'panel.hideMap': 'Karte ausblenden',
	'panel.showMap': 'Karte anzeigen',
	'panel.diagnostics': 'Diagnose',
	'panel.probe': 'Umgebung prüfen',
	'panel.openStreetMap': 'OpenStreetMap',
	'panel.mapsApp': 'Karten-App',

	'panel.swapped': 'Getauscht - zum Übernehmen speichern.',
	'panel.picked': 'Position gewählt - zum Übernehmen speichern.',
	'panel.located': 'Standort ermittelt (±{accuracy} m) - zum Übernehmen speichern.',
	'panel.locateUnavailable': 'Kein Standortzugriff in diesem Plugin-Fenster. Standort in der Karten-App teilen und unten einfügen.',
	'panel.locateFailed': 'Standort nicht verfügbar ({reason}). Alternativ unten einfügen.',
	'panel.locateBlocked': 'Der Browser erlaubt diesem Plugin-Fenster keinen Standortzugriff - so ist die Web-App gebaut, es kann auch keine Nachfrage erscheinen. Stattdessen unten eine Position einfügen.',
	'panel.editorClosed': 'Zum Einfügen die Notiz im Bearbeiten-Modus öffnen.',
	'panel.noTiles': 'Keine Kartenkacheln - offline? Bearbeiten und Speichern geht trotzdem.',
	'panel.noLeaflet': 'Kartenbibliothek nicht geladen.',
	'panel.probing': 'Prüfe … (Standortabfrage kann 20 s dauern)',

	'message.noNote': 'Keine Notiz ausgewählt.',
	'message.saved': 'Gespeichert.',
	'message.applied': 'Erkannt: {source}',
	'message.cleared': 'Geodaten gelöscht.',
	'message.inserted': 'Eingefügt: {text}',
	'message.insertedRichText': ' (Rich-Text-Editor: als Text ohne Link)',
	'message.insertedFrom': 'Standort eingefügt ({source}).',
	'message.sourceCurrent': 'aktueller Standort',
	'message.sourceNote': 'Geodaten der Notiz',
	'message.noLocation': 'Kein Standort verfügbar. Im Geodaten-Panel den Standort holen und dort einfügen.',
	'message.editorClosed': 'Der Editor ist nicht geöffnet. Notiz zum Bearbeiten öffnen, dann einfügen.',
	'message.editorRefused': 'Der Editor hat den Text nicht angenommen. Notiz zum Bearbeiten öffnen und erneut versuchen.',
	'message.invalidLatitude': 'Breite muss eine Zahl zwischen -90 und 90 sein.',
	'message.invalidLongitude': 'Länge muss eine Zahl zwischen -180 und 180 sein.',
	'message.invalidAltitude': 'Höhe muss eine Zahl sein.',
	'message.invalidCoordinates': 'Ungültige Koordinaten erhalten.',
	'message.error': 'Fehler: {error}',
	'message.unknownMessage': 'Unbekannte Nachricht: {type}',
	'message.unknownRequest': 'Unbekannte Anfrage.',
	'message.resourceEmpty': 'Die angehängte Datei ist leer.',
	'message.resourceUnreadable': 'Angehängte Datei nicht lesbar: {error}',
	'message.resourceTooBig': 'Die Datei ist mit {size} MB zu groß.',

	'parse.empty': 'Bitte etwas einfügen.',
	'parse.nothingFound': 'Keine Koordinaten erkannt. Unterstützt werden geo:-URIs, Google-/OSM-Links, „52.5163, 13.3777“ und 52°30\'58"N 13°22\'39"E.',
	'parse.shortLink': 'Kurzlinks enthalten keine Koordinaten. Bitte den Link in der Karten-App öffnen und die vollständige Adresse oder die Koordinaten kopieren.',
	'parse.noneInLink': 'In diesem Link wurden keine Koordinaten gefunden.',
	'parse.latitudeRange': 'Breitengrad außerhalb -90..90: {value}',
	'parse.longitudeRange': 'Längengrad außerhalb -180..180: {value}',
	'parse.source.geoUri': 'geo:-URI',
	'parse.source.geoUriQuery': 'geo:-URI (q=)',
	'parse.source.osmMarker': 'OpenStreetMap-Marker',
	'parse.source.osmLink': 'OpenStreetMap-Link',
	'parse.source.googlePlace': 'Google-Maps-Ort',
	'parse.source.googleCentre': 'Google-Maps-Kartenmitte',
	'parse.source.mapLink': 'Karten-Link',
	'parse.source.dms': 'Grad/Minuten/Sekunden',
	'parse.source.decimal': 'Dezimalgrad',

	'gpx.loading': 'Track wird geladen …',
	'gpx.noLeaflet': 'Kartenbibliothek (leaflet.js) wurde nicht geladen. Nach einer Neuinstallation des Plugins hilft meist ein Neustart von Joplin.',
	'gpx.invalidXml': 'GPX konnte nicht gelesen werden (kein gültiges XML).',
	'gpx.noPoints': 'Keine Punkte im GPX gefunden.',
	'gpx.openInApp': 'Track in anderer App öffnen',
	'gpx.openOrShare': 'Track öffnen oder teilen',
	'gpx.mimeWrong': 'Dateityp ist {mime} - als GPX kennzeichnen',
	'gpx.mimeUnknown': 'Dateityp fehlt - als GPX kennzeichnen',
	'gpx.mimeFixed': 'Als application/gpx+xml gekennzeichnet. Karten-Apps sollten sich jetzt anbieten.',
	'gpx.mimeFailed': 'Dateityp ließ sich nicht ändern: {error}',
	'gpx.startPoint': 'Startpunkt in Karten-App',
	'gpx.reloadMap': 'Karte neu laden',
	'gpx.points': '{count} Punkte',
	'gpx.ascent': '{metres} m bergauf',
	'gpx.noUrl': 'keine Ressourcen-URL - ist die Datei als [name](:/id) verlinkt?',
	'gpx.noPluginConnection': 'keine Plugin-Verbindung',
	'gpx.unknownError': 'unbekannter Fehler',
	'gpx.emptyFile': 'Datei war leer',
	'gpx.unreadable': 'Angehängte Datei nicht lesbar ({problems}). URL: {url}',
};

const languages: Record<string, Dictionary> = { de };

// Missing keys in a translation fall back to English, so a half-finished language file
// still produces a usable UI.
export const dictionaryFor = (locale: string): Dictionary => {
	const language = String(locale || 'en').replace('-', '_').split('_')[0].toLowerCase();
	const translation = languages[language];
	return translation ? { ...en, ...translation } : { ...en };
};

export const createTranslate = (dictionary: Dictionary): Translate => (key, params) => {
	const template = dictionary[key] !== undefined ? dictionary[key] : key;
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
};

export const englishDictionary = () => ({ ...en });
