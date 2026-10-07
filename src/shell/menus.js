/* JPKCom Desktop — menu engine: menu bar, dropdowns, submenus, context menus, sheets — © Jean Pierre Kolb — MIT License

   The generic part of the menus. WHICH menus the bar shows is not decided
   here: parts and modules register top-level menus (register()), each with
   a label and an items() function that builds its entries when it opens.
   The engine renders them into #mb-menus (role=menubar) and runs them:

   - Keyboard per the WAI-ARIA menubar pattern: roving tabindex on the bar,
     ←/→ between menus (mirrored in right-to-left languages), ↓/↑/Enter/Space
     open, Home/End, Esc closes one level and returns the focus, Tab leaves
     (to the element after the menu bar). An item that runs gives the focus back
     to where the person was before the bar (or to the opener of a context menu).
   - Mouse: click opens, hovering the bar switches while one is open,
     submenus fly out after a short delay.
   - Compact (phones): menus become full-width sheets under the menu bar,
     submenus unfold inline; menus registered with compact: 'fold' move into
     the menu registered with host: true as submenus.
   - Context menus at a point (openAt) and menus under a button (dropdown).

   Item format (also used by the title fitting, context menus, apps):
     '-'                                        separator
     { label, run }                             action (run receives nothing; the menu closes and the
                                                focus goes back first — see activate())
     { label, disabled: true }                  shown, not selectable
     { label, checkbox: true, checked, run }    menuitemcheckbox
     { label, radio: true, checked, run }       menuitemradio
     { label, submenu: Item[] | () => Item[] }  submenu
     { app: appId | app | { icon, tint } }      leading app tile; an app id alone fills label and run (launch)
     { glyph: SVGElement | 'icon-id' }          leading glyph (e.g. a folded title-bar button)
     { url }                                    run = open the link the desktop way (router.openUrl)
     { shortcut: 'Mod+K' }                      shown at the end, also aria-keyshortcuts
     { lang: 'fr' }                             the label is in that language (BCP 47): lang, and
                                                dir when it differs from the page's
   Labels are plain text (textContent) — never HTML. */

import { emit, on } from '../core/bus.js';
import { isCompact, hasCmdKey } from '../core/env.js';
import { t, i18n } from '../core/i18n.js';
import { h, cssEscape, foreignLang } from '../core/dom.js';
import { icon, tile, hasIcon } from '../core/icons.js';
import { registry } from '../core/registry.js';
import { launch, openUrl } from '../core/router.js';
import { get as service } from '../core/services.js';

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const SELF = 'menus';

const providers = new Map();   // id → top-level menu definition
const itemOf = new WeakMap();  // menu item button → item
const topOf = new WeakMap();   // menu bar button → top-level definition

let bar = null;      // #mb-menus
let open = null;     // { btn, el, opener, returnTo }
let sub = null;      // { btn, el }
let hoverTimer = 0;
let ready = false;
let uid = 0;
let outside = null;  // the last element focused outside the menu bar and the menus

const rtl = () => document.documentElement.dir === 'rtl';

/* ============================================================
   Registration of top-level menus
   ============================================================ */

/**
 * Adds a menu to the menu bar. def:
 *   id        [a-z][a-z0-9-]*, unique
 *   order     position, low first (default 100)
 *   label     string | Node | () → string | Node   (an icon-only label needs aria)
 *   aria      string | () → string                 accessible name when the label is not text
 *   cls       extra class on the bar button (e.g. 'mb-logo', 'mb-app')
 *   items     () → Item[]                          built every time the menu opens
 *   compact   'keep' | 'fold' | 'hide'             phones: stay in the bar, move into the host menu, or drop (default 'fold')
 *   host      true: receives the folded menus (first ones in its list, then a separator)
 *   when      () → boolean                         shown only while true
 * Returns a function that removes the menu again.
 */
