/* JPKCom Desktop — storage registry: backup keys, reset groups, trash types — © Jean Pierre Kolb — MIT License

   In the original, three hand-kept lists (backup KEYS, settings RESET, trash
   TYPES) had to be edited for every new module. Here each module declares
   its keys once in its descriptor:

     storage: { notes: { type: 'json', backup: true, reset: 'notes', validate, count, label } }
     resetGroups: [{ id: 'notes', label: '@notes.resetLabel', hint: '@notes.resetHint', order: 40 }]
     trash: { note: { restore(data) {…}, icon: 'ti-note', label: '@notes.trashType' } }

   and the backup panel, the reset section and the trash read everything from
   here. Keys that belong to the device rather than the person (window
   session, last weather data) set backup: false.

   A reset group may declare visible(): while it answers no and none of its
   keys holds a value, the group is hidden (its mere existence could reveal
   something, e.g. the vault). Stored data always shows it. */

import { config } from './config.js';
import { VERSION } from './env.js';
import { store } from './store.js';
import { emit } from './bus.js';
import { revokeAll } from './consent.js';

const NAME = /^[a-z][a-z0-9-]{0,63}$/;
const keys = new Map();
const groups = new Map();
const trashTypes = new Map();
const brokenPredicates = new Set();   // groups whose visible() threw (reported once)

/* Every registered key is a name of this desktop: the store tells its keys from those of another
   installation whose namespace starts with this one (store.js ownKeys(), §14) */
store.claim(name => keys.has(name));

/** Declares a stored key (name without the namespace prefix). */
export function registerKey(name, def = {}, module = null) {
	if (!NAME.test(name)) {
		console.warn(`[storage] invalid key name '${name}' (${module ?? 'core'}) — skipped`);
		return;
	}
	if (keys.has(name) && keys.get(name).module !== module) {
		console.warn(`[storage] key '${name}' is declared by '${keys.get(name).module ?? 'core'}' and '${module ?? 'core'}' — the second is ignored`);
		return;
	}
	keys.set(name, Object.freeze({
		name, module,
		type: def.type === 'text' ? 'text' : 'json',
		backup: def.backup !== false,
		reset: typeof def.reset === 'string' ? def.reset : null,
		validate: typeof def.validate === 'function' ? def.validate : v => v,
		count: typeof def.count === 'function' ? def.count : null,
		label: def.label ?? name
	}));
}

/** Declares a reset group (a row in Settings → Reset). onReset() runs after its keys are removed;
    visible() (optional) hides the row while it answers no and no key of the group holds a value. */
export function registerGroup(def, module = null) {
	if (!def || !NAME.test(def.id ?? '')) {
		console.warn(`[storage] invalid reset group ${JSON.stringify(def)} — skipped`);
		return;
	}
	if (groups.has(def.id)) return;
	groups.set(def.id, Object.freeze({
		id: def.id, module, label: def.label ?? def.id, hint: def.hint ?? null,
		order: Number.isFinite(def.order) ? def.order : 100,
		onReset: typeof def.onReset === 'function' ? def.onReset : null,
		visible: typeof def.visible === 'function' ? def.visible : null
	}));
}

/** Declares how a trashed item of a type comes back: restore(data, item) → true/false (may be async). */
export function registerTrash(type, def, module = null) {
	if (!NAME.test(type) || typeof def?.restore !== 'function') {
		console.warn(`[storage] trash type '${type}' needs a restore() function — skipped`);
		return;
	}
	trashTypes.set(type, Object.freeze({ type, module, restore: def.restore, icon: def.icon ?? 'ti-file', label: def.label ?? type, app: def.app ?? module }));
}

/** Removes the keys, reset groups and trash types a module declared (its setup failed). Stored values stay. */
export function removeModule(moduleId) {
	if (moduleId == null) return;
	for (const map of [keys, groups, trashTypes]) {
		for (const [k, v] of map) if (v.module === moduleId) map.delete(k);
	}
}

export const key = name => keys.get(name) ?? null;
export const listKeys = () => [...keys.values()];
export const trashType = type => trashTypes.get(type) ?? null;
export const listTrashTypes = () => [...trashTypes.values()];

