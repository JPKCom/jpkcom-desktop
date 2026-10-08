#!/usr/bin/env node
/* JPKCom Desktop — site manifest validator (site/apps.js) — © Jean Pierre Kolb — MIT License

   Checks the site manifest against the configuration before it goes online —
   the desktop itself skips invalid entries with a console warning, this tool
   names them all at once:

     - ids ([a-z0-9-]), duplicates, kinds (and the module each kind needs)
     - references: aliases, override records, menu entries, collections in menus,
       config.site.legal / defaultPageApp / notify.app / vault.collection / about.moreInfo
     - collections: prefix, groups (unknown or duplicate), slugs, item urls and kinds,
       webUrl / allLabel / webLabel (the Catalog's "… on the web" button)
     - files (terminal cat): name: path | { lang: path } | { url, aliases: ['name'] }
     - urls: relative paths, /paths or https:// — never javascript:, data:, //host;
       link apps https only (http only with allowHttp); local files must exist
     - icons: Tabler ids in src/icons/tabler.js (or at least in @tabler/icons → run
       `npm run icons`), custom glyphs from src/icons/custom.js
     - tints: a name from config.theme.tints or a ['#top', '#bottom'] pair
     - texts: every language map has a value for each of config.languages;
       '@ns.key' references exist in the locale files
     - site data the manifest points at: the fortunes per language, the feeds

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
import { UNSAFE_URL_CHARS, MAX_URL, safeUrl } from '../src/core/url.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KIND = /^[a-z][a-z0-9-]{0,31}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const ICON_ID = /^tif?-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NS_KEY = /^@([a-z][a-z0-9-]*)\.(.+)$/;
const IMAGE_EXT = /\.(svg|png|jpe?g|webp|avif|gif)$/i;
const FLAGS = ['fixed', 'desktop', 'dock', 'hidden', 'nodock', 'transient', 'download', 'logo', 'allowHttp'];
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
 *   icon(id) → 'ok' | 'build' | 'unknown'
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

	function text(where, v, { required = false, field = 'name' } = {}) {
		if (v == null) {
			if (required) err(where, `${field} is missing`);
			return;
		}
		if (typeof v === 'string') {
			if (!v) err(where, `${field} is empty`);
			const m = NS_KEY.exec(v);
			if (m) for (const l of langs) if (ctx.i18n && !ctx.i18n(m[1], m[2], l)) warn(where, `${field} '${v}': no such key in locales/${l}/${m[1]}.js`);
			return;
		}
		if (!isObj(v) || !Object.keys(v).length || !Object.values(v).every(x => typeof x === 'string' && x)) {
			err(where, `${field} must be a text or a { lang: text } map of non-empty texts`);
			return;
		}
		const missing = langs.filter(l => !(l in v));
		if (missing.length) err(where, `${field} has no text for ${missing.map(l => `'${l}'`).join(', ')}`);
	}

	function icon(where, id) {
		if (id == null) return;
		if (typeof id !== 'string') return err(where, 'icon must be an icon id');
		const r = ctx.icon ? ctx.icon(id) : 'ok';
		if (r === 'build') warn(where, `icon '${id}' is not in src/icons/tabler.js yet — run npm run icons`);
		else if (r === 'unknown') err(where, ICON_ID.test(id) ? `icon '${id}' does not exist in Tabler Icons` : `icon '${id}' is neither a Tabler id (ti-…, tif-…) nor a custom glyph`);
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
	function oneUrl(where, u, { link = false, allowHttp = false, field = 'url' } = {}) {
		if (typeof u !== 'string' || !u) return err(where, `${field} must be a non-empty string`);
		if (/^\s|\s$/.test(u)) return err(where, `${field} '${u}' has spaces at the start or end`);
		if (UNSAFE_URL_CHARS.test(u)) return err(where, `${field} ${JSON.stringify(u)}: control characters and backslashes are not allowed`);
		if (u.length > MAX_URL) return err(where, `${field} is longer than ${MAX_URL} characters`);
		if (u.startsWith('//')) return err(where, `${field} '${u}': protocol-relative addresses are not allowed`);
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)?.[1]?.toLowerCase();
		if (scheme && scheme !== 'http' && scheme !== 'https') return err(where, `${field} '${u}': the protocol ${scheme}: is not allowed`);
		const r = safeUrl(u, URL_BASE, URL_ORIGIN);
		if (!r) return err(where, scheme ? `${field} '${u}' is not a valid address` : `${field} '${u}': a relative address must stay on the desktop's own origin`);
		if (/\s/.test(u)) warn(where, `${field} '${u}' contains a space — write it as %20`);
		if (link) {
			if (scheme === 'https' || (scheme === 'http' && allowHttp)) return;
			return err(where, `${field} '${u}': a link needs an absolute https:// address${scheme === 'http' ? ' (or allowHttp: true)' : ''}`);
		}
		if (scheme === 'http') return warn(where, `${field} '${u}' uses http: — browsers block it on an https site`);
		/* local files must exist: the normalised path below the page (a /root path is not checkable) */
		if (!scheme && ctx.file && !u.startsWith('/') && r.pathname.startsWith(URL_BASE_PATH)) {
			const ok = ctx.file(r.pathname.slice(URL_BASE_PATH.length) || './');
			if (ok === false) err(where, `${field} '${u}': no such file in the project`);
		}
	}

	function url(where, v, opts = {}) {
		if (v == null) return;
		if (typeof v === 'string') return oneUrl(where, v, opts);
		if (!isObj(v) || !Object.keys(v).length) return err(where, `${opts.field ?? 'url'} must be a string or a { lang: url } map`);
		for (const [l, u] of Object.entries(v)) oneUrl(`${where} [${l}]`, u, opts);
		const missing = langs.filter(l => !(l in v));
		if (missing.length) warn(where, `${opts.field ?? 'url'} has no address for ${missing.map(l => `'${l}'`).join(', ')} (the first one is used)`);
	}

	function size(where, v, field = 'size') {
		if (v == null) return;
		if (!Array.isArray(v) || v.length !== 2 || !v.every(n => Number.isFinite(n) && n > 0)) err(where, `${field} must be [width, height] in pixels`);
	}

	function flags(where, raw) {
		for (const f of FLAGS) if (raw[f] != null && typeof raw[f] !== 'boolean') warn(where, `${f} should be true or false`);
		if (raw.mark != null && (typeof raw.mark !== 'string' || !raw.mark || raw.mark.length > 4)) err(where, 'mark must be 1–4 characters');
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
		ids.set(raw.id, { source: 'site', kind: raw.kind, alias: raw.alias, url: raw.url, module: known?.module });
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
	}

	/* ---------- Collections ---------- */

	const seenCols = new Set();
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
		const more = cfg.about?.moreInfo;
		if (typeof more === 'string' && ID.test(more) && !/[/.]/.test(more) && !isApp(more)) warn('config about.moreInfo', `app '${more}' does not exist`);
		if (cfg.site?.home != null) url('config site.home', cfg.site.home);
	}

	return { errors, warnings, stats };
}

