/* JPKCom Desktop — service worker: offline copy of the desktop and of Reader pages — © Jean Pierre Kolb — MIT License

   A classic script at the installation root, registered by the 'install' service
   (src/panels/install.js) with scope = the installation root. It works the same at
   the web root ('/') and in a sub-folder ('/desktop/'): every path below is resolved
   against its own location.

   Fast start (config.offline.fastStart, the default): the desktop's code is
   answered from the offline copy when there is one — no network on the way to
   the first paint. A few seconds after each start (at most once a minute) the
   worker compares every copy of the code with the server (cache: 'no-cache',
   mostly 304); when anything changed it fetches a complete new copy into a
   second cache ('…-next', the same crawl as the install) and tells the open
   pages ({ type: 'desk:update' } → "new version, reload"). The next start of
   the desktop moves it in place before the first file is answered, so a page
   never mixes old and new code. A changed sw.js or site/config.js still
   installs a new worker as before (and tells the pages the same).
   Runtime copies: a file of the shell (not a data file, see below) the crawl
   did not fetch but the desktop read later (a man or cat text outside the data
   folders, an image — not a script or style) is stored with the header
   X-Desk-Copy: runtime. The update check refreshes such copies in place
   (changed bytes → new copy; 404/410 or no longer to be kept → deleted; no
   answer → kept) and never prepares or announces an update because of them.

   Data files — notify.feeds (also outside the root), the fortune files of the
   language chain, site/data/, site/content/ — are never answered from the copy
   first: network first like fastStart: false, offline the last copy. The update
   check skips them and '-next' never contains them, so a new feed item or an
   edited content file never offers a new version. Code wins over the data
   folders: SHELL_FILES, site.data, the wallpapers, the site icon sets and the
   files and folders of { id, src } modules and apps stay code wherever they lie (an exact feed or
   fortune file stays data, also inside a module folder; of two folders the
   deeper one decides, so a module file directly in site/ leaves site/data/ data). Data is always the
   server's current version, so older code may read it for one session: a data
   file must stay readable by the previous code (add fields, do not rename or
   remove them; a new file name for an incompatible format).

   Network first (fastStart: false; always for data files and Reader pages):
   online you get the deployed files (revalidated with cache: 'no-cache'),
   offline — or when the network takes longer than config.offline.timeoutMs
   and a copy exists — the last good copy.

   What it caches (and nothing else):
     shell    the desktop itself: index.html (one copy, whatever the query), the
              manifest, assets/icons/, src/, locales/, site/ (except the vault folder)
              and the files of config.iconSets (site icon sets)
              — precached at install, refreshed whenever the page loads them; data
              files among them are network first (see above)
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
   or apps on the same origin keep theirs. Caches of a service worker the site used
   before (config.offline.legacyCaches: exact names or 'prefix*') are deleted on
   activation, once more 30 s after it (that worker may still finish requests and
   write to them) and at every start. A name of this scheme, for any folder, is
   never deleted that way.

   config.pwa.enabled === false switches it off for good: a service worker that is
   still registered from before installs, deletes its caches and unregisters itself. */

'use strict';

/* Keep equal to package.json "version" and VERSION in src/core/env.js (tests/p12-sw.test.mjs checks it) */
const VERSION = '1.2.0';

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
	timeoutMs: 4000,
	fastStart: true,
	legacyCaches: []
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

/* Folders (relative to the root) whose files are data, not code: network first, never part of an update.
   Code inside them (SHELL_FILES, site.data, wallpapers, { id, src } modules and apps) stays code. */
const DATA_DIRS = ['site/data/', 'site/content/'];

const MAX_FILES = 800;            // upper bound for the precache crawl
const INSTALL_TIMEOUT_MS = 20000; // per file during the install
const CHECK_DELAY_MS = 3000;      // fast start: the update check waits until the desktop has started
const CHECK_GAP_MS = 60000;       // … and runs at most once in this time
const CHECK_BATCH = 6;            // files compared at the same time
const LEGACY_FOLLOW_UP_MS = 30000; // legacy caches: once more after the hand-over

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const NS = /^[a-z][a-z0-9-]{0,23}$/;
/* Site icon sets: the path rule SET_PATH and MAX_SETS of src/core/icon-sets.js — a classic worker cannot
   import the module, so this is a copy (tests/p12-sw.test.mjs keeps them equal) */
