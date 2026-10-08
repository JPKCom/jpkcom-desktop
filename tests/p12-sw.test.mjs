/* JPKCom Desktop — tests: service worker (precache crawl, routing, strategies, lifecycle) — © Jean Pierre Kolb — MIT License

   sw.js is a classic worker script. It runs here inside a node:vm context whose global
   object plays ServiceWorkerGlobalScope: fake CacheStorage, fake fetch (a map of files or
   the project folder on disk), importScripts for site/config.js. Top-level declarations
   of the script (classify, cleanConfig, scanJs, …) are read back with ctx.run(). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, CACHE_SCHEME, cleanLegacyCaches, legacyMatcher, buildConfig } from '../src/core/config.js';
import { SET_PATH, MAX_SETS } from '../src/core/icon-sets.js';
import { GOOD_PATHS, BAD_PATHS } from './set-paths.mjs';
import { VERSION } from '../src/core/env.js';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SW_SOURCE = readFileSync(resolve(PROJECT, 'sw.js'), 'utf8');
const ORIGIN = 'https://example.org';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/* ---------- Fakes ---------- */

class FakeCache {
	constructor() { this.map = new Map(); }
	static key(k) { return typeof k === 'string' ? k : k.url; }
	async put(k, res) { this.map.delete(FakeCache.key(k)); this.map.set(FakeCache.key(k), res); }
	async match(k) { const r = this.map.get(FakeCache.key(k)); return r ? r.clone() : undefined; }
	async delete(k) { return this.map.delete(FakeCache.key(k)); }
	async keys() { return [...this.map.keys()].map(u => new Request(u)); }
}

class FakeCaches {
	constructor() { this.stores = new Map(); }
	async open(name) { if (!this.stores.has(name)) this.stores.set(name, new FakeCache()); return this.stores.get(name); }
	async keys() { return [...this.stores.keys()]; }
	async delete(name) { return this.stores.delete(name); }
	async has(name) { return this.stores.has(name); }
}

/** A Response that claims to be a same-origin network answer */
function basic(body, { status = 200, type = 'text/plain', headers = {} } = {}) {
	const res = new Response(body, { status, headers: { 'Content-Type': type, ...headers } });
	Object.defineProperty(res, 'type', { value: 'basic' });
	return res;
}

/**
 * Loads sw.js. files: { '/desk/path': string } served by fetch (or serveDisk: true for the project);
 * base: the installation folder; config: source of site/config.js (null = none);
 * timer: the worker's setTimeout (default: the real one).
 */
function loadSW({ base = '/desk/', files = {}, config = null, serveDisk = false, delay = 0, online = true, origin = ORIGIN, timer = setTimeout } = {}) {
	const handlers = {};
	const state = { online, delay, fetched: [], unregistered: false, claimed: false, skipped: false, preload: false, messages: [] };
	const serve = async url => {
		const u = new URL(url);
		if (u.origin !== ORIGIN) throw new TypeError(`cross-origin fetch in test: ${url}`);
		if (Object.hasOwn(files, u.pathname)) {
			const ext = extname(u.pathname) || '.html';
			const entry = files[u.pathname];
			/* an entry is the body, or { body, headers, status } for extra response headers or another status */
			const [body, headers, status] = typeof entry === 'object' && entry !== null ? [entry.body, entry.headers ?? {}, entry.status ?? 200] : [entry, {}, 200];
			return basic(body, { status, type: TYPES[ext] ?? 'application/octet-stream', headers });
		}
		if (serveDisk && u.pathname.startsWith(base)) {
			let rel = decodeURIComponent(u.pathname.slice(base.length));
			if (rel === '' || rel.endsWith('/')) rel += 'index.html';
			const file = resolve(PROJECT, rel);
			if (file.startsWith(PROJECT) && existsSync(file) && statSync(file).isFile()) {
				return basic(readFileSync(file), { type: TYPES[extname(file)] ?? 'application/octet-stream' });
			}
		}
		return basic('not found', { status: 404 });
	};
	const sandbox = {
		console: { info() {}, warn() {}, log() {}, error: console.error },
		URL, Request, Response, Headers, AbortController, setTimeout: timer, clearTimeout,
		location: { href: `${origin}${base}sw.js` },
		caches: new FakeCaches(),
		registration: {
			navigationPreload: { enable: async () => { state.preload = true; } },
			unregister: async () => { state.unregistered = true; return true; }
		},
		clients: {
			claim: async () => { state.claimed = true; },
			/* one open page that records what the worker tells it */
			matchAll: async () => [{ postMessage: msg => state.messages.push(msg) }]
		},
		skipWaiting: async () => { state.skipped = true; },
		addEventListener: (type, fn) => { handlers[type] = fn; },
		importScripts: path => {
			const url = new URL(path, `${origin}${base}sw.js`);
			if (url.pathname !== `${base}site/config.js` || config === null) throw new Error(`NetworkError: ${url}`);
			vm.runInContext(config, sandbox);
		},
		fetch: async (input, init) => {
			const req = input instanceof Request ? input : new Request(input, init);
			state.fetched.push(req.url);
			if (state.delay) await new Promise(ok => setTimeout(ok, state.delay));
			if (!state.online) throw new TypeError('Failed to fetch');
			return serve(req.url);
		}
	};
	sandbox.self = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(SW_SOURCE, sandbox, { filename: 'sw.js' });
	const run = code => vm.runInContext(code, sandbox);

	const extendable = () => {
		const waits = [];
		return { waits, waitUntil(p) { waits.push(Promise.resolve(p)); } };
	};
	const settle = async waits => { for (let i = 0; i < waits.length; i++) await waits[i].catch(() => {}); };
	return {
		sandbox, state, run, handlers,
		caches: sandbox.caches,
		async install() { const e = extendable(); handlers.install(e); await Promise.all(e.waits); },
		async activate() { const e = extendable(); handlers.activate(e); await Promise.all(e.waits); },
		/** Dispatches a fetch event; resolves { handled, response } once every waitUntil settled */
		async fetchEvent(request, { preload } = {}) {
			const e = extendable();
			let responded = null;
			e.request = request;
			e.preloadResponse = Promise.resolve(preload);
			e.respondWith = p => { responded = Promise.resolve(p); };
			handlers.fetch(e);
			if (!responded) {
				await settle(e.waits);
				return { handled: false };
			}
			let response = null;
			let error = null;
			try { response = await responded; } catch (err) { error = err; }
			await settle(e.waits);
			return { handled: true, response, error };
		}
	};
}

/** A Request with the fields the routing looks at (Node's Request has no navigate mode/destination) */
function req(url, { method = 'GET', mode = 'cors', destination = '', headers = {} } = {}) {
	const r = new Request(new URL(url, ORIGIN), { method, headers });
	Object.defineProperty(r, 'mode', { value: mode });
	Object.defineProperty(r, 'destination', { value: destination });
	return r;
}
const nav = (url, destination = 'document') => req(url, { mode: 'navigate', destination, headers: { Accept: 'text/html' } });

const CONFIG = cfg => `window.DESKTOP_CONFIG = ${JSON.stringify(cfg)};`;

/* ---------- Version and defaults ---------- */

test('VERSION matches package.json and src/core/env.js', () => {
	const pkg = JSON.parse(readFileSync(resolve(PROJECT, 'package.json'), 'utf8'));
	const sw = loadSW();
	assert.equal(sw.run('VERSION'), pkg.version);
	assert.equal(sw.run('VERSION'), VERSION);
});

test('DEFAULTS mirror src/core/config.js', () => {
	const d = loadSW().run('DEFAULTS');
	assert.equal(d.namespace, DEFAULTS.namespace);
	assert.deepEqual([...d.languages], DEFAULTS.languages);
	assert.equal(d.defaultLang, DEFAULTS.defaultLang);
	assert.deepEqual([...d.modules], DEFAULTS.modules);
	assert.deepEqual([...d.apps], DEFAULTS.apps);
	assert.equal(d.siteData, DEFAULTS.site.data);
	assert.equal(d.vaultDir, DEFAULTS.vault.dir);
	assert.equal(d.fortuneDir, DEFAULTS.fortune.dir);
	assert.deepEqual({ ...d.feeds }, DEFAULTS.notify.feeds);
	assert.equal(d.enabled, DEFAULTS.pwa.enabled);
	assert.equal(d.maxPages, DEFAULTS.offline.maxPages);
	assert.equal(d.timeoutMs, DEFAULTS.offline.timeoutMs);
	assert.equal(d.fastStart, DEFAULTS.offline.fastStart);
	assert.deepEqual([...d.legacyCaches], DEFAULTS.offline.legacyCaches);
});

/* ---------- Configuration ---------- */

test('site/config.js is read through importScripts; no window leaks', () => {
	const sw = loadSW({ config: CONFIG({ namespace: 'mydesk', languages: ['fr', 'en'], offline: { maxPages: 5, timeoutMs: 900 } }) });
	const c = sw.run('CONFIG');
	assert.equal(c.namespace, 'mydesk');
	assert.deepEqual([...c.languages], ['fr', 'en']);
	assert.equal(c.maxPages, 5);
	assert.equal(c.timeoutMs, 900);
	assert.equal('window' in sw.sandbox, false);
});

test('missing or broken site/config.js falls back to the defaults', () => {
	assert.equal(loadSW({ config: null }).run('CONFIG.namespace'), 'jpkdesk');
	assert.equal(loadSW({ config: 'throw new Error("x")' }).run('CONFIG.namespace'), 'jpkdesk');
	assert.equal(loadSW({ config: 'window.DESKTOP_CONFIG = 42;' }).run('CONFIG.maxPages'), 80);
});

test('cleanConfig validates every value it uses', () => {
	const clean = loadSW().run('cleanConfig');
	const c = clean({
		namespace: 'Bad NS', languages: ['de', 'xx_YY'], defaultLang: 7,
		modules: ['reader', 'Bad', { id: 'mine', src: 'site/modules/mine/index.js' }, { id: 'evil', src: 'https://cdn.example/x.js' }, { id: 'proto', src: '//cdn/x.js' }],
		apps: 'notes', site: { data: 'javascript:alert(1)' }, vault: { dir: 'private/' },
		offline: { maxPages: -1, timeoutMs: 10 }, pwa: { enabled: false }
	});
	assert.equal(c.namespace, 'jpkdesk');
	assert.deepEqual([...c.languages], ['de', 'en']);
	assert.equal(c.defaultLang, 'en');
	assert.deepEqual(JSON.parse(JSON.stringify(c.modules)), ['reader', { id: 'mine', src: 'site/modules/mine/index.js' }]);
	assert.deepEqual([...c.apps], DEFAULTS.apps);
	assert.equal(c.siteData, 'site/apps.js');
	assert.equal(c.vaultDir, 'private/');
	assert.equal(c.maxPages, 80);
	assert.equal(c.timeoutMs, 4000);
	assert.equal(c.enabled, false);
	assert.ok(c.extra.dirs.includes(`${ORIGIN}/desk/site/modules/mine/`));
	assert.ok(c.extra.files.includes(`${ORIGIN}/desk/site/apps.js`));
});

