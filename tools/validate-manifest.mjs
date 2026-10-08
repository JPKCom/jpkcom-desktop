#!/usr/bin/env node
/* JPKCom Desktop — site manifest validator (site/apps.js) — © Jean Pierre Kolb — MIT License

   Checks the site manifest against the configuration before it goes online —
   the desktop itself skips invalid entries with a console warning, this tool
   names them all at once:

     - ids ([a-z0-9-]), duplicates, kinds (and the module each kind needs)
     - references: aliases, override records, menu entries, collections in menus,
       config.site.legal / defaultPageApp / notify.app / vault.collection / about.moreInfo
     - collections: prefix, groups (unknown or duplicate), slugs, item urls and kinds,
       webApp / webUrl / allLabel / webLabel (the Catalog's "… on the web" button,
       also on a Catalog app or its override record)
     - files (terminal cat): name: path | { lang: path } | { url, aliases: ['name'] }
     - manual pages (terminal man): man on items and collections, config.terminal.manUrl —
       the rules of src/core/man.js; files a value names that are missing are warnings
       (counted per collection and language for templates), never errors
     - urls: relative paths, /paths or https:// — never javascript:, data:, //host;
       link apps https only (http only with allowHttp); local files must exist
     - scope, linkPaths (web apps and items): scope a folder path (root-relative or
       '/…' outside the desktop), the start page inside it
     - icons: Tabler ids in src/icons/tabler.js (or at least in @tabler/icons → run
       `npm run icons`), custom glyphs from src/icons/custom.js, icons of the site icon
       sets (config.iconSets); config.brand.glyph the same way (a warning)
     - site icon sets: each file of config.iconSets — exists, below the root and not below
       vault.dir, JSON in format jpkcom-desktop-icons/1, ids, prefixes, definitions against the
       allowlist of src/core/icon-sets.js, size
     - tints: a name from config.theme.tints or a ['#top', '#bottom'] pair
     - texts: every language map has a value for each of config.languages;
       '@ns.key' references exist in the locale files
     - site data the manifest points at: the fortunes per language, the feeds;
       the Fortune config (online only, app texts)

   Usage
     node tools/validate-manifest.mjs [--manifest site/apps.js] [--config site/config.js]
                                      [--strict] [--quiet] [--json]

     --strict   warnings fail as well (exit code 1)
     --quiet    print problems only, no summary line
     --json     machine-readable result

   Exit code: 0 = fine, 1 = errors (or warnings with --strict), 2 = the manifest or
   config could not be loaded. Zero dependencies (Node ≥ 24). */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { UNSAFE_URL_CHARS, MAX_URL, safeUrl, isSafeUrl, isSafeScope } from '../src/core/url.js';
import { cleanMan, isTextPath, MAN_VARS } from '../src/core/man.js';
import { expandMan } from '../src/apps/terminal/lib.js';
import { iconPrefix, safeViewBox, LARGE_SET_BYTES, DEFAULT_VIEWBOX } from '../src/core/icon-sets.js';
import { readIconSets } from './icon-set-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const ICON_ID = /^tif?-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NS_KEY = /^@([a-z][a-z0-9-]*)\.(.+)$/;
const IMAGE_EXT = /\.(svg|png|jpe?g|webp|avif|gif)$/i;
const FLAGS = ['fixed', 'desktop', 'dock', 'hidden', 'nodock', 'transient', 'download', 'logo', 'allowHttp', 'linkPaths'];
const TOP_KEYS = new Set(['apps', 'collections', 'menus', 'files']);

/* Window kinds and the module that defines them (wm: built in) */
const KIND_MODULE = { web: 'wm', app: 'wm', native: 'wm', link: null, launcher: 'shell', page: 'reader', image: 'viewer', viewer: 'viewer', collection: 'catalog' };

/* App ids of the parts, used when a descriptor cannot be imported (or is still a stub) */
const PART_APPS = {
	shell: ['launcher'],
	panels: ['about-desktop', 'settings', 'wallpaper', 'backup', 'trash', 'help'],
	viewer: ['viewer'],
	media: ['audio', 'video'],
	editor: ['editor'], notes: ['notes'], todo: ['todo'], calc: ['calc'], terminal: ['terminal'], fortune: ['fortune']
};

/* URL checks (src/core/url.js): relative values are resolved against a stand-in page to
   compare origins */
const URL_ORIGIN = 'https://origin.invalid';
const URL_BASE_PATH = '/base/';
const URL_BASE = `${URL_ORIGIN}${URL_BASE_PATH}`;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ------------------------------------------------------------------ */
/*  The check itself (pure: everything outside comes in through ctx)   */
/* ------------------------------------------------------------------ */

/**
 * Validates a manifest object.
 * ctx: {
 *   languages: ['en', 'de'],           config.languages
 *   tints: Set of tint names           config.theme.tints
 *   moduleApps: Map appId → module     apps that loaded modules bring
 *   modules: Set of loaded module ids  core parts + config.modules + config.apps
 *   authorLinks: ['github', …]         config.author.links ids
 *   icon(id) → 'ok' | 'build' | 'unknown' | 'set' ('set': the prefix of a site icon set, not in it)
 *   iconSets: readIconSets() result     the site icon sets (messages name the set)
 *   file(path) → true | false | null   does a local file exist (null: not checkable; 'x/' needs x/index.html)
 *   dir(path) → true | false | null    does a local folder exist
 *   i18n(ns, key, lang) → boolean      does a locale key exist
 *   config: the effective config (references from the config into the manifest)
 * }
 * → { errors: [{ where, msg }], warnings: [...], stats: { apps, collections, items, menus, files } }
 */
