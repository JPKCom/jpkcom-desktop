/* JPKCom Desktop — i18n: locale loading, fallback chain, plurals, Intl formatters — © Jean Pierre Kolb — MIT License

   Strings live in locales/<lang>/<namespace>.js (ES modules, export default
   { key: 'text' | { one, other, … } }), one file per namespace; the language's
   metadata in locales/<lang>/_meta.js. Nothing here assumes two languages:

   - Lookup chain per key: lang → its base language (de-AT → de) →
     config.defaultLang → 'en' → the key itself (warned once in debug mode).
   - t('ns.key', { name: 'x', n: 3 }) — named placeholders {name}; numbers are
     formatted for the language (grouped from 10 000 up — pass years and ids as
     strings anyway); plural values pick their form through
     Intl.PluralRules (params.n or params.count), with exact '=0'/'=1' forms first.
   - L(value) — manifest texts: a string (or '@ns.key' reference) or a
     { lang: text } map, resolved along the same chain, else its first value.
   - resolve(value) → { text, lang }: the same lookup as L() (and t() for
     '@ns.key'), plus the language the text was found in — null for plain
     strings and missing keys. A text that fell back to another language than
     the page's gets that lang (and dir) on its element: dom.markLang(el, lang).
   - setLang(): the last request wins — a slower earlier switch that finishes
     later is dropped, and choosing the current language cancels a pending one.
   - Every date, number, list and byte size goes through the formatters here,
     which use the language's Intl tag (meta.intl) — never a hard-coded locale. */

import { config } from './config.js';
import { asset, hasCmdKey } from './env.js';
import { store, V } from './store.js';
import { emit } from './bus.js';

const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const META_DEFAULT = Object.freeze({ dir: 'ltr', yes: '^(y|yes)$' });
/* A language code as a map key ('de', 'de-AT', 'zh-Hant') */
const LANG_KEY = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

const isObj = V.isObj;
const isPluralForm = v => isObj(v) && typeof v.other === 'string'
	&& Object.entries(v).every(([k, x]) => (PLURAL.has(k) || /^=\d+$/.test(k)) && typeof x === 'string');

/** Splits 'ns.key' → ['ns', 'key']; an unqualified key belongs to 'core'. */
export const splitKey = key => {
	const i = key.indexOf('.');
	return i < 0 ? ['core', key] : [key.slice(0, i), key.slice(i + 1)];
};

/**
 * Creates an i18n instance (exported for tests; the desktop uses the shared one below).
 *   languages     codes the site offers, in menu order
 *   defaultLang   fallback after the base language
 *   load(code, ns)    → Promise<dict> (rejects or resolves null when missing)
 *   loadMeta(code)    → Promise<meta>
 *   onChange({ lang, prev })  called after setLang() switched
 */
