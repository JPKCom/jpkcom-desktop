/* JPKCom Desktop — namespaced localStorage / sessionStorage with validation helpers — © Jean Pierre Kolb — MIT License

   Every key is '<namespace>-<name>' (config.namespace, default 'jpkdesk'),
   so several deployments can share one origin. Storage may be unavailable
   (private mode, blocked cookies, full quota): reads then return null and
   writes return false — nothing ever throws.

   Everything read back is untrusted: getJson() takes a validate function, and
   V holds small pure validators to build one. A validator returns the cleaned
   value, or null/undefined for "invalid" (the fallback is used then). */

import { config } from './config.js';
import { emit } from './bus.js';
import { isObj } from './is.js';

/* ---------- Validators (pure) ---------- */

export const V = Object.freeze({
	/** Plain object (not null, not an array) */
	isObj,
	/** String up to max characters, else null */
	str: (v, max = Infinity) => (typeof v === 'string' && v.length <= max ? v : null),
	/** Integer in [min, max], else null */
	int: (v, min = -Infinity, max = Infinity) => (Number.isInteger(v) && v >= min && v <= max ? v : null),
	/** Finite number in [min, max], else null */
	num: (v, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null),
	/** Boolean, else null */
	bool: v => (typeof v === 'boolean' ? v : null),
	/** One of the allowed values, else null */
	oneOf: (v, allowed) => (allowed.includes(v) ? v : null),
	/** '#rrggbb' (lower-cased), else null */
	hex: v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null),
	/** Id safe for DOM ids, CSS selectors and keys: a-z, 0-9 and '-', max 64 */
	id: v => (typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v) ? v : null),
	/** Array mapped through fn (null results dropped), at most max entries, else null */
	list: (v, fn, max = Infinity) => {
		if (!Array.isArray(v)) return null;
		const out = [];
		for (const x of v) {
			if (out.length >= max) break;
			const y = fn(x);
			if (y !== null && y !== undefined) out.push(y);
		}
		return out;
	},
	/** Same-origin path ('/…' but not '//…'), at most max characters, else null */
	path: (v, max = 500) => (typeof v === 'string' && v.length <= max && /^\/(?!\/)/.test(v) ? v : null)
});

/* ---------- Store ---------- */

function safe(fn, fallback) {
	try {
		return fn();
	} catch {
		return fallback;
	}
}

/**
 * Creates a store over Storage-like objects (exported for tests).
 * local/session: objects with getItem/setItem/removeItem/key/length, or a
 * function returning one (evaluated lazily, may throw).
 */
export function createStore({ ns, local, session, notify = () => {} }) {
	const prefix = `${ns}-`;
	const area = a => safe(() => (typeof a === 'function' ? a() : a), null);
	const L = () => area(local);
	const S = () => area(session);

	const api = {
		prefix,

		/** The full storage key of a name: key('theme') → 'jpkdesk-theme' */
		key: name => prefix + name,

		/** Raw string or null */
		get: name => safe(() => L()?.getItem(prefix + name) ?? null, null),

		/** Writes a string; false when storage is unavailable or full */
		set(name, value) {
			const ok = safe(() => {
				L().setItem(prefix + name, String(value));
				return true;
			}, false);
			if (ok) notify(name);
			return ok;
		},

		remove(name) {
			safe(() => L()?.removeItem(prefix + name));
			notify(name);
		},

		/** Parsed JSON passed through validate(value) → cleaned value or null; else fallback */
		getJson(name, validate = v => v, fallback = null) {
			const raw = api.get(name);
			if (raw == null) return fallback;
			let value;
			try {
				value = JSON.parse(raw);
			} catch {
				return fallback;
			}
			const clean = safe(() => validate(value), null);
			return clean === null || clean === undefined ? fallback : clean;
		},

		/** Stores JSON; false when storage is unavailable or full */
		setJson(name, value) {
			let text;
			try {
				text = JSON.stringify(value);
			} catch {
				return false;
			}
			return api.set(name, text);
		},

		/** A stored value from a fixed list, else fallback */
		choice(name, allowed, fallback) {
			const v = api.get(name);
			return allowed.includes(v) ? v : fallback;
		},

		/** 'on'/'off' switches: true/false, or fallback when unset or invalid */
		flag(name, fallback = false) {
			const v = api.get(name);
			return v === 'on' ? true : v === 'off' ? false : fallback;
		},

		setFlag: (name, on) => api.set(name, on ? 'on' : 'off'),

		/** Names (without prefix) of every key this desktop owns */
		names() {
			return safe(() => {
				const s = L();
				const out = [];
				for (let i = 0; i < s.length; i++) {
					const k = s.key(i);
					if (k?.startsWith(prefix)) out.push(k.slice(prefix.length));
				}
				return out;
			}, []);
		},

		/** Approximate bytes used (UTF-16: 2 bytes per character): { own, all } */
		usage() {
			return safe(() => {
				const s = L();
				let own = 0;
				let all = 0;
				for (let i = 0; i < s.length; i++) {
					const k = s.key(i);
					const n = (k.length + (s.getItem(k) || '').length) * 2;
					all += n;
					if (k.startsWith(prefix)) own += n;
				}
				return { own, all };
			}, { own: 0, all: 0 });
		},

		/* sessionStorage: same prefix, for per-tab state (boot screen shown, …) */
		sget: name => safe(() => S()?.getItem(prefix + name) ?? null, null),
		sset: (name, value) => safe(() => {
			S().setItem(prefix + name, String(value));
			return true;
		}, false),
		sremove: name => safe(() => S()?.removeItem(prefix + name))
	};
	return Object.freeze(api);
}

export const store = createStore({
	ns: config.namespace,
	local: () => globalThis.localStorage,
	session: () => globalThis.sessionStorage,
	notify: name => emit('store:change', { name, external: false })
});

/* Another tab of the same desktop changed a key: modules that mirror state
   (notes, tasks) listen to 'store:change' with external: true */
if (typeof window !== 'undefined') {
	window.addEventListener('storage', e => {
		if (e.key?.startsWith(store.prefix)) emit('store:change', { name: e.key.slice(store.prefix.length), external: true });
	});
}
