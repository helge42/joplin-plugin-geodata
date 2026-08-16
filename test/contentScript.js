const MarkdownIt = require('markdown-it');
const contentScript = require('../.test-build/gpx/contentScript').default;

const markdownIt = new MarkdownIt();
contentScript().plugin(markdownIt);

let bad = 0;
const check = (name, condition, detail = '') => {
	if (!condition) {
		bad++;
		console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
	} else {
		console.log(`ok    ${name}`);
	}
};

const gpxSource = '<gpx><trk><trkseg><trkpt lat="52.5" lon="13.4"/></trkseg></trk></gpx>';
const rendered = markdownIt.render('```gpx\n' + gpxSource + '\n```');

check('erzeugt den Container', rendered.includes('class="geodata-gpx joplin-editable"'), rendered.slice(0, 200));
check('erzeugt die Kartenfläche', rendered.includes('geodata-gpx-map'));
check('erzeugt die Statistikzeile', rendered.includes('geodata-gpx-stats'));
check('behält die Quelle für den Rich-Text-Editor', rendered.includes('class="joplin-source"'));
check('maskiert die GPX-Quelle', rendered.includes('&lt;trkpt lat=&quot;52.5&quot; lon=&quot;13.4&quot;/&gt;'), rendered);
check('markiert die Sprache', rendered.includes('data-joplin-language="gpx"'));

// Andere Codeblöcke müssen unangetastet durchlaufen.
const other = markdownIt.render('```js\nconst a = 1;\n```');
check('lässt andere Codeblöcke in Ruhe', other.includes('<code') && !other.includes('geodata-gpx'), other);

const plain = markdownIt.render('```\nnur text\n```');
check('lässt Blöcke ohne Sprache in Ruhe', !plain.includes('geodata-gpx'));

// Groß-/Kleinschreibung und Leerzeichen im Info-String.
const upper = markdownIt.render('```GPX \n' + gpxSource + '\n```');
check('erkennt GPX auch groß geschrieben', upper.includes('geodata-gpx'));

const assets = contentScript().assets().map(asset => asset.name);
check('liefert die Assets in der richtigen Reihenfolge',
	assets.join(',') === 'leaflet.css,leaflet.js,gpxViewer.css,gpxViewer.js',
	assets.join(', '));

const total = 10;
console.log(`\n${total - bad}/${total} bestanden`);
process.exit(bad ? 1 : 0);