test('cleanConfig: a site app ({ id, src } under apps) is kept with its folder', () => {
	const c = loadSW().run('cleanConfig')({ apps: ['notes', { id: 'hello', src: 'site/modules/hello/index.js' }] });
	assert.ok(c.extra.dirs.includes(`${ORIGIN}/desk/site/modules/hello/`), JSON.stringify(c.extra.dirs));
});

test('install: a site app with its own locales/ is precached from there, for the whole language chain', async () => {
	const app = { id: 'hello', src: 'site/modules/hello/index.js' };
	const config = CONFIG({ languages: ['de-AT'], defaultLang: 'en', modules: [], apps: ['notes', app] });
	const sw = loadSW({ base: '/desk/', serveDisk: true, config });
	await sw.install();
	const cache = await sw.caches.open(sw.run('NAMES.shell'));
	const keys = new Set([...cache.map.keys()].map(k => k.slice(`${ORIGIN}/desk/`.length)));
	for (const code of ['de', 'en']) {
		assert.ok(keys.has(`site/modules/hello/locales/${code}/hello.js`), `precached: site/modules/hello/locales/${code}/hello.js`);
		assert.ok(keys.has(`locales/${code}/notes.js`), `core namespaces stay in locales/: ${code}/notes.js`);
	}
	const fetched = sw.state.fetched.map(u => u.slice(`${ORIGIN}/desk/`.length));
	assert.ok(fetched.includes('site/modules/hello/locales/de-AT/hello.js'), 'every code of the chain is tried');
	assert.ok(!fetched.some(f => /^locales\/[^/]+\/hello\.js$/.test(f)), `no request for a core locales/<code>/hello.js: ${fetched.filter(f => f.endsWith('/hello.js'))}`);
});

test('vault.dir and fortune.dir follow the folder rule of src/core/config.js', () => {
	const clean = loadSW().run('cleanConfig');
	for (const bad of ['site/secret', '../x/', 'site/../vault/', 'site/va ult/', 'site/v?x/', 'https://cdn.example/v/', '//cdn/v/', 'site\\v/', '', 7]) {
		assert.equal(clean({ vault: { dir: bad } }).vaultDir, 'site/vault/', `vault.dir ${JSON.stringify(bad)} → default`);
		assert.equal(clean({ apps: ['fortune'], fortune: { dir: bad } }).fortuneDir, 'site/data/fortunes/', `fortune.dir ${JSON.stringify(bad)} → default`);
	}
	assert.equal(clean({ vault: { dir: '/private/vault/' } }).vaultDir, '/private/vault/');
	/* the page falls back to site/vault/ — so must the worker: the sealed files stay out of every cache */
	const sw = loadSW({ config: CONFIG({ vault: { dir: 'site/secret' } }) });
	assert.equal(sw.run('classify')(req('/desk/site/vault/0123abcd.bin'), sw.run('CONFIG')), null);
	assert.equal(sw.run('isShellUrl')(`${ORIGIN}/desk/site/vault/0123abcd.bin`, sw.run('CONFIG')), false);
});

test('a module or fortune folder at or above the root keeps only its exact files', () => {
	const sub = loadSW({ base: '/desk/', config: CONFIG({
		modules: [{ id: 'demo', src: 'demo.js' }, { id: 'up', src: '../up.js' }, { id: 'side', src: '../plugins/side/index.js' }],
		apps: ['fortune'], fortune: { dir: '/' }, languages: ['de'] }) });
	const cfg = sub.run('CONFIG');
	assert.deepEqual([...cfg.extra.dirs], [`${ORIGIN}/plugins/side/`]);
	for (const f of ['/desk/demo.js', '/up.js', '/de.json', '/en.json']) assert.ok(cfg.extra.files.includes(`${ORIGIN}${f}`), f);
	const kind = r => sub.run('classify')(r, cfg)?.kind ?? null;
	assert.equal(kind(req('/desk/demo.js', { destination: 'script' })), 'asset');
	assert.equal(kind(req('/up.js', { destination: 'script' })), 'asset');
	assert.equal(kind(req('/plugins/side/util.js', { destination: 'script' })), 'asset');
	assert.equal(kind(req('/desk/other.js', { destination: 'script' })), null, 'not the whole installation folder');
	assert.equal(kind(req('/blog/post.css', { destination: 'style' })), null, 'not the whole origin');
	assert.equal(kind(req('/desk/sw.js', { destination: 'script' })), null);
	const root = loadSW({ base: '/', config: CONFIG({ modules: [{ id: 'demo', src: 'demo.js' }] }) });
	const rcfg = root.run('CONFIG');
	assert.deepEqual([...rcfg.extra.dirs], [`${ORIGIN}/site/data/fortunes/`], 'the module at the root adds no folder');
	assert.equal(root.run('classify')(req('/blog/app.js', { destination: 'script' }), rcfg), null);
	assert.equal(root.run('classify')(req('/sw.js', { destination: 'script' }), rcfg), null);
	assert.equal(root.run('classify')(req('/demo.js', { destination: 'script' }), rcfg).kind, 'asset');
});

test('fortune files are precached for the whole language chain', () => {
	const sw = loadSW({ config: CONFIG({ languages: ['fr-CA'], defaultLang: 'de', apps: ['fortune'] }) });
	const roots = sw.run('precacheRoots(CONFIG)');
	for (const code of ['fr-CA', 'fr', 'de', 'en']) assert.ok(roots.includes(`${ORIGIN}/desk/site/data/fortunes/${code}.json`), code);
});

test('feeds only with the notify module, fortunes only with the fortune app', () => {
	const clean = loadSW().run('cleanConfig');
	assert.equal(clean({ modules: ['reader'] }).feeds.length, 0);
	assert.equal(clean({ modules: ['notify'] }).feeds.length, 2);
	assert.equal(clean({ apps: ['notes'] }).fortuneDir, null);
	assert.equal(clean({ apps: ['fortune'] }).fortuneDir, 'site/data/fortunes/');
});

test('cleanConfig: data files are the feeds (also outside the root), the fortune files, site/data/ and site/content/', () => {
	const clean = loadSW({ base: '/desk/' }).run('cleanConfig');
	const c = clean({ languages: ['de', 'en'], notify: { feeds: { de: '/news/feed.json', en: 'site/data/feed.en.json' } } });
	for (const f of ['/news/feed.json', '/desk/site/data/feed.en.json', '/desk/site/data/fortunes/de.json', '/desk/site/data/fortunes/en.json']) {
		assert.ok(c.data.files.includes(`${ORIGIN}${f}`), f);
	}
	assert.deepEqual([...c.data.dirs], [`${ORIGIN}/desk/site/data/`, `${ORIGIN}/desk/site/content/`], 'no fortune folder');
	const noNotify = clean({ modules: ['reader'], notify: { feeds: { de: '/news/feed.json' } } });
	assert.ok(!noNotify.data.files.includes(`${ORIGIN}/news/feed.json`), 'no feed without the notify module');
	const noFortune = clean({ apps: ['notes'] });
	assert.ok(!noFortune.data.files.some(f => f.includes('/fortunes/')), 'no fortune file without the fortune app');
	const site = clean({ languages: ['de', 'en'], fortune: { dir: 'site/' } });
	for (const f of ['/desk/site/de.json', '/desk/site/en.json']) assert.ok(site.data.files.includes(`${ORIGIN}${f}`), f);
	assert.deepEqual([...site.data.dirs], [`${ORIGIN}/desk/site/data/`, `${ORIGIN}/desk/site/content/`], 'fortune.dir site/ adds no folder');
	const root = clean({ languages: ['de', 'en'], fortune: { dir: '/' } });
	for (const f of ['/de.json', '/en.json']) assert.ok(root.data.files.includes(`${ORIGIN}${f}`), f);
});

test('cleanConfig: the code set holds the shell files, site.data, wallpapers and site modules', () => {
	const clean = loadSW({ base: '/desk/' }).run('cleanConfig');
	const c = clean({
		site: { data: 'site/data/apps.js' },
		wallpaper: { images: [{ src: 'site/content/images/bg.webp' }] },
		modules: ['reader', { id: 'demo', src: 'site/content/demos/x/index.js' }]
	});
	for (const f of ['/desk/', '/desk/site/config.js', '/desk/site/theme.css', '/desk/site/data/apps.js', '/desk/site/content/images/bg.webp',
		'/desk/site/content/demos/x/index.js']) {
		assert.ok(c.code.files.includes(`${ORIGIN}${f}`), f);
	}
	assert.deepEqual([...c.code.dirs], [`${ORIGIN}/desk/site/content/demos/x/`]);
	const rootModule = clean({ modules: [{ id: 'demo', src: 'demo.js' }] });
	assert.ok(rootModule.code.files.includes(`${ORIGIN}/desk/demo.js`));
	assert.deepEqual([...rootModule.code.dirs], [], 'a module at the root adds only its file');
});

test('cache names ignore the derived code and data sets', () => {
	const sw = loadSW();
	const cfg = sw.run('CONFIG');
	const names = sw.run('cacheNames');
	assert.equal(names({ ...cfg, code: { files: ['x'], dirs: [] }, data: { files: ['y'], dirs: [] } }).shell, names(cfg).shell);
});

test('fortune.local: false precaches no fortune files — only when the page keeps it', () => {
	const clean = loadSW().run('cleanConfig');
	assert.equal(clean({ apps: ['fortune'], fortune: { local: false, remote: 'example' } }).fortuneDir, null);
	for (const fortune of [{ local: false }, { local: false, remote: null }, { local: false, remote: 'Bad Id' }, { local: false, remote: 7 }]) {
		assert.equal(clean({ apps: ['fortune'], fortune }).fortuneDir, 'site/data/fortunes/', `local:false without remote keeps the folder: ${JSON.stringify(fortune)}`);
	}
	assert.equal(clean({ apps: ['fortune'], fortune: { local: 'no', remote: 'example' } }).fortuneDir, 'site/data/fortunes/');
	assert.equal(clean({ apps: ['fortune'], fortune: { remote: 'example' } }).fortuneDir, 'site/data/fortunes/');
});

