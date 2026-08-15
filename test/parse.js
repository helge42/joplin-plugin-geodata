const { parseLocation } = require('../.test-build/parse');

const cases = [
	['geo:52.5163,13.3777', 52.5163, 13.3777],
	['geo:52.5163,13.3777,34;u=15', 52.5163, 13.3777, 34],
	['geo:0,0?q=52.5163,13.3777(Brandenburger%20Tor)', 52.5163, 13.3777],
	['52.5163, 13.3777', 52.5163, 13.3777],
	['52.5163,13.3777', 52.5163, 13.3777],
	['-33.8688, 151.2093', -33.8688, 151.2093],
	['52,5163 13,3777', 52.5163, 13.3777],
	['N 52.5163 E 13.3777', 52.5163, 13.3777],
	['52.5163° N, 13.3777° W', 52.5163, -13.3777],
	['S 33.8688, E 151.2093', -33.8688, 151.2093],
	['13.3777 E, 52.5163 N', 52.5163, 13.3777],
	[`52°30'58.7"N 13°22'39.7"E`, 52.51631, 13.37769],
	[`52°30'58.7"S 13°22'39.7"W`, -52.51631, -13.37769],
	['https://www.openstreetmap.org/#map=15/52.5163/13.3777', 52.5163, 13.3777],
	['https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=15/52.5/13.3', 52.5163, 13.3777],
	['https://www.google.com/maps/@52.5163,13.3777,15z', 52.5163, 13.3777],
	['https://www.google.com/maps/place/Berlin/@52.5,13.4,15z/data=!3m1!4b1!3d52.5163!4d13.3777', 52.5163, 13.3777],
	['https://maps.google.com/?q=52.5163,13.3777', 52.5163, 13.3777],
	['https://maps.apple.com/?ll=52.5163,13.3777&q=Berlin', 52.5163, 13.3777],
	['Schau mal:\nhttps://www.openstreetmap.org/#map=19/48.8584/2.2945\nwar toll', 48.8584, 2.2945],
];

const failures = [
	'',
	'kein ort hier',
	'https://maps.app.goo.gl/abc123',
	'95.0, 13.0',
	'52.5163, 200.0',
	'https://example.com/nothing',
];

let bad = 0;
const close = (a, b) => Math.abs(a - b) < 0.0001;

for (const [input, lat, lon, alt] of cases) {
	const result = parseLocation(input);
	const c = result.coordinates;
	const ok = c && close(c.latitude, lat) && close(c.longitude, lon) && (alt === undefined || c.altitude === alt);
	if (!ok) {
		bad++;
		console.log(`FAIL  ${JSON.stringify(input)}\n      erwartet ${lat}, ${lon}${alt !== undefined ? `, alt ${alt}` : ''}\n      bekommen ${c ? `${c.latitude}, ${c.longitude}, alt ${c.altitude}` : `null (${result.error})`}`);
	} else {
		console.log(`ok    ${result.source.padEnd(24)} ${JSON.stringify(input).slice(0, 60)}`);
	}
}

for (const input of failures) {
	const result = parseLocation(input);
	if (result.coordinates) {
		bad++;
		console.log(`FAIL  ${JSON.stringify(input)} hätte scheitern sollen, ergab ${result.coordinates.latitude}, ${result.coordinates.longitude}`);
	} else {
		console.log(`ok    abgelehnt: ${JSON.stringify(input).slice(0, 40)} -> ${result.error.slice(0, 60)}`);
	}
}

console.log(`\n${cases.length + failures.length - bad}/${cases.length + failures.length} bestanden`);
process.exit(bad ? 1 : 0);
