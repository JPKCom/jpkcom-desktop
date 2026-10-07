/* JPKCom Desktop — Reader: allowlist sanitiser for fetched HTML — © Jean Pierre Kolb — MIT License

   Foreign HTML is parsed inert (DOMParser, scripts never run, images never
   load) and cleaned here BEFORE it is imported into the desktop document:

   - elements: an ALLOWLIST. Dangerous ones (script, style, iframe, object,
     embed, base, link, meta, form controls, template, SVG animation, …) go
     with their content; unknown wrappers (font, center, custom elements, …)
     are unwrapped so their text stays; [hidden] and role=menu go (as in the
     original: collapsed navigation is no content)
   - attributes: an ALLOWLIST per element. Never style, on*, data-*, target;
     tabindex only on <pre> (scrollable code)
   - ids get a per-window prefix (no collision with the desktop or a second
     Reader window), idrefs (aria-labelledby, for, headers, …) and local links
     (#x, url(#x) in SVG) follow it; classes get a 'c-' prefix, so no page
     class can pick up a desktop style (the Reader's own reader-… classes
     such as reader-lead stay, as in the original)
   - URLs are re-resolved against the page (config.site.hosts count as this
     origin) and checked: links http(s)/mailto/tel, media http(s) (images
     also data:image/…), SVG references only within the page
   - lang, dir, abbr and title stay (accessibility as on the original page)

   The pure helpers are exported for tests/p04-reader.test.mjs. */

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

/* Removed together with everything inside */
const DROP = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
	'link', 'meta', 'base', 'title', 'head', 'form', 'input', 'select', 'option', 'optgroup', 'datalist', 'textarea', 'button',
	'dialog', 'canvas', 'portal', 'slot', 'map', 'area', 'param', 'output', 'fencedframe', 'search']);

/* Kept (their attributes are cleaned); anything else in HTML is unwrapped */
const ALLOW = new Set(['a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption',
	'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
	'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'i', 'img', 'ins', 'kbd', 'label', 'li', 'main',
	'mark', 'nav', 'ol', 'p', 'picture', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small', 'source', 'span',
	'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'u', 'ul',
	'var', 'video', 'wbr']);

/* SVG: drawing elements only — no animate/set/animateMotion/animateTransform/discard,
   no script/style, no foreignObject (HTML inside), no image/feImage (external fetches) */
const SVG_ALLOW = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan',
	'title', 'desc', 'defs', 'use', 'symbol', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'marker']);
const SVG_UNWRAP = new Set(['a', 'switch']);

const GLOBAL_ATTRS = new Set(['title', 'lang', 'dir', 'role', 'translate']);
const ELEMENT_ATTRS = {
	a: ['href', 'hreflang'],
	img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height'],
	source: ['src', 'srcset', 'sizes', 'type', 'media', 'width', 'height'],
	video: ['src', 'poster', 'controls', 'loop', 'muted', 'playsinline', 'preload', 'width', 'height'],
	audio: ['src', 'controls', 'loop', 'muted', 'preload'],
	track: ['src', 'kind', 'srclang', 'label', 'default'],
	td: ['colspan', 'rowspan', 'headers', 'abbr'],
	th: ['colspan', 'rowspan', 'headers', 'scope', 'abbr'],
	col: ['span'],
	colgroup: ['span'],
	ol: ['start', 'reversed', 'type'],
	li: ['value'],
	time: ['datetime'],
	data: ['value'],
	del: ['cite', 'datetime'],
	ins: ['cite', 'datetime'],
	blockquote: ['cite'],
	q: ['cite'],
	details: ['open'],
	label: ['for']
};
const SVG_ATTRS = new Set(['viewbox', 'xmlns', 'xmlns:xlink', 'version', 'preserveaspectratio', 'width', 'height', 'x', 'y',
	'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points', 'pathlength', 'transform', 'fill', 'fill-rule',
	'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
	'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-rule', 'clip-path', 'clippathunits', 'mask', 'maskunits',
	'maskcontentunits', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod',
	'patternunits', 'patterncontentunits', 'patterntransform', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient',
	'markerunits', 'marker-start', 'marker-mid', 'marker-end', 'text-anchor', 'dominant-baseline', 'font-size', 'font-family',
	'font-weight', 'font-style', 'letter-spacing', 'dx', 'dy', 'visibility', 'display', 'vector-effect', 'shape-rendering',
	'focusable', 'aria-hidden', 'href', 'xlink:href']);

