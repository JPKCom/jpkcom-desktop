/* JPKCom Desktop — Fortune app: data cleaning, shuffled deck, language choice (pure) — © Jean Pierre Kolb — MIT License

   No DOM and no desktop imports: the tests use these directly.

   Local data format (site/data/fortunes/<lang>.json) — plain text, no markup:

     {
       "lang": "en",                         optional, the language of the texts (default: the file's code)
       "by": "JPKCom",                       optional, the signature of every entry that names none
       "categories": { "keys": "Keyboard" }, optional, id → label in the file's language
                                             (the menu sorts them by name, as the original did)
       "items": [
         "A plain string is a saying without category.",
         { "text": "…", "cat": "keys", "by": "…", "url": "site/content/en/docs/keyboard.html" }
       ]
     }

   url: a path relative to the installation root, an absolute /path or an https:// address. */

import { isObj } from '../../core/is.js';

export const MAX_HISTORY = 20;     // fortunes kept for "previous" (as in the original)
export const MAX_TRIES = 5;        // remote: blocked answers skipped before giving up (as in the original)
export const MAX_TEXT = 1000;      // characters of one text
export const MAX_ITEMS = 2000;     // entries read from one file
export const MAX_BY = 80;          // characters of a signature

const CAT = /^[a-z][a-z0-9-]{0,31}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** A category / provider id: [a-z][a-z0-9-], at most 32 characters */
export const isCat = v => typeof v === 'string' && CAT.test(v);

/** A language code as used in the locales folder names ('en', 'de', 'pt-BR') */
export const isLang = v => typeof v === 'string' && LANG.test(v);

/**
 * Plain text, tidied: spaces collapsed inside each line, empty lines dropped,
 * at most max characters (cut at a word boundary when possible, with an ellipsis).
 */
