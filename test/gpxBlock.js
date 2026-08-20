const { gpxWaypointBlock } = require('../.test-build/location/gpxBlock');

const now = new Date(Date.UTC(2026, 7, 20, 12, 14, 0));

const berlin = { latitude: 52.5163, longitude: 13.3777, altitude: 34 };
const flat = { latitude: 52.5163, longitude: 13.3777, altitude: 0 };

const cases = [
	['öffnet und schließt den Code-Block', gpxWaypointBlock(berlin, now), (text) => text.startsWith('```gpx\n') && text.endsWith('\n```')],
	['schreibt den Wegpunkt', gpxWaypointBlock(berlin, now), (text) => text.includes('<wpt lat="52.5163" lon="13.3777">')],
	['nimmt die Höhe mit', gpxWaypointBlock(berlin, now), (text) => text.includes('<ele>34</ele>')],
	['lässt die Höhe weg, wenn sie 0 ist', gpxWaypointBlock(flat, now), (text) => !text.includes('<ele>')],
	['schreibt die Zeit in UTC ohne Millisekunden', gpxWaypointBlock(berlin, now), (text) => text.includes('<time>2026-08-20T12:14:00Z</time>')],
	['ohne Namen kein <name>', gpxWaypointBlock(berlin, now), (text) => !text.includes('<name>')],
	['nimmt einen Namen auf', gpxWaypointBlock(berlin, now, 'Rast'), (text) => text.includes('<name>Rast</name>')],
	['maskiert XML im Namen', gpxWaypointBlock(berlin, now, 'Kaffee & <Kuchen>'), (text) => text.includes('<name>Kaffee &amp; &lt;Kuchen&gt;</name>')],
	// Der eigene Viewer muss den Block auch wieder lesen können.
	['nennt sich als Erzeuger', gpxWaypointBlock(berlin, now), (text) => text.includes('creator="Joplin Geodata"')],
];

let bad = 0;

for (const [name, text, check] of cases) {
	if (check(text)) {
		console.log(`ok    ${name}`);
	} else {
		bad++;
		console.log(`FAIL  ${name}\n${text}`);
	}
}

console.log(`\n${cases.length - bad}/${cases.length} bestanden`);
process.exit(bad ? 1 : 0);
