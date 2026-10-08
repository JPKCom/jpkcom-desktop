/* JPKCom Desktop — window manager: windows, kinds, focus, drag, resize, layouts — © Jean Pierre Kolb — MIT License

   One window per app id. A window is a named dialog (section[role=dialog])
   with a title bar (window controls, title, optional action buttons) and a
   body whose content comes from the app's window KIND:

     defineKind('web',  {...})   iframe window (built in, below)
     defineKind('app',  {...})   interactive app — the module's mount/focus/relabel/… hooks (built in)
     defineKind('native', {...}) panel of a core part — render() rebuilt per language, or app hooks (built in)
     'page', 'image', 'viewer', 'collection', …  registered by their modules

   The core never knows a concrete kind, module or service: the dock, the
   snap preview, the tile menu, the title fitting, the overview and the
   session hook in through the bus ('window:*' events), decorators
   (addDecorator), drag handlers (addDragHandler) and services looked up at
   the moment of use (dock.tileFor, shortcuts.watch, overview.toggle).
   This file imports core modules only, so any module may import it.

   Geometry: every window keeps a free rectangle (win.rect, workspace
   pixels). What is shown follows from the layout: compact mode → a card
   above the dock; 'max' → the whole area; 'left'/'right' → a half. Inline
   geometry is set through CSSOM (el.style.left …), which the CSP allows.

   The contract (signatures, the window object, events, hook points) is in
   docs/ARCHITECTURE.md → "WM API". */

import { config } from '../core/config.js';
import { ROOT, isCompact, reduceMotion, clamp } from '../core/env.js';
import { emit, on } from '../core/bus.js';
import { t, L } from '../core/i18n.js';
import { h, markLang } from '../core/dom.js';
import { icon, tile } from '../core/icons.js';
import { registry } from '../core/registry.js';
import { acceptPath } from '../core/router.js';
import { get as service, has as hasService } from '../core/services.js';
import { track as trackSetup, tracking } from '../core/undo.js';
import { windowStyles } from '../core/modules.js';

const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const LAYOUTS = ['max', 'left', 'right'];
const DIRS = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
/* "Page title | Site name" → "Page title" (iframe titles) */
const TITLE_SPLIT = /\s+[|—–-]\s+/;

const kinds = new Map();          // kind → definition
const wins = new Map();           // app id → window
const decorators = new Set();     // { wire, unwire, relabel, beforeZoom }
const dragHandlers = new Set();   // { start, move, end }

let workspace = null;
let layer = null;
let dockEl = null;
let ready = false;
let zTop = 10;
let uid = 0;
let cascadeN = 0;
let active = null;

const ANIM = () => config.ui.animMs;
const [MIN_W, MIN_H] = config.wm.minSize;

function report(where, err) {
	console.error(`[wm] ${where} failed:`, err);
}

/*
 * Calls a hook of the window's kind; a throwing hook is reported, never fatal. While the
 * window code still loads (win.pending): serialize answers with the state it was opened
 * with (a session saved meanwhile keeps it), reopen options wait for the mount, the rest
 * waits for nothing — there is no content yet.
 */
function hook(win, name, ...args) {
	if (win?.pending) {
		if (name === 'serialize') return win.pending.state;
		if (name === 'reopen') win.pending.reopen = { ...win.pending.reopen, ...args[0] };
		return undefined;
	}
	const fn = win?.def?.[name];
	if (typeof fn !== 'function') return undefined;
	try {
		return fn(win, ...args);
	} catch (err) {
		report(`'${win.app.kind}'.${name}() of '${win.app.id}'`, err);
		return undefined;
	}
}

function decorate(win, name) {
	for (const d of decorators) {
		try {
			d[name]?.(win);
		} catch (err) {
			report(`decorator ${name}()`, err);
		}
	}
}

const changed = (win, reason) => emit('window:change', { win, reason });

/* ============================================================
   Geometry
   ============================================================ */

/**
 * The area windows may use, in workspace pixels: the workspace above the
 * dock, measured from the dock's real top edge (its distance to the bottom
 * follows the safe area and the installed app). No dock → the whole workspace.
 */
export function area() {
	if (!workspace) return { w: 0, h: 0 };
	const ws = workspace.getBoundingClientRect();
	const d = dockEl?.getBoundingClientRect();
	const dockSpace = d && d.height > 0 && d.top > ws.top && d.top < ws.bottom ? ws.bottom - d.top + 8 : 0;
	return { w: workspace.clientWidth, h: Math.max(160, workspace.clientHeight - dockSpace) };
}

/* Compact mode: every window is a card filling the space above the dock */
function cardRect() {
	const a = area();
	return { x: 6, y: 6, w: a.w - 12, h: a.h - 6 };
}

/** The rectangle of a layout: 'max' (whole area) or 'left'/'right' (half, full height). */
export function layoutRect(layout) {
	const a = area();
	if (layout === 'max') return { x: 0, y: 0, w: a.w, h: a.h };
	const gap = config.wm.gap;
	const w = Math.floor((a.w - gap * 3) / 2);
	return { x: layout === 'left' ? gap : a.w - gap - w, y: gap, w, h: a.h - gap * 2 };
}

/** The rectangle a window is shown at right now (compact card, layout or its free rect). */
export function rectOf(win) {
	if (isCompact()) return cardRect();
	if (win.layout) return layoutRect(win.layout);
	return win.rect;
}

function apply(win) {
	const r = rectOf(win);
	const s = win.el.style;
	s.left = `${Math.round(r.x)}px`;
	s.top = `${Math.round(r.y)}px`;
	s.width = `${Math.round(r.w)}px`;
	s.height = `${Math.round(r.h)}px`;
}

/** Runs fn with geometry/transform transitions on (skipped with reduced motion). */
export function animate(win, fn) {
	if (reduceMotion()) {
		fn();
		return;
	}
	win.el.classList.add('is-anim');
	fn();
	clearTimeout(win.animTimer);
	win.animTimer = setTimeout(() => win.el.classList.remove('is-anim'), ANIM() + 30);
}

function initialRect(app) {
	const a = area();
	const [cw, ch] = config.wm.defaultSize;
	const [dw, dh] = app.size ?? [Math.min(cw, a.w * 0.78), Math.min(ch, a.h * 0.86)];
	const w = Math.min(dw, a.w - 16);
	const hgt = Math.min(dh, a.h - 16);
	const step = config.wm.cascade;
	const off = (cascadeN++ % 6) * step - step * 2.5;
	return {
		x: clamp(Math.round((a.w - w) / 2) + off, 8, a.w - w - 8),
		y: clamp(Math.round((a.h - hgt) * 0.3) + off + step * 2.5, 8, a.h - hgt - 8),
		w, h: hgt
	};
}

