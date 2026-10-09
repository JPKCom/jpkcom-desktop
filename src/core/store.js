/* JPKCom Desktop — namespaced localStorage / sessionStorage with validation helpers — © Jean Pierre Kolb — MIT License

   Every key is '<namespace>-<name>' (config.namespace, default 'jpkdesk'),
   so several deployments can share one origin. A namespace may itself be
   another one plus '-…' ('jpkdesk-next' next to 'jpkdesk'), so the prefix
   alone does not decide which keys are this desktop's: ownKeys() does
   (names(), usage(), owns() and the 'storage' event use it; §14 "Whose
   keys"). Storage may be unavailable (private mode, blocked cookies, full
   quota): reads then return null and writes return false — nothing ever throws.

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

/* ---------- Which keys are this desktop's ---------- */

function safe(fn, fallback) {
	try {
		return fn();
	} catch {
		return fallback;
	}
}

/* A namespace (config.namespace; the same rule as theme.js and the boot preload) */
const NS = /^[a-z][a-z0-9-]{0,23}$/;

/**
 * The keys of `keys` (all keys of a Storage) that belong to namespace ns, in their order (pure;
 * exported for tests). known(name) answers whether this desktop declares a name (without prefix).
 *
 * A key '<ns>-<name>' is this desktop's when
 *   1. name is declared here (known), or
 *   2. no other installation shows in the keys whose namespace is '<ns>-<p>' with name = '<p>-<rest>'.
 * An installation '<ns>-<p>' shows when a key '<ns>-<p>-<d>' exists whose d is declared here while the
 * whole name '<p>-<d>' is not, and '<ns>-<p>' is a valid namespace. Every undeclared name under such
 * a '<p>-' is left to it (it may have modules this desktop lacks); other undeclared names are this
 * desktop's (leftovers of a module no longer there). When in doubt a key is kept: a leftover named
 * '<x>-<declared name>' makes '<ns>-<x>' look like another installation (§14 "Whose keys", limits).
 */
export function ownKeys(keys, ns, known = () => false) {
	const prefix = `${ns}-`;
	const isKnown = name => safe(() => known(name) === true, false);
	const names = [];
	for (const k of keys) if (typeof k === 'string' && k.startsWith(prefix)) names.push(k.slice(prefix.length));
	const declared = new Set(names.filter(isKnown));
	/* '<p>' of every other installation whose keys show here */
	const others = new Set();
	for (const name of names) {
		if (declared.has(name)) continue;
		for (let i = 1; i < name.length - 1; i++) {
			if (name[i] !== '-') continue;
			const p = name.slice(0, i);
			if (!others.has(p) && NS.test(prefix + p) && isKnown(name.slice(i + 1))) others.add(p);
		}
	}
	const elsewhere = name => [...others].some(p => name.startsWith(`${p}-`));
	return names.filter(name => declared.has(name) || !elsewhere(name)).map(name => prefix + name);
}

/* ---------- Store ---------- */

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
	/* Tests of the names this desktop declares (claim()); a throwing one answers no */
	const claims = new Set();
	const known = name => [...claims].some(fn => safe(() => fn(name) === true, false));
	const allKeys = s => {
		const out = [];
		for (let i = 0; i < (s?.length ?? 0); i++) out.push(s.key(i));
		return out;
	};

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

		/**
		 * Declares names of this desktop: test(name) → true, or one name. The storage registry claims
		 * every registered key, consent the 'consent-<id>' keys of its registered services. Returns a
		 * function that withdraws it.
		 */
		claim(test) {
			const fn = typeof test === 'string' ? name => name === test : test;
			if (typeof fn !== 'function') return () => false;
			claims.add(fn);
			return () => claims.delete(fn);
		},

		/** Whether a full storage key is this desktop's (ownKeys(); a key just removed counts as well) */
		owns(key) {
			if (typeof key !== 'string' || !key.startsWith(prefix)) return false;
			const keys = safe(() => allKeys(L()), []);
			if (!keys.includes(key)) keys.push(key);
			return ownKeys(keys, ns, known).includes(key);
		},

		/** Names (without prefix) of every key this desktop owns (ownKeys(): not another installation's) */
		names() {
			return safe(() => ownKeys(allKeys(L()), ns, known).map(k => k.slice(prefix.length)), []);
		},

		/** Approximate bytes used (UTF-16: 2 bytes per character): { own, all } */
		usage() {
			return safe(() => {
				const s = L();
				const keys = allKeys(s);
				const mine = new Set(ownKeys(keys, ns, known));
				let own = 0;
				let all = 0;
				for (const k of keys) {
					const n = (k.length + (s.getItem(k) || '').length) * 2;
					all += n;
					if (mine.has(k)) own += n;
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
		if (store.owns(e.key)) emit('store:change', { name: e.key.slice(store.prefix.length), external: true });
	});
}
