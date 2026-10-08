/* JPKCom Desktop — module loader: descriptors, dependencies, i18n, styles, extension points — © Jean Pierre Kolb — MIT License

   Every optional part of the desktop is an ES module whose default export is a
   descriptor (format: docs/ARCHITECTURE.md → "Module descriptor"):

     export default { id: 'notes', kind: 'app', requires: [], i18n: ['notes'], styles: [<own .css files>],
                      app: { icon: 'ti-notes', tint: 'orange', size: [780, 520], name: '@notes.appName' },
                      storage: {…}, trash: {…}, settings: [...], setup(desk) {…}, mount(win, body, bar) {…}, … }

   Loading (loadAll): import every configured file in parallel → order by
   `requires` → load all i18n namespaces → inject all stylesheets (<link>, the
   CSP allows style-src 'self') → per module: register apps, storage keys,
   reset groups, trash types, consent services and contributions → setup().
   A module that fails at any step is reported and skipped; the rest load.
   A descriptor with `locales` (a folder inside its own folder) has its namespaces read from
   there (i18n addSource), unless the core or another module already uses the namespace.
   An app definition with `load: () => import('./window.js')` keeps its window code out of the
   boot: the hooks (the module's default export) and the descriptor's `windowStyles` are loaded
   when the first window of the app opens (registry loadImpl, wm open → win.ready).
   When setup() throws, what the loader registered for it is withdrawn (apps,
   storage keys, reset groups, trash types, consent services, contributions,
   its config section), and so is what setup() registered through the shared
   parts before it threw — services it provided, bus listeners it added
   (on/once), window kinds it defined (wm defineKind) and whatever else a
   shared part records with core/undo.js track(). DOM listeners and
   timers a module creates itself are its own business: setup() creates them
   last. 'module:failed' tells consumers that cached its contributions. */

import { ROOT } from './env.js';
import { config } from './config.js';
import { i18n, addSource } from './i18n.js';
import { registry } from './registry.js';
import { emit } from './bus.js';
import { registerKey, registerGroup, registerTrash, removeModule as dropStorage } from './storage-registry.js';
import { register as registerService, removeModule as dropServices } from './consent.js';
import { deepFreeze } from './config.js';
import { begin as beginSetup, end as endSetup, rollback, discard } from './undo.js';

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const KINDS = new Set(['core', 'module', 'app']);
/* Window hooks of an app implementation — everything else in an app definition is manifest.
   render: panels (kind 'native'); acceptUrl(app, path, from) is the only hook that gets the app, not the window */
export const HOOKS = ['mount', 'render', 'focus', 'relabel', 'menu', 'unmount', 'reopen', 'serialize', 'restore',
	'locationOf', 'acceptUrl', 'reload', 'popOut', 'canPopOut', 'canLink', 'beforeClose'];
/* Descriptor fields the loader handles itself; any other array/object field is a contribution */
const RESERVED = new Set(['id', 'kind', 'requires', 'i18n', 'locales', 'styles', 'windowStyles', 'app', 'apps', 'storage', 'resetGroups', 'trash', 'consent',
	'setup', 'stub', 'version', 'description', 'configKey', 'validateConfig', ...HOOKS]);

const loaded = new Map();       // id → descriptor (frozen view)
const failed = new Map();       // id → reason
const contributions = new Map(); // point → [{ module, ...item }]
const sections = new Map();      // id → its cleaned config section (descriptor configKey + validateConfig)
const styleLinks = new Set();
const windowStyleSets = new Map(); // id → absolute URLs of its windowStyles

/** Where a reference lives: 'reader' → src/modules/reader/index.js; { id, src } → src (relative to the root) */
export function resolveRef(ref, kind) {
	if (typeof ref === 'object' && ref) return { id: ref.id, url: new URL(ref.src, ROOT).href };
	const dir = kind === 'core' ? `src/${ref}/` : kind === 'app' ? `src/apps/${ref}/` : `src/modules/${ref}/`;
	return { id: ref, url: new URL(`${dir}index.js`, ROOT).href };
}

