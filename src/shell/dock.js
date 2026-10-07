/* JPKCom Desktop — the dock: All apps, pinned apps, running apps, pinned links, trash — © Jean Pierre Kolb — MIT License

   Order: "All apps" first, the pinned apps, apps that run without being
   pinned, a separator, the pinned links (external pages), then the trash
   (when the panels provide one). Phones leave links and the trash out — the
   Help menu has the links, the room goes to the apps.

   Pins: the apps with dock: true (or config.dock.pins) until the person
   changes them, then an own list in localStorage ('dock', validated, at most
   config.dock.max). Reordering by mouse drag, Alt + arrow keys on an item or
   the context menu — always within the apps or within the links; "All apps"
   stays first, running unpinned apps stay where they are.

   Size and magnification: body.dock-small / dock-large / dock-magnify from
   the stored values 'docksize' and 'magnify' (defaults config.dock.size,
   config.dock.magnify) — the settings write them through this service.

   The window manager shrinks minimised windows towards tileFor(appId); the
   dock reacts to 'window:open' with a bounce and to open/close/minimise with
   its running dots. What the dots and the full trash show is in the items'
   accessible names as well ("Notes, open", "Trash, 3 items"). */

import { config } from '../core/config.js';
import { emit, on } from '../core/bus.js';
import { reduceMotion, isCompact } from '../core/env.js';
import { t, i18n } from '../core/i18n.js';
import { h, cssEscape, markLang } from '../core/dom.js';
import { tile } from '../core/icons.js';
import { store, V } from '../core/store.js';
import { registry } from '../core/registry.js';
import { launch } from '../core/router.js';
import { get as service } from '../core/services.js';

export const PINS_KEY = 'dock';
export const SIZE_KEY = 'docksize';
export const MAGNIFY_KEY = 'magnify';
export const SIZES = ['small', 'medium', 'large'];

const maxPins = () => (Number.isInteger(config.dock?.max) && config.dock.max > 0 ? Math.min(config.dock.max, 500) : 60);

/** A stored pin list: app ids, no duplicates, at most max (pure, exported for tests). */
export function cleanPins(v, max = 60) {
	const list = V.list(v, V.id, max * 4);
	return list ? [...new Set(list)].slice(0, max) : null;
}

/**
 * Moves id by delta (−1 / +1) inside its section of the pins (apps or links),
 * the other section keeps its order. visible(id): only pins that are shown
 * take part; hidden ones keep their place at the end. Returns the new list,
 * or null when the move is not possible. Pure (exported for tests).
 */
export function movePin(pins, id, delta, { isLink = () => false, visible = () => true } = {}) {
	const section = pins.filter(x => visible(x) && isLink(x) === isLink(id));
	const i = section.indexOf(id);
	if (i < 0 || i + delta < 0 || i + delta >= section.length) return null;
	[section[i], section[i + delta]] = [section[i + delta], section[i]];
	return [...section, ...pins.filter(x => !section.includes(x))];
}

let list = null;      // #dock-list
let dockEl = null;    // #dock
let custom = null;    // the own pin list, or null (manifest defaults)
let signature = '';
let dragged = false;

const rtl = () => document.documentElement.dir === 'rtl';
const wm = () => service('wm');

/* Pinnable: launchable now, not the launcher, not hidden, not excluded */
const pinnable = app => !!app && app.kind !== 'launcher' && !app.hidden && !app.nodock && registry.available(app);

function defaults() {
	const pins = config.dock?.pins;
	if (Array.isArray(pins)) return pins.filter(id => typeof id === 'string' && pinnable(registry.get(id)));
	return registry.list().filter(a => a.dock && pinnable(a) && !a.alias).map(a => a.id);
}

const pins = () => custom ?? defaults();
/* A collection item that stands for another app pins that app */
const realId = id => registry.get(id)?.alias ?? id;
const isPinned = id => pins().includes(realId(id));
const isLink = id => registry.get(id)?.kind === 'link';
const visible = id => pinnable(registry.get(id));

function loadPins() {
	custom = store.getJson(PINS_KEY, v => cleanPins(v, maxPins()), null);
}

function save(next) {
	custom = next.slice(0, maxPins());
	store.setJson(PINS_KEY, custom);
	render();
	emit('dock:change', { pins: [...custom] });
}

function trashApp() {
	const app = registry.get('trash');
	return app && registry.available(app) ? app : null;
}

function entries() {
	const main = [];
	const links = [];
	for (const id of pins()) {
		const app = registry.get(id);
		if (!pinnable(app)) continue;
		(app.kind === 'link' ? links : main).push(app);
	}
	const shown = new Set(main.map(a => a.id));
	const trash = trashApp();
	/* Running, not pinned (the trash has its own place) */
	const running = (wm()?.list() ?? []).map(w => w.app).filter(a => !shown.has(a.id) && a.id !== trash?.id);
	const launcherApp = registry.get('launcher');
	const first = launcherApp && registry.available(launcherApp) ? [launcherApp] : [];
	/* Phones: external links live in the Help menu, the dock needs the room; the trash too */
	const end = isCompact() ? [] : [...links, ...(trash ? [trash] : [])];
	return [...first, ...main, ...running, ...(end.length ? ['-', ...end] : [])];
}

