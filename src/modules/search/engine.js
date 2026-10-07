/* JPKCom Desktop — Search: matching, scoring, grouping, config and provider checks — © Jean Pierre Kolb — MIT License

   The pure part of the search (no DOM, importable in Node for the tests; its one
   import is the shared src/core/text.js):

   - fold()        case, accents and ß folded away: 'Größe' → 'grosse' (core/text.js)
   - entry()       one searchable app: its folded name, name words, slug, group label, description
   - score()       every word of the query has to hit somewhere; the name counts most
   - rank()        scored hits per group, the group holding the best hit first
   - matchCombo()  'Mod+K' against a keydown event (fallback while no shortcuts service exists)
   - cleanConfig(), cleanProvider(), cleanResults()   validation of config and provider data */

/* One folding rule for Search, Catalog and the terminal (src/core/text.js: no imports, no DOM) */
import { fold } from '../../core/text.js';
import { isObj } from '../../core/is.js';

/** Case-, accent- and ß-insensitive form of a text (re-exported for the providers' ctx.fold) */
export { fold };

/** The folded words of a query */
export const queryWords = q => fold(q).split(/\s+/).filter(Boolean);

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

/**
 * A searchable entry.
 *   app     the registry entry (opened on Enter)
 *   group   the group key ('apps', 'c-<collection>')
 *   name    the shown name (current language)
 *   slug    id part without the collection prefix
 *   cat     the group/category label (current language) — matched, shown when there is no description
 *   desc    the description (current language)
 */
export function entry({ app, group, name, slug = '', cat = '', desc = '' }) {
	const n = fold(name);
	return {
		app, group, label: String(name ?? ''),
		name: n,
		words: n.split(WORD_SPLIT).filter(Boolean),
		slug: fold(slug),
		cat: fold(cat),
		desc: fold(desc),
		sub: String(desc || cat || '')
	};
}

/** Score of an entry for the folded query words (0 = no hit): name start 100, word start 80, name 60, slug 50, group 30, description 20 */
export function score(e, words) {
	let total = 0;
	for (const w of words) {
		const s = e.name.startsWith(w) ? 100
			: e.words.some(x => x.startsWith(w)) ? 80
			: e.name.includes(w) ? 60
			: e.slug.includes(w) ? 50
			: e.cat.includes(w) ? 30
			: e.desc.includes(w) ? 20 : 0;
		if (!s) return 0;
		total += s;
	}
	return total;
}

/**
 * Hits per group. groups: [{ id, max }] in their natural order; compare(a, b)
 * orders equal scores by name. → [{ group, order, items: [{ e, s }] }], the
 * group holding the best hit first (ties: natural order).
 */
export function rank(index, q, groups, compare = (a, b) => a.localeCompare(b)) {
	const words = queryWords(q);
	if (!words.length) return [];
	const hits = index.map(e => ({ e, s: score(e, words) })).filter(x => x.s)
		.sort((a, b) => b.s - a.s || compare(a.e.label, b.e.label));
	return groups
		.map((group, order) => ({ group, order, items: hits.filter(x => x.e.group === group.id).slice(0, group.max) }))
		.filter(x => x.items.length)
		.sort((a, b) => b.items[0].s - a.items[0].s || a.order - b.order);
}

/* ---------- Keyboard shortcut ---------- */

