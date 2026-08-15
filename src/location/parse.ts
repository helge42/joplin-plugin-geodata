import { Coordinates, ParseResult, isValidLatitude, isValidLongitude } from './types';

// Parses whatever the user pasted into the panel: a geo: URI shared from a maps app,
// a Google/OSM/Apple link, plain decimal degrees, or degrees/minutes/seconds.
//
// Everything runs offline. Shortened links (maps.app.goo.gl, goo.gl/maps) cannot be
// resolved without a network round-trip and are rejected with an explanatory message.

const fail = (error: string): ParseResult => ({ coordinates: null, source: '', error });
const succeed = (coordinates: Coordinates, source: string): ParseResult => ({ coordinates, source, error: '' });

const build = (latitude: number, longitude: number, altitude: number | null, source: string): ParseResult => {
	if (!isValidLatitude(latitude)) return fail(`Breitengrad außerhalb -90..90: ${latitude}`);
	if (!isValidLongitude(longitude)) return fail(`Längengrad außerhalb -180..180: ${longitude}`);
	return succeed({ latitude, longitude, altitude }, source);
};

const toNumber = (raw: string | undefined) => {
	if (raw === undefined || raw === null || raw === '') return null;
	const value = Number(raw.replace(',', '.'));
	return Number.isFinite(value) ? value : null;
};

// Applies a hemisphere letter (N/S/E/W) to a magnitude and reports which axis it belongs to.
const applyHemisphere = (value: number, letter: string | undefined) => {
	if (!letter) return { value, axis: '' };
	const upper = letter.toUpperCase();
	const negative = upper === 'S' || upper === 'W';
	return {
		value: negative ? -Math.abs(value) : Math.abs(value),
		axis: upper === 'N' || upper === 'S' ? 'lat' : 'lon',
	};
};

// Given two parsed components, put them in lat/lon order. Without hemisphere letters we
// assume "latitude first", which is what every maps app emits.
const orderPair = (
	first: { value: number; axis: string },
	second: { value: number; axis: string },
) => {
	if (first.axis === 'lon' || second.axis === 'lat') {
		return { latitude: second.value, longitude: first.value };
	}
	return { latitude: first.value, longitude: second.value };
};

const parseGeoUri = (text: string): ParseResult | null => {
	// geo:52.5163,13.3777,34;u=15  and  geo:0,0?q=52.5163,13.3777(Brandenburger Tor)
	const query = /geo:[^?\s]*\?[^#\s]*\bq=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(text);
	if (query) return build(Number(query[1]), Number(query[2]), null, 'geo:-URI (q=)');

	const plain = /geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?))?/i.exec(text);
	if (plain) {
		const coordinates = build(Number(plain[1]), Number(plain[2]), toNumber(plain[3]), 'geo:-URI');
		// "geo:0,0" alone carries no position - it is only a container for a ?q= parameter.
		if (coordinates.coordinates && plain[1] === '0' && plain[2] === '0') return null;
		return coordinates;
	}
	return null;
};