test('cache names: <namespace>:<base>:<version>, per installation and config', () => {
	const a = loadSW({ base: '/desk/' });
	const names = a.run('NAMES');
	assert.equal(names.prefix, 'jpkdesk:/desk/:');
	assert.match(names.shell, new RegExp(`^jpkdesk:/desk/:${VERSION.replaceAll('.', '\\.')}-[0-9a-f]{8}$`));
	assert.equal(names.pages, 'jpkdesk:/desk/:pages');
	assert.equal(loadSW({ base: '/' }).run('NAMES.prefix'), 'jpkdesk:/:');
	const b = loadSW({ base: '/desk/', config: CONFIG({ modules: ['reader'] }) });
	assert.notEqual(b.run('NAMES.shell'), names.shell, 'another module list → another precache generation');
	const c = loadSW({ base: '/desk/', config: CONFIG({ offline: { timeoutMs: 1000 } }) });
	assert.equal(c.run('NAMES.shell'), names.shell, 'timeouts do not invalidate the precache');
	const f = loadSW({ base: '/desk/', config: CONFIG({ offline: { fastStart: false } }) });
	assert.notEqual(f.run('NAMES.shell'), names.shell, 'switching fastStart starts from a fresh crawl (network first stores unmarked copies)');
	const mine = CONFIG({ modules: [{ id: 'mine', src: 'plugins/mine/index.js' }] });
	const d1 = loadSW({ base: '/desk/', config: mine }).run('NAMES.shell');
	const d2 = loadSW({ base: '/desk/', config: mine, origin: 'https://other.example:8443' }).run('NAMES.shell');
	assert.equal(d1, d2, 'the same config gives the same name on any origin (or port)');
});

/* ---------- Site icon sets ---------- */

test('sw: iconSets enter the precache roots and the shell cache hash', () => {
	const sets = ['site/icon-sets/a.json', 'site/icon-sets/b.json'];
	const sw = loadSW({ config: CONFIG({ iconSets: sets }) });
	assert.deepEqual([...sw.run('CONFIG.iconSets')], sets);
	const roots = sw.run('precacheRoots(CONFIG)');
	for (const p of sets) assert.ok(roots.includes(`${ORIGIN}/desk/${p}`), p);
	assert.equal(loadSW().run('CONFIG.iconSets').length, 0, 'none by default');
	assert.notEqual(sw.run('NAMES.shell'), loadSW().run('NAMES.shell'), 'another set list → another precache generation');
	assert.equal(sw.run('classify')(req('/desk/site/icon-sets/a.json', { destination: '' }), sw.run('CONFIG')).kind, 'asset');
});

test('sw: invalid iconSets entries are dropped by the same rule as src/core/config.js', () => {
	const clean = loadSW().run('cleanConfig');
	assert.equal(loadSW().run('SET_PATH.source'), SET_PATH.source, 'the inline copy equals src/core/icon-sets.js');
	assert.equal(loadSW().run('MAX_SETS'), MAX_SETS);
	for (const p of GOOD_PATHS) assert.deepEqual([...clean({ iconSets: [p] }).iconSets], [p], p);
	for (const p of BAD_PATHS) {
		assert.deepEqual([...clean({ iconSets: [p] }).iconSets], [], JSON.stringify(p));
		assert.deepEqual([...buildConfig({ iconSets: [p] }).iconSets], [], `config.js: ${JSON.stringify(p)}`);
	}
	const nine = Array.from({ length: 9 }, (_, i) => `site/icon-sets/s${i}.json`);
	const list = ['site/icon-sets/s0.json', '../x.json', ...nine];
	assert.deepEqual([...clean({ iconSets: list }).iconSets], [...buildConfig({ iconSets: list }).iconSets], 'unique, at most 8, in config order');
	assert.deepEqual([...clean({ iconSets: list }).iconSets], nine.slice(0, 8));
	assert.deepEqual([...clean({ iconSets: 'site/icon-sets/x.json' }).iconSets], []);
});

test('sw: a set inside vault.dir is left out', () => {
	const clean = loadSW().run('cleanConfig');
	assert.deepEqual([...clean({ iconSets: ['site/vault/i.json', 'site/icon-sets/a.json'] }).iconSets], ['site/icon-sets/a.json']);
	assert.deepEqual([...clean({ iconSets: ['private/i.json'], vault: { dir: 'private/' } }).iconSets], []);
	assert.deepEqual([...clean({ iconSets: ['private/i.json'], vault: { dir: '/desk/private/' } }).iconSets], []);
	const sw = loadSW({ config: CONFIG({ iconSets: ['site/vault/i.json'] }) });
	assert.ok(!sw.run('precacheRoots(CONFIG)').some(u => u.includes('/vault/')));
});

test('sw: a set outside site/ is an exact shell file', () => {
	const sw = loadSW({ config: CONFIG({ iconSets: ['icon-sets/x.json', 'site/icon-sets/y.json'] }) });
	const cfg = sw.run('CONFIG');
	assert.ok(cfg.extra.files.includes(`${ORIGIN}/desk/icon-sets/x.json`));
	assert.ok(!cfg.extra.files.includes(`${ORIGIN}/desk/site/icon-sets/y.json`), 'site/ is a shell folder already');
	assert.equal(sw.run('classify')(req('/desk/icon-sets/x.json'), cfg).kind, 'asset');
	assert.equal(sw.run('classify')(req('/desk/icon-sets/other.json'), cfg), null, 'only the set itself, not its folder');
});

test('sw: a site icon set is code — also inside a data folder (the config and the manifest name its ids)', () => {
	const sw = loadSW({ config: CONFIG({ iconSets: ['site/data/icons.json', 'site/icon-sets/y.json'] }) });
	const cfg = sw.run('CONFIG');
	for (const p of ['site/data/icons.json', 'site/icon-sets/y.json']) {
		assert.ok(cfg.code.files.includes(`${ORIGIN}/desk/${p}`), p);
		assert.equal(sw.run('isDataUrl')(`${ORIGIN}/desk/${p}`, cfg), false, p);
		assert.equal(sw.run('classify')(req(`/desk/${p}`), cfg).kind, 'asset', p);
	}
	assert.equal(sw.run('classify')(req('/desk/site/data/other.json'), cfg).kind, 'data', 'the rest of site/data/ stays data');
});

/* ---------- Scanning ---------- */

test('the reset group "Offline copies" (src/panels/install.js ownCaches) matches exactly the worker\'s own caches', async () => {
	const { ownCaches } = await import('../src/panels/install.js');
	const sw = loadSW();
	for (const base of ['/desk/', '/', '/a.b+c/']) {
		const own = sw.run('cacheNames')(sw.run('CONFIG'), base).own;
		assert.equal(ownCaches(`${ORIGIN}${base}`).source, own.source, base);
	}
});

test('scanJs finds static, re-exported and dynamic imports, styles, windowStyles and i18n namespaces', () => {
	const scanJs = loadSW().run('scanJs');
	const src = `import Desk from '../../core/api.js';
		import { a, b } from "./util.js";
		export { c } from './more.js';
		import './side-effect.js';
		const lazy = () => import('./lazy.js');
		import x from 'bare-package';
		import y from 'https://cdn.example/y.js';
		export default { id: 'notes', i18n: ['notes', 'kit'], styles: ['notes.css', "extra.css"], windowStyles: ['win.css'] };`;
	const { urls, namespaces } = scanJs(src, `${ORIGIN}/desk/src/apps/notes/index.js`);
	assert.deepEqual([...urls].sort(), [
		`${ORIGIN}/desk/src/apps/notes/extra.css`, `${ORIGIN}/desk/src/apps/notes/lazy.js`, `${ORIGIN}/desk/src/apps/notes/more.js`,
		`${ORIGIN}/desk/src/apps/notes/win.css`,
		`${ORIGIN}/desk/src/apps/notes/notes.css`, `${ORIGIN}/desk/src/apps/notes/side-effect.js`, `${ORIGIN}/desk/src/apps/notes/util.js`,
		`${ORIGIN}/desk/src/core/api.js`
	].sort());
	assert.deepEqual([...namespaces], ['notes', 'kit']);
});

test('scanJs: a descriptor with locales reads its namespaces from that folder (the rule of src/core/modules.js)', () => {
	const scanJs = loadSW().run('scanJs');
	const file = `${ORIGIN}/desk/site/modules/hello/index.js`;
	const own = scanJs(`export default { id: 'hello', i18n: ['hello', 'extra'], locales: 'locales/' };`, file);
	assert.deepEqual([...own.namespaces], []);
	assert.deepEqual(JSON.parse(JSON.stringify(own.sources)), [['hello', `${ORIGIN}/desk/site/modules/hello/locales/`],
		['extra', `${ORIGIN}/desk/site/modules/hello/locales/`]]);
	assert.deepEqual(JSON.parse(JSON.stringify(scanJs(`export default { i18n: ['x'], locales: "texts/own/" };`, file).sources)),
		[['x', `${ORIGIN}/desk/site/modules/hello/texts/own/`]]);
	/* anything else is ignored, as the page does: the namespaces come from the core locales/ */
	for (const bad of ['locales', '../locales/', 'a/../../b/', '/desk/locales/', 'https://cdn.example/l/', '//cdn/l/', 'a\\b/']) {
		const r = scanJs(`export default { i18n: ['hello'], locales: '${bad}' };`, file);
		assert.deepEqual([...r.namespaces], ['hello'], bad);
		assert.deepEqual([...r.sources], [], bad);
	}
});

test('scanCss and scanHtml find local references only', () => {
	const sw = loadSW();
	const css = sw.run('scanCss')(`@import 'a.css'; .x { background: url("../img/b.svg"), url(data:image/png;base64,AA) } .y { mask: url(#m) } .z { background: url(https://cdn/x.png) }`,
		`${ORIGIN}/desk/src/css/base.css`);
	assert.deepEqual([...css.urls], [`${ORIGIN}/desk/src/css/a.css`, `${ORIGIN}/desk/src/img/b.svg`]);
	const html = sw.run('scanHtml')(`<link rel="stylesheet" href="src/css/base.css"><script src="site/config.js"></script>
		<script type="module" src="src/boot/main.js"></script><link rel="preconnect" href="https://cdn.example">`, `${ORIGIN}/desk/`);
	assert.deepEqual([...html.urls], [`${ORIGIN}/desk/src/css/base.css`, `${ORIGIN}/desk/site/config.js`, `${ORIGIN}/desk/src/boot/main.js`]);
});

/* ---------- Routing ---------- */

test('classify: only the desktop index is the shell navigation', () => {
	const sw = loadSW();
	const classify = r => {
		const out = sw.run('classify')(r, sw.run('CONFIG'));
		return out ? { ...out } : null;
	};
	assert.deepEqual(classify(nav('/desk/')), { kind: 'shell-nav', key: `${ORIGIN}/desk/` });
	assert.deepEqual(classify(nav('/desk/index.html?lang=de#x')), { kind: 'shell-nav', key: `${ORIGIN}/desk/` });
	assert.equal(classify(nav('/desk/', 'iframe')).kind, 'nav', 'the desktop inside an iframe is not the shell');
	assert.equal(classify(nav('/desk/demos/game/', 'iframe')).kind, 'nav');
	assert.equal(classify(nav('/desk/site/content/en/about.html')).kind, 'nav');
	assert.equal(classify(req('/desk/', { method: 'POST', mode: 'navigate', destination: 'document' })), null);
});

