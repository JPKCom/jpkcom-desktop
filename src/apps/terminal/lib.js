/* JPKCom Desktop — terminal: pure helpers (parsing, matching, history, config, Markdown rows) — © Jean Pierre Kolb — MIT License

   Everything here works without a DOM and without the desktop (the imports,
   src/core/text.js and src/core/is.js, have none of their own), so the unit
   tests (tests/p09-terminal.test.mjs) import it directly. The terminal window
   (window.js) and the command files build on it; both load with the first
   window. What the descriptor needs at boot (config, stored history, command
   names) is in config.js and re-exported here. The rules of manual values
   (man, manUrl) are src/core/man.js; what `man <entry>` reads, in which order
   and what it says is decided here (manPlan, manLookup, manOutcome). */

import { fold as foldText } from '../../core/text.js';
import { isObj } from '../../core/is.js';
import { isTextPath } from '../../core/man.js';
import { MAX_LINE, HISTORY_DEFAULT, isRelPath } from './config.js';

export { MAX_LINE, HISTORY_DEFAULT, HISTORY_MAX, NAME, cleanState, isRelPath, cleanDoh, cleanConfig } from './config.js';
export { MAN_VARS, isTextPath } from '../../core/man.js';

/** Largest text cat/man print (characters) */
export const MAX_FETCH = 400000;

/** Case-, accent- and ß-insensitive form for matching: 'Über' → 'uber', 'Straße' → 'strasse'
   (the rule of Search and Catalog, src/core/text.js; one argument — no locale) */
export const fold = s => foldText(s);

/** Tokens split at whitespace; "double" or 'single' quotes keep spaces */
export function parse(line) {
	const out = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let m;
	while ((m = re.exec(String(line ?? '')))) out.push(m[1] ?? m[2] ?? m[3]);
	return out;
}

/** Edit distance (Levenshtein) — for "did you mean …?" */
export function distance(a, b) {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = tmp;
		}
	}
	return row[b.length];
}

/** The closest name within max edits, or null */
export function nearest(word, names, max = 2) {
	let best = null;
	for (const n of names) {
		const d = distance(word, n);
		if (d <= max && (!best || d < best[1])) best = [n, d];
	}
	return best ? best[0] : null;
}

/** Common start of all strings */
export const commonPrefix = list => (list.length ? list.reduce((p, s) => {
	let i = 0;
	while (i < p.length && i < s.length && p[i] === s[i]) i++;
	return p.slice(0, i);
}) : '');

/**
 * Finds a target in [{ key, name, … }]: exact key or name, then a unique
 * prefix, then a unique part of the name → { hit } | { many } | {}.
 * On equal keys the earlier entry wins.
 */
export function resolve(query, list) {
	const q = fold(query);
	if (!q) return {};
	const exact = list.find(x => fold(x.key) === q || fold(x.name) === q);
	if (exact) return { hit: exact };
	const pre = list.filter(x => fold(x.key).startsWith(q) || fold(x.name).startsWith(q));
	if (pre.length === 1) return { hit: pre[0] };
	if (pre.length) return { many: pre };
	const part = list.filter(x => fold(x.name).includes(q));
	if (part.length === 1) return { hit: part[0] };
	return part.length ? { many: part } : {};
}

/**
 * Tab completion of the last word of a line against a pool of words.
 * → { value } (the new line), { list } (several matches, nothing to add) or null.
 */
export function completeLine(value, pool) {
	const parts = String(value).split(' ');
	const word = parts.at(-1).toLowerCase();
	const matches = [...new Set(pool.filter(w => typeof w === 'string' && w))].filter(c => c.toLowerCase().startsWith(word)).sort();
	if (!matches.length) return null;
	const set = w => {
		parts[parts.length - 1] = w;
		return parts.join(' ');
	};
	if (matches.length === 1) return { value: set(`${matches[0]} `) };
	const prefix = commonPrefix(matches.map(m => m.toLowerCase()));
	if (prefix.length > word.length) return { value: set(matches[0].slice(0, prefix.length)) };
	return { list: matches };
}

