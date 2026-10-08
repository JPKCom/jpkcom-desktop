/* JPKCom Desktop — icon data rules: allowlist, site icon set format and paths (pure) — © Jean Pierre Kolb — MIT License

   One truth for every icon definition, in the browser and in the tools (importable in Node,
   no DOM access):

     allowlist   the element tags and attributes a <symbol> may get, for every pack — the
                 generated Tabler subset, the custom glyphs, site icon sets and runtime packs
                 (Desk.icons.add); src/core/icons.js builds symbols only through it
     site sets   config.iconSets: JSON files { format, name, license, icons } (docs/ARCHITECTURE.md
                 §13); cleanIconSet() checks one parsed file — main.js before it registers the set,
                 tools/validate-manifest.mjs and tools/seal-vault.mjs on the same rules
     paths       SET_PATH: where a set may live (relative to the installation root; letters, digits,
                 . _ - / only, no segment starting with '.', ends in .json). src/core/config.js,
                 the generated src/boot/preload.js and sw.js (inline copy, checked by a test) use it
     replacing   config.iconReplace: { project icon id: icon id } — cleanIconReplace() checks the
                 shape (src/core/config.js), resolveIconReplace() which pairs can be used once the
                 sets are registered (src/core/icons.js setIconReplace(), the validator has its own
                 messages on the same rules)

   Definition format (docs/ARCHITECTURE.md §13):
     { k?: 'o' | 'f' | 'd', vb?: '0 0 24 24', a?: { attr: value }, e: [element], e2?: [element] }
   an element is a string (<path d>) or [tag, attrs]. */

export const SET_FORMAT = 'jpkcom-desktop-icons/1';
export const MAX_SETS = 8;
export const MAX_SET_BYTES = 2 * 1024 * 1024;
export const MAX_SET_ICONS = 5000;
export const LARGE_SET_BYTES = 256 * 1024;          // validator warning
/* The project's own icon namespaces — fixed, they do not grow with new parts or modules (§13) */
export const RESERVED_ICON_PREFIXES = Object.freeze(['ti', 'tif', 'wc', 'tile', 'jpk']);
/* DOM id of a sprite symbol: 'i-' + icon id (no other element id starts with 'i-') */
export const SYMBOL_ID_PREFIX = 'i-';
export const SET_PATH = /^(?!\/)(?!.*\/\/)(?!(?:.*\/)?\.)[A-Za-z0-9._\/-]{1,251}\.json$/;
export const SET_ICON_ID = /^[a-z][a-z0-9]{1,11}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ICON_ID = 64;
export const MAX_ELEMENTS = 64;                     // per layer (e, e2) of a set icon
export const MAX_VALUE = 64 * 1024;                 // characters of one attribute value
export const MAX_TEXT = 200;                        // name and license of a set
/* config.iconReplace: the project ids a site may replace — Tabler and the custom window/tile glyphs, never
   the author's monogram (jpk, jpk-…, a brand asset) and never a set id (the site's own anyway) */
export const REPLACEABLE_ID = /^(?:ti|tif|wc|tile)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
/* Any icon id (the rule of icons.add()) — what a replacement may point at */
export const ICON_ID = /^[a-z][a-z0-9-]*$/;
export const MAX_REPLACE = 500;
export const ICON_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
export const ICON_ATTRS = new Set([
	'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points',
	'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
	'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule',
	'clip-rule', 'transform', 'vector-effect', 'paint-order', 'class'
]);
export const VIEWBOX = /^-?\d*\.?\d+(?:[ ,]+-?\d*\.?\d+){3}$/;
export const DEFAULT_VIEWBOX = '0 0 24 24';
const KINDS = new Set(['o', 'f', 'd']);
const CLASS = /^[a-z][a-z0-9-]*(?: +[a-z][a-z0-9-]*)*$/;
/* CSS functions a presentation value may call: the transform and colour functions. Everything else is
   refused — url() and src() (references), var() and env() (they reach custom properties, which may hold a
   url()), and any name the browser could learn later. A backslash is refused as well: the CSS tokenizer
   resolves escapes inside a name ('u\72l(' is url(), '\76ar(' is var()) before it looks at it. */
