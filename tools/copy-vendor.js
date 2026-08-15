// Copies Leaflet out of node_modules into src/panel/vendor/, from where webpack's
// CopyPlugin picks it up like any other panel asset.
//
// Bundling it rather than loading from a CDN is deliberate: the panel has to work in a
// tunnel or abroad without data. Only the map tiles need the network.

const fs = require('fs');
const path = require('path');

const source = path.dirname(require.resolve('leaflet/package.json'));
const target = path.resolve(__dirname, '..', 'src', 'panel', 'vendor');
const files = ['dist/leaflet.js', 'dist/leaflet.css'];

fs.mkdirSync(target, { recursive: true });

for (const file of files) {
	const from = path.join(source, file);
	if (!fs.existsSync(from)) {
		console.error(`copy-vendor: ${from} fehlt - "npm install" ausführen.`);
		process.exit(1);
	}
	fs.copyFileSync(from, path.join(target, path.basename(file)));
}

const version = require('leaflet/package.json').version;
console.log(`copy-vendor: Leaflet ${version} nach src/panel/vendor/ kopiert`);
