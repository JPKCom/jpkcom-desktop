/* JPKCom Desktop — service registry (who provides the window manager, menus, …) — © Jean Pierre Kolb — MIT License

   Core parts and modules publish their public object once under a name
   ('wm', 'menus', 'dock', 'search', 'settings', …) and everybody else looks it
   up at the moment of use. A missing optional module simply means
   get(name) === null — callers use optional chaining:

     services.get('search')?.open('query');

   The registered names and their APIs are listed in docs/ARCHITECTURE.md. */

import { emit, on, off } from './bus.js';
import { track } from './undo.js';

const registry = new Map();

/** Publishes a service. A name can be provided once; a second provider is refused. */
export function provide(name, impl) {
	if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) throw new TypeError(`provide(): invalid service name '${name}'`);
	if (!impl || (typeof impl !== 'object' && typeof impl !== 'function')) throw new TypeError(`provide('${name}'): impl must be an object`);
	if (registry.has(name)) {
		console.warn(`[desktop] service '${name}' is already provided — the second provider is ignored`);
		return false;
	}
	registry.set(name, impl);
	/* provided during a module's setup(): withdrawn again when that setup fails (core/undo.js) */
	track(() => remove(name, impl));
	emit('service:provide', { name });
	return true;
}

/**
 * Withdraws a service (the loader, when the providing module's setup() failed).
 * With impl, only when that object is still the provider. Emits 'service:remove' { name }.
 * Not part of the public services object: no script can take another part's service away.
 */
export function remove(name, impl = undefined) {
	if (!registry.has(name) || (impl !== undefined && registry.get(name) !== impl)) return false;
	registry.delete(name);
	emit('service:remove', { name });
	return true;
}

/** The service, or null when no module provides it. */
export const get = name => registry.get(name) ?? null;

export const has = name => registry.has(name);

export const names = () => [...registry.keys()];

/** Resolves with the service as soon as it is provided (immediately when it already is). */
export function when(name) {
	if (registry.has(name)) return Promise.resolve(registry.get(name));
	return new Promise(resolve => {
		const onProvide = ({ name: n }) => {
			if (n !== name) return;
			off('service:provide', onProvide);
			resolve(registry.get(name));
		};
		on('service:provide', onProvide);
	});
}

export const services = Object.freeze({ provide, get, has, names, when });
