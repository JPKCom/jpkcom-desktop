/* JPKCom Desktop — weather: menu bar temperature, details in the calendar, providers — © Jean Pierre Kolb — MIT License

   Optional module 'weather'. Off until the site offers it (config.services.weather)
   AND the user agrees (consent 'weather', a switch in Settings → Online services):
   before that, not a single request leaves the browser. Never in the way: without
   an answer there is simply no weather, every request gives up after a few seconds.

   - Menu bar: a status button (menubar.addStatus order 85, between language and
     clock as in the original, so both calendar openers sit side by side) with icon
     and temperature; it opens the calendar at the weather section.
   - Calendar section (order 10): current conditions, today's high/low, wind,
     humidity, every second hour of the next twelve, "as of", the provider's attribution.
   - Settings rows in 'online': the place (config.weather.places, "My location"
     when known) and "Use my location" (needs config.services.geolocation; the
     browser asks; only the position rounded to about 1 km is kept).

   Providers ({ id, name, hosts, coverage?, attribution(ctx), load(q, { getJson }) },
   contract in ./providers/open-meteo.js): 'open-meteo' (default, worldwide, no key),
   'brightsky' (Germany, DWD data); more through the service: weather.addProvider(def).
   config.weather: { provider, units: 'metric'|'imperial', defaultPlace, places: [{ id, name, lat, lon, tz }],
   freshMs (fetch again after), maxAgeMs (never show older data), everyMs (refresh interval) }.

   Storage: 'weather' (the chosen place, settings) and 'weather-data' (the last result, device-bound). */

import Desk from '../../core/api.js';
import openMeteo from './providers/open-meteo.js';
import brightsky from './providers/brightsky.js';
import { cleanConfig, cleanPrefs, checkPrefs, cleanData, glyphOf, round2, temperature, speed, unitIds } from './core.js';

const PREFS = 'weather';
const DATA = 'weather-data';
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const providers = new Map([[openMeteo.id, openMeteo], [brightsky.id, brightsky]]);

let cfg = cleanConfig(JSON.parse(JSON.stringify(Desk.config.weather ?? {})));
let providerId = cfg.provider;
let data = null;        // the last good result, also from storage
let state = 'idle';     // idle · loading · ok · error
let busy = false;
let again = false;      // asked for while busy: run once more afterwards
let locating = false;
let locateFailed = false;
let started = false;
let mb = null;

const consent = () => Desk.consent;
const offered = () => consent().enabled('weather');
const on = () => consent().granted('weather');
const geoOffered = () => consent().enabled('geolocation');
const provider = () => providers.get(providerId) ?? null;
const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || null;
const redrawSettings = () => Desk.settings?.redraw?.();

/* ---------- The chosen place ---------- */

/** { place, lat, lon } — 'here' only while the location consent stands */
function prefs() {
	const raw = Desk.store.getJson(PREFS, checkPrefs, {});
	const geo = consent().granted('geolocation');
	return cleanPrefs(geo ? raw : { ...raw, lat: null, lon: null }, cfg.places, cfg.defaultPlace);
}

function savePrefs(patch) {
	const next = { ...prefs(), ...patch };
	const out = { place: next.place };
	if (next.lat !== null && next.lon !== null) Object.assign(out, { lat: next.lat, lon: next.lon });
	Desk.store.setJson(PREFS, out);
}

function placeOf(p = prefs()) {
	if (p.place === 'here') return p.lat === null ? null : { id: 'here', name: null, lat: p.lat, lon: p.lon, tz: browserTz() };
	return cfg.places.find(x => x.id === p.place) ?? null;
}

const keyOf = (prov, place) => `${prov.id}:${place.lat},${place.lon}`;

/** The last result for the chosen place, unless it is too old to show */
function current() {
	const place = placeOf();
	const prov = provider();
	if (!place || !prov) return null;
	return data?.key === keyOf(prov, place) && Date.now() - data.at < cfg.maxAgeMs ? data : null;
}

function placeName(place) {
	if (!place) return '';
	return place.id === 'here' ? current()?.station || Desk.t('weather.here') : Desk.L(place.name);
}