export function register(def) {
	if (!def || typeof def.id !== 'string' || !ID.test(def.id) || typeof def.items !== 'function' || def.label == null) {
		console.warn(`[menus] register(): needs an id, a label and items() — skipped ${def?.id ?? ''}`);
		return () => {};
	}
	if (providers.has(def.id)) {
		console.warn(`[menus] menu '${def.id}' is registered twice — the second one is ignored`);
		return () => {};
	}
	providers.set(def.id, Object.freeze({
		order: 100, compact: 'fold', host: false, ...def
	}));
	queueRender();
	return () => {
		if (providers.delete(def.id)) queueRender();
	};
}

export const registered = () => [...providers.values()].sort((a, b) => a.order - b.order);

const value = v => (typeof v === 'function' ? v() : v);

/* The bar's model for the current mode: [{ def, label, aria, items }] */
function model() {
	const compact = isCompact();
	const list = registered().filter(d => {
		try {
			return d.when ? d.when() !== false : true;
		} catch {
			return false;
		}
	});
	if (!compact) return list.map(d => ({ def: d, items: d.items }));
	const folded = list.filter(d => d.compact === 'fold');
	const host = list.find(d => d.host && d.compact !== 'hide' && d.compact !== 'fold') ?? null;
	return list
		.filter(d => d.compact === 'keep' || d === host || (!host && d.compact === 'fold'))
		.map(d => ({
			def: d,
			items: d === host && folded.length
				? () => [
					...folded.map(f => ({ label: textOf(value(f.label), f), lang: langOf(value(f.label), f), submenu: () => f.items() })),
					'-',
					...d.items()
				]
				: d.items
		}));
}

function textOf(label, def) {
	if (typeof label === 'string') return label;
	return value(def.aria) ?? label?.textContent ?? def.id;
}

/* The language of a top-level label node (Desk.dom.langText → <span lang>) when it is what textOf() reads */
function langOf(label, def) {
	if (typeof label === 'string' || value(def.aria) != null) return null;
	return label?.getAttribute?.('lang') || null;
}

let renderQueued = false;
function queueRender() {
	if (!ready || renderQueued) return;
	renderQueued = true;
	queueMicrotask(() => {
		renderQueued = false;
		render();
	});
}

function barButton(entry, index) {
	const { def } = entry;
	const label = value(def.label);
	const aria = value(def.aria);
	const btn = h('button', {
		type: 'button', class: ['mb-item', def.cls], role: 'menuitem', dataset: { menu: def.id },
		'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': aria ?? null, tabindex: index === 0 ? '0' : '-1'
	}, label instanceof Node ? label : String(label ?? ''));
	topOf.set(btn, entry);
	return btn;
}

/**
 * Rebuilds the menu bar from the registered menus (also on language, mode and
 * app changes). Keyboard users keep their place: the roving tab stop and the
 * focus stay on the button of the same menu, an open menu opens again with
 * the same item focused. Context menus and dropdowns are left alone.
 */
export function render() {
	if (!bar) return;
	const focused = document.activeElement;
	const roving = [...bar.children].find(b => b.tabIndex === 0)?.dataset.menu ?? null;
	const barFocus = bar.contains(focused) ? focused.closest('.mb-item')?.dataset.menu ?? null : null;
	let reopen = null;
	if (open?.btn) {
		const inside = open.el.contains(focused) || sub?.el.contains(focused);
		reopen = { id: open.btn.dataset.menu, index: inside ? itemsOf(open.el).indexOf(focused.closest('.menu-item')) : -2 };
		close();
	}
	bar.setAttribute('aria-label', t('core.menubar'));
	bar.replaceChildren(...model().map(barButton));

	const find = id => (id ? [...bar.children].find(b => b.dataset.menu === id) ?? null : null);
	const keep = find(reopen?.id ?? barFocus ?? roving);
	if (keep) setRoving(keep);
	if (barFocus || reopen?.index >= -1) (keep ?? bar.firstElementChild)?.focus({ preventScroll: true });
	if (reopen && keep) {
		openTop(keep, null);
		/* -1: the focus was in a submenu — back on the menu's first item; -2: opened by mouse, focus stays */
		if (reopen.index >= 0) focusItem(open.el, reopen.index);
		else if (reopen.index === -1) focusItem(open.el, 0);
	}
}

/**
 * Refreshes one top-level menu in place (its label and model) without
 * rebuilding the bar — e.g. the app menu when the active window changes.
 */