/* ---------- Stored history: { history: [line], last: timestamp } ---------- */

/** Adds a line (not twice in a row), keeps the newest size lines → a new state */
export function pushHistory(state, line, size = HISTORY_DEFAULT) {
	const text = String(line).trim().slice(0, MAX_LINE);
	if (!text || size <= 0 || /[\u0000-\u001f]/.test(text)) return state;
	if (state.history.at(-1) === text) return state;
	return { ...state, history: [...state.history, text].slice(-size) };
}

/**
 * What the history keeps of a line: the line itself, or only the command name when
 * the command is sensitive (its arguments may hold a password). entry: the registry
 * entry { name, def } or null for an unknown name — that line is kept as typed, as in
 * any shell (a mistyped `logn alice secret` lands in the history).
 */
export const historyLine = (line, entry) => (entry?.def?.sensitive === true ? entry.name : String(line ?? '').trim());

/* ---------- Templates (config.terminal.manUrl) ---------- */

/** Fills {name} placeholders with URL-encoded values; unknown ones stay */
export const fillTemplate = (tpl, vars) => String(tpl).replace(/\{([a-z]+)\}/g, (all, k) => (Object.hasOwn(vars, k) && vars[k] != null ? encodeURIComponent(String(vars[k])) : all));

/* ---------- Manual pages of entries (`man <entry>`, p09 "Manual pages of entries") ---------- */

/** At most this many text files are tried for one `man <entry>` */
export const MAX_MAN_SOURCES = 6;

/**
 * One manual value (cleaned by src/core/man.js) → paths in fallback order, each once.
 *   vars: { slug, id, collection }; chain: the i18n fallback chain ['de', 'en', …]
 *   string with {lang} → one path per chain language; without → the one path;
 *   map → per chain language the equal key, else the first key of the same base language
 *         ({lang} = that key), then the map's first value (the last resort of Desk.L)
 */
export function expandMan(value, vars, chain) {
	if (value == null || value === false) return [];
	const out = [];
	const add = (tpl, lang) => {
		const path = fillTemplate(tpl, { ...vars, lang });
		if (!out.includes(path)) out.push(path);
	};
	const langs = Array.isArray(chain) ? chain : [];
	if (typeof value === 'string') {
		if (value.includes('{lang}')) for (const lang of langs) add(value, lang);
		else add(value, null);
		return out;
	}
	if (!isObj(value)) return out;
	const keys = Object.keys(value).filter(k => typeof value[k] === 'string');
	const used = new Set();
	for (const lang of langs) {
		const base = String(lang).split('-')[0];
		const key = keys.includes(lang) ? lang : keys.find(k => k.split('-')[0] === base);
		if (!key) continue;
		used.add(key);
		add(value[key], key);
	}
	if (keys.length && !used.has(keys[0])) add(value[keys[0]], keys[0]);
	return out;
}

/**
 * What `man` reads for one entry (pure):
 *   entry: { kind: 'apps' | <collection id>, key, id, app }   (catalog.js targets())
 *   collection: { man, source } | null,  manUrl (config.terminal.manUrl),  chain,
 *   L: resolves { lang: url } (Desk.L),  isText(path) → a text file on this site
 * → { texts: string[] (≤ MAX_MAN_SOURCES), page: string | null, off: boolean }
 * Order: the item's own man → its collection's man → manUrl (the first that is set decides; false = off).
 * A collection's man applies only to items of the collection's own source (not the vault's in a site
 * collection); manUrl only to items of the site's own collections (source 'site').
 * An item's docs that is a text file is printed first while the item has no man of its own (1.1.0);
 * a docs that is not printed is the page ("Full documentation"), else the first non-text path.
 */
