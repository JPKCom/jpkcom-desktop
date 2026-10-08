/* JPKCom Desktop — service worker: offline copy of the desktop and of Reader pages — © Jean Pierre Kolb — MIT License

   A classic script at the installation root, registered by the 'install' service
   (src/panels/install.js) with scope = the installation root. It works the same at
   the web root ('/') and in a sub-folder ('/desktop/'): every path below is resolved
   against its own location.

   Network first, always: online you get the deployed files (revalidated with
   cache: 'no-cache'), offline — or when the network takes longer than
   config.offline.timeoutMs and a copy exists — the last good copy.

   What it caches (and nothing else):
     shell    the desktop itself: index.html (one copy, whatever the query), the
              manifest, assets/icons/, src/, locales/, site/ (except the vault folder)
              — precached at install, refreshed whenever the page loads them
     pages    same-origin HTML the Reader fetches (fetch with Accept: text/html),
              at most config.offline.maxPages, the oldest go first
   Never: cross-origin requests (online services, CDNs), non-GET requests, range
   requests (media seeking), answers marked Cache-Control: no-store or private,
   the sealed vault files, navigations other than the
   desktop's own index (iframes of web apps, other pages of the site) — those only
   use the navigation preload response, so they cost no extra request.

   site/theme.css (the operator's theme, loaded after the core CSS) is a shell file like site/config.js.

   Precache list: derived at install time from the module list. site/config.js is
   imported (importScripts — script-src 'self' allows it), so the service worker
   knows config.modules, config.apps, config.languages, site.data and friends.
   Starting from index.html, the boot scripts and the index.js of every core part,
   module and app, it follows static and dynamic imports, the descriptor fields
   styles: [...], windowStyles: [...] and i18n: [...], stylesheet url()s, and adds locales/<lang>/<ns>.js
   for every offered language — or, for a module that keeps its namespaces in its own
   folder (descriptor field locales, same rule as src/core/modules.js), <that folder>
   <lang>/<ns>.js instead. Each entry is fetched on its own (Promise.allSettled):
   a missing optional file never breaks the install. Whatever the crawl misses is
   cached the first time the page loads it.

   Updates: browsers compare sw.js AND its imported scripts byte by byte, so a
   changed site/config.js (another module list, language, namespace) installs a new
   service worker. Cache names are '<namespace>:<base>:<version>' (shell, the version
   carries a hash of the precache-relevant config) and '<namespace>:<base>:pages';
   on activation only this installation's own older caches are deleted — every
   cache of this naming scheme for this folder, whatever its namespace (one folder
   holds one installation; a changed namespace leaves no orphans). Other desktops
   or apps on the same origin keep theirs.

   config.pwa.enabled === false switches it off for good: a service worker that is
   still registered from before installs, deletes its caches and unregisters itself. */

'use strict';

/* Keep equal to package.json "version" and VERSION in src/core/env.js (tests/p12-sw.test.mjs checks it) */
const VERSION = '1.0.0';

/* Defaults for what this worker reads from the config — mirror src/core/config.js DEFAULTS
   (tests/p12-sw.test.mjs checks that they match) */
const DEFAULTS = Object.freeze({
	namespace: 'jpkdesk',
	languages: ['de', 'en'],
	defaultLang: 'en',
	modules: ['reader', 'viewer', 'catalog', 'search', 'calendar', 'notify'],
	apps: ['editor', 'notes', 'todo', 'calc', 'terminal', 'media', 'fortune'],
	siteData: 'site/apps.js',
	vaultDir: 'site/vault/',
	fortuneDir: 'site/data/fortunes/',
	feeds: { de: 'site/data/feed.de.json', en: 'site/data/feed.en.json' },
	enabled: true,
	maxPages: 80,
	timeoutMs: 4000
});

/* Required parts of the desktop (src/boot/main.js CORE_PARTS) */
const CORE_PARTS = ['wm', 'shell', 'panels'];

/* Safety net: files every installation has, crawled even if index.html changes */
const SHELL_FILES = ['./', 'manifest.webmanifest', 'site/config.js', 'src/boot/preload.js', 'src/boot/theme.js', 'src/boot/main.js',
	'src/css/layers.css', 'src/css/tokens.css', 'src/css/base.css', 'src/css/components.css', 'site/theme.css',
	'assets/icons/favicon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
	'assets/icons/apple-touch-icon.png'];

