const { renderTemplate, defaultTemplate } = require('../.test-build/template');

const berlin = { latitude: 52.5163, longitude: 13.3777, altitude: 34 };
const noAltitude = { latitude: 52.5163, longitude: 13.3777, altitude: 0 };
const now = new Date(2026, 7, 15, 14, 35); // 15. August 2026, 14:35 Ortszeit

const render = (template, coordinates = berlin, place = '') => renderTemplate(template, { coordinates, place, now });

const cases = [
	['{lat}, {lon}', '52.5163, 13.3777'],
	['{alt}', '34'],
	[defaultTemplate, '📍 [52.5163, 13.3777](https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=15/52.5163/13.3777)'],
	['{geo}', 'geo:52.5163,13.3777?q=52.5163,13.3777'],
	['{dms}', `52°30'58.7"N 13°22'39.7"E`],
	['{date} {time}', '2026-08-15 14:35'],
	// Unknown placeholders stay visible instead of leaving a hole in the note.
	['{lat} {bogus}', '52.5163 {bogus}'],
	['kein Platzhalter', 'kein Platzhalter'],
];

let bad = 0;

for (const [template, expected] of cases) {
	const actual = render(template);
	if (actual !== expected) {
		bad++;
		console.log(`FAIL  ${JSON.stringify(template)}\n      erwartet ${JSON.stringify(expected)}\n      bekommen ${JSON.stringify(actual)}`);
	} else {
		console.log(`ok    ${JSON.stringify(template)} -> ${JSON.stringify(actual).slice(0, 70)}`);
	}
}

// Höhe 0 bedeutet "unbekannt" und darf nicht als "0 m" in der Notiz landen.
const emptyAltitude = render('[{alt}]', noAltitude);
if (emptyAltitude !== '[]') {
	bad++;
	console.log(`FAIL  Höhe 0 sollte leer bleiben, bekommen ${JSON.stringify(emptyAltitude)}`);
} else {
	console.log('ok    Höhe 0 bleibt leer');
}

const withPlace = render('{place}: {lat}', berlin, 'Brandenburger Tor, Berlin');
if (withPlace !== 'Brandenburger Tor, Berlin: 52.5163') {
	bad++;
	console.log(`FAIL  {place}, bekommen ${JSON.stringify(withPlace)}`);
} else {
	console.log('ok    {place} wird eingesetzt');
}

const total = cases.length + 2;
console.log(`\n${total - bad}/${total} bestanden`);
process.exit(bad ? 1 : 0);