export function manPlan({ entry, collection = null, manUrl = null, chain = [], L = v => (typeof v === 'string' ? v : null), isText = isTextPath }) {
	const app = entry?.app ?? {};
	const docs = app.docs != null ? (L(app.docs) || null) : null;
	if (entry?.kind === 'apps') {
		const text = !!docs && isText(docs);
		return { texts: text ? [docs] : [], page: docs && !text ? docs : null, off: false };
	}
	const own = app.man == null ? undefined : app.man;
	const tpl = !!collection && app.source === collection.source;
	const coll = collection?.man ?? null;
	/* manUrl only for the site's own items: a collection another source brought (the vault's) never uses it */
	const site = tpl && collection.source === 'site';
	const level = own !== undefined ? own : !tpl ? null : coll !== null ? coll : site ? (manUrl ?? null) : null;
	const off = level === false;
	const vars = { slug: app.slug ?? entry?.key, id: app.id ?? entry?.id, collection: app.collection ?? entry?.kind };
	const paths = expandMan(level, vars, chain);
	const texts = [];
	/* off: nothing is read — a docs text file then only stays as the link */
	if (!off) {
		if (own === undefined && docs && isText(docs)) texts.push(docs);
		for (const p of paths) if (isText(p) && !texts.includes(p)) texts.push(p);
	}
	const page = docs && !texts.includes(docs) ? docs : (paths.find(p => !isText(p)) ?? null);
	return { texts: texts.slice(0, MAX_MAN_SOURCES), page, off };
}

/** Has this plan anything to show? (Tab completion, lookup) */
export const hasManual = plan => !!plan && !plan.off && (plan.texts.length > 0 || plan.page !== null);

/**
 * `man <name>` among entries (commands come first, in the command): an exact key or name over all
 * entries wins (also one without a manual); then a unique prefix/part among the entries that have a
 * manual; then a unique prefix among all of them (no part match: a stray substring — an egg like `rm`
 * — must not name an unrelated entry). exact: only the exact step (the query names a hidden command).
 * → { hit, manual: boolean } | { many } | {}
 */
export function manLookup(query, list, has, { exact: exactOnly = false } = {}) {
	const q = fold(query);
	if (!q) return {};
	const exact = list.find(x => fold(x.key) === q || fold(x.name) === q);
	if (exact) return { hit: exact, manual: !!has(exact) };
	if (exactOnly) return {};
	const withManual = resolve(query, list.filter(x => has(x)));
	if (withManual.hit) return { hit: withManual.hit, manual: true };
	if (withManual.many) return { many: withManual.many };
	const pre = list.filter(x => fold(x.key).startsWith(q) || fold(x.name).startsWith(q));
	if (pre.length === 1) return { hit: pre[0], manual: !!has(pre[0]) };
	return pre.length ? { many: pre } : {};
}

/** A failed manual request: 'missing' (404/410), 'stop' (network/timeout), 'aborted', 'failed' (anything else) */
export function manMiss(err) {
	const code = err?.code;
	if (code === 'aborted' || err?.name === 'AbortError') return 'aborted';
	if (code === 'http' && (err.status === 404 || err.status === 410)) return 'missing';
	if (code === 'network' || code === 'timeout') return 'stop';
	return 'failed';
}

/** Is this Content-Type an HTML page? (a 200 HTML answer counts as a missing manual) */
export const isHtmlType = type => /\btext\/html\b/i.test(String(type ?? ''));

/**
 * What `man <entry>` shows after fetching (pure):
 *   'aborted'  the command was cancelled — nothing
 *   'print'    a text loaded
 *   'link'     no text to read, a page to link (not off)
 *   'error'    nothing loaded and at least one request failed (offline, server error, too large)
 *   'none'     no manual, off, or every file missing — "<name> has no manual page." (not an error)
 */
export function manOutcome({ texts = [], page = null, off = false, loaded = false, failed = 0, aborted = false } = {}) {
	if (aborted) return 'aborted';
	if (loaded) return 'print';
	if (!off && !texts.length && page) return 'link';
	if (failed > 0) return 'error';
	return 'none';
}


/* ---------- site/apps.js files (cat) ---------- */

