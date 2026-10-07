/* JPKCom Desktop — panels: pure helpers (colour contrast, wallpaper values, trash items, backup and reset summaries) — © Jean Pierre Kolb — MIT License

   No DOM, and the only import is the import-free core/is.js: everything here runs in Node as well, so the rules that
   decide what a stored value may be are unit-tested (tests/p03-*.test.mjs).
   The panels (settings, wallpaper, backup, trash) wrap these in the UI. */

import { isObj } from '../core/is.js';

export const HEX = /^#[0-9a-f]{6}$/i;
/* Trash item ids and type names: storage-safe, selector-safe */
export const ITEM_ID = /^[a-z0-9]{1,40}$/;
export const TYPE = /^[a-z][a-z0-9-]{0,63}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/* ---------- Colour ---------- */

/** Relative luminance (WCAG 2) of '#rrggbb' (or '#rgb') */
export function luminance(hex) {
	if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${[...hex.slice(1)].map(c => c + c).join('')}`;
	const lin = i => {
		const x = parseInt(hex.slice(i, i + 2), 16) / 255;
		return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

/** Contrast ratio (1–21) of two '#rrggbb' colours */
export function contrast(a, b) {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

/**
 * The text colour on an accent: white or black, whichever contrasts more
 * (the same rule as src/boot/theme.js, so the first paint matches).
 */
export function onAccent(hex) {
	if (!HEX.test(hex ?? '')) return '#fff';
	const lum = luminance(hex);
	return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#fff' : '#000';
}

/**
 * The accent as a non-text indicator (focus rings, the selected swatch, the current tab) on a
 * background: the accent itself when it reaches 3:1 there (WCAG 1.4.11), else mixed towards
 * black (light background) or white (dark background) in 5 % steps until it does. A light
 * custom accent such as #ffd400 is 1.4:1 on the light theme's white windows.
 */
export function accentRing(hex, bg) {
	if (!HEX.test(hex ?? '') || !HEX.test(bg ?? '')) return HEX.test(hex ?? '') ? hex : null;
	const toward = luminance(bg) > 0.18 ? 0 : 255;
	const ch = i => parseInt(hex.slice(i, i + 2), 16);
	for (let step = 0; step <= 20; step++) {
		const k = step / 20;
		const mixed = `#${[1, 3, 5].map(i => Math.round(ch(i) + (toward - ch(i)) * k).toString(16).padStart(2, '0')).join('')}`;
		if (contrast(mixed, bg) >= 3) return mixed;
	}
	return toward ? '#ffffff' : '#000000';
}

/* ---------- Wallpaper values ---------- */

/** Above this luminance white text falls below 4.5:1 (1.05 / (L + 0.05) < 4.5) */
export const LIGHT_FROM = 0.18;
const TONES = ['light', 'dark'];

/** The highest luminance of the '#rrggbb' / '#rgb' colours in a CSS background (null: none in it) */
export function brightest(css) {
	const all = String(css ?? '').match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi) ?? [];
	return all.length ? Math.max(...all.map(luminance)) : null;
}

/**
 * Whether a wallpaper is light or dark under the white menu titles and icon labels
 * (html[data-wp-tone]): a colour by its luminance, a gradient by its brighter end (the
 * bright end may lie under the menu bar or the labels), a motif by its own tone or the
 * brightest colour of its background, a picture by the tone the site gives it — 'dark'
 * when nothing tells. Pure; motif and image are the definitions of the value's id.
 */
export function wallpaperTone(v, { motif = null, image = null } = {}) {
	const tone = lum => (lum != null && lum > LIGHT_FROM ? 'light' : 'dark');
	switch (v?.type) {
		case 'color': return HEX.test(v.color ?? '') ? tone(luminance(v.color)) : 'dark';
		case 'gradient': return tone(brightest(`${v.from} ${v.to}`));
		case 'svg': return TONES.includes(motif?.tone) ? motif.tone : tone(brightest(motif?.bg));
		case 'image': return TONES.includes(image?.tone) ? image.tone : 'dark';
		default: return 'dark';
	}
}

/** Gradient directions: 'glow' is the default page background of base.css */
export const DIRS = Object.freeze(['glow', 'down', 'diag', 'radial']);

/**
 * CSS background of a gradient. glow: a light from the top; the middle stop sits a
 * third of the way from the end colour, which reproduces
 * radial-gradient(… #3c4955 0%, #1c2935 55%, #0c1925 100%) exactly (base.css paints the same).
 */