test('classify: assets, Reader pages, and what is never touched', () => {
	const sw = loadSW();
	const cfg = sw.run('CONFIG');
	const classify = r => {
		const out = sw.run('classify')(r, cfg);
		return out ? { ...out } : null;
	};
	assert.deepEqual(classify(req('/desk/src/core/api.js?v=2', { destination: 'script' })), { kind: 'asset', key: `${ORIGIN}/desk/src/core/api.js` });
	assert.equal(classify(req('/desk/locales/de/core.js', { destination: 'script' })).kind, 'asset');
	assert.equal(classify(req('/desk/manifest.webmanifest', { destination: 'manifest' })).kind, 'asset');
	assert.equal(classify(req('/desk/assets/icons/icon-192.png', { destination: 'image' })).kind, 'asset');
	assert.equal(classify(req('/desk/site/data/feed.en.json', { headers: { Accept: 'application/json' } })).kind, 'data', 'a feed is data');
	assert.deepEqual(classify(req('/desk/site/content/en/about.html?x=1', { headers: { Accept: 'text/html' } })),
		{ kind: 'page', key: `${ORIGIN}/desk/site/content/en/about.html?x=1` });
	assert.equal(classify(req('/blog/post/', { headers: { Accept: 'text/html' } })).kind, 'page', 'same-origin pages outside the folder');
	assert.equal(classify(req('https://api.open-meteo.com/v1/forecast')), null, 'cross-origin');
	assert.equal(classify(req('/desk/site/vault/0123abcd.bin')), null, 'sealed vault files');
	assert.equal(classify(req('/desk/sw.js', { destination: 'script' })), null);
	assert.equal(classify(req('/desk/media/song.mp3', { destination: 'audio' })), null, 'outside the desktop folders');
	assert.equal(classify(req('/other/app.js', { destination: 'script' })), null, 'outside the installation');
	assert.equal(classify(req('/desk/src/x.js', { method: 'HEAD' })), null);
	assert.equal(classify(req('/desk/site/wallpapers/a.webp', { headers: { Range: 'bytes=0-10' } })), null);
	const noPages = sw.run('cleanConfig')({ offline: { maxPages: 0 } });
	assert.equal(sw.run('classify')(req('/desk/site/content/a.html', { headers: { Accept: 'text/html' } }), noPages), null);
});

test('classify at the web root keeps other site folders out', () => {
	const sw = loadSW({ base: '/' });
	const cfg = sw.run('CONFIG');
	const kind = r => sw.run('classify')(r, cfg)?.kind ?? null;
	assert.equal(kind(nav('/')), 'shell-nav');
	assert.equal(kind(nav('/tools/calculator/')), 'nav', 'a page of the site is not the shell');
	assert.equal(kind(req('/src/boot/main.js', { destination: 'script' })), 'asset');
	assert.equal(kind(req('/assets/site.css', { destination: 'style' })), null, 'only assets/icons/ belongs to the desktop');
	assert.equal(kind(req('/tools/calculator/app.js', { destination: 'script' })), null);
});

test('classify: site modules outside src/ are part of the shell', () => {
	const sw = loadSW({ config: CONFIG({ modules: [{ id: 'mine', src: 'plugins/mine/index.js' }] }) });
	const cfg = sw.run('CONFIG');
	assert.equal(sw.run('classify')(req('/desk/plugins/mine/util.js', { destination: 'script' }), cfg).kind, 'asset');
	assert.equal(sw.run('classify')(req('/desk/plugins/other.js', { destination: 'script' }), cfg), null);
});

test("classify: data files are 'data', code stays 'asset'", () => {
	const sw = loadSW({ config: CONFIG({ notify: { feeds: { de: '/news/feed.json', en: 'site/data/feed.en.json' } } }) });
	const cfg = sw.run('CONFIG');
	const kind = (r, c = cfg) => sw.run('classify')(r, c)?.kind ?? null;
	for (const [url, opts] of [
		['/desk/site/data/feed.en.json', { headers: { Accept: 'application/json' } }],
		['/news/feed.json', { headers: { Accept: 'application/json' } }],
		['/desk/site/data/fortunes/de.json', {}],
		['/desk/site/data/mod/x.json', {}],
		['/desk/site/content/en/about.md', { headers: { Accept: 'text/markdown' } }],
		['/desk/site/content/images/a.svg', { destination: 'image' }],
		['/desk/site/content/demos/x/demo.js', { destination: 'script' }]
	]) assert.equal(kind(req(url, opts)), 'data', url);
	for (const url of ['/desk/site/apps.js', '/desk/site/config.js', '/desk/site/theme.css', '/desk/site/modules/hello/index.js',
		'/desk/site/wallpapers/a.webp', '/desk/locales/de/core.js', '/desk/src/core/api.js', '/desk/']) {
		assert.equal(kind(req(url, { destination: 'script' })), 'asset', url);
	}
	assert.equal(kind(req('/desk/site/content/en/about.html', { headers: { Accept: 'text/html' } })), 'page');
	assert.equal(kind(req('/news/other.json')), null, 'a file next to a configured feed is not ours');
	assert.equal(kind(req('/desk/sw.js', { destination: 'script' })), null);
	const vault = sw.run('cleanConfig')({ vault: { dir: 'site/data/vault/' } });
	assert.equal(kind(req('/desk/site/data/vault/x.bin'), vault), null, 'the vault wins over the data folder');
	assert.deepEqual({ ...sw.run('classify')(req('/desk/site/data/feed.en.json?t=1'), cfg) }, { kind: 'data', key: `${ORIGIN}/desk/site/data/feed.en.json` },
		'query dropped');
});

test('classify: code wins over the data folders', () => {
	const sw = loadSW();
	const clean = sw.run('cleanConfig');
	const kind = (c, url) => sw.run('classify')(req(url, { destination: 'script' }), clean(c))?.kind ?? null;
	const siteData = { site: { data: 'site/data/apps.js' } };
	assert.equal(kind(siteData, '/desk/site/data/apps.js'), 'asset', 'site.data inside site/data/');
	assert.equal(kind(siteData, '/desk/site/data/x.json'), 'data');
	const demo = { modules: [{ id: 'demo', src: 'site/content/demos/x/index.js' }] };
	assert.equal(kind(demo, '/desk/site/content/demos/x/index.js'), 'asset');
	assert.equal(kind(demo, '/desk/site/content/demos/x/part.js'), 'asset', 'the module folder is code');
	assert.equal(kind(demo, '/desk/site/content/demos/y/demo.js'), 'data');
	assert.equal(kind({ modules: [{ id: 'm', src: 'site/data/m/index.js' }] }, '/desk/site/data/m/util.js'), 'asset');
	const wall = { wallpaper: { images: [{ src: 'site/content/images/bg.webp' }] } };
	assert.equal(kind(wall, '/desk/site/content/images/bg.webp'), 'asset', 'a wallpaper is code');
	assert.equal(kind(wall, '/desk/site/content/images/other.webp'), 'data');
	const fortuneSite = { fortune: { dir: 'site/' } };
	for (const url of ['/desk/site/config.js', '/desk/site/apps.js', '/desk/site/theme.css', '/desk/site/modules/hello/index.js']) {
		assert.equal(kind(fortuneSite, url), 'asset', `fortune.dir site/: ${url}`);
	}
	assert.equal(kind(fortuneSite, '/desk/site/de.json'), 'data');
	const inModule = { modules: [{ id: 'm', src: 'site/modules/m/index.js' }], fortune: { dir: 'site/modules/m/fortunes/' } };
	assert.equal(kind(inModule, '/desk/site/modules/m/fortunes/de.json'), 'data', 'an exact data file beats the code folder');
	assert.equal(kind(inModule, '/desk/site/modules/m/util.js'), 'asset');
	assert.equal(kind({ notify: { feeds: { en: 'site/theme.css' } } }, '/desk/site/theme.css'), 'asset', 'a feed naming a code file');
	const inData = { modules: ['notify', { id: 'm', src: 'site/data/index.js' }] };
	assert.equal(kind(inData, '/desk/site/data/feed.en.json'), 'data', 'a module directly in site/data/ keeps the feeds data');
	assert.equal(kind(inData, '/desk/site/data/x.json'), 'asset', 'a module directly in site/data/ makes the folder code (a tie: code wins)');
	/* the deeper folder decides: a module file directly in site/ does not make site/data/ and site/content/ code */
	const inSite = { modules: ['notify', { id: 'x', src: 'site/x.js' }] };
	assert.equal(sw.run('cleanConfig')(inSite).code.dirs.includes(`${ORIGIN}/desk/site/`), true);
	for (const url of ['/desk/site/data/feed.en.json', '/desk/site/data/mod/x.json', '/desk/site/content/en/about.md']) {
		assert.equal(kind(inSite, url), 'data', `module in site/: ${url}`);
	}
	for (const url of ['/desk/site/x.js', '/desk/site/helper.js', '/desk/site/theme/bg.webp']) {
		assert.equal(kind(inSite, url), 'asset', `module in site/: ${url}`);
	}
});

test('nav requests are left alone when navigation preload is not supported', () => {
	const sw = loadSW();
	sw.sandbox.registration.navigationPreload = undefined;
	assert.equal(sw.run('classify')(nav('/desk/demos/x/', 'iframe'), sw.run('CONFIG')), null);
});

/* ---------- Install, activate ---------- */

const MINI = {
	'/desk/': '<!doctype html><link rel="stylesheet" href="src/css/base.css"><link rel="manifest" href="manifest.webmanifest"><script src="site/config.js"></script><script type="module" src="src/boot/main.js"></script>',
	'/desk/manifest.webmanifest': '{}',
	'/desk/site/config.js': '',
	'/desk/src/css/base.css': '.a { background: url("../../assets/icons/favicon.svg") }',
	'/desk/assets/icons/favicon.svg': '<svg/>',
	'/desk/src/boot/main.js': "import { x } from '../core/api.js';",
	'/desk/src/core/api.js': "export const x = 1; const later = () => import('./lazy.js');",
	'/desk/src/core/lazy.js': '',
	'/desk/src/wm/index.js': "export default { id: 'wm', i18n: ['wm'], styles: ['wm.css'] };",
	'/desk/src/wm/wm.css': '',
	'/desk/src/shell/index.js': "export default { id: 'shell', i18n: ['shell'] };",
	'/desk/src/panels/index.js': "export default { id: 'panels' };",
	'/desk/src/apps/notes/index.js': "import { m } from './model.js'; export default { id: 'notes', i18n: ['notes'], styles: ['notes.css'] };",
	'/desk/src/apps/notes/model.js': '',
	'/desk/src/apps/notes/notes.css': '',
	'/desk/site/apps.js': 'export default {};',
	'/desk/locales/en/_meta.js': '', '/desk/locales/en/core.js': '', '/desk/locales/en/notes.js': '', '/desk/locales/en/wm.js': '', '/desk/locales/en/shell.js': '',
	'/desk/locales/fr/_meta.js': '', '/desk/locales/fr/core.js': '', '/desk/locales/fr/notes.js': ''
};

