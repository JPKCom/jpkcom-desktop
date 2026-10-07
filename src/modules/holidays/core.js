/* JPKCom Desktop — public holidays: Easter date, region rules, year lists (pure) — © Jean Pierre Kolb — MIT License

   Holidays are computed, never fetched. A region is plain data:

     {
       id: 'de-by',                                   // [a-z][a-z0-9-]*
       name: '@holidays.region-de-by',                // text: string, '@ns.key' or { lang: text }
       fixed:   [[month 1–12, day, key, opts?]],      // a date every year
       easter:  [[days after Easter Sunday, key, opts?]],
       weekday: [[month 1–12, weekday 1–7 (1 = Monday), nth, key, opts?]]
                                                      // nth 1…5: the nth weekday on or after opts.from (default 1);
                                                      // nth -1…-5: counted back from opts.to (default: end of month)
     }
     opts: { since: year, until: year, note: key, name: text }

   key names the holiday: its text is the i18n key 'holidays.<key>' unless opts.name gives one;
   note: a short remark ('note-<note>' in the holidays namespace), e.g. "Augsburg only".
   Nothing in here touches the DOM or the desktop — tests import it directly. */

import { isObj } from '../../core/is.js';

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const KEY = /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/;

const isText = v => (typeof v === 'string' && v.length > 0)
	|| (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** Easter Sunday of a year in the Gregorian calendar (Meeus/Jones/Butcher), as a local date. */
export function easter(y) {
	const a = y % 19;
	const b = Math.floor(y / 100);
	const c = y % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const k = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const j = c % 4;
	const l = (32 + 2 * e + 2 * i - k - j) % 7;
	const m = Math.floor((a + 11 * k + 22 * l) / 451);
	const n = k + l - 7 * m + 114;
	return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}

/** A day as a map key (local calendar day) */
export const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** ISO weekday of a date: 1 = Monday … 7 = Sunday */
export const isoDay = d => d.getDay() || 7;

/**
 * The nth weekday of a month: nth > 0 counts from day `from` on, nth < 0 back from day `to`.
 * Returns null when the month has no such day (a fifth Monday, …).
 */
export function nthWeekday(y, month0, weekday, nth, { from = 1, to = null } = {}) {
	const last = new Date(y, month0 + 1, 0).getDate();
	if (nth > 0) {
		const start = new Date(y, month0, from);
		const shift = (weekday - isoDay(start) + 7) % 7;
		const day = from + shift + (nth - 1) * 7;
		return day <= last ? new Date(y, month0, day) : null;
	}
	const endDay = Math.min(to ?? last, last);
	const end = new Date(y, month0, endDay);
	const shift = (isoDay(end) - weekday + 7) % 7;
	const day = endDay - shift - (-nth - 1) * 7;
	return day >= 1 ? new Date(y, month0, day) : null;
}

function cleanOpts(o, where, warn) {
	if (o === undefined || o === null) return {};
	if (!isObj(o)) {
		warn(`${where}: options must be an object — ignored`);
		return {};
	}
	const out = {};
	if (o.since !== undefined) {
		if (intIn(o.since, 1583, 9999)) out.since = o.since;
		else warn(`${where}: invalid since ${JSON.stringify(o.since)} — ignored`);
	}
	if (o.until !== undefined) {
		if (intIn(o.until, 1583, 9999)) out.until = o.until;
		else warn(`${where}: invalid until ${JSON.stringify(o.until)} — ignored`);
	}
	if (o.note !== undefined) {
		if (typeof o.note === 'string' && KEY.test(o.note)) out.note = o.note;
		else warn(`${where}: invalid note ${JSON.stringify(o.note)} — ignored`);
	}
	if (o.name !== undefined) {
		if (isText(o.name)) out.name = o.name;
		else warn(`${where}: invalid name — ignored`);
	}
	for (const k of ['from', 'to']) {
		if (o[k] !== undefined) {
			if (intIn(o[k], 1, 31)) out[k] = o[k];
			else warn(`${where}: invalid ${k} ${JSON.stringify(o[k])} — ignored`);
		}
	}
	return out;
}

/**
 * Validates a region definition. Invalid rules are reported through warn and
 * skipped; returns the cleaned, frozen region or null when the id is unusable.
 */
export function cleanRegion(def, warn = () => {}) {
	if (!isObj(def) || typeof def.id !== 'string' || !ID.test(def.id)) {
		warn(`invalid region ${JSON.stringify(def?.id ?? def)} — skipped`);
		return null;
	}
	const where = `region '${def.id}'`;
	const list = (k, check) => {
		if (def[k] === undefined) return [];
		if (!Array.isArray(def[k])) {
			warn(`${where}: ${k} must be an array — ignored`);
			return [];
		}
		const out = [];
		def[k].forEach((rule, i) => {
			const r = Array.isArray(rule) ? check(rule, `${where} ${k}[${i}]`) : null;
			if (r) out.push(Object.freeze(r));
			else if (!Array.isArray(rule)) warn(`${where} ${k}[${i}]: must be an array — skipped`);
		});
		return out;
	};
	const keyOk = (key, at) => {
		if (typeof key === 'string' && KEY.test(key)) return true;
		warn(`${at}: invalid key ${JSON.stringify(key)} — skipped`);
		return false;
	};
	const fixed = list('fixed', ([month, day, key, opts], at) => {
		if (!intIn(month, 1, 12) || !intIn(day, 1, new Date(2024, month, 0).getDate())) {
			warn(`${at}: invalid date ${JSON.stringify([month, day])} — skipped`);
			return null;
		}
		return keyOk(key, at) ? { month, day, key, ...cleanOpts(opts, at, warn) } : null;
	});
	const easterRules = list('easter', ([offset, key, opts], at) => {
		if (!intIn(offset, -200, 200)) {
			warn(`${at}: invalid offset ${JSON.stringify(offset)} — skipped`);
			return null;
		}
		return keyOk(key, at) ? { offset, key, ...cleanOpts(opts, at, warn) } : null;
	});
	const weekday = list('weekday', ([month, wd, nth, key, opts], at) => {
		if (!intIn(month, 1, 12) || !intIn(wd, 1, 7) || !Number.isInteger(nth) || nth === 0 || Math.abs(nth) > 5) {
			warn(`${at}: invalid rule ${JSON.stringify([month, wd, nth])} — skipped`);
			return null;
		}
		return keyOk(key, at) ? { month, weekday: wd, nth, key, ...cleanOpts(opts, at, warn) } : null;
	});
	return Object.freeze({
		id: def.id,
		name: isText(def.name) ? def.name : def.id,
		fixed: Object.freeze(fixed),
		easter: Object.freeze(easterRules),
		weekday: Object.freeze(weekday)
	});
}

const inYear = (rule, y) => (rule.since === undefined || y >= rule.since) && (rule.until === undefined || y <= rule.until);

const entry = (date, rule) => ({ date, key: rule.key, note: rule.note ?? null, name: rule.name ?? null });

/**
 * Every holiday of a region in a year, sorted by date (stable: fixed, then
 * Easter-based, then weekday rules on the same day). Each: { date, key, note, name }.
 */
export function holidaysOf(region, y) {
	if (!region || !Number.isInteger(y)) return [];
	const out = [];
	for (const r of region.fixed) {
		if (!inYear(r, y)) continue;
		const d = new Date(y, r.month - 1, r.day);
		/* 29 February only in leap years */
		if (d.getMonth() === r.month - 1) out.push(entry(d, r));
	}
	if (region.easter.length) {
		const e = easter(y);
		for (const r of region.easter) {
			if (inYear(r, y)) out.push(entry(new Date(y, e.getMonth(), e.getDate() + r.offset), r));
		}
	}
	for (const r of region.weekday) {
		if (!inYear(r, y)) continue;
		const d = nthWeekday(y, r.month - 1, r.weekday, r.nth, { from: r.from ?? 1, to: r.to ?? null });
		if (d) out.push(entry(d, r));
	}
	return out
		.map((x, i) => [x, i])
		.sort((a, b) => a[0].date - b[0].date || a[1] - b[1])
		.map(([x]) => x);
}

/** Groups a year list by day: Map dayKey → [entries] (two holidays can share a day). */
export function byDay(list) {
	const map = new Map();
	for (const x of list) {
		const k = dayKey(x.date);
		if (!map.has(k)) map.set(k, []);
		map.get(k).push(x);
	}
	return map;
}