const SET_PATH = /^(?!\/)(?!.*\/\/)(?!(?:.*\/)?\.)[A-Za-z0-9._\/-]{1,251}\.json$/;
const MAX_SETS = 8;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
/* A cache name of this project's scheme, any folder, any namespace ('<namespace>:<base>:<version>-<hash>',
   '…-next', '<namespace>:<base>:pages'): never a legacy cache. Keep in step with cacheNames().own below
   and with CACHE_SCHEME in src/core/config.js (tests/p12-sw.test.mjs checks both). */
const SCHEME = /^[a-z][a-z0-9-]{0,23}:\/.*:(?:[0-9][0-9A-Za-z.+-]*-[0-9a-f]{8}(?:-next)?|pages)$/;
/* offline.legacyCaches entry: an exact name, or a prefix of at least 4 characters followed by '*' */
const LEGACY = /^(?:[^*\u0000-\u001f\u007f]{1,128}|[^*\u0000-\u001f\u007f]{4,127}\*)$/;
const MAX_LEGACY = 32;

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
	/* online only (fortune.local: false) only when the page keeps it: remote must be a valid id */
	const onlineOnly = isObj(c.fortune) && c.fortune.local === false && typeof c.fortune.remote === 'string' && ID.test(c.fortune.remote);
	const cleaned = {
		namespace: pick(c.namespace, v => typeof v === 'string' && NS.test(v), DEFAULTS.namespace),
		languages: [...new Set(languages)],
		defaultLang: pick(c.defaultLang, v => typeof v === 'string' && LANG.test(v), DEFAULTS.defaultLang),
		modules,
		apps,
		siteData,
		vaultDir: pick(isObj(c.vault) ? c.vault.dir : undefined, relDir, DEFAULTS.vaultDir),
		fortuneDir: has(apps, 'fortune') && !onlineOnly ? fortuneDir : null,
		feeds: has(modules, 'notify') ? Object.values(feeds).filter(v => !!local(v)) : [],
		images: images.map(i => (isObj(i) ? i.src : null)).filter(v => !!local(v)),
		enabled: !(isObj(c.pwa) && c.pwa.enabled === false),
		maxPages: int(isObj(c.offline) ? c.offline.maxPages : undefined, 0, 1000, DEFAULTS.maxPages),
		timeoutMs: int(isObj(c.offline) ? c.offline.timeoutMs : undefined, 500, 60000, DEFAULTS.timeoutMs),
		fastStart: !(isObj(c.offline) && c.offline.fastStart === false),
		/* the rule of src/core/config.js cleanLegacyCaches(): valid, unique, in order, at most MAX_LEGACY */
		legacy: (() => {
			const list = isObj(c.offline) && Array.isArray(c.offline.legacyCaches) ? c.offline.legacyCaches : DEFAULTS.legacyCaches;
			return [...new Set(list.filter(e => typeof e === 'string' && LEGACY.test(e) && !SCHEME.test(e)))].slice(0, MAX_LEGACY);
		})()
	};
	/* Site icon sets: the rule of src/core/config.js (valid, unique, at most MAX_SETS, in config order), then
	   only those inside the installation root and not below the vault folder (main.js refuses those) */
	const vaultUrl = local(cleaned.vaultDir);
	const setPaths = (Array.isArray(c.iconSets) ? c.iconSets : []).filter(p => typeof p === 'string' && SET_PATH.test(p));
	cleaned.iconSets = [...new Set(setPaths)].slice(0, MAX_SETS).filter(p => {
		const url = local(p);
		return !!url && url.startsWith(ROOT_URL) && !(vaultUrl && url.startsWith(vaultUrl));
	});
	/* Files outside the standard folders that still belong to the desktop (absolute URLs):
	     files  exact files — the site data file, wallpapers, feeds, icon sets outside site/; a module file that has no folder of its own
	     dirs   folder prefixes — the folder of a site module ({ id, src }), the fortune folder
	   A folder that is the installation root or one of its parents (a module at 'demo.js' or '../demo.js',
	   fortune.dir '/') would take in every file of the site: such an entry only keeps its exact files */
	const ownDir = dir => !!dir && !ROOT_URL.startsWith(dir);
	const files = [local(siteData), ...cleaned.feeds.map(p => local(p)), ...cleaned.images.map(p => local(p)),
		...cleaned.iconSets.filter(p => !SHELL_DIRS.some(d => p.startsWith(d))).map(p => local(p))];
	const dirs = [];
	const refFiles = [];
	const refDirs = [];
	for (const r of [...modules, ...apps].filter(isObj)) {
		const file = local(r.src);
		const dir = local('./', file);
		refFiles.push(file);
		if (ownDir(dir)) {
			dirs.push(dir);
			refDirs.push(dir);
		} else {
			files.push(file);
		}
	}
	const fortuneFiles = cleaned.fortuneDir ? localeChain(cleaned).map(code => local(`${cleaned.fortuneDir}${code}.json`)) : [];
	if (cleaned.fortuneDir) {
		const dir = local(cleaned.fortuneDir);
		if (ownDir(dir)) dirs.push(dir);
		else files.push(...fortuneFiles);
	}
	cleaned.extra = {
		files: [...new Set(files.filter(Boolean).map(shellKey))],
		dirs: [...new Set(dirs)]
	};
	/* Code and data (absolute URLs, ARCHITECTURE §14 "Code and data"); the precedence is in isDataUrl().
	     code  exact files — SHELL_FILES, site.data, wallpapers, the site icon sets (config.iconSets), the entry
	           file of every { id, src } module/app;
	           folders — the own folder of every { id, src } module/app (none at or above the root)
	     data  exact files — the feeds, the fortune files of the language chain (never the fortune folder);
	           folders — DATA_DIRS */
	const codeFiles = [...SHELL_FILES.map(p => local(p)), local(siteData), ...cleaned.images.map(p => local(p)),
		...cleaned.iconSets.map(p => local(p)), ...refFiles];
	const dataFiles = [...cleaned.feeds.map(p => local(p)), ...fortuneFiles];
	cleaned.code = {
		files: [...new Set(codeFiles.filter(Boolean).map(shellKey))],
		dirs: [...new Set(refDirs.filter(Boolean))]
	};
	cleaned.data = {
		files: [...new Set(dataFiles.filter(Boolean).map(shellKey))],
		dirs: DATA_DIRS.map(d => local(d)).filter(Boolean)
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

/** Is this cache one of an earlier service worker (config.offline.legacyCaches)? Never a name of this
    project's scheme — whatever a prefix would match. Same rule as src/core/config.js legacyMatcher() */
function legacyMatcher(list) {
	const exact = new Set(list.filter(e => !e.endsWith('*')));
	const prefixes = list.filter(e => e.endsWith('*')).map(e => e.slice(0, -1));
	return name => typeof name === 'string' && !SCHEME.test(name) && (exact.has(name) || prefixes.some(p => name.startsWith(p)));
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

/** Cache names of this installation: '<namespace>:<base>:<version>-<hash>' (+ '-next', a prepared
    update) and '<namespace>:<base>:pages' */
function cacheNames(cfg, base = BASE) {
	const prefix = `${cfg.namespace}:${base}:`;
	/* only what changes the precache list — and fastStart, which decides how its copies are marked
	   (a switch starts from a fresh crawl); 'extra', 'code' and 'data' are derived from it (and hold the
	   origin); the legacy list never touches the shell cache name */
	const { enabled, maxPages, timeoutMs, legacy, extra, code, data, ...relevant } = cfg;
	const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const shell = `${prefix}${VERSION}-${hash(JSON.stringify(relevant))}`;
	return {
		prefix,
		shell,
		next: `${shell}-next`,
		pages: `${prefix}pages`,
		/* Every cache this worker's naming scheme gives an installation in this folder, whatever the
		   namespace: one folder holds one installation, so they are all its own — also the ones of an
		   earlier namespace (config.namespace changed). SCHEME above is this pattern for any folder: keep both in step */
		own: new RegExp(`^[a-z][a-z0-9-]{0,23}:${esc}:(?:[0-9][0-9A-Za-z.+-]*-[0-9a-f]{8}(?:-next)?|pages)$`),
		/* caches of an earlier service worker (config.offline.legacyCaches) */
		legacy: legacyMatcher(cfg.legacy ?? [])
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

/** Entry points of the crawl (absolute URLs); data: false leaves the data files out (a prepared update) */
function precacheRoots(cfg, { data = true } = {}) {
	const urls = [
		...SHELL_FILES.map(p => local(p)),
		...CORE_PARTS.map(p => moduleUrl(p, 'core')),
		...cfg.modules.map(r => moduleUrl(r, 'module')),
		...cfg.apps.map(r => moduleUrl(r, 'app')),
		local(cfg.siteData),
		...cfg.iconSets.map(p => local(p)),
		...cfg.images.map(p => local(p)),
		...cfg.feeds.map(p => local(p))
	];
	/* the fortune app walks the i18n fallback chain until a file exists — keep every candidate */
	if (cfg.fortuneDir) for (const code of localeChain(cfg)) urls.push(local(`${cfg.fortuneDir}${code}.json`));
	return [...new Set(urls.filter(Boolean))].filter(u => data || !isDataUrl(u, cfg));
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

/* A copy the desktop fetched at runtime (not the crawl): refreshed in place by the update check */
const RUNTIME_HEADER = 'X-Desk-Copy';
const runtimeCopy = res => {
	const headers = new Headers(res.headers);
	headers.set(RUNTIME_HEADER, 'runtime');
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};
const isRuntimeCopy = res => !!res && res.headers.get(RUNTIME_HEADER) === 'runtime';

/** Fetches one file into the cache; returns its text when it may hold further references */
async function precacheOne(cache, url) {
	const res = await withTimeout(INSTALL_TIMEOUT_MS, signal => fetch(new Request(url, { cache: 'no-cache', signal })));
	if (!cacheable(res)) throw Object.assign(new Error(`${url}: HTTP ${res.status}`), { status: res.status });
	if (!keep(res)) throw new Error(`${url}: Cache-Control forbids keeping a copy`);
	const type = res.headers.get('Content-Type') || '';
	const text = /html|css|javascript|ecmascript/.test(type) || /\.(?:m?js|css|html)$|\/$/.test(new URL(url).pathname)
		? await res.clone().text() : null;
	await cache.put(shellKey(url), clean(res));
	return text === null ? { urls: [], namespaces: [] } : scan(text, url, type);
}

/** Crawls from the roots, level by level; every file is fetched once, failures are skipped.
    data: false leaves data files out — neither as roots nor when the crawl meets one (a prepared update).
    → { files, failed, offline } — offline: how many failed without an answer (network, timeout) */
async function precache(cfg, cacheName, { data = true } = {}) {
	const cache = await caches.open(cacheName);
	const seen = new Set();
	const namespaces = new Set();
	const sources = new Map();
	const failed = [];
	let offline = 0;
	const run = async list => {
		let level = list.filter(u => !seen.has(shellKey(u)));
		while (level.length && seen.size < MAX_FILES) {
			level = level.slice(0, MAX_FILES - seen.size);
			level.forEach(u => seen.add(shellKey(u)));
			const results = await Promise.allSettled(level.map(u => precacheOne(cache, u)));
			const next = [];
			results.forEach((r, i) => {
				if (r.status === 'rejected') {
					if (!r.reason?.status) offline++;
					return failed.push(level[i]);
				}
				r.value.namespaces.forEach(ns => namespaces.add(ns));
				for (const [ns, dir] of r.value.sources ?? []) sources.set(`${dir}\n${ns}`, [ns, dir]);
				for (const u of r.value.urls) if (isShellUrl(u, cfg) && (data || !isDataUrl(u, cfg)) && !seen.has(shellKey(u))) next.push(u);
			});
			level = [...new Set(next)];
		}
	};
	await run(precacheRoots(cfg, { data }));
	await run(localeUrls(cfg, [...namespaces], [...sources.values()]));
	if (failed.length) console.info(`[sw] ${seen.size - failed.length} files kept offline; not available: ${failed.length}`, failed);
	return { files: seen.size - failed.length, failed, offline };
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

/** Is this shell URL a data file (§14: network first, never compared, never in '-next')?
    First match wins: exact code file, exact data file, then the deepest folder that holds it — a code
    folder wins a tie (a module directly in site/data/), a data folder wins over a code folder above it
    (a module file directly in site/ leaves site/data/ data) */
function isDataUrl(url, cfg) {
	const key = shellKey(url);
	if (cfg.code.files.includes(key)) return false;
	if (cfg.data.files.includes(key)) return true;
	const deepest = dirs => dirs.reduce((len, prefix) => (key.startsWith(prefix) && prefix.length > len ? prefix.length : len), -1);
	const data = deepest(cfg.data.dirs);
	return data >= 0 && data > deepest(cfg.code.dirs);
}

/**
 * What to do with a request: null (leave it to the browser) or { kind, key }
 *   'shell-nav'  the desktop's own index, top-level → shell cache under the root URL
 *   'nav'        any other navigation in scope → navigation preload answer only
 *   'page'       a Reader fetch of same-origin HTML → pages cache (query kept)
 *   'data'       a data file (isDataUrl) → shell cache, always network first (query dropped)
 *   'asset'      a code file of the desktop → shell cache (query dropped)
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
	if (isShellUrl(url.href, cfg)) return { kind: isDataUrl(url.href, cfg) ? 'data' : 'asset', key: shellKey(url.href) };
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
 * opts: { cacheName, key, max (pages limit), timeoutMs, preload (Promise<Response|undefined>),
 *         runtime (store the copy marked X-Desk-Copy: runtime — a file the crawl did not fetch) }
 */
async function networkFirst(event, request, opts) {
	const { cacheName, key, max = 0, timeoutMs, preload = null, runtime = false } = opts;
	const network = (async () => {
		const res = (preload && (await preload.catch(() => null))) || (await fetch(request));
		if (keep(res)) {
			const copy = clean(res.clone());
			event.waitUntil(store(cacheName, key, runtime ? runtimeCopy(copy) : copy, max).catch(() => {}));
		}
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

/* ---------- Fast start: offline copy first, updates in the background ---------- */

/* The key of the marker the update check writes last into the '-next' cache: only a complete
   copy is moved in place (a worker stopped halfway leaves none) */
const COMPLETE = () => new URL('sw.js?complete', ROOT_URL).href;

const sameBytes = (a, b) => {
	if (a.byteLength !== b.byteLength) return false;
	const x = new Uint8Array(a);
	const y = new Uint8Array(b);
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
};

/** A prepared, complete update ('-next') replaces the files of the shell cache; an incomplete one is dropped */
async function applyUpdate(names) {
	if (!(await caches.has(names.next))) return false;
	if (checking) return false;
	const next = await caches.open(names.next);
	const complete = !!(await next.match(COMPLETE()));
	if (complete) {
		const shell = await caches.open(names.shell);
		const keys = (await next.keys()).filter(k => k.url !== COMPLETE());
		await Promise.all(keys.map(async k => shell.put(k, await next.match(k))));
	}
	await caches.delete(names.next);
	return complete;
}

/** Tells every open page of this installation that a new version is ready (one reload away) */
async function announceUpdate() {
	const pages = await self.clients.matchAll({ type: 'window' });
	for (const page of pages) page.postMessage({ type: 'desk:update' });
}

/**
 * Compares every code file of the shell cache (and of a prepared update) with the server — data
 * files never count (isDataUrl) and never join '-next'. When
 * anything changed, the whole desktop is fetched again into '-next' (the install's crawl, so
 * new files join), the marker is written last and the pages hear about it. Offline, a timeout
 * or a crawl that could not reach every file: nothing is kept, the next start tries again.
 * Runtime copies (X-Desk-Copy: runtime) are refreshed in place instead and never count as a change.
 * fresh: the navigation preload answer for index.html (saves one request).
 */
async function checkForUpdate(cfg, names, fresh = null) {
	const shell = await caches.open(names.shell);
	const prepared = (await caches.has(names.next)) ? await caches.open(names.next) : null;
	/* data files are never compared (network first, never part of an update) */
	const all = (await shell.keys()).map(r => r.url).filter(u => !isDataUrl(u, cfg));
	const marked = await Promise.all(all.map(async key => isRuntimeCopy(await shell.match(key))));
	const keys = all.filter((_, i) => !marked[i]);
	const runtime = all.filter((_, i) => marked[i]);
	/* A runtime copy: gone (404/410) or not to be kept → deleted; changed → replaced; no answer → kept */
	const refresh = async key => {
		const res = await withTimeout(INSTALL_TIMEOUT_MS, signal => fetch(new Request(key, { cache: 'no-cache', signal })));
		if (res.status === 404 || res.status === 410 || (cacheable(res) && !keep(res))) {
			await shell.delete(key);
			return;
		}
		if (!keep(res)) return;
		const copy = await shell.match(key);
		const [now, before] = await Promise.all([res.arrayBuffer(), copy ? copy.arrayBuffer() : null]);
		if (!before || !sameBytes(now, before)) {
			await shell.put(key, runtimeCopy(new Response(now, { status: res.status, statusText: res.statusText, headers: res.headers })));
		}
	};
	for (let i = 0; i < runtime.length; i += CHECK_BATCH) {
		await Promise.allSettled(runtime.slice(i, i + CHECK_BATCH).map(refresh));
	}
	let changed = false;
	const compare = async key => {
		let res = key === ROOT_URL && fresh ? await fresh.catch(() => null) : null;
		if (!res) res = await withTimeout(INSTALL_TIMEOUT_MS, signal => fetch(new Request(key, { cache: 'no-cache', signal })));
		/* gone or not to be kept: the copy stays (a removed file is no reason to fetch everything) */
		if (!keep(res)) return;
		const copy = (prepared && (await prepared.match(key))) || (await shell.match(key));
		const [now, before] = await Promise.all([res.arrayBuffer(), copy ? copy.arrayBuffer() : null]);
		if (!before || !sameBytes(now, before)) changed = true;
	};
	for (let i = 0; i < keys.length && !changed; i += CHECK_BATCH) {
		const results = await Promise.allSettled(keys.slice(i, i + CHECK_BATCH).map(compare));
		if (results.some(r => r.status === 'rejected')) return false;
	}
	if (!changed) return false;
	await caches.delete(names.next);
	const { offline } = await precache(cfg, names.next, { data: false });
	if (offline) {
		await caches.delete(names.next);
		return false;
	}
	await (await caches.open(names.next)).put(COMPLETE(), new Response('', { headers: { 'Content-Type': 'text/plain' } }));
	await announceUpdate();
	return true;
}

let checking = null;
let lastCheck = -Infinity;

/** After a start: one check, a little later, not more often than CHECK_GAP_MS */
function scheduleCheck(fresh) {
	if (checking || Date.now() - lastCheck < CHECK_GAP_MS) return fresh ? fresh.catch(() => {}) : Promise.resolve();
	lastCheck = Date.now();
	checking = new Promise(resolve => setTimeout(resolve, CHECK_DELAY_MS))
		.then(() => checkForUpdate(CONFIG, NAMES, fresh))
		.catch(err => console.info('[sw] update check failed', err))
		.finally(() => { checking = null; });
	return checking;
}

/* Code of the desktop: never refreshed in place — a running page would mix old and new modules */
const CODE_DESTINATIONS = ['script', 'style', 'worker', 'sharedworker', 'json', 'audioworklet', 'paintworklet'];

/**
 * A file of the desktop: the copy when there is one, else the network (stored, as network first).
 * destination: of the page's request (a rebuilt Request loses it)
 */
async function cacheFirst(event, request, key, destination = '') {
	const copy = await caches.open(NAMES.shell).then(c => c.match(key));
	if (copy) return copy;
	/* only files the crawl did not store get here: their copy is marked as a runtime copy — except
	   code (a module the crawl missed; an exact code file such as site.data, a wallpaper or a site icon
	   set, which the page reads with fetch()), which stays on the crawl's compare-and-swap path */
	const runtime = !CODE_DESTINATIONS.includes(destination) && !CONFIG.code.files.includes(key);
	return networkFirst(event, request, { cacheName: NAMES.shell, key, timeoutMs: CONFIG.timeoutMs, runtime });
}

/* ---------- Lifecycle ---------- */

const CONFIG = readSiteConfig();
const NAMES = cacheNames(CONFIG);

/* Legacy caches (config.offline.legacyCaches) are deleted on activation, once more LEGACY_FOLLOW_UP_MS
   later and at every start: the earlier worker may still finish requests after the hand-over and write
   to them again (it controlled the page while this one installed) */
let legacyFollowUp = false;

async function sweepLegacy() {
	const gone = (await caches.keys()).filter(NAMES.legacy);
	await Promise.all(gone.map(k => caches.delete(k)));
	if (gone.length) console.info('[sw] removed the caches of an earlier service worker:', gone);
	return gone;
}

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
		/* also a switched-off worker; the follow-up waits for the first fetch event (a delay here would
		   hold every request of the claimed pages: fetch events wait until this worker is activated) */
		if (CONFIG.legacy.length) {
			await sweepLegacy();
			legacyFollowUp = true;
		}
		if (!CONFIG.enabled) {
			await self.registration.unregister();
			return;
		}
		if (preloadSupported()) {
			try { await self.registration.navigationPreload.enable(); } catch { /* not supported */ }
		}
		/* Pages a worker of an older generation started run old files: a reload brings the new ones */
		const replaced = keys.some(k => NAMES.own.test(k) && !current.includes(k) && k !== NAMES.next && !k.endsWith(':pages'));
		await self.clients.claim();
		if (replaced) await announceUpdate();
	})());
});

self.addEventListener('fetch', event => {
	/* Legacy caches: once more LEGACY_FOLLOW_UP_MS after the activation — before classify, so it also runs
	   for requests this worker leaves alone and for a switched-off worker that still controls its pages */
	if (legacyFollowUp) {
		legacyFollowUp = false;
		event.waitUntil(new Promise(ok => setTimeout(ok, LEGACY_FOLLOW_UP_MS)).then(sweepLegacy).catch(() => {}));
	}
	const req = event.request;
	const route = classify(req, CONFIG);
	if (!route) return;
	const preload = req.mode === 'navigate' ? event.preloadResponse : null;
	switch (route.kind) {
		case 'shell-nav':
			/* every start: the legacy caches once more (this worker always has the current list) */
			if (CONFIG.legacy.length) event.waitUntil(sweepLegacy().catch(() => {}));
			if (CONFIG.fastStart) {
				/* From the copy (after moving a prepared update in place); the check uses the preload answer */
				event.respondWith((async () => {
					await applyUpdate(NAMES).catch(() => false);
					const copy = await caches.open(NAMES.shell).then(c => c.match(route.key));
					if (!copy) return networkFirst(event, req, { cacheName: NAMES.shell, key: route.key, timeoutMs: CONFIG.timeoutMs, preload });
					event.waitUntil(scheduleCheck(preload));
					return copy;
				})());
			} else {
				event.respondWith(networkFirst(event, req, { cacheName: NAMES.shell, key: route.key, timeoutMs: CONFIG.timeoutMs, preload }));
			}
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
		case 'data':
			/* Data is never answered from the copy first (and never part of an update) */
			event.respondWith(networkFirst(event, revalidating(req), { cacheName: NAMES.shell, key: route.key, timeoutMs: CONFIG.timeoutMs }));
			break;
		case 'asset':
			event.respondWith(CONFIG.fastStart
				? cacheFirst(event, revalidating(req), route.key, req.destination)
				: networkFirst(event, revalidating(req), { cacheName: NAMES.shell, key: route.key, timeoutMs: CONFIG.timeoutMs }));
			break;
		default:
	}
});
