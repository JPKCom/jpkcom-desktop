/* JPKCom Desktop — session: the windows come back on the next visit — © Jean Pierre Kolb — MIT License

   Every window change ('window:open/close/focus/change/minimize') schedules
   one write (config.session.debounceMs); leaving the page (pagehide, tab
   hidden) writes at once. Stored under the key
   'session' (device-bound: no backup, reset group 'session'):

     { v: 1, active: appId | null,
       wins: [{ id, rect: { x, y, w, h }, layout, min, url, state }] }   bottom → top (wm.stack())

   url is the window's same-origin location (wm.locationOf), state what its
   kind serializes (wm.serialize — the Reader's history and scroll position,
   an app's view). Transient apps (dropped files: blob URLs) are never stored.

   On 'desk:ready' the stored windows open again bottom-up, synchronously
   inside the listener (docs/ARCHITECTURE.md §3), so deep links open on top.
   Everything read back is untrusted: only known apps that can open now
   (no launcher, link or transient apps), at most config.session.maxWindows,
   rectangles at least config.wm.minSize, layouts from the list, the url only
   when the app's kind accepts it (wm.acceptUrl).

   The user switch 'restore' ('on'/'off', default config.session.restore)
   lives in the settings (P3: Desk.session.setKeeping(on)).

   Service 'session': { save(), restore(), keeping(), setKeeping(on), persist() }. */

import { config } from '../core/config.js';
import { on } from '../core/bus.js';
import { store, V } from '../core/store.js';
import { registry } from '../core/registry.js';
import { wm } from './wm.js';

export const SESSION_KEY = 'session';
export const KEEP_KEY = 'restore';
export const LAYOUTS = ['max', 'left', 'right'];
/* A window's serialized state larger than this is not stored (the kind should keep big data itself) */
export const MAX_STATE = 32 * 1024;
const MAX_COORD = 1e5;

const num = v => typeof v === 'number' && Number.isFinite(v);

/** The topmost n entries of a bottom → top list; n = 0 → none (pure) */
export const topmost = (list, n) => (n > 0 ? list.slice(-n) : []);

/**
 * Cleans config.session (pure): { restore, debounceMs, maxWindows }; every
 * invalid value falls back to its default and is reported through warn(msg).
 * maxWindows: 0 is valid (core accepts any integer ≥ 0) and keeps no windows.
 */
export function cleanSession(v, warn = () => {}) {
	const DEFAULTS = { restore: true, debounceMs: 400, maxWindows: 20 };
	const out = { ...DEFAULTS };
	if (!V.isObj(v)) {
		if (v !== undefined) warn('config.session must be { restore, debounceMs, maxWindows } — using the defaults');
		return out;
	}
	if (typeof v.restore === 'boolean') out.restore = v.restore;
	else if (v.restore !== undefined) warn('config.session.restore must be true or false — using true');
	if (num(v.debounceMs) && v.debounceMs >= 0) out.debounceMs = v.debounceMs;
	else if (v.debounceMs !== undefined) warn(`config.session.debounceMs must be a number of milliseconds — using ${DEFAULTS.debounceMs}`);
	if (Number.isInteger(v.maxWindows) && v.maxWindows >= 0) out.maxWindows = v.maxWindows;
	else if (v.maxWindows !== undefined) warn(`config.session.maxWindows must be a whole number ≥ 0 — using ${DEFAULTS.maxWindows}`);
	return out;
}

/** The shape check for the stored value (storage registry, backup inspection): the object or null (pure) */
export function validSession(v) {
	return V.isObj(v) && v.v === 1 && Array.isArray(v.wins) ? v : null;
}

/** The 'restore' switch: 'on' / 'off', else null (pure) */
export const validKeep = v => (v === 'on' || v === 'off' ? v : null);

/**
 * Reads a stored session (pure). raw: the parsed JSON. ctx:
 *   max       at most this many windows (the topmost ones are kept; 0: none)
 *   minSize   [w, h] — smaller rectangles grow to it
 *   lookup(id) → the app when it is known and can open now, else null
 *   accept(app, url) → url | null — may this stored path open in this app?
 * Returns { list: [{ app, rect, layout, min, url, state }], active } or null.
 */
export function readSession(raw, { max = 20, minSize = [280, 180], lookup, accept = () => null }) {
	if (!validSession(raw)) return null;
	const [minW, minH] = minSize;
	const seen = new Set();
	const list = [];
	for (const w of topmost(raw.wins, max)) {
		if (!V.isObj(w)) continue;
		const id = V.id(w.id);
		if (!id || seen.has(id)) continue;
		let app = null;
		try {
			app = lookup(id);
		} catch {
			app = null;
		}
		if (!app || app.kind === 'launcher' || app.kind === 'link' || app.transient) continue;
		seen.add(id);
		const r = w.rect;
		const rect = V.isObj(r) && ['x', 'y', 'w', 'h'].every(k => num(r[k]) && Math.abs(r[k]) <= MAX_COORD)
			? { x: r.x, y: r.y, w: Math.max(minW, r.w), h: Math.max(minH, r.h) }
			: null;
		let url = null;
		if (typeof w.url === 'string' && V.path(w.url)) {
			try {
				url = accept(app, w.url) ?? null;
			} catch {
				url = null;
			}
		}
		let state = null;
		if (w.state !== undefined && w.state !== null) {
			try {
				state = JSON.stringify(w.state).length <= MAX_STATE ? w.state : null;
			} catch {
				state = null;
			}
		}
		list.push({
			app, rect,
			layout: LAYOUTS.includes(w.layout) && !app.fixed ? w.layout : null,
			min: w.min === true,
			url, state
		});
	}
	return { list, active: V.id(raw.active) };
}