/* The trash shows whether it holds something (the panels give the app iconFull) */
function shownApp(app) {
	if (app.id !== 'trash' || !app.iconFull) return app;
	const count = service('trash')?.count?.() ?? 0;
	return count > 0 ? { ...app, icon: app.iconFull } : app;
}

function button(app) {
	const shown = shownApp(app);
	const label = registry.name(app);
	const isLauncher = app.kind === 'launcher';
	const li = h('li', {},
		h('button', {
			type: 'button', class: 'dock-item', dataset: { app: app.id },
			'aria-label': app.kind === 'link' ? t('core.newTab', { name: label }) : label,
			'aria-haspopup': isLauncher ? 'dialog' : null,
			'aria-expanded': isLauncher ? String(!!service('launcher')?.isOpen?.()) : null
		},
		tile(shown),
		markLang(h('span', { class: 'dock-label', 'aria-hidden': 'true', text: label }), registry.nameLang(app)),
		h('span', { class: 'dock-dot', 'aria-hidden': 'true' })));
	setName(li.firstChild, app, li.firstChild.getAttribute('aria-label'));
	return li;
}

/* The accessible name; the button carries the name's language only while the name is all it says
   (a fallback name inside "Notes, open" stays unmarked — an attribute cannot mark part of it) */
function setName(btn, app, name) {
	btn.setAttribute('aria-label', name);
	markLang(btn, name === registry.name(app) ? registry.nameLang(app) : null);
}

/** Redraws the dock when its content changed (force: always — language, size). */
export function render(force = false) {
	if (!list) return;
	const items = entries();
	const trash = trashApp();
	const sig = [i18n.lang(), isCompact(), trash ? shownApp(trash).icon : '', ...items.map(a => (a === '-' ? '|' : `${a.id}:${a.icon}:${a.tint}`))].join(',');
	if (force || sig !== signature) {
		const focused = document.activeElement?.closest?.('.dock-item')?.dataset.app;
		signature = sig;
		list.replaceChildren(...items.map(app => (app === '-' ? h('li', { class: 'dock-sep', 'aria-hidden': 'true' }) : button(app))));
		if (focused) itemOf(focused)?.focus({ preventScroll: true });
		/* Phones size the tiles by their number (dock.css) */
		dockEl.style.setProperty('--n', String(items.filter(a => a !== '-').length));
	}
	const w = wm();
	for (const btn of list.querySelectorAll('.dock-item')) {
		btn.classList.toggle('is-running', !!w?.has(btn.dataset.app));
		const name = stateName(btn.dataset.app, w);
		if (name) setName(btn, registry.get(btn.dataset.app), name);
	}
}

/* The accessible name with the state the dot and the trash glyph only show: open,
   minimised, a full trash (links keep core.newTab, "All apps" its name) */
function stateName(id, w) {
	const app = registry.get(id);
	if (!app || app.kind === 'link' || app.kind === 'launcher') return null;
	const name = registry.name(app);
	const win = w?.get?.(id) ?? null;
	if (win) return t(win.min ? 'shell.dockMinimised' : 'shell.dockOpen', { name });
	if (app.id === 'trash') {
		const count = service('trash')?.count?.() ?? 0;
		if (count > 0) return t('shell.dockTrashFull', { name, count });
	}
	return name;
}

const itemOf = id => list?.querySelector(`.dock-item[data-app="${cssEscape(id)}"]`) ?? null;

/** The tile of an app in the dock (the window manager minimises towards it), or null. */
export const tileFor = id => itemOf(id)?.querySelector('.tile') ?? null;

/** A short hop of the app's tile (a window of it opened). */
export function bounce(id) {
	render();
	const btn = itemOf(id);
	if (!btn || reduceMotion()) return;
	btn.classList.remove('is-bounce');
	void btn.offsetWidth;
	btn.classList.add('is-bounce');
	setTimeout(() => btn.classList.remove('is-bounce'), 1300);
}

export const canMove = (id, delta) => movePin(pins(), realId(id), delta, { isLink, visible }) !== null;

export function move(id, delta) {
	const next = movePin(pins(), realId(id), delta, { isLink, visible });
	if (next) save(next);
}

export const canPin = id => pinnable(registry.get(realId(id)));

export function pin(id) {
	const real = realId(id);
	if (!isPinned(real) && canPin(real)) save([...pins(), real]);
}

export function unpin(id) {
	const real = realId(id);
	save(pins().filter(x => x !== real));
}

/** Back to the manifest's pins. */
export function reset() {
	custom = null;
	store.remove(PINS_KEY);
	render();
	emit('dock:change', { pins: pins() });
}

/* ---------- Size and magnification ---------- */

const defaultSize = () => (SIZES.includes(config.dock?.size) ? config.dock.size : 'medium');
export const size = () => store.choice(SIZE_KEY, SIZES, defaultSize());
export const magnify = () => store.flag(MAGNIFY_KEY, config.dock?.magnify === true);

