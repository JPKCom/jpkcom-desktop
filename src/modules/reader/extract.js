/* JPKCom Desktop — Reader: page extraction (rules → content, hero, title, alternates) — © Jean Pierre Kolb — MIT License

   A fetched page is parsed inert (parse.js: DOMParser without CSP reports) and reduced to what the
   window shows. Which part that is comes from config.reader.rules (the
   original hard-coded its site's #content / #main-content containers):

     { match, content: 'main article, article, main', title: 'h1', lead: '.lead' }

   content  selector list, tried in order — the region shown (fallback: the
            default rule, then <body>)
   title    the page heading. Outside the content region it becomes the hero
            heading above it (as the original's header h1); inside it stays where it is
   lead     a subtitle; outside the content it goes under the hero heading
            (under the heading inside the content when that is where the
            heading is; a hero of its own without any heading), inside the
            content it is marked .reader-lead

   The window title is the document title without its "| Site" part
   (config.reader.titleSeparator), else the heading's text. Alternate
   language versions come from <link rel="alternate" hreflang>.

   Headings move two levels down: the window title (h2) names the page, so the
   page's h1 is an h3 under it, its h2 sections h4 … (h4–h6 all end at h6). The
   class reader-h<n> keeps the look of the level the page wrote.

   Code colours: the sanitiser marks elements whose allowlisted styles it kept
   (styles.js, config.reader.keepStyles); after the import applyStyles() runs the
   contrast guard in document order (ancestors first) and sets the canonical
   values through CSSOM — the page's style text never reaches the document.
   An element that keeps a page's colours (or custom properties) is marked
   data-reader-kept: inside it reader.css lets every element inherit the text
   colour the guard checked (no link or heading colour of the desktop on a
   background the page chose), and one that keeps a background without a text
   colour gets the checked one written as well. The stylesheet tints of mark
   and kbd between an element and the pair it sits on are blended in. */

import { h } from '../../core/dom.js';
import { firstMatch, matchRule, cleanTitle, cleanLang, demotedLevel, DEFAULT_RULE } from './util.js';
import { sanitizeTree, STYLE_MARK } from './sanitize.js';
import { parseInert } from './parse.js';
import { parseColor, formatColor, guardPair, tintPair, CODE_SURFACE } from './styles.js';

/** Set on an element that kept a page's colours or custom properties (reader.css: its content inherits the checked colour) */
export const KEPT_MARK = 'data-reader-kept';
/* Elements whose desktop stylesheet lays a translucent background over what lies below (reader.css) */
const TINTED = ['mark', 'kbd'];

/* A heading or lead copied out of the page header: links unwrapped (they lead home),
   icons dropped, line breaks as spaces, a nested lead removed */
function copyInline(doc, from, tag, skip) {
	const el = doc.createElement(tag);
	for (const node of from.childNodes) el.append(node.cloneNode(true));
	if (skip && from.contains(skip)) {
		const path = [];
		for (let n = skip; n && n !== from; n = n.parentNode) path.unshift([...n.parentNode.childNodes].indexOf(n));
		let target = el;
		for (const i of path) target = target?.childNodes[i];
		target?.remove();
	}
	for (const x of el.querySelectorAll('svg, img, picture')) x.remove();
	for (const br of el.querySelectorAll('br')) br.replaceWith(' ');
	for (const a of el.querySelectorAll('a')) a.replaceWith(...a.childNodes);
	return el;
}

const textOf = el => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/* Every h1–h6 under root replaced by its demoted level (attributes and children
   move along, reader-h<n> records the original level for the styles) */
function demoteHeadings(doc, root) {
	for (const el of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
		const n = Number(el.localName.slice(1));
		const to = doc.createElement(`h${demotedLevel(n)}`);
		for (const a of el.attributes) to.setAttribute(a.name, a.value);
		to.classList.add(`reader-h${n}`);
		to.append(...el.childNodes);
		el.replaceWith(to);
	}
}

/* The colours of a code block in this desktop (a hidden probe: site themes may change
   --reader-code-bg), and the tints of mark/kbd; CODE_SURFACE (no tints) when they cannot be read */
function codeSurface() {
	const pre = h('pre', { 'data-island': 'dark' }, TINTED.map(tag => h(tag)));
	const probe = h('div', { class: 'reader-page', hidden: true, 'aria-hidden': 'true' }, pre);
	const tints = new Map();
	try {
		document.body.append(probe);
		const cs = getComputedStyle(pre);
		const bg = parseColor(cs.backgroundColor);
		const fg = parseColor(cs.color);
		for (const el of pre.children) {
			const c = parseColor(getComputedStyle(el).backgroundColor);
			if (c && c.a > 0) tints.set(el.localName, c);
		}
		return { bg: bg?.a === 1 ? bg : CODE_SURFACE.bg, fg: fg?.a === 1 ? fg : CODE_SURFACE.fg, tints };
	} catch {
		return { ...CODE_SURFACE, tints };
	} finally {
		probe.remove();
	}
}

/* The pair an element sits on: its nearest styled ancestor's result; a <pre> (a dark island with
   its own background) the code surface; unknown outside a code block. self: the element's own
   stylesheet tint counts (it sets no background of its own) */
