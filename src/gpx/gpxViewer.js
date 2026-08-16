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

	const parsePoints = (text) => {
		const doc = new DOMParser().parseFromString(text, 'application/xml');
		if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX konnte nicht gelesen werden (kein gültiges XML).');

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
		if (stats.ascent >= 10) parts.push(`${Math.round(stats.ascent)} m bergauf`);
		if (stats.duration) parts.push(formatDuration(stats.duration));
		parts.push(`${stats.count} Punkte`);
		element.textContent = parts.join(' · ');
	};

	const showError = (container, message) => {
		const map = container.querySelector('.geodata-gpx-map');
		map.classList.add('geodata-gpx-error');
		map.textContent = message;
	};

	const renderBlock = (container) => {
		if (container.dataset.geodataGpxDone === '1') return;
		container.dataset.geodataGpxDone = '1';

		const source = container.querySelector('.joplin-source');
		const mapElement = container.querySelector('.geodata-gpx-map');
		if (!source || !mapElement) return;

		if (!window.L) {
			showError(container, 'Kartenbibliothek nicht geladen.');
			return;
		}

		let segments;
		try {
			segments = parsePoints(source.textContent);
		} catch (error) {
			showError(container, error.message);
			return;
		}

		if (!segments.length) {
			showError(container, 'Keine Punkte im GPX gefunden.');
			return;
		}

		const map = window.L.map(mapElement, { attributionControl: true });
		window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap',
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

		map.fitBounds(window.L.featureGroup(lines).getBounds(), { padding: [12, 12] });
		renderStats(container.querySelector('.geodata-gpx-stats'), trackStats(segments));
	};

	const renderAll = () => {
		const blocks = document.querySelectorAll('.geodata-gpx');
		for (const block of blocks) {
			try {
				renderBlock(block);
			} catch (error) {
				console.error('Geodata GPX:', error);
			}
		}
	};

	// The viewer replaces its content on every note update, so this has to run again -
	// renderBlock() is idempotent per container.
	document.addEventListener('joplin-noteDidUpdate', renderAll);
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', renderAll);
	} else {
		renderAll();
	}
})();