/**
 * The free rectangle of a window (a copy); with r, sets it (minimum size
 * from config.wm.minSize) and shows it — the session restores through this.
 */
export function rect(win, r) {
	if (!win) return null;
	if (r && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k]))) {
		const fixed = win.app.fixed;
		win.rect = {
			x: r.x, y: r.y,
			w: fixed ? win.rect.w : Math.max(MIN_W, r.w),
			h: fixed ? win.rect.h : Math.max(MIN_H, r.h)
		};
		apply(win);
		changed(win, 'geometry');
	}
	return { ...win.rect };
}

/* ============================================================
   Kinds
   ============================================================ */

/**
 * Registers a window kind. def: { mount(win, body, bar, opts) (required),
 * focus, relabel, unmount, reopen, serialize, restore, locationOf, acceptUrl,
 * reload, popOut, canPopOut, canLink, menu, beforeClose } — all called with the window first.
 * canPopOut?(win) → boolean: false hides "Open in new tab" for this one window
 * (e.g. a file from the device in a blob: URL) and makes popOut() a no-op.
 * canLink?(win) → boolean: false hides "Copy link to this window" while what the
 * window shows has no address (a file from the device — the link would only
 * reopen the empty app).
 * Returns false (and warns) for an invalid or duplicate kind.
 * Defined during a module's setup() that then throws, the kind is withdrawn
 * again (core/undo.js) and 'wm:kind' { kind, removed: true } is emitted.
 */
export function defineKind(kind, def) {
	if (typeof kind !== 'string' || !KIND.test(kind) || (typeof def?.mount !== 'function' && typeof def?.load !== 'function')) {
		console.warn(`[wm] defineKind('${kind}'): needs a kind [a-z0-9-] and a mount() or load() function — skipped`);
		return false;
	}
	if (kinds.has(kind)) {
		console.warn(`[wm] window kind '${kind}' is defined twice — the second definition is ignored`);
		return false;
	}
	const frozen = Object.freeze({ ...def });
	kinds.set(kind, frozen);
	if (tracking()) kindOwners.set(kind, tracking());
	trackSetup(() => {
		if (kinds.get(kind) !== frozen) return;
		kinds.delete(kind);
		emit('wm:kind', { kind, removed: true });
	});
	emit('wm:kind', { kind });
	return true;
}

/* Hooks a kind definition may have (load() brings the ones it leaves out) */
const KIND_HOOKS = ['mount', 'focus', 'relabel', 'unmount', 'reopen', 'serialize', 'restore', 'locationOf', 'acceptUrl',
	'reload', 'popOut', 'canPopOut', 'canLink', 'menu', 'beforeClose'];
const kindLoads = new Map(); // kind → Promise of the complete definition while load() runs
const kindOwners = new Map(); // kind → id of the module whose setup() defined it (its windowStyles come along)

/**
 * A kind defined with load() (its window code on demand): load it once and put the complete
 * definition in place — the hooks given to defineKind() win over loaded ones. → Promise<def>;
 * a failed load is tried again next time.
 */
function loadKind(kind) {
	const stub = kinds.get(kind);
	if (typeof stub?.load !== 'function') return Promise.resolve(stub ?? null);
	if (kindLoads.has(kind)) return kindLoads.get(kind);
	const p = Promise.all([Promise.resolve().then(() => stub.load()), windowStyles(kindOwners.get(kind))]).then(([value]) => {
		const src = value && typeof value === 'object' && value.default && typeof value.default === 'object' ? value.default : value;
		const loaded = {};
		for (const k of KIND_HOOKS) if (typeof src?.[k] === 'function') loaded[k] = src[k];
		const { load, ...own } = stub;
		const def = Object.freeze({ ...loaded, ...own });
		if (typeof def.mount !== 'function') throw new Error(`window kind '${kind}': load() gave no mount()`);
		if (kinds.get(kind) === stub) kinds.set(kind, def);
		return kinds.get(kind);
	}).finally(() => kindLoads.delete(kind));
	kindLoads.set(kind, p);
	return p;
}

export const hasKind = kind => kinds.has(kind);
export const listKinds = () => [...kinds.keys()];
/** A kind's definition (frozen) or null — for tests and diagnostics. */
export const kindDef = kind => kinds.get(kind) ?? null;

/* ============================================================
   Window object
   ============================================================ */

function makeButton({ icon: glyph, label, onClick, pressed = null, cls = null, disabled = false }) {
	return h('button', {
		type: 'button', class: ['win-btn', cls], 'aria-label': label, title: label,
		'aria-pressed': pressed == null ? null : String(!!pressed), disabled, onclick: onClick
	}, glyph ? icon(glyph) : null);
}

function createWin(app, def, opts) {
	const n = ++uid;
	const id = `win-${n}`;
	const titleId = `${id}-title`;
	const el = h('section', {
		id,
		class: ['win', `win-${app.kind}`, app.fixed && 'is-fixed', !(reduceMotion() || opts.restore) && 'is-opening'],
		role: 'dialog', 'aria-labelledby': titleId, tabindex: '-1', dataset: { app: app.id }
	});

	const win = {
		id, app, kind: app.kind, def, el,
		impl: registry.impl(app),
		/* Promise<boolean>: true once the content is mounted, false when it could not be built (open()) */
		ready: null,
		/* While the window code loads (app field load): { state, reopen } — what open() and reopen() asked for */
		pending: null,
		rect: initialRect(app),
		layout: null,
		min: false,
		url: null,
		frame: null,
		state: {},

		get max() { return this.layout === 'max'; },
		get tile() { return this.layout === 'left' || this.layout === 'right' ? this.layout : null; },
		get title() { return this.titleText.textContent; },
		get isActive() { return active === this; },

		setTitle: (text, lang) => setTitle(win, text, lang),
		/** The .win-actions container at the end of the title bar (created on first use) */
		actions() {
			let box = win.bar.querySelector(':scope > .win-actions');
			if (!box) {
				box = h('div', { class: 'win-actions' });
				win.bar.append(box);
			}
			return box;
		},
		addActions(...nodes) {
			const box = win.actions();
			box.append(...nodes.flat().filter(Boolean));
			return box;
		},
		/** A title-bar button: { icon, label, onClick, pressed?, cls?, disabled? } — label is its accessible name */
		button: makeButton,
		close: opts2 => close(win, opts2),
		show: () => show(win),
		minimize: opts2 => minimize(win, opts2),
		toggleMax: () => toggleMax(win),
		changed: (reason = 'state') => changed(win, reason)
	};

	const ctl = (kind, glyph, key, run) => h('button', {
		type: 'button', class: `wc wc-${kind}`, 'aria-label': t(key), onclick: run
	}, icon(glyph));
	const zoom = ctl('max', 'wc-max', 'wm.zoom', () => {
		for (const d of decorators) if (d.beforeZoom?.(win) === false) return;
		toggleMax(win);
	});
	zoom.disabled = !!app.fixed;
	win.controls = h('div', { class: 'win-controls' },
		ctl('close', 'wc-close', 'wm.close', () => close(win)),
		ctl('min', 'wc-min', 'wm.minimize', () => minimize(win)),
		zoom);
	win.titleText = markLang(h('span', { class: 'win-title-text', text: registry.name(app) }), registry.nameLang(app));
	win.titleEl = h('h2', { class: 'win-title', id: titleId }, tile(app), win.titleText);
	win.bar = h('header', { class: 'win-bar' }, win.controls, win.titleEl);
	win.body = h('div', { class: 'win-body' });
	return win;
}