const MODS = new Set(['Mod', 'Ctrl', 'Control', 'Alt', 'Shift', 'Meta']);
export const COMBO = /^(?:(?:Mod|Ctrl|Control|Alt|Shift|Meta)\+)*(?:[A-Za-z0-9/.,;\-=]|F\d{1,2}|Enter|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;

/** Splits 'Mod+Shift+K' → { mods: Set, key: 'k' } */
export function parseCombo(combo) {
	const parts = String(combo ?? '').split(/\+(?!$)/).filter(Boolean);
	const key = parts.pop() ?? '';
	return { mods: new Set(parts.filter(p => MODS.has(p)).map(p => (p === 'Control' ? 'Ctrl' : p))), key: key === 'Space' ? ' ' : key.length === 1 ? key.toLowerCase() : key };
}

/**
 * Does a keydown event match a combo? Mod accepts ⌘ or Ctrl (as the original's
 * ⌘/Ctrl+K did on every platform); Ctrl, Meta, Alt and Shift have to match exactly.
 */
export function matchCombo(combo, e) {
	const { mods, key } = parseCombo(combo);
	if (!key) return false;
	if (mods.has('Mod') && !mods.has('Ctrl') && !mods.has('Meta')) {
		if (!e.metaKey && !e.ctrlKey) return false;
	} else if (!!e.metaKey !== mods.has('Meta') || !!e.ctrlKey !== mods.has('Ctrl')) {
		return false;
	}
	if (!!e.altKey !== mods.has('Alt') || !!e.shiftKey !== mods.has('Shift')) return false;
	const k = String(e.key ?? '');
	return (k.length === 1 ? k.toLowerCase() : k) === key;
}

/** aria-keyshortcuts value of a combo: 'Mod+K' → 'Meta+K' / 'Control+K' */
export function ariaKeys(combo, apple = false) {
	const { mods, key } = parseCombo(combo);
	if (!key) return '';
	const out = [];
	if (mods.has('Ctrl') || (mods.has('Mod') && !apple)) out.push('Control');
	if (mods.has('Meta') || (mods.has('Mod') && apple)) out.push('Meta');
	if (mods.has('Alt')) out.push('Alt');
	if (mods.has('Shift')) out.push('Shift');
	out.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key);
	return out.join('+');
}

/* ---------- Validation ---------- */