test('install crawls from index.html and the module list; missing files never break it', async () => {
	const files = { ...MINI };
	const sw = loadSW({ files, config: CONFIG({ languages: ['fr', 'en'], modules: ['missing'], apps: ['notes'] }) });
	files['/desk/site/config.js'] = CONFIG({ languages: ['fr', 'en'], modules: ['missing'], apps: ['notes'] });
	await sw.install();
	assert.ok(sw.state.skipped, 'skipWaiting');
	const cache = await sw.caches.open(sw.run('NAMES.shell'));
	const keys = [...cache.map.keys()].map(k => k.slice(`${ORIGIN}/desk/`.length)).sort();
	for (const f of ['', 'manifest.webmanifest', 'site/config.js', 'src/css/base.css', 'assets/icons/favicon.svg', 'src/boot/main.js',
		'src/core/api.js', 'src/core/lazy.js', 'src/wm/index.js', 'src/wm/wm.css', 'src/apps/notes/index.js', 'src/apps/notes/model.js',
		'src/apps/notes/notes.css', 'site/apps.js', 'locales/fr/_meta.js', 'locales/fr/core.js', 'locales/fr/notes.js',
		'locales/en/notes.js', 'locales/en/wm.js', 'locales/en/shell.js']) {
		assert.ok(keys.includes(f), `precached: '${f}'`);
	}
	assert.ok(!keys.some(k => k.includes('missing')), 'failed files are not cached');
	assert.ok(!keys.includes('src/modules/missing/index.js'));
	assert.ok(sw.state.fetched.every(u => u.startsWith(ORIGIN)), 'only same-origin requests');
});

test('activate deletes only this installation\'s older caches, claims, enables preload', async () => {
	const sw = loadSW({ files: MINI });
	const names = sw.run('NAMES');
	const gone = ['jpkdesk:/desk/:0.9.0-deadbeef', 'mydesk:/desk/:1.0.0-0badf00d', 'mydesk:/desk/:pages'];
	/* 'jpkdesk-legacy', 'oldsite-pages': without offline.legacyCaches nothing outside the own scheme goes */
	const stay = ['jpkdesk:/other/:1.0.0-x', 'jpkdesk:/other/:pages', 'mydesk:/desk:1', 'mydesk:/desk/sub/:pages', 'jpkdesk-legacy',
		'oldsite-pages', 'someone-else', 'app:/desk/:v2', 'Upper:/desk/:pages', names.pages];
	for (const n of [...gone, ...stay]) await sw.caches.open(n);
	await sw.install();
	await sw.activate();
	const left = await sw.caches.keys();
	for (const n of gone) assert.ok(!left.includes(n), `deleted: ${n} (an earlier namespace of this folder counts too)`);
	for (const n of [...stay, names.shell]) assert.ok(left.includes(n), n);
	assert.ok(sw.state.claimed);
	assert.ok(sw.state.preload);
});

test('pwa.enabled false: no precache, own caches deleted, the worker unregisters itself', async () => {
	const sw = loadSW({ files: MINI, config: CONFIG({ pwa: { enabled: false } }) });
	await sw.caches.open('jpkdesk:/desk/:1.0.0-0123abcd');
	await sw.caches.open('jpkdesk:/desk/:pages');
	await sw.caches.open('olddesk:/desk/:pages');
	await sw.caches.open('jpkdesk:/elsewhere/:pages');
	await sw.install();
	await sw.activate();
	assert.deepEqual(await sw.caches.keys(), ['jpkdesk:/elsewhere/:pages']);
	assert.ok(sw.state.unregistered);
	assert.equal(sw.state.claimed, false);
	assert.equal((await sw.fetchEvent(nav('/desk/'))).handled, false);
});

/* ---------- Strategies ---------- */

test('network first: online answers are stored, offline the copy answers', async () => {
	const sw = loadSW({ files: { ...MINI, '/desk/src/core/api.js': 'v1' }, config: CONFIG({ offline: { fastStart: false } }) });
	const r1 = await sw.fetchEvent(req('/desk/src/core/api.js?cb=1', { destination: 'script' }));
	assert.equal(await r1.response.text(), 'v1');
	assert.ok(sw.state.fetched.length === 1);
	sw.state.online = false;
	const r2 = await sw.fetchEvent(req('/desk/src/core/api.js', { destination: 'script' }));
	assert.equal(await r2.response.text(), 'v1', 'the cached copy, keyed without the query');
	const r3 = await sw.fetchEvent(req('/desk/src/core/never.js', { destination: 'script' }));
	assert.ok(r3.error, 'no copy → the network error goes through');
});

test('the shell navigation keeps one copy and uses the navigation preload answer', async () => {
	const sw = loadSW({ files: MINI });
	const preload = basic('<!doctype html>preloaded', { type: 'text/html' });
	const r1 = await sw.fetchEvent(nav('/desk/?lang=de'), { preload });
	assert.equal(await r1.response.text(), '<!doctype html>preloaded');
	assert.equal(sw.state.fetched.length, 0, 'no second request');
	sw.state.online = false;
	const r2 = await sw.fetchEvent(nav('/desk/index.html'));
	assert.equal(await r2.response.text(), '<!doctype html>preloaded');
});

test('a slow network gives way to the copy after offline.timeoutMs', async () => {
	const sw = loadSW({ files: { ...MINI, '/desk/src/core/api.js': 'fresh' }, config: CONFIG({ offline: { timeoutMs: 500, fastStart: false } }) });
	const cache = await sw.caches.open(sw.run('NAMES.shell'));
	await cache.put(`${ORIGIN}/desk/src/core/api.js`, basic('old'));
	sw.state.delay = 1500;
	const t0 = Date.now();
	const r = await sw.fetchEvent(req('/desk/src/core/api.js', { destination: 'script' }));
	assert.equal(await r.response.text(), 'old');
	assert.ok(Date.now() - t0 >= 1400, 'the late network answer still refreshed the copy (waitUntil)');
	assert.equal(await (await cache.match(`${ORIGIN}/desk/src/core/api.js`)).text(), 'fresh');
});

test('fast start: a copy answers without the network; without a copy the network answers and is kept', async () => {
	const sw = loadSW({ files: { ...MINI, '/desk/src/core/api.js': 'fresh' } });
	assert.equal(sw.run('CONFIG.fastStart'), true, 'the default');
	const cache = await sw.caches.open(sw.run('NAMES.shell'));
	await cache.put(`${ORIGIN}/desk/src/core/api.js`, basic('copy'));
	const r1 = await sw.fetchEvent(req('/desk/src/core/api.js?v=2', { destination: 'script' }));
	assert.equal(await r1.response.text(), 'copy');
	assert.equal(sw.state.fetched.length, 0, 'no request on the way to the first paint');
	const r2 = await sw.fetchEvent(req('/desk/src/wm/wm.css', { destination: 'style' }));
	assert.equal(sw.state.fetched.length, 1);
	assert.equal(await r2.response.text(), '');
	assert.ok(await cache.match(`${ORIGIN}/desk/src/wm/wm.css`), 'kept for the next start');
});

test('fast start: the shell navigation answers from the copy and checks for an update', async () => {
	const sw = loadSW({ files: MINI });
	await sw.install();
	sw.run('lastCheck = Date.now()');   // no check in this test (it waits CHECK_DELAY_MS)
	const fetched = sw.state.fetched.length;
	const r = await sw.fetchEvent(nav('/desk/'), { preload: basic('<!doctype html>new', { type: 'text/html' }) });
	assert.equal(await r.response.text(), MINI['/desk/'], 'the copy, not the preload answer');
	assert.equal(sw.state.fetched.length, fetched);
});

test('update check: unchanged files keep everything as it is; a change prepares a complete copy and tells the pages', async () => {
	const files = { ...MINI };
	const sw = loadSW({ files });
	await sw.install();
	const names = sw.run('NAMES');
	const check = () => sw.run('checkForUpdate')(sw.run('CONFIG'), names);
	assert.equal(await check(), false);
	assert.equal(await sw.caches.has(names.next), false);
	assert.deepEqual(sw.state.messages, []);

	files['/desk/src/core/api.js'] = "export const x = 2; const later = () => import('./lazy.js'); import('./added.js');";
	files['/desk/src/core/added.js'] = 'export {};';
	assert.equal(await check(), true);
	assert.deepEqual(JSON.parse(JSON.stringify(sw.state.messages)), [{ type: 'desk:update' }]);
	const shell = await sw.caches.open(names.shell);
	assert.match(await (await shell.match(`${ORIGIN}/desk/src/core/api.js`)).text(), /x = 1/, 'the running pages keep the old files');

	/* the next start moves it in place before the first file is answered */
	sw.run('lastCheck = Date.now()');
	const r = await sw.fetchEvent(nav('/desk/'));
	assert.ok(r.response);
	assert.match(await (await shell.match(`${ORIGIN}/desk/src/core/api.js`)).text(), /x = 2/);
	assert.ok(await shell.match(`${ORIGIN}/desk/src/core/added.js`), 'a new import came along');
	assert.equal(await shell.match(`${ORIGIN}/desk/sw.js?complete`), undefined, 'the marker stays out of the shell');
	assert.equal(await sw.caches.has(names.next), false);
});

test('update check: offline or an incomplete copy change nothing', async () => {
	const files = { ...MINI };
	const sw = loadSW({ files });
	await sw.install();
	const names = sw.run('NAMES');
	files['/desk/src/core/api.js'] = 'changed';
	sw.state.online = false;
	assert.equal(await sw.run('checkForUpdate')(sw.run('CONFIG'), names), false);
	assert.equal(await sw.caches.has(names.next), false);
	/* a worker stopped halfway left '-next' without its marker: dropped, the shell stays */
	const next = await sw.caches.open(names.next);
	await next.put(`${ORIGIN}/desk/src/core/api.js`, basic('half'));
	assert.equal(await sw.run('applyUpdate')(names), false);
	assert.equal(await sw.caches.has(names.next), false);
	const shell = await sw.caches.open(names.shell);
	assert.match(await (await shell.match(`${ORIGIN}/desk/src/core/api.js`)).text(), /x = 1/);
});

/* ---------- Code and data ---------- */

const FEED = '/desk/site/data/feed.en.json';
const FEED_URL = `${ORIGIN}${FEED}`;
const feedText = async (sw, key = FEED_URL) => (await (await sw.caches.open(sw.run('NAMES.shell'))).match(key))?.text();

