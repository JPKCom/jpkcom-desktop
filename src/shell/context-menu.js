/* JPKCom Desktop — context menus: right-click, long press, the ContextMenu key — © Jean Pierre Kolb — MIT License

   One resolver decides per element: an own menu, an action (menu bar items
   open themselves), the browser's own menu (window content: copy text, open
   links) or nothing (menus, overlays):

     modules     contribution point 'contextMenu' and contextmenu.add(): the
                 element closest to the target wins; items(el, ctx) → Item[]
     menu bar    a right-click on a menu title, the clock or the weather opens it
     dock        per item: show, minimise, halves, links, move, Dock pins, quit;
                 "All apps": open, reset the Dock; the bare dock: reset
     All apps    the app's menu (open, open in new tab, copy link, Dock)
     title bar   the window (layout, reload, open in tab, copy link, Dock, overview,
                 close others, quit) — also the ContextMenu key on a focused window
     desktop     icons: the app's menu; the bare desktop: wallpaper, show/hide
                 icons, tile, close all, about, how it works

   Markup that wants the browser's menu or none: data-contextmenu="native" |
   "none" on any ancestor; "click" makes a right-click click the element. iOS never fires contextmenu for a long press, so
   touch and pen detect it here (550 ms without moving).

   Contribution: contextMenu: [{ selector: '.notes-item', label?(el), select?(el),
                                 items(el, ctx) { return [...]; } }]
   ctx: { target, keyboard, appItems(app, extra), windowItems(win), pinItems(app),
          linkItems(app), group(...lists) } — the building blocks below, so a
   module's menu matches the desktop's. */

import { ROOT, isCompact } from '../core/env.js';
import { t, L } from '../core/i18n.js';
import { copyText } from '../core/dom.js';
import { registry } from '../core/registry.js';
import { launch } from '../core/router.js';
import { get as service } from '../core/services.js';
import { follow } from './contrib.js';
import { copyLinkItem } from './menubar.js';

const resolvers = [];   // { selector, items, label, select, module }
let lastPress = 0;
let lastKey = 0;

const wm = () => service('wm');
const dock = () => service('dock');
const name = app => registry.name(app);

/** Joins groups of items with separators, leaving out empty groups. Pure. */
export const group = (...parts) => parts.filter(p => p?.length).flatMap((p, i) => (i ? ['-', ...p] : p));

/* ---------- Building blocks ---------- */

/** Absolute address of an app, for a new tab or the clipboard (null: none, e.g. an interactive app). */
export function addressOf(app) {
	const target = app?.alias ? registry.get(app.alias) : app;
	if (!target?.url || target.kind === 'launcher') return null;
	const url = registry.url(target);
	if (!url) return null;
	if (target.kind === 'link') return url;
	try {
		return new URL(url, ROOT).href;
	} catch {
		return null;
	}
}

/** "Open in new tab" (not for links, which open in one anyway) and "Copy link" */
export function linkItems(app) {
	const address = addressOf(app);
	if (!address) return [];
	const target = app.alias ? registry.get(app.alias) : app;
	return [
		...(target.kind === 'link' ? [] : [{ label: t('core.openTab'), run: () => window.open(address, '_blank', 'noopener') }]),
		{ label: t('core.copyLink'), run: () => copyText(address) }
	];
}

/** "Add to Dock" / "Remove from Dock"; running unpinned apps say "Keep in Dock" */
export function pinItems(app) {
	const d = dock();
	if (!d || !app || !d.canPin(app.id)) return [];
	if (d.isPinned(app.id)) return [{ label: t('shell.dockRemove'), run: () => d.unpin(app.id) }];
	return [{ label: t(wm()?.has(app.alias ?? app.id) ? 'shell.dockKeep' : 'shell.dockAdd'), run: () => d.pin(app.id) }];
}

/* Bookmarks and other external links always open in a new tab — the label says so */
const openItem = app => ({ label: t(app.kind === 'link' ? 'core.openTab' : 'core.open'), run: () => launch(app.id) });