/** Orders descriptors so that every module comes after the ones it requires (stable). */
export function orderByRequires(list, warn = console.warn, known = new Set()) {
	const byId = new Map(list.map(d => [d.id, d]));
	const out = [];
	const state = new Map(); // id → 'visiting' | 'done' | 'skipped'
	const visit = (d, trail) => {
		const s = state.get(d.id);
		if (s === 'done') return true;
		if (s === 'skipped') return false;
		if (s === 'visiting') {
			warn(`[modules] circular requires: ${[...trail, d.id].join(' → ')} — '${d.id}' skipped`);
			state.set(d.id, 'skipped');
			return false;
		}
		state.set(d.id, 'visiting');
		for (const r of d.requires ?? []) {
			if (known.has(r)) continue;
			const dep = byId.get(r);
			if (!dep || !visit(dep, [...trail, d.id])) {
				warn(`[modules] '${d.id}' requires '${r}', which is not available — '${d.id}' skipped`);
				state.set(d.id, 'skipped');
				return false;
			}
		}
		state.set(d.id, 'done');
		out.push(d);
		return true;
	};
	for (const d of list) visit(d, []);
	return out;
}

function addContribution(point, module, value) {
	if (!contributions.has(point)) contributions.set(point, []);
	const list = contributions.get(point);
	if (Array.isArray(value)) {
		for (const item of value) if (item && typeof item === 'object') list.push(Object.freeze({ ...item, module }));
	} else if (value && typeof value === 'object') {
		/* keyed form { name: def } → items with id = key */
		for (const [k, item] of Object.entries(value)) {
			if (item && typeof item === 'object') list.push(Object.freeze({ id: k, ...item, module }));
			else if (typeof item === 'function') list.push(Object.freeze({ id: k, run: item, module }));
		}
	}
}

/** Contributions of every loaded module to an extension point ('settings', 'search', 'terminal', …). */
export const contributionsOf = point => [...(contributions.get(point) ?? [])];

/** Withdraws every contribution of a module (its setup failed). */
export function dropContributions(moduleId) {
	for (const [point, list] of contributions) contributions.set(point, list.filter(item => item.module !== moduleId));
}

/**
 * A module's own config section, cleaned once — before its declared parts are
 * registered (registerParts) and before its setup(), so a declared value may read
 * Desk.modules.config(id) (§8 loader behaviour): descriptor
 * { configKey: 'weather', validateConfig(section, warn) → cleaned }. Modules
 * without validateConfig get the merged section as it is (config[configKey]).
 */
function prepareConfig(d) {
	if (typeof d.configKey !== 'string' || !Object.hasOwn(config, d.configKey)) return;
	const raw = config[d.configKey];
	let clean = raw;
	if (typeof d.validateConfig === 'function') {
		/* a writable deep copy: the cleaner may fix values in place */
		clean = d.validateConfig(raw == null ? raw : JSON.parse(JSON.stringify(raw)), msg => console.warn(`[desktop] config.${d.configKey}: ${msg}`)) ?? raw;
	}
	sections.set(d.id, deepFreeze(clean));
}

/** Everything a failed module registered goes again, so no part calls into it (§8). */
function withdraw(id) {
	/* first what setup() did (services, listeners, …), newest first; then the declared parts */
	rollback(id);
	registry.removeModule(id);
	dropContributions(id);
	dropServices(id);
	dropStorage(id);
	sections.delete(id);
	windowStyleSets.delete(id);
}

function splitApp(def, fallbackId) {
	const manifest = {};
	const impl = {};
	let load = null;
	for (const [k, v] of Object.entries(def)) {
		if (HOOKS.includes(k) && typeof v === 'function') impl[k] = v;
		else if (k === 'load') load = typeof v === 'function' ? v : null;
		else manifest[k] = v;
	}
	manifest.id ??= fallbackId;
	manifest.kind ??= 'app';
	return { manifest, impl: Object.keys(impl).length ? Object.freeze(impl) : null, load };
}

/**
 * What load() resolved to → the window hooks: a module namespace gives its default export, an object
 * itself; only HOOKS functions are kept. Without mount() or render() there is no window to build.
 */
export function hooksOf(value, appId) {
	const src = value && typeof value === 'object' && value.default && typeof value.default === 'object' ? value.default : value;
	const hooks = {};
	if (src && typeof src === 'object') for (const k of HOOKS) if (typeof src[k] === 'function') hooks[k] = src[k];
	if (!hooks.mount && !hooks.render) throw new Error(`app '${appId}': load() gave no mount() or render()`);
	return Object.freeze(hooks);
}

