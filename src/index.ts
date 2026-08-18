import joplin from 'api';
import { ContentScriptType, SettingItemType, ToastType, ToolbarButtonLocation } from 'api/types';
import { panelHtml } from './panel/markup';
import { parseLocation } from './location/parse';
import { Coordinates, isEmpty, isValidLatitude, isValidLongitude } from './location/types';
import { formatDecimal, formatPairDms, geoUri, osmUrl } from './location/format';
import { defaultTemplate, placeholders, renderTemplate, stripMarkdownLinks, usesPlaceholder } from './location/template';
import { reverseGeocode } from './geocode';
import { readNoteGeodata, readSelectedNoteGeodata, writeCoordinates } from './notes';
import { createTranslate, Dictionary, dictionaryFor, englishDictionary, Translate } from './i18n';

// The user's language is only known once onStart runs, so the module starts out English
// and is switched over there. Everything user-facing goes through this function.
let dictionary: Dictionary = englishDictionary();
let t: Translate = createTranslate(dictionary);

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
	if (!note) return emptyState(t('message.noNote'), '');

	const empty = isEmpty(note.coordinates);
	return {
		noteId: note.id,
		noteTitle: note.title || t('panel.untitled'),
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

	if (!isValidLatitude(latitude)) return { error: t('message.invalidLatitude'), coordinates: null as Coordinates };
	if (!isValidLongitude(longitude)) return { error: t('message.invalidLongitude'), coordinates: null as Coordinates };

	const altitude = rawAltitude === '' ? 0 : Number(rawAltitude);
	if (!Number.isFinite(altitude)) return { error: t('message.invalidAltitude'), coordinates: null as Coordinates };

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

// The resource body crosses a process boundary on its way to the plugin, and arrives as a
// Buffer, a serialised { type: 'Buffer', data: [...] }, a typed array or already as text
// depending on the platform. Normalise all of it to a string.
const decodeToText = (data: any): string => {
	if (typeof data === 'string') return data;
	if (!data) return '';

	let bytes: Uint8Array = null;
	if (data instanceof Uint8Array) bytes = data;
	else if (Array.isArray(data)) bytes = Uint8Array.from(data);
	else if (Array.isArray(data.data)) bytes = Uint8Array.from(data.data);
	else if (data.buffer) bytes = new Uint8Array(data.buffer);

	if (!bytes) return String(data);
	if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);

	let text = '';
	for (const byte of bytes) text += String.fromCharCode(byte);
	return text;
};

// 20 MB is far beyond any sensible track and keeps a mis-linked video from being pushed
// through the message channel.
const MAX_RESOURCE_BYTES = 20 * 1024 * 1024;

const readResourceText = async (resourceId: string) => {
	const info = await joplin.data.get(['resources', resourceId], { fields: ['id', 'title', 'size'] });
	if (info && info.size > MAX_RESOURCE_BYTES) throw new Error(t('message.resourceTooBig', { size: Math.round(info.size / 1024 / 1024) }));

	const file = await joplin.data.get(['resources', resourceId, 'file']);
	return decodeToText(file && file.body !== undefined ? file.body : file);
};

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

	// The editor can disappear between the availability check and this call, and the raw
	// "Cannot execute a command without a runtime" is not something to show a user.
	try {
		await joplin.commands.execute('insertText', text);
	} catch (error) {
		throw new Error(t('message.editorRefused'));
	}

	return { text, richText };
};

const requireNote = async (noteId: string) => {
	if (noteId) return noteId;
	const selected = await joplin.workspace.selectedNote();
	return selected ? selected.id : '';
};

