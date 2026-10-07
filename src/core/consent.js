/* JPKCom Desktop — online services: site switch + user consent — © Jean Pierre Kolb — MIT License

   Every request to a host outside this site belongs to a registered service
   ({ id, host(s), label, hint }). Two gates, both closed by default:

     1. the site offers it at all     config.services[id] === true
     2. the user agreed               stored as '<ns>-consent-<id>' = 'on'

   granted(id) is true only when both are open. net.getJson(url, { service })
   refuses to fetch otherwise; ask(id, { within }) puts the question before
   the first request. The settings section "Online services" (panels)
   lists the services and their hosts from here; tools can derive the CSP
   connect-src list from the same registrations. */

import { config } from './config.js';
import { store } from './store.js';
import { emit } from './bus.js';
import { t } from './i18n.js';
import { sheet } from './dialog.js';

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const services = new Map();

/**
 * Registers a service. Modules declare them in their descriptor (consent: [...]);
 * the loader calls this. hosts: one host or a list, e.g. 'api.open-meteo.com'.
 */
export function register(def, module = null) {
	if (!def || typeof def.id !== 'string' || !ID.test(def.id)) {
		console.warn(`[consent] invalid service ${JSON.stringify(def)} — skipped`);
		return null;
	}
	if (services.has(def.id)) return services.get(def.id);
	const hosts = (Array.isArray(def.hosts) ? def.hosts : [def.hosts ?? def.host]).filter(h => typeof h === 'string' && h);
	const entry = Object.freeze({
		id: def.id, hosts, label: def.label ?? def.id, hint: def.hint ?? null,
		module, ask: def.ask !== false
	});
	services.set(def.id, entry);
	emit('consent:register', { id: def.id });
	return entry;
}

/** The site offers this service (config.services[id] === true) */
export const enabled = id => config.services[id] === true;

/** The user agreed and the site offers it */
export const granted = id => enabled(id) && store.get(`consent-${id}`) === 'on';

/** Records the user's choice; revoking removes the key entirely */
export function set(id, on) {
	if (!services.has(id) && !enabled(id)) return false;
	if (on) store.set(`consent-${id}`, 'on');
	else store.remove(`consent-${id}`);
	emit('consent:change', { id, granted: granted(id) });
	return true;
}

export const get = id => services.get(id) ?? null;

/** Removes a registered service (the stored consent stays until a reset). */
export function unregister(id) {
	const had = services.delete(id);
	if (had) emit('consent:register', { id, removed: true });
	return had;
}

/** Removes every service a module registered (its setup failed). */
export function removeModule(moduleId) {
	for (const s of [...services.values()]) if (s.module === moduleId) unregister(s.id);
}

const pending = new Map(); // id → Promise<boolean> of an open question

/**
 * Asks before a service's first request (core.consentTitle/-Text/-Allow/-Deny).
 * Resolves true when consent is (or now gets) granted, false when the site
 * does not offer the service or the user declines ("Not now" stores nothing,
 * so the question comes again next time). within: where the question sheet
 * appears — a window, its body or any positioned element (default: the whole page).
 */
export function ask(id, { within = null } = {}) {
	if (granted(id)) return Promise.resolve(true);
	if (!enabled(id)) return Promise.resolve(false);
	if (pending.has(id)) return pending.get(id);
	const s = services.get(id);
	const host = s?.hosts.length ? s.hosts.join(', ') : id;
	const p = sheet(within, {
		title: t('core.consentTitle', { host }),
		text: t('core.consentText', { host }),
		buttons: [
			{ id: 'deny', label: t('core.consentDeny') },
			{ id: 'allow', label: t('core.consentAllow'), primary: true }
		]
	}).then(answer => {
		pending.delete(id);
		if (answer !== 'allow') return false;
		set(id, true);
		return granted(id);
	});
	pending.set(id, p);
	return p;
}

/** Registered services the site offers, in registration order */
export const list = () => [...services.values()].filter(s => enabled(s.id));

/** Every host of every offered service (for a CSP connect-src hint) */
export const hosts = () => [...new Set(list().flatMap(s => s.hosts))];

/** Withdraws every consent (reset "settings") */
export function revokeAll() {
	for (const name of store.names()) {
		if (name.startsWith('consent-')) store.remove(name);
	}
	emit('consent:change', { id: null, granted: false });
}

export const consent = Object.freeze({ register, unregister, removeModule, enabled, granted, set, get, list, hosts, revokeAll, ask });