export function update(id) {
	if (!bar) return;
	const btn = [...bar.children].find(b => b.dataset.menu === id);
	if (!btn) {
		queueRender();
		return;
	}
	const entry = model().find(e => e.def.id === id);
	if (!entry) {
		queueRender();
		return;
	}
	const label = value(entry.def.label);
	const aria = value(entry.def.aria);
	btn.replaceChildren(label instanceof Node ? label : String(label ?? ''));
	if (aria) btn.setAttribute('aria-label', aria);
	else btn.removeAttribute('aria-label');
	topOf.set(btn, entry);
}

/* ============================================================
   Building and placing menus
   ============================================================ */

/* Fills the gaps of an item: an app id → app, label and launch; url → openUrl */
function normalize(raw) {
	if (raw === '-' || raw == null) return raw;
	const it = { ...raw };
	if (typeof it.app === 'string') {
		const app = registry.get(it.app);
		if (!app) return null;
		it.app = app;
		/* The app's name, marked when it fell back to another language */
		if (it.label == null) {
			it.label = registry.name(app);
			it.lang ??= foreignLang(registry.nameLang(app));
		}
		it.run ??= () => launch(app.id);
	}
	if (typeof it.url === 'string' && !it.run) {
		const url = it.url;
		it.run = () => openUrl(url);
	}
	if (typeof it.glyph === 'string') it.glyph = hasIcon(it.glyph) ? icon(it.glyph) : null;
	it.label = it.label == null ? '' : String(it.label);
	return it;
}

const BCP47 = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;

/**
 * The lang and dir attributes of a label written in another language (item.lang):
 * dir only when that language runs the other way than the page. Pure (exported for tests).
 */
export function labelLang(code, { dirOf = () => 'ltr', pageDir = 'ltr' } = {}) {
	if (typeof code !== 'string' || code.length > 35 || !BCP47.test(code)) return { lang: null, dir: null };
	const dir = dirOf(code) === 'rtl' ? 'rtl' : 'ltr';
	return { lang: code, dir: dir === (pageDir === 'rtl' ? 'rtl' : 'ltr') ? null : dir };
}

function clean(items) {
	const list = (Array.isArray(items) ? items : []).map(normalize).filter(x => x != null);
	/* No separator at the ends or twice in a row */
	return list.filter((x, i) => x !== '-' || (i > 0 && i < list.length - 1 && list[i - 1] !== '-'));
}

const ensureId = el => el.id || (el.id = `menu-${++uid}`);

function build(items, labelledBy) {
	const ul = h('ul', { class: 'menu', role: 'menu', 'aria-labelledby': labelledBy ?? null });
	for (const it of clean(items)) {
		if (it === '-') {
			ul.append(h('li', { role: 'separator', class: 'menu-sep' }));
			continue;
		}
		const toggle = it.radio || it.checkbox;
		const own = labelLang(it.lang, { dirOf: c => i18n.dir(c), pageDir: document.documentElement.dir });
		const btn = h('button', {
			type: 'button', class: 'menu-item', tabindex: '-1',
			role: it.radio ? 'menuitemradio' : it.checkbox ? 'menuitemcheckbox' : 'menuitem',
			'aria-checked': toggle ? String(!!it.checked) : null,
			'aria-disabled': it.disabled ? 'true' : null,
			'aria-haspopup': it.submenu ? 'menu' : null,
			'aria-expanded': it.submenu ? 'false' : null,
			'aria-keyshortcuts': it.shortcut ? String(it.shortcut).replace(/\bMod\b/g, hasCmdKey() ? 'Meta' : 'Control') : null
		},
		h('span', { class: 'menu-check', 'aria-hidden': 'true' }, it.checked ? icon('ti-check') : null),
		it.app ? tile(it.app, 'mini') : null,
		it.glyph ? h('span', { class: 'menu-glyph', 'aria-hidden': 'true' }, it.glyph) : null,
		h('span', { class: 'menu-label', text: it.label, lang: own.lang, dir: own.dir }),
		it.shortcut ? h('span', { class: 'menu-key', 'aria-hidden': 'true', text: i18n.keys(it.shortcut) }) : null,
		it.submenu ? h('span', { class: 'menu-arrow', 'aria-hidden': 'true' }, icon('ti-chevron-right')) : null);
		if (it.app?.kind === 'link') btn.setAttribute('aria-label', t('core.newTab', { name: it.label }));
		itemOf.set(btn, it);
		ul.append(h('li', { role: 'none' }, btn));
	}
	return ul;
}