/** An app's menu (desktop icons, All apps, Catalog): open, links, extra entries, Dock. */
export function appItems(app, extra = []) {
	if (!app) return [];
	const base = [openItem(app), ...linkItems(app)];
	/* An extra entry with the same label as a base one is not listed twice */
	return group(base, (extra ?? []).filter(x => x === '-' || !base.some(b => b.label === x?.label)), pinItems(app));
}

const RELOAD_KINDS = new Set(['app', 'native']);
/* Module apps answer reload only when their implementation has the hook; "Open in new tab"
   is the window manager's canPopOut(win) alone (it asks the kind and the implementation) */
const canReload = win => typeof win.def?.reload === 'function' && (!RELOAD_KINDS.has(win.kind) || typeof win.impl?.reload === 'function');
const canPopOut = win => wm()?.canPopOut?.(win) === true;

/** The title bar's menu: the window itself — layout, its page, the Dock, the other windows. */
export function windowItems(win) {
	const w = wm();
	if (!win || !w) return [];
	const app = win.app;
	const others = w.list().filter(x => x !== win);
	const link = copyLinkItem(win);
	const overview = service('overview');
	return group(
		w.menu.layout(win),
		[
			...(canReload(win) ? [{ label: t('core.reload'), run: () => w.reload(win) }] : []),
			...(canPopOut(win) ? [{ label: t('core.openTab'), run: () => w.popOut(win) }] : []),
			/* Dropped files live in blob URLs: no link survives them */
			...(link ? [link] : [])
		],
		app.transient ? [] : pinItems(app),
		[
			...(overview ? [{ label: t('wm.showAll'), run: () => overview.toggle() }] : []),
			{ label: t('wm.closeOthers'), disabled: !others.length, run: () => others.forEach(x => w.close(x)) }
		],
		[{ label: t('wm.quit', { name: name(app) }), run: () => w.close(win) }]
	);
}

function dockItems(app) {
	const d = dock();
	const w = wm();
	if (app.kind === 'launcher') {
		return [
			{ label: t('shell.openLauncher'), run: () => launch(app.id) },
			'-',
			{ label: t('shell.dockReset'), disabled: !d?.isCustom, run: () => d?.reset() }
		];
	}
	/* Touch has no drag in the dock (a long press opens this menu) — moving lives here.
	   Left and right as seen: the list runs the other way in right-to-left languages */
	const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
	const moveItems = d?.isPinned(app.id) && (d.canMove(app.id, -1) || d.canMove(app.id, 1)) ? [
		{ label: t('shell.moveLeft'), disabled: !d.canMove(app.id, -dir), run: () => d.move(app.id, -dir) },
		{ label: t('shell.moveRight'), disabled: !d.canMove(app.id, dir), run: () => d.move(app.id, dir) }
	] : [];
	const win = w?.get(app.alias ?? app.id);
	if (!win) return appItems(app, moveItems);
	const free = !isCompact() && !app.fixed;
	return group(
		[
			{ label: t('core.show'), run: () => w.show(win) },
			{ label: t('wm.minimize'), disabled: win.min, run: () => w.minimize(win) },
			...(free ? [
				{ label: t('wm.tileLeft'), radio: true, checked: win.tile === 'left', run: () => w.snapTo(win, 'left') },
				{ label: t('wm.tileRight'), radio: true, checked: win.tile === 'right', run: () => w.snapTo(win, 'right') }
			] : [])
		],
		linkItems(app),
		moveItems,
		pinItems(app),
		[{ label: t('wm.quit', { name: name(app) }), run: () => w.close(win) }]
	);
}

