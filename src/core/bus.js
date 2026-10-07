/* JPKCom Desktop — event bus — © Jean Pierre Kolb — MIT License

   Modules talk through events instead of calling each other, so any optional
   module can be missing without breaking the rest. Names are 'area:event'
   ('lang:change', 'window:open', …); the full list is in docs/ARCHITECTURE.md.

   Every event is also dispatched on document as a CustomEvent named
   '<namespace>:<name>' (e.g. 'jpkdesk:lang:change', payload in event.detail),
   for scripts outside the module system. A listener that throws is reported
   and never stops the others. */

import { config } from './config.js';
import { track as trackSetup } from './undo.js';

/**
 * Creates an independent bus (exported for tests; the desktop uses the shared one below).
 * track(off): optional — receives the off function of every listener added (core/undo.js).
 */
export function createBus({ ns = null, target = null, track = null } = {}) {
	const listeners = new Map();

	function on(name, fn) {
		if (typeof fn !== 'function') throw new TypeError(`bus.on('${name}'): listener must be a function`);
		if (!listeners.has(name)) listeners.set(name, new Set());
		listeners.get(name).add(fn);
		const stop = () => off(name, fn);
		track?.(stop);
		return stop;
	}

	function off(name, fn) {
		listeners.get(name)?.delete(fn);
	}

	function once(name, fn) {
		const stop = on(name, payload => {
			stop();
			fn(payload);
		});
		return stop;
	}

	function emit(name, payload = {}) {
		for (const fn of [...(listeners.get(name) ?? [])]) {
			try {
				fn(payload);
			} catch (err) {
				console.error(`[desktop] listener for '${name}' failed:`, err);
			}
		}
		if (ns && target) {
			try {
				target.dispatchEvent(new CustomEvent(`${ns}:${name}`, { detail: payload }));
			} catch { /* no DOM (tests) */ }
		}
	}

	return { on, off, once, emit };
}

export const bus = createBus({
	ns: config.namespace,
	target: typeof document !== 'undefined' ? document : null,
	/* listeners a module adds during its setup() go again when that setup fails */
	track: trackSetup
});

export const { on, off, once, emit } = bus;