/**
 * Sets the title shown in the title bar (null → the app's name). lang: the title's language
 * when it is known to differ from the page's (a page's own lang, i18n.resolve() → lang);
 * the app's name brings its own.
 */
export function setTitle(win, text, lang = null) {
	if (!win) return;
	const own = text == null || text === '';
	const next = own ? registry.name(win.app) : String(text);
	markLang(win.titleText, own ? registry.nameLang(win.app) : lang);
	if (win.titleText.textContent === next) return;
	win.titleText.textContent = next;
	if (win === active) syncDocTitle();
	changed(win, 'title');
}

function syncDocTitle() {
	if (typeof document === 'undefined') return;
	document.title = active ? t('wm.docTitle', { name: registry.name(active.app), brand: config.brand.name }) : config.brand.name;
}

/* ============================================================
   Open
   ============================================================ */

/**
 * Opens the app's window, or shows it when it is open already (then the
 * kind's reopen(win, opts) gets the new options, e.g. a URL for the Reader).
 * opts: { url, scroll, state, restore } — restore: true for session restores
 * (no open animation, 'window:open' carries restore: true).
 * Returns the window, or null (unknown app, missing implementation or kind).
 * An app whose window code is loaded on demand (registry implReady false) opens at once
 * with a spinner and mounts when the code is there; win.ready → Promise<boolean> tells
 * when the content is built (true) or could not be (false), for every window.
 */
export function open(appOrId, opts = {}) {
	if (!ready) {
		console.warn('[wm] open() before the window manager was set up');
		return null;
	}
	const app = typeof appOrId === 'string' ? registry.get(appOrId) : appOrId;
	if (!app?.id) return null;
	if (app.alias) return open(app.alias, opts);

	const existing = wins.get(app.id);
	if (existing) {
		show(existing);
		if (opts && Object.keys(opts).length) hook(existing, 'reopen', opts);
		return existing;
	}
	if (!registry.available(app)) return null;
	const def = kinds.get(app.kind);
	if (!def) {
		console.warn(`[wm] no window kind '${app.kind}' for app '${app.id}' — is the module that defines it loaded?`);
		return null;
	}

	const win = createWin(app, def, opts);
	const { el, bar, body } = win;
	if (registry.implReady(app) && typeof def.load !== 'function') win.ready = Promise.resolve(mountWin(win, opts));
	else win.ready = mountLater(win, opts);

	el.append(bar, body);
	if (!app.fixed) {
		for (const dir of DIRS) el.append(h('div', { class: 'rz', dataset: { dir }, 'aria-hidden': 'true' }));
	}

	wins.set(app.id, win);
	layer.append(el);
	wirePointer(win);
	decorate(win, 'wire');
	apply(win);
	focus(win);
	el.focus({ preventScroll: true });
	hook(win, 'focus');

	if (!reduceMotion() && !opts.restore) {
		requestAnimationFrame(() => requestAnimationFrame(() => {
			animate(win, () => el.classList.remove('is-opening'));
		}));
	}
	emit('window:open', { win, restore: !!opts.restore });
	if (!win.pending) win.ready.then(ok => emit('window:ready', { win, ok }));
	return win;
}

/* "<App> is not available" in place of the content */
function notAvailable(win) {
	win.body.replaceChildren(h('div', { class: 'panel notice' },
		tile(win.app),
		h('p', { text: t('core.notAvailable', { name: registry.name(win.app) }) })));
}

/* Builds the content through the kind (mount, then restore of opts.state); a failure leaves a notice. → ok */
function mountWin(win, opts) {
	try {
		win.def.mount(win, win.body, win.bar, opts);
		if (opts.state != null) win.def.restore?.(win, opts.state);
		return true;
	} catch (err) {
		report(`opening '${win.app.id}' (kind '${win.app.kind}')`, err);
		notAvailable(win);
		return false;
	}
}

/*
 * The window code is still loading — the app's (registry loadImpl) or the kind's (defineKind load):
 * a spinner now, mount when it is there. Meanwhile win.pending keeps what was asked for (hook()).
 * Closed before the code arrived → nothing is mounted.
 */
async function mountLater(win, opts) {
	const spinner = h('div', { class: 'win-loading', role: 'status', 'aria-label': t('core.loading') });
	win.pending = { state: opts.state ?? null, reopen: null };
	win.body.append(spinner);
	win.el.setAttribute('aria-busy', 'true');
	let loaded = false;
	try {
		const [def, impl] = await Promise.all([loadKind(win.app.kind), registry.loadImpl(win.app)]);
		if (def) win.def = def;
		win.impl = impl;
		loaded = true;
	} catch (err) {
		report(`loading the window code of '${win.app.id}'`, err);
	}
	const open = wins.get(win.app.id) === win;
	const { reopen } = win.pending;
	win.pending = null;
	win.el.removeAttribute('aria-busy');
	spinner.remove();
	if (!open) return false;
	const ok = loaded ? mountWin(win, opts) : (notAvailable(win), false);
	if (ok && reopen) hook(win, 'reopen', reopen);
	/* Focus inside only when it is still where open() put it: on the window itself */
	if (ok && active === win && !win.min && document.activeElement === win.el) hook(win, 'focus');
	emit('window:ready', { win, ok });
	return ok;
}