const IDREF_ATTRS = new Set(['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant',
	'aria-details', 'aria-errormessage', 'aria-flowto', 'for', 'headers']);
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'poster', 'cite']);

/* ---------- Pure helpers (tested in Node) ---------- */

/**
 * Page classes get a 'c-' prefix, except the Reader's own 'reader-…' classes
 * (a page may use reader-lead or reader-hero, as in the original — not
 * reader-page, the window's own container); tokens with odd characters are
 * dropped (max 24)
 */
export function mapClasses(value) {
	return String(value ?? '').split(/\s+/)
		.filter(c => /^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(c))
		.slice(0, 24)
		.map(c => (c.startsWith('reader-') && c !== 'reader-page' ? c : `c-${c}`))
		.join(' ');
}

/** id references follow the per-window id prefix */
export const prefixIdrefs = (value, prefix) => String(value ?? '').split(/\s+/).filter(Boolean).map(v => prefix + v).join(' ');

/**
 * SVG paint/clip/mask/marker values: url(#x) → url(#<prefix>x); any other url()
 * (another document, data:, javascript:) → null (the attribute goes).
 */
export function rewriteUrlRefs(value, prefix) {
	const v = String(value ?? '');
	if (!/url\s*\(/i.test(v)) return /javascript:/i.test(v) ? null : v;
	let bad = false;
	const out = v.replace(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, ref) => {
		if (!ref.startsWith('#') || ref.length < 2) {
			bad = true;
			return m;
		}
		return `url(#${prefix}${ref.slice(1)})`;
	});
	return bad || /url\s*\(/i.test(out.replace(/url\(#[^)]*\)/gi, '')) ? null : out;
}

/**
 * A URL attribute after cleaning, or null when it must go.
 *   name    attribute name (href, xlink:href, src, poster, cite)
 *   tag     element's local name (lower case); svg: true for SVG elements
 *   resolve(raw, base) → URL | null   (router.resolveUrl: site hosts count as this origin)
 */
export function rewriteUrl(name, value, { tag = '', svg = false, base, prefix = '', resolve } = {}) {
	const v = String(value ?? '').trim();
	if (!v) return null;
	const isLink = name === 'href' || name === 'xlink:href';
	if (v.startsWith('#')) return isLink && v.length > 1 ? `#${prefix}${v.slice(1)}` : null;
	/* SVG references (use, gradients) stay inside the page */
	if (svg) return null;
	const url = resolve(v, base);
	if (!url) return null;
	const p = url.protocol;
	if (name === 'href') return /^(https?|mailto|tel):$/.test(p) ? url.href : null;
	if (name === 'src' && tag === 'img' && p === 'data:') return /^data:image\/(png|gif|jpe?g|webp|avif|bmp)[;,]/i.test(v) ? v : null;
	if (name === 'src' || name === 'poster' || name === 'cite') return /^https?:$/.test(p) ? url.href : null;
	return null;
}

/** srcset: every candidate re-resolved; candidates that are not http(s) go; null when none is left */
export function rewriteSrcset(value, { base, resolve }) {
	const parts = String(value ?? '').split(/,\s+|,(?=\S+\s+\d)/).map(s => s.trim()).filter(Boolean).flatMap(part => {
		const [src, ...rest] = part.split(/\s+/);
		const url = resolve(src, base);
		if (!url || !/^https?:$/.test(url.protocol)) return [];
		const desc = rest.filter(d => /^\d+(\.\d+)?[wx]$/.test(d));
		return [[url.href, ...desc].join(' ')];
	});
	return parts.length ? parts.join(', ') : null;
}

/* ---------- The tree walk (browser) ---------- */

function cleanAttributes(el, svg, ctx) {
	const tag = el.localName.toLowerCase();
	const own = svg ? null : ELEMENT_ATTRS[tag];
	for (const attr of [...el.attributes]) {
		const name = attr.name.toLowerCase();
		const value = attr.value;
		const drop = () => el.removeAttributeNode(attr);
		if (name.startsWith('on') || name === 'style' || name.startsWith('data-') || name === 'target' || name === 'hidden') {
			drop();
		} else if (name === 'id') {
			const v = value.trim();
			if (v && v.length <= 200) attr.value = ctx.prefix + v;
			else drop();
		} else if (name === 'class') {
			const cls = mapClasses(value);
			if (cls) attr.value = cls;
			else drop();
		} else if (IDREF_ATTRS.has(name)) {
			if (!svg && name === 'for' && tag !== 'label') drop();
			else if (!svg && name === 'headers' && tag !== 'td' && tag !== 'th') drop();
			else attr.value = prefixIdrefs(value, ctx.prefix);
		} else if (name === 'tabindex') {
			if (tag === 'pre') attr.value = '0';
			else drop();
		} else if (name.startsWith('aria-') && /^aria-[a-z]+$/.test(name)) {
			/* plain text values — kept */
		} else if (GLOBAL_ATTRS.has(name)) {
			if (name === 'dir' && !/^(ltr|rtl|auto)$/i.test(value)) drop();
		} else if (URL_ATTRS.has(name)) {
			const allowed = svg ? (name === 'href' || name === 'xlink:href') : own?.includes(name);
			const next = allowed ? rewriteUrl(name, value, { tag, svg, base: ctx.base, prefix: ctx.prefix, resolve: ctx.resolve }) : null;
			if (next == null) drop();
			else attr.value = next;
		} else if (name === 'srcset') {
			const next = own?.includes('srcset') ? rewriteSrcset(value, ctx) : null;
			if (next == null) drop();
			else attr.value = next;
		} else if (svg ? SVG_ATTRS.has(name) : own?.includes(name)) {
			if (svg) {
				const next = rewriteUrlRefs(value, ctx.prefix);
				if (next == null) drop();
				else if (next !== value) attr.value = next;
			}
		} else {
			drop();
		}
	}
}

/* 'drop' | 'keep' | 'unwrap' for an element */
function verdict(el) {
	const ns = el.namespaceURI;
	const tag = el.localName.toLowerCase();
	if (ns === SVG_NS) return SVG_ALLOW.has(tag) ? 'keep' : SVG_UNWRAP.has(tag) ? 'unwrap' : 'drop';
	if (ns !== HTML_NS && ns !== null) return 'unwrap';
	if (DROP.has(tag)) return 'drop';
	/* Collapsed or hidden navigation is no content (original behaviour) */
	if (el.hasAttribute('hidden') || el.getAttribute('role') === 'menu') return 'drop';
	return ALLOW.has(tag) ? 'keep' : 'unwrap';
}

function walk(parent, ctx) {
	for (const node of [...parent.childNodes]) {
		if (node.nodeType === 3) continue;                 // text
		if (node.nodeType !== 1) {                         // comments, processing instructions, CDATA
			node.remove();
			continue;
		}
		const v = verdict(node);
		if (v === 'drop') {
			node.remove();
			continue;
		}
		walk(node, ctx);
		if (v === 'unwrap') {
			node.replaceWith(...node.childNodes);
			continue;
		}
		const svg = node.namespaceURI === SVG_NS;
		cleanAttributes(node, svg, ctx);
		const tag = node.localName.toLowerCase();
		if (svg) continue;
		if (tag === 'a' && node.hasAttribute('href')) {
			const url = ctx.resolve(node.getAttribute('href'), ctx.base);
			if (url && /^https?:$/.test(url.protocol) && url.origin !== ctx.origin) {
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
		} else if (tag === 'img') {
			node.setAttribute('loading', 'lazy');
			node.setAttribute('decoding', 'async');
		} else if (tag === 'pre') {
			/* Code blocks stay dark in the light theme, as in the original */
			node.setAttribute('data-island', 'dark');
		} else if (tag === 'video' || tag === 'audio') {
			/* No autoplay attribute survives; media always shows its controls */
			node.setAttribute('controls', '');
		}
	}
}

/**
 * Cleans the children of root in place (root itself is the caller's container).
 * ctx: { base: page URL, prefix: id prefix of the window, origin: location.origin,
 *        resolve(raw, base) → URL | null }
 */
export function sanitizeTree(root, ctx) {
	walk(root, ctx);
	return root;
}
