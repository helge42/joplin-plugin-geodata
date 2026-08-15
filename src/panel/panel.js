/* Panel webview. Deliberately dumb: parsing, validation and storage all happen in the
   plugin process, this file only renders state and forwards intent. */

(() => {
	const $ = (id) => document.getElementById(id);

	const fields = {
		latitude: $('field-latitude'),
		longitude: $('field-longitude'),
		altitude: $('field-altitude'),
	};

	let state = null;
	// While the user is editing we do not let background updates overwrite the fields.
	let dirty = false;
	let clearArmed = false;

	const setMessage = (text, kind) => {
		const element = $('message');
		element.textContent = text || '';
		element.className = `message ${kind || ''}`;
	};

	// --- map ----------------------------------------------------------------

	const DEFAULT_ZOOM = 15;
	let map = null;
	let marker = null;
	let tileErrors = 0;
	let mapVisible = true;
	let mapNoteId = '';

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
		placeMarker(latlng.lat, latlng.lng);
		setMessage('Position gewählt - zum Übernehmen speichern.', '');
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

	const ensureMap = () => {
		if (map) return map;
		if (!window.L) {
			setMapHint('Kartenbibliothek nicht geladen.');
			return null;
		}

		map = window.L.map('map', { attributionControl: true });
		map.setView([20, 0], 1);

		const tiles = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap',
		});
		tiles.on('tileerror', () => {
			tileErrors += 1;
			// A single failure is normal at the edges of the viewport; a run of them means
			// there is no network. Editing keeps working either way.
			if (tileErrors > 4) setMapHint('Keine Kartenkacheln - offline? Bearbeiten und Speichern geht trotzdem.');
		});
		tiles.on('tileload', () => { tileErrors = 0; setMapHint(''); });
		tiles.addTo(map);

		map.on('click', (event) => setFromMap(event.latlng));
		return map;
	};

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
			map.setView([latitude, longitude], DEFAULT_ZOOM);
			mapNoteId = next.noteId;
		}
	};

	const setMapVisible = (visible, persist) => {
		mapVisible = visible;
		$('map').style.display = visible ? '' : 'none';
		$('button-map-toggle').textContent = visible ? 'Karte ausblenden' : 'Karte anzeigen';
		if (!visible) setMapHint('');
		if (visible && state) updateMap(state);
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

		$('note-title').textContent = next.noteTitle || 'Keine Notiz ausgewählt';
		$('status').textContent = next.hasCoordinates
			? `${next.latitude}, ${next.longitude}`
			: 'Keine Geodaten hinterlegt';
		$('status').classList.toggle('empty', !next.hasCoordinates);

		$('readout').hidden = !next.hasCoordinates;
		$('readout-dms').textContent = next.dms || '';
		$('link-osm').href = next.osmUrl || '#';
		$('link-geo').href = next.geoUri || '#';

		fields.latitude.value = next.latitude;
		fields.longitude.value = next.longitude;
		fields.altitude.value = next.altitude;

		setMessage(next.message, next.messageKind);
		dirty = false;
		disarmClear();
		updateMap(next);
	};

	const send = async (message) => {
		return webviewApi.postMessage({ ...message, noteId: state ? state.noteId : '' });
	};

	const sendAndRender = async (message) => {
		const response = await send(message);
		if (response && 'noteId' in response) render(response);
		return response;
	};

	const disarmClear = () => {
		clearArmed = false;
		$('button-clear').textContent = 'Löschen';
		$('button-clear').classList.remove('danger');
	};

	// --- events -------------------------------------------------------------

	for (const field of Object.values(fields)) {
		field.addEventListener('input', () => { dirty = true; });
	}
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

	$('button-apply').addEventListener('click', async () => {
		const response = await sendAndRender({ type: 'apply', text: $('field-paste').value });
		if (response && response.messageKind === 'ok') {
			$('field-paste').value = '';
			$('paste-hint').textContent = '';
		}
	});

	let previewTimer = null;
	$('field-paste').addEventListener('input', () => {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			const text = $('field-paste').value;
			if (!text.trim()) {
				$('paste-hint').textContent = '';
				return;
			}
			const result = await send({ type: 'preview', text });
			$('paste-hint').textContent = result ? result.hint : '';
			$('paste-hint').classList.toggle('error', !!result && !result.ok);
		}, 250);
	});

	$('button-swap').addEventListener('click', () => {
		const latitude = fields.latitude.value;
		fields.latitude.value = fields.longitude.value;
		fields.longitude.value = latitude;
		dirty = true;
		setMessage('Getauscht - zum Übernehmen speichern.', '');
	});

	$('button-clear').addEventListener('click', () => {
		if (!clearArmed) {
			clearArmed = true;
			$('button-clear').textContent = 'Wirklich löschen?';
			$('button-clear').classList.add('danger');
			setTimeout(disarmClear, 4000);
			return;
		}
		void sendAndRender({ type: 'clear' });
	});

	// Confirmed working on Joplin-Android 3.6.21: the plugin webview does reach the device
	// GPS. The paste field stays as the fallback for when there is no fix (indoors, tunnel)
	// or when the position belongs to a place the user is not standing at right now.
	$('button-locate').addEventListener('click', () => {
		const button = $('button-locate');
		if (!navigator.geolocation) {
			setMessage('Kein Standortzugriff in diesem Plugin-Fenster. Standort in der Karten-App teilen und unten einfügen.', 'error');
			return;
		}

		const label = button.textContent;
		const restore = () => { button.disabled = false; button.textContent = label; };
		button.disabled = true;
		button.textContent = 'Standort wird ermittelt …';
		setMessage('', '');

		navigator.geolocation.getCurrentPosition(
			(position) => {
				restore();
				void sendAndRender({
					type: 'setCoordinates',
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					altitude: position.coords.altitude,
					note: `Standort übernommen (±${Math.round(position.coords.accuracy)} m).`,
				});
			},
			(error) => {
				restore();
				setMessage(`Standort nicht verfügbar (${error.message || `Code ${error.code}`}). Alternativ unten einfügen.`, 'error');
			},
			{ enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
		);
	});

	// --- diagnostics (Phase 0) ----------------------------------------------

	const probeImage = (url) => new Promise((resolve) => {
		const image = new Image();
		const timer = setTimeout(() => resolve('Zeitüberschreitung'), 8000);
		image.onload = () => { clearTimeout(timer); resolve(`ok (${image.width}x${image.height})`); };
		image.onerror = () => { clearTimeout(timer); resolve('blockiert/fehlgeschlagen'); };
		image.src = url;
	});

	// The only meaningful test of the device GPS: actually ask for a fix and report what
	// comes back. The mere existence of navigator.geolocation says nothing - Android's
	// WebView exposes the object even when geolocation is switched off for the view.
	const errorNames = ['', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT'];
	const probeGeolocation = () => new Promise((resolve) => {
		if (!navigator.geolocation) return resolve('navigator.geolocation fehlt');

		const timer = setTimeout(() => resolve('keine Antwort nach 20 s (Callback kam nie)'), 20000);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				clearTimeout(timer);
				resolve(`FIX: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (±${Math.round(position.coords.accuracy)} m)`);
			},
			(error) => {
				clearTimeout(timer);
				resolve(`Fehler ${error.code} ${errorNames[error.code] || '?'}: ${error.message || '(ohne Meldung)'}`);
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
		);
	});

	$('button-probe').addEventListener('click', async () => {
		const output = $('probe-output');
		output.textContent = 'Prüfe … (Standortabfrage kann 20 s dauern)';

		const info = await webviewApi.postMessage({ type: 'diagnostics' });
		const lines = [
			`Joplin: ${info.version} (${info.platform})`,
			`joplin.geolocation: ${info.geolocationApi ? 'wahr' : 'falsch'}`,
			`Kontrollprobe (frei erfundene API): ${info.controlProbe ? 'wahr -> beide Werte aussagelos' : 'falsch -> Test aussagekräftig'}`,
			`navigator.geolocation vorhanden: ${!!navigator.geolocation}`,
			`Standortabfrage: ${await probeGeolocation()}`,
			`isSecureContext: ${window.isSecureContext}`,
			`OSM-Kachel: ${await probeImage('https://tile.openstreetmap.org/0/0/0.png')}`,
		];

		try {
			const response = await fetch('https://nominatim.openstreetmap.org/status.php?format=json');
			lines.push(`fetch (Nominatim): ${response.status}`);
		} catch (error) {
			lines.push(`fetch (Nominatim): blockiert (${error.message})`);
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
