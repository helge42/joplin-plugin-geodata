const { distanceBetween, trackStats, downsample, formatDistance, formatDuration } = require('../src/gpx/gpxViewer.js');

let bad = 0;
const check = (name, actual, expected) => {
	if (actual !== expected) {
		bad++;
		console.log(`FAIL  ${name}: erwartet ${JSON.stringify(expected)}, bekommen ${JSON.stringify(actual)}`);
	} else {
		console.log(`ok    ${name} -> ${JSON.stringify(actual)}`);
	}
};

const near = (name, actual, expected, tolerance) => {
	if (Math.abs(actual - expected) > tolerance) {
		bad++;
		console.log(`FAIL  ${name}: erwartet ${expected} ±${tolerance}, bekommen ${actual}`);
	} else {
		console.log(`ok    ${name} -> ${Math.round(actual)}`);
	}
};

const point = (lat, lon, ele = null, time = null) => ({ lat, lon, ele, time });

// Berlin -> Hamburg, Luftlinie rund 255 km.
near('Distanz Berlin-Hamburg', distanceBetween(point(52.5163, 13.3777), point(53.5511, 9.9937)), 255000, 3000);

// Ein Grad Breite ist überall rund 111 km.
near('Ein Grad Breite', distanceBetween(point(0, 0), point(1, 0)), 111195, 100);

const segments = [[
	point(52.5000, 13.4000, 100, Date.parse('2026-08-15T10:00:00Z')),
	point(52.5010, 13.4000, 105, Date.parse('2026-08-15T10:15:00Z')),
	point(52.5020, 13.4000, 103, Date.parse('2026-08-15T10:30:00Z')),
	point(52.5030, 13.4000, 130, Date.parse('2026-08-15T11:00:00Z')),
]];

const stats = trackStats(segments);
near('Streckenlänge', stats.distance, 333, 5);
check('Punktzahl', stats.count, 4);
check('Dauer', stats.duration, 60 * 60 * 1000);
// 100 -> 105 zählt (+5), der Dip auf 103 liegt unter der Schwelle, 105 -> 130 zählt (+25).
near('Anstieg', stats.ascent, 30, 0.01);

// Schwankungen unterhalb der Schwelle dürfen sich nicht aufsummieren.
const noisy = [[point(0, 0, 100), point(0, 0, 102), point(0, 0, 100), point(0, 0, 102), point(0, 0, 100)]];
check('Rauschen ergibt keinen Anstieg', trackStats(noisy).ascent, 0);

// Ohne Zeitstempel gibt es keine Dauer, aber sehr wohl eine Länge.
const noTime = [[point(52.5, 13.4), point(52.51, 13.4)]];
check('Dauer ohne Zeitstempel', trackStats(noTime).duration, null);

const many = Array.from({ length: 5000 }, (unused, i) => point(52.5 + i / 100000, 13.4));
const reduced = downsample(many, 100);
check('Downsampling-Länge', reduced.length, 100);
check('Downsampling behält Anfang', reduced[0], many[0]);
check('Downsampling behält Ende', reduced[reduced.length - 1], many[many.length - 1]);
check('Downsampling lässt Kurzes in Ruhe', downsample(many.slice(0, 50), 100).length, 50);

check('Distanzformat km', formatDistance(12345), '12.3 km');
check('Distanzformat m', formatDistance(842), '842 m');
check('Dauerformat Stunden', formatDuration(3900000), '1 h 05 min');
check('Dauerformat Minuten', formatDuration(900000), '15 min');

const total = 15;
console.log(`\n${total - bad}/${total} bestanden`);
process.exit(bad ? 1 : 0);