export function normalizeText(s, max = MAX_TEXT) {
	if (typeof s !== 'string') return '';
	const text = s.replace(/\r\n?/g, '\n').split('\n')
		.map(l => l.replace(/[\s ]+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/* A link of an entry: relative path, /path or https:// — never javascript:, data:, //host, http: */
export function isSafeLink(u) {
	if (typeof u !== 'string' || !u || u.length > 2000 || /^\s|\s$/.test(u)) return false;
	if (/^https:\/\/[^/\s]/i.test(u)) return true;
	return !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//') && !u.startsWith('\\');
}

/** A list of category ids (config.fortune.block): invalid entries dropped, no duplicates */
export function cleanBlock(v, warn = () => {}) {
	if (v == null) return [];
	if (!Array.isArray(v)) {
		warn('block must be an array of category ids — ignored');
		return [];
	}
	const out = [];
	for (const x of v) {
		if (isCat(x)) {
			if (!out.includes(x)) out.push(x);
		} else warn(`block: skipped ${JSON.stringify(x)}`);
	}
	return out;
}

/**
 * Cleans a fortunes file → { lang, categories: [{ id, label }], items: [{ text, cat, by, url }] }
 * or null when nothing usable is left. code: the language the file was loaded for
 * (its default lang); block: category ids to leave out. Invalid entries are skipped.
 */
export function cleanFortunes(data, { code = null, block = [], warn = () => {} } = {}) {
	const raw = Array.isArray(data) ? { items: data } : data;
	if (!isObj(raw) || !Array.isArray(raw.items)) {
		warn('a fortunes file needs an items array');
		return null;
	}
	const lang = isLang(raw.lang) ? raw.lang : isLang(code) ? code : null;
	const defBy = typeof raw.by === 'string' ? normalizeText(raw.by, MAX_BY) || null : null;
	const blocked = new Set(block);

	/* categories: { id: label } or [{ id, label }] */
	const cats = new Map();
	const catList = Array.isArray(raw.categories) ? raw.categories.map(c => [c?.id, c?.label])
		: isObj(raw.categories) ? Object.entries(raw.categories) : [];
	for (const [id, label] of catList) {
		const name = normalizeText(typeof label === 'string' ? label : '', 60);
		if (!isCat(id) || !name) {
			warn(`skipped the category ${JSON.stringify([id, label])}`);
			continue;
		}
		if (!cats.has(id) && !blocked.has(id)) cats.set(id, name);
	}

	const items = [];
	const seen = new Set();
	for (const [i, it] of raw.items.slice(0, MAX_ITEMS).entries()) {
		const entry = typeof it === 'string' ? { text: it } : it;
		if (!isObj(entry)) {
			warn(`items[${i}]: not a text or an object — skipped`);
			continue;
		}
		const text = normalizeText(entry.text);
		if (!text) {
			warn(`items[${i}]: no text — skipped`);
			continue;
		}
		let cat = null;
		if (entry.cat != null) {
			if (blocked.has(entry.cat)) continue;
			if (!cats.has(entry.cat)) {
				if (!isCat(entry.cat)) warn(`items[${i}]: invalid category ${JSON.stringify(entry.cat)} — kept without one`);
				else warn(`items[${i}]: unknown category '${entry.cat}' — kept without one`);
			} else cat = entry.cat;
		}
		if (seen.has(text)) continue;
		seen.add(text);
		const by = entry.by === null ? null : typeof entry.by === 'string' ? normalizeText(entry.by, MAX_BY) || defBy : defBy;
		const url = entry.url == null ? null : isSafeLink(entry.url) ? entry.url : (warn(`items[${i}]: unsafe url dropped`), null);
		items.push(Object.freeze({ text, cat, by, url }));
	}
	if (!items.length) return null;
	/* only categories that have entries */
	const used = new Set(items.map(x => x.cat).filter(Boolean));
	const categories = [...cats].filter(([id]) => used.has(id)).map(([id, label]) => Object.freeze({ id, label }));
	return Object.freeze({ lang, categories: Object.freeze(categories), items: Object.freeze(items) });
}

/**
 * A shuffled deck over the items: every entry (of a category) comes once
 * before any comes again, and a new round never starts with the one just shown.
 * draw(cat | null) → item | null (null: nothing in that category).
 */
export function createDeck(items, random = Math.random) {
	const bags = new Map();   // cat|'' → remaining indices
	let last = -1;
	const shuffle = list => {
		for (let i = list.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[list[i], list[j]] = [list[j], list[i]];
		}
		return list;
	};
	return Object.freeze({
		size: items.length,
		draw(cat = null) {
			const key = cat ?? '';
			let bag = bags.get(key);
			if (!bag?.length) {
				bag = shuffle(items.map((x, i) => i).filter(i => !cat || items[i].cat === cat));
				if (!bag.length) return null;
				/* the last one shown would come again at once: swap it to the end of the round */
				if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
				bags.set(key, bag);
			}
			last = bag.pop();
			return items[last];
		}
	});
}

/**
 * The language to ask a source for: the first code of the fallback chain the
 * source offers (exact, then its base language), else the source's first one.
 * langs: null = any language.
 */
export function pickLang(chain, langs) {
	if (!Array.isArray(langs) || !langs.length) return chain[0] ?? 'en';
	for (const code of chain) {
		if (langs.includes(code)) return code;
		const base = String(code).split('-')[0];
		if (langs.includes(base)) return base;
	}
	return langs[0];
}

/** The base language of a code ('pt-BR' → 'pt') — to tell whether texts are in the user's language */
export const baseLang = code => String(code ?? '').split('-')[0].toLowerCase();

/** Stored state (key 'fortune'): { source: 'local' | 'remote' } */
export function cleanState(v) {
	if (!isObj(v)) return null;
	return v.source === 'local' || v.source === 'remote' ? { source: v.source } : null;
}

/** Appends an entry to the history after the shown one (forward entries are dropped), at most max kept */
export function pushHistory(list, idx, item, max = MAX_HISTORY) {
	const next = [...list.slice(0, idx + 1), item].slice(-max);
	return { list: next, idx: next.length - 1 };
}

/* ---------- Languages with a file ---------- */

/** The languages the shipped sayings cover (site/data/fortunes/<lang>.json) */
export const DEFAULT_LANGS = Object.freeze(['de', 'en']);
const LANG_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * config.fortune.langs: the language codes that have a <dir><lang>.json (deduplicated) — only these
 * are fetched; null = try every code of the fallback chain; missing or invalid → DEFAULT_LANGS.
 */
export function cleanLangs(v, warn = () => {}) {
	if (v === null) return null;
	if (v === undefined) return [...DEFAULT_LANGS];
	if (Array.isArray(v) && v.every(x => typeof x === 'string' && LANG_CODE.test(x))) return [...new Set(v)];
	warn(`langs must be a list of language codes (e.g. ['de', 'en']) or null — ${DEFAULT_LANGS.join(', ')} used`);
	return [...DEFAULT_LANGS];
}

/** The codes of a fallback chain to fetch: those with a file (langs null: all of them) */
export const fetchCodes = (chain, langs) => (Array.isArray(langs) ? chain.filter(c => langs.includes(c)) : [...chain]);