function desktopItems() {
	const w = wm();
	const list = w?.list() ?? [];
	const icons = service('desktop');
	const wallpaper = service('wallpaper');
	const canWallpaper = registry.available('wallpaper');
	const own = typeof wallpaper?.menuItems === 'function' ? wallpaper.menuItems() : [];
	const wallpaperMenu = own.length || canWallpaper ? [{
		label: t('shell.wallpaperMenu'),
		submenu: () => [...(typeof wallpaper?.menuItems === 'function' ? wallpaper.menuItems() : []),
			...(canWallpaper ? ['-', { label: t('shell.wallpaperMore'), run: () => launch('wallpaper') }] : [])]
	}] : [];
	return group(
		[
			...wallpaperMenu,
			...(icons?.enabled() ? [{ label: t(icons.hidden() ? 'shell.showIcons' : 'shell.hideIcons'), run: () => icons.setHidden(!icons.hidden()) }] : [])
		],
		w ? [
			...(isCompact() ? [] : [{ label: t('wm.tileBoth'), disabled: list.filter(x => !x.app.fixed && !x.min).length < 2, run: () => w.tileBoth() }]),
			{ label: t('wm.closeAll'), disabled: !list.length, run: () => w.closeAll() }
		] : [],
		[
			...(registry.available('about-desktop') ? [{ label: t('shell.aboutDesktop'), run: () => launch('about-desktop') }] : []),
			...(registry.available('help') ? [{ label: t('shell.howto'), run: () => launch('help') }] : [])
		]
	);
}

/* ---------- Resolution ---------- */

const ctxFor = (target, keyboard) => Object.freeze({ target, keyboard, appItems, windowItems, pinItems, linkItems, group, addressOf });

/* Registered menus: the matching element closest to the target wins (later registrations on a tie) */
function registered(target) {
	let best = null;
	let bestDepth = Infinity;
	for (const r of resolvers) {
		let el = null;
		try {
			el = target.closest(r.selector);
		} catch {
			continue;
		}
		if (!el) continue;
		let depth = 0;
		for (let n = target; n && n !== el; n = n.parentElement) depth++;
		if (depth <= bestDepth) {
			best = { r, el };
			bestDepth = depth;
		}
	}
	if (!best) return null;
	const { r, el } = best;
	return {
		items: keyboard => {
			try {
				return r.items(el, ctxFor(el, keyboard)) ?? [];
			} catch (err) {
				console.error(`[contextmenu] items() of '${r.module ?? r.selector}' failed:`, err);
				return [];
			}
		},
		label: (() => {
			try {
				/* Module texts: a string, '@ns.key' or { lang: text } */
				const v = typeof r.label === 'function' ? r.label(el) : r.label;
				return (v != null && L(v)) || t('shell.contextMenu');
			} catch {
				return t('shell.contextMenu');
			}
		})(),
		select: typeof r.select === 'function' ? () => r.select(el) : null
	};
}

const menuOf = text => t('shell.menuOf', { name: text });

/**
 * What a right-click on this element means:
 * { items, label, select? } an own menu · { run } an action · false nothing · null the browser's menu
 */
export function resolve(target) {
	if (!(target instanceof Element)) return null;
	const marked = target.closest('[data-contextmenu]');
	if (marked?.dataset.contextmenu === 'none') return false;
	if (marked?.dataset.contextmenu === 'native') return null;
	if (marked?.dataset.contextmenu === 'click') return { run: () => marked.click() };
	if (target.closest('.menu, .calendar, .tilemenu, .boot, .power-off, .dropzone')) return false;

	const own = registered(target);
	if (own) return own;

	if (target.closest('#menubar')) {
		/* A right-click on a menu title, the clock or the weather opens it. Other
		   status buttons (language, search) do nothing: a right-click must not
		   switch the language or start an action — they opt in with
		   data-contextmenu="click". */
		const btn = target.closest('#mb-menus .mb-item, #mb-clock, #mb-weather');
		return btn ? { run: () => btn.click() } : false;
	}

	const dockBtn = target.closest('.dock-item');
	if (dockBtn) {
		const app = registry.get(dockBtn.dataset.app);
		return app ? { items: () => dockItems(app), label: menuOf(name(app)) } : false;
	}
	if (target.closest('#dock')) {
		const d = dock();
		return d ? { items: () => [{ label: t('shell.dockReset'), disabled: !d.isCustom, run: () => d.reset() }], label: t('core.dock') } : false;
	}

	const launcherBtn = target.closest('.launcher-item');
	if (launcherBtn) {
		const app = registry.get(launcherBtn.dataset.app);
		return app ? { items: () => appItems(app), label: menuOf(name(app)) } : false;
	}
	if (target.closest('.launcher')) return false;

	/* The zoom button's long press opens the tile menu already */
	if (target.closest('.win-controls .wc-max')) return false;

	/* Title bar — and the ContextMenu key on a focused window — show the window menu */
	const winEl = target.closest('.win');
	if (winEl && (target.closest('.win-bar') || target === winEl)) {
		const win = wm()?.get(winEl.dataset.app);
		if (win) {
			return {
				items: () => windowItems(win),
				label: menuOf(win.title),
				select: () => { if (wm().active() !== win) wm().show(win); }
			};
		}
	}

	/* Window content keeps the browser's own menu (copy text, open links) */
	if (winEl) return null;

	const icon = target.closest('.icon');
	if (icon && icon.closest('#desktop-icons')) {
		const app = registry.get(icon.dataset.app);
		return app ? { items: () => appItems(app), label: menuOf(name(app)), select: () => service('desktop')?.select(icon) } : false;
	}
	if (target.closest('#workspace')) return { items: desktopItems, label: t('shell.desktopMenu') };
	return null;
}

