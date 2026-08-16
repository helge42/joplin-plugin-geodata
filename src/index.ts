import joplin from 'api';
import { ContentScriptType, SettingItemType, ToastType, ToolbarButtonLocation } from 'api/types';
import { panelHtml } from './panel/markup';
import { parseLocation } from './location/parse';
import { Coordinates, isEmpty, isValidLatitude, isValidLongitude } from './location/types';
import { formatDecimal, formatPairDms, geoUri, osmUrl } from './location/format';
import { defaultTemplate, placeholders, renderTemplate, stripMarkdownLinks, usesPlaceholder } from './location/template';
import { reverseGeocode } from './geocode';
import { readNoteGeodata, readSelectedNoteGeodata, writeCoordinates } from './notes';

interface PanelState {
	noteId: string;
	noteTitle: string;
	hasCoordinates: boolean;
	latitude: string;
	longitude: string;
	altitude: string;
	dms: string;
	osmUrl: string;
	geoUri: string;
	message: string;
	messageKind: 'ok' | 'error' | '';
}

const emptyState = (message = '', messageKind: PanelState['messageKind'] = ''): PanelState => ({
	noteId: '',
	noteTitle: '',
	hasCoordinates: false,
	latitude: '',
	longitude: '',
	altitude: '',
	dms: '',
	osmUrl: '',
	geoUri: '',
	message,
	messageKind,
});

const buildState = async (noteId: string, message = '', messageKind: PanelState['messageKind'] = ''): Promise<PanelState> => {
	const note = noteId ? await readNoteGeodata(noteId) : await readSelectedNoteGeodata();
	if (!note) return emptyState('Keine Notiz ausgewählt.', '');

	const empty = isEmpty(note.coordinates);
	return {
		noteId: note.id,
		noteTitle: note.title || '(ohne Titel)',
		hasCoordinates: !empty,
		latitude: empty ? '' : formatDecimal(note.coordinates.latitude),
		longitude: empty ? '' : formatDecimal(note.coordinates.longitude),
		altitude: note.coordinates.altitude ? formatDecimal(note.coordinates.altitude) : '',
		dms: empty ? '' : formatPairDms(note.coordinates),
		osmUrl: empty ? '' : osmUrl(note.coordinates),
		geoUri: empty ? '' : geoUri(note.coordinates),
		message,
		messageKind,
	};
};

// Turns the three text fields into coordinates, or explains what is wrong with them.
const coordinatesFromFields = (message: { latitude: string; longitude: string; altitude: string }) => {
	const latitude = Number(String(message.latitude ?? '').replace(',', '.').trim());
	const longitude = Number(String(message.longitude ?? '').replace(',', '.').trim());
	const rawAltitude = String(message.altitude ?? '').replace(',', '.').trim();

	if (!isValidLatitude(latitude)) return { error: 'Breite muss eine Zahl zwischen -90 und 90 sein.', coordinates: null as Coordinates };
	if (!isValidLongitude(longitude)) return { error: 'Länge muss eine Zahl zwischen -180 und 180 sein.', coordinates: null as Coordinates };

	const altitude = rawAltitude === '' ? 0 : Number(rawAltitude);
	if (!Number.isFinite(altitude)) return { error: 'Höhe muss eine Zahl sein.', coordinates: null as Coordinates };

	return { error: '', coordinates: { latitude, longitude, altitude } };
};

