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
   installs a new worker as before, and tells the pages the same: when the cache
   name changes (a new version, another precache list) and also when it stays —
   then the install crawls into the cache the open pages read, and announces
   when it changed a copy of code they run (the CHANGED marker, written before
   the first changed copy; read at activation). Every install first deletes the
   '-next' of its cache name (its crawl is newer). The check also repairs: when
   the copy lost files of its last complete crawl (FILES — another worker
   deleted the cache, the starts since refilled only what the pages asked for;
   no FILES after an install with network failures or server errors) it crawls again; while the server
   still has the code the pages run, the missing files join the copy in place
   and nothing is announced, else it is an update as above. The check
   runs inside the start's waitUntil (the browser keeps the worker for it), so
   a newer worker cannot activate before it ends: it ends as soon as one is
   installing or waiting or has replaced this one (superseded()) — the delay
   ends early, every step and every level of the crawl looks first, and the
   requests in flight are aborted (updatefound, and a watch every
   CHECK_WATCH_MS) — bodies still arriving too, and the wait for the
   navigation preload answer (its body is cancelled); a '-next' it began is
   deleted, never marked complete.
   Before the crawl, and again before the marker, it lets the browser compare
   sw.js (registration.update()): a changed worker — a new release, or a
   rollback to an earlier worker at the same URL — installs at once and the
   check leaves the copy to it.
   Runtime copies: a file of the shell (not a data file, see below) the crawl
   did not fetch but the desktop read later (a man or cat text outside the data
   folders, an image — not a script or style) is stored with the header
   X-Desk-Copy: runtime. The update check refreshes such copies in place
   (changed bytes → new copy; 404/410 or no longer to be kept → deleted; no
   answer → kept) and never prepares or announces an update because of them.

   Data files — notify.feeds (also outside the root), the fortune files of the
   language chain, site/data/, site/content/ — are never answered from the copy
   first: network first like fastStart: false, offline the last copy. The update
   check skips them and a prepared '-next' never contains them (only a repair
   brings back those the copy lost), so a new feed item or an
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
   module and app, it follows static and dynamic imports with a literal specifier
   (comments do not count), the descriptor fields styles: [...], windowStyles: [...],
   precache: [...] (files a module imports with a computed specifier) and
   i18n: [...], stylesheet url()s, and adds locales/<lang>/<ns>.js
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
   never deleted that way. The 30 s never keep an event open (waitUntil): while
   the active worker has an extended event, a newer one cannot activate. Every
   sweep runs only while this worker is in charge of its registration — no
   newer worker installing or waiting, not replaced — and looks again before
   each delete: after a rollback the newer worker may be the earlier one, and
   the listed caches are its own again. A page asks with
   { type: 'desk:legacy-sweep' } (src/panels/install.js) instead of deleting
   them itself, because it cannot tell this worker from an earlier one at the
   same URL.

   config.pwa.enabled === false switches it off for good: a service worker that is
   still registered from before installs, deletes its caches and unregisters itself. */

'use strict';

/* Keep equal to package.json "version" and VERSION in src/core/env.js (tests/p12-sw.test.mjs checks it) */
const VERSION = '1.4.0';

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
const CHECK_WATCH_MS = 250;       // a running check looks this often whether a newer worker appeared
const LEGACY_FOLLOW_UP_MS = 30000; // legacy caches: once more after the hand-over (never inside waitUntil)

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

/** JavaScript source without its comments: an import named in a comment is no file to fetch. Strings,
    template literals (with their ${ … } parts) and regular expression literals stay as they are — a '//' or
    '/*' inside them starts no comment; a block comment keeps its line breaks (line-based rules keep their
    lines). A '/' after an operand (a name that is no keyword, a number, ')', ']', a literal) divides,
    anywhere else — also after '}', which ends a block — it starts a regular expression. A heuristic, not a
    parser: a regular expression right after ')' (if (x) /re/…) or after a keyword not in KEYWORD (export
    default /re/…) is read as division;
    a '/*' inside it that is glued to that '/' and not closed on its line starts no comment, so such a misread
    never reaches past its line. The same function as stripComments() in tools/build-preload.mjs
    (tests/p12-sw.test.mjs compares their source). */
