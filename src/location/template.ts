import { Coordinates } from './types';
import { formatDecimal, formatPairDms, geoUri, osmUrl } from './format';

// Placeholders available in the insert template. Dates are deliberately not localised:
// a travel journal is read chronologically, and ISO dates sort correctly in a text file.
export const placeholders = {
	'{lat}': 'Breite, z. B. 52.5163',
	'{lon}': 'Länge, z. B. 13.3777',
	'{alt}': 'Höhe in Metern, leer wenn unbekannt',
	'{dms}': 'Grad/Minuten/Sekunden, z. B. 52°30\'58.7"N 13°22\'39.7"E',
	'{geo}': 'geo:-URI, öffnet die Karten-App des Geräts',
	'{osm}': 'Link auf OpenStreetMap',
	'{date}': 'Datum, z. B. 2026-08-15',
	'{time}': 'Uhrzeit, z. B. 14:35',
	'{place}': 'Ortsname (fragt OpenStreetMap, braucht Netz)',
};

// Defaults to the OpenStreetMap link because https works in Joplin's viewer everywhere.
// {geo} opens the device's own maps app and is the nicer link on a phone - worth switching
// to once you have confirmed your Joplin renders geo: links.
export const defaultTemplate = '📍 [{lat}, {lon}]({osm})';

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
