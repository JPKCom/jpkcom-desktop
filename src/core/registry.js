/* JPKCom Desktop — app registry and generic collections — © Jean Pierre Kolb — MIT License

   One map of everything that can be launched: the site's apps (site/apps.js),
   the apps modules bring along, one link app per author profile, and one app
   per collection item (<prefix>-<slug>). Collections replace the fixed tools /
   games / bookmarks / portfolio lists of the original: any number of them,
   each with optional groups, from which the Catalog, Search, menus, router
   and terminal all read.

   Robust by design: an entry with a missing field, an unknown group, a bad id
   or a URL with the wrong protocol is reported with console.warn and skipped
   — it never stops the desktop. Ids are [a-z0-9-] only, so they are safe in
   CSS selectors, DOM ids, URLs and storage keys. */

import { i18n } from './i18n.js';
import { emit } from './bus.js';
import { V } from './store.js';
import { isSafeUrl, isSafeScope } from './url.js';
import { cleanMan } from './man.js';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** Image files open in the image window (kind 'image') */
export const IMAGE_EXT = /\.(svg|png|jpe?g|webp|avif|gif)$/i;

/** Kinds whose window content comes from a module implementation (impl) */
export const IMPL_KINDS = new Set(['app', 'native']);

const isObj = V.isObj;
const isText = v => (typeof v === 'string' && v.length > 0) || (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));
/* A URL in the manifest: a relative or root path, or an absolute http(s) URL — never javascript:, data:, //host,
   and no control character or backslash anywhere (core/url.js) */
const isUrlValue = v => isSafeUrl(v) || (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(isSafeUrl));
const isSize = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n) && n > 0);
const isTint = v => (typeof v === 'string' && KIND.test(v)) || (Array.isArray(v) && v.length === 2 && v.every(c => HEX.test(c)));
const FLAGS = ['fixed', 'desktop', 'dock', 'hidden', 'nodock', 'transient', 'download', 'linkPaths'];

/** Two-letter mark from a name: 'Space Invaders' → 'SI', 'Tetris' → 'Te' */
export function initials(name) {
	const words = String(name).trim().split(/[\s-]+/).filter(Boolean);
	if (!words.length) return '';
	return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2);
}

/**
 * Creates a registry (exported for tests; the desktop uses the shared one in api.js).
 *   L(text)        resolves { lang: text } maps (i18n.L)
 *   R(text)        the same with the language found: { text, lang } (i18n.resolve; lang null = unknown)
 *   compare(a, b)  locale-aware string comparison (i18n.compare)
 *   onChange()     called (batched per task) after any change
 *   kindCheck(kind) → boolean   can a window/handler for this kind open now? (set later with setKindCheck)
 */
