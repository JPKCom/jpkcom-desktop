/* JPKCom Desktop — question sheets: sheet(), confirm(), alert() — © Jean Pierre Kolb — MIT License

   One helper for every question the desktop asks: "Empty the trash?",
   "Restore this backup?", unsaved changes, the consent before an online
   service's first request (consent.ask). A sheet hangs from the top of its
   container — a window (or its body) — or, without one, from the menu bar
   over the whole page (.sheet-global). Markup and look: .sheet .sheet-box
   .sheet-btns in src/css/components.css.

   Accessibility (as in the original): role=alertdialog with aria-modal,
   aria-labelledby (title) and aria-describedby (text); Tab stays inside the
   sheet; Esc cancels; keys never reach the window's own shortcuts; the
   focus goes back to where it was (opts.returnTo, else the element focused
   when the sheet opened; when that is gone or was the page itself — a menu
   item removed before its action ran — the window the sheet belongs to,
   else the top window, else the menu bar). Questions for the same container
   wait for each other; closing the window answers an open one with null,
   and a question queued for a window that is closing (or closed) is
   answered with null at once instead of opening in it. */

import { h, trapFocus } from './dom.js';
import { t } from './i18n.js';
import { on } from './bus.js';
import { get as service } from './services.js';

let uid = 0;
const queues = new WeakMap(); // container → Promise of the question shown there now

/* A window object ({ el, body }), an element, or null (the whole page) */
const isWin = within => !!within && typeof within === 'object' && within.body?.nodeType === 1 && within.el?.nodeType === 1;

function hostOf(within) {
	if (isWin(within)) return within.body;
	if (within?.nodeType === 1) return within;
	return null;
}

/* The window is closing or gone: wm.close() unregisters it and emits 'window:close' before the
   closing animation, so host.isConnected alone is still true for a queued question */
function isClosing(host, within) {
	if (!host) return false;
	if (!host.isConnected || within?.closed === true || host.closest?.('.is-closing')) return true;
	const wm = service('wm');
	return isWin(within) && typeof wm?.get === 'function' && typeof within.app?.id === 'string' && wm.get(within.app.id) !== within;
}

const canFocus = el => !!el && el !== document.body && el !== document.documentElement && el.isConnected
	&& typeof el.focus === 'function' && !el.closest?.('[inert], [hidden], .is-closing');

/* Where the focus goes when the sheet closes (see the header) */
function restoreTarget(returnTo, before, within) {
	if (canFocus(returnTo)) return returnTo;
	if (canFocus(before)) return before;
	if (isWin(within) && canFocus(within.el)) return within.el;
	const wm = service('wm');
	const top = wm?.active?.() ?? wm?.stack?.().at(-1) ?? null;
	if (canFocus(top?.el)) return top.el;
	const bar = document.querySelector('.mb-item[tabindex="0"]') ?? document.querySelector('.mb-item');
	return canFocus(bar) ? bar : null;
}

function show(host, within, { title = '', text = null, buttons = null, focus = null, cancel = null, returnTo = null }) {
	return new Promise(resolve => {
		if (isClosing(host, within)) {
			resolve(null);
			return;
		}
		const list = (Array.isArray(buttons) && buttons.length ? buttons : [{ id: 'ok', label: t('core.ok'), primary: true }])
			.filter(b => b && typeof b.id === 'string');
		const n = ++uid;
		const titleId = `sheet-${n}-title`;
		const textId = `sheet-${n}-text`;
		const before = document.activeElement;
		let finished = false;
		let release = () => {};
		let stop = () => {};

		const btns = list.map(b => h('button', {
			type: 'button', class: ['btn', b.primary && 'btn-primary', b.danger && 'btn-danger'],
			dataset: { answer: b.id }, text: b.label ?? b.id, onclick: () => done(b.id)
		}));
		const el = h('div', {
			class: ['sheet', !host && 'sheet-global'], role: 'alertdialog', 'aria-modal': 'true',
			'aria-labelledby': titleId, 'aria-describedby': text ? textId : null
		},
		h('div', { class: 'sheet-box' },
			h('h3', { id: titleId, text: String(title ?? '') }),
			text ? h('p', { id: textId, text: String(text) }) : null,
			h('div', { class: 'sheet-btns' }, btns)));

		function done(id) {
			if (finished) return;
			finished = true;
			release();
			stop();
			const active = document.activeElement;
			const hadFocus = el.contains(active) || !active || active === document.body;
			el.remove();
			if (hadFocus) restoreTarget(returnTo, before, within)?.focus({ preventScroll: true });
			resolve(id ?? null);
		}

		release = trapFocus(el);
		el.addEventListener('keydown', e => {
			/* The window's shortcuts and the menus must not see keys typed into the question */
			e.stopPropagation();
			if (e.key === 'Escape') {
				e.preventDefault();
				done(cancel);
			}
		});
		/* The window goes away while asking: the question is answered with null */
		stop = on('window:close', ({ win } = {}) => {
			if (win?.el?.contains?.(el)) done(null);
		});

		(host ?? document.body).append(el);
		const target = btns[list.findIndex(b => b.id === focus)] ?? btns[list.findIndex(b => b.primary)] ?? btns[0];
		target?.focus({ preventScroll: true });
	});
}

/**
 * Asks a question. within: a window, an element (positioned; the sheet covers
 * it) or null (the whole page). opts:
 *   title     the question (required)
 *   text      an explanation (optional)
 *   buttons   [{ id, label, primary?, danger? }] in visual order (default: one OK button)
 *   focus     id of the button focused first (default: the primary one, else the first)
 *   cancel    the answer Esc gives (default null)
 *   returnTo  element that gets the focus back when the sheet closes (default: the
 *             one focused when it opened; see the header for the fallbacks)
 * Resolves with the chosen button's id, or null (Esc, window closed or closing).
 */
export function sheet(within, opts = {}) {
	if (typeof document === 'undefined') return Promise.resolve(null);
	const host = hostOf(within);
	const key = host ?? document.body;
	const run = (queues.get(key) ?? Promise.resolve()).then(() => show(host, within, opts));
	queues.set(key, run.catch(() => null));
	return run;
}

/**
 * Yes/no question: resolves true for the confirming button.
 * opts: { title, text, ok = t('core.ok'), cancel = t('core.cancel'), danger = false, returnTo }
 * (danger: the confirming button is red — deleting, emptying, resetting).
 */
export async function confirm(within, { title, text = null, ok = null, cancel = null, danger = false, returnTo = null } = {}) {
	const answer = await sheet(within, {
		title, text, returnTo,
		buttons: [
			{ id: 'cancel', label: cancel ?? t('core.cancel') },
			{ id: 'ok', label: ok ?? t('core.ok'), primary: !danger, danger }
		],
		focus: danger ? 'cancel' : 'ok'
	});
	return answer === 'ok';
}

/** A message with one OK button; resolves when it is closed. opts: { title, text, ok, returnTo } */
export async function alert(within, { title, text = null, ok = null, returnTo = null } = {}) {
	await sheet(within, { title, text, returnTo, buttons: [{ id: 'ok', label: ok ?? t('core.ok'), primary: true }], cancel: 'ok' });
}

export const dialog = Object.freeze({ sheet, confirm, alert });