// The panel webview reaches the device GPS on Android. Whether the plugin process does too
// is not documented, so this stays a best effort with a hard timeout: if nothing comes
// back, the caller falls back to the coordinates already stored on the note.
const pluginProcessPosition = (): Promise<Coordinates | null> => new Promise((resolve) => {
	const geolocation = (globalThis as any).navigator?.geolocation;
	if (!geolocation) return resolve(null);

	let settled = false;
	const finish = (value: Coordinates | null) => {
		if (settled) return;
		settled = true;
		resolve(value);
	};

	setTimeout(() => finish(null), 20000);
	geolocation.getCurrentPosition(
		(position: any) => finish({
			latitude: position.coords.latitude,
			longitude: position.coords.longitude,
			altitude: position.coords.altitude === null || position.coords.altitude === undefined ? null : position.coords.altitude,
		}),
		() => finish(null),
		{ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
	);
});

// Editor commands only have a runtime while an editor is mounted. `selectedText` reads and
// changes nothing, which makes it a safe probe for "can we insert right now?".
const editorAvailable = async () => {
	try {
		await joplin.commands.execute('selectedText');
		return true;
	} catch (error) {
		return false;
	}
};

// Builds the snippet and drops it at the cursor. `insertText` exists on desktop and mobile
// alike - it is what Joplin's own "Insert time" uses.
const insertLocationText = async (coordinates: Coordinates) => {
	const template = (await joplin.settings.value('insertTemplate')) || defaultTemplate;
	const place = usesPlaceholder(template, 'place') ? await reverseGeocode(coordinates) : '';
	const rendered = renderTemplate(template, { coordinates, place, now: new Date() });

	const [codeView] = await joplin.settings.globalValues(['editor.codeView']);
	const richText = codeView === false;
	const text = richText ? stripMarkdownLinks(rendered) : rendered;

	await joplin.commands.execute('insertText', text);
	return { text, richText };
};

const requireNote = async (noteId: string) => {
	if (noteId) return noteId;
	const selected = await joplin.workspace.selectedNote();
	return selected ? selected.id : '';
};

joplin.plugins.register({
	onStart: async function() {
		await joplin.settings.registerSection('geodata', {
			label: 'Geodaten',
			description: 'Anzeige und Bearbeitung der Koordinaten einer Notiz.',
		});

		await joplin.settings.registerSettings({
			showMap: {
				section: 'geodata',
				public: true,
				type: SettingItemType.Bool,
				value: true,
				label: 'Karte im Panel anzeigen',
				description: 'Die Karte lädt Kacheln von OpenStreetMap. Ohne Karte funktioniert das Panel unverändert, nur ohne Kartendarstellung.',
			},
			insertTemplate: {
				section: 'geodata',
				public: true,
				type: SettingItemType.String,
				value: defaultTemplate,
				label: 'Vorlage für "Standort einfügen"',
				description: `Platzhalter: ${Object.keys(placeholders).join(' ')} — {place} fragt OpenStreetMap und braucht Netz.`,
			},
		});

		// Renders ```gpx blocks as an OpenStreetMap map in the note viewer.
		await joplin.contentScripts.register(
			ContentScriptType.MarkdownItPlugin,
			'geodata.gpx',
			'./gpx/contentScript.js',
		);

		const panel = await joplin.views.panels.create('geodata.panel');
		await joplin.views.panels.setHtml(panel, panelHtml);
		// Leaflet first: panel.js expects window.L to exist when it initialises the map.
		await joplin.views.panels.addScript(panel, './panel/vendor/leaflet.css');
		await joplin.views.panels.addScript(panel, './panel/vendor/leaflet.js');
		await joplin.views.panels.addScript(panel, './panel/panel.css');
		await joplin.views.panels.addScript(panel, './panel/panel.js');

		const push = async (noteId = '') => {
			joplin.views.panels.postMessage(panel, { type: 'state', state: await buildState(noteId) });
		};

		await joplin.views.panels.onMessage(panel, async (message: any) => {
			try {
				switch (message.type) {

				case 'getState':
					return await buildState('');

				case 'save': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState('Keine Notiz ausgewählt.', 'error');

					const { error, coordinates } = coordinatesFromFields(message);
					if (error) return await buildState(noteId, error, 'error');

					await writeCoordinates(noteId, coordinates);
					return await buildState(noteId, 'Gespeichert.', 'ok');
				}

				case 'preview': {
					const result = parseLocation(message.text);
					if (!result.coordinates) return { ok: false, hint: result.error };
					return {
						ok: true,
						hint: `${result.source}: ${formatDecimal(result.coordinates.latitude)}, ${formatDecimal(result.coordinates.longitude)}`,
					};
				}

				case 'apply': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState('Keine Notiz ausgewählt.', 'error');

					const result = parseLocation(message.text);
					if (!result.coordinates) return await buildState(noteId, result.error, 'error');

					await writeCoordinates(noteId, result.coordinates);
					return await buildState(noteId, `Übernommen (${result.source}).`, 'ok');
				}

				case 'clear': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState('Keine Notiz ausgewählt.', 'error');

					await writeCoordinates(noteId, { latitude: 0, longitude: 0, altitude: 0 });
					return await buildState(noteId, 'Geodaten gelöscht.', 'ok');
				}

				case 'editorAvailable':
					return await editorAvailable();

				case 'insertLocation': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState('Keine Notiz ausgewählt.', 'error');

					const { error, coordinates } = coordinatesFromFields(message);
					if (error) return await buildState(noteId, error, 'error');

					if (!await editorAvailable()) {
						return await buildState(noteId, 'Der Editor ist nicht geöffnet. Notiz zum Bearbeiten öffnen, dann einfügen.', 'error');
					}

					// Inserting text must not touch the note's own coordinates.
					const { text, richText } = await insertLocationText(coordinates);
					const note = richText ? ' (Rich-Text-Editor: als Text ohne Link)' : '';
					return await buildState(noteId, `Eingefügt: ${text}${note}`, 'ok');
				}

				case 'getSettings':
					return { showMap: await joplin.settings.value('showMap') };

				case 'setShowMap':
					await joplin.settings.setValue('showMap', !!message.value);
					return { showMap: !!message.value };

				case 'diagnostics': {
					const version = await joplin.versionInfo();

					// The plugin API is a sandbox proxy that answers *any* property access with
					// another proxy, so a truthy `joplin.geolocation` proves nothing. The control
					// probe below asks for an API that certainly does not exist: if it is also
					// "present", both answers are worthless.
					const geolocationApi = !!(joplin as any).geolocation;
					const controlProbe = !!(joplin as any).thisApiDoesNotExist;

					return {
						version: version.version,
						platform: version.platform,
						geolocationApi,
						controlProbe,
					};
				}

				default:
					return { error: `Unbekannte Nachricht: ${message.type}` };
				}
			} catch (error) {
				console.error('Geodata plugin:', error);
				return emptyState(`Fehler: ${error.message || error}`, 'error');
			}
		});

		await joplin.commands.register({
			name: 'geodata.togglePanel',
			label: 'Geodaten anzeigen',
			execute: async () => {
				const visible = await joplin.views.panels.visible(panel);
				await joplin.views.panels.show(panel, !visible);
			},
		});

		await joplin.commands.register({
			name: 'geodata.insertLocation',
			label: 'Standort in Notiz einfügen',
			execute: async () => {
				// Prefer a fresh fix; fall back to what the note already carries, so the
				// command stays useful indoors and when writing up a trip afterwards.
				let coordinates = await pluginProcessPosition();
				let source = 'aktueller Standort';

				if (!coordinates) {
					const note = await readSelectedNoteGeodata();
					if (note && !isEmpty(note.coordinates)) {
						coordinates = note.coordinates;
						source = 'Geodaten der Notiz';
					}
				}

				if (!coordinates) {
					await joplin.views.dialogs.showToast({
						message: 'Kein Standort verfügbar. Im Geodaten-Panel den Standort holen und dort einfügen.',
						type: ToastType.Error,
					});
					return;
				}

				if (!await editorAvailable()) {
					await joplin.views.dialogs.showToast({
						message: 'Der Editor ist nicht geöffnet. Notiz zum Bearbeiten öffnen, dann einfügen.',
						type: ToastType.Error,
					});
					return;
				}

				await insertLocationText(coordinates);
				await joplin.views.dialogs.showToast({
					message: `Standort eingefügt (${source}).`,
					type: ToastType.Success,
				});
			},
		});

		// NoteToolbar is desktop-only, EditorToolbar works on both platforms.
		//
		// geodata.insertLocation deliberately has no toolbar button: the plugin process does
		// not reach the GPS (only the panel webview does), so the command would almost always
		// fall back to the coordinates already stored on the note. It stays registered for
		// the desktop command palette and keyboard shortcuts.
		await joplin.views.toolbarButtons.create('geodata.togglePanelButton', 'geodata.togglePanel', ToolbarButtonLocation.EditorToolbar);

		await joplin.workspace.onNoteSelectionChange(async () => {
			await push();
		});

		await joplin.workspace.onNoteChange(async (event: any) => {
			const selected = await joplin.workspace.selectedNote();
			if (selected && event && event.id === selected.id) await push(selected.id);
		});

		await push();
	},
});
