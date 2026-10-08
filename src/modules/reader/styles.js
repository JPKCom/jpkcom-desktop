/* JPKCom Desktop — Reader: code colours — the inline-style allowlist and contrast guard (pure) — © Jean Pierre Kolb — MIT License

   A fetched page's style="" text is never applied. Inside config.reader.styleScope
   (default 'pre, code') sanitize.js hands it to parseStyle(), which keeps a small
   allowlist and writes every value itself:

     color, background-color (background when it is one plain colour)   plain colours
     font-style        normal | italic | oblique
     font-weight       normal | bold | bolder | lighter | 1–1000
     text-decoration-line (text-decoration)   none | underline | overline | line-through
     --<styleVars>…    custom properties with the configured prefix     plain colours

   Plain colours: #rgb #rgba #rrggbb #rrggbbaa, rgb[a](), hsl[a]() (comma or space
   syntax, '/ alpha'), CSS named colours. Never url(), var(), calc(), env(), image
   functions, currentcolor, system colours, or a layout/position/size/display
   property. A backslash, comment, quote, '<', '>', '{', '}', '@' or '!' anywhere
   refuses the whole attribute (no escape tricks, no !important, no differential
   to the browser's CSS parser).

   guardPair() is the contrast guard: a kept text/background pair must reach
   MIN_CONTRAST, so a page cannot hide text in a code sample (a command coloured
   like its background). extract.js applies the result through CSSOM, writes the
   checked text colour on every element that keeps a colour, and marks it so that
   reader.css lets its content inherit that colour (a link inside takes no desktop
   link colour on a background the page chose); tintPair() counts the translucent
   backgrounds of mark/kbd in between.

   No DOM, no imports — tests/p04-reader.test.mjs checks it in Node. */

/** WCAG contrast ratio a kept colour pair must reach (2:1 — plainly visible, dim comments stay) */
export const MIN_CONTRAST = 2;
/** The code block's surface when the probe finds none (the shipped --reader-code-bg / island --reader-text) */
export const CODE_SURFACE = Object.freeze({
	bg: Object.freeze({ r: 0x11, g: 0x17, b: 0x1e, a: 1 }),
	fg: Object.freeze({ r: 0xdd, g: 0xe5, b: 0xec, a: 1 })
});

