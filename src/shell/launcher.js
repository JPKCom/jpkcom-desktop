/* JPKCom Desktop — All apps: a full-screen grid of every app with a search — © Jean Pierre Kolb — MIT License

   Opened from the first dock item (the app 'launcher', kind 'launcher') or
   launch('launcher'). New apps land here by themselves and need no desktop
   icon or dock slot. Collection items (tools, bookmarks …) are not listed —
   they live in their Catalog windows and in the search; with a query the
   grid offers "Search everywhere" when a search module is loaded.

   A modal dialog: the focus cycles between the search field and the apps,
   arrow keys walk the grid (the column count comes from the layout), the
   first Esc clears the search, the second closes; a click on the empty
   backdrop closes. Touch opens it without focusing the field (no keyboard
   popping up). */

import { config } from '../core/config.js';
import { emit, on } from '../core/bus.js';
import { reduceMotion } from '../core/env.js';
import { t } from '../core/i18n.js';
import { h, markLang } from '../core/dom.js';
import { icon, tile } from '../core/icons.js';
import { registry } from '../core/registry.js';
import { launch } from '../core/router.js';
import { get as service } from '../core/services.js';

const SELF = 'launcher';

/**
 * The apps matching a query (lower-cased) in name or description. Pure
 * (exported for tests): name(app) and desc(app) resolve the texts.
 */
export function filterApps(apps, query, { name = a => a.name ?? '', desc = a => a.desc ?? '' } = {}) {
	const q = String(query ?? '').trim().toLocaleLowerCase();
	if (!q) return apps;
	return apps.filter(app => `${name(app)} ${desc(app)}`.toLocaleLowerCase().includes(q));
}

let el = null;
let search = null;
let grid = null;
let query = '';
let returnTo = null;
let pointer = 'mouse';

/* Every app that can open now, except collection items, dropped files and the launcher itself
   (the Catalog apps — kind 'collection' — are listed) */
const entries = () => launcherEntries(registry.list());

/**
 * The apps All apps lists (pure, exported for tests): everything except the
 * launcher, dropped files and collection items — aliases among them included
 * (a bookmark pointing at an app shows its target's name and icon). The
 * Catalog apps themselves (kind 'collection', e.g. Bookmarks, Showcase) are
 * listed; any other entry that carries a collection id is not.
 */
export function launcherEntries(apps) {
	return apps.filter(a => a.kind !== 'launcher' && !a.item && !a.transient && !(a.collection && a.kind !== 'collection'));
}
const title = () => {
	const app = registry.get('launcher');
	return app ? registry.name(app) : t('shell.allApps');
};
const items = () => (grid ? [...grid.querySelectorAll('.launcher-item')] : []);

function visible() {
	return filterApps(entries(), query, { name: a => registry.name(a), desc: a => registry.desc(a) });
}

function renderGrid() {
	const list = visible();
	grid.replaceChildren(...list.map(app => h('li', {},
		h('button', {
			type: 'button', class: 'icon launcher-item', dataset: { app: app.id },
			'aria-label': app.kind === 'link' ? t('core.newTab', { name: registry.name(app) }) : null
		},
		tile(app), markLang(h('span', { class: 'icon-label', text: registry.name(app) }), registry.nameLang(app)))
	)));
	if (!list.length) grid.append(h('li', { class: 'launcher-empty', text: t('core.noResults') }));
	/* Collection items and page content live in the search */
	if (query && service('search')) {
		grid.append(h('li', { class: 'launcher-more-row' },
			h('button', { type: 'button', class: 'launcher-more', text: t('shell.searchEverywhere', { q: search.value.trim() }) })));
	}
}

/** Language switch: labels and names follow. */
export function relabel() {
	if (!el) return;
	el.setAttribute('aria-label', title());
	grid.setAttribute('aria-label', title());
	search.placeholder = t('core.search');
	search.setAttribute('aria-label', t('core.search'));
	renderGrid();
}

function setExpanded(open) {
	document.querySelector('#dock-list .dock-item[data-app="launcher"]')?.setAttribute('aria-expanded', String(open));
}

function run(id) {
	close();
	launch(id);
}

function searchEverywhere() {
	const q = search.value.trim();
	close();
	service('search')?.open?.(q);
}

