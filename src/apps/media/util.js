/* JPKCom Desktop — media players: pure helpers (times, ratios, bit rate, config, blob types) — © Jean Pierre Kolb — MIT License

   No DOM, no Desk: the tests import these in Node. */

import { EXTENSIONS, MEDIA_TYPES, extOf } from './types.js';

/** Defaults of the optional config section `media` (site/config.js) */
export const MEDIA_DEFAULTS = Object.freeze({ maxItems: 200, seekStep: 5 });

/** "3:25" or "1:02:07"; '–:––' for an unknown or endless length */
export function clock(sec) {
	if (!Number.isFinite(sec) || sec < 0) return '–:––';
	const s = Math.floor(sec);
	const mm = String(Math.floor((s % 3600) / 60));
	const ss = String(s % 60).padStart(2, '0');
	return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** 1920×1080 → { a: 16, b: 9 }; null when the reduced sides exceed 32 (then w/h:1 reads better) or the size is unknown */
export function ratioParts(w, h) {
	if (!(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0)) return null;
	const g = gcd(w, h);
	return w / g <= 32 && h / g <= 32 ? { a: w / g, b: h / g } : null;
}

/** Average bit rate in kbit/s from the file size and the length; 0 when the length is unknown */
export function bitRate(bytes, sec) {
	return Number.isFinite(sec) && sec > 0 && Number.isFinite(bytes) && bytes > 0 ? (bytes * 8) / sec / 1000 : 0;
}

/**
 * The index to play after "next": the following one, at the end the first
 * when the playlist repeats, else null.
 */
export function nextIndex(idx, length, repeat) {
	if (idx < 0 || idx >= length) return null;
	if (idx < length - 1) return idx + 1;
	return repeat === 'all' ? 0 : null;
}

/** "Next" is off without a track, and on the last one unless the playlist repeats */
export const nextOff = (idx, length, repeat) => nextIndex(idx, length, repeat) === null;

/**
 * Repeat switches: a switch turns its mode on, or off again; the menu (direct)
 * sets a mode. "Repeat playlist" needs two files at least.
 */
export function repeatAfter(current, mode, { direct = false, count = 0 } = {}) {
	let next = direct || current !== mode ? mode : 'off';
	if (!['off', 'one', 'all'].includes(next)) next = 'off';
	if (next === 'all' && count < 2) next = 'off';
	return next;
}

/** Cleans config.media: { maxItems 1–1000, seekStep 1–60 s }; invalid values are warned about and replaced */
export function cleanMediaConfig(section, warn = () => {}) {
	const out = { ...MEDIA_DEFAULTS };
	if (section == null) return out;
	if (typeof section !== 'object' || Array.isArray(section)) {
		warn('expected an object — defaults used');
		return out;
	}
	const int = (key, min, max) => {
		if (!(key in section)) return;
		const v = section[key];
		if (Number.isInteger(v) && v >= min && v <= max) out[key] = v;
		else warn(`${key} must be an integer from ${min} to ${max} — ${MEDIA_DEFAULTS[key]} used`);
	};
	int('maxItems', 1, 1000);
	int('seekStep', 1, 60);
	return out;
}

/**
 * The type a file of this kind plays under: its media type for an accepted
 * extension of the kind (a type from another kind or an unknown extension:
 * 'application/octet-stream').
 */
export function typeFor(ext, kind) {
	const e = String(ext || '').toLowerCase().replace(/^\./, '');
	const lists = kind && EXTENSIONS[kind] ? [EXTENSIONS[kind]] : Object.values(EXTENSIONS);
	return lists.some(list => list.includes(`.${e}`)) && MEDIA_TYPES[e] ? MEDIA_TYPES[e] : 'application/octet-stream';
}

/**
 * What a player puts into its blob URL. A file is accepted by its extension
 * too, so it may bring an empty or a wrong type (text/html, image/svg+xml …);
 * the browser's own "Open video in new tab" would then show it as a document
 * in the desktop's origin. A real audio/video type passes; anything else gets
 * a copy with the media type of its extension (never a document type).
 */
export function mediaBlob(file, kind) {
	if (/^(audio|video)\/[a-z0-9.+-]+$/i.test(String(file?.type ?? ''))) return file;
	return file.slice(0, file.size, typeFor(extOf(file.name), kind));
}