/* ============================================================
   Pointer: drag the title bar, resize at the edges
   ============================================================ */

function track(target, e, cursor, onMove, onEnd) {
	target.setPointerCapture?.(e.pointerId);
	document.body.classList.add('wm-busy');
	document.body.style.setProperty('--wm-cursor', cursor);
	let raf = 0;
	let last = e;
	const move = ev => {
		last = ev;
		if (!raf) raf = requestAnimationFrame(() => { raf = 0; onMove(last); });
	};
	const end = () => {
		target.removeEventListener('pointermove', move);
		target.removeEventListener('pointerup', end);
		target.removeEventListener('pointercancel', end);
		cancelAnimationFrame(raf);
		onMove(last);
		document.body.classList.remove('wm-busy');
		onEnd?.(last);
	};
	target.addEventListener('pointermove', move);
	target.addEventListener('pointerup', end);
	target.addEventListener('pointercancel', end);
}

function eachDrag(name, ...args) {
	let result = null;
	for (const d of dragHandlers) {
		try {
			const r = d[name]?.(...args);
			if (result == null && LAYOUTS.includes(r)) result = r;
		} catch (err) {
			report(`drag handler ${name}()`, err);
		}
	}
	return result;
}

function wirePointer(win) {
	const { el, bar } = win;

	el.addEventListener('pointerdown', e => {
		focus(win);
		/* The shield over an inactive iframe eats the first click — pass the focus on */
		if (e.target.closest('.win-body')) requestAnimationFrame(() => focusFrame(win));
	}, true);

	bar.addEventListener('pointerdown', e => {
		win.pointer = e.pointerType;
		if (e.button !== 0 || e.target.closest('button, a, input, select, textarea') || isCompact()) return;
		e.preventDefault();
		const sx = e.clientX;
		const sy = e.clientY;
		let base = { ...win.rect };
		let dragging = false;

		track(bar, e, 'default', ev => {
			const dx = ev.clientX - sx;
			const dy = ev.clientY - sy;
			if (!dragging) {
				if (Math.hypot(dx, dy) < 4) return;
				dragging = true;
				/* Dragging a zoomed or tiled window restores it under the pointer */
				if (win.layout) {
					const shown = rectOf(win);
					const left = workspace.getBoundingClientRect().left;
					const ratio = (sx - left - shown.x) / shown.w;
					setLayout(win, null, { quiet: true });
					base = { ...win.rect, x: sx - left - ratio * win.rect.w, y: shown.y };
				}
				eachDrag('start', win, ev);
			}
			win.rect.x = clamp(base.x + dx, 100 - win.rect.w, workspace.clientWidth - 100);
			win.rect.y = clamp(base.y + dy, 0, workspace.clientHeight - 40);
			apply(win);
			eachDrag('move', win, ev);
		}, last => {
			const zone = eachDrag('end', win, last, dragging);
			focusFrame(win);
			if (dragging) {
				if (zone) animate(win, () => setLayout(win, zone));
				else changed(win, 'geometry');
				return;
			}
			/* Touch and pen: a double tap zooms (dblclick is unreliable there) */
			if (e.pointerType === 'mouse') return;
			const now = Date.now();
			if (now - (win.lastTap || 0) < config.wm.doubleTapMs) {
				win.lastTap = 0;
				toggleMax(win);
			} else {
				win.lastTap = now;
			}
		});
	});

	bar.addEventListener('dblclick', e => {
		if (win.pointer === 'mouse' && !e.target.closest('button, a, input, select, textarea')) toggleMax(win);
	});

	for (const handle of el.querySelectorAll(':scope > .rz')) {
		handle.addEventListener('pointerdown', e => {
			if (e.button !== 0) return;
			e.preventDefault();
			const dir = handle.dataset.dir;
			const start = { ...win.rect };
			const sx = e.clientX;
			const sy = e.clientY;
			const cursor = getComputedStyle(handle).cursor;

			track(handle, e, cursor, ev => {
				const dx = ev.clientX - sx;
				const dy = ev.clientY - sy;
				const r = { ...start };
				if (dir.includes('e')) r.w = clamp(start.w + dx, MIN_W, workspace.clientWidth - start.x);
				if (dir.includes('s')) r.h = clamp(start.h + dy, MIN_H, workspace.clientHeight - start.y);
				if (dir.includes('w')) {
					r.w = clamp(start.w - dx, MIN_W, start.x + start.w);
					r.x = start.x + start.w - r.w;
				}
				if (dir.includes('n')) {
					r.h = clamp(start.h - dy, MIN_H, start.y + start.h);
					r.y = start.y + start.h - r.h;
				}
				win.rect = r;
				apply(win);
			}, () => changed(win, 'geometry'));
		});
	}
}

/* ============================================================
   Focus, show, layouts, minimise, close
   ============================================================ */

/** Keyboard input of a web window belongs to the page inside (games!), not to the desktop */
function focusFrame(win) {
	if (!win?.frame || win !== active) return;
	try {
		win.frame.contentWindow.focus();
	} catch {
		win.frame.focus();
	}
}

/** Brings a window to the front and marks it active (null: no active window). */
export function focus(win) {
	const next = win && wins.get(win.app.id) === win ? win : null;
	if (next && next !== active) next.el.style.zIndex = String(++zTop);
	const switched = next !== active;
	active = next;
	for (const w of wins.values()) w.el.classList.toggle('is-active', w === active);
	if (switched) {
		syncDocTitle();
		emit('window:focus', { win: active });
	}
}

/** The stacking position of a window (higher = in front). */
export const zOf = w => Number(w?.el?.style.zIndex) || 0;

/** Every window from the back to the front (z-order; minimised ones included). */
export const stack = () => [...wins.values()].sort((a, b) => zOf(a) - zOf(b));

/** Focuses the topmost visible window (or none). */
export function focusTop() {
	let top = null;
	for (const w of wins.values()) if (!w.min && (!top || zOf(w) > zOf(top))) top = w;
	focus(top);
	return top;
}

/** Shows a window: brings it back from the dock, to the front, focus inside. */
export function show(win) {
	if (!win || wins.get(win.app.id) !== win) return;
	if (win.min) unminimize(win);
	focus(win);
	win.el.focus({ preventScroll: true });
	focusFrame(win);
	hook(win, 'focus');
}

