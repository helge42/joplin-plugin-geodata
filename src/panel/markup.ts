// Markup for the panel webview. Kept as a template string because
// joplin.views.panels.setHtml() takes a string, not a file.
export const panelHtml = `
<div class="geodata" id="geodata-root">
	<div class="note-title" id="note-title">Keine Notiz ausgewählt</div>

	<div class="status" id="status">–</div>

	<div class="readout" id="readout" hidden>
		<div class="readout-line" id="readout-dms"></div>
		<div class="links">
			<a id="link-osm" href="#" target="_blank" rel="noopener">OpenStreetMap</a>
			<a id="link-geo" href="#">Karten-App</a>
		</div>
	</div>

	<button id="button-locate" class="primary locate" type="button">Aktuellen Standort übernehmen</button>

	<div class="fields">
		<label for="field-latitude">Breite</label>
		<input id="field-latitude" type="text" inputmode="decimal" autocomplete="off" placeholder="52.516300">

		<label for="field-longitude">Länge</label>
		<input id="field-longitude" type="text" inputmode="decimal" autocomplete="off" placeholder="13.377700">

		<label for="field-altitude">Höhe (m)</label>
		<input id="field-altitude" type="text" inputmode="decimal" autocomplete="off" placeholder="0">
	</div>

	<div class="buttons">
		<button id="button-save" class="primary" type="button">Speichern</button>
		<button id="button-reset" type="button">Verwerfen</button>
	</div>

	<div class="section">
		<label for="field-paste">Einfügen &amp; erkennen</label>
		<input id="field-paste" type="text" autocomplete="off" placeholder="geo:… · Maps-Link · 52.5163, 13.3777">
		<div class="hint" id="paste-hint"></div>
		<div class="buttons">
			<button id="button-apply" class="primary" type="button">Übernehmen</button>
		</div>
	</div>

	<div class="buttons secondary-row">
		<button id="button-swap" type="button">Breite/Länge tauschen</button>
		<button id="button-clear" type="button">Löschen</button>
	</div>

	<div class="message" id="message"></div>

	<details class="diagnostics" id="diagnostics">
		<summary>Diagnose</summary>
		<button id="button-probe" type="button">Umgebung prüfen</button>
		<pre id="probe-output"></pre>
	</details>
</div>
`;
