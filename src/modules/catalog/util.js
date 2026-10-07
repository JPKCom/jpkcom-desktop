/* JPKCom Desktop — Catalog: pure helpers (search matching, grid keys) — © Jean Pierre Kolb — MIT License

   No DOM; the only import is the shared src/core/text.js (no imports of its own) —
   tests/p04-catalog.test.mjs checks these in Node. URLs from data are checked with the
   shared rule of src/core/url.js (isSafeUrl), not with a copy here. */

import { fold } from '../../core/text.js';

/** Folds text for matching — the rule Search and the terminal use too: lower case with the
   language's rules, no diacritics ('Ärger' → 'arger'), 'ß' → 'ss' (src/core/text.js) */
export { fold };

/** True when every word of the query occurs in one of the fields (folded). */
export function matches(query, fields, locale) {
	const words = fold(query, locale).split(/\s+/).filter(Boolean);
	if (!words.length) return true;
	const hay = fold(fields.filter(Boolean).join(' '), locale);
	return words.every(w => hay.includes(w));
}

/**
 * Arrow-key movement in a wrapping grid. → the new index, or null when the key
 * does not move. columns ≥ 1; rtl mirrors left/right.
 */
export function gridMove(index, key, count, columns, rtl = false) {
	if (count <= 0) return null;
	const cols = Math.max(1, columns | 0);
	const i = Math.min(Math.max(index, 0), count - 1);
	const right = rtl ? 'ArrowLeft' : 'ArrowRight';
	const left = rtl ? 'ArrowRight' : 'ArrowLeft';
	switch (key) {
		case right: return Math.min(i + 1, count - 1);
		case left: return Math.max(i - 1, 0);
		case 'ArrowDown': return i + cols < count ? i + cols : i;
		case 'ArrowUp': return i - cols >= 0 ? i - cols : i;
		case 'Home': return 0;
		case 'End': return count - 1;
		case 'PageDown': return Math.min(i + cols * 3, count - 1);
		case 'PageUp': return Math.max(i - cols * 3, 0);
		default: return null;
	}
}

/** Columns of a grid from the items' top offsets (all items of the first row share it). */
export function columnsOf(tops) {
	if (!tops.length) return 1;
	let n = 1;
	while (n < tops.length && Math.abs(tops[n] - tops[0]) < 2) n++;
	return n;
}