export function createI18n({ languages, defaultLang, debug = false, load, loadMeta = async () => null, onChange = () => {}, warn = console.warn }) {
	const known = new Set([...languages, 'en']);
	const dicts = new Map();      // 'code/ns' → dict
	const pending = new Map();    // 'code/ns' → Promise
	const metas = new Map();      // code → meta
	const namespaces = new Set(); // every namespace loaded so far (reloaded on setLang)
	const warned = new Set();
	const cache = new Map();      // Intl instances
	let lang = languages.includes(defaultLang) ? defaultLang : languages[0];

	const note = msg => {
		if (debug && !warned.has(msg)) {
			warned.add(msg);
			warn(`[i18n] ${msg}`);
		}
	};

	/** The lookup chain of a language: itself, base, default, English — each once, only known ones. */
	function chain(code = lang) {
		const out = [];
		const add = c => { if (c && known.has(c) && !out.includes(c)) out.push(c); };
		out.push(code);
		add(code.split('-')[0]);
		add(defaultLang);
		add('en');
		return out;
	}

	function sanitize(dict, where) {
		if (!isObj(dict)) {
			if (dict != null) warn(`[i18n] ${where}: default export must be an object`);
			return {};
		}
		const out = {};
		for (const [k, v] of Object.entries(dict)) {
			if (typeof v === 'string' || isPluralForm(v)) out[k] = v;
			else warn(`[i18n] ${where}: '${k}' is neither a string nor a plural form — ignored`);
		}
		return out;
	}

	function loadDict(code, ns) {
		const id = `${code}/${ns}`;
		if (dicts.has(id)) return Promise.resolve();
		if (pending.has(id)) return pending.get(id);
		const p = Promise.resolve()
			.then(() => load(code, ns))
			.then(d => sanitize(d, `locales/${id}.js`))
			.catch(err => {
				note(`locales/${id}.js could not be loaded (${err?.message ?? err})`);
				return {};
			})
			.then(d => {
				dicts.set(id, Object.freeze(d));
				pending.delete(id);
			});
		pending.set(id, p);
		return p;
	}

	/** Loads namespaces for the whole chain of a language (default: current). */
	async function use(nsList, code = lang) {
		const list = (Array.isArray(nsList) ? nsList : [nsList]).filter(ns => typeof ns === 'string' && /^[a-z][a-z0-9-]*$/.test(ns));
		for (const ns of list) namespaces.add(ns);
		await Promise.all(chain(code).flatMap(c => list.map(ns => loadDict(c, ns))));
	}

	async function loadMetas() {
		await Promise.all([...known].map(async code => {
			let m = null;
			try {
				m = await loadMeta(code);
			} catch (err) {
				note(`locales/${code}/_meta.js could not be loaded (${err?.message ?? err})`);
			}
			metas.set(code, Object.freeze({ ...META_DEFAULT, name: code, intl: code, ...(isObj(m) ? m : {}) }));
		}));
	}

	const meta = (code = lang) => metas.get(code) ?? { ...META_DEFAULT, name: code, intl: code };
	const locale = (code = lang) => {
		const tag = meta(code).intl;
		try {
			return Intl.getCanonicalLocales(tag)[0];
		} catch {
			return 'en';
		}
	};

	function intl(Ctor, code, opts) {
		const id = `${Ctor.name}|${locale(code)}|${JSON.stringify(opts ?? {})}`;
		if (!cache.has(id)) cache.set(id, new Ctor(locale(code), opts));
		return cache.get(id);
	}

	const fmtNumber = (n, opts, code = lang) => intl(Intl.NumberFormat, code, opts).format(n);

	/* Placeholder numbers group only from 10 000 up (CLDR "min2"): 2026 stays '2026' in German,
	   12345 → '12.345'. Written out instead of useGrouping: 'min2', which older engines read as true. */
	const fmtPlaceholder = (n, code) => fmtNumber(n, Math.abs(n) < 10000 ? { useGrouping: false, maximumFractionDigits: 3 } : undefined, code);

	function interpolate(text, params, code) {
		if (!params || !text.includes('{')) return text;
		return text.replace(/\{([A-Za-z0-9_]+)\}/g, (all, name) => {
			if (!Object.hasOwn(params, name)) return all;
			const v = params[name];
			return typeof v === 'number' ? fmtPlaceholder(v, code) : String(v ?? '');
		});
	}

	/* Key names for shortcut hints: core.key<Name> where the language has one */
	const KEY_NAMES = { Mod: 'keyCtrl', Ctrl: 'keyCtrl', Control: 'keyCtrl', Alt: 'keyAlt', Shift: 'keyShift', Meta: 'keyMeta',
		Enter: 'keyEnter', Escape: 'keyEsc', Esc: 'keyEsc', ' ': 'keySpace', Space: 'keySpace', Tab: 'keyTab',
		Backspace: 'keyBackspace', Delete: 'keyDelete', PageUp: 'keyPageUp', PageDown: 'keyPageDown', Home: 'keyHome', End: 'keyEnd' };
	const KEY_SYMBOLS = { Mod: '⌘', Meta: '⌘', Ctrl: '⌃', Control: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↩', Escape: '⎋', Esc: '⎋',
		Tab: '⇥', Backspace: '⌫', Delete: '⌦', PageUp: '⇞', PageDown: '⇟', Home: '↖', End: '↘' };
	const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

	/**
	 * A shortcut as the user reads it: 'Mod+K' → 'Ctrl+K' / 'Strg+K', or '⌘K' with
	 * symbols (keyboards with a ⌘ key; the default follows the platform). Key names come
	 * from the core namespace (keyCtrl, keyAlt, keyShift, keyMeta, keyEnter, keyEsc, keySpace, keyTab,
	 * keyBackspace, keyDelete, keyPageUp, keyPageDown, keyHome, keyEnd), the joiner from core.keyJoin ('+');
	 * 'Alt+PageDown' → 'Alt+Page Down' / 'Alt+Bild↓', or '⌥⇟' with symbols.
	 */
	/* Keyboards with a ⌘ key show ⌘ ⌥ ⇧ instead of key names (env.hasCmdKey) */
	function keys(combo, { symbols = hasCmdKey() } = {}) {
		const parts = String(combo ?? '').split(/\+(?!$)/).filter(Boolean);
		const name = k => {
			if (ARROWS[k]) return ARROWS[k];
			if (symbols && KEY_SYMBOLS[k]) return KEY_SYMBOLS[k];
			if (KEY_NAMES[k] && has(`core.${KEY_NAMES[k]}`)) return t(`core.${KEY_NAMES[k]}`);
			if (k === 'Mod') return 'Ctrl';
			return k.length === 1 ? k.toUpperCase() : k;
		};
		const join = symbols ? '' : has('core.keyJoin') ? t('core.keyJoin') : '+';
		return parts.map(name).join(join);
	}

	function pick(form, params, code) {
		const n = params?.n ?? params?.count;
		if (typeof n !== 'number' || !Number.isFinite(n)) return form.other;
		if (Object.hasOwn(form, `=${n}`)) return form[`=${n}`];
		const cat = intl(Intl.PluralRules, code).select(n);
		return form[cat] ?? form.other;
	}

	/* The one key lookup behind t() and resolve(): { text, lang } — lang is the chain language
	   the key was found in, null when it is missing (text is then the key itself) */
	function lookup(key, params) {
		const [ns, k] = splitKey(String(key));
		/* { count } works like { n } (and fills {n} as well) */
		if (params && params.n === undefined && typeof params.count === 'number') params = { ...params, n: params.count };
		for (const c of chain()) {
			const d = dicts.get(`${c}/${ns}`);
			if (d && Object.hasOwn(d, k)) {
				const v = d[k];
				return { text: interpolate(typeof v === 'string' ? v : pick(v, params, c), params, c), lang: c };
			}
		}
		note(dicts.size && ![...namespaces].includes(ns) ? `namespace '${ns}' was never loaded (key '${key}')` : `missing key '${key}'`);
		return { text: String(key), lang: null };
	}

	/** Translates 'ns.key' (unqualified → 'core') with named placeholders. */
	const t = (key, params) => lookup(key, params).text;

	/** Whether a key resolves in the current chain */
	const has = key => {
		const [ns, k] = splitKey(String(key));
		return chain().some(c => Object.hasOwn(dicts.get(`${c}/${ns}`) ?? {}, k));
	};

	/**
	 * Resolves a manifest text — string, '@ns.key' (params fill its placeholders) or
	 * { lang: text } — to { text, lang }: lang is the language of the text found
	 * (a chain language or the map key), null for a plain string, a number or a missing key.
	 */
	function resolve(v, params) {
		const none = text => ({ text, lang: null });
		if (v == null) return none('');
		if (typeof v === 'string') return v.startsWith('@') ? lookup(v.slice(1), params) : none(v);
		if (typeof v === 'number') return none(String(v));
		if (!isObj(v)) return none('');
		const found = k => ({ text: v[k], lang: LANG_KEY.test(k) ? k : null });
		for (const code of chain()) {
			if (typeof v[code] === 'string') return found(code);
			/* { 'de-AT': … } for lang 'de' (and the other way round): match by base language */
			const base = code.split('-')[0];
			const k = Object.keys(v).find(x => x.split('-')[0] === base && typeof v[x] === 'string');
			if (k) return found(k);
		}
		const first = Object.keys(v).find(x => typeof v[x] === 'string');
		return first === undefined ? none('') : found(first);
	}

	/** Resolves a manifest text: string, '@ns.key' or { lang: text } (resolve() without the language). */
	const L = v => resolve(v).text;

	/** Picks the start language: ?lang= → stored → browser languages → default. */
	function detect({ query = null, stored = null, preferred = [] } = {}) {
		const offer = languages;
		const exact = c => offer.find(x => x.toLowerCase() === String(c).toLowerCase());
		if (query && exact(query)) return exact(query);
		if (stored && exact(stored)) return exact(stored);
		for (const p of preferred) if (exact(p)) return exact(p);
		for (const p of preferred) {
			const base = String(p).split('-')[0].toLowerCase();
			const hit = offer.find(x => x.toLowerCase() === base) ?? offer.find(x => x.split('-')[0].toLowerCase() === base);
			if (hit) return hit;
		}
		return offer.includes(defaultLang) ? defaultLang : offer[0];
	}

	let target = null;   // the language a pending setLang() is loading
	let switchSeq = 0;   // the newest setLang() request

	/**
	 * Switches the language; loads every namespace in use first. Resolves true when it
	 * changed. The last request wins: an earlier one still loading resolves false, and
	 * asking for the current language cancels a pending switch.
	 */
	async function setLang(code) {
		if (!languages.includes(code) || code === (target ?? lang)) return false;
		const seq = ++switchSeq;
		if (code === lang) {
			target = null;
			return false;
		}
		target = code;
		try {
			await use([...namespaces], code);
			/* namespaces added while loading (a module set up meanwhile) — usually cached already */
			await use([...namespaces], code);
		} catch (err) {
			if (seq === switchSeq) target = null;
			throw err;
		}
		if (seq !== switchSeq) return false;
		target = null;
		const prev = lang;
		lang = code;
		onChange({ lang, prev });
		return true;
	}

	/* ---------- Formatters ---------- */

	const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];

	const api = {
		t, L, resolve, has, use, chain, detect, setLang, loadMetas, meta, locale, keys,
		lang: () => lang,
		/** Sets the language without events or loading (boot only) */
		init: code => { if (languages.includes(code)) lang = code; },
		dir: (code = lang) => (meta(code).dir === 'rtl' ? 'rtl' : 'ltr'),
		available: () => [...languages],
		/** Display name of a language: its own meta.name, else Intl.DisplayNames */
		displayName(code, inLang = code) {
			const m = metas.get(code);
			if (m && m.name !== code) return m.name;
			try {
				return new Intl.DisplayNames([locale(inLang)], { type: 'language' }).of(code) ?? code;
			} catch {
				return code;
			}
		},
		/** Yes/no answer test of the language (terminal prompts) */
		isYes(answer) {
			try {
				return new RegExp(meta().yes, 'i').test(String(answer).trim());
			} catch {
				return /^(y|yes)$/i.test(String(answer).trim());
			}
		},
		fmtNumber: (n, opts) => fmtNumber(n, opts),
		fmtDate: (d, opts = { dateStyle: 'medium' }) => intl(Intl.DateTimeFormat, lang, opts).format(d),
		fmtTime: (d, opts = { hour: '2-digit', minute: '2-digit' }) => intl(Intl.DateTimeFormat, lang, opts).format(d),
		/** Parts of a date (for custom layouts): { weekday, day, month, … } */
		dateParts: (d, opts) => Object.fromEntries(intl(Intl.DateTimeFormat, lang, opts).formatToParts(d).map(p => [p.type, p.value])),
		/** Byte size with binary steps (1 kB = 1024 B): below 1024 core.bytes ('161 B' — Intl's
		    'byte' unit would read '161 byte'), above that unit names from Intl */
		fmtBytes(n, { digits = 1 } = {}) {
			let i = 0;
			let v = Math.max(0, Number(n) || 0);
			while (v >= 1024 && i < BYTE_UNITS.length - 1) {
				v /= 1024;
				i++;
			}
			if (i === 0) {
				const num = fmtNumber(Math.round(v));
				return has('core.bytes') ? t('core.bytes', { n: num }) : `${num} B`;
			}
			return intl(Intl.NumberFormat, lang, { style: 'unit', unit: BYTE_UNITS[i], unitDisplay: 'short', maximumFractionDigits: i ? digits : 0 }).format(v);
		},
		/** 'a, b and c' in the current language */
		list(items, opts = { type: 'conjunction', style: 'long' }) {
			try {
				return intl(Intl.ListFormat, lang, opts).format(items.map(String));
			} catch {
				return items.join(', ');
			}
		},
		/** 'yesterday', 'in 3 days', … */
		relTime: (value, unit, opts = { numeric: 'auto' }) => intl(Intl.RelativeTimeFormat, lang, opts).format(value, unit),
		collator: (opts = { sensitivity: 'base', numeric: true }) => intl(Intl.Collator, lang, opts),
		compare: (a, b) => intl(Intl.Collator, lang, { sensitivity: 'base', numeric: true }).compare(a, b),
		pluralCategory: n => intl(Intl.PluralRules, lang).select(n),
		decimalSep: () => intl(Intl.NumberFormat, lang).formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? '.',
		/** { firstDay: 1–7 (1 = Monday), weekend: [6, 7], minimalDays } of the locale */
		weekInfo() {
			try {
				const loc = new Intl.Locale(locale());
				const w = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
				if (w?.firstDay) return { firstDay: w.firstDay, weekend: w.weekend ?? [6, 7], minimalDays: w.minimalDays ?? 4 };
			} catch { /* older engines */ }
			return { firstDay: 1, weekend: [6, 7], minimalDays: 4 };
		}
	};
	return api;
}

/* ---------- The desktop's instance ---------- */

const apply = () => {
	if (typeof document === 'undefined') return;
	document.documentElement.lang = i18n.lang();
	document.documentElement.dir = i18n.dir();
};

export const i18n = createI18n({
	languages: config.languages,
	defaultLang: config.defaultLang,
	debug: config.debug,
	load: (code, ns) => import(asset(`locales/${code}/${ns}.js`)).then(m => m.default),
	loadMeta: code => import(asset(`locales/${code}/_meta.js`)).then(m => m.default),
	onChange({ lang, prev }) {
		store.set('lang', lang);
		apply();
		emit('lang:change', { lang, prev });
	}
});

/** Boot: metadata of every language, the start language and the 'core' namespace. */
export async function initI18n() {
	await i18n.loadMetas();
	const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
	i18n.init(i18n.detect({
		query: params.get('lang'),
		stored: store.get('lang'),
		preferred: typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
	}));
	await i18n.use(['core']);
	apply();
}

export const { t, L } = i18n;
