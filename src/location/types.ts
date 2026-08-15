export interface Coordinates {
	latitude: number;
	longitude: number;
	// `null` means "not given by the source" - the note's existing altitude is then kept.
	altitude: number | null;
}

export interface ParseResult {
	coordinates: Coordinates | null;
	// Name of the matcher that produced the result, shown in the UI so the user
	// can tell how their input was understood.
	source: string;
	error: string;
}

export const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
export const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

// Joplin stores "no geolocation" as 0/0, which is also a valid (if unlikely) position
// in the Gulf of Guinea. We follow the app and treat it as "empty".
export const isEmpty = (coordinates: Coordinates | null) => {
	if (!coordinates) return true;
	return coordinates.latitude === 0 && coordinates.longitude === 0;
};
