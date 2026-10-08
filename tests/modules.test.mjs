/* JPKCom Desktop — tests: module loader (hooks, withdrawal after a failed setup) and site overrides — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { i18n } from '../src/core/i18n.js';
import { modules, HOOKS, localesDir, hooksOf } from '../src/core/modules.js';
import { registry, createRegistry } from '../src/core/registry.js';
import { consent } from '../src/core/consent.js';
import { storage } from '../src/core/storage-registry.js';
import { on } from '../src/core/bus.js';

/* A descriptor as an ES module behind a data: URL — the loader imports it like any file */
const ref = (id, src) => ({ id, src: `data:text/javascript,${encodeURIComponent(src)}` });
const quiet = async fn => {
	const { warn, error, info } = console;
	console.warn = console.error = console.info = () => {};
	try {
		return await fn();
	} finally {
		Object.assign(console, { warn, error, info });
	}
};

/* A site module as real files (a data: URL has no folder for locales/) → { ref, dir } */
function siteModule(id, files) {
	const dir = mkdtempSync(join(tmpdir(), 'jpkdesk-mod-'));
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, rel)), { recursive: true });
		writeFileSync(join(dir, rel), text);
	}
	return { ref: { id, src: pathToFileURL(join(dir, 'index.js')).href }, dir };
}

/* Runs fn and returns what it printed with console.warn */
async function warnings(fn) {
	const out = [];
	const { warn, error, info } = console;
	console.warn = (...a) => out.push(a.join(' '));
	console.error = console.info = () => {};
	try {
		await fn();
	} finally {
		Object.assign(console, { warn, error, info });
	}
	return out;
}

test('modules: window hooks of a panel (render, reopen, acceptUrl, …) go to the implementation', async () => {
	for (const k of ['render', 'reopen', 'acceptUrl', 'reload', 'popOut', 'canPopOut', 'canLink']) assert.ok(HOOKS.includes(k), k);
	await modules.loadAll([{ kind: 'module', refs: [ref('panel-x', `export default {
		id: 'panel-x',
		apps: [{ id: 'panel-x', kind: 'native', name: 'Panel', render: () => null, reopen() {} }]
	}`)] }], {});
	const impl = registry.impl('panel-x');
	assert.equal(typeof impl?.render, 'function');
	assert.equal(typeof impl?.reopen, 'function');
	assert.equal(registry.get('panel-x').render, undefined, 'hooks are not manifest fields');
	assert.equal(registry.available('panel-x'), true);
});

test('modules: load() keeps window code out of the boot; loadImpl() joins it with the direct hooks', async () => {
	const win = 'export default { mount() {}, menu: () => ["m"], acceptUrl: () => "loaded", title: "not a hook" };';
	await modules.loadAll([{ kind: 'module', refs: [ref('lazy-x', `export default {
		id: 'lazy-x',
		app: { kind: 'app', name: 'Lazy', load: () => import("data:text/javascript,${encodeURIComponent(win)}") },
		acceptUrl: () => 'direct'
	}`)] }], {});
	assert.equal(registry.get('lazy-x').load, undefined, 'load is not a manifest field');
	assert.equal(registry.available('lazy-x'), true, 'an app with load() can open');
	assert.equal(registry.implReady('lazy-x'), false);
	assert.equal(registry.impl('lazy-x').acceptUrl(), 'direct', 'direct hooks are there at once');
	assert.equal(registry.impl('lazy-x').mount, undefined);
	const [a, b] = await Promise.all([registry.loadImpl('lazy-x'), registry.loadImpl('lazy-x')]);
	assert.equal(a, b, 'loaded once');
	assert.equal(registry.implReady('lazy-x'), true);
	assert.equal(typeof a.mount, 'function');
	assert.deepEqual(a.menu(), ['m']);
	assert.equal(a.acceptUrl(), 'direct', 'a direct hook wins over a loaded one');
	assert.equal(a.title, undefined, 'only hooks are taken');
	assert.equal(registry.impl('lazy-x'), a);
});