test('fast start: a data file comes from the network, the copy is refreshed', async () => {
	const files = { ...MINI, [FEED]: 'v1' };
	const sw = loadSW({ files });
	await sw.install();
	assert.equal(await feedText(sw), 'v1');
	files[FEED] = 'v2';
	const before = sw.state.fetched.length;
	const r = await sw.fetchEvent(req(`${FEED}?t=1`, { headers: { Accept: 'application/json' } }));
	assert.equal(await r.response.text(), 'v2');
	assert.deepEqual(sw.state.fetched.slice(before), [`${FEED_URL}?t=1`], 'asked the network');
	assert.equal(await feedText(sw), 'v2', 'the copy is refreshed (query dropped)');
	const copy = await (await sw.caches.open(sw.run('NAMES.shell'))).match(FEED_URL);
	assert.equal(copy.headers.get('X-Desk-Copy'), null, 'a data copy is no runtime copy (never refreshed by the check)');
});

test('fast start: offline or after offline.timeoutMs a data file answers from the copy', async () => {
	const files = { ...MINI, [FEED]: 'v1' };
	const sw = loadSW({ files, config: CONFIG({ offline: { timeoutMs: 500 } }) });
	await sw.install();
	files[FEED] = 'v2';
	sw.state.online = false;
	assert.equal(await (await sw.fetchEvent(req(FEED))).response.text(), 'v1', 'offline: the copy');
	sw.state.online = true;
	sw.state.delay = 1500;
	const t0 = Date.now();
	const r = await sw.fetchEvent(req(FEED));
	assert.equal(await r.response.text(), 'v1', 'a slow network gives way to the copy');
	assert.ok(Date.now() - t0 >= 1400, 'the late answer was awaited (waitUntil)');
	assert.equal(await feedText(sw), 'v2', 'the late answer still refreshed the copy');
});

test('install keeps data files offline for the first visit', async () => {
	const files = { ...MINI, [FEED]: 'feed', '/desk/site/data/fortunes/de.json': '["de"]', '/desk/site/data/fortunes/en.json': '["en"]' };
	const sw = loadSW({ files });
	await sw.install();
	for (const f of [FEED, '/desk/site/data/fortunes/de.json', '/desk/site/data/fortunes/en.json']) assert.ok(await feedText(sw, `${ORIGIN}${f}`), f);
	sw.state.online = false;
	assert.equal(await (await sw.fetchEvent(req(FEED))).response.text(), 'feed');
});

test('update check: a changed data file is no new version', async () => {
	const ABOUT = '/desk/site/content/en/about.md';
	const FORTUNE = '/desk/site/data/fortunes/en.json';
	const files = { ...MINI, [FEED]: 'v1', [FORTUNE]: '["a"]', [ABOUT]: '# v1' };
	const sw = loadSW({ files });
	await sw.install();
	await sw.fetchEvent(req(ABOUT, { headers: { Accept: 'text/markdown' } }));
	assert.equal(await feedText(sw, `${ORIGIN}${ABOUT}`), '# v1', 'runtime-cached as data');
	Object.assign(files, { [FEED]: 'v2', [FORTUNE]: '["b"]', [ABOUT]: '# v2' });
	const names = sw.run('NAMES');
	const before = sw.state.fetched.length;
	assert.equal(await sw.run('checkForUpdate')(sw.run('CONFIG'), names), false);
	assert.equal(await sw.caches.has(names.next), false);
	assert.deepEqual(sw.state.messages, []);
	const asked = sw.state.fetched.slice(before);
	assert.ok(asked.length > 0, 'the code was compared');
	for (const f of [FEED, FORTUNE, ABOUT]) assert.ok(!asked.includes(`${ORIGIN}${f}`), `not compared: ${f}`);
});

test('update check: a prepared update leaves data out', async () => {
	/* site/theme.css (code) names a data file: the install keeps it, the crawl of '-next' meets it and leaves it out */
	const IMAGE = `${ORIGIN}/desk/site/content/images/a.svg`;
	const files = { ...MINI, [FEED]: 'v1', '/desk/site/data/fortunes/en.json': '["a"]',
		'/desk/site/theme.css': '.b { background: url("content/images/a.svg") }', '/desk/site/content/images/a.svg': '<svg/>' };
	const sw = loadSW({ files });
	await sw.install();
	assert.ok(await feedText(sw, IMAGE), 'the install keeps the data file met on the way');
	files['/desk/src/core/api.js'] = "export const x = 2; const later = () => import('./lazy.js');";
	files[FEED] = 'v2';
	const names = sw.run('NAMES');
	const cfg = sw.run('CONFIG');
	const isData = u => sw.run('isDataUrl')(u, cfg);
	const before = sw.state.fetched.length;
	assert.equal(await sw.run('checkForUpdate')(cfg, names), true);
	const next = await sw.caches.open(names.next);
	assert.ok(next.map.has(`${ORIGIN}/desk/src/core/api.js`));
	assert.ok(next.map.has(`${ORIGIN}/desk/site/theme.css`), 'the code file that names it is part of the update');
	assert.deepEqual([...next.map.keys()].filter(isData), [], '-next holds no data file');
	const asked = sw.state.fetched.slice(before);
	assert.deepEqual(asked.filter(isData), [], 'the crawl requested no data file');
	for (const u of [FEED_URL, IMAGE, `${ORIGIN}/desk/site/data/fortunes/en.json`]) assert.ok(!asked.includes(u), `not requested: ${u}`);
	/* the feed is fetched fresh meanwhile; moving the update in place keeps that copy */
	assert.equal(await (await sw.fetchEvent(req(FEED))).response.text(), 'v2');
	sw.run('lastCheck = Date.now()');
	await sw.fetchEvent(nav('/desk/'));
	assert.equal(await sw.caches.has(names.next), false);
	assert.match(await feedText(sw, `${ORIGIN}/desk/src/core/api.js`), /x = 2/, 'code replaced');
	assert.equal(await feedText(sw), 'v2', 'the feed copy is still the fresh one');
});

test('code inside a data folder stays part of the version', async () => {
	const config = CONFIG({ site: { data: 'site/data/apps.js' } });
	const files = { ...MINI, '/desk/site/config.js': config, '/desk/site/data/apps.js': 'export default {};' };
	const sw = loadSW({ files, config });
	await sw.install();
	assert.ok(await feedText(sw, `${ORIGIN}/desk/site/data/apps.js`), 'precached');
	files['/desk/site/data/apps.js'] = 'export default { apps: [] };';
	const names = sw.run('NAMES');
	assert.equal(await sw.run('checkForUpdate')(sw.run('CONFIG'), names), true);
	assert.ok((await sw.caches.open(names.next)).map.has(`${ORIGIN}/desk/site/data/apps.js`));
	assert.deepEqual(JSON.parse(JSON.stringify(sw.state.messages)), [{ type: 'desk:update' }]);
});

test('site/apps.js is code: changing it is a new version', async () => {
	const files = { ...MINI };
	const sw = loadSW({ files });
	await sw.install();
	files['/desk/site/apps.js'] = 'export default { apps: [] };';
	assert.equal(await sw.run('checkForUpdate')(sw.run('CONFIG'), sw.run('NAMES')), true);
	assert.deepEqual(JSON.parse(JSON.stringify(sw.state.messages)), [{ type: 'desk:update' }]);
});

test('fastStart false: data and code are both network first', async () => {
	const files = { ...MINI, [FEED]: 'v1' };
	const sw = loadSW({ files, config: CONFIG({ offline: { fastStart: false } }) });
	await sw.install();
	files[FEED] = 'v2';
	files['/desk/src/core/api.js'] = 'fresh';
	assert.equal(await (await sw.fetchEvent(req(FEED))).response.text(), 'v2');
	assert.equal(await (await sw.fetchEvent(req('/desk/src/core/api.js', { destination: 'script' }))).response.text(), 'fresh');
});

/* ---------- Runtime copies (files the crawl did not fetch: man/cat texts outside the data folders) ---------- */

const MAN = '/desk/site/manuals/x.md'; /* not under site/content/: data files are network first (U6) */
const MAN_KEY = `${ORIGIN}${MAN}`;
const marked = async (cache, key) => (await cache.match(key))?.headers.get('X-Desk-Copy') ?? null;

/** Installed worker (fast start) that read the manual once at runtime */
async function withRuntimeCopy(extra = {}) {
	const files = { ...MINI, [MAN]: '# v1', ...extra };
	const sw = loadSW({ files });
	await sw.install();
	const names = sw.run('NAMES');
	const r = await sw.fetchEvent(req(MAN, { headers: { Accept: 'text/markdown, text/plain' } }));
	assert.equal(await r.response.text(), '# v1');
	const shell = await sw.caches.open(names.shell);
	const check = () => sw.run('checkForUpdate')(sw.run('CONFIG'), names);
	return { sw, files, names, shell, check };
}

test('fast start: a file fetched at runtime is stored with X-Desk-Copy: runtime; crawled files are not marked', async () => {
	const { sw, shell } = await withRuntimeCopy();
	assert.equal(await marked(shell, MAN_KEY), 'runtime');
	assert.equal(await (await shell.match(MAN_KEY)).text(), '# v1');
	assert.equal(await marked(shell, `${ORIGIN}/desk/src/core/api.js`), null);
	assert.equal(await marked(shell, `${ORIGIN}/desk/`), null);
	/* the next read answers from the copy, without the network */
	const fetched = sw.state.fetched.length;
	assert.equal(await (await sw.fetchEvent(req(MAN))).response.text(), '# v1');
	assert.equal(sw.state.fetched.length, fetched);
	/* network first (fastStart: false) keeps its copies unmarked */
	const nf = loadSW({ files: { ...MINI, [MAN]: '# v1' }, config: CONFIG({ offline: { fastStart: false } }) });
	await nf.fetchEvent(req(MAN));
	assert.equal(await marked(await nf.caches.open(nf.run('NAMES.shell')), MAN_KEY), null);
});

test('fast start: code fetched at runtime (a module the crawl missed) is stored unmarked — no in-place swap', async () => {
	const files = { ...MINI, '/desk/src/apps/late.js': 'export const v = 1;', '/desk/src/css/late.css': 'a{}', [MAN]: '# v1' };
	const sw = loadSW({ files });
	await sw.install();
	const names = sw.run('NAMES');
	const shell = await sw.caches.open(names.shell);
	const key = p => `${ORIGIN}${p}`;
	await shell.delete(key('/desk/src/apps/late.js'));
	await shell.delete(key('/desk/src/css/late.css'));
	await sw.fetchEvent(req('/desk/src/apps/late.js', { destination: 'script' }));
	await sw.fetchEvent(req('/desk/src/css/late.css', { destination: 'style' }));
	await sw.fetchEvent(req(MAN));
	assert.equal(await marked(shell, key('/desk/src/apps/late.js')), null);
	assert.equal(await marked(shell, key('/desk/src/css/late.css')), null);
	assert.equal(await marked(shell, MAN_KEY), 'runtime');
	/* a change of that module goes through the crawl: '-next' and an announcement, the copy stays */
	files['/desk/src/apps/late.js'] = 'export const v = 2;';
	assert.equal(await sw.run('checkForUpdate')(sw.run('CONFIG'), names), true);
	assert.match(await (await shell.match(key('/desk/src/apps/late.js'))).text(), /v = 1/, 'not swapped in place');
});

