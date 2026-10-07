/* JPKCom Desktop — title bars that fit: centred titles, buttons folded into "More actions" — © Jean Pierre Kolb — MIT License

   The title stays centred but keeps clear of the buttons on both sides
   (--title-side on .win-bar, read by wm.css). Once less than MIN_TITLE would
   be left for it, the action buttons fold into one "More actions" menu
   (.win-bar.is-folded; the menu lists each visible button, toggles keep their
   state as a check mark). Measured, not a breakpoint, and decided from the
   unfolded state each time. Works with the window controls on either side
   (html[data-wc]) and in right-to-left languages: the wider side wins.

   A window manager decorator (wm.addDecorator): wire/unwire/relabel per window. */

import { t } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { get as service } from '../core/services.js';

const MIN_TITLE = 140;
const GAP = 6;

const state = new WeakMap();   // bar → { win, actions, more, mutate }
const queued = new Set();

/* Visible action buttons (apps hide buttons that do not apply) */
const buttons = actions => [...actions.children].filter(b => b.matches('button') && !b.classList.contains('win-more') && !b.hidden);

/**
 * How far the bar's own buttons reach in from each edge: { start, end } in px —
 * left and right edge, whichever side each element sits on. Pure on the
 * numbers (exported for tests): boxes [{ left, width }] in bar coordinates.
 */
export function reach(boxes, width) {
	let left = 0;
	let right = 0;
	for (const b of boxes) {
		if (!b || !(b.width > 0)) continue;
		if (b.left + b.width / 2 < width / 2) left = Math.max(left, b.left + b.width);
		else right = Math.max(right, width - b.left);
	}
	return { left, right };
}

function measure(bar) {
	const boxes = [...bar.children]
		.filter(el => !el.classList.contains('win-title') && el.offsetParent !== null)
		.map(el => ({ left: el.offsetLeft, width: el.offsetWidth }));
	const { left, right } = reach(boxes, bar.clientWidth);
	return Math.max(left, right) + GAP;
}

function fit(bar) {
	if (!bar.isConnected) return;
	const s = state.get(bar);
	bar.classList.remove('is-folded');
	const side = measure(bar);
	if (s?.actions && bar.clientWidth - side * 2 < MIN_TITLE && buttons(s.actions).length > 1) {
		bar.classList.add('is-folded');
		bar.style.setProperty('--title-side', `${measure(bar)}px`);
		return;
	}
	bar.style.setProperty('--title-side', `${side}px`);
}

function queue(bar) {
	if (queued.has(bar)) return;
	queued.add(bar);
	requestAnimationFrame(() => {
		queued.delete(bar);
		fit(bar);
	});
}

const resize = new (globalThis.ResizeObserver ?? class { observe() {} unobserve() {} })(entries => entries.forEach(e => queue(e.target)));

/* Each visible button becomes a menu entry; toggles keep their state as a check mark */
function items(actions) {
	return buttons(actions).map(b => {
		const pressed = b.getAttribute('aria-pressed') ?? b.getAttribute('aria-expanded');
		return {
			label: b.getAttribute('aria-label') || b.title || b.textContent.trim(),
			glyph: b.querySelector('svg')?.cloneNode(true) ?? null,
			checkbox: pressed != null,
			checked: pressed === 'true',
			disabled: b.disabled,
			run: () => b.click()
		};
	});
}

const moreLabel = () => t('core.moreActions');

/* The "More actions" button at the end of .win-actions (shown by wm.css only while folded) */
function addMore(bar, s) {
	if (s.more || !s.actions) return;
	const more = h('button', {
		type: 'button', class: 'win-btn win-more', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
		'aria-label': moreLabel(), title: moreLabel(),
		onclick: e => service('menus')?.dropdown(more, items(s.actions), t('shell.menuOf', { name: s.win.title }), e.detail === 0)
	}, icon('ti-dots'));
	s.actions.append(more);
	s.more = more;
	s.mutate.observe(s.actions, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
}

export const decorator = Object.freeze({
	wire(win) {
		const bar = win.bar;
		const s = { win, actions: null, more: null, mutate: null };
		/* Apps hide buttons that do not apply, or add their .win-actions later */
		s.mutate = new MutationObserver(records => {
			if (!s.actions) {
				s.actions = bar.querySelector(':scope > .win-actions');
				addMore(bar, s);
			}
			if (records.some(r => r.target === s.more || s.more?.contains(r.target))) return;
			queue(bar);
		});
		state.set(bar, s);
		s.actions = bar.querySelector(':scope > .win-actions');
		addMore(bar, s);
		s.mutate.observe(bar, { childList: true });
		resize.observe(bar);
		queue(bar);
	},
	unwire(win) {
		const s = state.get(win.bar);
		s?.mutate?.disconnect();
		resize.unobserve(win.bar);
		state.delete(win.bar);
	},
	relabel(win) {
		const s = state.get(win.bar);
		if (s?.more) {
			s.more.setAttribute('aria-label', moreLabel());
			s.more.title = moreLabel();
		}
		queue(win.bar);
	}
});

/** Joins every window (open ones at once). Returns remove(). */
export function initTitleFit() {
	const wm = service('wm');
	if (!wm?.addDecorator) return null;
	return wm.addDecorator(decorator);
}