/* ---------- Formatting ---------- */

const cond = v => Desk.t(`weather.cond-${v || 'none'}`);
const degText = c => `${Desk.i18n.fmtNumber(temperature(c, cfg.units))}°`;
const tempLabel = c => Desk.i18n.fmtNumber(temperature(c, cfg.units), { style: 'unit', unit: unitIds(cfg.units).temp });
const speedText = (kmh, display) => Desk.i18n.fmtNumber(speed(kmh, cfg.units), { style: 'unit', unit: unitIds(cfg.units).speed, unitDisplay: display });
const percent = v => Desk.i18n.fmtNumber(Math.round(v) / 100, { style: 'percent' });

/** One translated sentence with nodes in its {placeholders} (attribution with a link) */
function fill(key, nodes = {}) {
	const text = Desk.t(key);
	const out = [];
	let last = 0;
	for (const m of text.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
		out.push(text.slice(last, m.index), Object.hasOwn(nodes, m[1]) ? nodes[m[1]] : m[0]);
		last = m.index + m[0].length;
	}
	out.push(text.slice(last));
	return Desk.h('span', {}, out.filter(x => x !== ''));
}

function hourOpts(tz) {
	const opts = Desk.t('weather.hourFormat') === 'hour' ? { hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' };
	return tz ? { ...opts, timeZone: tz } : opts;
}

/* ---------- Fetching ---------- */

const readData = () => Desk.store.getJson(DATA, cleanData, null);

async function refresh(force = false) {
	if (!on()) return;
	const prov = provider();
	const place = placeOf();
	if (!prov || !place) return;
	if (busy) {
		again = again || !!force;
		return;
	}
	if (!force && current() && Date.now() - data.at < cfg.freshMs) return;
	if (navigator.onLine === false) {
		state = 'error';
		render();
		return;
	}
	busy = true;
	state = 'loading';
	render();
	try {
		const now = Date.now();
		/* Bound to the service: no consent, no request — whatever the provider does */
		const getJson = (url, opts = {}) => Desk.net.getJson(url, { timeout: 8000, ...opts, service: 'weather' });
		const raw = await prov.load({ lat: place.lat, lon: place.lon, tz: place.tz, now }, { getJson });
		const next = cleanData({ ...raw, key: keyOf(prov, place), at: Date.now() });
		if (!next) throw new Error('weather: no data');
		/* Switched off in the meantime: nothing is kept */
		if (on()) {
			data = next;
			Desk.store.setJson(DATA, data);
		}
		state = 'ok';
	} catch (err) {
		if (Desk.config.debug) console.warn('[weather]', err);
		state = 'error';
	} finally {
		busy = false;
		render();
		if (again) {
			again = false;
			refresh(true);
		}
	}
}

/* ---------- Menu bar ---------- */

function render() {
	const d = on() ? current() : null;
	if (mb) {
		if (d) {
			const place = placeName(placeOf());
			mb.replaceChildren(Desk.icon(glyphOf(d.icon)), Desk.h('span', { text: degText(d.temp) }));
			mb.setAttribute('aria-label', Desk.t('weather.mbLabel', { temp: tempLabel(d.temp), cond: cond(d.icon), place }));
			mb.title = Desk.t('weather.mbTitle', { cond: cond(d.icon), place });
		}
		/* A popup button only while a calendar opens from it; the calendar keeps
		   aria-expanded up to date while it is open */
		if (Desk.calendar) {
			mb.setAttribute('aria-haspopup', 'dialog');
			if (!mb.hasAttribute('aria-expanded')) mb.setAttribute('aria-expanded', 'false');
		} else {
			mb.removeAttribute('aria-haspopup');
			mb.removeAttribute('aria-expanded');
		}
		/* The button goes: a calendar it opened goes with it */
		if (!d && Desk.calendar?.isOpen?.() && Desk.calendar.opener?.() === mb) Desk.calendar.close();
		mb.hidden = !d;
	}
	if (Desk.calendar?.isOpen?.()) Desk.calendar.redraw();
}

function button() {
	mb = Desk.h('button', {
		type: 'button', class: 'mb-item mb-weather', id: 'mb-weather', hidden: true,
		onclick: () => {
			if (Desk.calendar) Desk.calendar.toggle(mb, { section: 'weather' });
			else refresh(true);
		}
	});
	Desk.services.when('menubar').then(bar => {
		bar.addStatus?.(mb, 85);
		render();
	});
	/* A calendar module that arrives later turns the button into a popup button */
	Desk.services.when('calendar').then(() => render());
}

/* ---------- Calendar: today's weather under the month ---------- */

function section() {
	if (!on()) return null;
	const prov = provider();
	const place = placeOf();
	if (!prov || !place) return null;
	const { h, t, icon, i18n } = Desk;
	const d = current();
	const hidden = text => h('span', { class: 'visually-hidden', text });
	const head = h('div', { class: 'cal-head' },
		h('h3', { class: 'cal-sub', id: 'cal-wx-title', text: t('weather.sectionTitle', { place: placeName(place) }) }),
		h('button', {
			type: 'button', class: 'cal-btn', 'data-key': 'wx-refresh', disabled: busy,
			'aria-label': t('weather.refresh'), title: t('weather.refresh'), onclick: () => refresh(true)
		}, icon('ti-rotate-clockwise')));
	const box = h('section', { class: 'cal-weather', 'aria-labelledby': 'cal-wx-title', 'aria-busy': busy ? 'true' : null }, head);

	if (!d) {
		box.append(h('p', { class: 'cal-wx-note', text: state === 'error' ? t('weather.error') : t('weather.loading') }));
		if (state === 'error') box.append(h('button', { type: 'button', class: 'btn', 'data-key': 'wx-retry', text: t('weather.retry'), onclick: () => refresh(true) }));
		return box;
	}

	const facts = [];
	if (d.hi !== null && d.lo !== null) {
		facts.push(
			h('span', {}, h('span', { 'aria-hidden': 'true', text: `↑ ${degText(d.hi)}` }), hidden(t('weather.high', { value: tempLabel(d.hi) }))),
			h('span', {}, h('span', { 'aria-hidden': 'true', text: `↓ ${degText(d.lo)}` }), hidden(t('weather.low', { value: tempLabel(d.lo) }))));
	}
	if (d.wind !== null) {
		facts.push(h('span', {},
			h('span', { 'aria-hidden': 'true', text: t('weather.wind', { value: speedText(d.wind, 'short') }) }),
			hidden(t('weather.wind', { value: speedText(d.wind, 'long') }))));
	}
	if (d.humidity !== null) facts.push(h('span', { text: t('weather.humidity', { value: percent(d.humidity) }) }));

	const timeOpts = { hour: '2-digit', minute: '2-digit', ...(place.tz ? { timeZone: place.tz } : {}) };
	const hours = d.hours.length ? h('ol', { class: 'cal-wx-hours', 'aria-label': t('weather.hours') }, d.hours.map(x => h('li', {},
		h('time', { datetime: new Date(x.t).toISOString(), text: i18n.fmtTime(x.t, hourOpts(place.tz)) }),
		icon(glyphOf(x.icon)),
		hidden(cond(x.icon)),
		h('span', { class: 'cal-wx-deg', 'aria-hidden': 'true', text: degText(x.temp) }),
		hidden(tempLabel(x.temp)),
		x.pop !== null && x.pop >= 30
			? [hidden(t('weather.rainChance', { value: percent(x.pop) })), h('span', { class: 'cal-wx-pop', 'aria-hidden': 'true', text: percent(x.pop) })]
			: null))) : null;

	const foot = [];
	if (state === 'error') foot.push(t('weather.failed'));
	foot.push(t('weather.asOf', { time: i18n.fmtTime(d.time, timeOpts) }));
	let attribution = null;
	try {
		attribution = prov.attribution?.({ h, t, fill }) ?? null;
	} catch (err) {
		console.warn(`[weather] attribution of '${prov.id}' failed:`, err);
	}
	if (attribution) foot.push(attribution);

	box.append(
		h('div', { class: 'cal-wx-now' },
			icon(glyphOf(d.icon), 'i cal-wx-icon'),
			h('span', { class: 'cal-wx-temp', 'aria-hidden': 'true', text: degText(d.temp) }),
			hidden(tempLabel(d.temp)),
			h('span', { class: 'cal-wx-cond' }, h('span', { text: cond(d.icon) }), facts.length ? h('small', {}, facts) : null)),
		hours,
		h('p', { class: 'cal-wx-foot' }, foot.flatMap((x, i) => (i ? [' · ', x] : [x]))));
	return box;
}

/* ---------- Settings → Online services ---------- */

function setPlace(id) {
	const p = prefs();
	if (id === 'here' ? p.lat === null : !cfg.places.some(x => x.id === id)) return;
	savePrefs({ place: id });
	render();
	refresh(true);
	redrawSettings();
}

/* The browser asks first; only the rounded position is kept */
function locate() {
	if (locating) return;
	if (!geoOffered() || !navigator.geolocation) {
		locateFailed = true;
		redrawSettings();
		return;
	}
	const had = consent().granted('geolocation');
	/* Pressing the button is the consent; the browser's own question follows */
	consent().set('geolocation', true);
	locating = true;
	locateFailed = false;
	redrawSettings();
	navigator.geolocation.getCurrentPosition(pos => {
		locating = false;
		savePrefs({ place: 'here', lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude) });
		render();
		refresh(true);
		redrawSettings();
	}, () => {
		locating = false;
		locateFailed = true;
		if (!had) consent().set('geolocation', false);
		redrawSettings();
	}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600000 });
}

