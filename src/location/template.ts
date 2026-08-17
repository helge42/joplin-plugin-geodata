import { Coordinates } from './types';
import { formatDecimal, formatPairDms, geoUri, osmUrl } from './format';

// Placeholders available in the insert template. Dates are deliberately not localised:
// a travel journal is read chronologically, and ISO dates sort correctly in a text file.
export const placeholders = {
	'{lat}': 'latitude, e.g. 52.5163',
	'{lon}': 'longitude, e.g. 13.3777',
	'{alt}': 'altitude in metres, empty when unknown',
	'{dms}': 'degrees/minutes/seconds, e.g. 52°30\'58.7"N 13°22\'39.7"E',
	'{geo}': 'geo: URI, opens the device maps app',
	'{osm}': 'link to OpenStreetMap',
	'{date}': 'date, e.g. 2026-08-15',
	'{time}': 'time, e.g. 14:35',
	'{place}': 'place name (asks OpenStreetMap, needs a network)',
};

// Confirmed on Joplin-Android 3.6.21: a geo: link in the rendered note opens the device's
// maps app, which beats sending the reader to a website while travelling.
export const defaultTemplate = '📍 [{lat}, {lon}]({geo})';

// The rich text editor takes inserted text literally and escapes the brackets when it
// serialises back to Markdown, which leaves "\[52.5, 13.3\](geo:...)" in the note. There is
// no portable way to hand it a real link, so the link syntax is unwrapped and the label
// inserted as plain text.
export const stripMarkdownLinks = (text: string) => text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1');

const pad = (value: number) => String(value).padStart(2, '0');

export interface TemplateData {
	coordinates: Coordinates;
	place: string;
	now: Date;
}

export const renderTemplate = (template: string, data: TemplateData) => {
	const { coordinates, place, now } = data;

	const values: Record<string, string> = {
		lat: formatDecimal(coordinates.latitude),
		lon: formatDecimal(coordinates.longitude),
		alt: coordinates.altitude ? formatDecimal(coordinates.altitude) : '',
		dms: formatPairDms(coordinates),
		geo: geoUri(coordinates),
		osm: osmUrl(coordinates),
		date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
		time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
		place: place || '',
	};

	// Unknown placeholders are left untouched rather than silently swallowed, so a typo
	// in the template is visible in the note instead of producing a hole.
	return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
};

export const usesPlaceholder = (template: string, name: string) => template.includes(`{${name}}`);
