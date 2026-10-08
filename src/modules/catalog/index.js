/* JPKCom Desktop — Catalog: icon browser over a collection (window kind 'collection') — © Jean Pierre Kolb — MIT License

   Every collection of site/apps.js gets a Catalog window (app kind
   'collection', app.collection = the collection id): a sidebar with "All"
   and the collection's groups (hidden when it has none), a search field, an
   icon grid and a status bar. Sorting comes from the collection (registry
   items(): 'alpha' = group order, then name in the current language;
   'manual' = manifest order).

   Mouse: a click selects, a double click opens. Keyboard and touch: a click
   (Enter, Space, a tap) opens. Arrow keys, Home/End and PageUp/PageDown move
   through the grid (one tab stop, mirrored for right-to-left); ArrowDown in
   the search field enters the grid, ArrowUp in its first row goes back.

   Status bar: name — description · host of the selected item and its
   actions: "Documentation" (item.docs), "Guide" (item.guide), "Download"
   (image items, item.download) and "Open in new tab" (link items). The
   toolbar offers "Overview on the web" when the collection (or its Catalog
   app) has a webUrl. Optional allLabel / webLabel (text, '@ns.key' or
   { lang: text }) on the collection or its Catalog app name the "All" entry
   and that button per collection ("All tools", "Arcade hall"). The context
   menu of an item (contribution 'contextMenu') is the shell's app menu (open,
   open in new tab, copy link, Dock) plus these actions; the app menu lists
   them after "Open" ("Open in new tab" for links).

   Service 'catalog': open(collectionId) → boolean, actions(app) → [{ id, label, icon, run }].

   This file is the descriptor (labels, actions, context menu, service); the
   window is kind.js, loaded with the first Catalog window (defineKind load). */

import Desk from '../../core/api.js';
import { isSafeUrl } from '../../core/url.js';

export const t = (key, params) => Desk.t(key, params);
export const name = app => Desk.apps.name(app);
const urlOf = v => {
	const raw = typeof v === 'string' || (v && typeof v === 'object') ? Desk.L(v) : '';
	return isSafeUrl(raw) ? raw : null;
};

function download(app) {
	const href = Desk.router.resolveUrl(Desk.apps.url(app), Desk.env.root)?.href;
	if (href) Desk.download(href, typeof app.fileName === 'string' && app.fileName ? app.fileName : undefined);
}

/** The actions of an item: docs, guide, download, open in new tab */
export function actions(app) {
	if (!app) return [];
	const out = [];
	const docs = urlOf(app.docs);
	if (docs) out.push({ id: 'docs', icon: 'ti-book', label: t('catalog.docs'), run: () => Desk.openUrl(docs) });
	const guide = urlOf(app.guide);
	if (guide) out.push({ id: 'guide', icon: 'ti-compass', label: t('catalog.guide'), run: () => Desk.openUrl(guide) });
	if ((app.kind === 'image' || app.download === true) && app.url && !app.alias) {
		out.push({ id: 'download', icon: 'ti-download', label: t('core.download'), run: () => download(app) });
	}
	if (app.kind === 'link') out.push({ id: 'tab', icon: 'ti-external-link', label: t('core.openTab'), run: () => Desk.launch(app.id) });
	return out;
}

export const webUrl = (c, app) => urlOf(c?.webUrl) ?? urlOf(app?.webUrl);

/* Per-collection wording ("All tools", "Arcade hall"): text | '@ns.key' | { lang: text }
   on the collection or its Catalog app, else the generic label */
const isText = v => (typeof v === 'string' && v.length > 0) || (!!v && typeof v === 'object' && !Array.isArray(v));
const textOf = (c, app, field, fallback) => {
	for (const v of [c?.[field], app?.[field]]) {
		if (!isText(v)) continue;
		const s = Desk.L(v);
		if (typeof s === 'string' && s.trim()) return s;
	}
	return t(fallback);
};
export const allLabel = (c, app) => textOf(c, app, 'allLabel', 'catalog.all');
export const webLabel = (c, app) => textOf(c, app, 'webLabel', 'catalog.web');

/* The menu's first entry: links say where they open (as the shell's app menus do) */
export const openLabel = app => t(app?.kind === 'link' ? 'core.openTab' : 'core.open');

/* ---------- The window kind ---------- */

/* The window code comes with the first Catalog window (kind.js) */
const collectionKind = { load: () => import('./kind.js') };

/* The item of a context-menu element and the Catalog window around it */
function itemOf(el) {
	const id = (el?.closest?.('.catalog-item') ?? el)?.dataset?.app;
	return id ? Desk.apps.get(id) : null;
}
const catalogOf = el => Desk.wm?.get(el?.closest?.('.win')?.dataset.app)?.state.catalog ?? null;

/** Opens the Catalog window of a collection. */
function open(collectionId) {
	const c = Desk.apps.collection(collectionId);
	return !!c?.app && Desk.launch(c.app) !== false;
}

export default {
	id: 'catalog',
	kind: 'module',
	requires: ['wm'],
	i18n: ['catalog'],
	windowStyles: ['catalog.css'],

	/* Right-click / long press on an item (shell context menu): the app's menu as on
	   the desktop (open, open in new tab, copy link, Dock) plus the item's actions */
	contextMenu: [{
		selector: '.catalog-item',
		label: el => {
			const app = itemOf(el);
			return app ? t('shell.menuOf', { name: name(app) }) : t('shell.contextMenu');
		},
		select: el => {
			const btn = el?.closest?.('.catalog-item') ?? el;
			const app = itemOf(btn);
			if (app) catalogOf(btn)?.select(app.id);
		},
		items(el, ctx) {
			const app = itemOf(el);
			if (!app) return [];
			const extra = actions(app).map(a => ({ label: a.label, run: a.run }));
			if (typeof ctx?.appItems === 'function') return ctx.appItems(app, extra);
			/* Without the shell's building blocks: open and the actions */
			return [{ label: openLabel(app), run: () => Desk.launch(app.id) }, ...extra.filter(x => x.label !== openLabel(app))];
		}
	}],

	setup(desk) {
		desk.wm.defineKind('collection', collectionKind);
		desk.provide('catalog', Object.freeze({ open, actions }));
	}
};