/* Folders (relative to the root) whose files belong to the desktop and are kept offline */
const SHELL_DIRS = ['src/', 'locales/', 'site/', 'assets/icons/'];
const SHELL_ROOT_FILES = ['', 'index.html', 'manifest.webmanifest'];

const MAX_FILES = 800;            // upper bound for the precache crawl
const INSTALL_TIMEOUT_MS = 20000; // per file during the install

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const NS = /^[a-z][a-z0-9-]{0,23}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** The installation root: absolute URL and path, both with a trailing slash */
const ROOT_URL = new URL('./', self.location.href).href;
const BASE = new URL(ROOT_URL).pathname;

/* ---------- Configuration ---------- */

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, min, max, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);

/** A relative path (or same-origin absolute path) from the config → absolute URL on this origin, or null */
function local(path, base = ROOT_URL) {
	if (typeof path !== 'string' || !path || path.length > 512 || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
	try {
		const url = new URL(path, base);
		return url.origin === new URL(ROOT_URL).origin ? url.href.replace(/#.*$/, '') : null;
	} catch {
		return null;
	}
}

/** Cleans the raw window.DESKTOP_CONFIG down to what this worker needs; invalid values fall back */
function cleanConfig(raw) {
	const c = isObj(raw) ? raw : {};
	const pick = (v, ok, fallback) => (ok(v) ? v : fallback);
	const refs = (list, fallback) => (Array.isArray(list) ? list : fallback).flatMap(ref => {
		if (typeof ref === 'string' && ID.test(ref)) return [ref];
		if (isObj(ref) && typeof ref.id === 'string' && ID.test(ref.id) && local(ref.src)) return [{ id: ref.id, src: ref.src }];
		return [];
	});
	const languages = pick(c.languages, v => Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' && LANG.test(x)), DEFAULTS.languages);
	const notify = isObj(c.notify) ? c.notify : {};
	const feeds = isObj(notify.feeds) ? notify.feeds : (notify.feeds === null ? {} : DEFAULTS.feeds);
	const images = isObj(c.wallpaper) && Array.isArray(c.wallpaper.images) ? c.wallpaper.images : [];
	const modules = refs(c.modules, DEFAULTS.modules);
	const apps = refs(c.apps, DEFAULTS.apps);
	const has = (list, id) => list.some(r => (isObj(r) ? r.id : r) === id);
	/* A same-origin folder — the same rule as src/core/config.js (relative or root-absolute, no scheme,
	   no '//host', no '..', no whitespace, '?', '#' or backslash, ends with '/'): when the page rejects a value and
	   uses the default folder, the worker must use that same folder (above all the vault's) */
	const relDir = v => typeof v === 'string' && /^(?![a-z][a-z0-9+.-]*:)(?!\/\/)(?!.*\.\.)[^\s?#\\]*\/$/i.test(v) && !!local(v);
	const siteData = pick(isObj(c.site) ? c.site.data : undefined, v => !!local(v), DEFAULTS.siteData);
	const fortuneDir = pick(isObj(c.fortune) ? c.fortune.dir : undefined, relDir, DEFAULTS.fortuneDir);
	const cleaned = {
		namespace: pick(c.namespace, v => typeof v === 'string' && NS.test(v), DEFAULTS.namespace),
		languages: [...new Set(languages)],
		defaultLang: pick(c.defaultLang, v => typeof v === 'string' && LANG.test(v), DEFAULTS.defaultLang),
		modules,
		apps,
		siteData,
		vaultDir: pick(isObj(c.vault) ? c.vault.dir : undefined, relDir, DEFAULTS.vaultDir),
		fortuneDir: has(apps, 'fortune') ? fortuneDir : null,
		feeds: has(modules, 'notify') ? Object.values(feeds).filter(v => !!local(v)) : [],
		images: images.map(i => (isObj(i) ? i.src : null)).filter(v => !!local(v)),
		enabled: !(isObj(c.pwa) && c.pwa.enabled === false),
		maxPages: int(isObj(c.offline) ? c.offline.maxPages : undefined, 0, 1000, DEFAULTS.maxPages),
		timeoutMs: int(isObj(c.offline) ? c.offline.timeoutMs : undefined, 500, 60000, DEFAULTS.timeoutMs)
	};
	/* Files outside the standard folders that still belong to the desktop (absolute URLs):
	     files  exact files — the site data file, wallpapers, feeds; a module file that has no folder of its own
	     dirs   folder prefixes — the folder of a site module ({ id, src }), the fortune folder
	   A folder that is the installation root or one of its parents (a module at 'demo.js' or '../demo.js',
	   fortune.dir '/') would take in every file of the site: such an entry only keeps its exact files */
	const ownDir = dir => !!dir && !ROOT_URL.startsWith(dir);
	const files = [local(siteData), ...cleaned.feeds.map(p => local(p)), ...cleaned.images.map(p => local(p))];
	const dirs = [];
	for (const r of [...modules, ...apps].filter(isObj)) {
		const file = local(r.src);
		const dir = local('./', file);
		if (ownDir(dir)) dirs.push(dir);
		else files.push(file);
	}
	if (cleaned.fortuneDir) {
		const dir = local(cleaned.fortuneDir);
		if (ownDir(dir)) dirs.push(dir);
		else files.push(...localeChain(cleaned).map(code => local(`${cleaned.fortuneDir}${code}.json`)));
	}
	cleaned.extra = {
		files: [...new Set(files.filter(Boolean).map(shellKey))],
		dirs: [...new Set(dirs)]
	};
	return cleaned;
}

/** site/config.js is a classic script that writes window.DESKTOP_CONFIG; a worker has no window */
function readSiteConfig() {
	let raw = null;
	try {
		self.window = self;
		importScripts('site/config.js');
		raw = self.DESKTOP_CONFIG;
	} catch (err) {
		console.warn('[sw] site/config.js could not be read — using the defaults', err);
	} finally {
		try { delete self.window; } catch { /* nothing to clean */ }
	}
	return cleanConfig(raw);
}

/** FNV-1a, 32 bit, as 8 hex digits — names the precache generation */
function hash(text) {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

/** Cache names of this installation: '<namespace>:<base>:<version>' and '<namespace>:<base>:pages' */
function cacheNames(cfg, base = BASE) {
	const prefix = `${cfg.namespace}:${base}:`;
	/* only what changes the precache list; 'extra' is derived from it (and holds the origin) */
	const { enabled, maxPages, timeoutMs, extra, ...relevant } = cfg;
	const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return {
		prefix,
		shell: `${prefix}${VERSION}-${hash(JSON.stringify(relevant))}`,
		pages: `${prefix}pages`,
		/* Every cache this worker's naming scheme gives an installation in this folder, whatever the
		   namespace: one folder holds one installation, so they are all its own — also the ones of an
		   earlier namespace (config.namespace changed) */
		own: new RegExp(`^[a-z][a-z0-9-]{0,23}:${esc}:(?:[0-9][0-9A-Za-z.+-]*-[0-9a-f]{8}|pages)$`)
	};
}

/* ---------- Precache list ---------- */

/** Where a module reference lives (src/core/modules.js resolveRef) */
function moduleUrl(ref, kind) {
	if (isObj(ref)) return local(ref.src);
	const dir = kind === 'core' ? `src/${ref}/` : kind === 'app' ? `src/apps/${ref}/` : `src/modules/${ref}/`;
	return local(`${dir}index.js`);
}

/** Languages whose strings the desktop may load: the offered ones, their base languages, defaultLang, 'en' */
function localeChain(cfg) {
	const out = new Set();
	for (const code of [...cfg.languages, cfg.defaultLang, 'en']) {
		out.add(code);
		out.add(code.split('-')[0]);
	}
	return [...out];
}

/** Entry points of the crawl (absolute URLs) */
function precacheRoots(cfg) {
	const urls = [
		...SHELL_FILES.map(p => local(p)),
		...CORE_PARTS.map(p => moduleUrl(p, 'core')),
		...cfg.modules.map(r => moduleUrl(r, 'module')),
		...cfg.apps.map(r => moduleUrl(r, 'app')),
		local(cfg.siteData),
		...cfg.images.map(p => local(p)),
		...cfg.feeds.map(p => local(p))
	];
	/* the fortune app walks the i18n fallback chain until a file exists — keep every candidate */
	if (cfg.fortuneDir) for (const code of localeChain(cfg)) urls.push(local(`${cfg.fortuneDir}${code}.json`));
	return [...new Set(urls.filter(Boolean))];
}

/** Locale files: _meta and every namespace, for the whole language chain; sources: [[ns, folder URL]] of
    the namespaces a module keeps in its own folder (descriptor field locales) — read from there instead */
function localeUrls(cfg, namespaces, sources = []) {
	const out = [];
	for (const code of localeChain(cfg)) {
		for (const ns of ['_meta', 'core', ...namespaces]) out.push(local(`locales/${code}/${ns}.js`));
		for (const [ns, dir] of sources) out.push(local(`${code}/${ns}.js`, dir));
	}
	return [...new Set(out.filter(Boolean))];
}

/** The descriptor field locales → absolute folder URL, or null (the rule of src/core/modules.js localesDir:
    relative, ends in '/', stays inside the module's folder) */
function localesDir(value, fileUrl) {
	if (typeof value !== 'string' || !value.endsWith('/')) return null;
	if (/^[a-z][a-z0-9+.-]*:|^\/|\\|[\u0000-\u001f\u007f]/i.test(value)) return null;
	try {
		const base = new URL('./', fileUrl).href;
		const dir = new URL(value, fileUrl).href;
		return dir.startsWith(base) ? dir : null;
	} catch {
		return null;
	}
}

const strings = text => [...text.matchAll(/(['"])([^'"\n]{1,256}?)\1/g)].map(m => m[2]);

/** References inside a JavaScript file: { urls: [absolute], namespaces: [ns], sources: [[ns, folder URL]] }
    (a file that declares locales: '<folder>/' keeps its namespaces there, not in the core locales/) */
function scanJs(text, fileUrl) {
	const specs = [];
	for (const m of text.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?(['"])([^'"\n]+?)\1/g)) specs.push(m[2]);
	for (const m of text.matchAll(/\bimport\s*\(\s*(['"])([^'"\n]+?)\1\s*\)/g)) specs.push(m[2]);
	const urls = specs.filter(s => /^(?:\.{1,2}\/|\/(?!\/))/.test(s)).map(s => local(s, fileUrl));
	for (const m of text.matchAll(/\b(?:windowS|s)tyles\s*:\s*\[([^\]]*)\]/g)) urls.push(...strings(m[1]).map(s => local(s, fileUrl)));
	const namespaces = [];
	for (const m of text.matchAll(/\bi18n\s*:\s*\[([^\]]*)\]/g)) namespaces.push(...strings(m[1]).filter(s => ID.test(s)));
	const own = text.match(/\blocales\s*:\s*(['"])([^'"\n]{1,256}?)\1/);
	const dir = own ? localesDir(own[2], fileUrl) : null;
	return {
		urls: urls.filter(u => u && /\.(?:m?js|css|json)$/.test(new URL(u).pathname)),
		namespaces: dir ? [] : namespaces,
		sources: dir ? namespaces.map(ns => [ns, dir]) : []
	};
}

/** References inside a stylesheet: @import and url() */
function scanCss(text, fileUrl) {
	const specs = [];
	for (const m of text.matchAll(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/g)) specs.push(m[2]);
	for (const m of text.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g)) specs.push(m[2]);
	return { urls: specs.filter(s => !/^(?:data:|blob:|#)/.test(s)).map(s => local(s, fileUrl)).filter(Boolean), namespaces: [] };
}

/** References inside index.html: <script src>, <link href> (stylesheets, icons, manifest) */
function scanHtml(text, fileUrl) {
	const urls = [];
	for (const m of text.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)\s*=\s*(['"])([^'"]+)\1/gi)) urls.push(local(m[2], fileUrl));
	return { urls: urls.filter(Boolean), namespaces: [] };
}

function scan(text, url, type) {
	const path = new URL(url).pathname;
	if (/html/.test(type) || path.endsWith('/') || path.endsWith('.html')) return scanHtml(text, url);
	if (/css/.test(type) || path.endsWith('.css')) return scanCss(text, url);
	if (/javascript|ecmascript/.test(type) || /\.m?js$/.test(path)) return scanJs(text, url);
	return { urls: [], namespaces: [] };
}

/** Cache key of a shell file: the path without query or hash (the shell keeps one copy) */
const shellKey = url => {
	const u = new URL(url);
	return u.origin + u.pathname;
};

const withTimeout = (ms, fn) => {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), ms);
	return fn(ctl.signal).finally(() => clearTimeout(timer));
};

const cacheable = res => !!res && res.ok && res.status === 200 && res.type === 'basic';

/** May this answer be written to Cache Storage? Not when the server says no-store or private
    (logged-in areas, personal fragments other scripts of the site fetch as text/html) */
const keep = res => cacheable(res) && !/\b(?:no-store|private)\b/i.test(res.headers.get('Cache-Control') || '');

/** A redirected response must not answer a navigation — store a clean copy */
const clean = res => (res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res);

/** Fetches one file into the cache; returns its text when it may hold further references */
async function precacheOne(cache, url) {
	const res = await withTimeout(INSTALL_TIMEOUT_MS, signal => fetch(new Request(url, { cache: 'no-cache', signal })));
	if (!cacheable(res)) throw new Error(`${url}: HTTP ${res.status}`);
	if (!keep(res)) throw new Error(`${url}: Cache-Control forbids keeping a copy`);
	const type = res.headers.get('Content-Type') || '';
	const text = /html|css|javascript|ecmascript/.test(type) || /\.(?:m?js|css|html)$|\/$/.test(new URL(url).pathname)
		? await res.clone().text() : null;
	await cache.put(shellKey(url), clean(res));
	return text === null ? { urls: [], namespaces: [] } : scan(text, url, type);
}

/** Crawls from the roots, level by level; every file is fetched once, failures are skipped */
async function precache(cfg, cacheName) {
	const cache = await caches.open(cacheName);
	const seen = new Set();
	const namespaces = new Set();
	const sources = new Map();
	const failed = [];
	const run = async list => {
		let level = list.filter(u => !seen.has(shellKey(u)));
		while (level.length && seen.size < MAX_FILES) {
			level = level.slice(0, MAX_FILES - seen.size);
			level.forEach(u => seen.add(shellKey(u)));
			const results = await Promise.allSettled(level.map(u => precacheOne(cache, u)));
			const next = [];
			results.forEach((r, i) => {
				if (r.status === 'rejected') return failed.push(level[i]);
				r.value.namespaces.forEach(ns => namespaces.add(ns));
				for (const [ns, dir] of r.value.sources ?? []) sources.set(`${dir}\n${ns}`, [ns, dir]);
				for (const u of r.value.urls) if (isShellUrl(u, cfg) && !seen.has(shellKey(u))) next.push(u);
			});
			level = [...new Set(next)];
		}
	};
	await run(precacheRoots(cfg));
	await run(localeUrls(cfg, [...namespaces], [...sources.values()]));
	if (failed.length) console.info(`[sw] ${seen.size - failed.length} files kept offline; not available: ${failed.length}`, failed);
	return { files: seen.size - failed.length, failed };
}

/* ---------- Request routing ---------- */

/** Path below the installation root, or null when the URL lies outside it / on another origin */
function relative(url) {
	const u = new URL(url);
	if (u.origin !== new URL(ROOT_URL).origin || !u.pathname.startsWith(BASE)) return null;
	return u.pathname.slice(BASE.length);
}

/** Does this same-origin URL belong to the desktop's offline copy? (vault files and sw.js never do) */
function isShellUrl(url, cfg) {
	const key = shellKey(url);
	const vault = local(cfg.vaultDir);
	if (vault && key.startsWith(vault)) return false;
	const rel = relative(url);
	if (rel === 'sw.js') return false;
	if (cfg.extra.files.includes(key) || cfg.extra.dirs.some(prefix => key.startsWith(prefix))) return true;
	if (rel === null) return false;
	return SHELL_ROOT_FILES.includes(rel) || SHELL_DIRS.some(d => rel.startsWith(d));
}

/**
 * What to do with a request: null (leave it to the browser) or { kind, key }
 *   'shell-nav'  the desktop's own index, top-level → shell cache under the root URL
 *   'nav'        any other navigation in scope → navigation preload answer only
 *   'page'       a Reader fetch of same-origin HTML → pages cache (query kept)
 *   'asset'      a file of the desktop → shell cache (query dropped)
 */
function classify(req, cfg) {
	if (!cfg.enabled || req.method !== 'GET') return null;
	const url = new URL(req.url);
	if (url.origin !== new URL(ROOT_URL).origin) return null;
	if (req.headers.has('range')) return null;
	const rel = relative(url.href);
	if (req.mode === 'navigate') {
		if ((rel === '' || rel === 'index.html') && req.destination === 'document') return { kind: 'shell-nav', key: ROOT_URL };
		/* Without navigation preload there is nothing to gain: the browser handles it alone */
		return preloadSupported() ? { kind: 'nav', key: url.href.replace(/#.*$/, '') } : null;
	}
	const vault = local(cfg.vaultDir);
	if (vault && shellKey(url.href).startsWith(vault)) return null;
	const accept = req.headers.get('Accept') || '';
	if (req.destination === '' && /\btext\/html\b/.test(accept) && rel !== '' && rel !== 'index.html') {
		return cfg.maxPages > 0 ? { kind: 'page', key: url.href.replace(/#.*$/, '') } : null;
	}
	if (isShellUrl(url.href, cfg)) return { kind: 'asset', key: shellKey(url.href) };
	return null;
}

/* ---------- Strategies ---------- */

function preloadSupported() {
	return !!(self.registration && self.registration.navigationPreload);
}

const TIMEOUT = Symbol('timeout');

/** Oldest pages go first (cache keys keep insertion order; a refreshed page is re-inserted) */
async function trim(cache, max) {
	const keys = await cache.keys();
	await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map(k => cache.delete(k)));
}

async function store(cacheName, key, res, max) {
	const cache = await caches.open(cacheName);
	if (max) await cache.delete(key);
	await cache.put(key, res);
	if (max) await trim(cache, max);
}

/**
 * Network first: the network answer is stored (inside waitUntil) and returned. When the
 * network fails — or is slower than timeoutMs while a copy exists — the copy answers.
 * opts: { cacheName, key, max (pages limit), timeoutMs, preload (Promise<Response|undefined>) }
 */
async function networkFirst(event, request, opts) {
	const { cacheName, key, max = 0, timeoutMs, preload = null } = opts;
	const network = (async () => {
		const res = (preload && (await preload.catch(() => null))) || (await fetch(request));
		if (keep(res)) event.waitUntil(store(cacheName, key, clean(res.clone()), max).catch(() => {}));
		return res;
	})();
	let timer = null;
	const late = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs, TIMEOUT); });
	const fromCache = () => caches.open(cacheName).then(c => c.match(key));
	try {
		const first = await Promise.race([network, late]);
		if (first !== TIMEOUT) return first;
		const copy = await fromCache();
		if (copy) {
			event.waitUntil(network.catch(() => {}));
			return copy;
		}
		return await network;
	} catch (err) {
		const copy = await fromCache();
		if (copy) return copy;
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

/** Revalidating request for a file of the shell (navigations cannot be rebuilt with an init) */
function revalidating(req) {
	try {
		return new Request(req, { cache: 'no-cache' });
	} catch {
		return req;
	}
}

/* ---------- Lifecycle ---------- */

const CONFIG = readSiteConfig();
const NAMES = cacheNames(CONFIG);

self.addEventListener('install', event => {
	event.waitUntil((async () => {
		if (CONFIG.enabled) await precache(CONFIG, NAMES.shell);
		await self.skipWaiting();
	})());
});

self.addEventListener('activate', event => {
	event.waitUntil((async () => {
		const current = CONFIG.enabled ? [NAMES.shell, NAMES.pages] : [];
		const keys = await caches.keys();
		await Promise.all(keys.filter(k => NAMES.own.test(k) && !current.includes(k)).map(k => caches.delete(k)));
		if (!CONFIG.enabled) {
			await self.registration.unregister();
			return;
		}
		if (preloadSupported()) {
			try { await self.registration.navigationPreload.enable(); } catch { /* not supported */ }
		}
		await self.clients.claim();
	})());
});

self.addEventListener('fetch', event => {
	const req = event.request;
	const route = classify(req, CONFIG);
	if (!route) return;
	const preload = req.mode === 'navigate' ? event.preloadResponse : null;
	switch (route.kind) {
		case 'shell-nav':
			event.respondWith(networkFirst(event, req, { cacheName: NAMES.shell, key: route.key, timeoutMs: CONFIG.timeoutMs, preload }));
			break;
		case 'nav':
			/* Not ours (an iframe of a web app, another page of the site): only use the preload answer;
			   offline, a copy the Reader kept of the same page is better than an error page */
			event.respondWith((async () => {
				try {
					return (preload && (await preload.catch(() => null))) || (await fetch(req));
				} catch (err) {
					const copy = await caches.open(NAMES.pages).then(c => c.match(route.key));
					if (copy) return copy;
					throw err;
				}
			})());
			break;
		case 'page':
			event.respondWith(networkFirst(event, req, { cacheName: NAMES.pages, key: route.key, max: CONFIG.maxPages, timeoutMs: CONFIG.timeoutMs }));
			break;
		case 'asset':
			event.respondWith(networkFirst(event, revalidating(req), { cacheName: NAMES.shell, key: route.key, timeoutMs: CONFIG.timeoutMs }));
			break;
		default:
	}
});
