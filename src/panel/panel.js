/* Panel webview. Deliberately dumb: parsing, validation and storage all happen in the
   plugin process, this file only renders state and forwards intent. */

(() => {
	const $ = (id) => document.getElementById(id);

	// The dictionary is handed over in a data attribute so the strings are available
	// synchronously, without a round trip to the plugin process.
	const dictionary = JSON.parse($('geodata-root').dataset.strings || '{}');
	const t = (key, params) => {
		const template = dictionary[key] !== undefined ? dictionary[key] : key;
		if (!params) return template;
		return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
	};

	const fields = {
		latitude: $('field-latitude'),
		longitude: $('field-longitude'),
		altitude: $('field-altitude'),
	};

	let state = null;
	// While the user is editing we do not let background updates overwrite the fields.
	let dirty = false;

	const updateSaveLabel = () => {
		const empty = !fields.latitude.value.trim() && !fields.longitude.value.trim();
		$('button-save').textContent = empty ? t('panel.saveRemove') : t('panel.save');
	};

	const setMessage = (text, kind) => {
		const element = $('message');
		element.textContent = text || '';
		element.className = `message ${kind || ''}`;
	};

	// --- map ----------------------------------------------------------------

	const DEFAULT_ZOOM = 15;
	let map = null;
	let tiles = null;
	let marker = null;
	let tileErrors = 0;
	let mapVisible = true;
	let mapNoteId = '';
	// The last view we asked for. Leaflet cannot honour setView() while the container has no
	// layout box, so it is kept to be re-applied once the box appears.
	let wantedView = null;

	const setMapHint = (text) => { $('map-hint').textContent = text || ''; };

	// A CSS pin instead of Leaflet's default icon: that one loads PNGs relative to the
	// stylesheet, which we would have to ship as well - and it must not break offline.
	const pinIcon = () => window.L.divIcon({
		className: 'map-pin',
		iconSize: [24, 24],
		iconAnchor: [12, 24],
	});

	const setFromMap = (latlng) => {
		fields.latitude.value = latlng.lat.toFixed(6);
		fields.longitude.value = latlng.lng.toFixed(6);
		dirty = true;
		updateSaveLabel();
		placeMarker(latlng.lat, latlng.lng);
		setMessage(t('panel.picked'), '');
	};

	function placeMarker(latitude, longitude) {
		if (!map) return;
		const position = [latitude, longitude];
		if (marker) {
			marker.setLatLng(position);
		} else {
			marker = window.L.marker(position, { icon: pinIcon(), draggable: true });
			marker.on('dragend', () => setFromMap(marker.getLatLng()));
			marker.addTo(map);
		}
	}

	const hasBox = () => $('map').clientWidth > 0 && $('map').clientHeight > 0;

	const setMapView = (latitude, longitude, zoom) => {
		wantedView = { center: [latitude, longitude], zoom };
		if (map) map.setView(wantedView.center, zoom);
	};

	const ensureMap = () => {
		if (map) return map;
		if (!window.L) {
			setMapHint(t('panel.noLeaflet'));
			return null;
		}

		// fadeAnimation off for the same reason as in the note viewer: tiles are faded in via
		// an opacity transition, and a webview that does not finish that transition leaves the
		// map dark.
		map = window.L.map('map', { attributionControl: true, fadeAnimation: false });
		setMapView(20, 0, 1);

		tiles = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap',
		});
		tiles.on('tileerror', () => {
			tileErrors += 1;
			// A single failure is normal at the edges of the viewport; a run of them means
			// there is no network. Editing keeps working either way.
			if (tileErrors > 4) setMapHint(t('panel.noTiles'));
		});
		tiles.on('tileload', () => { tileErrors = 0; setMapHint(''); });
		tiles.addTo(map);

		map.on('click', (event) => setFromMap(event.latlng));
		watchMapBox();
		return map;
	};

	// On mobile - and in the web app, which is the mobile app in a browser - the panel lives
	// in a dialog that is built before it is shown. Leaflet then measures a container of zero
	// size, loads not a single tile and leaves an empty box that reads as black in the dark
	// theme. A ResizeObserver fires the moment the container gets a layout box, whenever that
	// is, which a one-off timeout cannot.
	const watchMapBox = () => {
		if (typeof ResizeObserver === 'undefined') return;

		let hadBox = hasBox();
		const observer = new ResizeObserver(() => {
			if (!hasBox()) { hadBox = false; return; }
			map.invalidateSize();
			// Only when the box first appears: afterwards the user's own panning must stand.
			if (!hadBox && wantedView) map.setView(wantedView.center, wantedView.zoom, { animate: false });
			hadBox = true;
		});
		observer.observe($('map'));
	};

	// Coming back from another app, Android hands the webview back with the tiles gone: the
	// map frame is there, the images are blank, and until now only restarting Joplin brought
	// them back. Re-measuring and re-requesting costs one round of mostly cached tiles.
	const refreshTiles = () => {
		if (!map) return;
		map.invalidateSize();
		if (tiles) tiles.redraw();
	};

	let wasHidden = false;
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) { wasHidden = true; return; }
		refreshTiles();
	});
	window.addEventListener('pageshow', (event) => {
		if (event.persisted || wasHidden) refreshTiles();
	});

	const updateMap = (next) => {
		if (!mapVisible) return;
		if (!ensureMap()) return;

		// Leaflet measures the container on creation; if it was hidden then, it needs a nudge.
		setTimeout(() => map.invalidateSize(), 0);

		if (!next.hasCoordinates) {
			if (marker) { marker.remove(); marker = null; }
			mapNoteId = next.noteId;
			return;
		}

		const latitude = Number(next.latitude);
		const longitude = Number(next.longitude);
		placeMarker(latitude, longitude);

		// Only jump the view when a different note is shown - otherwise the user's own
		// panning and zooming would be undone on every save.
		if (mapNoteId !== next.noteId) {
			setMapView(latitude, longitude, DEFAULT_ZOOM);
			mapNoteId = next.noteId;
		}
	};

	const setMapVisible = (visible, persist) => {
		mapVisible = visible;
		$('map').style.display = visible ? '' : 'none';
		$('button-map-toggle').textContent = visible ? t('panel.hideMap') : t('panel.showMap');
		if (!visible) setMapHint('');
		if (visible && state) { updateMap(state); refreshTiles(); }
		if (persist) void webviewApi.postMessage({ type: 'setShowMap', value: visible });
	};

	$('button-map-toggle').addEventListener('click', () => setMapVisible(!mapVisible, true));

	// Typing coordinates by hand should move the pin too.
	let fieldMapTimer = null;
	const syncMapFromFields = () => {
		if (fieldMapTimer) clearTimeout(fieldMapTimer);
		fieldMapTimer = setTimeout(() => {
			if (!map || !mapVisible) return;
			const latitude = Number(fields.latitude.value.replace(',', '.'));
			const longitude = Number(fields.longitude.value.replace(',', '.'));
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
			if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
			placeMarker(latitude, longitude);
		}, 400);
	};

	// --- rendering ----------------------------------------------------------

	const render = (next) => {
		state = next;

		$('note-title').textContent = next.noteTitle || t('panel.noNote');
		$('status').textContent = next.hasCoordinates
			? `${next.latitude}, ${next.longitude}`
			: t('panel.noCoordinates');
		$('status').classList.toggle('empty', !next.hasCoordinates);

		$('readout').hidden = !next.hasCoordinates;
		$('readout-dms').textContent = next.dms || '';
		$('link-osm').href = next.osmUrl || '#';
		$('link-geo').href = next.geoUri || '#';

		fields.latitude.value = next.latitude;
		fields.longitude.value = next.longitude;
		fields.altitude.value = next.altitude;

		setMessage(next.message, next.messageKind);
		updateSaveLabel();
		dirty = false;
		updateMap(next);
		void refreshInsertAvailability();
	};

	// Editor commands only work while an editor is mounted - on the phone that means the
	// note must be open for editing, not just being viewed.
	const refreshInsertAvailability = async () => {
		const available = await webviewApi.postMessage({ type: 'editorAvailable' });
		$('button-insert').disabled = !available;
		$('insert-hint').textContent = available ? '' : t('panel.editorClosed');
	};

	const send = async (message) => {
		return webviewApi.postMessage({ ...message, noteId: state ? state.noteId : '' });
	};

	const sendAndRender = async (message) => {
		const response = await send(message);
		if (response && 'noteId' in response) render(response);
		return response;
	};

	// --- events -------------------------------------------------------------

	for (const field of Object.values(fields)) {
		field.addEventListener('input', () => { dirty = true; });
	}
	fields.latitude.addEventListener('input', updateSaveLabel);
	fields.longitude.addEventListener('input', updateSaveLabel);
	fields.latitude.addEventListener('input', syncMapFromFields);
	fields.longitude.addEventListener('input', syncMapFromFields);

	$('button-save').addEventListener('click', () => {
		void sendAndRender({
			type: 'save',
			latitude: fields.latitude.value,
			longitude: fields.longitude.value,
			altitude: fields.altitude.value,
		});
	});

	// Inserts what is currently in the fields, not what is stored - so a point just picked
	// on the map can go into the text without saving it to the note first.
	$('button-insert').addEventListener('click', () => {
		void sendAndRender({
			type: 'insertLocation',
			latitude: fields.latitude.value,
			longitude: fields.longitude.value,
			altitude: fields.altitude.value,
		});
	});

	$('button-reset').addEventListener('click', () => {
		void sendAndRender({ type: 'getState' });
	});

	// Detecting is the action - what is recognised goes straight into the fields and onto
	// the map. Nothing is written to the note until Save, so a separate "apply" button would
	// only be a second step to the same place.
	let parseTimer = null;
	$('field-paste').addEventListener('input', () => {
		if (parseTimer) clearTimeout(parseTimer);
		parseTimer = setTimeout(async () => {
			const text = $('field-paste').value;
			if (!text.trim()) {
				$('paste-hint').textContent = '';
				$('paste-hint').classList.remove('error');
				return;
			}

			const result = await send({ type: 'parse', text });
			$('paste-hint').textContent = result ? result.hint : '';
			$('paste-hint').classList.toggle('error', !!result && !result.ok);
			if (!result || !result.ok) return;

			fields.latitude.value = result.latitude;
			fields.longitude.value = result.longitude;
			if (result.altitude) fields.altitude.value = result.altitude;
			dirty = true;
			updateSaveLabel();
			placeMarker(Number(result.latitude), Number(result.longitude));
			if (map) setMapView(Number(result.latitude), Number(result.longitude), Math.max(map.getZoom(), DEFAULT_ZOOM));
			setMessage(t('panel.picked'), '');
		}, 250);
	});

	$('button-swap').addEventListener('click', () => {
		const latitude = fields.latitude.value;
		fields.latitude.value = fields.longitude.value;
		fields.longitude.value = latitude;
		dirty = true;
		setMessage(t('panel.swapped'), '');
	});

	// Empties the fields only - the note keeps its coordinates until Save is pressed, which
	// is why this no longer needs a confirming second tap.
	$('button-clear').addEventListener('click', () => {
		fields.latitude.value = '';
		fields.longitude.value = '';
		fields.altitude.value = '';
		dirty = true;
		if (marker) { marker.remove(); marker = null; }
		updateSaveLabel();
		setMessage(t('panel.clearedFields'), '');
	});

	// Confirmed working on Joplin-Android 3.6.21: the plugin webview does reach the device
	// GPS. The paste field stays as the fallback for when there is no fix (indoors, tunnel)
	// or when the position belongs to a place the user is not standing at right now.
	// In the web app the panel is a sandboxed iframe that is not granted the geolocation
	// permission, so the browser refuses the request without ever asking the user - and the
	// site never even shows a location entry in its permissions. Asking the permissions
	// policy first turns a silent nothing into an explanation.
	const geolocationAllowed = () => {
		const policy = document.permissionsPolicy || document.featurePolicy;
		if (!policy || typeof policy.allowsFeature !== 'function') return true;
		try {
			return policy.allowsFeature('geolocation');
		} catch (error) {
			return true;
		}
	};

	$('button-locate').addEventListener('click', () => {
		const button = $('button-locate');
		if (!navigator.geolocation) {
			setMessage(t('panel.locateUnavailable'), 'error');
			return;
		}
		if (!geolocationAllowed()) {
			setMessage(t('panel.locateBlocked'), 'error');
			return;
		}

		const label = button.textContent;
		let done = false;
		const restore = () => { done = true; button.disabled = false; button.textContent = label; };
		button.disabled = true;
		button.textContent = t('panel.locating');
		setMessage('', '');

		// Neither callback is guaranteed to fire - a webview that blocks the request can stay
		// silent, and then the button would be stuck for good.
		setTimeout(() => {
			if (done) return;
			restore();
			setMessage(t('panel.locateFailed', { reason: 'no answer' }), 'error');
		}, 25000);

		navigator.geolocation.getCurrentPosition(
			(position) => {
				restore();
				// Only fills the form - saving stays an explicit decision, so that fetching a
				// position (or inserting it into the text) never rewrites the note by itself.
				fields.latitude.value = position.coords.latitude.toFixed(6);
				fields.longitude.value = position.coords.longitude.toFixed(6);
				if (position.coords.altitude !== null && position.coords.altitude !== undefined) {
					fields.altitude.value = Math.round(position.coords.altitude);
				}
				dirty = true;
				updateSaveLabel();
				placeMarker(position.coords.latitude, position.coords.longitude);
				if (map) setMapView(position.coords.latitude, position.coords.longitude, Math.max(map.getZoom(), DEFAULT_ZOOM));
				setMessage(t('panel.located', { accuracy: Math.round(position.coords.accuracy) }), '');
			},
			(error) => {
				restore();
				setMessage(t('panel.locateFailed', { reason: error.message || `code ${error.code}` }), 'error');
			},
			{ enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
		);
	});

	// --- diagnostics (Phase 0) ----------------------------------------------

	const probeImage = (url) => new Promise((resolve) => {
		const image = new Image();
		const timer = setTimeout(() => resolve('timed out'), 8000);
		image.onload = () => { clearTimeout(timer); resolve(`ok (${image.width}x${image.height})`); };
		image.onerror = () => { clearTimeout(timer); resolve('blocked/failed'); };
		image.src = url;
	});

	// The only meaningful test of the device GPS: actually ask for a fix and report what
	// comes back. The mere existence of navigator.geolocation says nothing - Android's
	// WebView exposes the object even when geolocation is switched off for the view.
	const errorNames = ['', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT'];
	const probeGeolocation = () => new Promise((resolve) => {
		if (!navigator.geolocation) return resolve('navigator.geolocation missing');

		const timer = setTimeout(() => resolve('no answer after 20 s (callback never fired)'), 20000);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				clearTimeout(timer);
				resolve(`FIX: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (±${Math.round(position.coords.accuracy)} m)`);
			},
			(error) => {
				clearTimeout(timer);
				resolve(`error ${error.code} ${errorNames[error.code] || '?'}: ${error.message || '(no message)'}`);
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
		);
	});

	$('button-probe').addEventListener('click', async () => {
		const output = $('probe-output');
		output.textContent = t('panel.probing');

		const info = await webviewApi.postMessage({ type: 'diagnostics' });
		const lines = [
			`Joplin: ${info.version} (${info.platform})`,
			`joplin.geolocation: ${info.geolocationApi ? 'true' : 'false'}`,
			`control probe (invented API): ${info.controlProbe ? 'true -> both values meaningless' : 'false -> test is meaningful'}`,
			`navigator.geolocation present: ${!!navigator.geolocation}`,
			`geolocation allowed by permissions policy: ${geolocationAllowed()}`,
			`frame origin: ${window.origin || '(none)'}`,
			`location request: ${await probeGeolocation()}`,
			`isSecureContext: ${window.isSecureContext}`,
			`OSM tile: ${await probeImage('https://tile.openstreetmap.org/0/0/0.png')}`,
		];

		try {
			const response = await fetch('https://nominatim.openstreetmap.org/status.php?format=json');
			lines.push(`fetch (Nominatim): ${response.status}`);
		} catch (error) {
			lines.push(`fetch (Nominatim): blocked (${error.message})`);
		}

		lines.push(`User-Agent: ${navigator.userAgent}`);
		output.textContent = lines.join('\n');
	});

	// --- wiring -------------------------------------------------------------

	webviewApi.onMessage((event) => {
		const message = event && event.message ? event.message : event;
		if (!message || message.type !== 'state') return;
		if (dirty) return;
		render(message.state);
	});

	void (async () => {
		const settings = await webviewApi.postMessage({ type: 'getSettings' });
		setMapVisible(!settings || settings.showMap !== false, false);
		await sendAndRender({ type: 'getState' });
	})();
})();