/**
 * Sets the layout: null (free), 'max', 'left' or 'right'. Without animation;
 * wrap it in animate(win, …) for the transition. Fixed windows stay free.
 */
export function setLayout(win, layout, { quiet = false } = {}) {
	if (!win) return;
	const next = LAYOUTS.includes(layout) && !win.app.fixed ? layout : null;
	win.layout = next;
	win.el.classList.toggle('is-max', next === 'max');
	win.el.classList.toggle('is-tiled', next === 'left' || next === 'right');
	if (next) win.el.dataset.layout = next;
	else delete win.el.dataset.layout;
	apply(win);
	if (!quiet) changed(win, 'layout');
}

/** Animated layout change (the public form): layout(win, 'left' | 'right' | 'max' | null) */
export function layout(win, next) {
	if (!win || win.app.fixed || isCompact()) return;
	if (win.min) unminimize(win);
	animate(win, () => setLayout(win, next));
}

export function toggleMax(win) {
	if (!win || win.app.fixed || isCompact()) return;
	animate(win, () => setLayout(win, win.max ? null : 'max'));
}

/** Half of the screen; the same side again frees the window. */
export function snapTo(win, side) {
	if (!win || win.app.fixed || isCompact() || (side !== 'left' && side !== 'right')) return;
	if (win.min) unminimize(win);
	animate(win, () => setLayout(win, win.tile === side ? null : side));
}

/** The active window goes left, the next visible one right. */
export function tileBoth() {
	if (isCompact()) return;
	const order = [...wins.values()]
		.filter(w => !w.min && !w.app.fixed)
		.sort((a, b) => (b === active) - (a === active) || zOf(b) - zOf(a));
	const [first, second] = order;
	if (first) animate(first, () => setLayout(first, 'left'));
	if (second) {
		animate(second, () => setLayout(second, 'right'));
		second.el.style.zIndex = String(++zTop);
	}
	if (first) focus(first);
}

/* Offset from the window centre to its dock tile, for the "into the dock" effect */
function dockVector(win) {
	let target = null;
	try {
		target = service('dock')?.tileFor?.(win.app.id) ?? null;
	} catch { /* no dock */ }
	if (!target?.getBoundingClientRect) return null;
	const r = win.el.getBoundingClientRect();
	const d = target.getBoundingClientRect();
	if (!r.width || !d.width) return null;
	return {
		x: d.left + d.width / 2 - (r.left + r.width / 2),
		y: d.top + d.height / 2 - (r.top + r.height / 2),
		s: Math.max(0.04, d.width / r.width)
	};
}

/**
 * Puts a window into the dock (it shrinks towards its dock tile when the dock
 * offers one). { animate: false }: hidden at once, without the effect — the
 * session restore minimises this way ('window:minimize' is emitted all the same).
 */
export function minimize(win, { animate: anim = true } = {}) {
	if (!win || win.min || wins.get(win.app.id) !== win) return;
	const hadFocus = win.el.contains(document.activeElement);
	win.min = true;
	const v = !anim || reduceMotion() ? null : dockVector(win);
	if (v) {
		animate(win, () => {
			win.el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
			win.el.style.opacity = '0';
		});
		setTimeout(() => { if (win.min) win.el.classList.add('is-min'); }, ANIM());
	} else {
		win.el.classList.add('is-min');
	}
	const top = active === win ? focusTop() : null;
	emit('window:minimize', { win, min: true });
	if (hadFocus) refocus(top, win.app.id);
	changed(win, 'min');
}

/**
 * The focus was in a window that just went (closed, minimised): on to the next window
 * in front, else the app's dock item (where a minimised window went), else the
 * workspace (tabindex -1) — never down to <body>, where Tab starts over at the top.
 */
function refocus(top, appId) {
	if (top && !top.min) {
		top.el.focus({ preventScroll: true });
		return;
	}
	let item = null;
	try {
		item = service('dock')?.tileFor?.(appId)?.closest('button, [tabindex]') ?? null;
	} catch { /* no dock */ }
	(item?.isConnected ? item : workspace)?.focus({ preventScroll: true });
}

/** Brings a minimised window back (without focusing it — show() does both). */
export function unminimize(win) {
	if (!win?.min) return;
	win.min = false;
	win.el.classList.remove('is-min');
	animate(win, () => {
		win.el.style.transform = '';
		win.el.style.opacity = '';
	});
	emit('window:minimize', { win, min: false });
	changed(win, 'min');
}

/**
 * Closes a window. The kind's beforeClose(win) may veto (false) or decide
 * later (a Promise of a boolean); { force: true } skips it.
 * Returns true when the window is gone now.
 */
export function close(win, { force = false } = {}) {
	if (!win || wins.get(win.app.id) !== win) return false;
	if (!force && !win.pending && typeof win.def.beforeClose === 'function') {
		const ok = hook(win, 'beforeClose');
		if (ok === false) return false;
		if (ok && typeof ok.then === 'function') {
			ok.then(r => { if (r !== false) close(win, { force: true }); },
				err => report(`beforeClose of '${win.app.id}'`, err));
			return false;
		}
	}
	const hadFocus = win.el.contains(document.activeElement);
	decorate(win, 'unwire');
	hook(win, 'unmount');
	wins.delete(win.app.id);
	const top = active === win ? focusTop() : null;
	emit('window:close', { win });
	/* After the event: the dock has dropped the tile of an app that is not pinned by then */
	if (hadFocus) refocus(top, win.app.id);
	if (reduceMotion()) {
		win.el.remove();
	} else {
		animate(win, () => win.el.classList.add('is-closing'));
		setTimeout(() => win.el.remove(), ANIM());
	}
	return true;
}

/** Closes every window (each one's beforeClose still asks). */
export function closeAll() {
	for (const w of [...wins.values()]) close(w);
}

/** Keeps windows reachable after the viewport changed (also on 'env:compact'). */
export function relayout() {
	if (!workspace) return;
	for (const w of wins.values()) {
		w.rect.w = Math.min(w.rect.w, workspace.clientWidth);
		w.rect.x = clamp(w.rect.x, 100 - w.rect.w, workspace.clientWidth - 100);
		w.rect.y = clamp(w.rect.y, 0, workspace.clientHeight - 40);
		apply(w);
	}
}

/**
 * Language switch: window controls, decorators (title fitting, tile menu)
 * and the kind of every window relabel themselves. A kind without relabel()
 * gets the app name back as its title.
 */
