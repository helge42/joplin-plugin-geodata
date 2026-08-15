import joplin from 'api';
import { ToolbarButtonLocation } from 'api/types';
import { panelHtml } from './panel/markup';
import { parseLocation } from './location/parse';
import { Coordinates, isEmpty, isValidLatitude, isValidLongitude } from './location/types';
import { formatDecimal, formatPairDms, geoUri, osmUrl } from './location/format';
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

const requireNote = async (noteId: string) => {
	if (noteId) return noteId;
	const selected = await joplin.workspace.selectedNote();
	return selected ? selected.id : '';
};

joplin.plugins.register({
	onStart: async function() {
		const panel = await joplin.views.panels.create('geodata.panel');
		await joplin.views.panels.setHtml(panel, panelHtml);
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

				case 'setCoordinates': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState('Keine Notiz ausgewählt.', 'error');

					const coordinates: Coordinates = {
						latitude: Number(message.latitude),
						longitude: Number(message.longitude),
						altitude: message.altitude === null || message.altitude === undefined ? null : Number(message.altitude),
					};
					if (!isValidLatitude(coordinates.latitude) || !isValidLongitude(coordinates.longitude)) {
						return await buildState(noteId, 'Ungültige Koordinaten erhalten.', 'error');
					}

					await writeCoordinates(noteId, coordinates);
					return await buildState(noteId, message.note || 'Gespeichert.', 'ok');
				}

				case 'clear': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState('Keine Notiz ausgewählt.', 'error');

					await writeCoordinates(noteId, { latitude: 0, longitude: 0, altitude: 0 });
					return await buildState(noteId, 'Geodaten gelöscht.', 'ok');
				}

				case 'diagnostics': {
					const version = await joplin.versionInfo();
					return {
						version: version.version,
						platform: version.platform,
						// Present only where Joplin gained a geolocation API - see PLAN.md, Phase A.
						geolocationApi: !!(joplin as any).geolocation,
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

		// NoteToolbar is desktop-only, EditorToolbar works on both platforms.
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