/* Shown: no predicate, a stored key, or visible() answers yes. A throwing predicate shows the
   group — a reset must never lose its way to data */
function shown(g, names) {
	if (!g.visible || names.some(n => store.get(n) != null)) return true;
	try {
		return Boolean(g.visible());
	} catch (err) {
		if (!brokenPredicates.has(g.id)) {
			brokenPredicates.add(g.id);
			console.warn(`[storage] visible() of reset group '${g.id}' failed — shown:`, err);
		}
		return true;
	}
}

/** Reset groups in order, each with the names of its keys and whether it is shown now.
    Without { all: true } only the shown ones. */
export function resetGroups({ all = false } = {}) {
	const list = [...groups.values()]
		.sort((a, b) => a.order - b.order)
		.map(g => {
			const names = [...keys.values()].filter(k => k.reset === g.id).map(k => k.name);
			return { ...g, keys: names, shown: shown(g, names) };
		});
	return all === true ? list : list.filter(g => g.shown);
}

/** Current value of a declared key, validated (json parsed, text as string), or null */
export function read(name) {
	const k = keys.get(name);
	if (!k) return null;
	return k.type === 'json' ? store.getJson(name, k.validate, null) : (() => {
		const raw = store.get(name);
		return raw == null ? null : k.validate(raw) ?? null;
	})();
}

/** The backup document: every backup key that has a value */
export function snapshot() {
	const data = {};
	for (const k of keys.values()) {
		if (!k.backup) continue;
		const v = read(k.name);
		if (v != null) data[k.name] = v;
	}
	return { format: config.backup.format, version: VERSION, created: new Date().toISOString(), data };
}

/**
 * Checks a parsed backup document. Returns { ok, created, entries: [{ name, value }], unknown: [names] }
 * — invalid values are left out, keys this desktop does not know are listed in unknown.
 */
export function inspect(doc) {
	if (!doc || typeof doc !== 'object' || doc.format !== config.backup.format || !doc.data || typeof doc.data !== 'object') {
		return { ok: false, created: null, entries: [], unknown: [] };
	}
	const entries = [];
	const unknown = [];
	for (const [name, value] of Object.entries(doc.data)) {
		const k = keys.get(name);
		if (!k || !k.backup) {
			unknown.push(name);
			continue;
		}
		let clean = null;
		try {
			clean = k.type === 'text' ? (typeof value === 'string' ? k.validate(value) : null) : k.validate(value);
		} catch { /* invalid */ }
		if (clean != null) entries.push({ name, value: clean });
	}
	const created = typeof doc.created === 'string' && !Number.isNaN(Date.parse(doc.created)) ? doc.created : null;
	return { ok: true, created, entries, unknown };
}

/** Writes inspected entries. Returns false when the storage ran full (partially written). */
export function restore(entries) {
	let ok = true;
	for (const { name, value } of entries) {
		const k = keys.get(name);
		if (!k) continue;
		ok = (k.type === 'text' ? store.set(name, value) : store.setJson(name, value)) && ok;
	}
	emit('storage:restore', { names: entries.map(e => e.name) });
	return ok;
}

/** Removes the keys of the given reset groups (hidden ones too) and runs their onReset hooks. */
export async function reset(groupIds) {
	const done = [];
	for (const g of resetGroups({ all: true })) {
		if (!groupIds.includes(g.id)) continue;
		for (const name of g.keys) store.remove(name);
		try {
			await g.onReset?.();
		} catch (err) {
			console.error(`[storage] reset of '${g.id}' failed:`, err);
		}
		done.push(g.id);
	}
	emit('storage:reset', { groups: done });
	return done;
}

export const storage = Object.freeze({
	registerKey, registerGroup, registerTrash, removeModule, key, listKeys, trashType, listTrashTypes,
	resetGroups, read, snapshot, inspect, restore, reset
});

/* ---------- Core declarations ---------- */

registerGroup({ id: 'settings', label: '@core.resetSettings', hint: '@core.resetSettingsHint', order: 10,
	onReset: revokeAll });
registerGroup({ id: 'session', label: '@core.resetSession', hint: '@core.resetSessionHint', order: 90 });
registerKey('lang', { type: 'text', reset: 'settings', label: '@core.language', validate: v => (config.languages.includes(v) ? v : null) });
