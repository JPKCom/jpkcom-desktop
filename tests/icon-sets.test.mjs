/* JPKCom Desktop — tests: icon data rules — allowlist, site icon set format and paths — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	cleanIconSet, cleanIconDef, safeAttrs, safeElement, safeViewBox, isSetPath, iconPrefix,
	SET_FORMAT, SET_PATH, MAX_SET_ICONS, ICON_TAGS, ICON_ATTRS, RESERVED_ICON_PREFIXES
} from '../src/core/icon-sets.js';
import tabler from '../src/icons/tabler.js';
import { GOOD_PATHS, BAD_PATHS } from './set-paths.mjs';
import { symbols as custom } from '../src/icons/custom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const set = icons => ({ format: SET_FORMAT, name: 'Test', license: 'MIT', icons });

test('icon sets: a valid set is cleaned to its icons (k o/f/d, vb, a, e, e2)', () => {
	const r = cleanIconSet(set({
		'acme-rocket': { k: 'd', vb: '0 0 512 512', e: ['M0 0h10v10z'], e2: ['M5 5h10v10z'] },
		'acme-logo': { k: 'f', vb: '0 0 448 512', e: ['M1 1h2'] },
		'acme-line': { vb: '0 0 512 512', a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 32 }, e: [['circle', { cx: 256, cy: 256, r: 200 }]] },
		'acme-plain': { e: ['M1 1h2'] }
	}));
	assert.equal(r.fatal, null);
	assert.deepEqual(r.problems, []);
	assert.equal(r.name, 'Test');
	assert.equal(r.license, 'MIT');
	assert.deepEqual(r.icons['acme-rocket'], { k: 'd', vb: '0 0 512 512', e: ['M0 0h10v10z'], e2: ['M5 5h10v10z'] });
	assert.deepEqual(r.icons['acme-logo'], { k: 'f', vb: '0 0 448 512', e: ['M1 1h2'] });
	assert.deepEqual(r.icons['acme-line'].a, { fill: 'none', stroke: 'currentColor', 'stroke-width': 32 });
	assert.deepEqual(r.icons['acme-line'].e, [['circle', { cx: 256, cy: 256, r: 200 }]]);
	assert.deepEqual(r.icons['acme-plain'], { e: ['M1 1h2'] });
});

test('icon sets: a wrong or missing format refuses the whole set (fatal)', () => {
	for (const json of [null, [], 'x', 7, {}, { format: 'jpkcom-desktop-icons/2', icons: {} }, { icons: { 'acme-x': { e: ['M0 0'] } } }]) {
		const r = cleanIconSet(json);
		assert.ok(r.fatal, JSON.stringify(json));
		assert.deepEqual(r.icons, {});
	}
	assert.match(cleanIconSet({ format: SET_FORMAT, icons: [] }).fatal, /icons must be an object/);
	assert.match(cleanIconSet({ format: SET_FORMAT }).fatal, /icons must be an object/);
});

test('icon sets: more than MAX_SET_ICONS icons refuses the whole set', () => {
	const icons = {};
	for (let i = 0; i <= MAX_SET_ICONS; i++) icons[`acme-i${i}`] = { e: ['M0 0h1'] };
	assert.match(cleanIconSet(set(icons)).fatal, /at most 5000/);
	delete icons[`acme-i${MAX_SET_ICONS}`];
	assert.equal(Object.keys(cleanIconSet(set(icons)).icons).length, MAX_SET_ICONS);
});

test('icon sets: ids without a prefix, with upper case or longer than 64 characters are skipped', () => {
	const long = `acme-${'x'.repeat(60)}`;
	const r = cleanIconSet(set({
		rocket: { e: ['M0 0'] }, 'Acme-rocket': { e: ['M0 0'] }, 'acme-Rocket': { e: ['M0 0'] }, 'a-rocket': { e: ['M0 0'] },
		'acme--x': { e: ['M0 0'] }, 'acme-x-': { e: ['M0 0'] }, 'abcdefghijklm-x': { e: ['M0 0'] }, [long]: { e: ['M0 0'] },
		__proto__: { e: ['M0 0'] }, 'acme-ok': { e: ['M0 0'] }
	}));
	assert.deepEqual(Object.keys(r.icons), ['acme-ok']);
	assert.equal(r.problems.length, 8, r.problems.join('\n'));
	assert.ok(r.problems.every(p => /not a set icon id/.test(p)));
	assert.equal(Object.getPrototypeOf(r.icons), Object.prototype);
});

test('icon sets: the reserved prefixes ti, tif, wc, tile, jpk are refused; any other prefix (win, dock, sheet, r1, wp1) is accepted', () => {
	assert.deepEqual([...RESERVED_ICON_PREFIXES], ['ti', 'tif', 'wc', 'tile', 'jpk']);
	const icons = {};
	for (const p of ['ti', 'tif', 'wc', 'tile', 'jpk', 'win', 'dock', 'sheet', 'r1', 'wp1', 'acme', 'demo']) icons[`${p}-star`] = { e: ['M0 0'] };
	const r = cleanIconSet(set(icons));
	assert.deepEqual(Object.keys(r.icons), ['win-star', 'dock-star', 'sheet-star', 'r1-star', 'wp1-star', 'acme-star', 'demo-star']);
	assert.equal(r.problems.filter(p => /belongs to the project/.test(p)).length, 5);
	assert.equal(iconPrefix('acme-rocket-2'), 'acme');
	assert.equal(iconPrefix('jpk'), '');
});

test('icon sets: an id an earlier set brought is skipped and reported (first set wins)', () => {
	const taken = new Set(['acme-a']);
	const r = cleanIconSet(set({ 'acme-a': { e: ['M0 0'] }, 'acme-b': { e: ['M0 0'] } }), { taken });
	assert.deepEqual(Object.keys(r.icons), ['acme-b']);
	assert.match(r.problems[0], /'acme-a': an earlier icon set brings this id already/);
});

test("icon sets: k 'd' accepts e2 and an empty e or e2, not both empty; e2 without k 'd' is refused", () => {
	const r = cleanIconSet(set({
		'acme-a': { k: 'd', e: [], e2: ['M0 0'] },
		'acme-b': { k: 'd', e: ['M0 0'], e2: [] },
		'acme-c': { k: 'd', e2: ['M0 0'] },
		'acme-d': { k: 'd', e: [], e2: [] },
		'acme-e': { k: 'f', e: ['M0 0'], e2: ['M1 1'] },
		'acme-f': { e: ['M0 0'], e2: ['M1 1'] },
		'acme-g': { k: 'x', e: ['M0 0'] },
		'acme-h': { k: 'd' },
		'acme-i': { e: 'M0 0' }
	}));
	assert.deepEqual(Object.keys(r.icons), ['acme-a', 'acme-b', 'acme-c']);
	assert.deepEqual(r.icons['acme-c'], { k: 'd', e: [], e2: ['M0 0'] });
	const text = r.problems.join('\n');
	assert.match(text, /'acme-d': no drawable element left/);
	assert.match(text, /'acme-e': e2 \(a secondary layer\) needs k: 'd'/);
	assert.match(text, /'acme-f': e2/);
	assert.match(text, /'acme-g': k must be/);
	assert.match(text, /'acme-h': e \(the elements\) is missing/);
	assert.match(text, /'acme-i': e must be an array/);
});

test('icon sets: a viewBox needs four numbers and a positive width and height', () => {
	for (const ok of ['0 0 24 24', '0 0 640 512', '-10 -10 20 20', '0,0,1.5,.5', '0 0 0.5 512']) assert.equal(safeViewBox(ok), ok, ok);
	for (const bad of ['0 0 0 24', '0 0 24 0', '0 0 -24 24', '0 0 24', '0 0 24 24 24', 'a b c d', '0 0 1e3 24', '', null, 24, ['0', '0', '24', '24'], '0 0 24 24; x']) {
		assert.equal(safeViewBox(bad), null, JSON.stringify(bad));
	}
	const r = cleanIconSet(set({ 'acme-a': { vb: '0 0 0 24', e: ['M0 0'] }, 'acme-b': { vb: 'url(#x)', e: ['M0 0'] } }));
	assert.deepEqual(r.icons, {});
	assert.equal(r.problems.filter(p => /viewBox/.test(p)).length, 2);
});

test('icon sets: cleaning drops script, foreignObject, image, use, g, on*, href, id, style, url() values and class tokens with other characters — in elements and in a', () => {
	const r = cleanIconSet(set({
		'acme-x': {
			k: 'f',
			a: { style: 'fill:red', onload: 'x()', fill: 'url(#g)', id: 'evil', class: 'ok', href: '#a', stroke: 'currentColor' },
			e: [
				['script', { href: 'x.js' }], ['foreignObject', {}], ['image', { href: 'x.png' }], ['use', { href: '#ti-x' }], ['g', {}],
				['path', { d: 'M0 0h1', onclick: 'x()', style: 'x', id: 'p', 'xlink:href': '#a', fill: 'URL( #a )', class: 'a"b' }],
				['rect', { width: 2, height: Infinity, class: 'Bad', 'stroke-width': NaN }],
				'M1 1 url(#x)', 42, null, ['path']
			]
		}
	}));
	const def = r.icons['acme-x'];
	assert.deepEqual(def.a, { class: 'ok', stroke: 'currentColor' });
	assert.deepEqual(def.e, [['path', { d: 'M0 0h1' }], ['rect', { width: 2 }], ['path', {}]]);
	const dropped = r.problems.join('\n');
	for (const x of ['<script>', '<foreignObject>', '<image>', '<use>', '<g>', 'onload', 'onclick', 'style', 'href', 'xlink:href', 'id', 'fill', 'class', 'height', 'stroke-width', 'element', 'd']) {
		assert.ok(dropped.includes(x), `reported: ${x}\n${dropped}`);
	}
	assert.equal(r.problems.length, 1, 'one line per icon');
});

test('icon sets: CSS escapes, var(), env(), src() and other functions are refused; transform and colour functions pass', () => {
	/* the CSS tokenizer resolves escapes before it reads a function name: 'u\72l(' is url(), '\76ar(' is var() */
	const r = cleanIconSet(set({
		'acme-x': {
			k: 'f',
			a: { fill: 'u\\72l(#wp1-g)', stroke: 'VAR(--x)', class: 'ok' },
			e: [
				['rect', { width: 1, fill: 'u\\72l(https://evil.example/x.svg#a)', stroke: '\\75rl(#g)', opacity: '\\31' }],
				['rect', { width: 2, fill: 'var(--p)', stroke: 'env(x)', transform: 'src(#g)' }],
				['rect', { width: 3, fill: 'image(#g)', stroke: '(#g)', transform: 'r\\otate(1)' }],
				'M0 0\\h1'
			]
		},
		'acme-ok': {
			e: [['rect', { width: 4, fill: 'rgb(0 0 0 / 50%)', stroke: 'oklch(0.7 0.1 200)', transform: 'translate(1, 2) rotate (45) SKEWX(3) matrix(1 0 0 1 0 0) scale(2)' }]]
		}
	}));
	assert.deepEqual(r.icons['acme-x'].a, { class: 'ok' });
	assert.deepEqual(r.icons['acme-x'].e, [['rect', { width: 1 }], ['rect', { width: 2 }], ['rect', { width: 3 }]]);
	assert.deepEqual(r.icons['acme-ok'].e[0][1], { width: 4, fill: 'rgb(0 0 0 / 50%)', stroke: 'oklch(0.7 0.1 200)', transform: 'translate(1, 2) rotate (45) SKEWX(3) matrix(1 0 0 1 0 0) scale(2)' });
	assert.equal(r.problems.length, 1, r.problems.join('\n'));
	for (const x of ['fill', 'stroke', 'opacity', 'transform', 'd']) assert.ok(r.problems[0].includes(x), x);
	assert.equal(safeElement('M0 0\\75rl(#g)'), null);
	assert.deepEqual(safeAttrs({ fill: 'currentColor', stroke: '\\', 'stroke-width': 'calc(1px)' }), { fill: 'currentColor' });
});

