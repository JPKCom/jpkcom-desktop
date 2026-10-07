/* JPKCom Desktop — Reader: page extraction (rules → content, hero, title, alternates) — © Jean Pierre Kolb — MIT License

   A fetched page is parsed inert with DOMParser and reduced to what the
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
   class reader-h<n> keeps the look of the level the page wrote. */

import { h } from '../../core/dom.js';
import { firstMatch, matchRule, cleanTitle, cleanLang, demotedLevel, DEFAULT_RULE } from './util.js';
import { sanitizeTree } from './sanitize.js';

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

/**
 * Extracts a page. opts: { rules (compiled), separator, prefix, origin, resolve(raw, base) → URL | null }
 * → { node (imported into this document), title, alternates: { hreflang: href }, lang }
 */
export function extract(html, pageUrl, { rules, separator, prefix, origin, resolve }) {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const rule = matchRule(rules, new URL(pageUrl).pathname);
	const content = firstMatch(doc, rule.content) ?? firstMatch(doc, DEFAULT_RULE.content) ?? doc.body;
	const titleEl = rule.title ? firstMatch(doc, rule.title) : null;
	const leadEl = rule.lead ? firstMatch(doc, rule.lead) : null;
	const ctx = { base: pageUrl, prefix, origin, resolve };

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

	const alternates = {};
	for (const link of doc.querySelectorAll('link[rel~="alternate"][hreflang][href]')) {
		const code = cleanLang(link.getAttribute('hreflang'));
		const url = resolve(link.getAttribute('href'), pageUrl);
		if (code && url && /^https?:$/.test(url.protocol) && url.origin === origin) alternates[code] = url.href;
	}

	return { node: page, title, alternates, lang: docLang };
}
