const MarkdownIt = require('markdown-it');
const { default: contentScript, resourceIdFrom, resourceUrlFrom, openResourceLink } = require('../.test-build/gpx/contentScript');

const context = { contentScriptId: 'geodata.gpx' };
const markdownIt = new MarkdownIt();
contentScript(context).plugin(markdownIt);

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

// Ressourcen-Verweise: bare Link und die Markdown-Form, die Joplin beim Anhängen einfügt.
const id = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
check('erkennt bare Ressource', resourceIdFrom(`:/${id}`) === id);
check('erkennt Ressource mit Zeilenumbrüchen', resourceIdFrom(`\n  :/${id}\n`) === id);
check('erkennt Markdown-Link', resourceIdFrom(`[tour.gpx](:/${id})`) === id);
check('erkennt Anhang-Syntax mit Ausrufezeichen', resourceIdFrom(`![tour.gpx](:/${id})`) === id);
check('erkennt Großschreibung', resourceIdFrom(`:/${id.toUpperCase()}`) === id);
check('hält inline-GPX nicht für eine Ressource', resourceIdFrom('<gpx><trkpt lat="1" lon="2"/></gpx>') === '');
check('lehnt zu kurze IDs ab', resourceIdFrom(':/abc') === '');

const withResource = markdownIt.render('```gpx\n:/' + id + '\n```');
check('gibt die Ressourcen-ID weiter', withResource.includes(`data-gpx-resource="${id}"`), withResource);
check('gibt die Content-Script-ID weiter', withResource.includes('data-content-script-id="geodata.gpx"'));
check('inline-Block hat keine Ressourcen-ID', rendered.includes('data-gpx-resource=""'));

const assets = contentScript(context).assets().map(asset => asset.name);
check('liefert die Assets in der richtigen Reihenfolge',
	assets.join(',') === 'leaflet.css,leaflet.js,gpxViewer.css,gpxViewer.js',
	assets.join(', '));


// Ressourcen-URL wie Joplins Bild-Regel sie baut.
const ruleOptions = {
	resources: { [id]: { item: { id, updated_time: 1234, mime: 'application/gpx+xml' } } },
	resourceBaseUrl: 'file:///data/resources/',
	ResourceModel: { filename: (resource) => `${resource.id}.gpx` },
};
check('baut die Ressourcen-URL', resourceUrlFrom(ruleOptions, id) === `file:///data/resources/${id}.gpx?t=1234`, resourceUrlFrom(ruleOptions, id));
check('bevorzugt itemIdToUrl', resourceUrlFrom({ ...ruleOptions, itemIdToUrl: () => 'joplin-content://x.gpx' }, id) === 'joplin-content://x.gpx');
check('ohne bekannte Ressource keine URL', resourceUrlFrom({ resources: {} }, id) === '');

// Öffnen-Link: gleiche Mechanik wie Joplins eigene Ressourcen-Links.
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const openLink = openResourceLink({ postMessageSyntax: 'window.postJoplin' }, id, escapeHtml);
check('Öffnen-Link nutzt postMessageSyntax', openLink.includes('window.postJoplin('), openLink);
check('Öffnen-Link zeigt auf joplin://', openLink.includes(`joplin://${id}`), openLink);
check('Öffnen-Link unterdrückt die Navigation', openLink.includes('return false'), openLink);
check('ohne Ressource kein Öffnen-Link', openResourceLink({}, '', escapeHtml) === '');
check('Block mit Datei bekommt den Öffnen-Link', markdownIt.render('```gpx\n[t.gpx](:/' + id + ')\n```').includes('geodata-gpx-open'));
check('Inline-Block bekommt keinen Öffnen-Link', !rendered.includes('geodata-gpx-open'));

const total = 29;
console.log(`\n${total - bad}/${total} bestanden`);
process.exit(bad ? 1 : 0);
