/* JPKCom Desktop — Reader: pure helpers (rules, titles, alternates, cache, history, config) — © Jean Pierre Kolb — MIT License

   Everything here works without a browser, so tests/p04-reader.test.mjs can
   check it in Node: no DOM access, no imports of browser-only modules. */

import { isObj } from '../../core/is.js';

/** The rule used when no configured rule matches a page */
export const DEFAULT_RULE = Object.freeze({ content: 'main article, article, main, [role="main"]', title: 'h1', lead: null });
export const DEFAULT_SEPARATOR = '\\s[|—–]\\s';
export const DEFAULT_CACHE = 24;
export const MAX_CACHE = 200;

/**
 * The text of a response body within a deadline and a size limit. net.request() hands the
 * Response over once the headers are in — the Reader needs its type and final URL before
 * it reads — so its timeout ends there; this bounds the rest: a body that stalls past
 * timeout ms fails with 'timeout', one past maxBytes with 'size' (Content-Length checked
 * first), and the transfer is cancelled either way. UTF-8, as Response.text().
 */
export async function readText(res, { maxBytes = Infinity, timeout = 15000 } = {}) {
	const fail = code => Object.assign(new Error(`page body: ${code}`), { code });
	const declared = Number(res.headers?.get?.('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) {
		res.body?.cancel().catch(() => {});
		throw fail('size');
	}
	if (!res.body) return '';
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		reader.cancel().catch(() => {});
	}, Math.max(0, timeout));
	let text = '';
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (timedOut) throw fail('timeout');
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				reader.cancel().catch(() => {});
				throw fail('size');
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		clearTimeout(timer);
	}
	return text + decoder.decode();
}

/** Levels a page heading moves down: the window title is the page's h2, so a page h1 is its h3 */
export const HEADING_SHIFT = 2;

/** The level an imported heading of level n gets (h1 → 3, h2 → 4, h3 → 5; h4–h6 end at 6) */
export const demotedLevel = n => Math.min(Math.max(1, Math.trunc(Number(n)) || 1) + HEADING_SHIFT, 6);
const nonEmpty = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Splits a selector list at its top-level commas, so 'main article, article, main'
 * can be tried selector by selector in the given order (querySelector would take
 * the first match in document order instead). Commas inside (), [] and quotes stay.
 */
