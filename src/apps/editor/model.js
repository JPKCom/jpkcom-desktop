/* JPKCom Desktop — Editor app: draft validation, find patterns, line counting — © Jean Pierre Kolb — MIT License

   Pure (the tests import it). Storage key 'editor':
     { tabs: [{ id, text, name, dirty, pos }], current: id | null, wrap, ws }
   Before tabs, the draft was one document { text, name, dirty, pos, wrap };
   such a value becomes the first tab. */

import { isId, newId } from '../kit.js';

/** Defaults (config.editor overrides them) */
export const DEFAULTS = Object.freeze({ maxTabs: 20, maxFileBytes: 5 * 1024 * 1024, wrap: false, invisibles: true });
/** Matches the search collects at most */
export const MAX_MATCHES = 10000;
/** Matches drawn on the highlight layer */
export const MAX_MARKS = 3000;
/** Invisible-character marks per drawing */
export const MAX_WS_MARKS = 5000;
/** Lines drawn above and below the view on the invisible-character layer */
export const WS_MARGIN = 15;

/** Spaces, a tab, other spaces (no-break, en, em …), zero-width and direction marks */
export const WS_RE = /( +)|(\t)|([\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000])|([\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff])/g;
/** Class of a WS_RE match by its group: spaces, tab, other spaces, zero-width */
export const WS_CLASS = Object.freeze([null, 'ed-ws-s', 'ed-ws-t', 'ed-ws-u', 'ed-ws-z']);

/** A fresh, empty document */
export const emptyDoc = () => ({ id: newId(), text: '', name: null, dirty: false, pos: 0 });

/** One stored document → cleaned (a missing or unsafe id gets a new one), or null */
export function cleanDoc(x) {
	if (!x || typeof x !== 'object' || typeof x.text !== 'string') return null;
	return {
		id: isId(x.id) ? x.id : newId(),
		text: x.text,
		name: typeof x.name === 'string' && x.name && x.name.length <= 255 ? x.name : null,
		dirty: x.dirty === true,
		pos: Number.isInteger(x.pos) && x.pos >= 0 ? Math.min(x.pos, x.text.length) : 0
	};
}

/**
 * The stored draft → cleaned { tabs, current, wrap, ws }, or null when it holds
 * no document. opts: { maxTabs, wrap, invisibles } — the defaults for missing switches.
 */
export function cleanDraft(v, { maxTabs = DEFAULTS.maxTabs, wrap = DEFAULTS.wrap, invisibles = DEFAULTS.invisibles } = {}) {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const list = (Array.isArray(v.tabs) ? v.tabs.map(cleanDoc) : [cleanDoc(v)]).filter(Boolean);
	const seen = new Set();
	const tabs = list.filter(t => !seen.has(t.id) && seen.add(t.id)).slice(0, Math.max(1, maxTabs));
	if (!tabs.length) return null;
	return {
		tabs,
		current: isId(v.current) && seen.has(v.current) ? v.current : null,
		wrap: typeof v.wrap === 'boolean' ? v.wrap : wrap,
		ws: typeof v.ws === 'boolean' ? v.ws : invisibles
	};
}

/** Characters of all tabs of a draft (backup and reset summaries) */
export const draftChars = v => (Array.isArray(v?.tabs) ? v.tabs : []).reduce((n, d) => n + (typeof d?.text === 'string' ? d.text.length : 0), 0);

/** Lines of a text (1 for an empty one) */
export function countLines(v) {
	let n = 1;
	for (let i = v.indexOf('\n'); i !== -1; i = v.indexOf('\n', i + 1)) n++;
	return n;
}

/** Words (runs of non-space) of a text — counted without building an array of them,
   since this runs while a text of several megabytes is typed into */
export function countWords(v) {
	const re = /\S+/g;
	let n = 0;
	while (re.exec(v)) n++;
	return n;
}

/** Characters (code points) of a text: UTF-16 units minus the second half of each surrogate pair
   (the same as [...v].length — a lone surrogate counts as one — without an array per character) */
export function countChars(v) {
	let n = v.length;
	for (let i = 1; i < v.length; i++) {
		const c = v.charCodeAt(i);
		if (c >= 0xdc00 && c <= 0xdfff) {
			const p = v.charCodeAt(i - 1);
			if (p >= 0xd800 && p <= 0xdbff) n--;
		}
	}
	return n;
}

/** Line and column (1-based) of a position */
export function lineCol(v, pos) {
	return { line: countLines(v.slice(0, pos)), col: pos - v.lastIndexOf('\n', pos - 1) };
}

/** A literal text as a regular expression source */
export const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The search pattern: null without a query, undefined for an invalid regular
 * expression, else a global, multi-line RegExp (case-insensitive unless matchCase).
 */
export function pattern(q, { regex = false, matchCase = false } = {}) {
	if (!q) return null;
	try {
		return new RegExp(regex ? q : escapeRe(q), matchCase ? 'gm' : 'gim');
	} catch {
		return undefined;
	}
}

/** [[start, end], …] of every non-empty match (at most max) */
export function findMatches(text, re, max = MAX_MATCHES) {
	const out = [];
	if (!re) return out;
	re.lastIndex = 0;
	let m;
	while ((m = re.exec(text)) && out.length < max) {
		if (m[0] === '') {
			re.lastIndex++;
			continue;
		}
		out.push([m.index, m.index + m[0].length]);
	}
	return out;
}

/** In plain mode the replacement is literal, so '$' must not act as a pattern */
export const replacement = (text, regex) => (regex ? text : text.replace(/\$/g, '$$$$'));

/** Binary data? A NUL character does not occur in text files */
export const isBinary = text => text.includes('\u0000');