/* Rows through the settings' helpers (ctx), else the same markup by hand */
function placeRow(ctx) {
	if (!offered()) return null;
	const { h, t } = Desk;
	const p = prefs();
	const places = cfg.places.map(x => [x.id, Desk.L(x.name)]).sort((a, b) => Desk.i18n.compare(a[1], b[1]));
	if (p.lat !== null) places.unshift(['here', t('weather.here')]);
	if (!places.length) return null;
	const hint = Desk.L(provider()?.coverage) || null;
	if (typeof ctx?.select === 'function') {
		return ctx.select({ key: 'wx-place', label: t('weather.place'), hint, options: places, value: p.place, onChange: setPlace });
	}
	const id = 'wx-place-select';
	return h('div', { class: 'set-row' },
		h('label', { class: 'set-label', for: id }, t('weather.place'), hint ? h('small', { text: hint }) : null),
		h('select', { class: 'set-select', id, 'data-key': 'wx-place', onchange: e => setPlace(e.target.value) },
			places.map(([v, name]) => h('option', { value: v, selected: v === p.place, text: name }))));
}

function locateRow(ctx) {
	if (!offered() || !geoOffered()) return null;
	const { h, t } = Desk;
	const hint = locating ? t('weather.locating') : locateFailed ? t('weather.locateFail') : t('weather.locateHint');
	const btn = typeof ctx?.button === 'function'
		? ctx.button({ key: 'wx-locate', label: t('weather.locateBtn'), run: locate, disabled: locating })
		: h('button', { type: 'button', class: 'btn', 'data-key': 'wx-locate', disabled: locating, text: t('weather.locateBtn'), onclick: locate });
	if (typeof ctx?.row === 'function') return ctx.row({ label: t('weather.locate'), hint, control: btn });
	return h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, t('weather.locate'), h('small', { text: hint })), btn);
}