test('modules: hooksOf() takes a default export or an object and needs mount() or render()', () => {
	const mount = () => {};
	assert.equal(hooksOf({ default: { mount } }, 'x').mount, mount);
	assert.equal(hooksOf({ mount, extra: 1 }, 'x').extra, undefined);
	assert.equal(typeof hooksOf({ render: () => null }, 'x').render, 'function');
	assert.throws(() => hooksOf({ default: { menu() {} } }, 'x'), /no mount\(\) or render\(\)/);
	assert.throws(() => hooksOf(null, 'x'));
});

test('registry: a failed load() is reported and tried again; a removed app drops its loader', async () => {
	const reg = createRegistry({ warn: () => {} });
	let calls = 0;
	reg.register({ id: 'flaky', kind: 'app', name: 'Flaky' }, {
		source: 'module', module: 'flaky',
		load: () => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ mount() {} }))
	});
	await assert.rejects(reg.loadImpl('flaky'), /offline/);
	assert.equal(reg.implReady('flaky'), false);
	assert.equal(typeof (await reg.loadImpl('flaky')).mount, 'function');
	assert.equal(calls, 2);
	reg.register({ id: 'gone', kind: 'app', name: 'Gone' }, { source: 'module', module: 'gone', load: () => ({ mount() {} }) });
	reg.removeModule('gone');
	assert.equal(reg.available('gone'), false);
	assert.equal(await reg.loadImpl('gone'), null);
});

test('modules: a failing setup() withdraws apps, contributions, consent services and storage', async () => {
	const failed = [];
	const stop = on('module:failed', e => failed.push(e.id));
	await quiet(() => modules.loadAll([{ kind: 'module', refs: [ref('broken', `export default {
		id: 'broken',
		app: { kind: 'app', name: 'Broken' },
		mount() {},
		storage: { 'broken-data': { type: 'json' } },
		resetGroups: [{ id: 'broken', label: 'Broken' }],
		trash: { 'broken-item': { restore: () => true } },
		consent: [{ id: 'broken-api', hosts: 'api.example.org' }],
		shortcuts: [{ id: 'broken-key', key: 'Mod+B' }],
		setup() { throw new Error('boom'); }
	}`)] }], {}));
	stop();
	assert.deepEqual(failed, ['broken']);
	assert.equal(registry.has('broken'), false);
	assert.equal(modules.contributions('shortcuts').some(c => c.module === 'broken'), false);
	assert.equal(consent.get('broken-api'), null);
	assert.equal(storage.key('broken-data'), null);
	assert.equal(storage.trashType('broken-item'), null);
	assert.equal(modules.isLoaded('broken'), false);
	assert.equal(modules.failed().get('broken'), 'boom');
});

test('modules: a failing setup() also withdraws the services it provided and the listeners it added', async () => {
	const { services } = await import('../src/core/services.js');
	const { emit, once } = await import('../src/core/bus.js');
	const { track } = await import('../src/core/undo.js');
	const removed = [];
	const stopRemoved = on('service:remove', e => removed.push(e.name));
	globalThis.__jpkHits = 0;
	globalThis.__jpkUndo = [];
	globalThis.__jpkTrack = track;
	await quiet(() => modules.loadAll([{ kind: 'module', refs: [
		ref('half-set-up', `export default {
			id: 'half-set-up',
			calendar: [{ id: 'half-cal' }],
			async setup(desk) {
				desk.provide('half-svc', { hello: () => 'hi' });
				desk.on('half:ping', () => { globalThis.__jpkHits++; });
				desk.once('half:once', () => { globalThis.__jpkHits += 100; });
				await Promise.resolve();
				globalThis.__jpkTrack(() => globalThis.__jpkUndo.push('kind'));
				throw new Error('half');
			}
		}`),
		ref('fine-after', `export default {
			id: 'fine-after',
			setup(desk) {
				desk.provide('fine-svc', {});
				desk.on('half:ping', () => { globalThis.__jpkHits += 10; });
			}
		}`)
	] }], { provide: services.provide, on, once }));
	stopRemoved();
	assert.equal(services.has('half-svc'), false, 'the service is gone');
	assert.deepEqual(removed, ['half-svc']);
	assert.deepEqual(globalThis.__jpkUndo, ['kind'], 'other parts\' undo functions run too');
	emit('half:ping', {});
	emit('half:once', {});
	assert.equal(globalThis.__jpkHits, 10, 'only the module that loaded still listens');
	assert.equal(services.has('fine-svc'), true, 'a successful setup keeps what it registered');
	assert.equal(modules.contributions('calendar').some(c => c.module === 'half-set-up'), false);
	delete globalThis.__jpkHits;
	delete globalThis.__jpkUndo;
	delete globalThis.__jpkTrack;
});

