import { Dictionary, Translate } from '../i18n';

// Markup for the panel webview. Kept as a template string because
// joplin.views.panels.setHtml() takes a string, not a file.
//
// The dictionary travels along in a data attribute: the panel needs its own strings for
// runtime messages, and reading them from the DOM is synchronous, unlike asking the plugin
// process for them.
export const panelHtml = (t: Translate, dictionary: Dictionary) => {
	const strings = JSON.stringify(dictionary).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');

	return `
<div class="geodata" id="geodata-root" data-strings='${strings}'>
	<div class="note-title" id="note-title">${t('panel.noNote')}</div>

	<div class="status" id="status">–</div>

	<div class="readout" id="readout" hidden>
		<div class="readout-line" id="readout-dms"></div>
		<div class="links">
			<a id="link-osm" href="#" target="_blank" rel="noopener">${t('panel.openStreetMap')}</a>
			<a id="link-geo" href="#">${t('panel.mapsApp')}</a>
		</div>
	</div>

	<div class="map-block">
		<div class="map-header">
			<button id="button-map-toggle" class="link-button" type="button">${t('panel.hideMap')}</button>
		</div>
		<div id="map" class="map"></div>
		<div class="hint" id="map-hint"></div>
	</div>

	<button id="button-locate" class="primary locate" type="button">${t('panel.locate')}</button>

	<div class="section">
		<label for="field-paste">${t('panel.paste')}</label>
		<input id="field-paste" type="text" autocomplete="off" placeholder="${t('panel.pastePlaceholder')}">
		<div class="hint" id="paste-hint"></div>
	</div>

	<div class="fields">
		<label for="field-latitude">${t('panel.latitude')}</label>
		<input id="field-latitude" type="text" inputmode="decimal" autocomplete="off" placeholder="52.516300">

		<label for="field-longitude">${t('panel.longitude')}</label>
		<input id="field-longitude" type="text" inputmode="decimal" autocomplete="off" placeholder="13.377700">

		<label for="field-altitude">${t('panel.altitude')}</label>
		<input id="field-altitude" type="text" inputmode="decimal" autocomplete="off" placeholder="0">
	</div>

	<div class="buttons">
		<button id="button-insert" type="button">${t('panel.insertIntoNote')}</button>
	</div>
	<div class="hint" id="insert-hint"></div>

	<div class="buttons">
		<button id="button-save" class="primary" type="button">${t('panel.save')}</button>
		<button id="button-reset" type="button">${t('panel.discard')}</button>
	</div>

	<div class="buttons secondary-row">
		<button id="button-swap" type="button">${t('panel.swap')}</button>
		<button id="button-clear" type="button">${t('panel.clear')}</button>
	</div>

	<div class="message" id="message"></div>

	<details class="diagnostics" id="diagnostics">
		<summary>${t('panel.diagnostics')}</summary>
		<button id="button-probe" type="button">${t('panel.probe')}</button>
		<pre id="probe-output"></pre>
	</details>
</div>
`;
};
