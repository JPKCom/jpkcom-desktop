/* JPKCom Desktop — undo log of a module's setup() — © Jean Pierre Kolb — MIT License

   While the loader (core/modules.js) runs one module's setup(), what that
   setup registers through the shared parts — a service (services.provide),
   a bus listener (on/once), a window kind (wm defineKind) and anything else
   a part records with track() — leaves an undo function here. When setup()
   throws, the loader runs them in reverse order, so a failed module keeps no
   half-set-up service or kind and hears no more events; when it succeeds,
   the log is dropped.

   Setups run one after another, so the module that is "current" is clear for
   setup()'s own code, including its awaits. Something another part registers
   while a setup awaits counts for that setup too — the loader only rolls back
   on failure, which is an error path anyway. DOM listeners and timers a module
   creates itself are not tracked: setup() should create them last.

   No imports — bus.js, services.js and the window manager use it without a cycle. */

let current = null;
const logs = new Map(); // module id → [undo, …]

/** Records an undo function for the module whose setup() is running (no-op otherwise). */
export function track(undo) {
	if (current !== null && typeof undo === 'function') logs.get(current)?.push(undo);
}

/** The id of the module whose setup() is running, else null */
export const tracking = () => current;

/** Starts a log for a module (the loader, right before setup()). */
export function begin(id) {
	current = id;
	logs.set(id, []);
}

/** Ends the current log (setup() returned or threw); the log stays until rollback() or discard(). */
export function end() {
	current = null;
}

/** Runs a module's undo functions in reverse order and drops its log. */
export function rollback(id) {
	const list = logs.get(id) ?? [];
	logs.delete(id);
	for (const fn of list.reverse()) {
		try {
			fn();
		} catch (err) {
			console.error(`[modules] undoing a registration of '${id}' failed:`, err);
		}
	}
}

/** Drops a module's log (its setup() succeeded). */
export const discard = id => logs.delete(id);
