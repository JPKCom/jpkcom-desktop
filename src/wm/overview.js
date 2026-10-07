/* JPKCom Desktop — window overview: every window scaled side by side, one click picks — © Jean Pierre Kolb — MIT License

   Opening scales all visible windows into a grid (the column count whose
   smallest window scale is largest; short rows centred), dims the desktop
   behind them and labels each window with its title. While it is open:

     ← → ↑ ↓   move the selection through the grid      Tab / Shift+Tab  next / previous
     Enter, Space  bring the selected window to the front    Esc  close, back to the previous window
     click on a window picks it, a click anywhere else closes

   The keyboard shortcuts that open it (F3, Ctrl+↑) and the Window menu item
   belong to the shell; they call the service: Desk.overview.toggle().
   Other popovers close through 'popovers:close' before it opens; it closes
   itself on 'popovers:close', window blur, resize and a phone/desktop switch.

   Service 'overview': { toggle(), open(), close(), active, isOpen() };
   events 'overview:open' / 'overview:close'. Config: config.overview
   { labelHeight, padding: [compact, normal] }. */

import { config } from '../core/config.js';
import { on, emit } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { announce } from '../core/a11y.js';
import { isCompact, later } from '../core/env.js';
import { wm } from './wm.js';

const DEFAULTS = { labelHeight: 30, padding: [12, 40] };
/* Room around a scaled window inside its cell: the ring and some air */
const CELL_X = 24;
const CELL_Y = 16;

const okNum = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

/** config.overview → { labelHeight, padding: [compact, normal] } (pure) */
export function cleanOverview(v, warn = () => {}) {
	const out = { labelHeight: DEFAULTS.labelHeight, padding: [...DEFAULTS.padding] };
	if (v == null) return out;
	if (typeof v !== 'object' || Array.isArray(v)) {
		warn('config.overview must be { labelHeight, padding } — using the defaults');
		return out;
	}
	if (v.labelHeight !== undefined) {
		if (okNum(v.labelHeight, 200)) out.labelHeight = v.labelHeight;
		else warn(`config.overview.labelHeight must be a number of pixels — using ${DEFAULTS.labelHeight}`);
	}
	if (v.padding !== undefined) {
		if (Array.isArray(v.padding) && v.padding.length === 2 && v.padding.every(n => okNum(n, 400))) out.padding = [...v.padding];
		else warn(`config.overview.padding must be [compact, normal] in pixels — using ${JSON.stringify(DEFAULTS.padding)}`);
	}
	return out;
}

/**
 * The overview grid (pure). rects: the shown rectangles of the windows in
 * grid order; area: { w, h } of the workspace; pad: outer padding; label:
 * the height reserved under each window for its title.
 * Returns { cols, cells: [{ s, dx, dy, cx, bottom }] } — s: scale (≤ 1),
 * dx/dy: translation of the window centre to its cell centre, cx/bottom:
 * where its label goes (workspace pixels).
 */
export function overviewGrid(rects, area, { pad = 40, label = 30 } = {}) {
	const n = rects.length;
	if (!n) return { cols: 0, cells: [] };
	const W = Math.max(1, area.w - pad * 2);
	const H = Math.max(1, area.h - pad * 2);
	const fit = (r, cw, ch) => Math.max(0.02, Math.min(1, (cw - CELL_X) / Math.max(1, r.w), (ch - label - CELL_Y) / Math.max(1, r.h)));
	let best = null;
	for (let cols = 1; cols <= n; cols++) {
		const rows = Math.ceil(n / cols);
		const cw = W / cols;
		const ch = H / rows;
		const s = Math.min(...rects.map(r => fit(r, cw, ch)));
		if (!best || s > best.s) best = { cols, cw, ch, s };
	}
	const { cols, cw, ch } = best;
	const cells = rects.map((r, i) => {
		const row = Math.floor(i / cols);
		const inRow = Math.min(cols, n - row * cols);
		const s = fit(r, cw, ch);
		const cx = pad + ((cols - inRow) * cw) / 2 + (i % cols) * cw + cw / 2;
		const cy = pad + row * ch + (ch - label) / 2;
		return { s, dx: cx - (r.x + r.w / 2), dy: cy - (r.y + r.h / 2), cx, bottom: cy + (r.h * s) / 2 };
	});
	return { cols, cells };
}

/** The selection after a key (pure): index, count, columns, key, shift → next index or null (not our key). */
export function overviewMove(sel, n, cols, key, shift = false) {
	if (!n) return null;
	const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
	if (step) return Math.min(n - 1, Math.max(0, sel + step));
	if (key === 'Tab') return (sel + (shift ? -1 : 1) + n) % n;
	return null;
}

