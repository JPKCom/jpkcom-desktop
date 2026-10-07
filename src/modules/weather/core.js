/* JPKCom Desktop — weather: conditions, icons, validation, units (pure) — © Jean Pierre Kolb — MIT License

   Providers deliver metric values (°C, km/h, %) and provider-neutral condition
   keys; the module converts for display (config.weather.units) and maps the
   conditions to Tabler icons and to the 'weather' locale ('cond-<key>').
   No DOM, no desktop imports — tests use these functions directly. */

import { isObj } from '../../core/is.js';

/** Condition keys every provider maps to (texts: weather.cond-<key>) */
export const CONDITIONS = Object.freeze([
	'clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night', 'cloudy', 'fog', 'wind',
	'rain', 'sleet', 'snow', 'hail', 'thunderstorm'
]);

/** Condition → Tabler icon (no partly-cloudy glyph in Tabler: the sun/moon behind haze lines stands in) */
const ICONS = Object.freeze({
	'clear-day': 'ti-sun',
	'clear-night': 'ti-moon-stars',
	'partly-cloudy-day': 'ti-haze',
	'partly-cloudy-night': 'ti-haze-moon',
	cloudy: 'ti-cloud',
	fog: 'ti-cloud-fog',
	wind: 'ti-wind',
	rain: 'ti-cloud-rain',
	sleet: 'ti-cloud-snow',
	snow: 'ti-snowflake',
	hail: 'ti-cloud-snow',
	thunderstorm: 'ti-cloud-storm'
});
const FALLBACK_ICON = 'ti-temperature';

export const conditionOf = v => (typeof v === 'string' && CONDITIONS.includes(v) ? v : null);
export const glyphOf = v => ICONS[conditionOf(v)] ?? FALLBACK_ICON;

/**
 * WMO weather interpretation code (Open-Meteo weather_code) → condition key.
 * day: true/false (is_day); unknown codes → null.
 */
export function wmoCondition(code, day = true) {
	if (!Number.isInteger(code)) return null;
	if (code === 0) return day ? 'clear-day' : 'clear-night';
	if (code === 1 || code === 2) return day ? 'partly-cloudy-day' : 'partly-cloudy-night';
	if (code === 3) return 'cloudy';
	if (code === 45 || code === 48) return 'fog';
	if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
	if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return 'rain';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	if (code === 95) return 'thunderstorm';
	if (code === 96 || code === 99) return 'hail';
	return null;
}

export const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Two decimals — about 1 km; coordinates are never kept more precisely */
export const round2 = v => Math.round(v * 100) / 100;

const validLat = v => num(v) !== null && Math.abs(v) <= 90;
const validLon = v => num(v) !== null && Math.abs(v) <= 180;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const isText = v => (typeof v === 'string' && v.length > 0)
	|| (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));

/** A usable IANA time zone? */
export function validTz(tz) {
	if (typeof tz !== 'string' || !tz) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/**
 * Cleans config.weather (writable copy). Places: { id, name, lat, lon, tz };
 * invalid ones are dropped; the default place falls back to the first one.
 */
export function cleanConfig(section, warn = () => {}) {
	const out = isObj(section) ? section : {};
	if (typeof out.provider !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(out.provider)) {
		if (out.provider !== undefined) warn(`provider ${JSON.stringify(out.provider)} is invalid — using 'open-meteo'`);
		out.provider = 'open-meteo';
	}
	if (out.units !== 'metric' && out.units !== 'imperial') {
		if (out.units !== undefined) warn(`units must be 'metric' or 'imperial' — using 'metric'`);
		out.units = 'metric';
	}
	const places = [];
	for (const p of Array.isArray(out.places) ? out.places : []) {
		const ok = isObj(p) && typeof p.id === 'string' && ID.test(p.id) && p.id !== 'here' && isText(p.name)
			&& validLat(p.lat) && validLon(p.lon) && !places.some(x => x.id === p.id);
		if (!ok) {
			warn(`places: skipped an invalid entry ${JSON.stringify(p)}`);
			continue;
		}
		if (p.tz !== undefined && p.tz !== null && !validTz(p.tz)) warn(`places: '${p.id}' has an unknown time zone ${JSON.stringify(p.tz)} — the browser's is used`);
		places.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, tz: validTz(p.tz) ? p.tz : null });
	}
	out.places = places;
	if (!places.some(p => p.id === out.defaultPlace)) {
		if (out.defaultPlace !== undefined && places.length) warn(`defaultPlace ${JSON.stringify(out.defaultPlace)} is not one of the places`);
		out.defaultPlace = places[0]?.id ?? null;
	}
	const ms = (k, fallback, min) => {
		if (!(Number.isInteger(out[k]) && out[k] >= min)) {
			if (out[k] !== undefined) warn(`${k} must be a whole number of milliseconds ≥ ${min}`);
			out[k] = fallback;
		}
	};
	ms('freshMs', 900000, 60000);
	ms('maxAgeMs', 10800000, 60000);
	ms('everyMs', 1800000, 60000);
	if (out.maxAgeMs < out.freshMs) out.maxAgeMs = out.freshMs;
	return out;
}

