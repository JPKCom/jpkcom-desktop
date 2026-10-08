/* JPKCom Desktop — "About this desktop": name, version, system rows, credit — © Jean Pierre Kolb — MIT License

   Rows come from config.about.rows — an array of { label, value } texts, or a
   language map of such arrays — or, when that is null, from the desktop
   itself: system, apps, languages, licence. A value may also be an array of
   parts (rowParts() in pure.js): texts and { text, lang?, abbr? } — rendered
   as <span lang> and <abbr title>, as the original marked "Vanilla
   JavaScript" (lang en) and its abbreviations. Invalid rows are warned about
   and left out. The author credit
   ("JPKCom Desktop by Jean Pierre Kolb") stays visible while config.credit is
   true; the copyright line is config.about.copyright { holder, since }.
   holder is a name or its parts with their languages —
   [{ text: 'Jean Pierre', lang: 'fr' }, { text: 'Kolb', lang: 'de' }] — so
   screen readers pronounce each part right (as the original did). The author's
   name in the credit carries the same parts.

   The whole file is the window: loaded when it first opens (app field load
   in src/panels/index.js, which also provides the service 'about'). */

import Desk from '../core/api.js';
import { copyrightYears, splitAt, nameParts, rowParts } from './pure-window.js';

const { h, t, L } = Desk;
const cfg = Desk.config.about ?? {};

const isText = v => (typeof v === 'string' && v) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));

/* Site rows: [{ label, value }] or { lang: [{ label, value }] } */
function siteRows() {
	let rows = cfg.rows;
	if (rows == null) return null;
	if (!Array.isArray(rows) && typeof rows === 'object') {
		const chain = Desk.i18n.chain();
		const code = chain.find(c => Array.isArray(rows[c])) ?? Object.keys(rows).find(c => Array.isArray(rows[c]));
		rows = code ? rows[code] : null;
	}
	if (!Array.isArray(rows)) {
		console.warn('[about] config.about.rows must be an array of { label, value } or a language map of them — using the automatic rows');
		return null;
	}
	return rows.filter(r => {
		const ok = r && isText(r.label) && rowParts(r.value);
		if (!ok) console.warn(`[about] config.about.rows: skipped ${JSON.stringify(r)} (needs label: text, value: text or parts)`);
		return ok;
	}).map(r => [L(r.label), partNodes(rowParts(r.value))]);
}

/* Row value parts as nodes: an abbreviation as <abbr title>, a phrase in another language as <span lang> */
const partNodes = parts => parts.map(p => {
	const text = L(p.text);
	if (p.abbr) {
		const el = Desk.dom.abbr(text, L(p.abbr));
		if (p.lang) el.lang = p.lang;
		return el;
	}
	return p.lang ? h('span', { lang: p.lang, text }) : text;
});

/* The apps All apps lists (shell/launcher.js launcherEntries): not the
   launcher, no dropped files, no collection items — the Catalog apps count */
const launchable = () => Desk.apps.list().filter(a => a.kind !== 'launcher' && !a.item && !a.transient && !(a.collection && a.kind !== 'collection'));

function autoRows() {
	const apps = launchable().length;
	const langs = Desk.i18n.available().map(c => Desk.i18n.displayName(c));
	return [
		/* "Vanilla JavaScript" stays English in every language (lang marks it, as in the original) */
		[t('about.system'), withName('about.systemValue', {}, 'stack', STACK)],
		[t('about.apps'), t('about.appsValue', { n: apps })],
		[t('about.languages'), Desk.i18n.list(langs)],
		/* The shipped code is MIT except the brand assets (CREDITS.md) — the same note as the terminal's credit line */
		[t('about.license'), t('about.licenseValue', { license: t('core.license') })]
	];
}

/* "More about …": an app id (launched) or a URL (opened like any link) */
function moreInfo() {
	const target = cfg.moreInfo;
	if (typeof target !== 'string' || !target) return null;
	const app = Desk.apps.get(target);
	if (app) {
		if (!Desk.apps.available(app)) return null;
		return h('button', { type: 'button', class: 'btn', text: t('about.moreInfo'), onclick: () => Desk.launch(app.id) });
	}
	if (!Desk.router.resolveUrl(target)) return null;
	return h('button', { type: 'button', class: 'btn', text: t('about.moreInfo'), onclick: () => Desk.openUrl(target) });
}

/* The project author's name with the language of each part (French first names, German surname) */
const AUTHOR_PARTS = Object.freeze([{ text: 'Jean Pierre', lang: 'fr' }, { text: 'Kolb', lang: 'de' }]);
const STACK = Object.freeze([{ text: 'Vanilla JavaScript', lang: 'en' }]);
const partsText = parts => parts.map(p => p.text).join(' ');
const authorParts = name => (name === partsText(AUTHOR_PARTS) ? AUTHOR_PARTS : nameParts(name));

/* A name as nodes: a span with lang per part that has one, the spaces between as text */
const nameNodes = parts => parts.flatMap((p, i) => [i ? ' ' : null, p.lang ? h('span', { lang: p.lang, text: p.text }) : p.text]).filter(x => x != null);

/* The whole translated sentence, with the name's nodes where its placeholder was
   (translated with a sentinel, then split — no fragments are put together) */
const SENTINEL = '\uE000name\uE000';
function withName(key, vars, nameKey, parts) {
	const text = t(key, { ...vars, [nameKey]: SENTINEL });
	return splitAt(text, SENTINEL, null).flatMap(x => (x === null ? nameNodes(parts) : [x]));
}

function credit() {
	if (Desk.config.credit === false) return null;
	const parts = authorParts(Desk.project.author) ?? [{ text: Desk.project.author, lang: null }];
	const content = withName('core.credit', { product: Desk.project.name }, 'author', parts);
	const url = Desk.config.author?.url;
	return h('p', { class: 'about-credit' }, typeof url === 'string' && /^https:\/\//.test(url)
		? h('a', { href: url, target: '_blank', rel: 'noopener' }, content)
		: content);
}

function copyright() {
	const c = cfg.copyright;
	const parts = c ? authorParts(c.holder) : null;
	if (!parts) return null;
	const year = new Date().getFullYear();
	return h('p', { class: 'about-copy' }, withName('about.copyright', { years: copyrightYears(c.since, year) }, 'holder', parts));
}

function renderAbout() {
	const logo = Desk.icons.logo();
	const rows = siteRows() ?? autoRows();
	return h('div', { class: 'panel about-panel' },
		logo ? h('span', { class: 'about-logo' }, logo) : h('span', { class: 'about-glyph' }, Desk.icons.brandGlyph()),
		h('h2', { text: Desk.config.brand.name }),
		h('p', { class: 'about-version', text: t('core.version', { version: Desk.version }) }),
		rows.length ? h('dl', { class: 'about-rows' }, rows.map(([k, v]) => [h('dt', { text: k }), h('dd', {}, v)])) : null,
		moreInfo(),
		credit(),
		copyright());
}

export default { render: renderAbout };