export function validateManifest(manifest, ctx) {
	const errors = [];
	const warnings = [];
	const err = (where, msg) => errors.push({ where, msg });
	const warn = (where, msg) => warnings.push({ where, msg });
	const langs = ctx.languages ?? ['en'];
	const stats = { apps: 0, collections: 0, items: 0, menus: 0, files: 0 };

	if (!isObj(manifest)) {
		err('site/apps.js', 'the default export must be an object { apps, collections, menus, files }');
		return { errors, warnings, stats };
	}
	for (const k of Object.keys(manifest)) {
		if (!TOP_KEYS.has(k)) warn(k, 'unknown section — kept and readable through Desk.apps.data(key)');
	}

	/* ---------- Building blocks ---------- */

	/* soft: report what would be an error as a warning (fields that earlier versions did not check) */
	function text(where, v, { required = false, field = 'name', soft = false } = {}) {
		const bad = soft ? warn : err;
		if (v == null) {
			if (required) bad(where, `${field} is missing`);
			return;
		}
		if (typeof v === 'string') {
			if (!v) bad(where, `${field} is empty`);
			const m = NS_KEY.exec(v);
			if (m) for (const l of langs) if (ctx.i18n && !ctx.i18n(m[1], m[2], l)) warn(where, `${field} '${v}': no such key in locales/${l}/${m[1]}.js`);
			return;
		}
		if (!isObj(v) || !Object.keys(v).length || !Object.values(v).every(x => typeof x === 'string' && x)) {
			bad(where, `${field} must be a text or a { lang: text } map of non-empty texts`);
			return;
		}
		const missing = langs.filter(l => !(l in v));
		if (missing.length) bad(where, `${field} has no text for ${missing.map(l => `'${l}'`).join(', ')}`);
	}

	const prefixes = setPrefixes(ctx.iconSets?.sets ?? []);
	function icon(where, id) {
		if (id == null) return;
		if (typeof id !== 'string') return err(where, 'icon must be an icon id');
		const r = ctx.icon ? ctx.icon(id) : 'ok';
		if (r === 'build') warn(where, `icon '${id}' is not in src/icons/tabler.js yet — run npm run icons`);
		else if (r === 'set') {
			const p = iconPrefix(id);
			err(where, `icon '${id}' is not in the site icon set(s) with prefix '${p}' (${(prefixes.get(p) ?? []).join(', ')})`);
		} else if (r === 'unknown') {
			err(where, ICON_ID.test(id) ? `icon '${id}' does not exist in Tabler Icons`
				: `icon '${id}' is neither a Tabler id (ti-…, tif-…), a custom glyph nor an icon of a site icon set (config.iconSets)`);
		}
	}

	function tint(where, v) {
		if (v == null) return;
		if (typeof v === 'string') {
			if (!KIND.test(v)) err(where, `tint '${v}' is not a valid name`);
			else if (ctx.tints && !ctx.tints.has(v)) warn(where, `tint '${v}' is not in config.theme.tints (${[...ctx.tints].join(', ')})`);
			return;
		}
		if (!Array.isArray(v) || v.length !== 2 || !v.every(c => typeof c === 'string' && HEX.test(c))) err(where, "tint must be a name or ['#rrggbb', '#rrggbb']");
	}

	/* One url value: 'link' → https only; others: relative, /path or http(s).
	   The rule of the desktop itself (src/core/url.js, shared so the two cannot drift), judged
	   the way a browser parses the value: the URL parser drops tab/CR/LF anywhere and reads a
	   backslash as '/', so 'java<TAB>script:', '/<TAB>/host' or '/<backslash>host' would slip
	   past a check on the raw text — control characters, DEL and backslashes are refused
	   outright, scheme and origin are taken from the parsed result. */
	function oneUrl(where, u, { link = false, allowHttp = false, field = 'url', soft = false } = {}) {
		const bad = soft ? warn : err;
		if (typeof u !== 'string' || !u) return bad(where, `${field} must be a non-empty string`);
		if (/^\s|\s$/.test(u)) return bad(where, `${field} '${u}' has spaces at the start or end`);
		if (UNSAFE_URL_CHARS.test(u)) return bad(where, `${field} ${JSON.stringify(u)}: control characters and backslashes are not allowed`);
		if (u.length > MAX_URL) return bad(where, `${field} is longer than ${MAX_URL} characters`);
		if (u.startsWith('//')) return bad(where, `${field} '${u}': protocol-relative addresses are not allowed`);
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]?.toLowerCase();
		if (scheme && scheme !== 'http' && scheme !== 'https') return bad(where, `${field} '${u}': the protocol ${scheme}: is not allowed`);
		const r = safeUrl(u, URL_BASE, URL_ORIGIN);
		if (!r) return bad(where, scheme ? `${field} '${u}' is not a valid address` : `${field} '${u}': a relative address must stay on the desktop's own origin`);
		if (/\s/.test(u)) warn(where, `${field} '${u}' contains a space — write it as %20`);
		if (link) {
			if (scheme === 'https' || (scheme === 'http' && allowHttp)) return;
			return bad(where, `${field} '${u}': a link needs an absolute https:// address${scheme === 'http' ? ' (or allowHttp: true)' : ''}`);
		}
		if (scheme === 'http') return warn(where, `${field} '${u}' uses http: — browsers block it on an https site`);
		/* local files must exist: the normalised path below the page (a /root path is not checkable) */
		if (!scheme && ctx.file && !u.startsWith('/') && r.pathname.startsWith(URL_BASE_PATH)) {
			const ok = ctx.file(r.pathname.slice(URL_BASE_PATH.length) || './');
			if (ok === false) bad(where, `${field} '${u}': no such file in the project`);
		}
	}

	function url(where, v, opts = {}) {
		if (v == null) return;
		if (typeof v === 'string') return oneUrl(where, v, opts);
		if (!isObj(v) || !Object.keys(v).length) return (opts.soft ? warn : err)(where, `${opts.field ?? 'url'} must be a string or a { lang: url } map`);
		for (const [l, u] of Object.entries(v)) oneUrl(`${where} [${l}]`, u, opts);
		const missing = langs.filter(l => !(l in v));
		if (missing.length) warn(where, `${opts.field ?? 'url'} has no address for ${missing.map(l => `'${l}'`).join(', ')} (the first one is used)`);
	}

	/* A manual value (man on an item or collection, config.terminal.manUrl) — syntax only, no file
	   check here (a template names files per item and language; see the file pass below).
	   → the cleaned value (null when not set or invalid) */
	function manValue(where, v, { template = false, field = 'man' } = {}) {
		const r = cleanMan(v, { template });
		if (r.problem) {
			const { code, detail, lang } = r.problem;
			const at = lang ? ` [${lang}]` : '';
			const vars = MAN_VARS.map(x => `{${x}}`).join(' ');
			if (code === 'type') err(where, `${field} must be false, a path on this site or a { lang: path } map (${detail})`);
			else if (code === 'lang') err(where, `${field}: '${detail}' is not a language tag (e.g. 'en', 'de-AT')`);
			else if (code === 'placeholder') err(where, `${field}${at}: unknown placeholder ${detail} — only ${vars}`);
			else if (code === 'template') err(where, `${field}${at} '${detail}' applies to many items and needs {slug} or {id}`);
			else err(where, `${field}${at} ${JSON.stringify(detail)} must be a path on this site: relative or /…, no scheme, no //host, no whitespace (write %20), at most 500 characters`);
			return null;
		}
		if (r.value === null || r.value === false) return r.value;
		const entries = typeof r.value === 'string' ? [[null, r.value]] : Object.entries(r.value);
		const sample = { slug: 'x', id: 'x-x', collection: 'x', lang: langs[0] ?? 'en' };
		let ok = true;
		for (const [l, p] of entries) {
			const at = l ? ` [${l}]` : '';
			const filled = p.replace(/\{([a-z]+)\}/g, (all, k) => sample[k] ?? all);
			if (!safeUrl(filled, URL_BASE, URL_ORIGIN)) {
				err(where, `${field}${at} '${p}' must stay on the desktop's own origin`);
				ok = false;
			} else if (!isTextPath(p)) {
				warn(where, `${field}${at} '${p}' is not a .md/.markdown/.txt file — it is only shown as a link (use docs for pages)`);
			}
		}
		if (typeof r.value !== 'string') {
			const missing = langs.filter(l => !(l in r.value));
			if (missing.length) warn(where, `${field} has no path for ${missing.map(l => `'${l}'`).join(', ')} (the chain's next language or the first path is used)`);
		}
		return ok ? r.value : null;
	}

	function size(where, v, field = 'size') {
		if (v == null) return;
		if (!Array.isArray(v) || v.length !== 2 || !v.every(n => Number.isFinite(n) && n > 0)) err(where, `${field} must be [width, height] in pixels`);
	}

	function flags(where, raw) {
		for (const f of FLAGS) if (raw[f] != null && typeof raw[f] !== 'boolean') warn(where, `${f} should be true or false`);
		if (raw.mark != null && (typeof raw.mark !== 'string' || !raw.mark || raw.mark.length > 4)) err(where, 'mark must be 1–4 characters');
	}

	/* scope and linkPaths (web windows, ARCHITECTURE §7/§15). The installation path is unknown here, so
	   "the root or a parent of it" and "root-absolute inside the root" are left to the desktop (a warning
	   in the console); only '/' — a parent of every root — is certain. kind: null when unknown. */
	function scopeCheck(where, raw, kind) {
		const has = raw.scope != null;
		if (has && !isSafeScope(raw.scope)) {
			err(where, `scope ${JSON.stringify(String(raw.scope).slice(0, 80))} must be a folder path ('wiki/' or '/wiki/') without '..', '?', '#', ';', an encoded '/' or a scheme — the desktop ignores it`);
			return;
		}
		if (raw.scope === '/') {
			err(where, "scope '/' covers the whole site including the desktop — the desktop ignores it (a scope is never the installation folder or a parent of it)");
			return;
		}
		if ((has || raw.linkPaths === true) && kind && kind !== 'web') warn(where, `${has ? 'scope' : 'linkPaths'} is only used by kind 'web'`);
		if (has && kind === 'web' && typeof raw.url === 'string' && isSafeUrl(raw.url) && !/^https?:/i.test(raw.url)) {
			try {
				const folder = new URL(raw.scope.endsWith('/') ? raw.scope : `${raw.scope}/`, raw.scope.startsWith('/') ? URL_ORIGIN : URL_BASE).pathname;
				const start = new URL(raw.url, URL_BASE).pathname;
				if (!start.startsWith(folder) && `${start}/` !== folder) warn(where, `the start page '${raw.url}' lies outside scope '${raw.scope}' — restored locations never lead back to it`);
			} catch { /* reported by url() */ }
		}
	}

	function kindNeeds(where, kind) {
		if (!(kind in KIND_MODULE)) {
			warn(where, `kind '${kind}' is not built in — a module must define it (wm.defineKind)`);
			return;
		}
		const mod = KIND_MODULE[kind];
		if (mod && ctx.modules && !ctx.modules.has(mod)) warn(where, `kind '${kind}' needs the module '${mod}', which is not loaded — the entry stays hidden`);
	}

	/* ---------- Collect every app id first (references may point forward) ---------- */

	const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
	if (manifest.apps != null && !Array.isArray(manifest.apps)) err('apps', 'must be an array');
	const collections = Array.isArray(manifest.collections) ? manifest.collections : [];
	if (manifest.collections != null && !Array.isArray(manifest.collections)) err('collections', 'must be an array');

	const ids = new Map();          // app id → { source, kind?, alias? }
	const add = (id, info) => { if (!ids.has(id)) ids.set(id, info); };
	for (const [id, mod] of ctx.moduleApps ?? []) add(id, { source: 'module', module: mod, kind: id === 'launcher' ? 'launcher' : 'app' });
	for (const l of ctx.authorLinks ?? []) add(`author-${l}`, { source: 'author', kind: 'link' });

	const siteIds = new Set();
	const overrides = [];
	for (const [i, raw] of apps.entries()) {
		const where = `apps[${i}]${typeof raw?.id === 'string' ? ` '${raw.id}'` : ''}`;
		if (!isObj(raw)) {
			err(where, 'not an object');
			continue;
		}
		if (typeof raw.id !== 'string' || !ID.test(raw.id)) {
			err(where, 'id must match [a-z0-9-] (1–64 characters, starting with a letter or digit)');
			continue;
		}
		if (raw.kind == null && raw.alias == null) {
			overrides.push([where, raw]);
			continue;
		}
		if (siteIds.has(raw.id)) err(where, `duplicate id '${raw.id}' — the later entry is ignored`);
		siteIds.add(raw.id);
		const known = ids.get(raw.id);
		if (known?.source === 'author') err(where, `id '${raw.id}' is also used by an author link (config.author.links)`);
		ids.set(raw.id, { source: 'site', kind: raw.kind, alias: raw.alias, url: raw.url, collection: raw.collection, module: known?.module });
	}

	const colIds = new Set();
	const colGrouped = new Set();
	for (const [ci, c] of collections.entries()) {
		if (!isObj(c) || typeof c.id !== 'string' || !ID.test(c.id)) continue;
		if (colIds.has(c.id)) continue;
		colIds.add(c.id);
		if (Array.isArray(c.groups) && c.groups.length) colGrouped.add(c.id);
		const appId = c.app === null ? null : typeof c.app === 'string' ? c.app : c.id;
		if (appId && !ids.has(appId)) ids.set(appId, { source: 'collection', kind: 'collection', collection: c.id });
		const prefix = typeof c.prefix === 'string' && ID.test(c.prefix) ? c.prefix : c.id;
		for (const it of Array.isArray(c.items) ? c.items : []) {
			if (!isObj(it) || typeof it.slug !== 'string' || !ID.test(it.slug)) continue;
			const id = `${prefix}-${it.slug}`;
			if (ids.has(id) && ids.get(id).source !== 'item') err(`collections[${ci}] '${c.id}' item '${it.slug}'`, `the app id '${id}' is taken already (${ids.get(id).source})`);
			else if (!ids.has(id)) ids.set(id, { source: 'item', alias: it.app, collection: c.id });
		}
	}

	const isApp = id => ids.has(id);
	const kindOf = id => {
		let e = ids.get(id);
		for (let i = 0; e?.alias && i < 5; i++) e = ids.get(e.alias);
		return e?.kind ?? null;
	};
	const entryOf = id => {
		let e = ids.get(id);
		for (let i = 0; e?.alias && i < 5; i++) e = ids.get(e.alias);
		return e ?? null;
	};
	/* The collection a Catalog app shows (following aliases), else null */
	const catalogOf = id => {
		const e = entryOf(id);
		return e?.kind === 'collection' ? (typeof e.collection === 'string' ? e.collection : id) : null;
	};
	const basePathOf = cid => collections.find(c => isObj(c) && c.id === cid)?.basePath;
	const slash = p => (p.endsWith('/') ? p : `${p}/`);
	/* exactly the two forms the router sends to the Catalog: basePath with and without the trailing slash */
	const atBase = (u, base) => typeof u === 'string' && (u === slash(base) || u === slash(base).slice(0, -1));
	const valuesOf = v => (typeof v === 'string' ? [v] : isObj(v) ? Object.values(v) : []);

	/* The Catalog's web button: webApp must name another launchable app (cid = the collection shown) */
	function webApp(where, v, cid, basePath) {
		if (v == null) return;
		if (typeof v !== 'string' || !ID.test(v)) return err(where, 'webApp must be an app id');
		if (!isApp(v)) return err(where, `web app '${v}' does not exist`);
		if (cid && catalogOf(v) === cid) return err(where, `webApp '${v}' is a Catalog of this collection`);
		const kind = kindOf(v);
		if (kind) kindNeeds(`${where} webApp '${v}'`, kind);
		if (kind === 'page' && typeof basePath === 'string' && valuesOf(entryOf(v)?.url).some(u => atBase(u, basePath))) {
			warn(where, `webApp '${v}' is a page app at the collection's basePath — its deep link opens the Catalog; use a web app, or url '${slash(basePath)}index.html'`);
		}
	}
	/* Does a config.site.routes rule catch the path u first (and send it elsewhere than a Catalog of
	   cid)? String-based like the rest: rules written against a deeper deployment root are missed */
	const siteRoutes = Array.isArray(ctx.config?.site?.routes) ? ctx.config.site.routes : [];
	const rooted = p => `/${p.replace(/^\//, '')}`;
	function routedElsewhere(u, cid) {
		for (const r of siteRoutes) {
			if (!isObj(r) || !(r.app || r.tab || r.page)) continue;
			let hit = false;
			if (typeof r.match === 'string') {
				try {
					const re = new RegExp(r.match);
					hit = re.test(u) || re.test(rooted(u));
				} catch { /* an invalid pattern: the router skips it too */ }
			} else if (typeof r.prefix === 'string') {
				hit = rooted(u).startsWith(rooted(r.prefix));
			}
			if (!hit) continue;
			/* as the router: an unknown app falls through to the next rule */
			if (typeof r.app === 'string' && isApp(r.app)) return catalogOf(r.app) !== cid;
			if (r.tab === true || r.page === true) return true;
		}
		return false;
	}
	/* The web button's fields on a Catalog app or its override record: webApp is new (errors), the
	   others were not checked before (warnings, so a site that passed stays passing) */
	const withWebApp = new Set();
	function webFields(where, raw, cid) {
		webApp(where, raw.webApp, cid, basePathOf(cid));
		url(where, raw.webUrl, { field: 'webUrl', soft: true });
		text(where, raw.allLabel, { field: 'allLabel', soft: true });
		text(where, raw.webLabel, { field: 'webLabel', soft: true });
		if (raw.webApp != null) withWebApp.add(raw.id);
	}

	/* ---------- Apps ---------- */

	for (const [i, raw] of apps.entries()) {
		if (!isObj(raw) || typeof raw.id !== 'string' || !ID.test(raw.id) || (raw.kind == null && raw.alias == null)) continue;
		const where = `apps[${i}] '${raw.id}'`;
		stats.apps++;
		if (raw.alias != null) {
			if (typeof raw.alias !== 'string' || !ID.test(raw.alias)) err(where, 'alias must be an app id');
			else if (!isApp(raw.alias)) err(where, `alias target '${raw.alias}' does not exist`);
			else if (raw.alias === raw.id) err(where, 'an alias cannot point at itself');
			text(where, raw.name);
		} else {
			if (typeof raw.kind !== 'string' || !KIND.test(raw.kind)) {
				err(where, 'kind is missing or invalid');
				continue;
			}
			kindNeeds(where, raw.kind);
			text(where, raw.name, { required: true });
			if (raw.kind === 'collection') {
				if (typeof raw.collection !== 'string' || !colIds.has(raw.collection)) err(where, `collection '${raw.collection}' is not defined in collections`);
				webFields(where, raw, typeof raw.collection === 'string' ? raw.collection : null);
			}
			if (['page', 'web', 'link', 'image'].includes(raw.kind) && raw.url == null) err(where, `a '${raw.kind}' app needs a url`);
			if (['app', 'native'].includes(raw.kind) && !ctx.moduleApps?.has(raw.id)) warn(where, `kind '${raw.kind}' needs a module implementation, and no loaded module brings '${raw.id}'`);
		}
		text(where, raw.desc, { field: 'desc' });
		icon(where, raw.icon);
		tint(where, raw.tint);
		size(where, raw.size);
		flags(where, raw);
		url(where, raw.url, { link: raw.kind === 'link', allowHttp: raw.allowHttp === true });
		scopeCheck(where, raw, raw.alias != null ? null : raw.kind);
		if (raw.dock === true && raw.nodock === true) warn(where, 'dock and nodock contradict each other');
	}

	for (const [where, raw] of overrides) {
		if (!isApp(raw.id) || ids.get(raw.id).source === 'site') {
			warn(where, `override record for '${raw.id}', but no module, collection or author link brings an app with this id`);
		}
		text(where, raw.name);
		text(where, raw.desc, { field: 'desc' });
		icon(where, raw.icon);
		tint(where, raw.tint);
		size(where, raw.size);
		flags(where, raw);
		if (raw.url != null) url(where, raw.url, { link: kindOf(raw.id) === 'link' });
		const cid = isApp(raw.id) ? catalogOf(raw.id) : null;
		if (cid) webFields(where, raw, cid);
		scopeCheck(where, raw, kindOf(raw.id));
	}

	/* ---------- Collections ---------- */

	const seenCols = new Set();
	const manCols = [];             // [{ where, id, prefix, man, items: [{ where, slug, set, man }] }] — the man file pass
	for (const [ci, c] of collections.entries()) {
		const where = `collections[${ci}]${typeof c?.id === 'string' ? ` '${c.id}'` : ''}`;
		if (!isObj(c)) {
			err(where, 'not an object');
			continue;
		}
		if (typeof c.id !== 'string' || !ID.test(c.id)) {
			err(where, 'id must match [a-z0-9-]');
			continue;
		}
		if (seenCols.has(c.id)) {
			err(where, `collection '${c.id}' is defined twice — the second one is ignored`);
			continue;
		}
		seenCols.add(c.id);
		stats.collections++;
		text(where, c.name, { required: true });
		text(where, c.desc, { field: 'desc' });
		icon(where, c.icon);
		icon(where, c.defaultIcon);
		tint(where, c.tint);
		size(where, c.size);
		size(where, c.appSize, 'appSize');
		if (c.prefix != null && (typeof c.prefix !== 'string' || !ID.test(c.prefix))) err(where, 'prefix must match [a-z0-9-]');
		if (c.app != null && (typeof c.app !== 'string' || !ID.test(c.app))) err(where, 'app must be an app id or null');
		if (c.sort != null && !['alpha', 'manual'].includes(c.sort)) warn(where, "sort must be 'alpha' or 'manual' — 'alpha' is used");
		if (c.itemKind != null && c.itemKind !== 'auto' && (typeof c.itemKind !== 'string' || !KIND.test(c.itemKind))) err(where, `itemKind '${c.itemKind}' is invalid`);
		if (c.urlTemplate != null && (typeof c.urlTemplate !== 'string' || !c.urlTemplate.includes('{slug}'))) err(where, 'urlTemplate must contain {slug}');
		if (c.basePath != null) {
			if (typeof c.basePath !== 'string' || /^[a-z][a-z0-9+.-]*:/i.test(c.basePath) || c.basePath.startsWith('//')) err(where, 'basePath must be a path');
			else if (ctx.dir && !c.basePath.startsWith('/') && ctx.dir(c.basePath) === false) warn(where, `basePath '${c.basePath}' is no folder in the project`);
		}
		if (ctx.modules && !ctx.modules.has('catalog') && c.app !== null) warn(where, "the module 'catalog' is not loaded — the collection has no window");
		/* The Catalog's "… on the web" button and its wording */
		url(where, c.webUrl, { field: 'webUrl' });
		text(where, c.allLabel, { field: 'allLabel' });
		text(where, c.webLabel, { field: 'webLabel' });
		/* The terminal's manual for every item (a template) */
		const manCol = { where, id: c.id, prefix: typeof c.prefix === 'string' && ID.test(c.prefix) ? c.prefix : c.id, man: manValue(where, c.man, { template: true }), items: [] };
		manCols.push(manCol);
		const self = c.app === null ? null : typeof c.app === 'string' ? c.app : c.id;
		webApp(where, c.webApp, c.id, c.basePath);
		/* any Catalog window of the collection uses it — the collection's own app or another Catalog AppEntry */
		if (c.webApp != null && ![...ids.keys()].some(id => catalogOf(id) === c.id)) {
			warn(where, 'no Catalog window shows this collection — webApp is unused');
		}
		/* The trap: the router sends basePath to the collection's app only — when that is a Catalog of this
		   collection, a webUrl equal to basePath leads back to it (unless a site route sends it elsewhere) */
		if (typeof c.basePath === 'string' && c.webApp == null && self && catalogOf(self) === c.id && !withWebApp.has(self)) {
			const trap = valuesOf(c.webUrl).find(u => atBase(u, c.basePath) && !routedElsewhere(u, c.id));
			if (trap) warn(where, `webUrl '${trap}' is this collection's basePath — the button opens it in a new tab; name a web app in webApp to open a window`);
		}

		const groups = new Map();
		for (const [gi, g] of (Array.isArray(c.groups) ? c.groups : []).entries()) {
			const gw = `${where} groups[${gi}]${typeof g?.id === 'string' ? ` '${g.id}'` : ''}`;
			if (!isObj(g) || typeof g.id !== 'string' || !ID.test(g.id)) {
				err(gw, 'a group needs an id [a-z0-9-]');
				continue;
			}
			if (groups.has(g.id)) {
				err(gw, `group '${g.id}' is defined twice`);
				continue;
			}
			groups.set(g.id, 0);
			text(gw, g.name, { required: true });
			text(gw, g.desc, { field: 'desc' });
			icon(gw, g.icon);
			tint(gw, g.tint);
		}

		const slugs = new Set();
		for (const [ii, it] of (Array.isArray(c.items) ? c.items : []).entries()) {
			const iw = `${where} items[${ii}]${typeof it?.slug === 'string' ? ` '${it.slug}'` : ''}`;
			if (!isObj(it) || typeof it.slug !== 'string' || !ID.test(it.slug)) {
				err(iw, 'slug must match [a-z0-9-]');
				continue;
			}
			if (slugs.has(it.slug)) {
				err(iw, `slug '${it.slug}' is used twice in this collection`);
				continue;
			}
			slugs.add(it.slug);
			stats.items++;
			if (groups.size || it.group != null) {
				if (!groups.has(it.group)) err(iw, it.group == null ? 'needs a group (the collection has groups)' : `unknown group '${it.group}'`);
				else groups.set(it.group, groups.get(it.group) + 1);
			}
			icon(iw, it.icon);
			tint(iw, it.tint);
			size(iw, it.size);
			flags(iw, it);
			text(iw, it.desc, { field: 'desc' });
			/* checked before the alias branch: an alias item has its own man (never its target's) */
			manCol.items.push({ where: iw, slug: it.slug, set: it.man != null, man: manValue(iw, it.man) });
			if (it.app != null) {
				if (typeof it.app !== 'string' || !ID.test(it.app)) err(iw, 'app must be an app id');
				else if (!isApp(it.app)) err(iw, `alias target '${it.app}' does not exist`);
				text(iw, it.name);
				if (it.url != null) warn(iw, 'an alias item ignores its url');
				continue;
			}
			text(iw, it.name, { required: true });
			const raw = it.url ?? (typeof c.urlTemplate === 'string' ? c.urlTemplate.replaceAll('{slug}', it.slug) : null);
			if (raw == null) {
				err(iw, 'url is missing (and the collection has no urlTemplate)');
				continue;
			}
			const first = typeof raw === 'string' ? raw : isObj(raw) ? Object.values(raw)[0] : '';
			let kind = it.kind ?? c.itemKind ?? 'auto';
			if (kind === 'auto') kind = /^https?:\/\//i.test(first ?? '') ? 'link' : IMAGE_EXT.test(String(first ?? '').split(/[?#]/)[0]) ? 'image' : 'web';
			if (typeof kind !== 'string' || !KIND.test(kind)) {
				err(iw, `kind '${kind}' is invalid`);
				continue;
			}
			kindNeeds(iw, kind);
			url(iw, raw, { link: kind === 'link', allowHttp: c.allowHttp === true || it.allowHttp === true });
			scopeCheck(iw, { ...it, url: raw }, kind);
			url(iw, it.docs, { field: 'docs' });
			url(iw, it.guide, { field: 'guide' });
		}
		for (const [g, n] of groups) if (!n) warn(`${where} group '${g}'`, 'has no items');
		if (!slugs.size) warn(where, 'has no items');
	}

	/* ---------- Menus ---------- */

	const menus = manifest.menus;
	if (menus != null && !Array.isArray(menus)) err('menus', 'must be an array');
	const menuItem = (where, x, depth) => {
		if (x === '-') return;
		if (typeof x === 'string') {
			if (!ID.test(x)) err(where, `'${x}' is not an app id`);
			else if (!isApp(x)) err(where, `app '${x}' does not exist`);
			return;
		}
		if (!isObj(x)) return err(where, "an entry is an app id, '-', { collection }, { label, url } or { label, items }");
		if (x.collection != null) {
			if (!colIds.has(x.collection)) err(where, `collection '${x.collection}' does not exist`);
			else if (depth > 0 && colGrouped.has(x.collection)) warn(where, `inside a submenu the groups of '${x.collection}' are listed flat (group headings, no second submenu level) — put { collection } directly into the menu for one submenu per group`);
			if (x.label != null) text(where, x.label, { field: 'label' });
			return;
		}
		text(where, x.label, { required: true, field: 'label' });
		if (x.url != null) return url(where, x.url);
		if (Array.isArray(x.items)) {
			if (depth > 0) return err(where, 'submenus go one level deep');
			if (!x.items.length) warn(where, 'an empty submenu is left out');
			x.items.forEach((y, j) => menuItem(`${where} items[${j}]`, y, depth + 1));
			return;
		}
		err(where, 'needs a url or items');
	};
	const menuIds = new Set();
	for (const [mi, m] of (Array.isArray(menus) ? menus : []).entries()) {
		const where = `menus[${mi}]${typeof m?.id === 'string' ? ` '${m.id}'` : ''}`;
		if (!isObj(m) || !Array.isArray(m.items)) {
			err(where, 'a menu needs a label and items');
			continue;
		}
		stats.menus++;
		if (m.id != null) {
			if (typeof m.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(m.id)) warn(where, 'id must match [a-z][a-z0-9-] — a numbered id is used');
			else if (menuIds.has(m.id)) warn(where, `menu id '${m.id}' is used twice`);
			else menuIds.add(m.id);
		}
		text(where, m.label, { required: true, field: 'label' });
		if (!m.items.length) warn(where, 'has no items — it is not shown');
		const seps = m.items.filter(x => x === '-').length;
		if (seps && (m.items[0] === '-' || m.items.at(-1) === '-')) warn(where, 'a separator at the start or end is dropped');
		m.items.forEach((x, j) => menuItem(`${where} items[${j}]`, x, 0));
	}

	/* ---------- Files (terminal cat) ---------- */

	const files = manifest.files;
	if (files != null) {
		if (!isObj(files)) err('files', "must be an object { name: path | { lang: path } | { url, aliases: ['name'] } }");
		else {
			const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
			const taken = new Map(Object.keys(files).map(n => [n.toLowerCase(), n]));
			for (const [name, v] of Object.entries(files)) {
				const where = `files '${name}'`;
				stats.files++;
				if (!FILE_NAME.test(name)) warn(where, 'use a short name without spaces — it is typed in the terminal');
				/* The object form { url, aliases } (a language map has no 'url' key) */
				const ext = isObj(v) && Object.hasOwn(v, 'url');
				const path = ext ? v.url : v;
				if (ext) {
					for (const k of Object.keys(v)) if (k !== 'url' && k !== 'aliases') warn(where, `unknown field '${k}' — only url and aliases are read`);
					if (v.aliases != null) {
						if (!Array.isArray(v.aliases)) err(where, "aliases must be a list of names ['other-name']");
						else {
							for (const a of v.aliases) {
								if (typeof a !== 'string' || !FILE_NAME.test(a)) err(where, `alias ${JSON.stringify(a)} must be a short name [a-z0-9._-] — it is skipped`);
								else if (taken.has(a.toLowerCase()) && taken.get(a.toLowerCase()) !== name) warn(where, `alias '${a}' is also the name of the file '${taken.get(a.toLowerCase())}'`);
								else taken.set(a.toLowerCase(), name);
							}
						}
					}
				}
				if (path == null) err(where, 'url is missing');
				else url(where, path, { field: 'path' });
				const paths = typeof path === 'string' ? [path] : isObj(path) ? Object.values(path) : [];
				if (paths.some(p => typeof p === 'string' && /^https?:/i.test(p))) warn(where, 'the terminal reads same-origin files only — it skips this entry');
			}
		}
	}

	/* ---------- References from the config into the manifest ---------- */

	const cfg = ctx.config;
	if (cfg) {
		for (const [j, x] of (Array.isArray(cfg.site?.legal) ? cfg.site.legal : []).entries()) {
			if (typeof x === 'string' && !isApp(x)) err(`config site.legal[${j}]`, `app '${x}' does not exist`);
		}
		const pageRef = (where, id) => {
			if (id == null) return;
			if (!isApp(id)) err(where, `app '${id}' does not exist`);
			else if (kindOf(id) !== 'page') warn(where, `app '${id}' is not a page app`);
		};
		pageRef('config site.defaultPageApp', cfg.site?.defaultPageApp);
		if (cfg.notify?.feeds && ctx.modules?.has('notify')) pageRef('config notify.app', cfg.notify?.app);
		if (ctx.modules?.has('vault') && cfg.vault?.collection && !colIds.has(cfg.vault.collection)) {
			err('config vault.collection', `collection '${cfg.vault.collection}' does not exist`);
		}
		const glyph = cfg.brand?.glyph;
		if (typeof glyph === 'string' && glyph && ctx.icon) {
			const r = ctx.icon(glyph);
			if (r === 'build') warn('config brand.glyph', `icon '${glyph}' is not in src/icons/tabler.js yet — run npm run icons (until then the menu bar shows ti-app-window)`);
			else if (r !== 'ok') warn('config brand.glyph', `config.brand.glyph '${glyph}' is not a known icon — the menu bar shows ti-app-window`);
		}
		const more = cfg.about?.moreInfo;
		if (typeof more === 'string' && ID.test(more) && !/[/.]/.test(more) && !isApp(more)) warn('config about.moreInfo', `app '${more}' does not exist`);
		if (cfg.site?.home != null) url('config site.home', cfg.site.home);
	}

	/* ---------- Manual pages: config.terminal.manUrl, then the files the values name ---------- */

	const manUrlRaw = cfg?.terminal?.manUrl;
	const manUrl = manUrlRaw == null || manUrlRaw === false ? null : manValue('config terminal.manUrl', manUrlRaw, { template: true, field: 'manUrl' });
	if (manUrlRaw != null && manUrlRaw !== false && !colIds.size) warn('config terminal.manUrl', 'is set, but the manifest has no collection — it never applies');
	if (ctx.file) {
		/* the path of a value in one language (null: the value does not depend on the language) */
		const pathIn = (value, vars, lang) => expandMan(value, vars, lang ? [lang] : [])[0];
		const langsOf = value => (typeof value === 'string' && !value.includes('{lang}') ? [null] : langs);
		/* true / false (missing) / null (not checkable: /root path, link, outside the project) */
		const exists = p => {
			if (typeof p !== 'string' || p.startsWith('/') || !isTextPath(p)) return null;
			const r = safeUrl(p, URL_BASE, URL_ORIGIN);
			if (!r || !r.pathname.startsWith(URL_BASE_PATH)) return null;
			return ctx.file(r.pathname.slice(URL_BASE_PATH.length) || './');
		};
		const NOTE = 'man says "no manual page"';
		for (const col of manCols) {
			const level = col.man !== null ? col.man : manUrl;
			const counts = new Map();    // lang → { missing, total, example }
			for (const it of col.items) {
				const vars = { slug: it.slug, id: `${col.prefix}-${it.slug}`, collection: col.id };
				if (it.set) {
					if (it.man === null || it.man === false) continue;
					const seen = new Set();
					for (const l of langsOf(it.man)) {
						const p = pathIn(it.man, vars, l);
						if (seen.has(p)) continue;
						seen.add(p);
						if (exists(p) === false) warn(it.where, `man '${p}'${l ? ` [${l}]` : ''}: no such file in the project — ${NOTE}`);
					}
					continue;
				}
				if (level === null || level === false) continue;
				for (const l of langsOf(level)) {
					const p = pathIn(level, vars, l);
					const ok = exists(p);
					if (ok === null) continue;
					const n = counts.get(l) ?? { missing: 0, total: 0, example: null };
					n.total++;
					if (ok === false) {
						n.missing++;
						n.example ??= p;
					}
					counts.set(l, n);
				}
			}
			const source = col.man !== null ? 'man' : 'config terminal.manUrl';
			for (const [l, n] of counts) {
				if (!n.missing) continue;
				warn(`collection '${col.id}'`, `${source} has no file for ${n.missing} of ${n.total} items${l ? ` in '${l}'` : ''} (e.g. ${n.example}) — ${NOTE}`);
			}
		}
	}

	return { errors, warnings, stats };
}

