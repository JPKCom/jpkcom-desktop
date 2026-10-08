/* JPKCom Desktop — tests: Catalog helpers, P4 window code on demand — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, matches, gridMove, columnsOf, isCatalogOf, pickWebApp, selfRouteHref } from '../src/modules/catalog/util.js';
import { createRegistry } from '../src/core/registry.js';
import { createRouter } from '../src/core/router.js';
import { isSafeUrl } from '../src/core/url.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

test('search folds case and diacritics, every word must occur', () => {
	assert.equal(fold('Ärger Ünd ÉTÉ'), 'arger und ete');
	assert.equal(matches('arger', ['Ärger-Spiel']), true);
	assert.equal(matches('spiel ärg', ['Ärger-Spiel', 'desc']), true);
	assert.equal(matches('spiel xyz', ['Ärger-Spiel']), false);
	assert.equal(matches('example.org', ['Name', null, 'example.org/path']), true);
	assert.equal(matches('  ', ['x']), true);
	assert.equal(matches('i', ['ISTANBUL'], 'tr-TR'), false);
	/* the same folding as Search and the terminal (src/core/text.js) */
	assert.equal(matches('strasse', ['Straße']), true);
	assert.equal(matches('istanbul', ['İstanbul'], 'tr'), true);
});

test('grid movement wraps by columns and mirrors for right-to-left', () => {
	/* 10 items, 4 columns */
	assert.equal(gridMove(0, 'ArrowRight', 10, 4), 1);
	assert.equal(gridMove(9, 'ArrowRight', 10, 4), 9);
	assert.equal(gridMove(0, 'ArrowLeft', 10, 4), 0);
	assert.equal(gridMove(1, 'ArrowDown', 10, 4), 5);
	assert.equal(gridMove(7, 'ArrowDown', 10, 4), 7);
	assert.equal(gridMove(5, 'ArrowUp', 10, 4), 1);
	assert.equal(gridMove(2, 'ArrowUp', 10, 4), 2);
	assert.equal(gridMove(4, 'Home', 10, 4), 0);
	assert.equal(gridMove(4, 'End', 10, 4), 9);
	assert.equal(gridMove(0, 'PageDown', 10, 2), 6);
	assert.equal(gridMove(3, 'ArrowRight', 10, 4, true), 2);
	assert.equal(gridMove(3, 'ArrowLeft', 10, 4, true), 4);
	assert.equal(gridMove(3, 'Enter', 10, 4), null);
	assert.equal(gridMove(0, 'ArrowRight', 0, 4), null);
});

test('columns from the first row', () => {
	assert.equal(columnsOf([10, 10, 10, 120, 120]), 3);
	assert.equal(columnsOf([10, 11, 120]), 2);
	assert.equal(columnsOf([5]), 1);
	assert.equal(columnsOf([]), 1);
});

test('URLs from data', () => {
	assert.equal(isSafeUrl('docs/tools/x/'), true);
	assert.equal(isSafeUrl('/abs/'), true);
	assert.equal(isSafeUrl('https://example.org/'), true);
	assert.equal(isSafeUrl('javascript:alert(1)'), false);
	assert.equal(isSafeUrl('data:text/html,x'), false);
	assert.equal(isSafeUrl('//evil.example/'), false);
	assert.equal(isSafeUrl(' x'), false);
	assert.equal(isSafeUrl(''), false);
	assert.equal(isSafeUrl(42), false);
	/* the shared rule (core/url.js): parser tricks the old local copy let through */
	assert.equal(isSafeUrl('java\tscript:alert(1)'), false);
	assert.equal(isSafeUrl('/\t/evil.example/x'), false);
});

/* ---------- The web button (webApp, webUrl) ---------- */

function webSetup({ collections, apps = [], routes = [] }) {
	const reg = createRegistry({ warn: () => {} });
	reg.load({ apps, collections });
	const origin = 'https://desk.example';
	const root = `${origin}/desktop/`;
	const router = createRouter({ registry: reg, site: { hosts: ['www.desk.example'], routes }, origin, root });
	return { reg, router, root, get: id => reg.get(id) };
}

test('web button: a Catalog of the same collection, also through an alias or a second Catalog app', () => {
	const { get } = webSetup({
		collections: [{ id: 'tools', name: 'Tools', basePath: 'tools/', items: [] }, { id: 'other', name: 'Other', items: [] }],
		apps: [
			{ id: 'browse', kind: 'collection', collection: 'tools', name: 'Browse' },
			{ id: 'tools-alias', alias: 'tools', name: 'Alias' },
			{ id: 'tools-web', kind: 'web', name: 'Web', hidden: true, url: 'tools/' }
		]
	});
	for (const id of ['tools', 'browse', 'tools-alias']) assert.equal(isCatalogOf(id, 'tools', get), true, id);
	for (const id of ['other', 'tools-web', 'nope', 42]) assert.equal(isCatalogOf(id, 'tools', get), false, String(id));
	assert.equal(isCatalogOf('other', 'other', get), true);
});