const isText = v => (typeof v === 'string' && v.length > 0) || (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/** A same-origin script path: relative or '/…', no scheme, no '//host', ending in .js or .mjs */
export const isScriptPath = p => typeof p === 'string' && p.length > 0 && p.length < 300
	&& !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('//') && !p.includes('\\') && !/\s/.test(p) && /\.m?js(\?[^#]*)?$/.test(p);

export const PAGEFIND_DEFAULTS = Object.freeze({ excerptLength: 16, maxHits: 8, label: null, order: 900 });

/**
 * Cleans config.search: { pagefind: null | { path, excerptLength, maxHits, label, order }, maxPerGroup, shortcut }.
 * Invalid values are reported through warn() and replaced by their defaults.
 */
export function cleanConfig(section, warn = () => {}) {
	const s = isObj(section) ? section : {};
	if (section != null && !isObj(section)) warn('must be an object — defaults used');
	const out = { pagefind: null, maxPerGroup: 6, shortcut: 'Mod+K' };

	if (s.maxPerGroup !== undefined) {
		if (intIn(s.maxPerGroup, 1, 50)) out.maxPerGroup = s.maxPerGroup;
		else warn(`maxPerGroup must be a whole number from 1 to 50 — ${out.maxPerGroup} used`);
	}

	if (s.shortcut === null || s.shortcut === false || s.shortcut === '') out.shortcut = null;
	else if (s.shortcut !== undefined) {
		if (typeof s.shortcut === 'string' && COMBO.test(s.shortcut)) out.shortcut = s.shortcut;
		else warn(`shortcut ${JSON.stringify(s.shortcut)} is not a key combination like 'Mod+K' — 'Mod+K' used`);
	}

	const pf = s.pagefind;
	if (pf != null && pf !== false) {
		const raw = typeof pf === 'string' ? { path: pf } : pf;
		if (!isObj(raw) || !isScriptPath(raw.path)) {
			warn('pagefind needs { path: \'<folder>/pagefind.js\' } (same origin, relative or /…) — full-text search off');
		} else {
			const p = { ...PAGEFIND_DEFAULTS, path: raw.path };
			if (raw.excerptLength !== undefined) {
				if (intIn(raw.excerptLength, 4, 60)) p.excerptLength = raw.excerptLength;
				else warn(`pagefind.excerptLength must be 4–60 — ${p.excerptLength} used`);
			}
			if (raw.maxHits !== undefined) {
				if (intIn(raw.maxHits, 1, 30)) p.maxHits = raw.maxHits;
				else warn(`pagefind.maxHits must be 1–30 — ${p.maxHits} used`);
			}
			if (raw.label != null) {
				if (isText(raw.label)) p.label = raw.label;
				else warn('pagefind.label must be a text or a { lang: text } map — default label used');
			}
			if (raw.order !== undefined) {
				if (Number.isFinite(raw.order)) p.order = raw.order;
				else warn(`pagefind.order must be a number — ${p.order} used`);
			}
			out.pagefind = p;
		}
	}
	return out;
}

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const APP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;   // as in the app registry

/**
 * Checks a provider definition (search contributions and addProvider()):
 *   { id, label, search(q, ctx) → results | Promise<results>, order = 100, max, minLength = 1, delay = 160, warm?(), available?() }
 * available() → false marks a provider as permanently unavailable (it is then not asked any more).
 * → a normalised frozen copy, or null (warned).
 */
export function cleanProvider(def, warn = () => {}) {
	if (!isObj(def) || typeof def.id !== 'string' || !PROVIDER_ID.test(def.id)) {
		warn(`a search provider needs an id [a-z][a-z0-9-]* — skipped ${String(def?.id ?? '')}`);
		return null;
	}
	if (typeof def.search !== 'function') {
		warn(`provider '${def.id}' needs a search(q, ctx) function — skipped`);
		return null;
	}
	if (!isText(def.label)) {
		warn(`provider '${def.id}' needs a label — skipped`);
		return null;
	}
	return Object.freeze({
		...def,
		order: Number.isFinite(def.order) ? def.order : 100,
		max: intIn(def.max, 1, 50) ? def.max : null,
		minLength: intIn(def.minLength, 1, 20) ? def.minLength : 1,
		delay: intIn(def.delay, 0, 2000) ? def.delay : 160,
		warm: typeof def.warm === 'function' ? def.warm : null,
		available: typeof def.available === 'function' ? def.available : null
	});
}

/**
 * Cleans what a provider returned: an array of
 *   { title, sub?: string | (string|Node)[], app?: id | entry | { icon, tint, logo, mark }, icon?, tint?,
 *     url?, run?(), external?, key? }
 * Rows without a title or without a way to open them are dropped: run(), url, an app id or an
 * app entry with an id ({ icon, tint } alone only draws the tile). → at most max rows.
 */
export function cleanResults(list, max = 8) {
	if (!Array.isArray(list)) return [];
	const out = [];
	for (const r of list) {
		if (!isObj(r)) continue;
		const title = typeof r.title === 'string' ? r.title.trim() : '';
		const opens = typeof r.run === 'function' || typeof r.url === 'string'
			|| (typeof r.app === 'string' && APP_ID.test(r.app)) || (isObj(r.app) && typeof r.app.id === 'string');
		if (!title || !opens) continue;
		const sub = typeof r.sub === 'string' ? r.sub
			: Array.isArray(r.sub) ? r.sub.filter(x => typeof x === 'string' || (x && typeof x === 'object' && typeof x.nodeType === 'number'))
			: '';
		out.push({
			title: title.slice(0, 300), sub, app: typeof r.app === 'string' || isObj(r.app) ? r.app : null,
			icon: typeof r.icon === 'string' ? r.icon : null, tint: r.tint ?? null,
			url: typeof r.url === 'string' ? r.url : null, run: typeof r.run === 'function' ? r.run : null,
			external: r.external === true, key: typeof r.key === 'string' ? r.key : null
		});
		if (out.length >= max) break;
	}
	return out;
}

/**
 * Pagefind excerpts are HTML with <mark>: tokens from a parsed body's child
 * nodes ({ name, text }) → [{ mark: boolean, text }]. Only text and marks
 * survive; a leading dash (an excerpt cut inside the title) is dropped.
 */
export function excerptParts(nodes) {
	const out = [];
	for (const [i, n] of nodes.entries()) {
		const mark = String(n.name).toUpperCase() === 'MARK';
		let text = String(n.text ?? '');
		if (!mark && i === 0) text = text.replace(/^[\s—–-]+/, '');
		if (text) out.push({ mark, text });
	}
	return out;
}