export function relabel() {
	for (const w of wins.values()) {
		/* By class, not position: decorators may add nodes to .win-controls (tile menu) */
		for (const [cls, key] of [['.wc-close', 'wm.close'], ['.wc-min', 'wm.minimize'], ['.wc-max', 'wm.zoom']]) {
			w.controls.querySelector(cls)?.setAttribute('aria-label', t(key));
		}
		decorate(w, 'relabel');
		if (typeof w.def.relabel === 'function') hook(w, 'relabel');
		else setTitle(w, null);
	}
	syncDocTitle();
}

/** The front window goes to the back (dir 1) or the back one to the front (dir -1). */
export function cycle(dir = 1) {
	const list = [...wins.values()].filter(w => !w.min).sort((a, b) => zOf(b) - zOf(a));
	if (list.length < 2) return;
	const order = dir > 0 ? [...list.slice(1), list[0]] : [list.at(-1), ...list.slice(0, -1)];
	for (const w of [...order].reverse()) w.el.style.zIndex = String(++zTop);
	show(order[0]);
}

/* ============================================================
   Content helpers that go through the kind
   ============================================================ */

export function reload(win) {
	if (win) hook(win, 'reload');
}

/**
 * Whether the window may open in a new tab: false without a window, for a kind
 * without popOut() and without a location, or when the kind's canPopOut(win)
 * says false (per window — kind definitions are frozen). Defaults to true.
 */
export function canPopOut(win) {
	if (!win?.def || win.pending) return false;
	if (typeof win.def.popOut !== 'function' && !locationOf(win)) return false;
	if (typeof win.def.canPopOut !== 'function') return true;
	/* A failing check counts as "no": the gate protects files from the device */
	try {
		return win.def.canPopOut(win) !== false;
	} catch (err) {
		report(`'${win.app.kind}'.canPopOut() of '${win.app.id}'`, err);
		return false;
	}
}

/**
 * Whether a link to the window leads back to what it shows: false without a
 * window, or when the kind's canLink(win) says false (or throws) — a file from
 * the device has no address. Defaults to true (#app=<id> reopens the app).
 */
export function canLink(win) {
	if (!win?.def) return false;
	if (win.pending || typeof win.def.canLink !== 'function') return true;
	try {
		return win.def.canLink(win) !== false;
	} catch (err) {
		report(`'${win.app.kind}'.canLink() of '${win.app.id}'`, err);
		return false;
	}
}

/** Opens the window's current location in a new tab (the kind's popOut, else locationOf) — never when canPopOut(win) is false. */
export function popOut(win) {
	if (!canPopOut(win)) return;
	if (typeof win.def.popOut === 'function') {
		hook(win, 'popOut');
		return;
	}
	const loc = locationOf(win);
	if (loc) window.open(new URL(loc, location.href).href, '_blank', 'noopener');
}

/** Where the window is right now, as a same-origin path + query (address bar, session, links), or null. */
export function locationOf(win) {
	const href = win ? hook(win, 'locationOf') : null;
	if (typeof href !== 'string' || !href) return null;
	try {
		const url = new URL(href, location.href);
		return url.origin === location.origin ? url.pathname + url.search : null;
	} catch {
		return null;
	}
}

/** The kind's serializable state of a window (JSON-safe) or null. */
export function serialize(win) {
	const state = win ? hook(win, 'serialize') : null;
	if (state == null) return null;
	try {
		return JSON.parse(JSON.stringify(state));
	} catch {
		return null;
	}
}

/* Where a path for acceptUrl comes from */
const FROM = new Set(['session', 'launch', 'link']);

/**
 * Checks a stored/linked path for an app (session restore, deep links, launch with a url):
 * the kind's acceptUrl(app, path, from) → path | null. Kinds without it accept none.
 * from: 'session' (written by the visitor's own navigation), 'launch' (code: launch(id, { url })),
 * 'link' (a deep link: anyone can write it); an unknown value counts as 'link'.
 */
export function acceptUrl(app, path, from = 'launch') {
	if (typeof path !== 'string' || path.length > 500 || !/^\/(?!\/)/.test(path)) return null;
	const fn = kinds.get(app?.kind)?.acceptUrl;
	if (typeof fn !== 'function') return null;
	try {
		return fn(app, path, FROM.has(from) ? from : 'link') ?? null;
	} catch {
		return null;
	}
}

/* ============================================================
   Hook points for the other packages
   ============================================================ */

/**
 * A decorator joins every window (open ones at once): { wire(win), unwire?(win),
 * relabel?(win), beforeZoom?(win) → false cancels the zoom button }.
 * Used by the title fitting (shell) and the tile menu (wm). Returns remove().
 */
export function addDecorator(dec) {
	if (!dec || typeof dec.wire !== 'function') throw new TypeError('wm.addDecorator(): wire(win) is required');
	decorators.add(dec);
	for (const w of wins.values()) {
		try {
			dec.wire(w);
		} catch (err) {
			report('decorator wire()', err);
		}
	}
	return () => {
		decorators.delete(dec);
		for (const w of wins.values()) {
			try {
				dec.unwire?.(w);
			} catch { /* ignore */ }
		}
	};
}

/**
 * A drag handler follows title-bar drags: { start?(win, ev), move?(win, ev),
 * end?(win, ev, dragged) → 'left' | 'right' | 'max' | null }. A layout
 * returned by end() is applied (animated) — the snap module works this way.
 * Returns remove().
 */
export function addDragHandler(handler) {
	if (!handler || typeof handler !== 'object') throw new TypeError('wm.addDragHandler(): handler object expected');
	dragHandlers.add(handler);
	return () => dragHandlers.delete(handler);
}

/** The next z-index above every window (for previews that must sit at the top window's level). */
export const topZ = () => zTop;

/* ============================================================
   Menu models (consumed by the menu bar, context menus and title fitting)
   ============================================================ */

const appName = win => registry.name(win.app);

/** Layout items for one window: minimise, zoom, left, right (title-bar context menu, Window menu). */
function layoutItems(win) {
	const free = !!win && !isCompact() && !win.app.fixed;
	return [
		{ label: t('wm.minimize'), disabled: !win || win.min, run: () => minimize(win) },
		...(isCompact() ? [] : [
			{ label: t('wm.zoom'), disabled: !free, checkbox: true, checked: !!win?.max, run: () => toggleMax(win) },
			{ label: t('wm.tileLeft'), disabled: !free, radio: true, checked: win?.tile === 'left', run: () => snapTo(win, 'left') },
			{ label: t('wm.tileRight'), disabled: !free, radio: true, checked: win?.tile === 'right', run: () => snapTo(win, 'right') }
		])
	];
}