function applyPrefs() {
	const b = document.body.classList;
	b.toggle('dock-small', size() === 'small');
	b.toggle('dock-large', size() === 'large');
	b.toggle('dock-magnify', magnify());
}

export function setSize(value) {
	if (!SIZES.includes(value)) return;
	store.set(SIZE_KEY, value);
	applyPrefs();
}

export function setMagnify(on) {
	store.setFlag(MAGNIFY_KEY, !!on);
	applyPrefs();
}

/* ---------- Events ---------- */

/* Visual left/right → list direction (the list runs right to left in RTL languages) */
const step = key => (key === 'ArrowLeft' ? -1 : 1) * (rtl() ? -1 : 1);

function wireEvents() {
	list.addEventListener('click', e => {
		const btn = e.target.closest('.dock-item');
		if (btn) launch(btn.dataset.app);
	});

	list.addEventListener('keydown', e => {
		const btn = e.target.closest('.dock-item');
		if (!btn || !e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
		e.preventDefault();
		move(btn.dataset.app, step(e.key));
	});

	/* Reordering by drag (mouse): the item moves among the items of its section */
	list.addEventListener('pointerdown', e => {
		const btn = e.target.closest('.dock-item');
		if (e.pointerType !== 'mouse' || e.button !== 0 || !btn || !isPinned(btn.dataset.app)) return;
		const id = realId(btn.dataset.app);
		const li = btn.parentElement;
		const sx = e.clientX;
		let active = false;

		/* The items of the same section, in their current DOM order */
		const peers = () => [...list.querySelectorAll('.dock-item')]
			.filter(b => b !== btn && isPinned(b.dataset.app) && isLink(b.dataset.app) === isLink(id))
			.map(b => b.parentElement);

		const onMove = ev => {
			if (!active) {
				if (Math.abs(ev.clientX - sx) < 6) return;
				active = true;
				li.classList.add('is-dragging');
				document.body.classList.add('dock-dragging');
			}
			const others = peers();
			/* The first peer (in list order) the pointer is before — visually left of its centre, or right in RTL */
			const next = others.find(o => {
				const r = o.getBoundingClientRect();
				return rtl() ? ev.clientX > r.left + r.width / 2 : ev.clientX < r.left + r.width / 2;
			});
			if (next) {
				if (li.nextElementSibling !== next) list.insertBefore(li, next);
			} else {
				const last = others.at(-1);
				if (last && last.nextElementSibling !== li) last.after(li);
			}
		};

		/* Listeners on the document: moving the item in the DOM would drop a pointer capture */
		const onUp = () => {
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', onUp);
			document.removeEventListener('pointercancel', onUp);
			if (!active) return;
			li.classList.remove('is-dragging');
			document.body.classList.remove('dock-dragging');
			dragged = true;
			setTimeout(() => { dragged = false; }, 0);
			const order = [...list.querySelectorAll('.dock-item')].map(b => realId(b.dataset.app))
				.filter(x => isPinned(x) && isLink(x) === isLink(id));
			const section = pins().filter(x => visible(x) && isLink(x) === isLink(id));
			/* Links are not in the DOM on phones — their stored order stays then */
			if (order.length === section.length && order.join() !== section.join()) {
				save([...order, ...pins().filter(x => !order.includes(x))]);
			}
			render(true);
		};

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp);
		document.addEventListener('pointercancel', onUp);
	});

	/* The click that ends a drag must not launch the app */
	list.addEventListener('click', e => {
		if (!dragged) return;
		e.stopImmediatePropagation();
		e.preventDefault();
	}, true);

	const quiet = () => render();
	for (const name of ['apps:change', 'window:close', 'window:minimize', 'window:focus', 'trash:change', 'vault:change']) on(name, quiet);
	on('window:open', ({ win, restore } = {}) => {
		if (restore || !win) render();
		else bounce(win.app.id);
	});
	const relabel = () => {
		dockEl.setAttribute('aria-label', t('core.dock'));
		render(true);
	};
	on('lang:change', relabel);
	on('env:compact', () => render(true));
	on('service:provide', ({ name } = {}) => { if (name === 'launcher' || name === 'trash') render(true); });
	on('store:change', ({ name, external } = {}) => {
		if (name === PINS_KEY && external) {
			loadPins();
			render();
		}
		if (name === SIZE_KEY || name === MAGNIFY_KEY) applyPrefs();
	});
	const reload = () => {
		loadPins();
		applyPrefs();
		render(true);
	};
	on('storage:reset', reload);
	on('storage:restore', reload);
	relabel();
}

/** Binds the dock to #dock / #dock-list. Returns the service object (Desk.dock). */
export function initDock() {
	dockEl = document.getElementById('dock');
	list = document.getElementById('dock-list');
	if (!dockEl || !list) return null;
	loadPins();
	applyPrefs();
	wireEvents();
	return Object.freeze({
		render, bounce, tileFor, isPinned, canPin, canMove, move, pin, unpin, reset,
		pins: () => [...pins()],
		get isCustom() { return custom !== null; },
		size, setSize, magnify, setMagnify, sizes: () => [...SIZES]
	});
}