const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const isUrlMap = v => isRelPath(v) || (isObj(v) && Object.keys(v).length > 0
	&& Object.entries(v).every(([k, x]) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(k) && isRelPath(x)));

/**
 * The files `cat` can print: { name: 'path' | { lang: 'path' } | { url: path | { lang: path }, aliases: [] } }
 * → [{ name, url, aliases }] (invalid entries warned and skipped). Paths are relative to the root.
 */
export function cleanFiles(raw, warn = () => {}) {
	if (raw == null) return [];
	if (!isObj(raw)) {
		warn('files must be an object { name: path }');
		return [];
	}
	const out = [];
	for (const [name, v] of Object.entries(raw)) {
		const ext = isObj(v) && Object.hasOwn(v, 'url');
		const url = ext ? v.url : v;
		if (!FILE_NAME.test(name) || !isUrlMap(url)) {
			warn(`files.${name}: needs a name [a-z0-9._-] and a relative path (or a { lang: path } map) — skipped`);
			continue;
		}
		const aliases = ext && Array.isArray(v.aliases) ? v.aliases.filter(a => typeof a === 'string' && FILE_NAME.test(a)).map(a => a.toLowerCase()) : [];
		out.push({ name, url, aliases });
	}
	return out;
}

/* ---------- Markdown → rows (headings, fences, **bold**, `code`, [links]) ---------- */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

/** Links a terminal may follow: https:// or a path on this site (relative or /…) — never another scheme or //host */
export const isSafeHref = href => typeof href === 'string' && href.length > 0 && href.length <= 2000
	&& (/^https:\/\//i.test(href) || (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//') && !href.includes('\\') && !/\s/.test(href)));

/** One line of Markdown → parts [{ t: 'text'|'b'|'code'|'link', text, href? }] */
export function inlineParts(text) {
	return String(text).split(INLINE).filter(Boolean).map(part => {
		if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return { t: 'b', text: part.slice(2, -2) };
		if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return { t: 'code', text: part.slice(1, -1) };
		const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
		if (m) return isSafeHref(m[2]) ? { t: 'link', text: m[1], href: m[2] } : { t: 'text', text: m[1] };
		return { t: 'text', text: part };
	});
}

const rowText = r => r.parts.map(p => p.text).join('');

/**
 * Markdown → rows [{ cls, parts }]: front matter dropped, fenced code as
 * pre rows ('term-pre term-block'), headings 'term-h', other lines inline
 * parts. No run of empty rows, none at the end.
 */
export function markdownRows(md) {
	let text = String(md ?? '').replace(/\r\n?/g, '\n');
	if (text.startsWith('---\n')) {
		const end = text.indexOf('\n---', 4);
		if (end !== -1) {
			const next = text.indexOf('\n', end + 1);
			text = next === -1 ? '' : text.slice(next + 1);
		}
	}
	const rows = [];
	let fence = false;
	for (const line of text.split('\n')) {
		if (/^\s*```/.test(line)) {
			fence = !fence;
			continue;
		}
		if (fence) rows.push({ cls: 'term-pre term-block', parts: [{ t: 'text', text: line }] });
		else if (/^#{1,6}\s/.test(line)) rows.push({ cls: 'term-h', parts: [{ t: 'text', text: line.replace(/^#+\s*/, '') }] });
		else rows.push({ cls: null, parts: inlineParts(line) });
	}
	return rows.filter((r, i) => rowText(r) !== '' || (i > 0 && rowText(rows[i - 1]) !== ''))
		.filter((r, i, all) => i < all.length - 1 || rowText(r) !== '');
}

/* ---------- Sizes (df, du) ---------- */

/** df -h style: 0, 512, 4.9K, 42K, 1.2M — fmt(n, digits) formats the number for the language */
export function human(n, fmt = (x, d) => x.toFixed(d)) {
	const units = ['', 'K', 'M', 'G', 'T'];
	let v = Math.max(0, Number(n) || 0);
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	const digits = i && v < 10 ? 1 : 0;
	return fmt(v, digits) + units[i];
}