test('icon sets: an icon left without elements after cleaning is dropped (has() stays truthful)', () => {
	const r = cleanIconSet(set({ 'acme-x': { e: [['script', {}], ['image', {}]] }, 'acme-y': { k: 'd', e: [['g', {}]], e2: [['use', {}]] } }));
	assert.deepEqual(r.icons, {});
	assert.equal(r.problems.filter(p => /no drawable element left/.test(p)).length, 2);
	assert.equal(cleanIconDef({ e: [['script', {}]] }), null);
});

test('icon sets: stroke-dasharray, stroke-dashoffset, vector-effect, paint-order and plain class tokens are kept', () => {
	const attrs = { 'stroke-dasharray': '4 2', 'stroke-dashoffset': 1, 'vector-effect': 'non-scaling-stroke', 'paint-order': 'stroke', class: 'a b-c', 'stroke-miterlimit': 4 };
	const dropped = [];
	assert.deepEqual(safeAttrs(attrs, dropped), attrs);
	assert.deepEqual(dropped, []);
	assert.deepEqual(safeElement(['line', attrs]), ['line', attrs]);
	assert.deepEqual(safeElement('M0 0'), ['path', { d: 'M0 0' }]);
});

test('icon sets: the shipped src/icons/tabler.js and src/icons/custom.js pass the allowlist unchanged (elements, a, vb)', () => {
	for (const [id, def] of [...Object.entries(tabler), ...Object.entries(custom)]) {
		const dropped = [];
		const clean = cleanIconDef(def, dropped);
		assert.deepEqual(dropped, [], `${id}: ${dropped.join(', ')}`);
		assert.deepEqual(clean, def, id);
	}
});