/** Wires the overview (once, from src/wm/index.js). Returns the service object. */
export function initOverview() {
	const opts = cleanOverview(config.overview, msg => console.warn(`[desktop] ${msg}`));
	let on_ = null;   // { cells, cols, sel, prev, dim, labels }

	function select(i) {
		if (!on_ || !on_.cells[i]) return;
		on_.cells[on_.sel]?.w.el.classList.remove('is-picked');
		on_.sel = i;
		const { w } = on_.cells[i];
		w.el.classList.add('is-picked');
		w.el.focus({ preventScroll: true });
	}

	function enter() {
		if (on_) return;
		/* Top to bottom, left to right — the grid keeps a sense of where things were */
		const list = wm.list().filter(w => !w.min)
			.map(w => ({ w, r: wm.rectOf(w) }))
			.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
		if (!list.length) return;
		emit('popovers:close', { except: 'overview' });

		const pad = isCompact() ? opts.padding[0] : opts.padding[1];
		const { cells, cols } = overviewGrid(list.map(x => x.r), wm.area(), { pad, label: opts.labelHeight });
		const ws = wm.workspace.getBoundingClientRect();
		const dim = h('div', { class: 'overview-dim', 'aria-hidden': 'true' });
		const labels = h('div', { class: 'overview-labels', 'aria-hidden': 'true' });
		labels.style.inset = `${ws.top}px 0 0 ${ws.left}px`;
		wm.layer.prepend(dim);
		document.body.append(labels);
		document.body.classList.add('is-overview');

		const placed = cells.map((c, i) => {
			const w = list[i].w;
			const label = h('span', { class: 'overview-label', text: w.title });
			labels.append(label);
			label.style.left = `${c.cx}px`;
			label.style.top = `${c.bottom + 8}px`;
			w.el.style.setProperty('--xs', String(c.s));
			wm.animate(w, () => { w.el.style.transform = `translate(${c.dx}px, ${c.dy}px) scale(${c.s})`; });
			return { w, label };
		});
		requestAnimationFrame(() => {
			dim.classList.add('is-on');
			labels.classList.add('is-on');
		});

		on_ = { cells: placed, cols, sel: -1, prev: wm.active(), dim, labels };
		select(Math.max(0, placed.findIndex(c => c.w === on_.prev)));
		announce(t('wm.overviewHint', { n: placed.length }));
		emit('overview:open', {});
	}

	function exit(pick = null) {
		if (!on_) return;
		const { cells, dim, labels, prev } = on_;
		on_ = null;
		document.body.classList.remove('is-overview');
		for (const { w } of cells) {
			w.el.classList.remove('is-picked');
			wm.animate(w, () => { w.el.style.transform = ''; });
		}
		dim.classList.remove('is-on');
		labels.remove();
		later(() => dim.remove(), config.ui.animMs);
		/* Back to the previous window, unless it is gone or just went into the dock */
		const target = pick || (prev && !prev.min && wm.get(prev.app.id) === prev ? prev : null);
		if (target) wm.show(target);
		emit('overview:close', {});
	}

	/* While it is open, the keyboard belongs to it (window capture: before any shortcut) */
	addEventListener('keydown', e => {
		/* Keys with Ctrl/Alt/Meta belong to the shortcuts (F3 / Ctrl+↑ toggle it closed) */
		if (!on_ || e.ctrlKey || e.altKey || e.metaKey) return;
		const n = on_.cells.length;
		const next = overviewMove(on_.sel, n, on_.cols, e.key, e.shiftKey);
		if (next != null) {
			select(next);
		} else if (e.key === 'Enter' || e.key === ' ') {
			exit(on_.cells[on_.sel]?.w ?? null);
		} else if (e.key === 'Escape') {
			exit();
		} else {
			return;
		}
		e.preventDefault();
		e.stopImmediatePropagation();
	}, true);

	/* A window picks it, the empty space around closes; the dock and menus work as usual */
	wm.layer.addEventListener('pointerdown', e => {
		if (!on_) return;
		e.preventDefault();
		e.stopPropagation();
		const el = e.target.closest?.('.win');
		exit(el ? wm.list().find(w => w.el === el) ?? null : null);
	}, true);
	document.addEventListener('pointerdown', e => {
		if (on_ && !wm.layer.contains(e.target)) exit();
	}, true);

	addEventListener('resize', () => exit());
	/* Window blur (tab switch, focus into another frame) closes it — one task later and
	   only the same opening: the WM's own focusing of a frame (wm.show → focusFrame,
	   e.g. while a new window opens) blurs the page too and must not undo that pick */
	addEventListener('blur', () => {
		const session = on_;
		if (session) setTimeout(() => { if (on_ === session) exit(); }, 0);
	});
	on('env:compact', () => exit());
	on('popovers:close', ({ except } = {}) => { if (except !== 'overview') exit(); });
	/* The grid is a snapshot: a window that comes or goes ends it. A new window
	   (already in front and focused) stays in front: it is the pick. */
	on('window:open', ({ win } = {}) => exit(win ?? null));
	on('window:close', ({ win }) => { if (on_?.cells.some(c => c.w === win)) exit(); });
	on('window:minimize', ({ win, min }) => { if (min && on_?.cells.some(c => c.w === win)) exit(); });
	on('lang:change', () => {
		for (const c of on_?.cells ?? []) c.label.textContent = c.w.title;
	});

	return Object.freeze({
		toggle: () => (on_ ? exit() : enter()),
		open: enter,
		close: () => exit(),
		get active() { return !!on_; },
		isOpen: () => !!on_
	});
}
