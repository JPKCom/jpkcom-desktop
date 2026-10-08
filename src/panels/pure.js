/* JPKCom Desktop — panels: pure helpers (colour contrast, wallpaper values, trash items, file dates, row order) — © Jean Pierre Kolb — MIT License

   No DOM, and the only import is the import-free core/is.js: everything here runs in Node as well, so the rules that
   decide what a stored value may be are unit-tested (tests/p03-*.test.mjs).
   The panels (settings, wallpaper, backup, trash) wrap these in the UI. What only
   their windows need (summaries, name and row parts) is pure-window.js. */

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

/* ---------- Backup ---------- */

/** Today as YYYY-MM-DD (local time) for file names */
export function dateStamp(d = new Date()) {
	const p = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