joplin.plugins.register({
	onStart: async function() {
		const [locale] = await joplin.settings.globalValues(['locale']);
		dictionary = dictionaryFor(locale);
		t = createTranslate(dictionary);

		await joplin.settings.registerSection('geodata', {
			label: t('setting.section'),
			description: t('setting.section.description'),
		});

		await joplin.settings.registerSettings({
			showMap: {
				section: 'geodata',
				public: true,
				type: SettingItemType.Bool,
				value: true,
				label: t('setting.showMap'),
				description: t('setting.showMap.description'),
			},
			insertTemplate: {
				section: 'geodata',
				public: true,
				type: SettingItemType.String,
				value: defaultTemplate,
				label: t('setting.insertTemplate'),
				description: t('setting.insertTemplate.description', { placeholders: Object.keys(placeholders).join(' ') }),
			},
		});

		// Renders ```gpx blocks as an OpenStreetMap map in the note viewer.
		await joplin.contentScripts.register(
			ContentScriptType.MarkdownItPlugin,
			'geodata.gpx',
			'./gpx/contentScript.js',
		);

		// The note viewer cannot read resources itself, so it asks us for the file content
		// of an attached .gpx.
		await joplin.contentScripts.onMessage('geodata.gpx', async (message: any) => {
			if (message && message.type === 'strings') return { ok: true, strings: dictionary };
			if (!message || message.type !== 'gpxResource') return { ok: false, error: t('message.unknownRequest') };

			try {
				const text = await readResourceText(message.id);
				if (!text.trim()) return { ok: false, error: t('message.resourceEmpty') };
				return { ok: true, text };
			} catch (error) {
				console.error('Geodata: Ressource nicht lesbar:', error);
				return { ok: false, error: t('message.resourceUnreadable', { error: error.message || error }) };
			}
		});

		const panel = await joplin.views.panels.create('geodata.panel');
		await joplin.views.panels.setHtml(panel, panelHtml(t, dictionary));
		// Leaflet first: panel.js expects window.L to exist when it initialises the map.
		await joplin.views.panels.addScript(panel, './panel/vendor/leaflet.css');
		await joplin.views.panels.addScript(panel, './panel/vendor/leaflet.js');
		await joplin.views.panels.addScript(panel, './panel/panel.css');
		await joplin.views.panels.addScript(panel, './panel/panel.js');

		// Pushing to a panel that is not on screen has nowhere to arrive and makes Joplin log
		// "no viewMessageHandler was found" for every note change. The panel fetches the
		// state itself when it opens, so skipping this costs nothing.
		const push = async (noteId = '') => {
			try {
				if (!await joplin.views.panels.visible(panel)) return;
			} catch (error) {
				// visible() behaves differently on mobile; if in doubt, send.
			}
			joplin.views.panels.postMessage(panel, { type: 'state', state: await buildState(noteId) });
		};

		await joplin.views.panels.onMessage(panel, async (message: any) => {
			try {
				switch (message.type) {

				case 'getState':
					return await buildState('');

				case 'save': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState(t('message.noNote'), 'error');

					const { error, coordinates } = coordinatesFromFields(message);
					if (error) return await buildState(noteId, error, 'error');

					await writeCoordinates(noteId, coordinates);
					return await buildState(noteId, t('message.saved'), 'ok');
				}

				// Parsing only fills the panel; writing to the note stays with the Save
				// button. Saving from here would also flip the mobile note screen back to
				// the viewer, which is a surprising thing for a paste field to do.
				case 'parse': {
					const result = parseLocation(message.text, t);
					if (!result.coordinates) return { ok: false, hint: result.error };

					return {
						ok: true,
						latitude: formatDecimal(result.coordinates.latitude),
						longitude: formatDecimal(result.coordinates.longitude),
						altitude: result.coordinates.altitude ? formatDecimal(result.coordinates.altitude) : '',
						hint: t('message.applied', { source: result.source }),
					};
				}

				case 'clear': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState(t('message.noNote'), 'error');

					await writeCoordinates(noteId, { latitude: 0, longitude: 0, altitude: 0 });
					return await buildState(noteId, t('message.cleared'), 'ok');
				}

				case 'editorAvailable':
					return await editorAvailable();

				case 'insertLocation': {
					const noteId = await requireNote(message.noteId);
					if (!noteId) return emptyState(t('message.noNote'), 'error');

					const { error, coordinates } = coordinatesFromFields(message);
					if (error) return await buildState(noteId, error, 'error');

					if (!await editorAvailable()) {
						return await buildState(noteId, t('message.editorClosed'), 'error');
					}

					// Inserting text must not touch the note's own coordinates.
					const { text, richText } = await insertLocationText(coordinates);
					const note = richText ? t('message.insertedRichText') : '';
					return await buildState(noteId, `${t('message.inserted', { text })}${note}`, 'ok');
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
					return { error: t('message.unknownMessage', { type: message.type }) };
				}
			} catch (error) {
				console.error('Geodata plugin:', error);
				return emptyState(t('message.error', { error: error.message || error }), 'error');
			}
		});

		await joplin.commands.register({
			name: 'geodata.togglePanel',
			label: t('command.togglePanel'),
			execute: async () => {
				const visible = await joplin.views.panels.visible(panel);
				await joplin.views.panels.show(panel, !visible);
			},
		});

		await joplin.commands.register({
			name: 'geodata.insertLocation',
			label: t('command.insertLocation'),
			execute: async () => {
				// Prefer a fresh fix; fall back to what the note already carries, so the
				// command stays useful indoors and when writing up a trip afterwards.
				let coordinates = await pluginProcessPosition();
				let source = t('message.sourceCurrent');

				if (!coordinates) {
					const note = await readSelectedNoteGeodata();
					if (note && !isEmpty(note.coordinates)) {
						coordinates = note.coordinates;
						source = t('message.sourceNote');
					}
				}

				if (!coordinates) {
					await joplin.views.dialogs.showToast({
						message: t('message.noLocation'),
						type: ToastType.Error,
					});
					return;
				}

				if (!await editorAvailable()) {
					await joplin.views.dialogs.showToast({
						message: t('message.editorClosed'),
						type: ToastType.Error,
					});
					return;
				}

				await insertLocationText(coordinates);
				await joplin.views.dialogs.showToast({
					message: t('message.insertedFrom', { source }),
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