test('icon sets: build-icons KEEP is a subset of ICON_ATTRS and ELEMENTS equals ICON_TAGS', () => {
	const src = readFileSync(join(ROOT, 'tools/build-icons.mjs'), 'utf8');
	assert.match(src, /import \{ ICON_TAGS \} from '\.\.\/src\/core\/icon-sets\.js';/);
	assert.match(src, /^const ELEMENTS = ICON_TAGS;$/m);
	const keep = src.match(/const KEEP = new Set\(\[([\s\S]*?)\]\);/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
	assert.ok(keep.length > 20);
	for (const a of keep) assert.ok(ICON_ATTRS.has(a), a);
	assert.deepEqual([...ICON_TAGS], ['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
});

test('icon sets: isSetPath accepts relative .json paths and refuses the table of tests/set-paths.mjs (../, %2e%2e, /abs, //host, https:, //, dot segments, dotfiles, .JSON, backslash, ?query, space, control characters, 257 characters, non-strings)', () => {
	for (const p of GOOD_PATHS) assert.equal(isSetPath(p), true, p);
	for (const p of BAD_PATHS) assert.equal(isSetPath(p), false, JSON.stringify(p));
	assert.equal(GOOD_PATHS[3].length, 256);
	assert.equal(SET_PATH.test('site/x.json'), true);
});