const CSS_FUNCTIONS = new Set(['matrix', 'translate', 'scale', 'rotate', 'skewx', 'skewy',
	'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);
const FN_CALL = /([A-Za-z0-9_-]*)\s*\(/g;

/** A text without a backslash and without a CSS function outside CSS_FUNCTIONS */
function plainText(v) {
	if (v.includes('\\')) return false;
	for (const [, name] of v.matchAll(FN_CALL)) if (!CSS_FUNCTIONS.has(name.toLowerCase())) return false;
	return true;
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A path from config.iconSets that may be loaded (SET_PATH) */
export const isSetPath = v => typeof v === 'string' && SET_PATH.test(v);

/** 'acme-rocket' → 'acme' ('' for an id without '-') */
export const iconPrefix = id => (id.includes('-') ? id.slice(0, id.indexOf('-')) : '');

/** One attribute value: a string (≤ 64 KiB, plainText: no url(), no backslash) or a finite number */
function safeValue(name, v) {
	if (typeof v === 'number') return Number.isFinite(v);
	if (typeof v !== 'string' || v.length > MAX_VALUE || !plainText(v)) return false;
	return name !== 'class' || CLASS.test(v.trim());
}

/** An attribute map → a copy with allowed names and safe values only; dropped names go to `dropped` */
export function safeAttrs(attrs, dropped = []) {
	const out = {};
	if (!isObj(attrs)) {
		if (attrs !== undefined) dropped.push('attributes');
		return out;
	}
	for (const [name, v] of Object.entries(attrs)) {
		if (ICON_ATTRS.has(name) && safeValue(name, v)) out[name] = name === 'class' ? v.trim() : v;
		else dropped.push(name);
	}
	return out;
}

/** One element → [tag, attrs] (through safeAttrs) or null; dropped tags/names go to `dropped` */
export function safeElement(entry, dropped = []) {
	if (typeof entry === 'string') {
		if (entry.length > MAX_VALUE || !plainText(entry)) {
			dropped.push('d');
			return null;
		}
		return ['path', { d: entry }];
	}
	if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
		dropped.push('element');
		return null;
	}
	const [tag, attrs] = entry;
	if (!ICON_TAGS.has(tag)) {
		dropped.push(`<${tag.slice(0, 40)}>`);
		return null;
	}
	return [tag, attrs === undefined ? {} : safeAttrs(attrs, dropped)];
}

/** A viewBox → itself when valid (four numbers, width and height > 0), else null */
export function safeViewBox(vb) {
	if (typeof vb !== 'string' || vb.length > 200 || !VIEWBOX.test(vb.trim())) return null;
	const [, , w, h] = vb.trim().split(/[ ,]+/).map(Number);
	return w > 0 && h > 0 ? vb : null;
}

/** Why a definition cannot be used at all (shape, kind, layers, viewBox), or null */
function shapeProblem(def, { maxElements = Infinity } = {}) {
	if (!isObj(def)) return 'not an object';
	const k = def.k ?? 'o';
	if (!KINDS.has(k)) return `k must be 'o', 'f' or 'd' (${JSON.stringify(def.k)})`;
	if (def.e2 !== undefined && k !== 'd') return "e2 (a secondary layer) needs k: 'd'";
	for (const layer of ['e', 'e2']) {
		const v = def[layer];
		if (v === undefined) continue;
		if (!Array.isArray(v)) return `${layer} must be an array of elements`;
		if (v.length > maxElements) return `${layer} has ${v.length} elements, at most ${maxElements}`;
	}
	if (k === 'd' ? !Array.isArray(def.e) && !Array.isArray(def.e2) : !Array.isArray(def.e)) return 'e (the elements) is missing';
	if (def.vb !== undefined && !safeViewBox(def.vb)) return `viewBox ${JSON.stringify(def.vb)} needs four numbers with a positive width and height`;
	if (def.a !== undefined && !isObj(def.a)) return 'a must be an object of symbol attributes';
	return null;
}

/**
 * One definition → a cleaned copy or null (k, vb, a, e, e2 — every element and a through the
 * allowlist; null when the shape is wrong or not a single element is left); dropped items go to `dropped`.
 */
export function cleanIconDef(def, dropped = []) {
	if (shapeProblem(def)) return null;
	const layer = list => (list ?? []).flatMap(entry => {
		const el = safeElement(entry, dropped);
		if (!el) return [];
		/* a plain path stays a string (the compact form of the generated subset) */
		return [el[0] === 'path' && typeof entry === 'string' ? entry : el];
	});
	const e = layer(def.e);
	const e2 = def.k === 'd' ? layer(def.e2) : [];
	if (!e.length && !e2.length) return null;
	const out = {};
	if (def.k !== undefined) out.k = def.k;
	if (def.vb !== undefined) out.vb = def.vb;
	if (def.a !== undefined) out.a = safeAttrs(def.a, dropped);
	out.e = e;
	if (def.k === 'd' && def.e2 !== undefined) out.e2 = e2;
	return out;
}

/**
 * A parsed set file → { name, license, icons: { id: def }, problems: [string], fatal: string | null }
 * opts: { taken: Set<id> (ids already registered by earlier sets) }
 * fatal: not an object / wrong format / no icons object / too many icons → the set is refused as a whole.
 */
export function cleanIconSet(json, { taken = new Set() } = {}) {
	const result = { name: null, license: null, icons: {}, problems: [], fatal: null };
	if (!isObj(json)) {
		result.fatal = 'not a JSON object';
		return result;
	}
	if (json.format !== SET_FORMAT) {
		result.fatal = `format must be "${SET_FORMAT}" (${JSON.stringify(json.format ?? null)})`;
		return result;
	}
	if (!isObj(json.icons)) {
		result.fatal = 'icons must be an object { id: definition }';
		return result;
	}
	const entries = Object.entries(json.icons);
	if (entries.length > MAX_SET_ICONS) {
		result.fatal = `${entries.length} icons, at most ${MAX_SET_ICONS}`;
		return result;
	}
	for (const key of ['name', 'license']) {
		const v = json[key];
		if (typeof v === 'string' && v.length <= MAX_TEXT) result[key] = v;
		else if (v !== undefined) result.problems.push(`${key} must be a text of at most ${MAX_TEXT} characters`);
	}
	for (const [id, def] of entries) {
		if (id.length > MAX_ICON_ID || !SET_ICON_ID.test(id)) {
			result.problems.push(`'${id.slice(0, MAX_ICON_ID + 8)}': not a set icon id ('<prefix>-<name>': a–z, 0–9 and '-', at most ${MAX_ICON_ID} characters) — skipped`);
			continue;
		}
		if (RESERVED_ICON_PREFIXES.includes(iconPrefix(id))) {
			result.problems.push(`'${id}': the prefix '${iconPrefix(id)}' belongs to the project (${RESERVED_ICON_PREFIXES.join(', ')}) — skipped`);
			continue;
		}
		if (taken.has(id)) {
			result.problems.push(`'${id}': an earlier icon set brings this id already — skipped`);
			continue;
		}
		const shape = shapeProblem(def, { maxElements: MAX_ELEMENTS });
		if (shape) {
			result.problems.push(`'${id}': ${shape} — skipped`);
			continue;
		}
		const dropped = [];
		const clean = cleanIconDef(def, dropped);
		if (dropped.length) result.problems.push(`'${id}': dropped ${[...new Set(dropped)].join(', ')}`);
		if (!clean) {
			result.problems.push(`'${id}': no drawable element left — skipped`);
			continue;
		}
		result.icons[id] = clean;
	}
	return result;
}

/**
 * config.iconReplace → a clean { from: to } (the shape only; whether the icons exist is known at boot).
 * A key that is not REPLACEABLE_ID, a value that is not an ICON_ID or equals its key → warn + skipped;
 * at most MAX_REPLACE pairs. map must be an object (src/core/config.js checks that first).
 */
export function cleanIconReplace(map, warn = () => {}) {
	const out = {};
	if (!isObj(map)) return out;
	for (const [from, to] of Object.entries(map)) {
		if (from.length > MAX_ICON_ID || !REPLACEABLE_ID.test(from)) {
			warn(`config.iconReplace: '${from.slice(0, MAX_ICON_ID + 8)}' is not a replaceable icon id (ti-…, tif-…, wc-…, tile-…; not jpk) — skipped`);
			continue;
		}
		if (typeof to !== 'string' || to.length > MAX_ICON_ID || !ICON_ID.test(to)) {
			warn(`config.iconReplace['${from}'] must be an icon id ('acme-cog') — skipped ${JSON.stringify(to)?.slice(0, MAX_ICON_ID + 8)}`);
			continue;
		}
		if (to === from) {
			warn(`config.iconReplace['${from}'] replaces the icon by itself — skipped`);
			continue;
		}
		if (Object.keys(out).length >= MAX_REPLACE) {
			warn(`config.iconReplace: more than ${MAX_REPLACE} pairs — '${from}' and the rest skipped`);
			break;
		}
		out[from] = to;
	}
	return out;
}

/**
 * A cleaned config.iconReplace → { pairs: [[from, to]], problems: [string] }; known(id) tells whether an icon
 * exists (after the site icon sets are registered). A pair with an unknown key or target is left out (the
 * original glyph stays); a target that is the key of a kept pair itself stays in (one step, not chained) with
 * a problem — a target whose own pair was left out is not replaced, so that is no chain.
 */
export function resolveIconReplace(map, known) {
	const pairs = [];
	const problems = [];
	for (const [from, to] of Object.entries(isObj(map) ? map : {})) {
		if (!known(from)) {
			problems.push(`'${from}' is not a known icon (src/icons/tabler.js, src/icons/custom.js) — nothing to replace; run npm run icons`);
			continue;
		}
		if (!known(to)) {
			problems.push(`'${from}' → '${to}': '${to}' is not a known icon (is its site icon set loaded?) — '${from}' stays`);
			continue;
		}
		pairs.push([from, to]);
	}
	/* second pass: only a kept pair makes its target a replaced icon */
	const replaced = new Set(pairs.map(([from]) => from));
	for (const [from, to] of pairs) {
		if (replaced.has(to)) problems.push(`'${from}' → '${to}': '${to}' is replaced itself — replacements are not chained, '${from}' shows '${to}'`);
	}
	return { pairs, problems };
}