test('modules: a failing setup() also withdraws the window kinds it defined', async () => {
	const { defineKind, hasKind } = await import('../src/wm/wm.js');
	const events = [];
	const stop = on('wm:kind', e => events.push({ ...e }));
	await quiet(() => modules.loadAll([{ kind: 'module', refs: [
		ref('kind-broken', `export default {
			id: 'kind-broken',
			setup(desk) {
				desk.wm.defineKind('kind-broken-x', { mount() {} });
				throw new Error('kind');
			}
		}`),
		ref('kind-fine', `export default {
			id: 'kind-fine',
			setup(desk) { desk.wm.defineKind('kind-fine-x', { mount() {} }); }
		}`)
	] }], { wm: { defineKind } }));
	stop();
	assert.equal(hasKind('kind-broken-x'), false, 'the failed module\'s kind is gone');
	assert.equal(hasKind('kind-fine-x'), true, 'a successful setup keeps its kind');
	assert.deepEqual(events.filter(e => e.kind === 'kind-broken-x'),
		[{ kind: 'kind-broken-x' }, { kind: 'kind-broken-x', removed: true }]);
	assert.equal(defineKind('kind-broken-x', { mount() {} }), true, 'the name is free again');
	assert.equal(defineKind('web', { mount() {} }), false, 'built-in kinds are untouched');
});

test('services: remove() only takes the given provider away', async () => {
	const { provide, remove, has } = await import('../src/core/services.js');
	const impl = {};
	provide('removable-svc', impl);
	assert.equal(remove('removable-svc', {}), false, 'another object is not the provider');
	assert.equal(has('removable-svc'), true);
	assert.equal(remove('removable-svc', impl), true);
	assert.equal(has('removable-svc'), false);
	assert.equal(remove('removable-svc'), false);
});

test('registry: a site entry without kind only changes the app a module brings', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.load({ apps: [{ id: 'notes', dock: true, name: 'My notes' }, { id: 'nobody', desktop: true }] });
	assert.equal(reg.has('notes'), false, 'an override is no app of its own');
	assert.deepEqual(reg.pendingOverrides().sort(), ['nobody', 'notes']);
	reg.register({ id: 'notes', kind: 'app', name: 'Notes', icon: 'ti-notes' }, { source: 'module', module: 'notes', impl: { mount() {} } });
	const notes = reg.get('notes');
	assert.equal(notes.dock, true);
	assert.equal(notes.name, 'My notes');
	assert.equal(notes.icon, 'ti-notes');
	assert.equal(notes.module, 'notes');
	assert.equal(typeof reg.impl('notes').mount, 'function');
	assert.deepEqual(reg.pendingOverrides(), ['nobody']);
	/* an app that goes and comes back gets the fields again */
	reg.unregister('notes');
	reg.register({ id: 'notes', kind: 'app', name: 'Notes' }, { source: 'module', module: 'notes', impl: { mount() {} } });
	assert.equal(reg.get('notes').dock, true);
	/* an override after the app exists applies at once */
	reg.load({ apps: [{ id: 'notes', desktop: true }] });
	assert.equal(reg.get('notes').desktop, true);
	assert.deepEqual(warnings, []);
});

test('registry: the kind check hides apps nobody can open', () => {
	const reg = createRegistry({ warn: () => {} });
	reg.load({ apps: [
		{ id: 'about', kind: 'page', name: 'About', url: 'site/content/en/about.html' },
		{ id: 'demo', kind: 'web', name: 'Demo', url: 'demo/' },
		{ id: 'site', kind: 'link', name: 'Site', url: 'https://example.org/' }
	] });
	assert.equal(reg.available('about'), true, 'without a check every declared kind counts');
	reg.setKindCheck(kind => kind === 'link' || kind === 'web');
	assert.equal(reg.available('about'), false);
	assert.equal(reg.available('demo'), true);
	assert.equal(reg.available('site'), true);
	assert.deepEqual(reg.list().map(a => a.id), ['demo', 'site']);
	assert.deepEqual(reg.list({ unavailable: true }).map(a => a.id), ['about', 'demo', 'site']);
});

