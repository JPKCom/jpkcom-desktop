/* JPKCom Desktop — shell helper: following a contribution point of the modules — © Jean Pierre Kolb — MIT License

   Modules declare contributions in their descriptor (files, shortcuts,
   contextMenu, …). The shell part that owns the extension point sets up
   before the optional modules, so it reads what is there now and then
   follows 'module:loaded' (a module that came later) and 'module:failed'
   (everything that module contributed is withdrawn). */

import { on } from '../core/bus.js';
import { modules } from '../core/modules.js';

/**
 * Calls add(item) for every contribution to point — the ones there now and
 * the ones of modules loaded later — and remove(moduleId) when a module's
 * setup failed. Returns a function that stops following.
 */
export function follow(point, { add, remove = () => {} }) {
	const seen = new Set();
	const take = item => {
		if (seen.has(item)) return;
		seen.add(item);
		try {
			add(item);
		} catch (err) {
			console.warn(`[shell] '${point}' contribution of '${item?.module}' skipped:`, err);
		}
	};
	for (const item of modules.contributions(point)) take(item);
	const offLoaded = on('module:loaded', ({ id } = {}) => {
		for (const item of modules.contributions(point)) if (item.module === id) take(item);
	});
	const offFailed = on('module:failed', ({ id } = {}) => {
		for (const item of [...seen]) if (item.module === id) seen.delete(item);
		remove(id);
	});
	return () => {
		offLoaded();
		offFailed();
	};
}
