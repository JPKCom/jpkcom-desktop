/* JPKCom Desktop — terminal: pure helpers (parsing, matching, history, config, Markdown rows) — © Jean Pierre Kolb — MIT License

   Everything here works without a DOM and without the desktop (the one import,
   src/core/text.js, has none of its own), so the unit tests
   (tests/p09-terminal.test.mjs) import it directly. The terminal UI (index.js)
   and the command files build on it. */

import { fold as foldText } from '../../core/text.js';
import { isObj } from '../../core/is.js';

/** Longest stored command line */
export const MAX_LINE = 500;
/** Default and upper bound of the history length (config.terminal.historySize) */
export const HISTORY_DEFAULT = 100;
export const HISTORY_MAX = 1000;
/** Largest text cat/man print (characters) */
export const MAX_FETCH = 400000;
/** Command names: lower-case letters, digits and '-', starting with a letter */
export const NAME = /^[a-z][a-z0-9-]{0,31}$/;

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

/** Validates the stored state; null when it is not an object */
export function cleanState(v, size = HISTORY_DEFAULT) {
	if (!isObj(v)) return null;
	const history = Array.isArray(v.history)
		? v.history.filter(x => typeof x === 'string' && x && x.length <= MAX_LINE && !/[\u0000-\u001f]/.test(x)).slice(-Math.max(0, size))
		: [];
	const last = typeof v.last === 'number' && Number.isFinite(v.last) && v.last > 0 ? v.last : null;
	return { history: size > 0 ? history : [], last };
}

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

/* ---------- Config section 'terminal' ---------- */

/* A path relative to the installation root (no scheme, no //host, no backslash) */
export const isRelPath = v => typeof v === 'string' && v.length > 0 && v.length <= 500 && !/\s/.test(v)
	&& !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith('//') && !v.includes('\\');

/** A DNS-over-HTTPS resolver { url: 'https://host/path', name } → cleaned, or null */
export function cleanDoh(v) {
	if (!isObj(v) || typeof v.url !== 'string') return null;
	let url;
	try {
		url = new URL(v.url);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
	const name = typeof v.name === 'string' && v.name.trim() && v.name.length <= 80 ? v.name.trim() : url.hostname;
	return { url: url.href, host: url.hostname, name };
}

/**
 * Cleans config.terminal: { user, doh, eggs, historySize, manUrl }.
 *   user         prompt user name of a guest ([A-Za-z0-9._-], ≤ 32)
 *   doh          null | { url, name } (https; host for the consent service)
 *   eggs         hidden fun commands
 *   historySize  0–1000 stored lines
 *   manUrl       null | 'docs/{lang}/{slug}.md' — a Markdown manual per collection item (relative path;
 *                placeholders {slug} {id} {collection} {lang})
 */
export function cleanConfig(section, warn = () => {}) {
	const s = isObj(section) ? section : {};
	const out = { user: 'guest', doh: null, eggs: true, historySize: HISTORY_DEFAULT, manUrl: null };
	if (s.user !== undefined) {
		if (typeof s.user === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(s.user)) out.user = s.user;
		else warn(`user must be 1–32 characters [A-Za-z0-9._-] — using '${out.user}'`);
	}
	if (s.doh != null) {
		out.doh = cleanDoh(s.doh);
		if (!out.doh) warn('doh must be null or { url: \'https://…\', name } — dig/host/nslookup are off');
	}
	if (s.eggs !== undefined) {
		if (typeof s.eggs === 'boolean') out.eggs = s.eggs;
		else warn('eggs must be true or false');
	}
	if (s.historySize !== undefined) {
		if (Number.isInteger(s.historySize) && s.historySize >= 0 && s.historySize <= HISTORY_MAX) out.historySize = s.historySize;
		else warn(`historySize must be an integer 0–${HISTORY_MAX} — using ${HISTORY_DEFAULT}`);
	}
	if (s.manUrl != null) {
		if (isRelPath(s.manUrl) && /\{(slug|id)\}/.test(s.manUrl)) out.manUrl = s.manUrl;
		else warn('manUrl must be null or a relative path with {slug} or {id} (e.g. \'docs/{lang}/{slug}.md\')');
	}
	return out;
}

/** Fills {name} placeholders with URL-encoded values; unknown ones stay */
export const fillTemplate = (tpl, vars) => String(tpl).replace(/\{([a-z]+)\}/g, (all, k) => (Object.hasOwn(vars, k) && vars[k] != null ? encodeURIComponent(String(vars[k])) : all));

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