export function gradientCss(dir, a, b) {
	switch (dir) {
		case 'down': return `linear-gradient(180deg, ${a}, ${b})`;
		case 'diag': return `linear-gradient(135deg, ${a}, ${b})`;
		case 'radial': return `radial-gradient(120% 120% at 30% 20%, ${a}, ${b})`;
		default: return `radial-gradient(120% 90% at 50% 0%, ${a} 0%, color-mix(in srgb, ${a} 33.3%, ${b}) 55%, ${b} 100%)`;
	}
}

/**
 * Motif ids of the original desktop that were renamed: a stored value, an old
 * backup or a site config with the old id keeps its motif.
 */
export const LEGACY_MOTIFS = Object.freeze({ monogram: 'author-monogram', emblem: 'author-emblem', blueprint: 'author-blueprint' });

/**
 * A wallpaper value from storage or config, cleaned — or null.
 * Old motif ids (LEGACY_MOTIFS) are mapped to their new ones first.
 *   { type: 'svg', id }  { type: 'color', color }  { type: 'gradient', from, to, dir }  { type: 'image', id }
 * known.motif(id) / known.image(id): may this id be offered? (default: any valid id)
 */
export function cleanWallpaper(v, known = {}) {
	if (!isObj(v)) return null;
	const motif = known.motif ?? (id => ID.test(id));
	const image = known.image ?? (id => ID.test(id));
	if (v.type === 'svg' && typeof v.id === 'string' && Object.hasOwn(LEGACY_MOTIFS, v.id)) v = { ...v, id: LEGACY_MOTIFS[v.id] };
	if (v.type === 'svg' && typeof v.id === 'string' && ID.test(v.id) && motif(v.id)) return { type: 'svg', id: v.id };
	if (v.type === 'image' && typeof v.id === 'string' && ID.test(v.id) && image(v.id)) return { type: 'image', id: v.id };
	if (v.type === 'color' && HEX.test(v.color ?? '')) return { type: 'color', color: v.color.toLowerCase() };
	if (v.type === 'gradient' && HEX.test(v.from ?? '') && HEX.test(v.to ?? '') && DIRS.includes(v.dir)) {
		return { type: 'gradient', from: v.from.toLowerCase(), to: v.to.toLowerCase(), dir: v.dir };
	}
	return null;
}

/** A stable key of a wallpaper value (data-wp of the panel buttons, radio state of menus) */
export function wallpaperKey(v) {
	if (!v) return '';
	if (v.type === 'svg') return `svg:${v.id}`;
	if (v.type === 'image') return `image:${v.id}`;
	if (v.type === 'color') return `color:${v.color}`;
	return `gradient:${v.from}:${v.to}:${v.dir}`;
}

/* ---------- Trash ---------- */

/**
 * The stored trash ({ items: [...] }) cleaned: well-formed items younger than
 * `days`, the newest `max`. Items of types no module registered (yet) stay —
 * a module that is switched off must not lose its deleted items.
 */
export function cleanTrash(v, { now = Date.now(), days = 30, max = 200 } = {}) {
	const keep = days * 86400000;
	const list = Array.isArray(v?.items) ? v.items : [];
	const items = list.filter(x => isObj(x)
		&& typeof x.id === 'string' && ITEM_ID.test(x.id)
		&& typeof x.type === 'string' && TYPE.test(x.type)
		&& typeof x.title === 'string' && x.title.length <= 120
		&& Number.isFinite(x.deleted) && x.deleted <= now + 86400000 && now - x.deleted < keep
		&& isObj(x.data))
		.map(x => ({ id: x.id, type: x.type, title: x.title, data: x.data, deleted: x.deleted }));
	return { items: max > 0 ? items.slice(-max) : [] };
}

/** A new trash item id: time + random, base 36 */
export const trashId = (now = Date.now(), rnd = Math.random()) => now.toString(36) + rnd.toString(36).slice(2, 7).padEnd(5, '0');

/* ---------- About ---------- */

/** '2026' or '2026–2031' */
export function copyrightYears(since, year) {
	const y = String(year);
	return Number.isInteger(since) && since > 0 && since < year ? `${since}–${y}` : y;
}

/* ---------- Backup ---------- */

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

/** Today as YYYY-MM-DD (local time) for file names */
export function dateStamp(d = new Date()) {
	const p = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

/* ---------- Settings ---------- */

/**
 * Sorts by order, then keeps the LAST item per id — a contribution with the id
 * of a built-in row replaces it (built-ins come first in the input).
 */
export function mergeById(items) {
	const byId = new Map();
	for (const it of items) {
		if (!it || typeof it.id !== 'string') continue;
		byId.set(it.id, it);
	}
	return [...byId.values()].sort((a, b) => (Number.isFinite(a.order) ? a.order : 100) - (Number.isFinite(b.order) ? b.order : 100));
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