/* A Fortune app text (config.fortune.texts): a non-empty string or a non-empty { lang: text } map */
const isFortuneText = v => (typeof v === 'string' && v.length > 0)
	|| (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string' && x.length > 0));

/** Prefix → sources of the site icon sets that bring icons with it */
export function setPrefixes(sets) {
	const out = new Map();
	for (const set of sets) {
		for (const id of Object.keys(set.icons ?? {})) {
			const p = iconPrefix(id);
			if (!out.has(p)) out.set(p, []);
			if (!out.get(p).includes(set.src)) out.get(p).push(set.src);
		}
	}
	return out;
}

/**
 * Checks the site icon sets (readIconSets() of tools/icon-set-files.mjs → sets): missing files,
 * refused sets, every problem of a set (ids, prefixes, duplicates, dropped allowlist items), a set
 * below vault.dir → errors; a large set and outline icons off the 24-unit grid without their own
 * stroke-width → warnings.
 */
export function validateIconSets(sets) {
	const errors = [];
	const warnings = [];
	for (const set of sets ?? []) {
		const where = set.src;
		if (set.missing) {
			errors.push({ where: 'config iconSets', msg: `site icon set ${set.src} does not exist` });
			continue;
		}
		if (set.below === 'vault') errors.push({ where, msg: `site icon set ${set.src} lies inside vault.dir — the service worker never caches it; move it to site/icon-sets/` });
		if (set.fatal) {
			errors.push({ where, msg: `site icon set refused: ${set.fatal}` });
			continue;
		}
		for (const p of set.problems ?? []) errors.push({ where, msg: p });
		if (set.bytes > LARGE_SET_BYTES) {
			warnings.push({ where, msg: `site icon set ${set.src} is ${Math.round(set.bytes / 1024)} KiB (${set.count} icons) — ship only the icons the site uses` });
		}
		const offGrid = [];
		for (const [id, def] of Object.entries(set.icons ?? {})) {
			if ((def.k ?? 'o') !== 'o' || (def.a && 'stroke-width' in def.a)) continue;
			const vb = safeViewBox(def.vb ?? DEFAULT_VIEWBOX) ?? DEFAULT_VIEWBOX;
			const [, , w, h] = vb.trim().split(/[ ,]+/).map(Number);
			if (w !== 24 || h !== 24) offGrid.push([id, w, h]);
		}
		for (const [id, w, h] of offGrid.slice(0, 5)) {
			warnings.push({ where, msg: `'${id}' is an outline icon on a ${w}×${h} grid — --icon-stroke (1.75) is in viewBox units; give a: { 'stroke-width': … }` });
		}
		if (offGrid.length > 5) warnings.push({ where, msg: `${offGrid.length - 5} more outline icons off the 24-unit grid without their own stroke-width` });
	}
	return { errors, warnings };
}

/**
 * Checks the site data the configuration points at: fortunes per language,
 * feeds per language, the Fortune config (online only, app texts — textKeys:
 * model.js TEXT_KEYS). read(path) → parsed JSON | undefined (missing) | Error.
 */
export function validateSiteData(cfg, { languages, read, cleanFortunes = null, textKeys = null, modules = new Set() } = {}) {
	const errors = [];
	const warnings = [];
	/* online only (fortune.local: false) — the same rule as the page and sw.js: remote must be a valid id */
	const validRemote = typeof cfg.fortune?.remote === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(cfg.fortune.remote);
	const onlineOnly = cfg.fortune?.local === false && validRemote;
	if (modules.has('fortune') && isObj(cfg.fortune)) {
		if (cfg.fortune.local === false && !validRemote) {
			warnings.push({ where: 'config fortune', msg: 'local: false needs remote — the app uses its built-in sayings' });
		}
		if (onlineOnly && cfg.services?.fortune !== true) {
			warnings.push({ where: 'config fortune', msg: 'local: false needs services.fortune: true — the app has nothing to show' });
		}
		const texts = cfg.fortune.texts;
		if (Array.isArray(textKeys) && isObj(texts)) {
			for (const [k, v] of Object.entries(texts)) {
				const where = `config fortune.texts.${k}`;
				if (!textKeys.includes(k)) warnings.push({ where, msg: `texts.${k} cannot be replaced (keys: ${textKeys.join(', ')})` });
				else if (!isFortuneText(v)) errors.push({ where, msg: `texts.${k} must be a text, '@ns.key' or { lang: text }` });
				else if (isObj(v)) {
					const missing = languages.filter(l => !(l in v));
					if (missing.length) errors.push({ where, msg: `texts.${k} has no text for ${missing.map(l => `'${l}'`).join(', ')}` });
				}
			}
		}
	}
	if (modules.has('fortune') && cfg.fortune?.dir && !onlineOnly) {
		for (const l of languages) {
			const path = `${cfg.fortune.dir}${l}.json`;
			const data = read(path);
			if (data === undefined) warnings.push({ where: path, msg: `no sayings for '${l}' — the Fortune app falls back to the next language` });
			else if (data instanceof Error) errors.push({ where: path, msg: data.message });
			else if (cleanFortunes) {
				const problems = [];
				const clean = cleanFortunes(data, { code: l, block: cfg.fortune.block ?? [], warn: m => problems.push(m) });
				for (const m of problems) warnings.push({ where: path, msg: m });
				if (!clean) errors.push({ where: path, msg: 'no usable entries' });
			}
		}
	}
	if (modules.has('notify') && isObj(cfg.notify?.feeds)) {
		for (const [l, path] of Object.entries(cfg.notify.feeds)) {
			if (typeof path !== 'string' || /^[a-z]+:/i.test(path) || path.startsWith('/')) continue;
			const data = read(path);
			if (data === undefined) errors.push({ where: `config notify.feeds.${l}`, msg: `${path} does not exist` });
			else if (data instanceof Error) errors.push({ where: path, msg: data.message });
			else if (!isObj(data) || !Array.isArray(data.items)) errors.push({ where: path, msg: 'not a JSON Feed (items missing)' });
			else if (typeof data.version !== 'string' || !data.version.startsWith('https://jsonfeed.org/version/')) warnings.push({ where: path, msg: 'version should be "https://jsonfeed.org/version/1.1"' });
		}
		const missing = languages.filter(l => !(l in cfg.notify.feeds));
		if (missing.length && Object.keys(cfg.notify.feeds).length) warnings.push({ where: 'config notify.feeds', msg: `no feed for ${missing.join(', ')} (the fallback language's feed is used)` });
	}
	return { errors, warnings };
}

/* ------------------------------------------------------------------ */
/*  Command line                                                       */
/* ------------------------------------------------------------------ */

const arg = (args, name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

/** Runs the site config (a classic script) in a sandbox → window.DESKTOP_CONFIG */
function loadSiteConfig(path) {
	const sandbox = { window: {}, console };
	sandbox.globalThis = sandbox;
	runInNewContext(readFileSync(path, 'utf8'), sandbox, { filename: path, timeout: 2000 });
	const raw = sandbox.window.DESKTOP_CONFIG ?? sandbox.DESKTOP_CONFIG;
	/* objects of the sandbox have its own Object.prototype: copy them into this realm */
	return raw === undefined ? undefined : structuredClone(raw);
}

/* Imports a module silently (descriptors may warn about config in Node) */
async function quietImport(url) {
	const saved = { warn: console.warn, log: console.log, info: console.info };
	console.warn = console.log = console.info = () => {};
	try {
		return await import(url);
	} finally {
		Object.assign(console, saved);
	}
}

async function moduleApps(cfg) {
	const apps = new Map();
	const loaded = new Set(['wm', 'shell', 'panels']);
	const parts = [['wm', 'src/wm/index.js'], ['shell', 'src/shell/index.js'], ['panels', 'src/panels/index.js']];
	const entry = (x, folder) => (typeof x === 'string' ? [x, `src/${folder}/${x}/index.js`] : isObj(x) && typeof x.id === 'string' ? [x.id, x.src] : null);
	for (const x of cfg.modules ?? []) { const e = entry(x, 'modules'); if (e) parts.push(e); }
	for (const x of cfg.apps ?? []) { const e = entry(x, 'apps'); if (e) parts.push(e); }
	for (const [id, src] of parts) {
		loaded.add(id);
		let ids = null;
		try {
			const d = (await quietImport(pathToFileURL(join(ROOT, src)).href)).default;
			if (d && !d.stub) ids = [...(d.app ? [d.id] : []), ...(Array.isArray(d.apps) ? d.apps.map(a => a?.id).filter(Boolean) : [])];
		} catch {
			/* not importable in Node: the known list below */
		}
		for (const a of ids ?? PART_APPS[id] ?? []) if (!apps.has(a)) apps.set(a, id);
	}
	return { apps, loaded };
}

function iconChecker(iconSets = { ids: new Map(), sets: [] }) {
	const prefixes = setPrefixes(iconSets.sets);
	let pack = {};
	let custom = {};
	try {
		pack = readTabler();
	} catch { /* not built yet */ }
	try {
		custom = readCustom();
	} catch { /* none */ }
	return id => {
		if (pack[id] || custom[id] || iconSets.ids.has(id)) return 'ok';
		if (prefixes.has(iconPrefix(id))) return 'set';
		const m = /^(tif?)-([a-z0-9-]+)$/.exec(id);
		if (!m) return 'unknown';
		const file = join(ROOT, 'node_modules/@tabler/icons/icons', m[1] === 'ti' ? 'outline' : 'filled', `${m[2]}.svg`);
		if (existsSync(file)) return 'build';
		return existsSync(join(ROOT, 'node_modules/@tabler/icons')) ? 'unknown' : 'build';
	};
}

/* The icon packs are ES modules with plain data; read their keys without importing the DOM helpers */
function readTabler() {
	const src = readFileSync(join(ROOT, 'src/icons/tabler.js'), 'utf8');
	return Object.fromEntries([...src.matchAll(/^\t'(tif?-[a-z0-9-]+)':/gm)].map(m => [m[1], true]));
}
function readCustom() {
	const src = readFileSync(join(ROOT, 'src/icons/custom.js'), 'utf8');
	const block = src.slice(src.indexOf('export const symbols'), src.indexOf('export const logos'));
	return Object.fromEntries([...block.matchAll(/^\t'?([a-z][a-z0-9-]*)'?: \{/gm)].map(m => [m[1], true]));
}

function i18nChecker() {
	const cache = new Map();
	return async (ns, lang) => {
		const k = `${lang}/${ns}`;
		if (!cache.has(k)) {
			const file = join(ROOT, 'locales', lang, `${ns}.js`);
			cache.set(k, existsSync(file) ? (await import(pathToFileURL(file).href)).default ?? {} : null);
		}
		return cache.get(k);
	};
}

function fileChecker() {
	return path => {
		const abs = resolve(ROOT, decodeURIComponent(path));
		if (relative(ROOT, abs).startsWith('..')) return null;
		if (!existsSync(abs)) return false;
		return path.endsWith('/') ? statSync(abs).isDirectory() && existsSync(join(abs, 'index.html')) : true;
	};
}

function readJson(path) {
	const abs = join(ROOT, path);
	if (!existsSync(abs)) return undefined;
	try {
		return JSON.parse(readFileSync(abs, 'utf8'));
	} catch (e) {
		return new Error(`invalid JSON: ${e.message}`);
	}
}

async function main() {
	const args = process.argv.slice(2);
	const manifestPath = resolve(ROOT, arg(args, 'manifest', 'site/apps.js'));
	const configPath = resolve(ROOT, arg(args, 'config', 'site/config.js'));
	const strict = args.includes('--strict');
	const quiet = args.includes('--quiet');
	const asJson = args.includes('--json');
	const rel = p => relative(ROOT, p) || p;

	let site;
	try {
		site = existsSync(configPath) ? loadSiteConfig(configPath) : {};
	} catch (e) {
		console.error(`✖ ${rel(configPath)}: ${e.message}`);
		process.exit(2);
	}
	const configWarnings = [];
	const { buildConfig } = await quietImport(pathToFileURL(join(ROOT, 'src/core/config.js')).href);
	const cfg = buildConfig(site, msg => configWarnings.push({ where: rel(configPath), msg }));

	/* site/apps.js may read the raw site config (e.g. site.home) and resolve relative
	   addresses against the page — Node has no location, so a stand-in origin makes
	   apps built from a relative address (the 'website' app) appear and get checked */
	globalThis.DESKTOP_CONFIG = site;
	const ownLocation = !('location' in globalThis);
	if (ownLocation) globalThis.location = { href: 'https://example.invalid/', origin: 'https://example.invalid' };
	let manifest;
	try {
		manifest = (await import(`${pathToFileURL(manifestPath).href}?v=${Date.now()}`)).default;
	} catch (e) {
		console.error(`✖ ${rel(manifestPath)}: ${e.message}`);
		process.exit(2);
	} finally {
		if (ownLocation) delete globalThis.location;
	}

	const { apps: modApps, loaded } = await moduleApps(cfg);
	const iconSets = readIconSets(ROOT, cfg);
	const locale = i18nChecker();
	const keys = new Map();
	/* preload the namespaces the manifest names, so the pure check stays synchronous */
	const nsUsed = new Set([...JSON.stringify(manifest).matchAll(/"@([a-z][a-z0-9-]*)\./g)].map(m => m[1]));
	for (const l of cfg.languages) for (const ns of nsUsed) keys.set(`${l}/${ns}`, await locale(ns, l));

	const result = validateManifest(manifest, {
		languages: cfg.languages,
		tints: new Set(Object.keys(cfg.theme?.tints ?? {})),
		moduleApps: modApps,
		modules: loaded,
		authorLinks: (cfg.author?.links ?? []).map(l => l?.id).filter(Boolean),
		icon: iconChecker(iconSets),
		iconSets,
		file: fileChecker(),
		dir: path => {
			const abs = resolve(ROOT, path);
			return relative(ROOT, abs).startsWith('..') ? null : existsSync(abs) && statSync(abs).isDirectory();
		},
		i18n: (ns, key, l) => !!keys.get(`${l}/${ns}`) && key in keys.get(`${l}/${ns}`),
		config: cfg
	});
	let cleanFortunes = null;
	let textKeys = null;
	try {
		({ cleanFortunes, TEXT_KEYS: textKeys } = await import(pathToFileURL(join(ROOT, 'src/apps/fortune/model.js')).href));
	} catch { /* the Fortune app is not there */ }
	const data = validateSiteData(cfg, { languages: cfg.languages, read: readJson, cleanFortunes, textKeys, modules: loaded });

	const sets = validateIconSets(iconSets.sets);
	const errors = [...result.errors, ...data.errors, ...sets.errors];
	const warnings = [...configWarnings, ...result.warnings, ...data.warnings, ...sets.warnings];
	const failed = errors.length > 0 || (strict && warnings.length > 0);

	if (asJson) {
		console.log(JSON.stringify({ ok: !failed, errors, warnings, stats: result.stats }, null, 2));
	} else {
		for (const e of errors) console.log(`✖ ${e.where}: ${e.msg}`);
		for (const w of warnings) console.log(`⚠ ${w.where}: ${w.msg}`);
		if (!quiet) {
			const s = result.stats;
			const sum = `${rel(manifestPath)}: ${s.apps} apps, ${s.collections} collections (${s.items} items), ${s.menus} menus, ${s.files} files — languages ${cfg.languages.join(', ')}`;
			console.log(`${failed ? '✖' : '✔'} ${sum} — ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
		}
	}
	process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