/**
 * The stored choice { place, lat, lon }: place is a configured id or 'here'
 * (only with valid stored coordinates). Anything else → the default place.
 */
export function cleanPrefs(v, places, defaultPlace) {
	const lat = validLat(v?.lat) ? round2(v.lat) : null;
	const lon = validLon(v?.lon) ? round2(v.lon) : null;
	const has = lat !== null && lon !== null;
	const ids = places.map(p => p.id);
	const place = typeof v?.place === 'string' && (ids.includes(v.place) || (v.place === 'here' && has)) ? v.place : defaultPlace;
	return { place, lat: has ? lat : null, lon: has ? lon : null };
}

/** Shape check for the stored choice (backup / storage registry): cleaned or null */
export function checkPrefs(v) {
	if (!isObj(v)) return null;
	const out = {};
	if (typeof v.place === 'string' && (v.place === 'here' || ID.test(v.place))) out.place = v.place;
	if (validLat(v.lat) && validLon(v.lon)) {
		out.lat = round2(v.lat);
		out.lon = round2(v.lon);
	}
	return out;
}

/* A time stamp a Date can hold (beyond ±8.64e15 ms toISOString() and formatters throw) */
const stamp = v => (num(v) !== null && Math.abs(v) <= 8.64e15 ? v : null);
const DRIFT_MS = 5 * 60000;   // clock drift allowed for a stored "fetched at"

/**
 * Stored and fetched results pass through here alike:
 * { key, at, time, temp, icon, humidity, wind, hi, lo, station, hours: [{ t, temp, icon, pop }] (≤ 6) }.
 * Returns null without a key, a time stamp or a temperature, or when fetched in the
 * future (more than a few minutes ahead of `now`, default Date.now()).
 */
export function cleanData(v, now) {
	const clock = Number.isFinite(now) ? now : Date.now();
	if (!isObj(v) || typeof v.key !== 'string' || !v.key || stamp(v.at) === null || num(v.temp) === null) return null;
	/* A stamp from the future (clock ahead, edited storage) would count as fresh for good */
	if (v.at > clock + DRIFT_MS) return null;
	return {
		key: v.key.slice(0, 80),
		at: v.at,
		time: stamp(v.time) ?? v.at,
		temp: v.temp,
		icon: conditionOf(v.icon),
		humidity: num(v.humidity),
		wind: num(v.wind),
		hi: num(v.hi),
		lo: num(v.lo),
		station: typeof v.station === 'string' && v.station.trim() ? v.station.trim().slice(0, 60) : null,
		hours: (Array.isArray(v.hours) ? v.hours : [])
			.filter(x => stamp(x?.t) !== null && num(x?.temp) !== null)
			.slice(0, 6)
			.map(x => ({ t: x.t, temp: x.temp, icon: conditionOf(x.icon), pop: num(x.pop) }))
	};
}

/** Every second hour from the next one on (a provider's sorted hourly list) */
export const pickHours = (list, now) => list.filter(x => x.t > now).filter((_, i) => i % 2 === 0).slice(0, 6);

/** The hourly entry closest to now (stands in when a provider has no observation) */
export const nearest = (list, now) => list.reduce((best, x) => (!best || Math.abs(x.t - now) < Math.abs(best.t - now) ? x : best), null);

/** 'YYYY-MM-DD' of an instant in a time zone (null/invalid → the browser's) */
export function dayIn(ms, tz) {
	try {
		return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
	} catch {
		return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
	}
}

/** Highest and lowest temperature of today (in tz) from an hourly list */
export function dayRange(list, now, tz) {
	const today = dayIn(now, tz);
	const temps = list.filter(x => dayIn(x.t, tz) === today).map(x => x.temp);
	return temps.length ? { hi: Math.max(...temps), lo: Math.min(...temps) } : { hi: null, lo: null };
}

/* ---------- Units ---------- */

export const toFahrenheit = c => (c * 9) / 5 + 32;
export const toMph = kmh => kmh / 1.609344;

/** A temperature in the configured units (rounded for display; never '-0') */
export function temperature(c, units) {
	const v = Math.round(units === 'imperial' ? toFahrenheit(c) : c);
	return v === 0 ? 0 : v;
}

export const speed = (kmh, units) => Math.round(units === 'imperial' ? toMph(kmh) : kmh);

/** Intl unit identifiers for the configured units */
export const unitIds = units => (units === 'imperial'
	? { temp: 'fahrenheit', speed: 'mile-per-hour' }
	: { temp: 'celsius', speed: 'kilometer-per-hour' });