function show(target, x, y, keyboard) {
	const r = resolve(target);
	if (!r) return;
	if (r.run) {
		r.run();
		return;
	}
	const items = r.items(keyboard);
	if (!items.length) return;
	r.select?.();
	service('menus')?.openAt(items, x, y, { label: r.label, focusFirst: keyboard });
}

/* After a long press, the tap that ends it must not also open the icon */
function swallowClick() {
	const stop = e => {
		e.stopPropagation();
		e.preventDefault();
	};
	addEventListener('click', stop, { capture: true, once: true });
	setTimeout(() => removeEventListener('click', stop, true), 700);
}

/** Adds a menu for elements matching selector: itemsFn(el, ctx) → Item[]. Returns remove(). */
export function add(selector, itemsFn, opts = {}, module = null) {
	if (typeof selector !== 'string' || !selector || typeof itemsFn !== 'function') {
		console.warn('[contextmenu] add(selector, items) needs a selector and a function — skipped');
		return () => {};
	}
	const entry = { selector, items: itemsFn, label: opts.label ?? null, select: opts.select ?? null, module: opts.module ?? module };
	resolvers.push(entry);
	return () => {
		const i = resolvers.indexOf(entry);
		if (i >= 0) resolvers.splice(i, 1);
	};
}

export function initContextMenu() {
	follow('contextMenu', {
		add: item => add(item.selector, item.items, item, item.module),
		remove(moduleId) {
			for (let i = resolvers.length - 1; i >= 0; i--) if (resolvers[i].module === moduleId) resolvers.splice(i, 1);
		}
	});

	document.addEventListener('keydown', e => {
		if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) lastKey = Date.now();
	}, true);

	document.addEventListener('contextmenu', e => {
		const r = resolve(e.target);
		if (r === null) return;
		e.preventDefault();
		/* Android fires contextmenu after our own long press as well */
		if (!r || Date.now() - lastPress < 800) return;
		const keyboard = Date.now() - lastKey < 600;
		let x = e.clientX;
		let y = e.clientY;
		if (keyboard) {
			const box = e.target.getBoundingClientRect();
			x = box.left + box.width / 2;
			y = box.top + box.height / 2;
		}
		show(e.target, x, y, keyboard);
	});

	/* iOS never fires contextmenu for a long press — detect it here
	   (only where an own menu exists; menu titles open with a tap anyway) */
	document.addEventListener('pointerdown', e => {
		if (e.pointerType === 'mouse') return;
		const r = resolve(e.target);
		if (!r?.items) return;
		const sx = e.clientX;
		const sy = e.clientY;
		const target = e.target;
		const types = ['pointermove', 'pointerup', 'pointercancel'];
		const off = () => types.forEach(type => removeEventListener(type, cancel, true));
		const timer = setTimeout(() => {
			off();
			lastPress = Date.now();
			swallowClick();
			show(target, sx, sy, false);
		}, 550);
		function cancel(ev) {
			if (ev.type === 'pointermove' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) return;
			clearTimeout(timer);
			off();
		}
		types.forEach(type => addEventListener(type, cancel, true));
	});

	return Object.freeze({
		add: (selector, itemsFn, opts) => add(selector, itemsFn, opts),
		resolve, open: show,
		appItems, windowItems, pinItems, linkItems, group, addressOf
	});
}
