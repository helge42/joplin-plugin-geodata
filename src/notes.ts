import joplin from 'api';
import { Coordinates } from './location/types';

export interface NoteGeodata {
	id: string;
	title: string;
	coordinates: Coordinates;
}

const GEO_FIELDS = ['id', 'title', 'latitude', 'longitude', 'altitude'];

export const readNoteGeodata = async (noteId: string): Promise<NoteGeodata | null> => {
	if (!noteId) return null;

	const note = await joplin.data.get(['notes', noteId], { fields: GEO_FIELDS });
	if (!note) return null;

	return {
		id: note.id,
		title: note.title,
		coordinates: {
			latitude: Number(note.latitude) || 0,
			longitude: Number(note.longitude) || 0,
			altitude: Number(note.altitude) || 0,
		},
	};
};

export const readSelectedNoteGeodata = async (): Promise<NoteGeodata | null> => {
	const selected = await joplin.workspace.selectedNote();
	if (!selected) return null;
	return readNoteGeodata(selected.id);
};

// Writes only the geo fields. Joplin's editors save a diff of changed fields, so an open
// note does not overwrite what we write here (see PLAN.md, section 2).
export const writeCoordinates = async (noteId: string, coordinates: Coordinates) => {
	const payload: Record<string, number> = {
		latitude: coordinates.latitude,
		longitude: coordinates.longitude,
	};
	if (coordinates.altitude !== null) payload.altitude = coordinates.altitude;

	await joplin.data.put(['notes', noteId], null, payload);
};
