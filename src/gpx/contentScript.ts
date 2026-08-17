// Markdown-it rule for ```gpx blocks. It only produces the container and hands the raw GPX
// on; parsing and drawing happen in gpxViewer.js, which runs inside the note viewer.
//
// Compiled via plugin.config.json -> extraScripts, because Joplin require()s this file.

// A block may hold the GPX itself or just point at an attached file, written either as a
// bare resource link (":/<32 hex>") or as the Markdown link Joplin inserts when you attach
// a file ("[track.gpx](:/<32 hex>)").
const RESOURCE_PATTERN = /^\s*(?:!?\[([^\]]*)\]\(\s*)?:\/([0-9a-f]{32})\s*\)?\s*$/i;

export const resourceIdFrom = (content: string) => {
	const match = RESOURCE_PATTERN.exec(content || '');
	return match ? match[2].toLowerCase() : '';
};

// Builds the same URL Joplin's own image rule uses for a resource, so the note viewer can
// load the file directly. That is the only way that works on Android, where the data API
// refuses the resource body with "Unsupported encoding: buffer".
export const resourceUrlFrom = (ruleOptions: any, resourceId: string) => {
	const resource = ruleOptions && ruleOptions.resources && ruleOptions.resources[resourceId]
		? ruleOptions.resources[resourceId].item
		: null;
	if (!resource) return '';

	const timestamp = `?t=${resource.updated_time}`;
	const fromHandler = ruleOptions.itemIdToUrl ? ruleOptions.itemIdToUrl(resource.id, timestamp) : null;
	if (fromHandler) return fromHandler;

	if (!ruleOptions.ResourceModel) return '';
	return `${ruleOptions.resourceBaseUrl || './'}${ruleOptions.ResourceModel.filename(resource)}${timestamp}`;
};

// Builds the same anchor Joplin's own link rule produces for an attached file, so tapping
// it goes through Joplin's resource handling and ends up in the system's app chooser -
// which is how a track gets into OsmAnd and friends. See linkReplacement.ts.
export const openResourceLink = (ruleOptions: any, resourceId: string, escapeHtml: (value: string) => string) => {
	if (!resourceId) return '';

	const post = (ruleOptions && ruleOptions.postMessageSyntax) || 'postMessage';

	// On mobile the same message a long press sends opens Joplin's own attachment menu,
	// which offers "Share" - and that route copies the file to the cache under its original
	// name first (ShareUtils.copyToCache -> Resource.friendlySafeFilename). Opening the
	// resource directly would hand over <id>.gpx instead, because showResource passes the
	// stored path straight to FileViewer.
	//
	// enableLongPress is Joplin's own signal for "this is the mobile renderer"; on the
	// desktop the menu does not exist, so there we open the resource directly.
	const useMenu = !!(ruleOptions && ruleOptions.enableLongPress);
	const js = useMenu
		? `${post}(${JSON.stringify(`longclick:${resourceId}`)}); return false;`
		: `${post}(${JSON.stringify(`joplin://${resourceId}`)}, { resourceId: ${JSON.stringify(resourceId)} }); return false;`;

	// The label is left empty on purpose: the content script runs in the renderer and has no
	// access to the settings, so it cannot know the user's language. gpxViewer.js fills it in
	// once it has fetched the strings from the plugin process.
	return `<a class="geodata-gpx-open" data-menu="${useMenu ? '1' : '0'}" data-from-md data-resource-id="${escapeHtml(resourceId)}" href="#" onclick="${escapeHtml(js)}"></a>`;
};

export default function(context: { contentScriptId: string }) {
	return {
		plugin: function(markdownIt: any, ruleOptions: any) {
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
							data-gpx-url="${escapeAttribute(resourceId ? resourceUrlFrom(ruleOptions, resourceId) : '')}"
							data-content-script-id="${escapeAttribute(context.contentScriptId)}"
						></div>
						<div class="geodata-gpx-stats"></div>
						<div class="geodata-gpx-actions">${openResourceLink(ruleOptions, resourceId, escapeAttribute)}</div>
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