/**
 * Places a menu at (x, y) in viewport pixels, kept 6 px inside the window.
 * flipX: where it goes instead when it does not fit (submenus: the other side
 * of the parent). end: x is the menu's end edge (right-to-left layouts).
 */
function place(el, x, y, { flipX = null, end = false } = {}) {
	document.body.append(el);
	const w = el.offsetWidth;
	const hgt = el.offsetHeight;
	let left = end ? x - w : x;
	if (left + w > innerWidth - 6) left = flipX != null ? flipX - w : innerWidth - w - 6;
	if (left < 6 && flipX != null && end) left = flipX;
	el.style.left = `${Math.max(6, left)}px`;
	el.style.top = `${Math.max(6, Math.min(y, innerHeight - hgt - 6))}px`;
}

function asSheet(el, top) {
	el.classList.add('menu-sheet');
	el.style.top = `${top}px`;
	document.body.append(el);
}

const menubarBottom = () => (document.getElementById('menubar') ?? bar)?.getBoundingClientRect().bottom ?? 0;

function itemsOfEntry(entry) {
	try {
		return entry.items() ?? [];
	} catch (err) {
		console.error(`[menus] items() of '${entry.def.id}' failed:`, err);
		return [];
	}
}

function openTop(btn, focus) {
	close();
	emit('popovers:close', { except: SELF });
	const entry = topOf.get(btn);
	if (!entry) return;
	const el = build(itemsOfEntry(entry), ensureId(btn));
	const r = btn.getBoundingClientRect();
	if (isCompact()) asSheet(el, r.bottom + 4);
	else if (rtl()) place(el, r.right, r.bottom + 1, { end: true });
	else place(el, r.left, r.bottom + 1);
	btn.setAttribute('aria-expanded', 'true');
	setRoving(btn);
	open = { btn, el, opener: null, returnTo: btn };
	if (focus === 'first') focusItem(el, 0);
	if (focus === 'last') focusItem(el, -1);
}

/**
 * Context menu at a point (right-click, long press, ContextMenu key).
 *   openAt(items, x, y, label, focusFirst = false, opener = null)
 *   openAt(items, x, y, { label, focusFirst, opener })
 * label: accessible name of the menu. opener: the button it belongs to
 * (aria-expanded follows, focus returns there on Esc).
 */
export function openAt(items, x, y, label, focusFirst = false, opener = null) {
	if (label && typeof label === 'object') ({ label, focusFirst = false, opener = null } = label);
	close();
	emit('popovers:close', { except: SELF });
	const el = build(items, null);
	if (label) el.setAttribute('aria-label', label);
	if (isCompact()) asSheet(el, menubarBottom() + 4);
	else place(el, x, y, rtl() ? { end: true } : {});
	opener?.setAttribute('aria-expanded', 'true');
	open = { btn: null, el, returnTo: opener || document.activeElement, opener };
	if (focusFirst) focusItem(el, 0);
	return el;
}

/**
 * A menu hanging from a button (e.g. "More actions" at the end of a title
 * bar). Pressing the button again closes it; Esc returns the focus to it.
 * focusFirst: true when opened by keyboard (event.detail === 0).
 */
export function dropdown(btn, items, label, focusFirst = false) {
	if (open?.opener === btn) {
		close();
		return null;
	}
	const r = btn.getBoundingClientRect();
	const el = openAt(items, rtl() ? r.right : r.left, r.bottom + 2, label, focusFirst, btn);
	if (isCompact()) {
		/* The sheet hangs below the button, so the button stays visible and can close it again */
		el.style.top = `${r.bottom + 4}px`;
		el.style.maxHeight = `${innerHeight - r.bottom - 16}px`;
	} else if (rtl()) {
		el.style.left = `${Math.max(6, Math.min(r.left, innerWidth - el.offsetWidth - 6))}px`;
	} else {
		el.style.left = `${Math.max(6, r.right - el.offsetWidth)}px`;
	}
	return el;
}