const parseMapUrl = (text: string): ParseResult | null => {
	if (!/https?:\/\//i.test(text)) return null;

	if (/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(text)) {
		return fail('Kurzlinks enthalten keine Koordinaten. Bitte den Link in der Karten-App öffnen und die vollständige Adresse oder die Koordinaten kopieren.');
	}

	// OpenStreetMap: ?mlat=52.5163&mlon=13.3777 and /#map=15/52.5163/13.3777.
	// The marker comes first: a share link carries both, and the marker is the place the
	// user meant, while #map= is only the viewport it happened to be shown in.
	const mlat = /[?&#]mlat=(-?\d+(?:\.\d+)?)/i.exec(text);
	const mlon = /[?&#]mlon=(-?\d+(?:\.\d+)?)/i.exec(text);
	if (mlat && mlon) return build(Number(mlat[1]), Number(mlon[1]), null, 'OpenStreetMap-Marker');

	const osmHash = /[#&]map=[\d.]+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i.exec(text);
	if (osmHash) return build(Number(osmHash[1]), Number(osmHash[2]), null, 'OpenStreetMap-Link');

	// Google Maps place link: !3d52.5163!4d13.3777 (the actual place, not the viewport)
	const placeData = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text);
	if (placeData) return build(Number(placeData[1]), Number(placeData[2]), null, 'Google-Maps-Ort');

	// Google Maps viewport: /@52.5163,13.3777,15z
	const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(text);
	if (at) return build(Number(at[1]), Number(at[2]), null, 'Google-Maps-Kartenmitte');

	// Generic query parameters used by Google, Apple, Bing and others.
	const params = /[?&](?:q|ll|sll|center|daddr|saddr|cp|point)=(-?\d+(?:\.\d+)?)\s*[,~]\s*(-?\d+(?:\.\d+)?)/i.exec(text);
	if (params) return build(Number(params[1]), Number(params[2]), null, 'Karten-Link');

	return fail('In diesem Link wurden keine Koordinaten gefunden.');
};

const parseDms = (text: string): ParseResult | null => {
	// 52°30'58.7"N 13°22'39.7"E - minutes and seconds are optional, the hemisphere
	// letter may come before or after the number.
	//
	// The lookbehind keeps us out of decimal degrees: without it, "52.5163° N" would
	// match the trailing "163°" as a degree value.
	const component = /([NSEWnsew])?\s*(?<![\d.])(\d{1,3})\s*[°d:\u00BA]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['\u2032\u0027m:]?\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*["\u2033s]?\s*)?([NSEWnsew])?/g;

	const found: { value: number; axis: string }[] = [];
	let match: RegExpExecArray | null;
	while ((match = component.exec(text)) !== null) {
		const letter = match[1] || match[5];
		// Without a hemisphere letter this is more likely a temperature or an angle
		// than a coordinate, so we only accept clearly marked components.
		if (!letter) continue;

		const degrees = Number(match[2]);
		const minutes = toNumber(match[3]) ?? 0;
		const seconds = toNumber(match[4]) ?? 0;
		found.push(applyHemisphere(degrees + minutes / 60 + seconds / 3600, letter));
		if (found.length === 2) break;
	}

	if (found.length !== 2) return null;
	const { latitude, longitude } = orderPair(found[0], found[1]);
	return build(latitude, longitude, null, 'Grad/Minuten/Sekunden');
};

const parseDecimalPair = (text: string): ParseResult | null => {
	// Accept German decimal commas when the two numbers are separated by whitespace
	// or a semicolon ("52,5163 13,3777") - with a comma separator it is ambiguous.
	const normalised = /^\s*-?\d+,\d+\s*[;\s]\s*-?\d+,\d+\s*$/.test(text)
		? text.replace(/,/g, '.')
		: text;

	const pair = /(?:([NSEWnsew])\s*)?(-?\d{1,3}(?:\.\d+)?)\s*[°\u00BA]?\s*(?:([NSEWnsew])\s*)?\s*[,;/\s]\s*(?:([NSEWnsew])\s*)?(-?\d{1,3}(?:\.\d+)?)\s*[°\u00BA]?\s*(?:([NSEWnsew])\s*)?/.exec(normalised);
	if (!pair) return null;

	const first = applyHemisphere(Number(pair[2]), pair[1] || pair[3]);
	const second = applyHemisphere(Number(pair[5]), pair[4] || pair[6]);
	const { latitude, longitude } = orderPair(first, second);
	return build(latitude, longitude, null, 'Dezimalgrad');
};

export const parseLocation = (input: string): ParseResult => {
	const text = (input || '').trim();
	if (!text) return fail('Bitte etwas einfügen.');

	const matchers = [parseGeoUri, parseMapUrl, parseDms, parseDecimalPair];
	for (const matcher of matchers) {
		const result = matcher(text);
		if (result) return result;
	}

	return fail('Keine Koordinaten erkannt. Unterstützt werden geo:-URIs, Google-/OSM-Links, "52.5163, 13.3777" und 52°30\'58"N 13°22\'39"E.');
};
