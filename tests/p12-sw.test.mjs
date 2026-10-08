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
import { DEFAULTS } from '../src/core/config.js';
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
 * base: the installation folder; config: source of site/config.js (null = none).
 */
function loadSW({ base = '/desk/', files = {}, config = null, serveDisk = false, delay = 0, online = true, origin = ORIGIN } = {}) {
	const handlers = {};
	const state = { online, delay, fetched: [], unregistered: false, claimed: false, skipped: false, preload: false };
	const serve = async url => {
		const u = new URL(url);
		if (u.origin !== ORIGIN) throw new TypeError(`cross-origin fetch in test: ${url}`);
		if (Object.hasOwn(files, u.pathname)) {
			const ext = extname(u.pathname) || '.html';
			const entry = files[u.pathname];
			/* an entry is the body, or { body, headers } for extra response headers */
			const [body, headers] = typeof entry === 'object' && entry !== null ? [entry.body, entry.headers] : [entry, {}];
			return basic(body, { type: TYPES[ext] ?? 'application/octet-stream', headers });
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
		URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
		location: { href: `${origin}${base}sw.js` },
		caches: new FakeCaches(),
		registration: {
			navigationPreload: { enable: async () => { state.preload = true; } },
			unregister: async () => { state.unregistered = true; return true; }
		},
		clients: { claim: async () => { state.claimed = true; } },
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
			if (!responded) return { handled: false };
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
	const mine = CONFIG({ modules: [{ id: 'mine', src: 'plugins/mine/index.js' }] });
	const d1 = loadSW({ base: '/desk/', config: mine }).run('NAMES.shell');
	const d2 = loadSW({ base: '/desk/', config: mine, origin: 'https://other.example:8443' }).run('NAMES.shell');
	assert.equal(d1, d2, 'the same config gives the same name on any origin (or port)');
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
	assert.equal(classify(req('/desk/site/data/feed.en.json', { headers: { Accept: 'application/json' } })).kind, 'asset');
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
	const stay = ['jpkdesk:/other/:1.0.0-x', 'jpkdesk:/other/:pages', 'mydesk:/desk:1', 'mydesk:/desk/sub/:pages', 'jpkdesk-legacy',
		'someone-else', 'app:/desk/:v2', 'Upper:/desk/:pages', names.pages];
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
	const sw = loadSW({ files: { ...MINI, '/desk/src/core/api.js': 'v1' } });
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
	const sw = loadSW({ files: { ...MINI, '/desk/src/core/api.js': 'fresh' }, config: CONFIG({ offline: { timeoutMs: 500 } }) });
	const cache = await sw.caches.open(sw.run('NAMES.shell'));
	await cache.put(`${ORIGIN}/desk/src/core/api.js`, basic('old'));
	sw.state.delay = 1500;
	const t0 = Date.now();
	const r = await sw.fetchEvent(req('/desk/src/core/api.js', { destination: 'script' }));
	assert.equal(await r.response.text(), 'old');
	assert.ok(Date.now() - t0 >= 1400, 'the late network answer still refreshed the copy (waitUntil)');
	assert.equal(await (await cache.match(`${ORIGIN}/desk/src/core/api.js`)).text(), 'fresh');
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
});
