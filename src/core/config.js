/* JPKCom Desktop — configuration: defaults, deep merge, validation — © Jean Pierre Kolb — MIT License

   site/config.js sets window.DESKTOP_CONFIG (a classic script, so theme.js can
   read it before the first paint). Every key there is optional: this module
   holds the defaults, merges the site values over them and validates the
   result. Invalid values are reported with console.warn and replaced by the
   default — a typo in the config never takes the desktop down.

   Merge rules: plain objects merge key by key, arrays and other values replace;
   language maps such as site.description replace as a whole.
   Inside theme.accents, theme.tints and services a value of null removes a default.

   KEEP IN SYNC: the accent and tint values below mirror src/css/tokens.css
   (tests/config.test.mjs checks that they match).

   Modules validate their own section in their setup() (or through the
   descriptor's configKey + validateConfig, see docs/ARCHITECTURE.md §6);
   validateConfig() below covers what the core itself reads. */

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export const DEFAULTS = {
	/* Prefix of every localStorage key, IndexedDB name, Cache name and DOM event */
	namespace: 'jpkdesk',
	/* Extra console output (missing translations, skipped manifest entries in detail) */
	debug: false,

	brand: {
		name: 'JPKCom Desktop',
		shortName: 'JPK Desktop',
		menuLabel: 'JPKCom',
		glyph: 'jpk',
		logo: 'jpkcom',
		asciiLogo: null,
		host: null,
		themeColor: '#1c2935'
	},

	author: {
		name: 'Jean Pierre Kolb',
		brand: 'JPKCom',
		url: 'https://www.jpkc.com/',
		links: [
			{ id: 'github', name: 'GitHub', icon: 'ti-brand-github', tint: 'black', url: 'https://github.com/JPKCom', dock: true,
				label: { de: 'JPKCom auf GitHub', en: 'JPKCom on GitHub' } },
			{ id: 'mastodon', name: 'Mastodon', icon: 'ti-brand-mastodon', tint: 'indigo', url: 'https://mastodon.social/@JPKCom', dock: true,
				label: { de: 'JPKCom auf Mastodon', en: 'JPKCom on Mastodon' } }
		]
	},
	credit: true,

	languages: ['de', 'en'],
	defaultLang: 'en',

	site: {
		data: 'site/apps.js',
		origin: null,
		hosts: [],
		home: null,
		legal: [],
		description: {
			en: 'A desktop-style web interface — windows, dock and apps in the browser.',
			de: 'Eine Weboberfläche im Stil eines Desktops — Fenster, Dock und Apps im Browser.'
		},
		routes: [],
		defaultPageApp: 'about'
	},

	about: {
		rows: null,
		moreInfo: null,
		copyright: { holder: 'Jean Pierre Kolb', since: 2026 }
	},

	theme: {
		default: 'dark',
		accent: 'blue',
		allowCustomAccent: true,
		accents: {
			blue: '#3571c0',
			violet: '#7853d8',
			pink: '#c5306f',
			orange: '#b35412',
			green: '#23813f',
			teal: '#0f7d78',
			graphite: '#626e79'
		},
		tints: {
			slate: ['#8497a9', '#3c4955'],
			blue: ['#56adff', '#1c62d6'],
			orange: ['#ffb547', '#ef6420'],
			teal: ['#45d8c4', '#0e8783'],
			pink: ['#ff78aa', '#d0266a'],
			violet: ['#a476ff', '#5a2dd4'],
			black: ['#454552', '#0a0a10'],
			indigo: ['#7a7bff', '#563acc'],
			graphite: ['#a2acb6', '#58626c'],
			green: ['#52d879', '#1b9245']
		},
		windowControls: { side: 'left', style: 'classic' }
	},

	wallpaper: {
		default: { type: 'gradient', from: '#3c4955', to: '#0c1925', dir: 'glow' },
		motifs: ['author-monogram', 'author-emblem', 'author-blueprint', 'waves', 'dunes', 'aurora', 'orbit', 'horizon', 'graphite'],
		colors: [
			{ id: 'slate', color: '#3c4955', name: { de: 'Schiefer', en: 'Slate' } },
			{ id: 'midnight', color: '#0f1c29', name: { de: 'Mitternacht', en: 'Midnight' } },
			{ id: 'graphite', color: '#2a2d33', name: { de: 'Graphit', en: 'Graphite' } },
			{ id: 'petrol', color: '#0f4c52', name: { de: 'Petrol', en: 'Petrol' } },
			{ id: 'fir', color: '#1d3b2e', name: { de: 'Tanne', en: 'Fir' } },
			{ id: 'plum', color: '#3a2748', name: { de: 'Pflaume', en: 'Plum' } },
			{ id: 'bordeaux', color: '#4a1f2a', name: { de: 'Bordeaux', en: 'Bordeaux' } },
			{ id: 'sand', color: '#8c7a62', name: { de: 'Sand', en: 'Sand' } }
		],
		gradients: [
			{ id: 'jpkcom', from: '#3c4955', to: '#0c1925', dir: 'glow', name: 'JPKCom' },
			{ id: 'slate', from: '#596c7e', to: '#0c1925', dir: 'diag', name: { de: 'Schiefer', en: 'Slate' } },
			{ id: 'ocean', from: '#2b6cb0', to: '#0b1a33', dir: 'diag', name: { de: 'Ozean', en: 'Ocean' } },
			{ id: 'sunset', from: '#f28c6b', to: '#4b2c7a', dir: 'down', name: { de: 'Abendrot', en: 'Sunset' } },
			{ id: 'lagoon', from: '#1fa2a6', to: '#1b2447', dir: 'diag', name: { de: 'Lagune', en: 'Lagoon' } },
			{ id: 'lavender', from: '#8e7ad6', to: '#221a3d', dir: 'radial', name: { de: 'Lavendel', en: 'Lavender' } },
			{ id: 'forest', from: '#4f8a5b', to: '#0f2417', dir: 'down', name: { de: 'Wald', en: 'Forest' } }
		],
		images: [],
		reducedEffects: 'auto'
	},

	ui: {
		animMs: 240,
		compactQuery: '(max-width: 760px), (max-height: 520px) and (pointer: coarse)'
	},

	wm: {
		gap: 6,
		minSize: [280, 180],
		defaultSize: [1040, 720],
		cascade: 26,
		snap: true,
		snapEdge: [8, 18],
		tileMenu: { delay: 450, hideDelay: 250 },
		doubleTapMs: 350,
		iframe: { allow: 'fullscreen; clipboard-write', sandbox: null }
	},
	overview: { labelHeight: 30, padding: [12, 40] },
	session: { restore: true, debounceMs: 400, maxWindows: 20 },
	dock: { size: 'medium', magnify: false, pins: null, max: 60 },
	desktop: { icons: true },
	boot: { enabled: true, ms: 1100 },
	power: { shutdownUrl: null },

	/* Optional modules (src/modules/<id>/index.js) and apps (src/apps/<id>/index.js), in load order */
	modules: ['reader', 'viewer', 'catalog', 'search', 'calendar', 'notify'],
	apps: ['editor', 'notes', 'todo', 'calc', 'terminal', 'media', 'fortune'],

	/* Online services the site offers at all. Each one still asks the user before its first request. */
	services: { weather: false, geolocation: false, fortune: false, dns: false },

	reader: {
		/* match: a path prefix relative to the installation root, or a regular expression starting with '^' */
		rules: [{ match: 'site/content/', content: 'main article, article, main', title: 'h1', lead: '.lead' }],
		titleSeparator: '\\s[|—–]\\s',
		cacheSize: 24
	},
	search: { pagefind: null, maxPerGroup: 6, shortcut: 'Mod+K' },
	notify: {
		feeds: { de: 'site/data/feed.de.json', en: 'site/data/feed.en.json' },
		app: 'about',
		hideMs: 9000,
		maxBanners: 3,
		pathPrefix: null
	},
	holidays: { region: null },
	calendar: { firstDay: 'auto', weekNumbers: true },
	weather: {
		provider: 'open-meteo',
		units: 'metric',
		defaultPlace: 'berlin',
		places: [
			{ id: 'berlin', name: 'Berlin', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' },
			{ id: 'london', name: { de: 'London', en: 'London' }, lat: 51.507, lon: -0.128, tz: 'Europe/London' },
			{ id: 'new-york', name: 'New York', lat: 40.713, lon: -74.006, tz: 'America/New_York' },
			{ id: 'tokyo', name: { de: 'Tokio', en: 'Tokyo' }, lat: 35.676, lon: 139.65, tz: 'Asia/Tokyo' },
			{ id: 'sydney', name: 'Sydney', lat: -33.869, lon: 151.209, tz: 'Australia/Sydney' }
		],
		freshMs: 900000,
		maxAgeMs: 10800000,
		everyMs: 1800000
	},
	fortune: { remote: null, dir: 'site/data/fortunes/', langs: ['de', 'en'], block: [] },
	media: { maxItems: 200, seekStep: 5 },
	editor: { maxTabs: 20, maxFileBytes: 5242880, wrap: false, invisibles: true },
	calc: { historySize: 50 },
	/* doh: null | { url: 'https://…/resolve' (JSON API, Accept: application/dns-json), name: 'dns.google' } */
	terminal: { user: 'guest', doh: null, eggs: true, historySize: 100, manUrl: null },
	trash: { days: 30, max: 200 },
	backup: { format: 'jpkcom-desktop-backup', filePrefix: 'jpkcom-desktop', maxBytes: 5242880 },
	vault: { salt: '', iterations: 600000, dir: 'site/vault/', collection: 'bookmarks', maxBytes: 1048576 },
	pwa: { enabled: true },
	offline: { maxPages: 80, timeoutMs: 4000, fastStart: true }
};

/* ---------- Pure helpers (exported for tests) ---------- */

export const isPlainObject = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/* Language maps ({ de: …, en: … }) replace as a whole: a site that writes only
   { en } must not keep the default German text next to its own English one */
const REPLACE = new Set(['site.description', 'site.home', 'notify.feeds', 'about.moreInfo', 'about.rows']);

/** Deep merge: plain objects recurse, everything else (arrays, null, primitives) replaces. */
export function deepMerge(base, over, path = '') {
	if (!isPlainObject(over)) return over === undefined ? clone(base) : clone(over);
	const out = isPlainObject(base) ? clone(base) : {};
	for (const [k, v] of Object.entries(over)) {
		if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
		const p = path ? `${path}.${k}` : k;
		out[k] = isPlainObject(v) && isPlainObject(out[k]) && !REPLACE.has(p) ? deepMerge(out[k], v, p) : clone(v);
	}
	return out;
}

function clone(v) {
	if (Array.isArray(v)) return v.map(clone);
	if (isPlainObject(v)) {
		const out = {};
		for (const [k, x] of Object.entries(v)) if (k !== '__proto__') out[k] = clone(x);
		return out;
	}
	return v;
}

export function deepFreeze(v) {
	if (v && typeof v === 'object' && !Object.isFrozen(v)) {
		Object.freeze(v);
		for (const x of Object.values(v)) deepFreeze(x);
	}
	return v;
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function set(obj, path, value) {
	const keys = path.split('.');
	const last = keys.pop();
	const target = keys.reduce((o, k) => (isPlainObject(o[k]) ? o[k] : (o[k] = {})), obj);
	target[last] = value;
}

/**
 * Validates a merged config in place. Every rule falls back to the default
 * value and reports through warn(message).
 */
export function validateConfig(cfg, warn = () => {}) {
	const fix = (path, ok, fallback = get(DEFAULTS, path)) => {
		if (ok(get(cfg, path))) return;
		warn(`config.${path} is invalid (${JSON.stringify(get(cfg, path))}) — using ${JSON.stringify(fallback)}`);
		set(cfg, path, clone(fallback));
	};
	const str = v => typeof v === 'string' && v.length > 0;
	const strOrNull = v => v === null || str(v);
	const bool = v => typeof v === 'boolean';
	const posInt = v => Number.isInteger(v) && v >= 0;
	const pair = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n) && n >= 0);
	const text = v => str(v) || (isPlainObject(v) && Object.values(v).every(x => typeof x === 'string'));
	/* A same-origin folder: relative to the installation root ('site/vault/') or root-absolute ('/data/');
	   no scheme, no '//host', no '..', ends with '/' */
	const relDir = v => typeof v === 'string' && /^(?![a-z][a-z0-9+.-]*:)(?!\/\/)(?!.*\.\.)[^\s?#\\]*\/$/i.test(v);

	fix('namespace', v => typeof v === 'string' && ID.test(v) && v.length <= 24);
	fix('debug', bool);
	fix('credit', bool);
	for (const k of ['name', 'shortName', 'menuLabel']) fix(`brand.${k}`, str);
	fix('brand.glyph', strOrNull);
	fix('brand.logo', strOrNull);
	fix('brand.themeColor', v => HEX.test(v));

	/* Languages: codes, no duplicates; the default must be one of them */
	fix('languages', v => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && LANG.test(x)) && new Set(v).size === v.length);
	fix('defaultLang', v => typeof v === 'string' && cfg.languages.includes(v), cfg.languages[0]);

	fix('author.name', str);
	fix('author.links', v => Array.isArray(v));
	cfg.author.links = cfg.author.links.filter(l => {
		const ok = isPlainObject(l) && typeof l.id === 'string' && ID.test(l.id) && typeof l.url === 'string' && /^https:\/\//.test(l.url);
		if (!ok) warn(`config.author.links: skipped an entry without a valid id or https url (${JSON.stringify(l)})`);
		return ok;
	});

	fix('site.data', str);
	fix('site.hosts', v => Array.isArray(v) && v.every(h => typeof h === 'string'));
	fix('site.routes', v => Array.isArray(v));
	fix('site.defaultPageApp', strOrNull);
	fix('site.description', text);

	fix('theme.default', v => ['dark', 'light', 'auto'].includes(v));
	fix('theme.allowCustomAccent', bool);
	cleanColors(cfg.theme, 'accents', v => HEX.test(v), warn);
	cleanColors(cfg.theme, 'tints', v => Array.isArray(v) && v.length === 2 && v.every(c => HEX.test(c)), warn);
	fix('theme.accent', v => typeof v === 'string' && (Object.hasOwn(cfg.theme.accents, v) || (cfg.theme.allowCustomAccent && HEX.test(v))),
		Object.keys(cfg.theme.accents)[0] ?? 'blue');
	fix('theme.windowControls.side', v => ['left', 'right'].includes(v));
	fix('theme.windowControls.style', v => ['classic', 'minimal'].includes(v));

	fix('wallpaper.default', v => isPlainObject(v) && (
		(v.type === 'gradient' && HEX.test(v.from) && HEX.test(v.to) && typeof v.dir === 'string')
		|| (v.type === 'color' && HEX.test(v.color))
		|| (v.type === 'svg' && typeof v.id === 'string')
		|| (v.type === 'image' && typeof v.id === 'string')));
	for (const k of ['motifs', 'colors', 'gradients', 'images']) fix(`wallpaper.${k}`, v => Array.isArray(v));
	/* tone of an image or motif entry: 'light' | 'dark' — a light one gets the darker menu bar
	   (html[data-wp-tone=light], src/css/tokens.css); colours and gradients are measured instead */
	for (const k of ['motifs', 'images']) {
		cfg.wallpaper[k] = cfg.wallpaper[k].map((e, i) => {
			if (!isPlainObject(e) || e.tone === undefined || e.tone === 'light' || e.tone === 'dark') return e;
			warn(`config.wallpaper.${k}[${i}].tone must be 'light' or 'dark' (${JSON.stringify(e.tone)}) — ignored`);
			const { tone, ...rest } = e;
			return rest;
		});
	}

	fix('ui.animMs', posInt);
	fix('ui.compactQuery', str);
	fix('wm.minSize', pair);
	fix('wm.defaultSize', pair);
	fix('session.maxWindows', posInt);
	fix('dock.size', v => ['small', 'medium', 'large'].includes(v));

	for (const k of ['modules', 'apps']) {
		fix(k, v => Array.isArray(v));
		cfg[k] = cfg[k].filter(ref => {
			const ok = (typeof ref === 'string' && ID.test(ref))
				|| (isPlainObject(ref) && typeof ref.id === 'string' && ID.test(ref.id) && typeof ref.src === 'string');
			if (!ok) warn(`config.${k}: skipped an invalid entry ${JSON.stringify(ref)}`);
			return ok;
		});
	}
	fix('services', isPlainObject);
	for (const [k, v] of Object.entries(cfg.services)) {
		/* null removes a default entry (the service is then not offered, as with false) */
		if (v === null) delete cfg.services[k];
		else if (typeof v !== 'boolean') {
			warn(`config.services.${k} must be true or false`);
			cfg.services[k] = false;
		}
	}

	fix('fortune.dir', relDir);
	fix('vault.dir', relDir);
	fix('vault.collection', v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v));
	fix('vault.maxBytes', v => Number.isInteger(v) && v > 0);
	fix('trash.days', v => Number.isFinite(v) && v > 0);
	fix('trash.max', v => Number.isInteger(v) && v > 0);
	fix('backup.format', str);
	fix('backup.filePrefix', v => typeof v === 'string' && /^[\w.-]{1,60}$/.test(v));
	fix('backup.maxBytes', v => Number.isInteger(v) && v > 0);
	fix('terminal.doh', v => v === null || (isPlainObject(v) && typeof v.url === 'string' && /^https:\/\/[^/\s]+\/\S*$/.test(v.url)
		&& (v.name === undefined || str(v.name))));
	return cfg;
}

/* Colour maps: null removes a default, invalid values are dropped with a warning */
function cleanColors(theme, key, ok, warn) {
	if (!isPlainObject(theme[key])) {
		warn(`config.theme.${key} must be an object`);
		theme[key] = clone(DEFAULTS.theme[key]);
	}
	for (const [id, v] of Object.entries(theme[key])) {
		if (v === null) delete theme[key][id];
		else if (!ID.test(id) || !ok(v)) {
			warn(`config.theme.${key}.${id} is invalid (${JSON.stringify(v)}) — removed`);
			delete theme[key][id];
		}
	}
}

/** Builds the effective config from the site values (window.DESKTOP_CONFIG). Pure. */
export function buildConfig(site, warn = () => {}) {
	if (site !== undefined && !isPlainObject(site)) {
		warn('window.DESKTOP_CONFIG must be a plain object — using the defaults');
		site = {};
	}
	return deepFreeze(validateConfig(deepMerge(DEFAULTS, site ?? {}), warn));
}

/** The effective, deep-frozen configuration of this page. */
export const config = buildConfig(globalThis.DESKTOP_CONFIG, msg => console.warn(`[desktop] ${msg}`));