function surfaceOf(el, page, done, surface, self) {
	if (el.localName === 'pre') return surface;
	const tints = [];
	const tint = n => {
		const c = surface.tints.get(n.localName);
		if (c) tints.unshift(c);
	};
	if (self) tint(el);
	for (let p = el.parentElement; p && p !== page; p = p.parentElement) {
		if (done.has(p)) return tintPair(done.get(p), tints);
		if (p.localName === 'pre') return tintPair(surface, tints);
		tint(p);
	}
	return null;
}

/* Sets the kept styles of the marked elements under page (CSSOM), contrast guard first */
function applyStyles(page, kept) {
	const marked = page.querySelectorAll(`[${STYLE_MARK}]`);
	if (!marked.length) return;
	const surface = codeSurface();
	const done = new Map();
	for (const el of marked) {
		const st = kept[Number(el.getAttribute(STYLE_MARK))];
		el.removeAttribute(STYLE_MARK);
		if (!st) continue;
		/* A kept background replaces the element's stylesheet tint; when it goes, the tint is back */
		const below = surfaceOf(el, page, done, surface, true);
		let res = guardPair(st, st.bg ? surfaceOf(el, page, done, surface, false) : below);
		if (!res.keep) res = { keep: false, fg: below?.fg ?? null, bg: below?.bg ?? null };
		done.set(el, res);
		for (const [prop, value] of st.props) el.style.setProperty(prop, value);
		const vars = st.props.some(([prop]) => prop.startsWith('--'));
		if (vars) el.setAttribute(KEPT_MARK, '');
		if (!res.keep || (!st.color && !st.bg)) continue;
		/* The text colour the guard checked — without it a desktop rule (a link, a heading) could
		   colour the text like the kept background */
		el.style.setProperty('color', formatColor(st.color ?? res.fg));
		if (st.bg) el.style.setProperty('background-color', formatColor(st.bg));
		el.setAttribute(KEPT_MARK, '');
	}
}

/**
 * Extracts a page. opts: { rules (compiled), separator, prefix, origin, resolve(raw, base) → URL | null,
 * styles: { scope, vars } | null (code colours, config.reader) }
 * → { node (imported into this document), title, alternates: { hreflang: href }, lang }
 */
export function extract(html, pageUrl, { rules, separator, prefix, origin, resolve, styles = null }) {
	const doc = parseInert(html);
	const rule = matchRule(rules, new URL(pageUrl).pathname);
	const content = firstMatch(doc, rule.content) ?? firstMatch(doc, DEFAULT_RULE.content) ?? doc.body;
	const titleEl = rule.title ? firstMatch(doc, rule.title) : null;
	const leadEl = rule.lead ? firstMatch(doc, rule.lead) : null;
	const ctx = { base: pageUrl, prefix, origin, resolve, styles, kept: [] };

	/* Hero: heading (and lead) from outside the content region */
	let heroTitle = null;
	let heroLead = null;
	if (titleEl && !content.contains(titleEl) && textOf(titleEl)) {
		const box = doc.createElement('div');
		box.append(copyInline(doc, titleEl, 'h1', leadEl));
		sanitizeTree(box, ctx);
		demoteHeadings(doc, box);
		heroTitle = box.firstElementChild;
		heroTitle?.removeAttribute('id');
	}
	if (leadEl && !content.contains(leadEl) && textOf(leadEl)) {
		const box = doc.createElement('div');
		box.append(copyInline(doc, leadEl, 'p', null));
		sanitizeTree(box, ctx);
		heroLead = box.firstElementChild;
	}

	/* The content region itself, cleaned inside a container (so <body> or <main> as
	   the region is handled like any other element) */
	const box = doc.createElement('div');
	const region = content === doc.body || content === doc.documentElement ? content.childNodes : [content];
	box.append(...region);
	sanitizeTree(box, ctx);
	if (leadEl && box.contains(leadEl)) leadEl.classList.add('reader-lead');
	/* A lead from outside whose heading is inside the content: right under that heading */
	if (heroLead && !heroTitle && titleEl && box.contains(titleEl) && titleEl.parentNode) {
		heroLead.classList.add('reader-lead');
		titleEl.after(heroLead);
		heroLead = null;
	}
	/* The title before the headings are swapped (an inner titleEl gives its text away then) */
	const title = cleanTitle(doc.title, separator) || textOf(heroTitle) || textOf(titleEl);
	demoteHeadings(doc, box);

	const docLang = cleanLang(doc.documentElement.getAttribute('lang'));
	const docDir = doc.documentElement.getAttribute('dir');
	const page = h('div', { class: 'reader-page', lang: docLang, dir: /^(ltr|rtl)$/i.test(docDir ?? '') ? docDir.toLowerCase() : null });
	/* The hero: the heading from outside (with its lead), or an outside lead with no heading in the content */
	if (heroTitle || heroLead) {
		const hero = h('header', { class: 'reader-hero' }, heroTitle ? document.importNode(heroTitle, true) : null);
		if (heroLead) {
			const lead = document.importNode(heroLead, true);
			lead.classList.add('reader-lead');
			hero.append(lead);
		}
		page.append(hero);
	}
	for (const node of box.childNodes) page.append(document.importNode(node, true));
	applyStyles(page, ctx.kept);

	const alternates = {};
	for (const link of doc.querySelectorAll('link[rel~="alternate"][hreflang][href]')) {
		const code = cleanLang(link.getAttribute('hreflang'));
		const url = resolve(link.getAttribute('href'), pageUrl);
		if (code && url && /^https?:$/.test(url.protocol) && url.origin === origin) alternates[code] = url.href;
	}

	return { node: page, title, alternates, lang: docLang };
}