/**
 * Checks the site data the configuration points at: fortunes per language,
 * feeds per language. check(path) → parsed JSON | undefined (missing) | Error.
 */
export function validateSiteData(cfg, { languages, read, cleanFortunes = null, modules = new Set() } = {}) {
	const errors = [];
	const warnings = [];
	if (modules.has('fortune') && cfg.fortune?.dir) {
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

function iconChecker() {
	let pack = {};
	let custom = {};
	try {
		pack = readTabler();
	} catch { /* not built yet */ }
	try {
		custom = readCustom();
	} catch { /* none */ }
	return id => {
		if (pack[id] || custom[id]) return 'ok';
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
		icon: iconChecker(),
		file: fileChecker(),
		dir: path => {
			const abs = resolve(ROOT, path);
			return relative(ROOT, abs).startsWith('..') ? null : existsSync(abs) && statSync(abs).isDirectory();
		},
		i18n: (ns, key, l) => !!keys.get(`${l}/${ns}`) && key in keys.get(`${l}/${ns}`),
		config: cfg
	});
	let cleanFortunes = null;
	try {
		({ cleanFortunes } = await import(pathToFileURL(join(ROOT, 'src/apps/fortune/model.js')).href));
	} catch { /* the Fortune app is not there */ }
	const data = validateSiteData(cfg, { languages: cfg.languages, read: readJson, cleanFortunes, modules: loaded });

	const errors = [...result.errors, ...data.errors];
	const warnings = [...configWarnings, ...result.warnings, ...data.warnings];
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
