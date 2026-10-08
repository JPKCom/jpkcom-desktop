/* JPKCom Desktop — Catalog: the icon browser window (loaded with the first one) — © Jean Pierre Kolb — MIT License

   The hooks of window kind 'collection' (index.js defines it with
   load: () => import('./kind.js') and keeps the context menu and the service).
   win.state.catalog is the open window's handle (render, select, setSection, …);
   the context menu of an item reaches it through wm.get(id)?.state.catalog. */

import Desk from '../../core/api.js';
import { h } from '../../core/dom.js';
import { matches, gridMove, columnsOf, isCatalogOf, pickWebApp, selfRouteHref } from './util.js';
import { t, name, actions, webUrl, allLabel, webLabel, openLabel } from './index.js';

/* ---------- The web button ---------- */

/* The Catalog's web button: { label, run } or null (no available webApp, no webUrl).
   c = the collection, app = the window's Catalog app, cid = the collection it shows. */
function webTarget(c, app, cid) {
	const get = id => Desk.apps.get(id);
	const id = pickWebApp([c?.webApp, app?.webApp], {
		available: v => Desk.apps.available(v),
		isSelf: v => isCatalogOf(v, cid, get)
	});
	const url = webUrl(c, app);
	if (!id && !url) return null;
	const openWeb = () => {
		if (!url) return false;
		/* a webUrl that routes back to a Catalog of this collection opens in a new tab */
		const tab = selfRouteHref(Desk.router, url, Desk.env.root, cid, get);
		if (tab) {
			window.open(tab, '_blank', 'noopener');
			return true;
		}
		return Desk.openUrl(url);
	};
	return { label: webLabel(c, app), run: () => (id != null && Desk.launch(id) !== false) || openWeb() };
}

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
		const web = webTarget(collection(), win.app, cid);
		extraBtn.hidden = !web;
		if (web) {
			extraBtn.replaceChildren(Desk.icon('ti-world'), h('span', { class: 'catalog-extra-label', text: web.label }));
			extraBtn.setAttribute('aria-label', web.label);
			extraBtn.title = web.label;
			extraBtn.onclick = web.run;
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
		/* the web button's target: { label, run } | null */
		web: () => webTarget(collection(), win.app, cid),
		close() {
			state.closed = true;
			off();
		}
	};
	render();
}

export default {
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
			...(web ? ['-', { label: web.label, run: web.run }] : [])
		];
	}
};