function openSub(btn, focusFirst) {
	if (sub?.btn === btn) {
		if (focusFirst) focusItem(sub.el, 0);
		return;
	}
	closeSub();
	const it = itemOf.get(btn);
	const el = build(typeof it.submenu === 'function' ? it.submenu() : it.submenu, ensureId(btn));
	el.classList.add('menu-sub');
	const parent = btn.closest('.menu').getBoundingClientRect();
	const r = btn.getBoundingClientRect();
	if (rtl()) place(el, parent.left + 3, r.top - 5, { end: true, flipX: parent.right - 3 });
	else place(el, parent.right - 3, r.top - 5, { flipX: parent.left + 3 });
	btn.setAttribute('aria-expanded', 'true');
	sub = { btn, el };
	if (focusFirst) focusItem(el, 0);
}

/* Compact: submenus unfold inside the sheet instead of flying out */
function toggleInline(btn, focusFirst) {
	const li = btn.parentElement;
	const existing = li.querySelector(':scope > .menu');
	if (existing) {
		if (focusFirst) {
			focusItem(existing, 0);
			return;
		}
		existing.remove();
		btn.setAttribute('aria-expanded', 'false');
		return;
	}
	const it = itemOf.get(btn);
	const ul = build(typeof it.submenu === 'function' ? it.submenu() : it.submenu, ensureId(btn));
	ul.classList.add('menu-inline');
	li.append(ul);
	btn.setAttribute('aria-expanded', 'true');
	if (focusFirst) focusItem(ul, 0);
	else ul.scrollIntoView?.({ block: 'nearest' });
}

function closeSub() {
	if (!sub) return;
	sub.btn.setAttribute('aria-expanded', 'false');
	sub.el.remove();
	sub = null;
}

/** Closes the open menu (returnFocus: back to its button or where the focus was before). */
export function close(returnFocus = false) {
	clearTimeout(hoverTimer);
	closeSub();
	if (!open) return;
	const o = open;
	open = null;
	o.btn?.setAttribute('aria-expanded', 'false');
	o.opener?.setAttribute('aria-expanded', 'false');
	o.el.remove();
	if (returnFocus) (o.btn || o.returnTo)?.focus?.({ preventScroll: true });
}

export const isOpen = () => !!open;

/** Whether a node lies inside an open menu (for outside-click logic of other popovers) */
export const contains = node => !!(node && ((open?.el.contains(node)) || sub?.el.contains(node)));

const itemsOf = menu => [...menu.querySelectorAll(':scope > li > .menu-item')].filter(b => b.getAttribute('aria-disabled') !== 'true');

function focusItem(menu, index) {
	const items = itemsOf(menu);
	if (!items.length) return;
	items[(index + items.length) % items.length].focus();
}

function setRoving(btn) {
	for (const b of bar.children) b.tabIndex = b === btn ? 0 : -1;
}

function stepTop(btn, delta, reopen) {
	const tops = [...bar.children];
	if (!tops.length) return;
	const next = tops[(tops.indexOf(btn) + delta + tops.length) % tops.length];
	setRoving(next);
	next.focus();
	if (reopen) openTop(next, 'first');
}

/* Can the focus go back to this element? Connected, not the page itself, not hidden or inert
   (a minimised window, a closed sheet's button) */
const usable = el => el instanceof HTMLElement && el.isConnected && el !== document.body
	&& !el.closest('[inert], [hidden], .is-min') && (el.checkVisibility?.({ visibilityProperty: true }) ?? true);

/* Where the focus goes when a menu item runs: from a menu of the bar, back to where the
   person was before entering the bar (the window, the desktop — WAI-ARIA menubar), else the
   bar button; from a context menu or dropdown, back to the element it was opened from */
function backOf(o) {
	if (!o) return null;
	if (o.btn) return usable(outside) ? outside : o.btn;
	return usable(o.returnTo) ? o.returnTo : null;
}

