/* JPKCom Desktop — snap: drag a window to the left/right edge (half) or the top (zoom) — © Jean Pierre Kolb — MIT License

   A drag handler of the window manager (wm.addDragHandler): while a title
   bar is dragged, the pointer position decides the zone — the top edge of
   the workspace zooms, the left or right edge tiles to that half. A
   translucent preview (.snap-preview in the window layer) shows the target;
   on release the zone goes back to the WM, which applies it animated.

   Config: config.wm.snap (false switches snapping off), config.wm.snapEdge
   [mouse, touch/pen] — the width of the edge zones in pixels.

   Service 'snap': { enabled, zone, zoneAt(ev), cancel() }. */

import { config } from '../core/config.js';
import { h } from '../core/dom.js';
import { wm } from './wm.js';

const DEFAULT_EDGE = [8, 18];

/**
 * The snap zone for a pointer position relative to the workspace (pure).
 * x/y: pointer in workspace pixels; width: workspace width; edge: zone width.
 * At or above the top edge → 'max'; within `edge` px of the left/right edge → that side.
 */
export function zoneAt(x, y, width, edge) {
	if (![x, y, width].every(Number.isFinite)) return null;
	if (y <= 0) return 'max';
	if (x <= edge) return 'left';
	if (x >= width - edge) return 'right';
	return null;
}

/** config.wm.snapEdge → [mouse, touch] (non-negative numbers; invalid → the default pair) (pure) */
export function cleanEdge(v, warn = () => {}) {
	if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 200)) return [v[0], v[1]];
	if (v !== undefined) warn(`config.wm.snapEdge must be [mouse, touch] in pixels — using ${JSON.stringify(DEFAULT_EDGE)}`);
	return [...DEFAULT_EDGE];
}

/**
 * Wires snapping into the window manager (once, from src/wm/index.js).
 * Returns the service object; with config.wm.snap === false nothing is wired.
 */
export function initSnap() {
	const enabled = config.wm.snap !== false;
	const [mouseEdge, touchEdge] = cleanEdge(config.wm.snapEdge, msg => console.warn(`[desktop] ${msg}`));
	let preview = null;
	let zone = null;

	const show = r => {
		preview ??= h('div', { class: 'snap-preview', 'aria-hidden': 'true' });
		/* First in the layer: at the same z-index every window (later in the DOM) stays above it */
		if (!preview.isConnected) wm.layer.prepend(preview);
		const s = preview.style;
		s.left = `${r.x}px`;
		s.top = `${r.y}px`;
		s.width = `${r.w}px`;
		s.height = `${r.h}px`;
		/* Same z as the dragged (topmost) window, which comes later in the DOM and so stays above the preview */
		s.zIndex = String(wm.topZ());
		preview.classList.add('is-on');
	};

	const hide = () => preview?.classList.remove('is-on');

	function zoneOf(ev) {
		const ws = wm.workspace;
		if (!ws || !ev) return null;
		const r = ws.getBoundingClientRect();
		const edge = ev.pointerType === 'mouse' ? mouseEdge : touchEdge;
		return zoneAt(ev.clientX - r.left, ev.clientY - r.top, r.width, edge);
	}

	function track(win, ev) {
		/* Fixed windows never take a layout — no preview promising one */
		const next = win?.app?.fixed ? null : zoneOf(ev);
		if (next === zone) return;
		zone = next;
		if (zone) show(wm.layoutRect(zone));
		else hide();
	}

	function cancel() {
		const z = zone;
		zone = null;
		hide();
		return z;
	}

	if (enabled) {
		wm.addDragHandler({
			start: () => cancel(),
			move: track,
			end: (win, ev, dragged) => {
				const z = cancel();
				return dragged ? z : null;
			}
		});
	}

	return Object.freeze({
		get enabled() { return enabled; },
		/** The zone the current drag would snap to ('max' | 'left' | 'right' | null) */
		get zone() { return zone; },
		/** The zone of a pointer event (viewport coordinates) */
		zoneAt: zoneOf,
		/** Drops the current preview (returns the zone it showed) */
		cancel
	});
}
