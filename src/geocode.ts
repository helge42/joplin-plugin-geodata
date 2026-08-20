import { Coordinates } from './location/types';
import { formatDecimal } from './location/format';

// Reverse geocoding via Nominatim. Optional by design: it is only called when the insert
// template actually contains {place}, and a failure degrades to an empty string rather
// than blocking the insert - offline is the normal case while travelling.
//
// Nominatim's usage policy asks for at most one request per second and no bulk querying.
// A single manual insert per note is well within that; the cache avoids repeats.

export interface GeocodeResult {
	place: string;
	// Empty when all went well. Kept so the panel can say why {place} stayed empty instead
	// of quietly inserting nothing - on iOS the request behaves differently again.
	error: string;
}

const cache = new Map<string, string>();
const CACHE_LIMIT = 200;

const cacheKey = (coordinates: Coordinates) => `${formatDecimal(coordinates.latitude)},${formatDecimal(coordinates.longitude)}`;

// Nominatim returns a long postal address; for a journal the interesting part is the
// place, not the house number.
const shortenAddress = (address: Record<string, string>, fallback: string) => {
	if (!address) return fallback;

	const local = address.village || address.town || address.city || address.municipality || address.county;
	const region = address.state || address.region;
	const country = address.country;

	const parts = [address.attraction || address.tourism || address.suburb, local, region, country]
		.filter(part => !!part)
		// Berlin is both city and state - do not print it twice.
		.filter((part, index, all) => all.indexOf(part) === index);

	return parts.length ? parts.join(', ') : fallback;
};

export const reverseGeocode = async (coordinates: Coordinates): Promise<GeocodeResult> => {
	const key = cacheKey(coordinates);
	if (cache.has(key)) return { place: cache.get(key), error: '' };

	const url = 'https://nominatim.openstreetmap.org/reverse'
		+ `?format=jsonv2&zoom=14&lat=${encodeURIComponent(coordinates.latitude)}&lon=${encodeURIComponent(coordinates.longitude)}`;

	try {
		const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
		if (!response.ok) return { place: '', error: `HTTP ${response.status}` };

		const body = await response.json();
		const place = shortenAddress(body.address, body.display_name || '');

		if (cache.size >= CACHE_LIMIT) cache.clear();
		cache.set(key, place);
		return { place, error: '' };
	} catch (error) {
		console.info('Geodata: Reverse-Geocoding fehlgeschlagen:', error);
		return { place: '', error: error && error.message ? error.message : String(error) };
	}
};

// The plugin process is not the panel: on the web they are separate frames with separate
// permissions, so "the panel can reach Nominatim" says nothing about the process that
// actually does the geocoding. Hence a probe from here.
export const probeNominatim = async (): Promise<string> => {
	try {
		const response = await fetch('https://nominatim.openstreetmap.org/status.php?format=json');
		return `HTTP ${response.status}`;
	} catch (error) {
		return `blocked (${error && error.message ? error.message : String(error)})`;
	}
};
