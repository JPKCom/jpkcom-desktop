/* JPKCom Desktop — panels: pure helpers of the windows (backup and reset summaries, About texts) — © Jean Pierre Kolb — MIT License

   Loaded with the panel windows that use them (backup-window.js,
   settings-window.js, about.js), not at boot. No DOM, and the only import is
   the import-free core/is.js: everything here runs in Node as well
   (tests/p03-panels.test.mjs). */

import { isObj } from '../core/is.js';

/* ---------- About ---------- */

/** '2026' or '2026–2031' */
export function copyrightYears(since, year) {
	const y = String(year);
	return Number.isInteger(since) && since > 0 && since < year ? `${since}–${y}` : y;
}

/* ---------- Backup and reset summaries ---------- */

/**
 * Backups of the original desktop carry full storage keys ('jpkdesk-notes');
 * this desktop's documents carry names ('notes'). Strips the prefix where the
 * stripped name is known and the plain name is not in the file already.
 */
export function legacyBackup(doc, prefix, isKnown) {
	if (!isObj(doc) || !isObj(doc.data) || !prefix) return doc;
	const data = {};
	for (const [k, v] of Object.entries(doc.data)) {
		const name = k.startsWith(prefix) ? k.slice(prefix.length) : k;
		if (name !== k && (Object.hasOwn(doc.data, name) || !isKnown(name))) {
			data[k] = v;
			continue;
		}
		data[name] = v;
	}
	return { ...doc, data };
}

/* A count() of a storage key: a number (entries) or a ready text; anything else is ignored */
function countOf(k, value) {
	try {
		const c = k.count(value);
		if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return c;
		if (typeof c === 'string' && c) return c;
	} catch { /* a broken value counts as nothing */ }
	return null;
}

/**
 * What a group of keys holds, from a { name: value } map (a backup, or the
 * current values). groups: [{ id, label, keys: [{ name, label, count? }] }].
 * Per group: { id, label, kind, n?, text?, labels?, kept }
 *   kind 'none'   no key of the group in data (kept: true in a preview — the
 *                 desktop keeps what it has)
 *   kind 'count'  n entries (sum of the keys' count())
 *   kind 'text'   a ready text from a single count()
 *   kind 'list'   labels of the keys with a value (settings switches)
 */
export function summarize(groups, data, preview = false) {
	return groups.map(g => {
		const present = g.keys.filter(k => Object.hasOwn(data, k.name) && data[k.name] != null);
		const base = { id: g.id, label: g.label, kept: false };
		if (!present.length) return { ...base, kind: 'none', kept: preview };
		const counting = present.filter(k => typeof k.count === 'function');
		if (counting.length) {
			let n = 0;
			let text = null;
			for (const k of counting) {
				const c = countOf(k, data[k.name]);
				if (typeof c === 'number') n += c;
				else if (c != null) text = c;
			}
			if (text != null && counting.length === 1) return { ...base, kind: 'text', text };
			return { ...base, kind: 'count', n };
		}
		return { ...base, kind: 'list', labels: present.map(k => k.label) };
	});
}

/**
 * The state of a reset group, for its hint. keys: [{ stored, value, count?, backup }]
 *   'default'  nothing stored, nothing to count
 *   'empty'    nothing stored (or zero entries) where entries are counted
 *   'count'    n entries       'text'  a ready text from count()
 *   'stored'   device state only (backup: false keys) is stored
 *   'custom'   settings differ from the defaults
 *   'none'     the group has no keys (its own action, e.g. offline copies)
 */
export function groupState(keys) {
	if (!keys.length) return { kind: 'none' };
	const stored = keys.filter(k => k.stored);
	const counting = keys.filter(k => typeof k.count === 'function');
	if (!stored.length) return { kind: counting.length ? 'empty' : 'default' };
	if (counting.length) {
		let n = 0;
		let text = null;
		for (const k of counting) {
			if (!k.stored || k.value == null) continue;
			const c = countOf(k, k.value);
			if (typeof c === 'number') n += c;
			else if (c != null) text = c;
		}
		if (text != null && counting.length === 1) return { kind: 'text', text };
		return n ? { kind: 'count', n } : { kind: 'empty' };
	}
	return { kind: stored.every(k => k.backup === false) ? 'stored' : 'custom' };
}

/* ---------- Texts with marked-up parts ---------- */

/**
 * Splits a translated text at a placeholder value (a sentinel passed to t()) so
 * the caller can put nodes there (a name with lang spans) — the translation stays
 * one complete sentence. → ['before', PART, 'after'] with every sentinel replaced
 * by the marker object; empty strings are left out.
 */
export function splitAt(text, sentinel, marker) {
	const out = [];
	String(text).split(sentinel).forEach((piece, i) => {
		if (i > 0) out.push(marker);
		if (piece) out.push(piece);
	});
	return out;
}

/**
 * A name given as parts: 'Jean Pierre Kolb' or [{ text: 'Jean Pierre', lang: 'fr' }, { text: 'Kolb', lang: 'de' }]
 * (parts are joined with a space; a string part has no own language). → [{ text, lang|null }] or null.
 */
export function nameParts(v) {
	const LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;
	if (typeof v === 'string') return v.trim() ? [{ text: v.trim(), lang: null }] : null;
	if (!Array.isArray(v)) return null;
	const parts = v.map(p => (typeof p === 'string' ? { text: p, lang: null }
		: isObj(p) && typeof p.text === 'string' ? { text: p.text, lang: typeof p.lang === 'string' && LANG.test(p.lang) ? p.lang : null } : null))
		.filter(p => p && p.text.trim());
	return parts.length ? parts.map(p => ({ text: p.text.trim(), lang: p.lang })) : null;
}

/**
 * A value of config.about.rows: a text (a string or a language map of strings), or
 * an array of parts — texts, or { text, lang?, abbr? } (text and abbr: texts; lang:
 * a BCP 47 code) — so a site can mark an abbreviation (<abbr title>) or a phrase in
 * another language: [{ text: 'HTML', abbr: 'Hypertext Markup Language' }, ', ',
 * { text: 'Vanilla JavaScript', lang: 'en' }]. → [{ text, lang|null, abbr|null }] or
 * null when anything in it is invalid. Pure.
 */
export function rowParts(v) {
	const LANG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;
	const isTextValue = x => (typeof x === 'string' && x.length > 0 && x.length <= 500)
		|| (isObj(x) && !('text' in x) && Object.values(x).length > 0 && Object.values(x).every(y => typeof y === 'string' && y.length <= 500));
	if (isTextValue(v)) return [{ text: v, lang: null, abbr: null }];
	if (!Array.isArray(v) || !v.length || v.length > 40) return null;
	const out = [];
	for (const p of v) {
		if (isTextValue(p)) {
			out.push({ text: p, lang: null, abbr: null });
			continue;
		}
		if (!isObj(p) || !isTextValue(p.text)) return null;
		if (p.lang != null && (typeof p.lang !== 'string' || p.lang.length > 35 || !LANG.test(p.lang))) return null;
		if (p.abbr != null && !isTextValue(p.abbr)) return null;
		out.push({ text: p.text, lang: p.lang ?? null, abbr: p.abbr ?? null });
	}
	return out;
}