/* Arrow keys walk the grid; the column count comes from the layout (mirrored in RTL) */
function step(btn, key) {
	const list = items();
	const i = list.indexOf(btn);
	const top = list[0].getBoundingClientRect().top;
	const cols = list.filter(b => Math.abs(b.getBoundingClientRect().top - top) < 2).length || 1;
	const rtl = document.documentElement.dir === 'rtl';
	const delta = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: cols, ArrowUp: -cols }[key];
	const next = list[i + delta];
	if (next) next.focus();
	else if (key === 'ArrowUp') search.focus();
}

/** Opens All apps (q: a first search text). */
export function open(q = '') {
	if (el) return;
	emit('popovers:close', { except: SELF });
	returnTo = document.activeElement;
	query = '';

	search = h('input', { type: 'search', class: 'field-input launcher-input', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go' });
	grid = h('ul', { class: 'launcher-grid' });
	el = h('div', { class: 'launcher', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' },
		h('div', { class: 'launcher-inner' },
			h('label', { class: 'field launcher-search' }, icon('ti-search'), search),
			grid));

	search.addEventListener('input', () => {
		query = search.value.trim();
		renderGrid();
	});

	search.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const first = items()[0];
			if (first) run(first.dataset.app);
			else if (query && service('search')) searchEverywhere();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			items()[0]?.focus();
		} else if (e.key === 'Escape' && search.value) {
			/* The first Esc clears the search, the second closes */
			e.preventDefault();
			e.stopPropagation();
			search.value = '';
			query = '';
			renderGrid();
		}
	});

	el.addEventListener('keydown', e => {
		const btn = e.target.closest('.launcher-item');
		if (e.key === 'Escape') {
			e.preventDefault();
			close(true);
		} else if (btn && e.key.startsWith('Arrow')) {
			e.preventDefault();
			step(btn, e.key);
		} else if (e.key === 'Tab') {
			/* Modal: focus cycles between the search field and the apps */
			const stops = [search, ...items(), ...grid.querySelectorAll('.launcher-more')];
			const i = stops.indexOf(document.activeElement);
			const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length;
			e.preventDefault();
			stops[next].focus();
		}
	});

	/* One click opens; a click on the empty backdrop closes */
	el.addEventListener('click', e => {
		const btn = e.target.closest('.launcher-item');
		if (btn) run(btn.dataset.app);
		else if (e.target.closest('.launcher-more')) searchEverywhere();
		else if (!e.target.closest('.launcher-search')) close(true);
	});

	el.setAttribute('aria-label', title());
	grid.setAttribute('aria-label', title());
	search.placeholder = t('core.search');
	search.setAttribute('aria-label', t('core.search'));
	if (typeof q === 'string' && q) {
		search.value = q.slice(0, 200);
		query = search.value.trim();
	}
	renderGrid();
	document.body.append(el);
	setExpanded(true);

	if (reduceMotion()) el.classList.add('is-open');
	else requestAnimationFrame(() => requestAnimationFrame(() => el?.classList.add('is-open')));

	/* Touch: no keyboard popping up — focus the dialog instead of the field */
	(pointer === 'touch' ? el : search).focus({ preventScroll: true });
}

/** Closes All apps (returnFocus: back to where the focus was, else the dock item). */
export function close(returnFocus = false) {
	if (!el) return;
	const node = el;
	el = null;
	grid = null;
	setExpanded(false);
	node.classList.remove('is-open');
	if (reduceMotion()) node.remove();
	else setTimeout(() => node.remove(), config.ui.animMs);
	if (returnFocus) {
		const back = returnTo?.isConnected && !node.contains(returnTo) ? returnTo : document.querySelector('#dock-list .dock-item[data-app="launcher"]');
		back?.focus({ preventScroll: true });
	}
	returnTo = null;
}

export const isOpen = () => !!el;
export const toggle = () => (el ? close(true) : open());

export function initLauncher() {
	document.addEventListener('pointerdown', e => { pointer = e.pointerType; }, true);
	on('popovers:close', ({ except } = {}) => { if (except !== SELF) close(); });
	on('lang:change', relabel);
	on('apps:change', () => { if (el) renderGrid(); });
	return Object.freeze({ open, close, toggle, isOpen, relabel });
}
