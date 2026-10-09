/* JPKCom Desktop — public holidays: regions, year lists, the calendar's holiday list — © Jean Pierre Kolb — MIT License

   Optional module 'holidays'. Computes the public holidays of one region
   (config.holidays.region, null = none) — fixed dates, dates that follow
   Easter (Meeus/Jones/Butcher) and weekday rules; no network.

   Service 'holidays':
     year(y)        → [{ date, name, title, note, key }]   name = title with its note ("… (Augsburg only)")
     on(date)       → the same for one day ([] when none; two holidays may share a day)
     addRegion(def) → boolean     a region from a site module (format: ./core.js)
     region()       → { id, name } | null      regions() → ids     heading() → list title

   Region files shipped in ./regions/ (loaded on demand): REGION_FILES below — and each of them in the
   descriptor's precache list: the import is computed, so the offline copy of the service worker knows
   them only from there (tests/p06-holidays.test.mjs keeps both lists and the folder equal).
   A site region: { id: 'mine', src: 'site/modules/mine/index.js' } in config.modules whose
   setup() calls desk.holidays.addRegion({ id: 'xx-yy', … }) — with config.holidays.region = 'xx-yy'
   (list it after 'holidays' or give it requires: ['holidays']).

   Contributes the holiday list of the month shown to the calendar ('calendar' extension point);
   the calendar marks the days itself through on(). Emits 'holidays:change' { region } when the
   active region becomes available. */

import Desk from '../../core/api.js';
import { cleanRegion, holidaysOf, byDay, dayKey } from './core.js';

/** Region files in ./regions/<id>.js (also in precache: [...] below) */
const REGION_FILES = ['de-by'];
const ID = /^[a-z][a-z0-9-]{0,31}$/;

const regions = new Map();
const years = new Map();   // year → { list, days }
let regionId = null;

const active = () => (regionId ? regions.get(regionId) ?? null : null);

function yearData(y) {
	if (!years.has(y)) {
		const list = holidaysOf(active(), y);
		years.set(y, { list, days: byDay(list) });
	}
	return years.get(y);
}

/* ---------- Texts ---------- */

function nameOf(x) {
	if (x.name) return Desk.L(x.name);
	const key = `holidays.${x.key}`;
	return Desk.i18n.has(key) ? Desk.t(key) : x.key;
}

function noteOf(x) {
	if (!x.note) return null;
	const key = `holidays.note-${x.note}`;
	return Desk.i18n.has(key) ? Desk.t(key) : x.note;
}

function labelOf(x) {
	const note = noteOf(x);
	return note ? Desk.t('holidays.withNote', { name: nameOf(x), note }) : nameOf(x);
}

/* What callers get: fresh objects, so nobody changes the cache */
const view = x => ({ date: new Date(x.date), name: labelOf(x), title: nameOf(x), note: noteOf(x), key: x.key });

const validYear = y => Number.isInteger(y) && y >= 1583 && y <= 9999;

function heading() {
	const r = active();
	return r ? Desk.t('holidays.title', { region: Desk.L(r.name) }) : Desk.t('holidays.titlePlain');
}

/* ---------- Regions ---------- */

function addRegion(def) {
	const r = cleanRegion(def, msg => console.warn(`[holidays] ${msg}`));
	if (!r) return false;
	if (regions.has(r.id)) {
		console.warn(`[holidays] region '${r.id}' is already defined — the second definition is ignored`);
		return false;
	}
	regions.set(r.id, r);
	if (r.id === regionId) {
		years.clear();
		Desk.emit('holidays:change', { region: r.id });
	}
	return true;
}

async function loadRegionFile(id) {
	if (!REGION_FILES.includes(id)) return;
	try {
		const mod = await import(`./regions/${id}.js`);
		if (!regions.has(id)) addRegion(mod.default);
	} catch (err) {
		console.warn(`[holidays] region file '${id}' could not be loaded: ${err?.message ?? err}`);
	}
}

/* ---------- Calendar: the holidays of the month shown ---------- */

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function calendarSection({ view: v, today }) {
	if (!active() || !validYear(v.y)) return null;
	const list = yearData(v.y).list.filter(x => x.date.getMonth() === v.m);
	if (!list.length) return null;
	const { h } = Desk;
	return h('section', { class: 'cal-hols', 'aria-labelledby': 'cal-hols-title' },
		h('h3', { class: 'cal-sub', id: 'cal-hols-title', text: heading() }),
		h('ul', {}, list.map(x => {
			const note = noteOf(x);
			return h('li', { class: sameDay(x.date, today) ? 'is-today' : null },
				h('time', { datetime: ymd(x.date), text: Desk.i18n.fmtDate(x.date, { day: 'numeric', month: 'short' }) }),
				h('span', { class: 'cal-hols-name' }, nameOf(x), note ? h('small', { text: note }) : null));
		})));
}

/* ---------- Descriptor ---------- */

export default {
	id: 'holidays',
	kind: 'module',
	i18n: ['holidays'],
	styles: ['holidays.css'],
	/* every region file: loadRegionFile() imports ./regions/<id>.js with a computed name (§8 precache) */
	precache: ['regions/de-by.js'],

	configKey: 'holidays',
	validateConfig(section, warn) {
		const out = section && typeof section === 'object' ? section : {};
		if (out.region !== null && out.region !== undefined && !(typeof out.region === 'string' && ID.test(out.region))) {
			warn(`region must be null or a region id — ${JSON.stringify(out.region)} ignored`);
			out.region = null;
		}
		out.region ??= null;
		return out;
	},

	calendar: [{ id: 'holidays', order: 0, render: calendarSection }],

	async setup(desk) {
		regionId = desk.modules.config('holidays')?.region ?? null;
		desk.provide('holidays', Object.freeze({
			year: y => (validYear(y) ? yearData(y).list.map(view) : []),
			on: d => (d instanceof Date && !Number.isNaN(d.getTime()) && validYear(d.getFullYear())
				? (yearData(d.getFullYear()).days.get(dayKey(d)) ?? []).map(view) : []),
			addRegion,
			region: () => {
				const r = active();
				return r ? { id: r.id, name: desk.L(r.name) } : null;
			},
			regions: () => [...regions.keys()],
			heading,
			label: labelOf
		}));
		if (!regionId) return;
		await loadRegionFile(regionId);
		if (!active()) {
			/* A site module may still add it; complain only when nobody did */
			desk.once('modules:ready', () => {
				if (!active()) console.warn(`[holidays] config.holidays.region '${regionId}' is not defined — no holidays are shown`);
			});
		}
	}
};