function stripComments(text) {
	const n = text.length;
	const WORD = /[\p{ID_Continue}$#]/u;
	const KEYWORD = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
	let out = '';
	let i = 0;
	const copyEscaped = () => {
		out += text.slice(i, i + 2);
		i += 2;
	};
	const quoted = q => {
		out += text[i++];
		while (i < n && text[i] !== '\n') {
			if (text[i] === '\\') copyEscaped();
			else if (text[i] === q) {
				out += text[i++];
				return;
			} else out += text[i++];
		}
	};
	const regex = () => {
		let inClass = false;
		out += text[i++];
		while (i < n && text[i] !== '\n') {
			const c = text[i];
			if (c === '\\') {
				copyEscaped();
				continue;
			}
			out += c;
			i++;
			if (c === '[') inClass = true;
			else if (c === ']') inClass = false;
			else if (c === '/' && !inClass) break;
		}
		while (i < n && WORD.test(text[i])) out += text[i++];
	};
	/* code until the end — or, inner: inside the ${ … } of a template literal, until its closing brace */
	const code = inner => {
		let depth = 0;
		let operand = false;
		let glued = false; // a '/' read as division, no white space since
		while (i < n) {
			const c = text[i];
			const d = text[i + 1];
			const end = c === '/' && d === '*' ? text.indexOf('*/', i + 2) : -1;
			if (c === '/' && d === '/') {
				while (i < n && text[i] !== '\n') i++;
			} else if (c === '/' && d === '*' && glued && (end < 0 || text.lastIndexOf('\n', end) > i)) {
				/* glued to a division and not closed on its line: a '/*' inside a regular expression that
				   was read as division (if (x) /[/*]/…) — no comment, the lines after it stay */
				out += c;
				i++;
				operand = false;
			} else if (c === '/' && d === '*') {
				const stop = end < 0 ? n : end + 2;
				out += text.slice(i, stop).replace(/[^\n]/g, '') || ' ';
				i = stop;
			} else if (c === '\'' || c === '"') {
				quoted(c);
				operand = true;
			} else if (c === '`') {
				template();
				operand = true;
			} else if (c === '/' && !operand) {
				regex();
				operand = true;
			} else if (WORD.test(c)) {
				let j = i;
				while (j < n && WORD.test(text[j])) j++;
				const word = text.slice(i, j);
				out += word;
				i = j;
				operand = !KEYWORD.test(word);
			} else {
				if (c === '{') depth++;
				else if (c === '}') {
					if (inner && depth === 0) return;
					depth--;
				}
				out += c;
				i++;
				if (/\s/.test(c)) glued = false;
				else {
					if (c === '/') glued = true;
					operand = c === ')' || c === ']';
				}
			}
		}
	};
	const template = () => {
		out += text[i++];
		while (i < n) {
			if (text[i] === '\\') copyEscaped();
			else if (text[i] === '`') {
				out += text[i++];
				return;
			} else if (text[i] === '$' && text[i + 1] === '{') {
				out += '${';
				i += 2;
				code(true);
				if (i < n) out += text[i++];
			} else out += text[i++];
		}
	};
	code(false);
	return out;
}

/** References inside a JavaScript file: { urls: [absolute], namespaces: [ns], sources: [[ns, folder URL]] }
    (a file that declares locales: '<folder>/' keeps its namespaces there, not in the core locales/).
    Comments do not count (stripComments). Followed: static and dynamic imports with a literal specifier, and
    the descriptor fields styles, windowStyles and precache (files it imports with a computed specifier,
    import(`./regions/${id}.js`) — no literal names them) */
function scanJs(source, fileUrl) {
	const text = stripComments(source);
	const specs = [];
	for (const m of text.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?(['"])([^'"\n]+?)\1/g)) specs.push(m[2]);
	for (const m of text.matchAll(/\bimport\s*\(\s*(['"])([^'"\n]+?)\1\s*\)/g)) specs.push(m[2]);
	const urls = specs.filter(s => /^(?:\.{1,2}\/|\/(?!\/))/.test(s)).map(s => local(s, fileUrl));
	for (const m of text.matchAll(/\b(?:windowStyles|styles|precache)\s*:\s*\[([^\]]*)\]/g)) urls.push(...strings(m[1]).map(s => local(s, fileUrl)));
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

/** fn(signal) — a fetch — with a signal that aborts when the answer takes longer than ms, and at once when
    outer (the running check's signal) aborts. use(res): reads the answer while outer still reaches the
    request — an abort then also ends its body (a browser errors the body of an aborted fetch); the timeout
    covers the answer, not its body. → use's result, or the answer */
const withTimeout = async (ms, fn, outer = null, use = null) => {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), ms);
	const stop = () => ctl.abort();
	if (outer) {
		if (outer.aborted) ctl.abort();
		else outer.addEventListener('abort', stop, { once: true });
	}
	try {
		const res = await fn(ctl.signal).finally(() => clearTimeout(timer));
		return use ? await use(res) : res;
	} finally {
		clearTimeout(timer);
		if (outer) outer.removeEventListener('abort', stop);
	}
};

/* What a crawl or check that ended because a newer worker appeared rejects with */
const supersededError = () => Object.assign(new Error('a newer service worker took over'), { name: 'AbortError' });

/** promise — or an AbortError as soon as signal aborts (whatever promise stands for goes on; nobody waits) */
const untilAbort = (promise, signal) => new Promise((resolve, reject) => {
	if (signal.aborted) return reject(supersededError());
	const stop = () => reject(supersededError());
	signal.addEventListener('abort', stop, { once: true });
	promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
});

/** An answer nobody reads: its body is cancelled (ends the download) */
const discard = res => {
	try {
		if (res && res.body && !res.bodyUsed && !res.body.locked) res.body.cancel().catch(() => {});
	} catch { /* nothing to cancel */ }
};

/** The bytes of an answer. Once signal aborts, the read is cancelled — which also ends the download, and
    holds nobody even where the body of an answer that is not a fetch's (the navigation preload) never ends —
    and rejects (AbortError). */
async function readBytes(res, signal) {
	if (signal.aborted) {
		discard(res);
		throw supersededError();
	}
	if (!res.body || typeof res.body.getReader !== 'function') return untilAbort(res.arrayBuffer(), signal);
	const reader = res.body.getReader();
	const cancel = () => reader.cancel().catch(() => {});
	signal.addEventListener('abort', cancel, { once: true });
	const chunks = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (signal.aborted) throw supersededError();
			if (done) break;
			chunks.push(value);
			size += value.byteLength;
		}
	} finally {
		signal.removeEventListener('abort', cancel);
	}
	const bytes = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return bytes.buffer;
}

const cacheable = res => !!res && res.ok && res.status === 200 && res.type === 'basic';

/** An HTTP status that says "not now" rather than "not there": a server error, a timeout, a rate limit.
    The crawl counts it like a network failure — a copy without that file is not complete. */
const transient = status => status >= 500 || status === 408 || status === 429;

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

/** Fetches one file into the cache; returns its text when it may hold further references.
    outer: the running update check's signal (aborts the request — also while its body is still read and
    stored — when a newer worker appears); note(key, res): called before the answer replaces a copy */
function precacheOne(cache, url, outer = null, note = null) {
	return withTimeout(INSTALL_TIMEOUT_MS, signal => fetch(new Request(url, { cache: 'no-cache', signal })), outer, async res => {
		if (!cacheable(res)) throw Object.assign(new Error(`${url}: HTTP ${res.status}`), { status: res.status });
		/* the server answered for good (404, 403 …, or a copy it forbids): the copy is complete without it;
		   a transient answer (5xx, 408, 429) counts like a network failure (transient(), precache()) */
		if (!keep(res)) throw Object.assign(new Error(`${url}: Cache-Control forbids keeping a copy`), { status: res.status });
		const type = res.headers.get('Content-Type') || '';
		const text = /html|css|javascript|ecmascript/.test(type) || /\.(?:m?js|css|html)$|\/$/.test(new URL(url).pathname)
			? await res.clone().text() : null;
		if (note) await note(shellKey(url), res);
		await cache.put(shellKey(url), clean(res));
		return text === null ? { urls: [], namespaces: [] } : scan(text, url, type);
	});
}

/** Crawls from the roots, level by level; every file is fetched once, failures are skipped.
    data: false leaves data files out — neither as roots nor when the crawl meets one (a prepared update).
    signal, stop (the update check's crawl into '-next'): before each level and after it, stop() says whether
    a newer worker appeared; then — or once signal aborts, which also aborts the requests in flight — the
    crawl ends and rejects (AbortError) after the requests of its level settled, so nothing writes later.
    compare (the install of a worker that replaces an active one, into the cache that worker's pages read):
    note every copy of code — not data, not a runtime copy — whose bytes the crawl changes; the CHANGED
    marker goes into that cache before the first such copy is replaced.
    → { files, failed, offline, kept, changed } — offline: how many failed without a final answer (network,
    timeout, or a transient HTTP status: 5xx, 408, 429); kept: the keys of the code files it stored (the list of a complete copy, FILES); changed: the
    copies compare found changed */
async function precache(cfg, cacheName, { data = true, signal = null, stop = null, compare = false } = {}) {
	const cache = await caches.open(cacheName);
	const seen = new Set();
	const namespaces = new Set();
	const sources = new Map();
	const failed = [];
	const kept = [];
	const changed = [];
	let offline = 0;
	const note = compare ? async (key, res) => {
		if (isDataUrl(key, cfg)) return;
		const copy = await cache.match(key);
		if (!copy || isRuntimeCopy(copy)) return;
		if (sameBytes(await res.clone().arrayBuffer(), await copy.arrayBuffer())) return;
		/* the marker before the first copy changes: an install that dies after it still gets announced */
		if (!changed.length) await cache.put(CHANGED(), new Response(''));
		changed.push(key);
	} : null;
	const ended = () => {
		if (stop && stop()) return true;
		return !!signal && signal.aborted;
	};
	const run = async list => {
		let level = list.filter(u => !seen.has(shellKey(u)));
		while (level.length && seen.size < MAX_FILES) {
			if (ended()) throw supersededError();
			level = level.slice(0, MAX_FILES - seen.size);
			level.forEach(u => seen.add(shellKey(u)));
			const results = await Promise.allSettled(level.map(u => precacheOne(cache, u, signal, note)));
			if (ended()) throw supersededError();
			const next = [];
			results.forEach((r, i) => {
				if (r.status === 'rejected') {
					const status = r.reason?.status;
					if (!status || transient(status)) offline++;
					return failed.push(level[i]);
				}
				if (!isDataUrl(level[i], cfg)) kept.push(shellKey(level[i]));
				r.value.namespaces.forEach(ns => namespaces.add(ns));
				for (const [ns, dir] of r.value.sources ?? []) sources.set(`${dir}\n${ns}`, [ns, dir]);
				for (const u of r.value.urls) if (isShellUrl(u, cfg) && (data || !isDataUrl(u, cfg)) && !seen.has(shellKey(u))) next.push(u);
			});
			level = [...new Set(next)];
		}
	};
	await run(precacheRoots(cfg, { data }));
	await run(localeUrls(cfg, [...namespaces], [...sources.values()]));
	if (ended()) throw supersededError();
	if (failed.length) console.info(`[sw] ${seen.size - failed.length} files kept offline; not available: ${failed.length}`, failed);
	return { files: seen.size - failed.length, failed, offline, kept, changed };
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
   copy is moved in place (a worker stopped halfway leaves none). Its body is the list of the crawl's code
   files, which moves into the shell cache as FILES. */
const COMPLETE = () => new URL('sw.js?complete', ROOT_URL).href;
/* In the shell cache: the code files of the last complete crawl (the install's when no file failed without
   an answer, or a moved update's) as a JSON list. A listed file that is gone, or no list at all, means the copy lost entries — another worker
   deleted the cache, and the starts since refilled only what the pages asked for: the update check
   crawls again (runCheck). */
const FILES = () => new URL('sw.js?files', ROOT_URL).href;
/* In the shell cache, from install to activate: this worker replaced an active one with the same cache
   name, and its install changed copies of code the open pages run — activation tells them. A marker, not
   a variable, written before the first such copy is replaced: the browser may stop the worker between the
   two events, or in the middle of the install (its retry finds nothing changed any more). */
const CHANGED = () => new URL('sw.js?changed', ROOT_URL).href;
/* A marker entry (sw.js itself is never kept, so its URL with a query is no file of the desktop) */
const isMarker = key => new URL(key).pathname === new URL('sw.js', ROOT_URL).pathname;
const listOf = keys => new Response(JSON.stringify(keys), { headers: { 'Content-Type': 'application/json' } });
/** The list of a COMPLETE or FILES marker, or null when there is none or it is not one */
async function readList(res) {
	if (!res) return null;
	try {
		const list = JSON.parse(await res.text());
		return Array.isArray(list) && list.every(k => typeof k === 'string') ? list : null;
	} catch {
		return null;
	}
}

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
	/* a check still writing it, or a newer worker installing (its crawl is newer than this '-next') */
	if (checking || superseded()) return false;
	const next = await caches.open(names.next);
	const complete = !!(await next.match(COMPLETE()));
	if (complete) {
		const shell = await caches.open(names.shell);
		const keys = (await next.keys()).filter(k => k.url !== COMPLETE());
		await Promise.all(keys.map(async k => shell.put(k, await next.match(k))));
		const list = await readList(await next.match(COMPLETE()));
		if (list) await shell.put(FILES(), listOf(list));
	}
	await caches.delete(names.next);
	return complete;
}

/** Tells every open page of this installation that a new version is ready (one reload away) */
async function announceUpdate() {
	const pages = await self.clients.matchAll({ type: 'window' });
	for (const page of pages) page.postMessage({ type: 'desk:update' });
}

/* ---------- Which worker is in charge ---------- */

/* This worker's own ServiceWorker object: self.serviceWorker where the engine has it; else the
   registration's active worker as this worker saw it while activating or handling a fetch event (only the
   active worker receives those). One worker is one object in this realm, so === compares. */
let ownWorker = null;
function noteOwnWorker() {
	const reg = self.registration;
	if (!self.serviceWorker && !ownWorker && reg && reg.active) ownWorker = reg.active;
}
const ownServiceWorker = () => self.serviceWorker || ownWorker;

/** Is this worker no longer the one in charge of its registration? A newer worker is installing or
    waiting, or one has already replaced it (this worker is redundant, or the registration's active worker
    is another one — after a rollback that one may be an earlier, unrelated worker at the same URL).
    The update check runs inside the start's waitUntil, and a newer worker that called skipWaiting()
    activates only once this one has no extended events: the check ends at once (the newer worker brings
    its own copy; the next start checks again). The legacy sweeps never run then (the newer worker may use
    the caches the list names). */
function superseded() {
	const reg = self.registration;
	if (!reg) return false;
	const mine = ownServiceWorker();
	if ((reg.installing && reg.installing !== mine) || (reg.waiting && reg.waiting !== mine)) return true;
	if (!mine) return false;
	if (mine.state && mine.state !== 'activating' && mine.state !== 'activated') return true;
	return !!reg.active && reg.active !== mine;
}

const inCharge = () => !superseded();

/* ---------- The update check ---------- */

let checking = null;
let lastCheck = -Infinity;
let checkCtl = null;   // AbortController of the running check: aborted once a newer worker appears

/* A newer worker starts installing: the running check ends at once — its requests in flight are aborted,
   so nothing it does holds that worker's activation (a rollback to an earlier worker waited ~60 s) */
try {
	self.registration?.addEventListener?.('updatefound', () => {
		if (checkCtl) checkCtl.abort();
	});
} catch { /* no events on this engine: the watch below covers it */ }

/** While a check runs: aborts it as soon as superseded() — also between updatefound events, for engines
    that do not send them to the worker. Returns the function that ends the watch. */
function watchCheck(ctl) {
	checkCtl = ctl;
	let timer = null;
	const tick = () => {
		if (superseded()) ctl.abort();
		else timer = setTimeout(tick, CHECK_WATCH_MS);
	};
	timer = setTimeout(tick, CHECK_WATCH_MS);
	return () => {
		clearTimeout(timer);
		if (checkCtl === ctl) checkCtl = null;
	};
}

/** ms, or less when signal aborts first */
const pause = (ms, signal) => new Promise(resolve => {
	let timer = null;
	const done = () => {
		clearTimeout(timer);
		signal.removeEventListener('abort', done);
		resolve();
	};
	timer = setTimeout(done, ms);
	signal.addEventListener('abort', done, { once: true });
});

/** Asks the browser to compare sw.js and its imported scripts with the server now (registration.update()).
    A changed sw.js (a new release, a rollback to an earlier worker at the same URL) installs that worker at
    once, and superseded() ends the check instead of crawling for a copy nobody will use. Never longer than
    INSTALL_TIMEOUT_MS; a failure changes nothing. */
async function recheckWorker(signal) {
	const reg = self.registration;
	if (!reg || typeof reg.update !== 'function' || signal.aborted) return;
	let timer = null;
	let end = null;
	try {
		await Promise.race([
			reg.update(),
			new Promise(resolve => {
				end = resolve;
				timer = setTimeout(resolve, INSTALL_TIMEOUT_MS);
				signal.addEventListener('abort', resolve, { once: true });
			})
		]);
	} catch { /* offline, or the browser declined: the check goes on */ } finally {
		clearTimeout(timer);
		if (end) signal.removeEventListener('abort', end);
	}
}

/** Has the shell cache lost files of its last complete crawl? (FILES: a listed file is gone, or there is
    no list — the cache was emptied and refilled by the pages' requests only) */
async function incomplete(shell) {
	const list = await readList(await shell.match(FILES()));
	if (!list) return true;
	const have = new Set((await shell.keys()).map(r => r.url));
	return list.some(key => !have.has(key));
}

/** Does a crawled copy ('-next') hold other bytes than a copy of code in the shell cache? (data files and
    runtime copies do not count — data is always the server's, the check refreshes runtime copies in place) */
async function differs(shell, next, cfg) {
	for (const req of await next.keys()) {
		if (isMarker(req.url) || isDataUrl(req.url, cfg)) continue;
		const copy = await shell.match(req.url);
		if (!copy || isRuntimeCopy(copy)) continue;
		const fresh = await next.match(req.url);
		if (!sameBytes(await fresh.arrayBuffer(), await copy.arrayBuffer())) return true;
	}
	return false;
}

/** A repair: the files of a crawl the shell cache lacks (or has only as a runtime copy) join it — data
    files only when missing; its list becomes the shell's FILES */
async function fillIn(shell, next, kept) {
	for (const req of await next.keys()) {
		if (isMarker(req.url)) continue;
		const copy = await shell.match(req.url);
		if (!copy || isRuntimeCopy(copy)) await shell.put(req.url, await next.match(req.url));
	}
	await shell.put(FILES(), listOf(kept));
}

/**
 * Compares every code file of the shell cache (and of a prepared update) with the server — data
 * files never count (isDataUrl) and never join '-next'. When
 * anything changed, the browser first looks at sw.js again (recheckWorker), then the whole desktop is
 * fetched again into '-next' (the install's crawl, so new files join), the marker is written last and the
 * pages hear about it. Offline, a timeout or a crawl that could not reach every file: nothing is kept,
 * the next start tries again.
 * Runtime copies (X-Desk-Copy: runtime) are refreshed in place instead and never count as a change.
 * A newer worker (superseded()): the check ends at once — before and after every step, every crawl
 * level, and in the middle of one (its requests are aborted, bodies still arriving too); a '-next' it
 * started is deleted, never marked complete.
 * fresh: the navigation preload answer for index.html (saves one request; waited for until the abort or
 *   INSTALL_TIMEOUT_MS, then index.html is fetched instead).
 * ctl: the AbortController of a check scheduleCheck() runs; without it the check makes and watches its own.
 */
async function checkForUpdate(cfg, names, fresh = null, ctl = null) {
	if (ctl) return runCheck(cfg, names, fresh, ctl);
	const own = new AbortController();
	const unwatch = watchCheck(own);
	try {
		return await runCheck(cfg, names, fresh, own);
	} finally {
		unwatch();
	}
}

async function runCheck(cfg, names, fresh, ctl) {
	const { signal } = ctl;
	/* superseded meanwhile? Then the check is over (and its requests in flight are aborted) */
	const over = () => {
		if (!signal.aborted && superseded()) ctl.abort();
		return signal.aborted;
	};
	/* The server's answer for key → { res, now (its bytes; null when it may not be kept) }: the answer within
	   INSTALL_TIMEOUT_MS, its body until the check ends — a newer worker ends both */
	const load = key => withTimeout(INSTALL_TIMEOUT_MS, s => fetch(new Request(key, { cache: 'no-cache', signal: s })), signal,
		async res => {
			if (keep(res)) return { res, now: await readBytes(res, signal) };
			discard(res);
			return { res, now: null };
		});
	/* The navigation preload answer for index.html (fresh) the same way: never after a newer worker appeared
	   (an answer that comes later is discarded); not there within INSTALL_TIMEOUT_MS → null, the check fetches
	   index.html itself */
	const preloaded = async () => {
		let timer = null;
		const late = new Promise(resolve => { timer = setTimeout(resolve, INSTALL_TIMEOUT_MS, null); });
		let res = null;
		try {
			res = await untilAbort(Promise.race([fresh.catch(() => null), late]), signal);
		} catch (err) {
			fresh.then(discard, () => {});
			throw err;
		} finally {
			clearTimeout(timer);
		}
		if (!res) {
			fresh.then(discard, () => {});
			return null;
		}
		if (keep(res)) return { res, now: await readBytes(res, signal) };
		discard(res);
		return { res, now: null };
	};
	if (over()) return false;
	const shell = await caches.open(names.shell);
	const prepared = (await caches.has(names.next)) ? await caches.open(names.next) : null;
	/* data files are never compared (network first, never part of an update) */
	const all = (await shell.keys()).map(r => r.url).filter(u => !isMarker(u) && !isDataUrl(u, cfg));
	const marked = await Promise.all(all.map(async key => isRuntimeCopy(await shell.match(key))));
	const keys = all.filter((_, i) => !marked[i]);
	const runtime = all.filter((_, i) => marked[i]);
	/* A runtime copy: gone (404/410) or not to be kept → deleted; changed → replaced; no answer → kept */
	const refresh = async key => {
		const { res, now } = await load(key);
		if (res.status === 404 || res.status === 410 || (cacheable(res) && !keep(res))) {
			await shell.delete(key);
			return;
		}
		if (!now) return;
		const copy = await shell.match(key);
		const before = copy ? await copy.arrayBuffer() : null;
		if (!before || !sameBytes(now, before)) {
			await shell.put(key, runtimeCopy(new Response(now, { status: res.status, statusText: res.statusText, headers: res.headers })));
		}
	};
	for (let i = 0; i < runtime.length && !over(); i += CHECK_BATCH) {
		await Promise.allSettled(runtime.slice(i, i + CHECK_BATCH).map(refresh));
	}
	let changed = false;
	const compare = async key => {
		const { now } = (key === ROOT_URL && fresh && (await preloaded())) || (await load(key));
		/* gone or not to be kept: the copy stays (a removed file is no reason to fetch everything) */
		if (!now) return;
		const copy = (prepared && (await prepared.match(key))) || (await shell.match(key));
		const before = copy ? await copy.arrayBuffer() : null;
		if (!before || !sameBytes(now, before)) changed = true;
	};
	for (let i = 0; i < keys.length && !changed && !over(); i += CHECK_BATCH) {
		const results = await Promise.allSettled(keys.slice(i, i + CHECK_BATCH).map(compare));
		if (results.some(r => r.status === 'rejected')) return false;
	}
	/* a newer worker appeared meanwhile: no crawl (it would hold that worker; its activation replaces '-next') */
	if (over()) return false;
	/* nothing changed: is the copy still complete (FILES)? When not — and no prepared update brings a
	   complete one — the same crawl repairs it */
	const repair = !changed && !prepared && (await incomplete(shell));
	if ((!changed && !repair) || over()) return false;
	/* files changed: sw.js too? Then that worker installs now, and the copy is its business */
	if (changed) await recheckWorker(signal);
	if (over()) return false;
	await caches.delete(names.next);
	let result;
	try {
		/* an update leaves data files out; a repair brings back those the copy lost as well (the install's
		   copy has them for a first visit offline) — they never stay in a '-next' that is marked complete */
		result = await precache(cfg, names.next, { data: !changed, signal, stop: over });
	} catch (err) {
		await caches.delete(names.next);
		if (signal.aborted) return false;
		throw err;
	}
	/* a crawl with network failures (or a server error, a rate limit), or a newer worker: nothing is kept */
	if (result.offline || over()) {
		await caches.delete(names.next);
		return false;
	}
	const next = await caches.open(names.next);
	/* A repair: when the server still has the code the pages run (no copy differs), the files the copy lost
	   join it in place — no new version, nothing to tell. Else it is an update after all. */
	if (!changed && !(await differs(shell, next, cfg))) {
		await fillIn(shell, next, result.kept);
		await caches.delete(names.next);
		console.info(`[sw] the offline copy was incomplete — ${result.kept.length} files kept again`);
		return false;
	}
	/* an update after all: no data file in a prepared update (§14) */
	for (const req of await next.keys()) if (isDataUrl(req.url, cfg)) await next.delete(req.url);
	/* sw.js changed during the crawl? Then that worker takes over, and nothing is kept */
	await recheckWorker(signal);
	if (over()) {
		await caches.delete(names.next);
		return false;
	}
	await next.put(COMPLETE(), listOf(result.kept));
	if (over()) {
		await caches.delete(names.next);
		return false;
	}
	await announceUpdate();
	return true;
}

/** After a start: one check, a little later, not more often than CHECK_GAP_MS. The delay ends early, and
    the check is skipped, when a newer worker appears meanwhile. */
function scheduleCheck(fresh) {
	if (checking || Date.now() - lastCheck < CHECK_GAP_MS) return fresh ? fresh.then(discard, () => {}) : Promise.resolve();
	lastCheck = Date.now();
	const ctl = new AbortController();
	const unwatch = watchCheck(ctl);
	checking = pause(CHECK_DELAY_MS, ctl.signal)
		.then(() => {
			if (!ctl.signal.aborted && !superseded()) return checkForUpdate(CONFIG, NAMES, fresh, ctl);
			if (fresh) fresh.then(discard, () => {});
			return false;
		})
		.catch(err => console.info('[sw] update check failed', err))
		.finally(() => {
			unwatch();
			checking = null;
		});
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
   to them again (it controlled the page while this one installed).
   The follow-up never extends an event: a newer worker that called skipWaiting() activates only once
   the active one has no extended events, so a waitUntil() spanning the 30 s held every update (and a
   rollback) that long. It runs once, from a plain timer or from the first fetch event at or after the
   moment, whichever comes first; a stopped worker loses the timer, and the next start of the desktop
   sweeps in any case (so does a page that asks for it: 'desk:legacy-sweep', see the message handler).
   Every sweep runs only while this worker is in charge of its registration (inCharge(): no newer worker
   installing or waiting, not replaced) and looks again right before each delete: after a rollback the
   newer worker may be the earlier one the list names, and these are its caches again. */
let legacyDue = 0;        // Date.now() from which the follow-up is due; 0 = none pending
let legacyTimer = null;

/** Activation: the follow-up LEGACY_FOLLOW_UP_MS from now (one per activation) */
function armLegacyFollowUp() {
	if (legacyTimer !== null) clearTimeout(legacyTimer);
	legacyDue = Date.now() + LEGACY_FOLLOW_UP_MS;
	legacyTimer = setTimeout(() => {
		legacyTimer = null;
		legacyFollowUp();
	}, LEGACY_FOLLOW_UP_MS);
}

/** Runs a pending follow-up once; the sweep's promise, or null when none was due or a newer worker is
    there (installing, waiting or active: it is dropped, not postponed) */
function legacyFollowUp() {
	if (!legacyDue) return null;
	legacyDue = 0;
	if (legacyTimer !== null) {
		clearTimeout(legacyTimer);
		legacyTimer = null;
	}
	return inCharge() ? sweepLegacy().catch(() => {}) : null;
}

/** Deletes the legacy caches — only while this worker is in charge, checked again before each delete */
async function sweepLegacy() {
	if (!inCharge()) return [];
	const found = (await caches.keys()).filter(NAMES.legacy);
	const gone = [];
	for (const name of found) {
		if (!inCharge()) break;
		if (await caches.delete(name)) gone.push(name);
	}
	if (gone.length) console.info('[sw] removed the caches of an earlier service worker:', gone);
	return gone;
}

/** The install's crawl into the shell cache, then its list (FILES). A worker that replaces an active one
    under the same cache name (a change of sw.js or site/config.js that leaves the precache list and the
    version alone — a comment, offline.timeoutMs, legacyCaches) crawls into the very cache the open pages
    read: when that changes a copy of code, the CHANGED marker (written before that copy is replaced)
    tells activation to announce it. */
async function installCopy() {
	const replacing = !!(self.registration && self.registration.active);
	/* this crawl is newer than any '-next' under this name: the worker it replaces must not move one in
	   place meanwhile (a start would put older copies over the new ones) */
	await caches.delete(NAMES.next);
	const result = await precache(CONFIG, NAMES.shell, { compare: replacing });
	const shell = await caches.open(NAMES.shell);
	/* the list of a complete crawl only: after a network failure (or a server error, a rate limit) there is
	   none (an older one goes too) — the first update check then crawls again and fills the copy in */
	if (result.offline) await shell.delete(FILES());
	else await shell.put(FILES(), listOf(result.kept));
}

self.addEventListener('install', event => {
	event.waitUntil((async () => {
		if (CONFIG.enabled) await installCopy();
		await self.skipWaiting();
	})());
});

self.addEventListener('activate', event => {
	noteOwnWorker();
	event.waitUntil((async () => {
		const current = CONFIG.enabled ? [NAMES.shell, NAMES.pages] : [];
		const keys = await caches.keys();
		await Promise.all(keys.filter(k => NAMES.own.test(k) && !current.includes(k)).map(k => caches.delete(k)));
		/* also a switched-off worker; the follow-up is armed, never awaited (a delay here would hold every
		   request of the claimed pages: fetch events wait until this worker is activated) */
		if (CONFIG.legacy.length) {
			await sweepLegacy();
			armLegacyFollowUp();
		}
		if (!CONFIG.enabled) {
			await self.registration.unregister();
			return;
		}
		if (preloadSupported()) {
			try { await self.registration.navigationPreload.enable(); } catch { /* not supported */ }
		}
		/* Pages a worker of an older generation started run old files: a reload brings the new ones. The
		   same when the install changed their files under the same cache name (CHANGED) */
		const replaced = keys.some(k => NAMES.own.test(k) && !current.includes(k) && k !== NAMES.next && !k.endsWith(':pages'));
		const changed = keys.includes(NAMES.shell) && (await (await caches.open(NAMES.shell)).delete(CHANGED()));
		await self.clients.claim();
		if (replaced || changed) await announceUpdate();
	})());
});

/* A page asks for the legacy sweep (src/panels/install.js, ~30 s after 'controllerchange'): this worker
   sweeps when it is in charge. A page cannot tell this worker from an earlier one at the same URL (a
   rollback) — that one ignores the message, so its caches stay. */
self.addEventListener('message', event => {
	if (!event.data || event.data.type !== 'desk:legacy-sweep' || !CONFIG.legacy.length) return;
	const swept = sweepLegacy().catch(() => {});
	if (typeof event.waitUntil === 'function') event.waitUntil(swept);
});

self.addEventListener('fetch', event => {
	noteOwnWorker();
	/* Legacy caches: the follow-up, when its timer has not run yet although the moment has come — before
	   classify, so it also runs for requests this worker leaves alone and for a switched-off worker that
	   still controls its pages. Only the sweep itself (milliseconds) extends this event. */
	const followedUp = legacyDue && Date.now() >= legacyDue ? legacyFollowUp() : null;
	if (followedUp) event.waitUntil(followedUp);
	const req = event.request;
	const route = classify(req, CONFIG);
	if (!route) return;
	const preload = req.mode === 'navigate' ? event.preloadResponse : null;
	switch (route.kind) {
		case 'shell-nav':
			/* every start: the legacy caches once more (this worker always has the current list) */
			if (CONFIG.legacy.length && !followedUp) event.waitUntil(sweepLegacy().catch(() => {}));
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
