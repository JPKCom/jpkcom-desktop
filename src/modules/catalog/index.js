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

   Service 'catalog': open(collectionId) → boolean, actions(app) → [{ id, label, icon, run }]. */

import Desk from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isSafeUrl } from '../../core/url.js';
import { matches, gridMove, columnsOf } from './util.js';

const t = (key, params) => Desk.t(key, params);
const name = app => Desk.apps.name(app);
const urlOf = v => {
	const raw = typeof v === 'string' || (v && typeof v === 'object') ? Desk.L(v) : '';
	return isSafeUrl(raw) ? raw : null;
};

function download(app) {
	const href = Desk.router.resolveUrl(Desk.apps.url(app), Desk.env.root)?.href;
	if (href) Desk.download(href, typeof app.fileName === 'string' && app.fileName ? app.fileName : undefined);
}

/** The actions of an item: docs, guide, download, open in new tab */
function actions(app) {
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

const webUrl = (c, app) => urlOf(c?.webUrl) ?? urlOf(app?.webUrl);

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
const allLabel = (c, app) => textOf(c, app, 'allLabel', 'catalog.all');
const webLabel = (c, app) => textOf(c, app, 'webLabel', 'catalog.web');

/* The menu's first entry: links say where they open (as the shell's app menus do) */
const openLabel = app => t(app?.kind === 'link' ? 'core.openTab' : 'core.open');

/* ---------- The window ---------- */

function mount(win, body) {
	const cid = typeof win.app.collection === 'string' ? win.app.collection : win.app.id;
	if (!Desk.apps.collection(cid)) throw new Error(`unknown collection '${cid}'`);
	const state = { section: 'all', query: '', selected: null, focus: null, pointer: 'mouse', queued: false };

	const side = h('nav', { class: 'catalog-side' });
	const search = h('input', { type: 'search', class: 'catalog-input', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
	const searchBox = h('label', { class: 'catalog-search' }, Desk.icon('ti-search'), search);
	const extraBtn = h('button', { type: 'button', class: 'catalog-extra', hidden: true });
	const grid = h('ul', { class: 'catalog-grid' });
	const status = h('div', { class: 'catalog-status' });
	body.append(h('div', { class: 'catalog' },
		side,
		h('div', { class: 'catalog-main' }, h('div', { class: 'catalog-toolbar' }, searchBox, extraBtn), grid, status)));

	const collection = () => Desk.apps.collection(cid);
	const usable = list => list.filter(a => Desk.apps.available(a));

	function sections() {
		const c = collection();
		if (!c) return [{ id: 'all', label: allLabel(null, win.app), icon: win.app.icon, tint: win.app.tint, items: [] }];
		return [
			{ id: 'all', label: allLabel(c, win.app), icon: c.icon, tint: c.tint, items: usable(Desk.apps.items(cid)) },
			...c.groups.map(g => ({
				id: g.id, label: Desk.L(g.name), icon: g.icon ?? c.icon, tint: g.tint ?? c.tint,
				items: usable(Desk.apps.items(cid, { group: g.id }))
			}))
		];
	}

	const current = list => list.find(s => s.id === state.section) ?? list[0];

	function visible(list = sections()) {
		if (!state.query) return current(list).items;
		const locale = Desk.i18n.locale();
		return list[0].items.filter(app => matches(state.query, [name(app), Desk.apps.desc(app), app.host], locale));
	}

	function renderSide(list) {
		side.hidden = list.length < 2;
		side.setAttribute('aria-label', t('catalog.sidebar'));
		side.replaceChildren(h('ul', {}, list.map(s => h('li', {},
			h('button', {
				type: 'button', class: 'catalog-cat', 'aria-current': !state.query && s.id === current(list).id ? 'true' : null,
				onclick: () => {
					state.section = s.id;
					state.query = '';
					state.selected = null;
					state.focus = null;
					search.value = '';
					render();
					win.changed('state');
				}
			}, Desk.tile(s, 'mini'), h('span', { class: 'catalog-cat-label', text: s.label }),
			h('span', { class: 'catalog-count', text: Desk.i18n.fmtNumber(s.items.length) }))))));
	}

	function renderGrid(list) {
		const items = visible(list);
		grid.setAttribute('aria-label', state.query ? t('core.search') : current(list).label);
		if (!items.some(a => a.id === state.focus)) state.focus = items.some(a => a.id === state.selected) ? state.selected : items[0]?.id ?? null;
		grid.replaceChildren(...items.map(app => h('li', {},
			h('button', {
				type: 'button', class: ['catalog-item', state.selected === app.id && 'is-selected'], dataset: { app: app.id },
				title: Desk.apps.desc(app) || null, tabindex: app.id === state.focus ? '0' : '-1',
				'aria-label': app.kind === 'link' ? t('core.newTab', { name: name(app) }) : null
			}, Desk.tile(app), h('span', { class: 'catalog-label', text: name(app) })))));
		if (!items.length) grid.append(h('li', { class: 'catalog-empty', text: t('core.noResults') }));
	}

	function renderStatus(list) {
		const app = state.selected && Desk.apps.get(state.selected);
		if (app) {
			const desc = Desk.apps.desc(app);
			const parts = [desc, app.host].filter(Boolean);
			status.replaceChildren(
				h('span', { class: 'catalog-desc' }, h('b', { text: name(app) }),
					parts.length ? [' ', h('span', { text: t('catalog.detail', { text: parts.join(' · ') }) })] : null),
				...actions(app).map(a => h('button', { type: 'button', class: 'catalog-extra catalog-action', onclick: a.run }, Desk.icon(a.icon), h('span', { text: a.label }))));
		} else {
			status.replaceChildren(h('span', { class: 'catalog-desc', text: t('core.items', { n: visible(list).length }) }));
		}
	}

	function render() {
		const list = sections();
		const hadFocus = grid.contains(document.activeElement) ? document.activeElement.dataset.app : null;
		search.placeholder = t('core.search');
		search.setAttribute('aria-label', t('catalog.searchIn', { name: name(win.app) }));
		const web = webUrl(collection(), win.app);
		extraBtn.hidden = !web;
		if (web) {
			const label = webLabel(collection(), win.app);
			extraBtn.replaceChildren(Desk.icon('ti-world'), h('span', { class: 'catalog-extra-label', text: label }));
			extraBtn.setAttribute('aria-label', label);
			extraBtn.title = label;
			extraBtn.onclick = () => Desk.openUrl(web);
		}
		if (state.selected && !Desk.apps.get(state.selected)) state.selected = null;
		renderSide(list);
		renderGrid(list);
		renderStatus(list);
		if (hadFocus) grid.querySelector(`[data-app="${Desk.dom.cssEscape(hadFocus)}"]`)?.focus({ preventScroll: true });
	}

	function select(id) {
		state.selected = id;
		for (const b of grid.querySelectorAll('.catalog-item')) b.classList.toggle('is-selected', b.dataset.app === id);
		renderStatus(sections());
	}

	function focusItem(btn) {
		if (!btn) return;
		for (const b of grid.querySelectorAll('.catalog-item')) b.tabIndex = b === btn ? 0 : -1;
		state.focus = btn.dataset.app;
		btn.focus();
		btn.scrollIntoView?.({ block: 'nearest' });
	}

	const launch = id => Desk.launch(id);

	search.addEventListener('input', () => {
		state.query = search.value.trim();
		state.selected = null;
		state.focus = null;
		const list = sections();
		renderSide(list);
		renderGrid(list);
		renderStatus(list);
	});

	search.addEventListener('keydown', e => {
		if (e.key === 'ArrowDown') {
			const btn = grid.querySelector('.catalog-item[tabindex="0"]') ?? grid.querySelector('.catalog-item');
			if (btn) {
				e.preventDefault();
				focusItem(btn);
				select(btn.dataset.app);
			}
		} else if (e.key === 'Escape' && search.value) {
			/* the first Esc clears the field (and stays here) */
			e.preventDefault();
			e.stopPropagation();
			search.value = '';
			search.dispatchEvent(new Event('input'));
		}
	});

	grid.addEventListener('keydown', e => {
		const btn = e.target.closest?.('.catalog-item');
		if (!btn || e.altKey || e.ctrlKey || e.metaKey) return;
		const buttons = [...grid.querySelectorAll('.catalog-item')];
		const idx = buttons.indexOf(btn);
		const cols = columnsOf(buttons.map(b => b.offsetTop));
		if (e.key === 'ArrowUp' && idx < cols) {
			e.preventDefault();
			search.focus();
			return;
		}
		const rtl = getComputedStyle(grid).direction === 'rtl';
		const next = gridMove(idx, e.key, buttons.length, cols, rtl);
		if (next == null) return;
		e.preventDefault();
		focusItem(buttons[next]);
		select(buttons[next].dataset.app);
	});

	grid.addEventListener('focusin', e => {
		const btn = e.target.closest?.('.catalog-item');
		if (btn && btn.tabIndex !== 0) {
			for (const b of grid.querySelectorAll('.catalog-item')) b.tabIndex = b === btn ? 0 : -1;
			state.focus = btn.dataset.app;
		}
	});

	grid.addEventListener('pointerdown', e => { state.pointer = e.pointerType || 'mouse'; }, true);
	grid.addEventListener('click', e => {
		const btn = e.target.closest('.catalog-item');
		if (!btn) return;
		select(btn.dataset.app);
		if (e.detail === 0 || state.pointer !== 'mouse') launch(btn.dataset.app);
	});
	grid.addEventListener('dblclick', e => {
		const btn = e.target.closest('.catalog-item');
		if (btn && state.pointer === 'mouse') launch(btn.dataset.app);
	});

	/* New or removed items (private bookmarks unlocked, a module loaded): redraw once per batch */
	const off = Desk.on('apps:change', () => {
		if (state.queued) return;
		state.queued = true;
		queueMicrotask(() => {
			state.queued = false;
			if (!state.closed) render();
		});
	});

	win.state.catalog = {
		render, select, launch,
		get selected() { return state.selected; },
		get section() { return state.section; },
		setSection(id) {
			if (!sections().some(s => s.id === id)) return false;
			state.section = id;
			render();
			return true;
		},
		web: () => webUrl(collection(), win.app),
		webLabel: () => webLabel(collection(), win.app),
		close() {
			state.closed = true;
			off();
		}
	};
	render();
}

const collectionKind = {
	mount,
	relabel(win) {
		win.setTitle(null);
		win.state.catalog?.render();
	},
	unmount: win => win.state.catalog?.close(),
	serialize(win) {
		const c = win.state.catalog;
		return c && c.section !== 'all' ? { section: c.section } : null;
	},
	restore(win, state) {
		const id = Desk.V.id(state?.section);
		if (id) win.state.catalog?.setSection(id);
	},
	menu(win) {
		const c = win.state.catalog;
		if (!c) return [];
		const app = c.selected ? Desk.apps.get(c.selected) : null;
		const web = c.web();
		/* A link's "Open" already says "Open in new tab": its 'tab' action is not listed twice */
		return [
			{ label: openLabel(app), disabled: !app, run: () => app && c.launch(app.id) },
			...actions(app).filter(a => a.id !== 'tab').map(a => ({ label: a.label, run: a.run })),
			...(web ? ['-', { label: c.webLabel(), run: () => Desk.openUrl(web) }] : [])
		];
	}
};

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
	styles: ['catalog.css'],

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