/**
 * One stored window entry (pure): win-like { app, rect, layout, min }, its
 * location and serialized state. The state is dropped when it is too big.
 */
export function entryOf(win, url = null, state = null) {
	const r = win.rect;
	let keep = state;
	if (keep != null) {
		try {
			keep = JSON.stringify(keep).length <= MAX_STATE ? keep : null;
		} catch {
			keep = null;
		}
	}
	return {
		id: win.app.id,
		rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) },
		layout: LAYOUTS.includes(win.layout) ? win.layout : null,
		min: !!win.min,
		url: typeof url === 'string' ? url : null,
		state: keep ?? null
	};
}

/** The descriptor's storage declarations (src/wm/index.js) */
export const storageKeys = {
	[SESSION_KEY]: { type: 'json', backup: false, reset: 'session', label: '@wm.sessionLabel', validate: validSession, count: v => v.wins.length },
	[KEEP_KEY]: { type: 'text', backup: true, reset: 'settings', label: '@wm.restoreWins', validate: validKeep }
};

/** Wires the session (once, from src/wm/index.js, inside the WM's setup()). Returns the service object. */
export function initSession() {
	const { restore: keepDefault, debounceMs, maxWindows } =
		cleanSession(config.session, msg => console.warn(`[desktop] ${msg}`));
	let started = false;      // nothing is written before the stored session was read
	let restoring = false;
	let suppressed = false;   // after a reset: no write until the windows change again
	let saveTimer = 0;

	const keeping = () => store.flag(KEEP_KEY, keepDefault);

	function save() {
		clearTimeout(saveTimer);
		if (!started || restoring || !keeping()) return false;
		/* Dropped files (blob URLs) cannot come back */
		const list = topmost(wm.stack().filter(w => !w.app.transient), maxWindows);
		const active = wm.active();
		return store.setJson(SESSION_KEY, {
			v: 1,
			active: active && !active.app.transient ? active.app.id : null,
			wins: list.map(w => entryOf(w, wm.locationOf(w), wm.serialize(w)))
		});
	}

	/* Every change schedules one write */
	function persist() {
		if (restoring || !started) return;
		suppressed = false;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, debounceMs);
	}

	/* Leaving the page writes at once — also state a kind did not announce (a scroll position) */
	const flush = () => { if (!suppressed) save(); };

	function read() {
		return readSession(store.getJson(SESSION_KEY, validSession, null), {
			max: maxWindows,
			minSize: config.wm.minSize,
			lookup: id => {
				const app = registry.get(id);
				return app && registry.available(app) ? app : null;
			},
			accept: (app, url) => wm.acceptUrl(app, url)
		});
	}

	/* Bottom window first, so every open() stacks the next one on top */
	function restore() {
		started = true;
		if (!keeping()) return 0;
		const session = read();
		if (!session?.list.length) return 0;
		let opened = 0;
		restoring = true;
		try {
			const a = wm.area();
			for (const w of session.list) {
				const opts = { restore: true };
				if (w.url) opts.url = w.url;
				if (w.state != null) opts.state = w.state;
				let win = null;
				try {
					win = wm.open(w.app, opts);
				} catch (err) {
					console.error(`[session] reopening '${w.app.id}' failed:`, err);
				}
				if (!win) continue;
				opened++;
				if (w.rect) {
					const size = w.app.fixed ? win.rect : w.rect;
					wm.rect(win, { x: w.rect.x, y: w.rect.y, w: Math.min(size.w, a.w), h: Math.min(size.h, a.h) });
				}
				wm.setLayout(win, w.layout, { quiet: true });
				/* Not active while it goes: minimize() would otherwise raise the
				   topmost visible window above it (focusTop) and change the order */
				if (w.min) {
					wm.focus(null);
					wm.minimize(win, { animate: false });
				}
			}
			wm.relayout();
			const top = session.active ? wm.get(session.active) : null;
			if (top && !top.min) wm.show(top);
			else wm.focusTop();
		} finally {
			restoring = false;
		}
		save();
		return opened;
	}

	function setKeeping(onOff) {
		store.setFlag(KEEP_KEY, !!onOff);
		started = true;
		if (onOff) save();
		else {
			clearTimeout(saveTimer);
			store.remove(SESSION_KEY);
		}
	}

	for (const ev of ['window:open', 'window:close', 'window:focus', 'window:change', 'window:minimize']) on(ev, persist);

	/* Synchronously, as the first 'desk:ready' listener (the WM is set up first): deep links open on top */
	on('desk:ready', () => {
		try {
			restore();
		} catch (err) {
			started = true;
			console.error('[session] restoring the windows failed:', err);
		}
	});

	/* A reset forgets the stored windows: nothing pending may write them back */
	on('storage:reset', ({ groups } = {}) => {
		if (groups?.includes('session')) {
			clearTimeout(saveTimer);
			suppressed = true;
		}
	});

	addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

	return Object.freeze({
		save, restore, persist, keeping, setKeeping,
		/** The stored session, validated (what restore() would open) */
		read
	});
}