/** The Window menu: layout of the active window, close, overview, next window, the window list. */
function windowMenu() {
	const w = active;
	const list = [...wins.values()];
	const visible = list.filter(x => !x.min);
	const overview = service('overview');
	return [
		...layoutItems(w),
		...(isCompact() ? [] : [{ label: t('wm.tileBoth'), disabled: list.filter(x => !x.app.fixed && !x.min).length < 2, run: tileBoth }]),
		{ label: t('wm.close'), disabled: !w, run: () => close(w) },
		'-',
		{ label: t('wm.closeAll'), disabled: !list.length, run: closeAll },
		'-',
		...(overview ? [{ label: t('wm.showAll'), disabled: !visible.length, run: () => overview.toggle?.() }] : []),
		{ label: t('wm.nextWindow'), disabled: visible.length < 2, run: () => cycle(1) },
		'-',
		...(list.length
			? list.map(x => ({ label: appName(x), app: x.app, radio: true, checked: x === w, run: () => show(x) }))
			: [{ label: t('wm.noWindows'), disabled: true }])
	];
}

/** The app menu of a window: the kind's menu(win) items, then "Quit <app>". */
function appMenu(win) {
	if (!win) return [];
	const own = hook(win, 'menu');
	const items = Array.isArray(own) ? own.filter(Boolean) : [];
	return [...items, ...(items.length ? ['-'] : []), { label: t('wm.quit', { name: appName(win) }), run: () => close(win) }];
}

/* ============================================================
   Built-in kinds: web (iframe), app (module hooks), native (panels)
   ============================================================ */

/* The absolute URL of an app's page in the current language (manifest paths are relative to the root) */
function appHref(app, raw = registry.url(app)) {
	try {
		return new URL(raw, ROOT).href;
	} catch {
		return null;
	}
}

/** Every start page of an app (absolute URLs): one per language for a { lang: url } map */
const startsOf = app => (typeof app.url === 'string' ? [app.url]
	: app.url && typeof app.url === 'object' ? Object.values(app.url) : [])
	.map(raw => appHref(app, raw)).filter(Boolean);

/* Mirror the iframe's location and title once it has loaded */
function syncFrame(win) {
	try {
		const doc = win.frame.contentDocument;
		const loc = win.frame.contentWindow.location;
		win.url = loc.href;
		const onStart = loc.pathname === win.state.startPath;
		const title = (doc?.title || '').split(TITLE_SPLIT)[0].trim();
		setTitle(win, onStart || !title ? null : title, doc?.documentElement?.lang || null);
	} catch {
		win.url = null;
	}
	changed(win, 'location');
}

defineKind('web', {
	mount(win, body, bar, opts) {
		const start = appHref(win.app);
		if (!start) throw new Error(`app '${win.app.id}' has no usable url`);
		const wanted = typeof opts.url === 'string' ? acceptUrl(win.app, opts.url, opts.restore ? 'session' : 'launch') : null;
		const src = wanted ? new URL(wanted, location.href).href : start;
		const own = v => (typeof v === 'string' && v ? v : null);
		const loader = h('div', { class: 'win-loading', role: 'status', 'aria-label': t('core.loading') });
		const frame = h('iframe', {
			src, title: registry.name(win.app),
			allow: own(win.app.allow) ?? own(config.wm.iframe.allow),
			sandbox: own(win.app.sandbox) ?? own(config.wm.iframe.sandbox)
		});
		frame.addEventListener('load', () => {
			loader.classList.add('is-done');
			try {
				service('shortcuts')?.watch?.(frame);
			} catch { /* cross-origin or no shortcuts */ }
			syncFrame(win);
			/* What the desktop loaded into the frame (after redirects): reopen() navigates only while it shows that */
			if (win.state.expect) {
				win.state.loaded = locationOf(win);
				win.state.expect = false;
			}
			focusFrame(win);
		});
		body.classList.add('has-frame');
		body.append(frame, loader);
		win.frame = frame;
		win.state.expect = true;
		win.state.startPath = new URL(start).pathname;
		win.state.reloadBtn = win.button({ icon: 'ti-refresh', label: t('core.reload'), onClick: () => reload(win) });
		win.state.tabBtn = win.button({ icon: 'ti-external-link', label: t('core.openTab'), onClick: () => popOut(win) });
		win.addActions(win.state.reloadBtn, win.state.tabBtn);
	},
	focus: focusFrame,
	relabel(win) {
		for (const [btn, key] of [[win.state.reloadBtn, 'core.reload'], [win.state.tabBtn, 'core.openTab']]) {
			btn.setAttribute('aria-label', t(key));
			btn.title = t(key);
		}
		win.frame.title = registry.name(win.app);
		/* A page with one URL per language follows the switch while it still shows its start page */
		if (win.app.url && typeof win.app.url === 'object') {
			let path = null;
			try {
				path = win.frame.contentWindow.location.pathname;
			} catch { /* cross-origin */ }
			const next = appHref(win.app);
			if (path === win.state.startPath && next) {
				win.state.startPath = new URL(next).pathname;
				win.state.expect = true;
				win.el.querySelector('.win-loading')?.classList.remove('is-done');
				win.frame.src = next;
			}
		} else {
			setTitle(win, win.url && new URL(win.url).pathname !== win.state.startPath ? win.title : null, win.titleText.getAttribute('lang'));
		}
	},
	reload(win) {
		win.el.querySelector('.win-loading')?.classList.remove('is-done');
		try {
			win.frame.contentWindow.location.reload();
		} catch {
			win.frame.src = win.frame.src;
		}
	},
	popOut(win) {
		window.open(win.url || appHref(win.app), '_blank', 'noopener');
	},
	locationOf(win) {
		try {
			return win.frame.contentWindow.location.href;
		} catch {
			return null;
		}
	},
	/* A deep link or launch(id, { url }) for an open window: show that location — only while the frame still
	   shows what the desktop loaded or is loading into it (a page the visitor went to may hold unsaved input).
	   A load the desktop started that has not finished (a window the session just restored) counts as untouched. */
	reopen(win, opts) {
		if (opts?.restore || typeof opts?.url !== 'string') return;
		const wanted = acceptUrl(win.app, opts.url, 'launch');
		if (!wanted) return;
		const loading = win.state.expect === true;
		const now = locationOf(win);
		if (!loading && (now == null || now !== win.state.loaded)) return;
		const target = new URL(wanted, location.href);
		if (loading ? win.frame.src === target.href : target.pathname + target.search === now) return;
		win.state.expect = true;
		win.el.querySelector('.win-loading')?.classList.remove('is-done');
		win.frame.src = target.href;
	},
	/* A stored location stays where the app lives (its scope or default folder, ARCHITECTURE §15) — never the
	   desktop itself; a deep link may carry one only when the site allows it for this app (app.linkPaths) */
	acceptUrl(app, path, from) {
		if (from === 'link' && app.linkPaths !== true) return null;
		const starts = startsOf(app);
		return starts.length ? acceptPath(starts, path, typeof app.scope === 'string' ? app.scope : null) : null;
	},
	menu(win) {
		return [
			{ label: t('core.reload'), run: () => reload(win) },
			{ label: t('core.openTab'), run: () => popOut(win) }
		];
	}
});