/**
 * A module's windowStyles, injected once (resolves when they are in, or failed) — for its apps' load()
 * and for window kinds it defined with load() (src/wm/wm.js loadKind). Unknown id → resolves at once.
 */
export const windowStyles = id => Promise.all((windowStyleSets.get(id) ?? []).map(injectStyle)).then(() => {});

/** The loader the registry calls for an app with load(): its hooks and the module's windowStyles, together */
function lazyLoader(d, load, appId) {
	return () => Promise.all([Promise.resolve().then(load), windowStyles(d.id)]).then(([value]) => hooksOf(value, appId));
}

/** Registers what a descriptor declares (apps, storage, trash, consent, contributions). */
function registerParts(d) {
	const id = d.id;
	if (Array.isArray(d.windowStyles)) {
		windowStyleSets.set(id, d.windowStyles.filter(s => typeof s === 'string').map(s => new URL(s, d.url).href));
	}
	const appDefs = [];
	if (Array.isArray(d.apps)) appDefs.push(...d.apps.map(a => splitApp(a ?? {}, id)));
	if (d.app && typeof d.app === 'object') {
		/* Single-app shorthand: the descriptor's own hooks belong to its app */
		const hooks = Object.fromEntries(HOOKS.filter(k => typeof d[k] === 'function').map(k => [k, d[k]]));
		appDefs.push(splitApp({ ...d.app, ...hooks }, id));
	}
	for (const { manifest, impl, load } of appDefs) {
		registry.register(manifest, { source: 'module', module: id, impl, load: load ? lazyLoader(d, load, manifest.id) : null });
	}

	for (const [name, def] of Object.entries(d.storage ?? {})) registerKey(name, def, id);
	for (const g of Array.isArray(d.resetGroups) ? d.resetGroups : []) registerGroup(g, id);
	for (const [type, def] of Object.entries(d.trash ?? {})) registerTrash(type, def, id);
	const consents = Array.isArray(d.consent) ? d.consent : Object.entries(d.consent ?? {}).map(([k, v]) => ({ id: k, ...v }));
	for (const c of consents) registerService(c, id);

	for (const [k, v] of Object.entries(d)) {
		if (!RESERVED.has(k) && (Array.isArray(v) || (v && typeof v === 'object'))) addContribution(k, id, v);
	}
}

function injectStyle(href) {
	if (styleLinks.has(href)) return Promise.resolve();
	styleLinks.add(href);
	return new Promise(resolve => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		const done = () => resolve();
		link.addEventListener('load', done, { once: true });
		link.addEventListener('error', () => {
			console.warn(`[modules] stylesheet ${href} could not be loaded`);
			resolve();
		}, { once: true });
		setTimeout(done, 3000);
		document.head.append(link);
	});
}

/**
 * Descriptor field locales → the absolute URL of the folder, or null: only a relative path that ends in '/'
 * and stays inside the module's own folder (no scheme, no leading '/', no '\' or control character).
 */
export function localesDir(value, url) {
	if (typeof value !== 'string' || !value.endsWith('/')) return null;
	if (/^[a-z][a-z0-9+.-]*:|^\/|\\|[\u0000-\u001f\u007f]/i.test(value)) return null;
	try {
		const base = new URL('./', url).href;
		const dir = new URL(value, url).href;
		return dir.startsWith(base) ? dir : null;
	} catch {
		return null;
	}
}

function validate(mod, ref, url) {
	const d = mod?.default;
	if (!d || typeof d !== 'object') throw new Error('the default export must be a descriptor object');
	if (d.id !== ref) throw new Error(`descriptor id '${d.id}' does not match '${ref}'`);
	if (!ID.test(d.id)) throw new Error(`invalid id '${d.id}'`);
	const out = { ...d, kind: KINDS.has(d.kind) ? d.kind : 'module', url };
	if (d.locales !== undefined) {
		const dir = localesDir(d.locales, url);
		if (dir) out.locales = dir;
		else {
			delete out.locales;
			/* a string quoted; anything else only by its type (JSON throws for BigInt and circular values) */
			const shown = typeof d.locales === 'string' ? JSON.stringify(d.locales) : typeof d.locales;
			console.warn(`[modules] '${d.id}': locales ${shown} must be a relative folder inside the module's folder, ending in '/' — ignored`);
		}
	}
	return out;
}