/* The focus target died during the action (the dock rebuilt its buttons, the window
   went into the dock): the same app's dock item or bar menu, the active window, the bar */
function recover(back, key) {
	if (usable(back)) return back;
	const same = key.app ? document.querySelector(`.dock-item[data-app="${cssEscape(key.app)}"], .icon[data-app="${cssEscape(key.app)}"]`) : null;
	if (usable(same)) return same;
	const menu = key.menu && bar ? [...bar.children].find(b => b.dataset.menu === key.menu) : null;
	if (usable(menu)) return menu;
	const win = service('wm')?.active?.()?.el;
	if (usable(win)) return win;
	return bar?.querySelector('[tabindex="0"]') ?? null;
}

/**
 * Runs an item. The focus goes back first (backOf) — so a sheet the action opens
 * remembers where to return — then the action runs; it may move the focus itself
 * (a window opens, a sheet asks). Should the focus end on <body> instead (its
 * target was rebuilt or hidden meanwhile), recover() finds the nearest equivalent,
 * right away and once more after the next frame (rebuilds and sheets may come late).
 */
function activate(btn) {
	const it = itemOf.get(btn);
	if (!it || it.disabled) return;
	if (it.submenu) {
		if (isCompact()) toggleInline(btn, false);
		else openSub(btn, true);
		return;
	}
	const back = backOf(open);
	const key = { app: back?.dataset?.app ?? null, menu: back?.dataset?.menu ?? open?.btn?.dataset.menu ?? null };
	close();
	back?.focus({ preventScroll: true });
	try {
		it.run?.();
	} catch (err) {
		console.error('[menus] menu action failed:', err);
	}
	const settle = () => {
		if (open) return;
		const a = document.activeElement;
		if (!a || a === document.body) recover(back, key)?.focus({ preventScroll: true });
	};
	settle();
	requestAnimationFrame(settle);
}

/* ============================================================
   Events
   ============================================================ */

function onBarKey(e) {
	const btn = e.target.closest('.mb-item');
	if (!btn) return;
	const fwd = rtl() ? 'ArrowLeft' : 'ArrowRight';
	const back = rtl() ? 'ArrowRight' : 'ArrowLeft';
	switch (e.key) {
		case fwd: e.preventDefault(); stepTop(btn, 1, !!open); break;
		case back: e.preventDefault(); stepTop(btn, -1, !!open); break;
		case 'Home': e.preventDefault(); stepTop(bar.children[0], 0, !!open); break;
		case 'End': e.preventDefault(); stepTop(bar.lastElementChild, 0, !!open); break;
		case 'ArrowDown':
		case 'Enter':
		case ' ':
			e.preventDefault();
			openTop(btn, 'first');
			break;
		case 'ArrowUp': e.preventDefault(); openTop(btn, 'last'); break;
		case 'Escape': close(); break;
		/* Opened by mouse, the focus stayed on the bar button: leaving the bar closes the menu */
		case 'Tab': close(); break;
	}
}