export function splitSelectors(list) {
	if (typeof list !== 'string') return [];
	const out = [];
	let depth = 0;
	let quote = '';
	let cur = '';
	for (let i = 0; i < list.length; i++) {
		const c = list[i];
		if (quote) {
			cur += c;
			if (c === '\\' && i + 1 < list.length) cur += list[++i];
			else if (c === quote) quote = '';
			continue;
		}
		if (c === '"' || c === "'") quote = c;
		else if (c === '(' || c === '[') depth++;
		else if ((c === ')' || c === ']') && depth > 0) depth--;
		else if (c === ',' && depth === 0) {
			if (cur.trim()) out.push(cur.trim());
			cur = '';
			continue;
		}
		cur += c;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

/**
 * The first element found by any selector of the list, tried in list order.
 * root: anything with querySelector (a Document or an Element). Invalid selectors are skipped.
 */
export function firstMatch(root, list) {
	for (const sel of splitSelectors(list)) {
		try {
			const el = root.querySelector(sel);
			if (el) return el;
		} catch { /* invalid selector */ }
	}
	return null;
}

/**
 * Cleans config.reader (descriptor validateConfig). warn(msg) reports what was
 * replaced. checkSelector(sel) → boolean (optional; the browser passes one).
 */
export function validateReaderConfig(section, warn = () => {}, checkSelector = null) {
	const src = isObj(section) ? section : {};
	if (!isObj(section)) warn('must be an object — defaults used');
	const okSelector = sel => {
		if (!checkSelector) return true;
		return splitSelectors(sel).some(s => {
			try {
				return checkSelector(s) !== false;
			} catch {
				return false;
			}
		});
	};
	const rules = [];
	for (const [i, r] of (Array.isArray(src.rules) ? src.rules : []).entries()) {
		const where = `rules[${i}]`;
		if (!isObj(r) || !nonEmpty(r.match)) {
			warn(`${where} needs a match (path prefix or '^regex') — skipped`);
			continue;
		}
		const match = r.match.trim();
		if (match.startsWith('^')) {
			try {
				new RegExp(match);
			} catch (err) {
				warn(`${where}: invalid regular expression (${err.message}) — skipped`);
				continue;
			}
		}
		const rule = { match, content: DEFAULT_RULE.content, title: null, lead: null };
		for (const key of ['content', 'title', 'lead']) {
			if (r[key] == null) continue;
			const sel = nonEmpty(r[key]);
			if (sel && okSelector(sel)) rule[key] = sel;
			else warn(`${where}.${key}: not a valid selector — ${key === 'content' ? 'default used' : 'ignored'}`);
		}
		rules.push(rule);
	}
	if (src.rules != null && !Array.isArray(src.rules)) warn('rules must be an array — no rules used');

	let titleSeparator = DEFAULT_SEPARATOR;
	if (src.titleSeparator != null) {
		try {
			if (typeof src.titleSeparator !== 'string' || !src.titleSeparator) throw new Error('not a string');
			new RegExp(src.titleSeparator);
			titleSeparator = src.titleSeparator;
		} catch (err) {
			warn(`titleSeparator: invalid regular expression (${err.message}) — default used`);
		}
	}

	let cacheSize = DEFAULT_CACHE;
	if (src.cacheSize != null) {
		if (Number.isInteger(src.cacheSize) && src.cacheSize >= 0 && src.cacheSize <= MAX_CACHE) cacheSize = src.cacheSize;
		else warn(`cacheSize must be an integer 0–${MAX_CACHE} — ${DEFAULT_CACHE} used`);
	}
	return { rules, titleSeparator, cacheSize };
}

/**
 * Compiles cleaned rules: a prefix is resolved against the installation root
 * (root: absolute URL), so 'site/content/' also works in a sub-folder install;
 * '/…' is an absolute path on this host; '^…' is a regular expression on the
 * absolute path. → [{ test(pathname), content, title, lead }]
 */
export function compileRules(rules, root) {
	return (rules ?? []).flatMap(r => {
		let test;
		if (r.match.startsWith('^')) {
			try {
				const re = new RegExp(r.match);
				test = p => re.test(p);
			} catch {
				return [];
			}
		} else {
			let prefix;
			try {
				prefix = new URL(r.match, root).pathname;
			} catch {
				return [];
			}
			test = p => p.startsWith(prefix);
		}
		return [{ test, content: r.content || DEFAULT_RULE.content, title: r.title ?? null, lead: r.lead ?? null }];
	});
}

/** The first rule whose match fits the absolute path, else DEFAULT_RULE. */
export function matchRule(compiled, pathname) {
	return (compiled ?? []).find(r => r.test(pathname)) ?? DEFAULT_RULE;
}

/** "Page | Site" → "Page" (separator: regular expression source; config.reader.titleSeparator). */
export function cleanTitle(title, separator = DEFAULT_SEPARATOR) {
	const text = String(title ?? '').replace(/\s+/g, ' ').trim();
	if (!text) return '';
	let re;
	try {
		re = new RegExp(separator);
	} catch {
		re = new RegExp(DEFAULT_SEPARATOR);
	}
	return text.split(re)[0].trim() || text;
}

/**
 * The alternate page for a language: { hreflang: url } → url | null. Exact
 * code first ('de'), then the same base language ('de-DE' for 'de', 'de' for
 * 'de-AT'). 'x-default' is never picked.
 */
export function pickAlternate(alternates, lang) {
	if (!isObj(alternates) || typeof lang !== 'string' || !lang) return null;
	const want = lang.toLowerCase();
	const entries = Object.entries(alternates).filter(([k, v]) => typeof v === 'string' && k.toLowerCase() !== 'x-default');
	const exact = entries.find(([k]) => k.toLowerCase() === want);
	if (exact) return exact[1];
	const base = want.split('-')[0];
	const same = entries.find(([k]) => k.toLowerCase().split('-')[0] === base);
	return same ? same[1] : null;
}

/** A small LRU map: get() refreshes an entry, set() drops the oldest beyond max (0 = no caching). */
export function createLru(max = DEFAULT_CACHE) {
	const map = new Map();
	return {
		get(key) {
			if (!map.has(key)) return undefined;
			const v = map.get(key);
			map.delete(key);
			map.set(key, v);
			return v;
		},
		set(key, value) {
			if (max <= 0) return;
			map.delete(key);
			map.set(key, value);
			while (map.size > max) map.delete(map.keys().next().value);
		},
		has: key => map.has(key),
		delete: key => map.delete(key),
		clear: () => map.clear(),
		get size() { return map.size; },
		keys: () => [...map.keys()]
	};
}

/* ---------- Per-window history: { list: [{ url, scroll }], idx } ---------- */

export const createHistory = () => ({ list: [], idx: -1 });

/** A new entry after the current one (forward entries are dropped). */
export function pushEntry(hist, url, scroll = 0) {
	hist.list.splice(hist.idx + 1);
	hist.list.push({ url, scroll });
	hist.idx = hist.list.length - 1;
	return hist.list[hist.idx];
}

/** Moves by delta; returns the entry or null when there is none in that direction. */
export function moveEntry(hist, delta) {
	const idx = hist.idx + delta;
	if (idx < 0 || idx >= hist.list.length) return null;
	hist.idx = idx;
	return hist.list[idx];
}

export const canBack = hist => hist.idx > 0;
export const canForward = hist => hist.idx < hist.list.length - 1;

/** A language attribute worth keeping (BCP 47 shape) or null */
export const cleanLang = v => (typeof v === 'string' && /^[a-z]{1,8}(-[a-z0-9]{1,8})*$/i.test(v.trim()) ? v.trim() : null);