/* ---------- Providers ---------- */

function registerConsent() {
	consent().unregister('weather');
	consent().register({ id: 'weather', hosts: provider()?.hosts ?? [], label: '@weather.service', hint: '@weather.serviceHint' }, 'weather');
}

function addProvider(def) {
	const ok = def && typeof def === 'object' && typeof def.id === 'string' && PROVIDER_ID.test(def.id)
		&& typeof def.load === 'function' && Array.isArray(def.hosts) && def.hosts.every(x => typeof x === 'string' && HOST.test(x));
	if (!ok) {
		console.warn(`[weather] addProvider: needs { id, hosts: ['host'], load() } — ${JSON.stringify(def?.id)} skipped`);
		return false;
	}
	if (providers.has(def.id)) {
		console.warn(`[weather] provider '${def.id}' exists already — skipped`);
		return false;
	}
	providers.set(def.id, Object.freeze({ ...def, hosts: [...def.hosts] }));
	if (def.id === providerId) {
		registerConsent();
		render();
		if (started) refresh();
	}
	return true;
}

/* ---------- Start ---------- */

function start() {
	if (started) return;
	started = true;
	render();
	refresh();
	setInterval(() => {
		render();
		if (!document.hidden) refresh();
	}, cfg.everyMs);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
	addEventListener('online', () => refresh());
}