test('web button: webApp before the Catalog app\'s, unavailable and own Catalogs skipped', () => {
	assert.equal(pickWebApp(['a', 'b'], { available: () => true }), 'a');
	assert.equal(pickWebApp([null, 'b'], { available: () => true }), 'b');
	assert.equal(pickWebApp(['a', 'b'], { available: id => id === 'b' }), 'b');
	assert.equal(pickWebApp(['browse', 'b'], { available: () => true, isSelf: id => id === 'browse' }), 'b');
	assert.equal(pickWebApp([42, '', {}, 'c'], { available: () => true }), 'c');
	assert.equal(pickWebApp(['a', 'b'], { available: () => false }), null);
	assert.equal(pickWebApp(['a']), null, 'nothing is available by default');
	assert.equal(pickWebApp([undefined, undefined], { available: () => true }), null);
});

test('web button: which webUrl leads back to the Catalog (part B)', () => {
	const { router, root, get } = webSetup({
		collections: [
			{ id: 'tools', name: 'Tools', basePath: 'tools/', items: [] },
			{ id: 'moved', name: 'Moved', basePath: 'moved/', items: [] },
			{ id: 'other', name: 'Other', items: [] }
		],
		apps: [
			{ id: 'tools-web', kind: 'web', name: 'Web', hidden: true, url: 'tools/' },
			{ id: 'browse', kind: 'collection', collection: 'tools', name: 'Browse' }
		],
		routes: [{ match: '^/desktop/moved/?$', app: 'tools-web' }]
	});
	const href = 'https://desk.example/desktop/tools/';
	assert.equal(selfRouteHref(router, 'tools/', root, 'tools', get), href);
	assert.equal(selfRouteHref(router, 'tools', root, 'tools', get), 'https://desk.example/desktop/tools');
	assert.equal(selfRouteHref(router, 'tools/index.html', root, 'tools', get), null, 'routes to a page');
	assert.equal(selfRouteHref(router, 'moved/', root, 'moved', get), null, 'a site route sends it elsewhere');
	assert.equal(selfRouteHref(router, 'https://example.org/tools/', root, 'tools', get), null, 'external');
	assert.equal(selfRouteHref(router, 'https://www.desk.example/desktop/tools/', root, 'tools', get), href, 'site.hosts are this origin');
	/* the browse window shows collection tools too: self is decided by the collection, not by the window's app */
	assert.equal(selfRouteHref(router, 'tools/', root, 'tools', get), href);
	assert.equal(selfRouteHref(router, 'tools/', root, 'other', get), null);
	assert.equal(selfRouteHref(router, 'mailto:x@y', root, 'tools', get), null);

	/* a route to an alias of a Catalog of the same collection counts */
	const second = webSetup({
		collections: [{ id: 'tools', name: 'Tools', basePath: 'tools/', app: 'browse', items: [] }],
		apps: [{ id: 'browse-alias', alias: 'browse', name: 'Old tools' }],
		routes: [{ match: '^/desktop/old-tools/?$', app: 'browse-alias' }]
	});
	assert.equal(selfRouteHref(second.router, 'old-tools/', second.root, 'tools', second.get), 'https://desk.example/desktop/old-tools/');
	assert.equal(selfRouteHref(second.router, 'tools/', second.root, 'tools', second.get), 'https://desk.example/desktop/tools/');
});

/* The window code of the P4 kinds (§19.3 load) stays out of the boot: the descriptor reaches
   kind.js through a literal dynamic import only, never through a static import chain of its folder */
test('P4 descriptors load their window code on demand (kind.js), never statically', () => {
	const staticImports = file => [...readFileSync(file, 'utf8').matchAll(/^\s*import\s[^;]*?from\s+'(\.[^']+)'/gm)]
		.map(m => join(dirname(file), m[1]));
	const lazy = { reader: ['kind.js', 'extract.js', 'sanitize.js'], viewer: ['kind.js'], catalog: ['kind.js'] };
	for (const [mod, files] of Object.entries(lazy)) {
		const dir = `src/modules/${mod}`;
		const seen = new Set();
		const walk = file => {
			if (seen.has(file) || !file.startsWith(dir + '/')) return;
			seen.add(file);
			for (const f of staticImports(file)) walk(f);
		};
		walk(`${dir}/index.js`);
		for (const f of files) assert.equal(seen.has(`${dir}/${f}`), false, `${mod}: ${f} is imported statically by the descriptor`);
		assert.match(readFileSync(`${dir}/index.js`, 'utf8'), /load: \(\) => import\('\.\/kind\.js'\)/, `${mod}: literal import('./kind.js')`);
	}
});

test('reader: acceptUrl stays in the descriptor (asked before any window exists)', async () => {
	const kinds = {};
	const { default: reader } = await import('../src/modules/reader/index.js');
	reader.setup({
		modules: { config: () => null }, config: { reader: {} }, env: { root: 'http://localhost/' },
		wm: { defineKind: (k, def) => { kinds[k] = def; } }, provide: () => {}
	});
	assert.deepEqual(Object.keys(kinds), ['page']);
	assert.equal(typeof kinds.page.acceptUrl, 'function');
	assert.equal(typeof kinds.page.load, 'function');
	assert.equal(kinds.page.mount, undefined, 'mount comes with kind.js');
});