/* Interactive apps: every hook goes to the module's implementation (registry impl) */
const implKind = {
	mount(win, body, bar, opts) {
		if (typeof win.impl?.mount !== 'function') throw new Error(`app '${win.app.id}' has no mount()`);
		win.impl.mount(win, body, bar, opts);
	},
	focus: win => win.impl?.focus?.(win),
	relabel(win) {
		/* Apps keep their state: only labels change, never the content */
		setTitle(win, null);
		win.impl?.relabel?.(win);
	},
	unmount: win => win.impl?.unmount?.(win),
	/* open() of the open window with new options: Desk.launch('settings', { section }) */
	reopen: (win, opts) => win.impl?.reopen?.(win, opts),
	menu: win => win.impl?.menu?.(win) ?? [],
	serialize: win => win.impl?.serialize?.(win) ?? null,
	restore: (win, state) => win.impl?.restore?.(win, state),
	locationOf: win => win.impl?.locationOf?.(win) ?? null,
	/* The only hook that gets the app, not a window: a stored or linked path for an app that is not open yet */
	acceptUrl: (app, path, from) => registry.impl(app)?.acceptUrl?.(app, path, from) ?? null,
	reload: win => win.impl?.reload?.(win),
	/* Only when the implementation can open something: its own popOut() or a location — and its
	   canPopOut(win) does not say no (the window manager's canPopOut() catches a failing check) */
	canPopOut: win => (typeof win.impl?.popOut === 'function' || !!win.impl?.locationOf?.(win))
		&& (typeof win.impl?.canPopOut !== 'function' || win.impl.canPopOut(win) !== false),
	canLink: win => typeof win.impl?.canLink !== 'function' || win.impl.canLink(win) !== false,
	popOut(win) {
		if (!canPopOut(win)) return;
		if (typeof win.impl?.popOut === 'function') {
			win.impl.popOut(win);
			return;
		}
		const loc = locationOf(win);
		if (loc) window.open(new URL(loc, location.href).href, '_blank', 'noopener');
	},
	beforeClose: win => (typeof win.impl?.beforeClose === 'function' ? win.impl.beforeClose(win) : true)
};

defineKind('app', implKind);

/* Panels (settings, wallpaper, about, …): render(win) → Node is rebuilt on a
   language switch; a panel with mount() instead behaves like an app */
defineKind('native', {
	...implKind,
	mount(win, body, bar, opts) {
		if (typeof win.impl?.render === 'function') body.append(win.impl.render(win));
		else implKind.mount(win, body, bar, opts);
	},
	relabel(win) {
		setTitle(win, null);
		if (typeof win.impl?.render === 'function') win.body.replaceChildren(win.impl.render(win));
		else win.impl?.relabel?.(win);
	}
});

/* ============================================================
   Setup and the public object
   ============================================================ */

/** Binds the window manager to the shell DOM (#workspace, #windows, #dock). Called once by src/wm/index.js. */
export function initWM() {
	if (ready) return;
	workspace = document.getElementById('workspace');
	layer = document.getElementById('windows');
	dockEl = document.getElementById('dock');
	if (!workspace || !layer) throw new Error('the shell markup needs #workspace and #windows');
	ready = true;
	/* The focus can rest on the desktop itself (refocus() after the last window went) */
	workspace.tabIndex = -1;

	/* overflow: hidden still scrolls when focus() reaches an element outside the bounds —
	   that would shift every window and desktop icon; pin both layers at 0/0 */
	for (const el of [workspace, layer]) {
		el.addEventListener('scroll', () => {
			if (el.scrollTop || el.scrollLeft) {
				el.scrollTop = 0;
				el.scrollLeft = 0;
			}
		});
	}

	/* The CSS minimum follows config.wm.minSize (wm.css: --win-min-w / --win-min-h) */
	document.documentElement.style.setProperty('--win-min-w', `${MIN_W}px`);
	document.documentElement.style.setProperty('--win-min-h', `${MIN_H}px`);

	/* Apps of a kind nobody can open (Reader, viewer or Catalog not loaded) are not available:
	   they leave All apps, the dock, menus and search instead of failing on click */
	registry.setKindCheck(kind => kind === 'link' || (kind === 'launcher' ? hasService('launcher') : kinds.has(kind)));
	on('wm:kind', () => registry.refresh());
	on('service:provide', ({ name }) => { if (name === 'launcher') registry.refresh(); });

	addEventListener('resize', relayout);
	on('env:compact', relayout);
	on('lang:change', relabel);
}

/** The service object (Desk.wm). */
export const wm = Object.freeze({
	/* windows */
	open, close, closeAll, show, focus, focusTop, minimize, unminimize, toggleMax, snapTo, tileBoth, layout, cycle,
	relayout, relabel, reload, popOut, canPopOut, canLink, setTitle, locationOf, serialize, acceptUrl,
	/** Open order (oldest first) — stack() is the z-order */
	list: () => [...wins.values()],
	stack, zOf,
	active: () => active,
	get: id => wins.get(id) ?? null,
	has: id => wins.has(id),
	isMin: w => !!(typeof w === 'string' ? wins.get(w) : w)?.min,
	/* kinds */
	defineKind, hasKind, kinds: listKinds,
	/* geometry and hook points (P1/P2) */
	area, layoutRect, rectOf, rect, setLayout, animate, topZ, addDecorator, addDragHandler,
	get workspace() { return workspace; },
	get layer() { return layer; },
	/* menu models */
	menu: Object.freeze({ window: windowMenu, app: appMenu, layout: layoutItems })
});
