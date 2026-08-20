import { Coordinates } from './types';
import { formatDecimal } from './format';

// A single position as a fenced ```gpx block, so the note viewer draws it as a small map.
// A waypoint rather than a track point: one <wpt> is what GPX means by "a place", and it is
// what other apps show as a pin when the file is handed to them.
//
// Written with six decimals like everything else here, and with the time in UTC, because
// GPX has no notion of a local timezone.
export const gpxWaypointBlock = (coordinates: Coordinates, now: Date, name = '') => {
	const latitude = formatDecimal(coordinates.latitude);
	const longitude = formatDecimal(coordinates.longitude);

	const lines = [`  <wpt lat="${latitude}" lon="${longitude}">`];
	if (coordinates.altitude) lines.push(`    <ele>${formatDecimal(coordinates.altitude)}</ele>`);
	lines.push(`    <time>${now.toISOString().replace(/\.\d+Z$/, 'Z')}</time>`);
	if (name) lines.push(`    <name>${escapeXml(name)}</name>`);
	lines.push('  </wpt>');

	return [
		'```gpx',
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<gpx version="1.1" creator="Joplin Geodata">',
		...lines,
		'</gpx>',
		'```',
	].join('\n');
};

const escapeXml = (value: string) => {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
};
