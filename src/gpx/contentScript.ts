// Markdown-it rule for ```gpx blocks. It only produces the container and hands the raw GPX
// on; parsing and drawing happen in gpxViewer.js, which runs inside the note viewer.
//
// Compiled via plugin.config.json -> extraScripts, because Joplin require()s this file.

// A block may hold the GPX itself or just point at an attached file, written either as a
// bare resource link (":/<32 hex>") or as the Markdown link Joplin inserts when you attach
// a file ("[track.gpx](:/<32 hex>)").
export const resourceIdFrom = (content: string) => {
	const match = /^\s*(?:!?\[[^\]]*\]\(\s*)?:\/([0-9a-f]{32})\s*\)?\s*$/i.exec(content || '');
	return match ? match[1].toLowerCase() : '';
};

export default function(context: { contentScriptId: string }) {
	return {
		plugin: function(markdownIt: any) {
			const defaultRender = markdownIt.renderer.rules.fence || function(tokens: any, idx: number, options: any, env: any, self: any) {
				return self.renderToken(tokens, idx, options, env, self);
			};

			markdownIt.renderer.rules.fence = function(tokens: any, idx: number, options: any, env: any, self: any) {
				const token = tokens[idx];
				if ((token.info || '').trim().toLowerCase() !== 'gpx') {
					return defaultRender(tokens, idx, options, env, self);
				}

				const source = markdownIt.utils.escapeHtml(token.content);
				const resourceId = resourceIdFrom(token.content);
				const escapeAttribute = markdownIt.utils.escapeHtml;

				// The joplin-editable/joplin-source pair lets the rich text editor turn the
				// rendered block back into the original fenced code. Joplin's own stylesheet
				// hides .joplin-source, and the viewer reads the GPX back out of it.
				return `
					<div class="geodata-gpx joplin-editable">
						<pre
							class="joplin-source"
							data-joplin-language="gpx"
							data-joplin-source-open="\`\`\`gpx&#10;"
							data-joplin-source-close="\`\`\`"
						>${source}</pre>
						<div
							class="geodata-gpx-map"
							data-gpx-resource="${escapeAttribute(resourceId)}"
							data-content-script-id="${escapeAttribute(context.contentScriptId)}"
						></div>
						<div class="geodata-gpx-stats"></div>
					</div>
				`;
			};
		},

		// Loaded in this order, so window.L exists by the time gpxViewer.js runs.
		assets: function() {
			return [
				{ name: 'leaflet.css' },
				{ name: 'leaflet.js' },
				{ name: 'gpxViewer.css' },
				{ name: 'gpxViewer.js' },
			];
		},
	};
}
