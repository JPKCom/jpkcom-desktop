/* JPKCom Desktop — tests: Catalog helpers, P4 window code on demand — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, matches, gridMove, columnsOf } from '../src/modules/catalog/util.js';
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