/* ---------- Descriptor ---------- */

export default {
	id: 'weather',
	kind: 'module',
	i18n: ['weather'],
	styles: ['weather.css'],

	/* The hosts of the configured provider (a provider added later re-registers them) */
	consent: [
		{ id: 'weather', hosts: providers.get(Desk.config.weather?.provider)?.hosts ?? [], label: '@weather.service', hint: '@weather.serviceHint' },
		{ id: 'geolocation', hosts: [], label: '@weather.geoService', hint: '@weather.geoServiceHint' }
	],

	storage: {
		weather: { type: 'json', backup: true, reset: 'settings', label: '@weather.prefsLabel', validate: checkPrefs },
		'weather-data': { type: 'json', backup: false, reset: 'session', label: '@weather.dataLabel', validate: cleanData }
	},

	configKey: 'weather',
	validateConfig: (section, warn) => cleanConfig(section, warn),

	calendar: [{ id: 'weather', order: 10, render: section }],
	settings: [
		{ id: 'weather-place', section: 'online', order: 30, render: placeRow },
		{ id: 'weather-locate', section: 'online', order: 31, render: locateRow }
	],

	setup(desk) {
		cfg = desk.modules.config('weather') ?? cfg;
		providerId = cfg.provider;
		data = readData();
		const reg = desk.consent.get('weather');
		if (provider() && (!reg || reg.hosts.join() !== provider().hosts.join())) registerConsent();
		desk.provide('weather', Object.freeze({
			addProvider,
			providers: () => [...providers.keys()],
			provider: () => provider()?.id ?? null,
			refresh: force => refresh(force),
			current: () => (on() ? current() : null),
			place: () => prefs().place,
			setPlace,
			locate
		}));
		button();

		desk.once('modules:ready', () => {
			if (provider()) return;
			console.warn(`[weather] provider '${providerId}' is not available — using 'open-meteo'`);
			providerId = 'open-meteo';
			registerConsent();
		});
		desk.on('desk:ready', () => setTimeout(start, 2400));

		desk.on('consent:change', ({ id } = {}) => {
			if (id === 'weather' || id === null) {
				if (on()) {
					if (started) refresh();
				} else {
					data = null;
					desk.store.remove(DATA);
					state = 'idle';
				}
			}
			/* Location withdrawn: the coordinates go, the default place comes back */
			if ((id === 'geolocation' || id === null) && !desk.consent.granted('geolocation')) {
				const raw = desk.store.getJson(PREFS, checkPrefs, null);
				if (raw && (raw.lat !== undefined || raw.place === 'here')) {
					desk.store.setJson(PREFS, { place: raw.place === 'here' ? cfg.defaultPlace : raw.place });
				}
			}
			render();
			redrawSettings();
		});
		const reread = () => {
			data = readData();
			state = 'idle';
			render();
			if (started) refresh();
		};
		desk.on('storage:reset', reread);
		desk.on('storage:restore', reread);
		desk.on('store:change', ({ name, external } = {}) => {
			if (external && (name === PREFS || name === DATA)) reread();
		});
		desk.on('lang:change', () => render());
		desk.on('service:provide', ({ name } = {}) => { if (name === 'calendar') render(); });
	}
};
