import { Coordinates } from './types';

// ~11 cm at the equator - more digits than any consumer GPS can justify, but Joplin
// stores the raw value and we do not want to lose precision on a round-trip.
const DECIMAL_DIGITS = 6;

export const formatDecimal = (value: number) => {
	return Number(value).toFixed(DECIMAL_DIGITS).replace(/\.?0+$/, '');
};

export const formatDms = (value: number, axis: 'lat' | 'lon') => {
	const letter = axis === 'lat' ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
	const absolute = Math.abs(value);
	const degrees = Math.floor(absolute);
	const minutesFull = (absolute - degrees) * 60;
	const minutes = Math.floor(minutesFull);
	const seconds = (minutesFull - minutes) * 60;
	return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds.toFixed(1).padStart(4, '0')}"${letter}`;
};

export const formatPairDecimal = (coordinates: Coordinates) => {
	return `${formatDecimal(coordinates.latitude)}, ${formatDecimal(coordinates.longitude)}`;
};

export const formatPairDms = (coordinates: Coordinates) => {
	return `${formatDms(coordinates.latitude, 'lat')} ${formatDms(coordinates.longitude, 'lon')}`;
};

// Handed to the OS so the user's own maps app opens - works offline with OsmAnd etc.
export const geoUri = (coordinates: Coordinates) => {
	const base = `geo:${formatDecimal(coordinates.latitude)},${formatDecimal(coordinates.longitude)}`;
	return `${base}?q=${formatDecimal(coordinates.latitude)},${formatDecimal(coordinates.longitude)}`;
};

export const osmUrl = (coordinates: Coordinates, zoom = 15) => {
	const latitude = formatDecimal(coordinates.latitude);
	const longitude = formatDecimal(coordinates.longitude);
	return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;
};