const MAX_STYLE = 2000;                     // longer style attributes are refused
const REFUSE = /[\\"'<>{}@!]|\/\*/;         // escapes, strings, comments, nesting, at-rules, !important
const VAR_NAME = /^--[a-z0-9-]+$/;
const NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/* CSS named colours (CSS Color 4), 'name:rrggbb' */
const NAMED = new Map(('aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc '
	+ 'bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a burlywood:deb887 '
	+ 'cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 cornflowerblue:6495ed cornsilk:fff8dc '
	+ 'crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 '
	+ 'darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 '
	+ 'darkorchid:9932cc darkred:8b0000 darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b '
	+ 'darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 '
	+ 'deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 '
	+ 'forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 '
	+ 'gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 hotpink:ff69b4 indianred:cd5c5c '
	+ 'indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 '
	+ 'lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 '
	+ 'lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 lightsalmon:ffa07a '
	+ 'lightseagreen:20b2aa lightskyblue:87cefa lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de '
	+ 'lightyellow:ffffe0 lime:00ff00 limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 '
	+ 'mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371 '
	+ 'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 '
	+ 'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 '
	+ 'oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500 orchid:da70d6 '
	+ 'palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 '
	+ 'peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 '
	+ 'red:ff0000 rosybrown:bc8f8f royalblue:4169e1 saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 '
	+ 'seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd '
	+ 'slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 '
	+ 'thistle:d8bfd8 tomato:ff6347 turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 '
	+ 'yellow:ffff00 yellowgreen:9acd32').split(' ').map(e => e.split(':')));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = v => Math.round(v * 1000) / 1000;

/* A number or percentage → 0–max ('%' of max); null when it is neither */
function channel(token, max) {
	const pct = token.endsWith('%');
	const raw = pct ? token.slice(0, -1) : token;
	if (!NUM.test(raw)) return null;
	const n = Number(raw);
	return clamp(pct ? (n / 100) * max : n, 0, max);
}

/* Alpha: a number 0–1 or a percentage; missing = opaque */
const alphaOf = token => (token == null ? 1 : channel(token, 1));

function hue(token) {
	const raw = token.endsWith('deg') ? token.slice(0, -3) : token;
	if (!NUM.test(raw)) return null;
	return ((Number(raw) % 360) + 360) % 360;
}

function hslToRgb(h, s, l) {
	const f = n => {
		const k = (n + h / 30) % 12;
		const a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}

/* The arguments of rgb()/hsl(): legacy 'a, b, c[, d]' or modern 'a b c[ / d]' → [a, b, c, d|undefined] | null */
function args(inner) {
	if (!/^[0-9a-z.%\s,/+-]*$/.test(inner)) return null;
	if (inner.includes(',')) {
		if (inner.includes('/')) return null;
		const parts = inner.split(',').map(p => p.trim());
		return parts.length === 3 || parts.length === 4 ? parts : null;
	}
	const [main, alpha, extra] = inner.split('/').map(p => p.trim());
	if (extra !== undefined || alpha === '') return null;
	const parts = main.split(/\s+/).filter(Boolean);
	return parts.length === 3 ? [...parts, alpha] : null;
}

/**
 * A plain colour → { r, g, b, a } (r/g/b 0–255 integers, a 0–1), or null for anything
 * else (var(), url(), calc(), currentcolor, transparent, system colours, colour spaces …).
 */
export function parseColor(value) {
	const v = String(value ?? '').trim().toLowerCase();
	if (!v || v.length > 64) return null;
	const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
	if (hex) {
		let d = hex[1];
		if (d.length <= 4) d = [...d].map(c => c + c).join('');
		const n = i => parseInt(d.slice(i, i + 2), 16);
		return { r: n(0), g: n(2), b: n(4), a: d.length === 8 ? round3(n(6) / 255) : 1 };
	}
	if (NAMED.has(v)) return parseColor(`#${NAMED.get(v)}`);
	const fn = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(v);
	if (!fn) return null;
	const parts = args(fn[2]);
	if (!parts) return null;
	const a = alphaOf(parts[3]);
	if (a == null) return null;
	if (fn[1].startsWith('rgb')) {
		const [r, g, b] = parts.slice(0, 3).map(p => channel(p, 255));
		if (r == null || g == null || b == null) return null;
		return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: round3(a) };
	}
	const h = hue(parts[0]);
	const [s, l] = parts.slice(1, 3).map(p => channel(p.endsWith('%') ? p : `${p}%`, 1));
	if (h == null || s == null || l == null) return null;
	const [r, g, b] = hslToRgb(h, s, l);
	return { r, g, b, a: round3(a) };
}

/** The canonical text of a parsed colour: '#rrggbb' (opaque) or 'rgb(r g b / a)' */
export function formatColor(c) {
	if (c.a >= 1) return `#${[c.r, c.g, c.b].map(n => n.toString(16).padStart(2, '0')).join('')}`;
	return `rgb(${c.r} ${c.g} ${c.b} / ${round3(c.a)})`;
}

/** top over an opaque colour below → opaque */
export function blend(top, below) {
	const a = top.a;
	const mix = k => Math.round(top[k] * a + below[k] * (1 - a));
	return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
}

const lin = v => {
	const s = v / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

/** WCAG contrast ratio of two opaque colours (1–21) */
export function contrast(x, y) {
	const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
	return (hi + 0.05) / (lo + 0.05);
}

/* One allowlisted declaration → [property, canonical value] | { color } | { bg } | null */
function declaration(name, value, vars) {
	if (name.startsWith('--')) {
		if (!vars || !name.startsWith(vars) || name.length === vars.length || name.length > 64 || !VAR_NAME.test(name)) return null;
		const c = parseColor(value);
		return c ? [name, formatColor(c)] : null;
	}
	const prop = name.toLowerCase();
	const v = value.toLowerCase();
	switch (prop) {
		case 'color': {
			const c = parseColor(v);
			return c ? { color: c } : null;
		}
		case 'background-color':
		case 'background': {
			const c = parseColor(v);
			return c ? { bg: c } : null;
		}
		case 'font-style':
			return /^(normal|italic|oblique)$/.test(v) ? ['font-style', v] : null;
		case 'font-weight': {
			if (/^(normal|bold|bolder|lighter)$/.test(v)) return ['font-weight', v];
			const n = /^\d{1,4}$/.test(v) ? Number(v) : NaN;
			return n >= 1 && n <= 1000 ? ['font-weight', String(n)] : null;
		}
		case 'text-decoration':
		case 'text-decoration-line': {
			const words = v.split(/\s+/).filter(Boolean);
			if (words.length === 1 && words[0] === 'none') return ['text-decoration-line', 'none'];
			const ok = words.length > 0 && words.length <= 3 && new Set(words).size === words.length
				&& words.every(w => w === 'underline' || w === 'overline' || w === 'line-through');
			return ok ? ['text-decoration-line', words.join(' ')] : null;
		}
		default:
			return null;
	}
}

/**
 * The allowlisted part of a style attribute's text.
 *   opts.vars  custom-property prefix (config.reader.styleVars) or null
 * → { color, bg, props: [[property, value], …] } (color/bg: parsed colours or null;
 *   props: the other declarations, canonical) — null when nothing is kept or the
 *   attribute is refused as a whole.
 */
export function parseStyle(text, { vars = null } = {}) {
	const src = String(text ?? '');
	if (!src.trim() || src.length > MAX_STYLE || REFUSE.test(src)) return null;
	let color = null;
	let bg = null;
	const props = new Map();
	for (const part of src.split(';')) {
		const i = part.indexOf(':');
		if (i < 1) continue;
		const name = part.slice(0, i).trim();
		const value = part.slice(i + 1).trim();
		if (!name || !value) continue;
		const d = declaration(name, value, vars);
		if (!d) continue;
		if (Array.isArray(d)) props.set(d[0], d[1]);
		else if (d.color) color = d.color;
		else bg = d.bg;
	}
	if (!color && !bg && !props.size) return null;
	return { color, bg, props: [...props] };
}

/**
 * A pair with the translucent stylesheet backgrounds of the elements between (mark, kbd —
 * outermost first) laid over its background → { fg, bg }; null stays null, an unknown
 * background stays unknown.
 */
export function tintPair(pair, tints = []) {
	if (!pair) return null;
	const fg = pair.fg ?? null;
	const bg = pair.bg ?? null;
	return { fg, bg: bg ? tints.reduce((below, c) => blend(c, below), bg) : null };
}

/**
 * The contrast guard for one element.
 *   own  { color, bg } — the element's kept colours (parsed, either may be null)
 *   up   { fg, bg } — the opaque pair it sits on (its nearest styled ancestor's result, or the
 *        code block's surface); null or nulls when that is unknown (outside a code block)
 * → { keep, fg, bg }: keep = its color/background-color may be set; fg/bg = the pair its
 *   descendants sit on (null when unknown).
 */
export function guardPair(own, up) {
	const upFg = up?.fg ?? null;
	const upBg = up?.bg ?? null;
	if (!own?.color && !own?.bg) return { keep: true, fg: upFg, bg: upBg };
	let bg = upBg;
	if (own.bg) bg = own.bg.a >= 1 ? own.bg : upBg ? blend(own.bg, upBg) : null;
	let fg = own.color ?? upFg;
	if (fg && bg && fg.a < 1) fg = blend(fg, bg);
	if (!fg || !bg || contrast(fg, bg) < MIN_CONTRAST) return { keep: false, fg: upFg, bg: upBg };
	return { keep: true, fg, bg };
}