export function createRegistry({ L = v => (typeof v === 'string' ? v : Object.values(v ?? {})[0] ?? ''), R = v => ({ text: L(v), lang: null }), compare = (a, b) => a.localeCompare(b), onChange = () => {}, warn = console.warn, kindCheck = null } = {}) {
	const apps = new Map();         // id → entry (frozen)
	const impls = new Map();        // id → module implementation
	const loaders = new Map();      // id → () => Promise<hooks> — the window code a module loads on demand (app field load)
	const loading = new Map();      // id → Promise<impl> while it loads
	const collections = new Map();  // id → { def, groups: Map, records: [] }
	const site = new Map();         // other sections of site/apps.js (menus, files, …)
	const views = new Map();        // id → resolved alias view (cache)
	const overrides = new Map();    // id → site fields for an app another source brings ({ id, dock: true })
	let canOpen = typeof kindCheck === 'function' ? kindCheck : null;
	let queued = false;

	function changed() {
		views.clear();
		if (queued) return;
		queued = true;
		queueMicrotask(() => {
			queued = false;
			onChange();
		});
	}

	/* ---------- Validation ---------- */

	/** Checks an external link: https (http only when allowed) → { href, host } or null */
	function external(raw, allowHttp) {
		let url;
		try {
			url = new URL(raw);
		} catch {
			return null;
		}
		if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return null;
		return { href: url.href, host: url.host + url.pathname.replace(/\/$/, '') };
	}

	/* A site entry without kind and alias only changes an app that a module, a
	   collection or the author links bring: { id: 'notes', dock: true } */
	const isOverride = (raw, source) => source === 'site' && isObj(raw) && raw.kind == null && raw.alias == null;

	function normalize(raw, where, { override = false } = {}) {
		const bad = msg => {
			warn(`[registry] ${where}: ${msg} — skipped ${JSON.stringify(raw)?.slice(0, 160)}`);
			return null;
		};
		if (!isObj(raw)) return bad('not an object');
		if (typeof raw.id !== 'string' || !ID.test(raw.id)) return bad('id must match [a-z0-9-]');
		const out = { ...raw };
		if (override) {
			/* fields only — what the app is stays with its source */
			delete out.kind;
			delete out.alias;
		} else if (raw.alias != null) {
			if (typeof raw.alias !== 'string' || !ID.test(raw.alias)) return bad('alias must be an app id');
		} else {
			if (typeof raw.kind !== 'string' || !KIND.test(raw.kind)) return bad('kind is missing or invalid');
			if (!isText(raw.name)) return bad('name is missing');
		}
		if (raw.name != null && !isText(raw.name)) return bad('name must be a string or a { lang: text } map');
		if (raw.desc != null && !isText(raw.desc)) delete out.desc;
		if (raw.icon != null && typeof raw.icon !== 'string') delete out.icon;
		if (raw.tint != null && !isTint(raw.tint)) {
			warn(`[registry] ${where}: tint ${JSON.stringify(raw.tint)} is invalid — default tint used`);
			delete out.tint;
		}
		if (raw.mark != null && (typeof raw.mark !== 'string' || raw.mark.length > 4)) delete out.mark;
		if (raw.size != null && !isSize(raw.size)) {
			warn(`[registry] ${where}: size must be [width, height] — default size used`);
			delete out.size;
		}
		if (raw.url != null && !isUrlValue(raw.url)) return bad('url must be a path or an http(s) URL, or a { lang: url } map of them');
		/* web: the folder a stored or linked location may lie in (router.acceptPath) — checked once, here */
		if (raw.scope != null && !isSafeScope(raw.scope)) {
			warn(`[registry] ${where}: scope ${JSON.stringify(String(raw.scope).slice(0, 80))} must be a folder path ('wiki/' or '/wiki/') without '..', '?', '#', ';', an encoded '/' or a scheme — ignored, the default folder applies`);
			delete out.scope;
		}
		for (const f of FLAGS) if (out[f] != null) out[f] = out[f] === true;
		if (raw.kind === 'link') {
			const values = typeof raw.url === 'string' ? { _: raw.url } : raw.url ?? {};
			const checked = Object.entries(values).map(([k, u]) => [k, external(u, raw.allowHttp === true)]);
			if (!checked.length || checked.some(([, u]) => !u)) return bad('a link needs an absolute https:// url');
			out.url = typeof raw.url === 'string' ? checked[0][1].href : Object.fromEntries(checked.map(([k, u]) => [k, u.href]));
			out.host = checked[0][1].host;
		}
		return out;
	}

	/* ---------- Apps ---------- */

	/**
	 * Adds an app. opts: { source: 'site'|'module'|'collection'|'author'|…, module, impl, load }.
	 * A module app whose id the site already declared is merged: the site's fields
	 * win (so a site can rename an app or pin it to the dock), the module adds impl.
	 * load: () => Promise<hooks> — window hooks loaded when the first window opens
	 * (loadImpl); they join impl, a hook in impl wins.
	 * A site entry without kind and alias is an override record: its fields go
	 * onto the app of that id whenever it is registered (before or after).
	 */
	function register(raw, { source = 'site', module = null, impl = null, load = null } = {}) {
		const where = `${source}${module ? ` '${module}'` : ''}`;
		if (isOverride(raw, source)) {
			const fields = normalize(raw, where, { override: true });
			if (!fields) return null;
			/* kept: an app that goes and comes back (vault lock/unlock) gets the fields again */
			overrides.set(fields.id, { ...overrides.get(fields.id), ...fields });
			const existing = apps.get(fields.id);
			if (!existing) return null;
			apps.set(fields.id, Object.freeze({ ...existing, ...fields, id: existing.id }));
			changed();
			return get(fields.id);
		}
		const entry = normalize(raw, where);
		if (!entry) return null;
		const existing = apps.get(entry.id);
		let final;
		if (existing && existing.source === 'site' && source === 'module') {
			final = { ...entry, ...existing, kind: existing.kind ?? entry.kind, source: 'site', module };
		} else if (existing) {
			warn(`[registry] duplicate app id '${entry.id}' (${existing.source} and ${source}) — the later one is ignored`);
			return null;
		} else {
			final = { ...entry, source, module };
		}
		const over = overrides.get(final.id);
		if (over) final = { ...final, ...over, id: final.id };
		apps.set(final.id, Object.freeze(final));
		if (impl) impls.set(final.id, impl);
		if (typeof load === 'function') loaders.set(final.id, load);
		changed();
		return get(final.id);
	}

	function unregister(id) {
		const had = apps.delete(id);
		dropImpl(id);
		for (const c of collections.values()) c.records = c.records.filter(r => r.appId !== id);
		if (had) changed();
		return had;
	}

	/** Removes everything a source added (e.g. 'vault' on lock): apps, collection items, groups. */
	function removeSource(source) {
		for (const [id, e] of apps) if (e.source === source) {
			apps.delete(id);
			dropImpl(id);
		}
		for (const c of collections.values()) {
			c.records = c.records.filter(r => r.source !== source);
			for (const [gid, g] of c.groups) if (g.source === source) c.groups.delete(gid);
		}
		changed();
	}

	/** Withdraws what a module registered (its setup failed): its own apps go, site apps lose the impl. */
	function removeModule(moduleId) {
		for (const [id, e] of apps) {
			if (e.module !== moduleId) continue;
			dropImpl(id);
			if (e.source === 'module') apps.delete(id);
		}
		changed();
	}

	/** The app (aliases resolved to their target with the alias's own fields on top), or null */
	function get(id) {
		if (views.has(id)) return views.get(id);
		const e = apps.get(id);
		if (!e) return null;
		let view = e;
		if (e.alias) {
			let target = apps.get(e.alias);
			for (let i = 0; target?.alias && i < 4; i++) target = apps.get(target.alias);
			if (target && !target.alias) {
				const own = Object.fromEntries(Object.entries(e).filter(([, v]) => v != null));
				/* the manual of an alias is its own man, never its target's (ARCHITECTURE §7 "Manual pages") */
				const { man: _targetMan, ...shown } = target;
				view = Object.freeze({ ...shown, ...own, id: e.id, kind: target.kind, alias: target.id });
			}
		}
		views.set(id, view);
		return view;
	}

	function dropImpl(id) {
		impls.delete(id);
		loaders.delete(id);
		loading.delete(id);
	}

	/* The id that holds the implementation: an alias's target */
	const implId = app => {
		const a = typeof app === 'string' ? get(app) : app;
		return a ? a.alias ?? a.id : null;
	};

	/** The implementation as far as it is there: the hooks given directly, plus loaded ones once loadImpl() resolved */
	const implOf = app => impls.get(implId(app)) ?? null;

	/** Is the implementation complete — nothing left to load (also true for apps without one)? */
	const implReady = app => !loaders.has(implId(app));

	/**
	 * Loads the window hooks of an app once (its load()) and joins them with the hooks given
	 * directly (those win). → Promise<impl | null>. A failed load is reported to the caller and
	 * tried again next time; an app removed meanwhile resolves to what is left (null).
	 */
	function loadImpl(app) {
		const id = implId(app);
		if (!id || !loaders.has(id)) return Promise.resolve(id ? impls.get(id) ?? null : null);
		if (loading.has(id)) return loading.get(id);
		const loader = loaders.get(id);
		const p = Promise.resolve().then(loader).then(hooks => {
			if (loaders.get(id) !== loader) return impls.get(id) ?? null;
			const merged = Object.freeze({ ...(isObj(hooks) ? hooks : {}), ...(impls.get(id) ?? {}) });
			impls.set(id, merged);
			loaders.delete(id);
			loading.delete(id);
			return merged;
		}, err => {
			if (loading.get(id) === p) loading.delete(id);
			throw err;
		});
		loading.set(id, p);
		return p;
	}

	/**
	 * Launchable now? The kind must be openable (kind check: a window kind is
	 * defined, or 'link'/'launcher'), module-backed kinds need their
	 * implementation, aliases their target.
	 */
	function available(app) {
		const a = typeof app === 'string' ? get(app) : app;
		if (!a?.kind) return false;
		if (canOpen && !canOpen(a.kind)) return false;
		return !IMPL_KINDS.has(a.kind) || impls.has(a.alias ?? a.id) || loaders.has(a.alias ?? a.id);
	}

	/** Sets the kind check (the window manager does: defined kinds + 'link' + 'launcher'). */
	function setKindCheck(fn) {
		canOpen = typeof fn === 'function' ? fn : null;
		changed();
	}

	function setImpl(id, impl) {
		if (!apps.has(id)) return false;
		dropImpl(id);
		impls.set(id, impl);
		changed();
		return true;
	}

	/** Apps in registration order. opts: { hidden: include hidden ones, unavailable: include those, kinds: [...] } */
	function list({ hidden = false, unavailable = false, kinds = null, filter = null } = {}) {
		const out = [];
		for (const id of apps.keys()) {
			const a = get(id);
			if (!hidden && a.hidden) continue;
			if (!unavailable && !available(a)) continue;
			if (kinds && !kinds.includes(a.kind)) continue;
			if (filter && !filter(a)) continue;
			out.push(a);
		}
		return out;
	}

	/* ---------- Collections ---------- */

	function groupOf(c, raw, source, where) {
		if (!isObj(raw) || typeof raw.id !== 'string' || !ID.test(raw.id) || !isText(raw.name)) {
			warn(`[registry] ${where}: a group needs an id and a name — skipped ${JSON.stringify(raw)?.slice(0, 120)}`);
			return null;
		}
		return Object.freeze({
			id: raw.id, name: raw.name, desc: isText(raw.desc) ? raw.desc : null,
			icon: typeof raw.icon === 'string' ? raw.icon : null, tint: isTint(raw.tint) ? raw.tint : null, source
		});
	}

	function itemApp(c, raw, where) {
		const d = c.def;
		const bad = msg => {
			warn(`[registry] ${where}: ${msg} — skipped ${JSON.stringify(raw)?.slice(0, 160)}`);
			return null;
		};
		if (!isObj(raw) || typeof raw.slug !== 'string' || !ID.test(raw.slug)) return bad('slug must match [a-z0-9-]');
		let group = null;
		if (raw.group != null || c.groups.size) {
			group = c.groups.get(raw.group);
			if (!group) return bad(`unknown group '${raw.group}'`);
		}
		const id = `${d.prefix}-${raw.slug}`;
		/* docs and guide links follow the same URL rule as url and webUrl; a bad one is dropped, not the item */
		const link = key => {
			if (raw[key] == null) return undefined;
			if (isUrlValue(raw[key])) return raw[key];
			warn(`[registry] ${where}: ${key} must be a path or an http(s) URL, or a { lang: url } map of them — ignored`);
			return undefined;
		};
		/* the terminal's manual (false, a path on this site or { lang: path }); a bad one is dropped, not the item */
		const manOf = () => {
			const r = cleanMan(raw.man);
			if (r.problem) warn(`[registry] ${where}: man must be false, a path on this site or a { lang: path } map with only {slug} {id} {collection} {lang} — ignored`);
			return r.value ?? undefined;
		};
		const man = manOf();
		const base = {
			id, collection: d.id, group: group?.id ?? null, slug: raw.slug, item: true,
			name: raw.name, desc: raw.desc,
			icon: raw.icon ?? group?.icon ?? d.defaultIcon ?? d.icon,
			tint: raw.tint ?? group?.tint ?? d.tint,
			mark: raw.mark ?? (d.initials && !raw.icon && isText(raw.name) ? initials(L(raw.name)) : null),
			size: raw.size ?? d.size, docs: link('docs'), guide: link('guide'), man, fileName: raw.fileName, download: raw.download,
			/* item flags: kept out of the Dock (e.g. private vault bookmarks), hidden from lists */
			nodock: raw.nodock === true ? true : undefined,
			hidden: raw.hidden === true ? true : undefined
		};
		/* An alias shows its target; only what the item sets itself goes on top */
		if (raw.app != null) {
			return {
				id, collection: d.id, group: group?.id ?? null, slug: raw.slug, item: true, alias: raw.app,
				name: raw.name, desc: raw.desc, icon: raw.icon, tint: raw.tint, mark: raw.mark, man
			};
		}
		if (!isText(raw.name)) return bad('name is missing');

		const url = raw.url ?? (d.urlTemplate ? d.urlTemplate.replaceAll('{slug}', raw.slug) : null);
		if (!isUrlValue(url)) return bad(url == null ? 'url is missing' : 'url must be a path or an http(s) URL');
		const first = typeof url === 'string' ? url : Object.values(url)[0];
		let kind = raw.kind ?? d.itemKind;
		if (kind === 'auto') {
			kind = /^https?:\/\//i.test(first) ? 'link' : IMAGE_EXT.test(first.split(/[?#]/)[0]) ? 'image' : 'web';
		}
		if (!KIND.test(kind)) return bad(`kind '${kind}' is invalid`);
		/* http:// is allowed per collection or per item (an intranet bookmark) */
		/* scope is validated by normalize() (register), like on an AppEntry */
		return { ...base, kind, url, allowHttp: raw.allowHttp === true || d.allowHttp,
			scope: raw.scope, linkPaths: raw.linkPaths === true ? true : undefined };
	}

	function addRecords(c, items, { source, prepend = false }) {
		const added = [];
		for (const [i, raw] of (Array.isArray(items) ? items : []).entries()) {
			const entry = itemApp(c, raw, `collection '${c.def.id}' item ${i}`);
			if (!entry) continue;
			const clean = Object.fromEntries(Object.entries(entry).filter(([, v]) => v != null));
			if (!register(clean, { source })) continue;
			added.push({ appId: entry.id, slug: raw.slug, group: entry.group, source });
		}
		c.records = prepend ? [...added, ...c.records] : [...c.records, ...added];
	}

	/**
	 * Adds a collection:
	 *   { id, prefix?, app?, name, desc?, icon?, tint?, sort: 'alpha'|'manual', itemKind: 'auto'|'link'|'web'|'page'|'image',
	 *     basePath?, urlTemplate?, size?, defaultIcon?, initials?, allowHttp?, webApp?, webUrl?, allLabel?, webLabel?, man?, groups: [...], items: [...] }
	 * webApp (an app id): the app the Catalog's web button launches — wins over webUrl while it is available.
	 * webUrl (a path or http(s) URL, or a { lang: url } map): the collection's page on the classic website;
	 * man (false, or a template on this site with {slug} or {id}, or a { lang: template } map): the terminal's
	 * manual for every item of this source that sets none (src/core/man.js); collection(id).man → null when not set.
	 * allLabel / webLabel: the Catalog's wording for "All" and "… on the web" (text or { lang: text }).
	 * Its browser app (kind 'collection', id = app ?? id) is created unless the site declares it.
	 */
	function addCollection(raw, { source = 'site' } = {}) {
		const where = `collection '${raw?.id}'`;
		if (!isObj(raw) || typeof raw.id !== 'string' || !ID.test(raw.id) || !isText(raw.name)) {
			warn(`[registry] ${where}: needs an id [a-z0-9-] and a name — skipped`);
			return null;
		}
		if (collections.has(raw.id)) {
			warn(`[registry] ${where}: defined twice — the second one is ignored`);
			return null;
		}
		if (raw.webUrl !== undefined && raw.webUrl !== null && !isUrlValue(raw.webUrl)) {
			warn(`[registry] ${where}: webUrl must be a path or an http(s) URL, or a { lang: url } map — ignored`);
		}
		const man = cleanMan(raw.man, { template: true });
		if (man.problem) warn(`[registry] ${where}: man must be false, or a template on this site with {slug} or {id} (or a { lang: template } map) — ignored`);
		const appId = raw.app === null ? null : (typeof raw.app === 'string' && ID.test(raw.app) ? raw.app : raw.id);
		/* Existence and other Catalogs are checked at use: module, author and vault apps may come later */
		let webApp = raw.webApp == null ? null : typeof raw.webApp === 'string' && ID.test(raw.webApp) ? raw.webApp : undefined;
		if (webApp === undefined) {
			warn(`[registry] ${where}: webApp must be an app id [a-z0-9-] — ignored`);
			webApp = null;
		} else if (webApp && webApp === appId) {
			warn(`[registry] ${where}: webApp '${webApp}' is the collection's own Catalog — ignored`);
			webApp = null;
		}
		const def = Object.freeze({
			id: raw.id,
			prefix: typeof raw.prefix === 'string' && ID.test(raw.prefix) ? raw.prefix : raw.id,
			app: appId,
			name: raw.name,
			desc: isText(raw.desc) ? raw.desc : null,
			icon: typeof raw.icon === 'string' ? raw.icon : 'ti-folder',
			tint: isTint(raw.tint) ? raw.tint : 'slate',
			sort: raw.sort === 'manual' ? 'manual' : 'alpha',
			itemKind: typeof raw.itemKind === 'string' && (raw.itemKind === 'auto' || KIND.test(raw.itemKind)) ? raw.itemKind : 'auto',
			basePath: typeof raw.basePath === 'string' ? raw.basePath : null,
			urlTemplate: typeof raw.urlTemplate === 'string' && raw.urlTemplate.includes('{slug}') ? raw.urlTemplate : null,
			size: isSize(raw.size) ? raw.size : null,
			defaultIcon: typeof raw.defaultIcon === 'string' ? raw.defaultIcon : null,
			initials: raw.initials === true,
			allowHttp: raw.allowHttp === true,
			search: raw.search !== false,
			webApp,
			webUrl: isUrlValue(raw.webUrl) ? raw.webUrl : null,
			allLabel: isText(raw.allLabel) ? raw.allLabel : null,
			webLabel: isText(raw.webLabel) ? raw.webLabel : null,
			man: man.value,
			source
		});
		const c = { def, groups: new Map(), records: [] };
		for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
			const group = groupOf(c, g, source, where);
			if (group && !c.groups.has(group.id)) c.groups.set(group.id, group);
		}
		collections.set(def.id, c);
		if (def.app && !apps.has(def.app)) {
			register({
				id: def.app, kind: 'collection', collection: def.id, name: def.name, desc: def.desc,
				icon: def.icon, tint: def.tint, size: isSize(raw.appSize) ? raw.appSize : [880, 580]
			}, { source });
		}
		addRecords(c, raw.items, { source });
		changed();
		return def;
	}

	/** Adds groups and items to an existing collection (e.g. private bookmarks after unlocking). */
	function extendCollection(id, { groups = [], items = [], prepend = false } = {}, { source = 'site' } = {}) {
		const c = collections.get(id);
		if (!c) {
			warn(`[registry] extendCollection: unknown collection '${id}'`);
			return false;
		}
		const fresh = [];
		for (const g of groups) {
			const group = groupOf(c, g, source, `collection '${id}'`);
			if (!group) continue;
			if (c.groups.has(group.id)) warn(`[registry] collection '${id}': group '${group.id}' exists already — kept the first`);
			else fresh.push([group.id, group]);
		}
		c.groups = new Map(prepend ? [...fresh, ...c.groups] : [...c.groups, ...fresh]);
		addRecords(c, items, { source, prepend });
		changed();
		return true;
	}

	/**
	 * Removes a collection that a source other than the site added (the vault's own one after a
	 * lock): every item app, its browser app when the registry created that for this collection,
	 * and the collection itself. The site's collections cannot be removed → false.
	 */
	function removeCollection(id) {
		const c = collections.get(id);
		if (!c) {
			warn(`[registry] removeCollection: unknown collection '${id}'`);
			return false;
		}
		if (c.def.source === 'site') {
			warn(`[registry] removeCollection: '${id}' belongs to the site — not removed`);
			return false;
		}
		for (const r of c.records) {
			apps.delete(r.appId);
			impls.delete(r.appId);
		}
		const app = c.def.app ? apps.get(c.def.app) : null;
		if (app && app.kind === 'collection' && app.collection === c.def.id && app.source === c.def.source) {
			apps.delete(app.id);
			impls.delete(app.id);
		}
		collections.delete(id);
		changed();
		return true;
	}

	const collection = id => {
		const c = collections.get(id);
		return c ? { ...c.def, groups: [...c.groups.values()] } : null;
	};

	/**
	 * The apps of a collection (optionally one group), sorted: 'manual' keeps the
	 * manifest order, 'alpha' orders by group, then by name in the current language.
	 */
	function items(id, { group = null } = {}) {
		const c = collections.get(id);
		if (!c) return [];
		const order = new Map([...c.groups.keys()].map((g, i) => [g, i]));
		const rows = c.records
			.filter(r => !group || r.group === group)
			.map(r => ({ r, app: get(r.appId) }))
			.filter(x => x.app);
		if (c.def.sort === 'alpha') {
			rows.sort((a, b) => ((order.get(a.r.group) ?? 0) - (order.get(b.r.group) ?? 0)) || compare(L(a.app.name), L(b.app.name)));
		}
		return rows.map(x => x.app);
	}

	/* ---------- Site data ---------- */

	/**
	 * Loads site/apps.js: { apps, collections, menus, files, … }. Sections other
	 * than apps and collections are kept as they are for their consumers (data()).
	 */
	function load(data, { source = 'site' } = {}) {
		if (!isObj(data)) {
			warn('[registry] site data must be an object { apps, collections, menus, files }');
			return;
		}
		for (const [k, v] of Object.entries(data)) {
			if (k === 'apps') {
				if (!Array.isArray(v)) warn('[registry] site data: apps must be an array');
				else for (const a of v) register(a, { source });
			} else if (k === 'collections') {
				if (!Array.isArray(v)) warn('[registry] site data: collections must be an array');
				else for (const c of v) addCollection(c, { source });
			} else {
				site.set(k, v);
			}
		}
	}

	/** One link app per author profile (config.author.links): author-<id> */
	function authorLinks(links) {
		for (const l of links ?? []) {
			register({
				id: `author-${l.id}`, kind: 'link', icon: l.icon ?? 'ti-link', tint: l.tint ?? 'graphite',
				name: l.name ?? l.label, desc: l.label, url: l.url, dock: l.dock === true, author: true
			}, { source: 'author' });
		}
	}

	return Object.freeze({
		register, unregister, removeSource, removeModule, get, has: id => apps.has(id), list, available,
		impl: implOf, implReady, loadImpl, setImpl, load, authorLinks, setKindCheck,
		/** Announces 'apps:change' again (availability changed outside: a kind was defined, a service came) */
		refresh: changed,
		/** Ids of override records that no app has picked up (yet) */
		pendingOverrides: () => [...overrides.keys()].filter(id => !apps.has(id)),
		name: app => L(app?.name), desc: app => L(app?.desc), url: app => L(app?.url),
		/** The language the app's name was found in (a fallback map entry or locale): mark it with Desk.dom.markLang */
		nameLang: app => R(app?.name).lang,
		addCollection, extendCollection, removeCollection, collection, items,
		collections: () => [...collections.values()].map(c => collection(c.def.id)),
		data: key => site.get(key) ?? null
	});
}

/** The desktop's registry; changes are announced as 'apps:change' (batched). */
export const registry = createRegistry({
	L: v => i18n.L(v),
	R: v => i18n.resolve(v),
	compare: (a, b) => i18n.compare(a, b),
	onChange: () => emit('apps:change', {})
});