/**
 * Loads modules. groups: [{ kind: 'core'|'module'|'app', refs: [...] }] in load order.
 * desk: the public API handed to setup(). Resolves when every module is set up.
 */
export async function loadAll(groups, desk) {
	const wanted = groups.flatMap(g => g.refs.map(ref => ({ ...resolveRef(ref, g.kind), kind: g.kind })));
	const seen = new Set();
	const unique = wanted.filter(w => {
		if (seen.has(w.id) || loaded.has(w.id)) {
			console.warn(`[modules] '${w.id}' is listed twice — loaded once`);
			return false;
		}
		seen.add(w.id);
		return true;
	});

	/* 1. import in parallel */
	const results = await Promise.allSettled(unique.map(w => import(w.url)));
	const descs = [];
	results.forEach((r, i) => {
		const w = unique[i];
		if (r.status === 'rejected') {
			failed.set(w.id, r.reason?.message ?? String(r.reason));
			console.error(`[modules] '${w.id}' could not be loaded from ${w.url}: ${r.reason?.message ?? r.reason}`);
			return;
		}
		try {
			const d = validate(r.value, w.id, w.url);
			if (d.stub) {
				if (config.debug) console.info(`[modules] '${d.id}' is a placeholder (stub) — nothing to load yet`);
				loaded.set(d.id, Object.freeze(d));
				return;
			}
			descs.push(d);
		} catch (err) {
			failed.set(w.id, err.message);
			console.error(`[modules] '${w.id}' (${w.url}): ${err.message}`);
		}
	});

	/* 2. dependency order */
	const ordered = orderByRequires(descs, console.warn, new Set(loaded.keys()));

	/* 3. strings and styles of all modules at once — first the namespaces that a module keeps in its own
	   folder (locales); one the core or another module already uses keeps its source */
	for (const d of ordered) {
		if (!d.locales) continue;
		for (const ns of Array.isArray(d.i18n) ? d.i18n : []) {
			const other = ordered.find(o => o !== d && !o.locales && Array.isArray(o.i18n) && o.i18n.includes(ns));
			if (other || !addSource(i18n, ns, d.locales)) {
				console.warn(`[modules] '${d.id}': namespace '${ns}' is already taken${other ? ` by '${other.id}'` : ''} — its strings are not read from ${d.locales}`);
			}
		}
	}
	const namespaces = [...new Set(ordered.flatMap(d => (Array.isArray(d.i18n) ? d.i18n : [])))];
	await Promise.all([
		i18n.use(namespaces),
		...ordered.flatMap(d => (Array.isArray(d.styles) ? d.styles : []).map(s => injectStyle(new URL(s, d.url).href)))
	]);

	/* 4. register and set up, in order */
	for (const d of ordered) {
		try {
			/* the order is contract (§8): the cleaned section first, declared parts may read it */
			prepareConfig(d);
			registerParts(d);
			beginSetup(d.id);
			try {
				await d.setup?.(desk);
			} finally {
				endSetup();
			}
			discard(d.id);
			loaded.set(d.id, Object.freeze(d));
			emit('module:loaded', { id: d.id, kind: d.kind });
		} catch (err) {
			failed.set(d.id, err.message);
			console.error(`[modules] '${d.id}' failed during setup:`, err);
			withdraw(d.id);
			emit('module:failed', { id: d.id, reason: err.message });
		}
	}
	/* Site entries that only change a module app ({ id, dock: true }) but found none */
	for (const id of registry.pendingOverrides()) {
		console.warn(`[registry] site data: '${id}' changes an app that no loaded module or collection provides — ignored`);
	}
	emit('modules:ready', { loaded: [...loaded.keys()], failed: [...failed.keys()] });
}

export const modules = Object.freeze({
	loadAll,
	get: id => loaded.get(id) ?? null,
	isLoaded: id => loaded.has(id),
	list: () => [...loaded.values()],
	failed: () => new Map(failed),
	contributions: contributionsOf,
	/** The cleaned config section of a module (descriptor configKey/validateConfig), else config[configKey] or null */
	config: id => sections.get(id) ?? null
});