test('fast start: an exact code file fetched at runtime (a site icon set, a wallpaper) is stored unmarked', async () => {
	const SET = '/desk/site/icon-sets/a.json';
	const WALL = '/desk/site/wallpapers/w.webp';
	const config = CONFIG({ iconSets: ['site/icon-sets/a.json'], wallpaper: { images: [{ src: 'site/wallpapers/w.webp' }] } });
	const files = { ...MINI, '/desk/site/config.js': config, [SET]: '{"format":"jpkcom-desktop-icons/1","icons":{}}', [WALL]: 'img', [MAN]: '# v1' };
	const sw = loadSW({ files, config });
	await sw.install();
	const shell = await sw.caches.open(sw.run('NAMES.shell'));
	for (const p of [SET, WALL]) await shell.delete(`${ORIGIN}${p}`);
	await sw.fetchEvent(req(SET));
	await sw.fetchEvent(req(WALL, { destination: 'image' }));
	await sw.fetchEvent(req(MAN));
	assert.equal(await marked(shell, `${ORIGIN}${SET}`), null, 'icon set: code');
	assert.equal(await marked(shell, `${ORIGIN}${WALL}`), null, 'wallpaper: code');
	assert.equal(await marked(shell, MAN_KEY), 'runtime');
});

test('update check: a changed runtime copy is refreshed in place — no \'-next\', no desk:update, also on the next check', async () => {
	const { sw, files, names, shell, check } = await withRuntimeCopy();
	files[MAN] = '# v2';
	assert.equal(await check(), false, 'no update to announce');
	assert.equal(await sw.caches.has(names.next), false);
	assert.deepEqual(sw.state.messages, []);
	assert.equal(await (await shell.match(MAN_KEY)).text(), '# v2');
	assert.equal(await marked(shell, MAN_KEY), 'runtime', 'still a runtime copy');
	const before = sw.state.fetched.length;
	assert.equal(await check(), false);
	assert.deepEqual(sw.state.messages, []);
	assert.ok(!sw.state.fetched.slice(before).some(u => u.endsWith('/sw.js?complete')));
	assert.equal(await (await sw.fetchEvent(req(MAN))).response.text(), '# v2');
});

test('update check: a runtime copy answered 404 or 410 is deleted; no-store deletes it; 500 and offline keep it', async () => {
	for (const [answer, gone] of [
		[{ body: 'gone', status: 404 }, true],
		[{ body: 'gone', status: 410 }, true],
		[{ body: '# v2', headers: { 'Cache-Control': 'no-store' } }, true],
		[{ body: 'oops', status: 500 }, false]
	]) {
		const { sw, files, shell, check } = await withRuntimeCopy();
		files[MAN] = answer;
		assert.equal(await check(), false);
		assert.equal(!(await shell.match(MAN_KEY)), gone, JSON.stringify(answer));
		assert.deepEqual(sw.state.messages, []);
	}
	const { sw, shell, check } = await withRuntimeCopy();
	sw.state.online = false;
	assert.equal(await check(), false);
	assert.equal(await (await shell.match(MAN_KEY)).text(), '# v1', 'offline: the copy stays');
});

test('update check: a changed crawl file still prepares and announces an update; runtime copies are refreshed in the same check', async () => {
	const { sw, files, names, shell, check } = await withRuntimeCopy();
	files[MAN] = '# v2';
	files['/desk/src/core/api.js'] = "export const x = 2; const later = () => import('./lazy.js');";
	assert.equal(await check(), true);
	assert.deepEqual(JSON.parse(JSON.stringify(sw.state.messages)), [{ type: 'desk:update' }]);
	assert.equal(await (await shell.match(MAN_KEY)).text(), '# v2');
	const next = await sw.caches.open(names.next);
	assert.equal(await next.match(MAN_KEY), undefined, 'the crawl does not know the runtime file');
});

test('applyUpdate: a crawled copy in \'-next\' replaces a marked runtime copy (unmarked afterwards)', async () => {
	const { sw, names, shell } = await withRuntimeCopy();
	const next = await sw.caches.open(names.next);
	await next.put(MAN_KEY, basic('# crawled'));
	await next.put(`${ORIGIN}/desk/sw.js?complete`, basic(''));
	assert.equal(await sw.run('applyUpdate')(names), true);
	assert.equal(await (await shell.match(MAN_KEY)).text(), '# crawled');
	assert.equal(await marked(shell, MAN_KEY), null);
});

test('a new worker that replaces an older generation tells the open pages', async () => {

	const sw = loadSW({ files: MINI });
	await sw.caches.open('jpkdesk:/desk/:0.9.0-deadbeef');
	await sw.install();
	await sw.activate();
	assert.deepEqual(JSON.parse(JSON.stringify(sw.state.messages)), [{ type: 'desk:update' }]);
	const first = loadSW({ files: MINI });
	await first.install();
	await first.activate();
	assert.deepEqual(first.state.messages, [], 'not on the first install');
});

test('Reader pages: at most offline.maxPages, the oldest go first', async () => {
	const files = { '/desk/p/1.html': 'one', '/desk/p/2.html': 'two', '/desk/p/3.html': 'three' };
	const sw = loadSW({ files, config: CONFIG({ offline: { maxPages: 2 } }) });
	const page = n => req(`/desk/p/${n}.html`, { headers: { Accept: 'text/html' } });
	await sw.fetchEvent(page(1));
	await sw.fetchEvent(page(2));
	await sw.fetchEvent(page(1));           // refreshed → newest again
	await sw.fetchEvent(page(3));
	const cache = await sw.caches.open('jpkdesk:/desk/:pages');
	assert.deepEqual([...cache.map.keys()].map(k => k.slice(-6)), ['1.html', '3.html']);
	sw.state.online = false;
	assert.equal(await (await sw.fetchEvent(page(3))).response.text(), 'three');
	const offlineNav = await sw.fetchEvent(nav('/desk/p/1.html', 'iframe'));
	assert.equal(await offlineNav.response.text(), 'one', 'an iframe navigation offline falls back to the Reader copy');
});

test('answers marked no-store or private are passed on but never kept', async () => {
	const files = {
		'/desk/account/panel.html': { body: 'mine', headers: { 'Cache-Control': 'private, max-age=0' } },
		'/desk/p/cart.html': { body: 'cart', headers: { 'Cache-Control': 'no-store' } },
		'/desk/p/ok.html': { body: 'ok', headers: { 'Cache-Control': 'no-cache' } },
		'/desk/src/core/secret.js': { body: 'x', headers: { 'Cache-Control': 'No-Store' } }
	};
	const sw = loadSW({ files });
	const html = url => req(url, { headers: { Accept: 'text/html' } });
	assert.equal(await (await sw.fetchEvent(html('/desk/account/panel.html'))).response.text(), 'mine');
	assert.equal(await (await sw.fetchEvent(html('/desk/p/cart.html'))).response.text(), 'cart');
	await sw.fetchEvent(html('/desk/p/ok.html'));
	await sw.fetchEvent(req('/desk/src/core/secret.js', { destination: 'script' }));
	const pages = await sw.caches.open(sw.run('NAMES.pages'));
	assert.deepEqual([...pages.map.keys()], [`${ORIGIN}/desk/p/ok.html`]);
	const shell = await sw.caches.open(sw.run('NAMES.shell'));
	assert.equal(await shell.match(`${ORIGIN}/desk/src/core/secret.js`), undefined);
	/* the precache skips them as well */
	const sw2 = loadSW({ files: { ...MINI, '/desk/src/core/lazy.js': { body: '', headers: { 'Cache-Control': 'private' } } } });
	await sw2.install();
	const keys = [...(await sw2.caches.open(sw2.run('NAMES.shell'))).map.keys()];
	assert.ok(keys.includes(`${ORIGIN}/desk/src/core/api.js`));
	assert.ok(!keys.includes(`${ORIGIN}/desk/src/core/lazy.js`));
});

test('cross-origin, non-GET and vault requests are never answered by the worker', async () => {
	const sw = loadSW({ files: MINI });
	assert.equal((await sw.fetchEvent(req('https://api.open-meteo.com/v1/forecast?x=1'))).handled, false);
	assert.equal((await sw.fetchEvent(req('/desk/src/core/api.js', { method: 'POST' }))).handled, false);
	assert.equal((await sw.fetchEvent(req('/desk/site/vault/abc.bin'))).handled, false);
	assert.equal(sw.state.fetched.length, 0);
});

/* ---------- The real project ---------- */

test('install against this project: every configured part, its styles and locales are kept offline', async () => {
	const config = readFileSync(resolve(PROJECT, 'site/config.js'), 'utf8');
	const sw = loadSW({ base: '/desk/', serveDisk: true, config });
	await sw.install();
	const cache = await sw.caches.open(sw.run('NAMES.shell'));
	const keys = new Set([...cache.map.keys()].map(k => k.slice(`${ORIGIN}/desk/`.length)));
	const cfg = sw.run('CONFIG');
	const must = ['', 'site/config.js', 'src/boot/main.js', 'src/boot/theme.js', 'src/core/api.js', 'src/core/i18n.js',
		'src/css/tokens.css', 'src/wm/index.js', 'src/shell/index.js', 'src/panels/index.js', 'site/apps.js', 'manifest.webmanifest'];
	for (const id of cfg.modules) if (typeof id === 'string' && existsSync(resolve(PROJECT, `src/modules/${id}/index.js`))) must.push(`src/modules/${id}/index.js`);
	for (const id of cfg.apps) if (typeof id === 'string' && existsSync(resolve(PROJECT, `src/apps/${id}/index.js`))) must.push(`src/apps/${id}/index.js`);
	for (const lang of cfg.languages) must.push(`locales/${lang}/_meta.js`, `locales/${lang}/core.js`);
	for (const f of must) if (existsSync(resolve(PROJECT, f || 'index.html'))) assert.ok(keys.has(f), `precached: '${f}'`);
	if (existsSync(resolve(PROJECT, 'src/wm/wm.css'))) assert.ok(keys.has('src/wm/wm.css'), 'descriptor styles are followed');
	if (existsSync(resolve(PROJECT, 'locales/de/wm.js'))) assert.ok(keys.has('locales/de/wm.js'), 'descriptor i18n namespaces are followed');
	assert.ok(![...keys].some(k => k.startsWith('site/vault/') || k === 'sw.js' || k.startsWith('node_modules/') || k.startsWith('tests/')));
	assert.ok(keys.size > 40, `a real crawl (${keys.size} files)`);
	if (existsSync(resolve(PROJECT, 'site/data/feed.en.json'))) assert.ok(keys.has('site/data/feed.en.json'), 'data stays in the install crawl');
	assert.ok(cfg.data.dirs.includes(`${ORIGIN}/desk/site/data/`));
});