function onMenuKey(e) {
	/* Opened by mouse, the focus stays on the dropdown's button */
	if (e.key === 'Escape' && open?.opener && e.target === open.opener) {
		e.preventDefault();
		close(true);
		return;
	}
	const btn = e.target.closest?.('.menu-item');
	/* Opened by mouse, the focus stayed outside (a context menu under a still pointer): Esc still closes it */
	if (e.key === 'Escape' && open && !(btn && itemOf.has(btn)) && !bar?.contains(e.target)) {
		e.preventDefault();
		close();
		return;
	}
	if (!btn || !open || !itemOf.has(btn)) return;
	const menu = btn.closest('.menu');
	const inSub = sub && sub.el === menu;
	const inline = menu.classList.contains('menu-inline');
	const items = itemsOf(menu);
	const i = items.indexOf(btn);
	const fwd = rtl() ? 'ArrowLeft' : 'ArrowRight';
	const back = rtl() ? 'ArrowRight' : 'ArrowLeft';
	switch (e.key) {
		case 'ArrowDown': e.preventDefault(); focusItem(menu, i + 1); break;
		case 'ArrowUp': e.preventDefault(); focusItem(menu, i - 1); break;
		case 'Home': e.preventDefault(); focusItem(menu, 0); break;
		case 'End': e.preventDefault(); focusItem(menu, -1); break;
		case fwd:
			e.preventDefault();
			if (itemOf.get(btn)?.submenu && btn.getAttribute('aria-disabled') !== 'true') {
				if (isCompact()) toggleInline(btn, true);
				else openSub(btn, true);
			} else if (open.btn) {
				stepTop(open.btn, 1, true);
			}
			break;
		case back:
			e.preventDefault();
			if (inline) {
				const parent = menu.previousElementSibling;
				toggleInline(parent, false);
				parent.focus();
			} else if (inSub) {
				const parent = sub.btn;
				closeSub();
				parent.focus();
			} else if (open.btn) {
				stepTop(open.btn, -1, true);
			}
			break;
		case 'Escape':
			e.preventDefault();
			if (inSub) {
				const parent = sub.btn;
				closeSub();
				parent.focus();
			} else {
				close(true);
			}
			break;
		case 'Tab':
			/* The focus goes back to the bar button (or the opener) first: the browser's own Tab
			   then moves on from there — to the element after the menu bar, not past the menu
			   at the end of <body> */
			close(true);
			break;
	}
}

/** Wires the engine to the shell (#mb-menus) and the document. Called once by src/shell/index.js. */
export function initMenus() {
	if (ready) return;
	ready = true;
	bar = document.getElementById('mb-menus');

	if (bar) {
		bar.addEventListener('click', e => {
			const btn = e.target.closest('.mb-item');
			if (!btn) return;
			if (open?.btn === btn) close();
			else openTop(btn, e.detail === 0 ? 'first' : null);
		});
		bar.addEventListener('pointerover', e => {
			const btn = e.target.closest('.mb-item');
			if (btn && open?.btn && open.btn !== btn && e.pointerType === 'mouse') openTop(btn);
		});
		bar.addEventListener('keydown', onBarKey);
	}

	document.addEventListener('click', e => {
		const btn = e.target.closest?.('.menu-item');
		if (btn && itemOf.has(btn)) activate(btn);
	});

	document.addEventListener('pointerover', e => {
		const btn = e.target.closest?.('.menu-item');
		if (!btn || e.pointerType !== 'mouse' || !itemOf.has(btn)) return;
		btn.focus({ preventScroll: true });
		if (isCompact()) return;
		const inSub = sub && sub.el.contains(btn);
		clearTimeout(hoverTimer);
		if (itemOf.get(btn)?.submenu && btn.getAttribute('aria-disabled') !== 'true') hoverTimer = setTimeout(() => openSub(btn, false), 120);
		else if (!inSub) hoverTimer = setTimeout(closeSub, 180);
	});

	document.addEventListener('keydown', onMenuKey);

	/* Where the person was before entering the menu bar (activate() returns there) */
	document.addEventListener('focusin', e => {
		const el = e.target;
		if (el instanceof HTMLElement && !bar?.contains(el) && !el.closest('.menu')) outside = el;
	});

	document.addEventListener('pointerdown', e => {
		if (!open) return;
		if (e.target.closest?.('.menu') || (bar && bar.contains(e.target))) return;
		/* Its own button toggles (dropdown) — closing here would reopen it on the click */
		if (open.opener?.contains(e.target)) return;
		close();
	}, true);

	/* Clicking into an iframe blurs the page — close menus then too */
	addEventListener('blur', () => close());
	let lastWidth = innerWidth;
	addEventListener('resize', () => {
		if (innerWidth !== lastWidth) close();
		lastWidth = innerWidth;
	});

	on('popovers:close', ({ except } = {}) => {
		if (except !== SELF) close();
	});
	for (const name of ['lang:change', 'env:compact', 'menus:refresh', 'apps:change']) on(name, queueRender);
	render();
}

/** The service object (Desk.menus). */
export const menus = Object.freeze({
	register, registered, render, update, dropdown, openAt, close, isOpen, contains
});
