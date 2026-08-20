/* Runs inside the note viewer and turns every ```gpx block into an OpenStreetMap map.

   Plain JavaScript on purpose: content script assets are copied verbatim and loaded with a
   <script> tag, so the CommonJS wrapper webpack puts around compiled extra scripts would
   fail here with "exports is not defined". The pure helpers are exported for the tests at
   the bottom, guarded so the browser part never runs under Node. */

(function() {
	'use strict';

	const EARTH_RADIUS = 6371008.8;
	// Enough for a smooth line on a phone screen, few enough to stay responsive with a
	// full day of one-second GPS samples.
	const MAX_POINTS = 2000;
	// Ignore wobble in the barometric/GPS altitude when summing the climb.
	const ASCENT_THRESHOLD = 3;

	const toRadians = (degrees) => (degrees * Math.PI) / 180;

	const distanceBetween = (a, b) => {
		const dLat = toRadians(b.lat - a.lat);
		const dLon = toRadians(b.lon - a.lon);
		const lat1 = toRadians(a.lat);
		const lat2 = toRadians(b.lat);
		const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
		return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
	};

	const trackStats = (segments) => {
		const points = [].concat.apply([], segments);
		let distance = 0;
		let ascent = 0;

		for (const segment of segments) {
			for (let i = 1; i < segment.length; i++) {
				distance += distanceBetween(segment[i - 1], segment[i]);
			}

			// Compare against the last accepted elevation, not the previous point, so that
			// noise below the threshold cannot accumulate.
			let reference = null;
			for (const point of segment) {
				if (point.ele === null) continue;
				if (reference === null) {
					reference = point.ele;
					continue;
				}
				if (point.ele - reference >= ASCENT_THRESHOLD) ascent += point.ele - reference;
				if (Math.abs(point.ele - reference) >= ASCENT_THRESHOLD) reference = point.ele;
			}
		}

		const times = points.map(point => point.time).filter(time => time !== null);
		const duration = times.length >= 2 ? Math.max.apply(null, times) - Math.min.apply(null, times) : null;

		return { distance, ascent, duration, count: points.length };
	};

	// Keeps first and last point, thins out the rest evenly.
	const downsample = (points, max = MAX_POINTS) => {
		if (points.length <= max) return points;
		const step = (points.length - 1) / (max - 1);
		const result = [];
		for (let i = 0; i < max; i++) result.push(points[Math.round(i * step)]);
		return result;
	};

	const formatDistance = (metres) => {
		return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
	};

	const formatDuration = (ms) => {
		const minutes = Math.round(ms / 60000);
		const hours = Math.floor(minutes / 60);
		return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
	};

	// --- browser part -------------------------------------------------------

	if (typeof document === 'undefined') {
		if (typeof module !== 'undefined') module.exports = { distanceBetween, trackStats, downsample, formatDistance, formatDuration };
		return;
	}

	// The content script cannot read the settings, so the viewer asks the plugin process for
	// the dictionary once and falls back to the English keys' own text if that fails.
	let dictionary = {};
	const t = (key, params) => {
		const template = dictionary[key] !== undefined ? dictionary[key] : key;
		if (!params) return template;
		return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
	};

	const loadStrings = async (contentScriptId) => {
		if (Object.keys(dictionary).length || typeof webviewApi === 'undefined') return;
		try {
			const response = await webviewApi.postMessage(contentScriptId, { type: 'strings' });
			if (response && response.strings) dictionary = response.strings;
		} catch (error) {
			console.info('Geodata GPX: strings unavailable', error);
		}
	};

	const parsePoints = (text) => {
		const doc = new DOMParser().parseFromString(text, 'application/xml');
		if (doc.getElementsByTagName('parsererror').length) throw new Error(t('gpx.invalidXml'));

		const readPoint = (node) => {
			const lat = parseFloat(node.getAttribute('lat'));
			const lon = parseFloat(node.getAttribute('lon'));
			if (!isFinite(lat) || !isFinite(lon)) return null;

			const eleNode = node.getElementsByTagName('ele')[0];
			const timeNode = node.getElementsByTagName('time')[0];
			const ele = eleNode ? parseFloat(eleNode.textContent) : NaN;
			const time = timeNode ? Date.parse(timeNode.textContent) : NaN;

			return { lat, lon, ele: isFinite(ele) ? ele : null, time: isFinite(time) ? time : null };
		};

		const collect = (nodes) => Array.prototype.map.call(nodes, readPoint).filter(point => !!point);

		// Track segments stay separate so that a pause in recording is not drawn as a
		// straight line across the map.
		const segments = Array.prototype.map
			.call(doc.getElementsByTagName('trkseg'), segment => collect(segment.getElementsByTagName('trkpt')))
			.filter(segment => segment.length > 0);
		if (segments.length) return segments;

		for (const tag of ['trkpt', 'rtept', 'wpt']) {
			const points = collect(doc.getElementsByTagName(tag));
			if (points.length) return [points];
		}

		return [];
	};

	const renderStats = (element, stats) => {
		const parts = [formatDistance(stats.distance)];
		if (stats.ascent >= 10) parts.push(t('gpx.ascent', { metres: Math.round(stats.ascent) }));
		if (stats.duration) parts.push(formatDuration(stats.duration));
		parts.push(t('gpx.points', { count: stats.count }));
		element.textContent = parts.join(' · ');
	};

	const showError = (container, message) => {
		const map = container.querySelector('.geodata-gpx-map');
		map.classList.add('geodata-gpx-error');
		map.textContent = message;
	};

	// Two ways to get at an attached .gpx, because neither works everywhere:
	//
	// 1. Load the file straight from the viewer, using the URL the renderer also uses for
	//    images. This is the only route that works on Android.
	// 2. Ask the plugin process, which reads it through the data API. That is what works on
	//    the desktop, while Android answers "Unsupported encoding: buffer".
	const loadFromUrl = async (url) => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return response.text();
	};

	// Chromium's fetch() cannot read file:// URLs at all - that is where "Failed to fetch"
	// on Android comes from. XMLHttpRequest can, as long as the app allows file access,
	// which Joplin does (otherwise images in notes would not show either). A file:// read
	// reports status 0 on success.
	const loadWithXhr = (url) => new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open('GET', url, true);
		request.timeout = 15000;
		request.onload = () => {
			const ok = request.status === 0 || (request.status >= 200 && request.status < 300);
			if (ok && request.responseText) resolve(request.responseText);
			else reject(new Error(`XHR status ${request.status}`));
		};
		request.onerror = () => reject(new Error('XHR blocked'));
		request.ontimeout = () => reject(new Error('XHR timed out'));
		request.send();
	});

	const loadFromPlugin = async (resourceId, contentScriptId) => {
		if (typeof webviewApi === 'undefined') throw new Error(t('gpx.noPluginConnection'));

		const response = await webviewApi.postMessage(contentScriptId, { type: 'gpxResource', id: resourceId });
		if (!response || !response.ok) throw new Error(response && response.error ? response.error : t('gpx.unknownError'));
		return response.text;
	};

	const loadResource = async (mapElement) => {
		const resourceId = mapElement.dataset.gpxResource;
		if (!resourceId) return null;

		mapElement.classList.add('geodata-gpx-error');
		mapElement.textContent = t('gpx.loading');

		const url = mapElement.dataset.gpxUrl;
		const noUrl = () => Promise.reject(new Error(t('gpx.noUrl')));

		const problems = [];
		for (const attempt of [
			() => (url ? loadWithXhr(url) : noUrl()),
			() => (url ? loadFromUrl(url) : noUrl()),
			() => loadFromPlugin(resourceId, mapElement.dataset.contentScriptId),
		]) {
			try {
				const text = await attempt();
				if (text && text.trim()) {
					mapElement.classList.remove('geodata-gpx-error');
					mapElement.textContent = '';
					return text;
				}
				problems.push(t('gpx.emptyFile'));
			} catch (error) {
				problems.push(error.message);
			}
		}

		// The URL goes into the message: when every route fails it is the one piece of
		// information that says whether the address was even plausible.
		const shortUrl = url ? `${url.slice(0, 70)}${url.length > 70 ? '…' : ''}` : 'none';
		throw new Error(t('gpx.unreadable', { problems: problems.join('; '), url: shortUrl }));
	};

	const drawTrack = (container, mapElement, text) => {
		let segments;
		try {
			segments = parsePoints(text);
		} catch (error) {
			showError(container, error.message);
			return;
		}

		if (!segments.length) {
			showError(container, t('gpx.noPoints'));
			return;
		}

		// fadeAnimation off: the tiles are faded in via opacity, and a webview that stumbles
		// over that transition leaves the map black. Nothing is lost but the fade.
		const map = window.L.map(mapElement, { attributionControl: true, fadeAnimation: false });
		const tiles = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap',
			// The web app is cross-origin isolated, and under that policy a plain <img> from
			// another site is blocked unless the response allows being embedded - which the
			// tile server does not say. As a CORS request the tiles are allowed, because the
			// server does send "Access-Control-Allow-Origin: *".
			crossOrigin: 'anonymous',
		}).addTo(map);

		const lines = segments.map(segment => {
			return window.L.polyline(downsample(segment).map(point => [point.lat, point.lon]), {
				color: '#2d5be5',
				weight: 4,
			}).addTo(map);
		});

		const first = segments[0][0];
		const lastSegment = segments[segments.length - 1];
		const last = lastSegment[lastSegment.length - 1];
		window.L.circleMarker([first.lat, first.lon], { radius: 6, color: '#2a7d2e', fillOpacity: 1 }).addTo(map);
		window.L.circleMarker([last.lat, last.lon], { radius: 6, color: '#c04949', fillOpacity: 1 }).addTo(map);

		const bounds = window.L.featureGroup(lines).getBounds();
		map.fitBounds(bounds, { padding: [12, 12] });
		liveMaps.push({ element: mapElement, map, tiles, bounds });
		renderStats(container.querySelector('.geodata-gpx-stats'), trackStats(segments));
		addStartPointLink(container, first);
		addReloadLink(container, mapElement);
		void addMimeHint(container, mapElement);
	};

	// --- keeping the tiles alive --------------------------------------------
	//
	// Every map currently on screen. Coming back from another app - opening the track in
	// OsmAnd, for instance - Android hands the webview back with the tiles gone: the frame and
	// the line are there, the tile images are blank, and until now only restarting Joplin
	// brought them back. Re-measuring and re-requesting fixes it, at the cost of one round of
	// tile requests that the browser cache usually answers.
	const liveMaps = [];

	const forgetDetachedMaps = () => {
		for (let i = liveMaps.length - 1; i >= 0; i--) {
			if (document.contains(liveMaps[i].element)) continue;
			// The viewer rebuilds the note body and throws the old nodes away; without remove()
			// each rebuild would leave a live map behind, listening on window.
			liveMaps[i].map.remove();
			// remove() also frees the element for a fresh map, so let it be drawn again should
			// the viewer put this very node back.
			liveMaps[i].element.dataset.geodataGpxDone = '';
			liveMaps.splice(i, 1);
		}
	};

	const refreshMaps = () => {
		forgetDetachedMaps();
		for (const entry of liveMaps) {
			entry.map.invalidateSize();
			entry.tiles.redraw();
		}
	};

	// Only after the app really was away: on the desktop the viewer gains and loses focus all
	// the time, and re-requesting tiles for that would be rude to the tile servers.
	let wasHidden = false;
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) { wasHidden = true; return; }
		refreshMaps();
	});
	window.addEventListener('pageshow', (event) => {
		if (event.persisted || wasHidden) refreshMaps();
	});

	// The manual way back, for when the webview comes home without announcing it - and for a
	// map that stayed empty because the connection was down while it was drawn.
	const addReloadLink = (container, mapElement) => {
		const actions = container.querySelector('.geodata-gpx-actions');
		if (!actions || actions.querySelector('.geodata-gpx-reload')) return;

		const link = document.createElement('a');
		link.className = 'geodata-gpx-reload';
		link.href = '#';
		link.textContent = t('gpx.reloadMap');
		link.onclick = (event) => {
			event.preventDefault();
			const entry = liveMaps.find(item => item.element === mapElement);
			if (entry) {
				entry.map.invalidateSize();
				// Back to the whole track: after panning around, finding the way back by hand
				// is fiddly on a phone, and this is the button one reaches for anyway.
				entry.map.fitBounds(entry.bounds, { padding: [12, 12] });
				entry.tiles.redraw();
			}
			return false;
		};
		actions.appendChild(link);
	};

	// Which app gets offered depends on the resource's MIME type, so if it is not
	// application/gpx+xml, offer to correct it - one tap, and visible rather than silent.
	const GPX_MIME = 'application/gpx+xml';

	const addMimeHint = async (container, mapElement) => {
		const resourceId = mapElement.dataset.gpxResource;
		const contentScriptId = mapElement.dataset.contentScriptId;
		const actions = container.querySelector('.geodata-gpx-actions');
		if (!resourceId || !actions || typeof webviewApi === 'undefined') return;
		if (actions.querySelector('.geodata-gpx-mime')) return;

		let info;
		try {
			info = await webviewApi.postMessage(contentScriptId, { type: 'resourceInfo', id: resourceId });
		} catch (error) {
			return;
		}
		if (!info || !info.ok || info.mime === GPX_MIME) return;

		const link = document.createElement('a');
		link.className = 'geodata-gpx-mime';
		link.href = '#';
		link.textContent = info.mime ? t('gpx.mimeWrong', { mime: info.mime }) : t('gpx.mimeUnknown');
		link.onclick = async (event) => {
			event.preventDefault();
			const result = await webviewApi.postMessage(contentScriptId, { type: 'setGpxMime', id: resourceId });
			link.textContent = result && result.ok
				? t('gpx.mimeFixed')
				: t('gpx.mimeFailed', { error: result ? result.error : '?' });
			link.onclick = (inner) => inner.preventDefault();
			return false;
		};
		actions.appendChild(link);
	};

	// The start of the track as a geo: link - the only thing that can be handed to a maps
	// app when the GPX sits inline in the note and there is no file to pass on.
	const addStartPointLink = (container, start) => {
		const actions = container.querySelector('.geodata-gpx-actions');
		if (!actions || actions.querySelector('.geodata-gpx-start')) return;

		const link = document.createElement('a');
		link.className = 'geodata-gpx-start';
		link.href = `geo:${start.lat.toFixed(6)},${start.lon.toFixed(6)}`;
		link.textContent = t('gpx.startPoint');
		actions.appendChild(link);
	};

	const renderBlock = (container) => {
		const source = container.querySelector('.joplin-source');
		const mapElement = container.querySelector('.geodata-gpx-map');
		if (!source || !mapElement) return;

		// The marker sits on the map element, not on the container: when the viewer
		// re-renders the note it replaces these nodes, and a fresh element must be drawn
		// again. A flag on the container would survive the replacement and leave an empty
		// box behind.
		if (mapElement.dataset.geodataGpxDone === '1') return;
		mapElement.dataset.geodataGpxDone = '1';

		if (!window.L) {
			showError(container, t('gpx.noLeaflet'));
			return;
		}

		if (!mapElement.dataset.gpxResource) {
			drawTrack(container, mapElement, source.textContent);
			return;
		}

		loadResource(mapElement)
			.then(text => drawTrack(container, mapElement, text))
			.catch(error => showError(container, error.message));
	};

	const renderAllNow = async () => {
		const blocks = document.querySelectorAll('.geodata-gpx');
		if (blocks.length) {
			const first = blocks[0].querySelector('.geodata-gpx-map');
			await loadStrings(first ? first.dataset.contentScriptId : '');
		}

		for (const block of blocks) {
			const openLink = block.querySelector('.geodata-gpx-open');
			if (openLink && !openLink.textContent) {
				openLink.textContent = openLink.dataset.menu === '1' ? t('gpx.openOrShare') : t('gpx.openInApp');
			}

			try {
				renderBlock(block);
			} catch (error) {
				console.error('Geodata GPX:', error);
			}
		}
	};

	// The asset scripts are not guaranteed to have finished executing when this file runs,
	// so window.L may not exist yet. Waiting for it is more robust than relying on load
	// order; after the timeout renderBlock() shows its "not loaded" message.
	const LEAFLET_TIMEOUT = 10000;
	const whenLeafletReady = (callback) => {
		if (window.L) return callback();

		let waited = 0;
		const timer = setInterval(() => {
			if (window.L || waited >= LEAFLET_TIMEOUT) {
				clearInterval(timer);
				callback();
			}
			waited += 50;
		}, 50);
	};

	const renderAll = () => whenLeafletReady(renderAllNow);

	document.addEventListener('joplin-noteDidUpdate', renderAll);

	// The mobile viewer rebuilds the note body more than once and not every pass announces
	// itself with joplin-noteDidUpdate - the map would be drawn, then thrown away with the
	// old DOM, leaving an empty box. Watching the document catches every pass; the scan is
	// cheap because renderBlock() returns immediately for maps that are already drawn.
	if (typeof MutationObserver !== 'undefined') {
		let pending = null;
		const observer = new MutationObserver(() => {
			if (pending) clearTimeout(pending);
			pending = setTimeout(renderAll, 150);
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', renderAll);
	} else {
		renderAll();
	}
})();