/* ---------- Legacy caches (config.offline.legacyCaches) ---------- */

/* Entries of every kind: valid exact names and prefixes, duplicates, too short or misplaced '*',
   names of this project's scheme, control characters, other types, too long */
const LEGACY_INPUT = ['oldsite-pages', 'oldsite-shell-*', 'oldsite-pages', 'abc*', '*', 'a*b', 'x**', '', 'jpkdesk:/desk/:pages',
	'ns:/:1.0.0-0123abcd-next', 'https://example.org/v1', 'tab\there', 7, null, 'x'.repeat(129)];
const MANY = Array.from({ length: 40 }, (_, i) => `oldsite-${i}`);
const LEGACY_CONFIG = CONFIG({ offline: { legacyCaches: ['oldsite-shell-*', 'oldsite-pages'] } });

/** A setTimeout that records every delay and runs the legacy follow-up (30 s) at once */
function quickTimer() {
	const delays = [];
	const timer = (fn, ms, ...args) => {
		delays.push(ms);
		if (ms === 30000) {
			fn(...args);
			return 0;
		}
		return setTimeout(fn, ms, ...args);
	};
	return { delays, timer };
}

test('cleanConfig: offline.legacyCaches keeps exact names and prefixes, drops the rest', () => {
	const clean = loadSW().run('cleanConfig');
	const legacy = x => [...clean({ offline: { legacyCaches: x } }).legacy];
	assert.deepEqual(legacy(LEGACY_INPUT), ['oldsite-pages', 'oldsite-shell-*', 'https://example.org/v1']);
	assert.deepEqual(legacy('oldsite-pages'), []);
	assert.deepEqual(legacy({}), []);
	assert.deepEqual([...clean({}).legacy], []);
	assert.deepEqual(legacy(MANY), MANY.slice(0, 32));
});

test('offline.legacyCaches: sw.js and src/core/config.js accept the same entries', () => {
	const clean = loadSW().run('cleanConfig');
	const tooMany = Array.from({ length: 33 }, (_, i) => `old-cache-${i}*`);
	for (const x of [LEGACY_INPUT, ...LEGACY_INPUT.map(e => [e]), tooMany, MANY, 'oldsite-pages', {}, null, undefined, 3]) {
		assert.deepEqual([...clean({ offline: { legacyCaches: x } }).legacy], cleanLegacyCaches(x), JSON.stringify(x));
	}
});

test('legacyMatcher: exact names and prefixes, never a name of this project\'s scheme', () => {
	const matcher = loadSW().run('legacyMatcher');
	const exact = matcher(['oldsite-pages']);
	assert.equal(exact('oldsite-pages'), true);
	assert.equal(exact('oldsite-pages2'), false);
	assert.equal(exact('oldsite-page'), false);
	const prefix = matcher(['olds*']);
	for (const n of ['olds', 'oldsite-shell-v4', 'oldsite-pages2']) assert.equal(prefix(n), true, n);
	for (const n of ['olddesk-next:/staging/:pages', 'olds:/x/:1.0.0-0123abcd', 'olds:/:1.0.0-0123abcd-next', 'jpkdesk:/desk/:pages']) {
		assert.equal(exact(n), false, n);
		assert.equal(prefix(n), false, n);
	}
	assert.equal(matcher(['https://example.org/*'])('https://example.org/v1'), true, 'other libraries\' names stay listable');
	assert.equal(prefix(42), false);
	assert.equal(prefix(null), false);
	assert.equal(matcher([])('oldsite-pages'), false);
});

test('SCHEME covers every cache name this worker gives an installation', () => {
	const sw = loadSW();
	const SCHEME = sw.run('SCHEME');
	for (const base of ['/', '/desk/', '/a.b/c d/']) {
		for (const namespace of ['jpkdesk', 'x-1']) {
			const names = sw.run('cacheNames')({ ...sw.run('CONFIG'), namespace }, base);
			for (const k of ['shell', 'next', 'pages']) assert.ok(SCHEME.test(names[k]), `${names[k]}`);
		}
	}
	for (const n of ['oldsite-pages', 'https://example.org/v1', 'ns:/desk/:shell']) assert.equal(SCHEME.test(n), false, n);
});

test('cache names: legacyCaches do not change the shell cache name', () => {
	assert.equal(loadSW({ config: LEGACY_CONFIG }).run('NAMES.shell'), loadSW().run('NAMES.shell'));
	assert.equal(loadSW({ config: CONFIG({ offline: { legacyCaches: ['oldsite-pages'] } }) }).run('NAMES.shell'), loadSW().run('NAMES.shell'));
});

test('activate deletes the caches named in offline.legacyCaches, never one of another installation', async () => {
	const sw = loadSW({ files: MINI, config: LEGACY_CONFIG });
	const names = sw.run('NAMES');
	const gone = ['oldsite-shell-v3', 'oldsite-shell-v4', 'oldsite-pages'];
	const stay = [
		'oldsite-pages-2',                                   // the entry is exact, not a prefix
		'oldsite-shell-x:/staging/:pages', 'oldsite-shell-x:/staging/:1.0.0-0123abcd',   // the prefix matches, the scheme guard protects
		'jpkdesk:/other/:pages', 'workbox-precache-v2', names.pages
	];
	for (const n of [...gone, ...stay]) await sw.caches.open(n);
	await sw.install();
	await sw.activate();
	const left = await sw.caches.keys();
	for (const n of gone) assert.ok(!left.includes(n), `deleted: ${n}`);
	for (const n of [...stay, names.shell]) assert.ok(left.includes(n), `kept: ${n}`);
	assert.deepEqual(sw.state.messages, [], 'a fresh install that only removed legacy caches announces nothing');
});

test('legacy caches: deleted again after the hand-over and at every start', async () => {
	const { delays, timer } = quickTimer();
	const sw = loadSW({ files: MINI, config: LEGACY_CONFIG, timer });
	const FOLLOW_UP = sw.run('LEGACY_FOLLOW_UP_MS');
	assert.equal(FOLLOW_UP, 30000);
	await sw.install();
	await sw.activate();
	sw.run('lastCheck = Date.now()');   // no update check in this test
	await sw.caches.open('oldsite-pages');   // the earlier worker writes late
	const r = await sw.fetchEvent(req('/elsewhere/picture.png', { destination: 'image' }));
	assert.equal(r.handled, false, 'a request the worker leaves alone');
	assert.deepEqual(delays.filter(ms => ms === FOLLOW_UP), [FOLLOW_UP]);
	assert.ok(!(await sw.caches.keys()).includes('oldsite-pages'), 'deleted by the follow-up');
	await sw.caches.open('oldsite-pages');
	await sw.fetchEvent(req('/elsewhere/picture.png', { destination: 'image' }));
	assert.equal(delays.filter(ms => ms === FOLLOW_UP).length, 1, 'one follow-up per activation');
	assert.ok((await sw.caches.keys()).includes('oldsite-pages'));
	const start = await sw.fetchEvent(nav('/desk/'));
	assert.equal(await start.response.text(), MINI['/desk/']);
	assert.ok(!(await sw.caches.keys()).includes('oldsite-pages'), 'deleted at the start (fast start)');

	const slow = loadSW({ files: MINI, config: CONFIG({ offline: { fastStart: false, legacyCaches: ['oldsite-pages'] } }) });
	await slow.caches.open('oldsite-pages');
	await slow.fetchEvent(nav('/desk/'), { preload: basic('<!doctype html>', { type: 'text/html' }) });
	assert.ok(!(await slow.caches.keys()).includes('oldsite-pages'), 'deleted at the start (network first)');

	/* Without the key: no follow-up, and fetch events never look at the cache list */
	const plain = quickTimer();
	const none = loadSW({ files: MINI, timer: plain.timer });
	await none.install();
	await none.activate();
	none.run('lastCheck = Date.now()');
	let listed = 0;
	const keys = none.caches.keys.bind(none.caches);
	none.caches.keys = async () => { listed++; return keys(); };
	await none.caches.open('oldsite-pages');
	await none.fetchEvent(req('/elsewhere/picture.png', { destination: 'image' }));
	await none.fetchEvent(nav('/desk/'));
	await none.fetchEvent(req('/desk/src/core/api.js', { destination: 'script' }));
	assert.equal(plain.delays.includes(FOLLOW_UP), false);
	assert.equal(listed, 0);
	assert.ok((await none.caches.keys()).includes('oldsite-pages'));
});

test('pwa.enabled false: legacy caches are deleted before the worker unregisters, and once more after', async () => {
	const { delays, timer } = quickTimer();
	const sw = loadSW({ files: MINI, config: CONFIG({ pwa: { enabled: false }, offline: { legacyCaches: ['oldsite-pages'] } }), timer });
	await sw.caches.open('oldsite-pages');
	await sw.caches.open('jpkdesk:/desk/:pages');
	await sw.caches.open('someone-else');
	await sw.install();
	await sw.activate();
	assert.deepEqual(await sw.caches.keys(), ['someone-else']);
	assert.ok(sw.state.unregistered);
	await sw.caches.open('oldsite-pages');
	assert.equal((await sw.fetchEvent(nav('/desk/'))).handled, false, 'a switched-off worker answers nothing');
	assert.ok(delays.includes(30000));
	assert.deepEqual(await sw.caches.keys(), ['someone-else'], 'the follow-up still ran');
});

test('legacyMatcher and SCHEME of sw.js and src/core/config.js agree', () => {
	const sw = loadSW();
	assert.equal(sw.run('SCHEME').source, CACHE_SCHEME.source);
	const matcher = sw.run('legacyMatcher');
	const lists = [[], ['oldsite-pages'], ['old*'], ['oldsite-shell-*', 'oldsite-pages'], ['https://example.org/*']];
	const names = ['', 'old', 'oldsite-pages', 'oldsite-pages2', 'oldsite-shell-v4', 'olddesk:/x/:pages', 'old:/:1.0.0-0123abcd-next',
		'old-x:/a b/:2.1.0-89abcdef', 'old:/x/:media', 'OLD-pages', 'https://example.org/v1', 'https://example.org', 'oldü-cache-✓',
		`old${'x'.repeat(200)}`, 'jpkdesk:/desk/:pages', 'jpkdesk:/:1.1.0-0123abcd', 'Old:/x/:pages', 42, null, undefined];
	for (const list of lists) {
		const a = matcher(list);
		const b = legacyMatcher(list);
		for (const n of names) assert.equal(a(n), b(n), `${JSON.stringify(list)} / ${String(n)}`);
	}
	for (const n of names.filter(x => typeof x === 'string')) assert.equal(sw.run('SCHEME').test(n), CACHE_SCHEME.test(n), n);
});