test('localesDir(): only a relative folder inside the module folder, ending in /', () => {
	const url = 'https://x.test/site/modules/hello/index.js';
	assert.equal(localesDir('locales/', url), 'https://x.test/site/modules/hello/locales/');
	assert.equal(localesDir('./lang/', url), 'https://x.test/site/modules/hello/lang/');
	assert.equal(localesDir('a/../locales/', url), 'https://x.test/site/modules/hello/locales/', '.. inside the folder is fine');
	for (const bad of ['locales', '/locales/', '//cdn.test/l/', 'https://x.test/l/', 'data:x/', '../locales/',
		'a/../../x/', 'lo\\c/', 'lo\u0000c/', 'lo\u007fc/', '', 7, null, undefined]) {
		assert.equal(localesDir(bad, url), null, JSON.stringify(bad));
	}
	assert.equal(localesDir('locales/', 'data:text/javascript,x'), null, 'a data: module has no folder');
});

test('modules: a site module brings its strings in its own locales folder', async () => {
	const { ref } = siteModule('site-hello-t', {
		'index.js': "export default { id: 'site-hello-t', kind: 'app', i18n: ['site-hello-t'], locales: 'locales/' };",
		'locales/en/site-hello-t.js': "export default { hi: 'Hi {name}', n: { one: '{n} time', other: '{n} times' } };"
	});
	await modules.loadAll([{ kind: 'app', refs: [ref] }], {});
	assert.equal(modules.isLoaded('site-hello-t'), true);
	assert.equal(i18n.t('site-hello-t.hi', { name: 'Alex' }), 'Hi Alex');
	assert.equal(i18n.t('site-hello-t.n', { n: 2 }), '2 times');
	assert.equal(modules.get('site-hello-t').locales.endsWith('/locales/'), true, 'stored as an absolute URL');
});

test('modules: a namespace another module already uses is not redirected', async () => {
	const thief = siteModule('ns-thief', {
		'index.js': "export default { id: 'ns-thief', i18n: ['ns-shared'], locales: 'locales/' };",
		'locales/en/ns-shared.js': "export default { x: 'stolen' };"
	});
	const out = await warnings(() => modules.loadAll([{ kind: 'module', refs: [
		ref('ns-owner', "export default { id: 'ns-owner', i18n: ['ns-shared'] };"),
		thief.ref
	] }], {}));
	assert.ok(out.some(w => w.includes("'ns-thief'") && w.includes("'ns-shared'") && w.includes("'ns-owner'")), out.join('\n'));
	assert.equal(i18n.t('ns-shared.x'), 'ns-shared.x', 'the strings are not read from the thief');
	assert.equal(modules.isLoaded('ns-thief'), true, 'the module itself still loads');
});

test('modules: an invalid locales value is reported and ignored, the module loads', async () => {
	const { ref } = siteModule('bad-locales', {
		'index.js': "export default { id: 'bad-locales', i18n: ['bad-locales'], locales: '../../escape/' };"
	});
	const out = await warnings(() => modules.loadAll([{ kind: 'module', refs: [ref] }], {}));
	assert.ok(out.some(w => w.includes("'bad-locales'") && w.includes('locales')), out.join('\n'));
	assert.equal(modules.isLoaded('bad-locales'), true);
	assert.equal(modules.get('bad-locales').locales, undefined);
});

test('modules: a locales value JSON cannot write (BigInt, circular) is reported too, the module loads', async () => {
	const out = await warnings(() => modules.loadAll([{ kind: 'module', refs: [
		ref('big-locales', "export default { id: 'big-locales', locales: 1n };"),
		ref('loop-locales', "const o = {}; o.o = o; export default { id: 'loop-locales', locales: o };")
	] }], {}));
	for (const id of ['big-locales', 'loop-locales']) {
		assert.ok(out.some(w => w.includes(`'${id}'`) && w.includes('locales')), out.join('\n'));
		assert.equal(modules.isLoaded(id), true, id);
		assert.equal(modules.get(id).locales, undefined, id);
	}
	assert.ok(out.some(w => w.includes('bigint')), 'the type names the value');
});
