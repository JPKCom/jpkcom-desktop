/* JPKCom Desktop — tile menu: arrange a window from its zoom button — © Jean Pierre Kolb — MIT License

   A small popover under the zoom window control (.wc-max) with four
   choices: zoom, left half, right half, side by side. It opens when the
   mouse rests on the button (config.wm.tileMenu.delay) or on a long press
   with touch or pen (the same delay); it hides a moment after the pointer
   left the button and the menu (hideDelay), on a click elsewhere, Esc,
   window blur (click into an iframe) and 'popovers:close'.

   Attaches as a window decorator (wm.addDecorator): wire() binds the zoom
   button, beforeZoom() swallows the click that follows a long press, so
   opening the menu by touch does not zoom the window as well.

   config.wm.tileMenu: { delay, hideDelay } in ms, or false to switch the
   menu off. */

import { config } from '../core/config.js';
import { on, emit } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { isCompact } from '../core/env.js';
import { wm } from './wm.js';

const DEFAULTS = { delay: 450, hideDelay: 250 };

/** config.wm.tileMenu → { delay, hideDelay } or null (switched off) (pure) */
export function cleanTileMenu(v, warn = () => {}) {
	if (v === false) return null;
	const out = { ...DEFAULTS };
	if (v == null) return out;
	if (typeof v !== 'object' || Array.isArray(v)) {
		warn('config.wm.tileMenu must be { delay, hideDelay } or false — using the defaults');
		return out;
	}
	for (const k of Object.keys(DEFAULTS)) {
		if (v[k] === undefined) continue;
		if (typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 10000) out[k] = v[k];
		else warn(`config.wm.tileMenu.${k} must be a number of milliseconds — using ${DEFAULTS[k]}`);
	}
	return out;
}

/** Wires the tile menu into every window (once, from src/wm/index.js). Returns { hide, isOpen } or null when off. */
export function initTileMenu() {
	const opts = cleanTileMenu(config.wm.tileMenu, msg => console.warn(`[desktop] ${msg}`));
	if (!opts) return null;

	let el = null;
	let owner = null;
	let showTimer = 0;
	let hideTimer = 0;
	let pressTimer = 0;
	let swallowClick = false;
	const wired = new WeakMap();   // win → remove()

	function hide() {
		clearTimeout(showTimer);
		clearTimeout(hideTimer);
		el?.remove();
		el = null;
		owner = null;
	}

	const zoomBtn = win => win.controls?.querySelector('.wc-max') ?? null;

	function show(win) {
		hide();
		if (win.app.fixed || isCompact() || win.min) return;
		const btn = zoomBtn(win);
		if (!btn?.isConnected) return;
		emit('popovers:close', { except: 'tilemenu' });
		owner = win;

		const tileable = wm.list().filter(w => !w.min && !w.app.fixed).length;
		const pick = (layout, key, glyph, pressed, disabled = false) => h('button', {
			type: 'button', class: 'tilemenu-btn', 'aria-label': t(key), title: t(key),
			'aria-pressed': pressed == null ? null : String(pressed), disabled,
			onclick: () => {
				hide();
				if (layout === 'max') wm.toggleMax(win);
				else if (layout === 'both') {
					/* The window whose menu this is goes left, the next one right */
					wm.focus(win);
					wm.tileBoth();
				} else wm.snapTo(win, layout);
			}
		}, icon(glyph));

		el = h('div', { class: 'tilemenu', role: 'group', 'aria-label': t('wm.tileMenu') },
			pick('max', 'wm.zoom', 'tile-max', win.max),
			pick('left', 'wm.tileLeft', 'tile-left', win.tile === 'left'),
			pick('right', 'wm.tileRight', 'tile-right', win.tile === 'right'),
			pick('both', 'wm.tileBoth', 'tile-both', null, tileable < 2));
		el.addEventListener('pointerenter', () => clearTimeout(hideTimer));
		el.addEventListener('pointerleave', () => { hideTimer = setTimeout(hide, opts.hideDelay); });
		document.body.append(el);

		const b = btn.getBoundingClientRect();
		el.style.left = `${Math.max(6, Math.min(b.left - 8, innerWidth - el.offsetWidth - 6))}px`;
		el.style.top = `${b.bottom + 6}px`;
	}

	function wire(win) {
		const btn = zoomBtn(win);
		if (!btn || wired.has(win)) return;
		const ac = new AbortController();
		const o = { signal: ac.signal };

		btn.addEventListener('pointerenter', e => {
			if (e.pointerType !== 'mouse' || btn.disabled) return;
			clearTimeout(hideTimer);
			clearTimeout(showTimer);
			showTimer = setTimeout(() => show(win), opts.delay);
		}, o);
		btn.addEventListener('pointerleave', e => {
			if (e.pointerType !== 'mouse') return;
			clearTimeout(showTimer);
			if (owner === win) hideTimer = setTimeout(hide, opts.hideDelay);
		}, o);
		/* Touch and pen: a long press opens the menu */
		btn.addEventListener('pointerdown', e => {
			if (e.pointerType === 'mouse' || btn.disabled) return;
			clearTimeout(pressTimer);
			pressTimer = setTimeout(() => {
				swallowClick = true;
				show(win);
			}, opts.delay);
		}, o);
		for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
			btn.addEventListener(type, () => clearTimeout(pressTimer), o);
		}
		/* The long press must not open the browser's context menu */
		btn.addEventListener('contextmenu', e => e.preventDefault(), o);

		wired.set(win, () => ac.abort());
	}

	function unwire(win) {
		wired.get(win)?.();
		wired.delete(win);
		if (owner === win) hide();
	}

	wm.addDecorator({
		wire,
		unwire,
		relabel: win => { if (owner === win) hide(); },
		/* A long press opened the menu — the click that follows must not zoom */
		beforeZoom() {
			if (!swallowClick) return true;
			swallowClick = false;
			return false;
		}
	});

	document.addEventListener('pointerdown', e => {
		if (el && !el.contains(e.target) && !e.target.closest?.('.wc-max')) hide();
	}, true);
	document.addEventListener('keydown', e => {
		if (!el || e.key !== 'Escape') return;
		const win = owner;
		const inside = el.contains(document.activeElement);
		hide();
		/* Focus inside the menu goes back to the zoom button; the key is ours then */
		if (inside) {
			e.preventDefault();
			e.stopPropagation();
			zoomBtn(win)?.focus();
		}
	}, true);
	addEventListener('blur', hide);
	on('popovers:close', ({ except } = {}) => { if (except !== 'tilemenu') hide(); });
	on('env:compact', hide);
	on('window:close', ({ win }) => { if (owner === win) hide(); });
	on('window:minimize', ({ win }) => { if (owner === win) hide(); });

	return Object.freeze({ hide, isOpen: () => !!el });
}
