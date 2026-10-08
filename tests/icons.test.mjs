/* JPKCom Desktop — tests: the icon sprite (symbol ids, two-tone layers, the allowlist at build time) and which glyph an app shows (tile() and appGlyph()) — © Jean Pierre Kolb — MIT License

   src/core/icons.js builds <symbol>s with document.createElementNS. A small stand-in
   for document (createElementNS, querySelector, body.prepend) records what it builds. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

class FakeEl {
	constructor(tag) {
		this.tag = tag;
		this.attrs = {};
		this.children = [];
		this.isConnected = false;
	}
	setAttribute(k, v) { this.attrs[k] = String(v); }
	getAttribute(k) { return this.attrs[k] ?? null; }
	append(...kids) {
		for (const k of kids) {
			k.isConnected = this.isConnected;
			this.children.push(k);
		}
	}
}

const body = new FakeEl('body');
body.isConnected = true;
body.prepend = el => {
	el.isConnected = true;
	body.children.unshift(el);
};
globalThis.document = {
	body,
	createElementNS: (ns, tag) => new FakeEl(tag),
	querySelector: () => null
};

const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
const { icon, addIcons, addIconSet, hasIcon, symbolHref, glyphOf, appGlyph, setIconReplace } = await import('../src/core/icons.js');
const { cleanIconSet, SET_FORMAT } = await import('../src/core/icon-sets.js');
console.warn = realWarn;

const sprite = () => body.children.find(el => el.attrs.class === 'sprite');
const symbol = id => sprite()?.children.find(el => el.attrs.id === `i-${id}`) ?? null;
const quiet = fn => {
	const start = warnings.length;
	const saved = console.warn;
	console.warn = (...args) => warnings.push(args.join(' '));
	try {
		return { value: fn(), warned: warnings.slice(start) };
	} finally {
		console.warn = saved;
	}
};

test('icons: a symbol has the DOM id i-<id> and icon() returns <use href="#i-<id>">', () => {
	const svg = icon('ti-x');
	assert.equal(svg.tag, 'svg');
	assert.equal(svg.attrs['aria-hidden'], 'true');
	assert.equal(svg.children[0].tag, 'use');
	assert.equal(svg.children[0].attrs.href, '#i-ti-x');
	const sym = symbol('ti-x');
	assert.ok(sym, 'the symbol is in the sprite');
	assert.equal(sym.attrs.viewBox, '0 0 24 24');
	assert.equal(sym.attrs.fill, 'none');
	assert.equal(sprite().children.filter(el => el.attrs.id === 'ti-x').length, 0, 'no element carries the bare icon id');
});

test("icons: symbolHref(id) places the symbol and returns '#i-<id>', null for unknown ids", () => {
	assert.equal(symbol('jpk'), null);
	assert.equal(symbolHref('jpk'), '#i-jpk');
	assert.ok(symbol('jpk'));
	assert.equal(symbolHref('jpk'), '#i-jpk', 'placed once');
	assert.equal(sprite().children.filter(el => el.attrs.id === 'i-jpk').length, 1);
	assert.equal(symbolHref('acme-nothing'), null);
});

test('icons: the Desk API exposes symbolHref as Desk.icons.symbolHref (site modules import only the API)', async () => {
	const { default: Desk } = await import('../src/core/api.js');
	assert.equal(Desk.icons.symbolHref, symbolHref);
	assert.equal(Desk.icons.symbolHref('jpk'), '#i-jpk');
});

test("icons: k 'd' builds e2 first with class i-duo, then e, on a filled symbol", () => {
	addIcons({ 'tst-duo': { k: 'd', vb: '0 0 512 512', e: ['M1 1h1'], e2: ['M2 2h2', ['circle', { cx: 1, cy: 1, r: 1, class: 'x' }]] } });
	icon('tst-duo');
	const sym = symbol('tst-duo');
	assert.equal(sym.attrs.viewBox, '0 0 512 512');
	assert.equal(sym.attrs.fill, 'currentColor');
	assert.equal(sym.attrs.stroke, 'none');
	assert.deepEqual(sym.children.map(el => [el.tag, el.attrs.class ?? null]), [['path', 'i-duo'], ['circle', 'x i-duo'], ['path', null]]);
	assert.equal(sym.children[2].attrs.d, 'M1 1h1');
	assert.ok(!('style' in sym.children[0].attrs) && !('opacity' in sym.children[0].attrs), 'no literal opacity, no style');
});

test('icons: a runtime pack with a hostile a ({ style, fill: url(#x), onload }) and an invalid vb is placed with neither (warned once, viewBox 0 0 24 24)', () => {
	addIcons({ 'tst-hostile': { vb: '0 0 0 0', a: { style: 'x', fill: 'url(#x)', onload: 'x()', stroke: 'currentColor' }, e: [['script', { href: 'x.js' }], 'M0 0h1', ['path', { d: 'M1 1', onclick: 'x' }]] } });
	const { warned } = quiet(() => icon('tst-hostile'));
	const sym = symbol('tst-hostile');
	assert.equal(sym.attrs.viewBox, '0 0 24 24');
	assert.deepEqual(Object.keys(sym.attrs).sort(), ['id', 'stroke', 'viewBox']);
	assert.deepEqual(sym.children.map(el => el.tag), ['path', 'path']);
	assert.deepEqual(sym.children[1].attrs, { d: 'M1 1' });
	assert.equal(warned.length, 1, warned.join('\n'));
	for (const x of ['viewBox', 'style', 'fill', 'onload', '<script>', 'onclick']) assert.ok(warned[0].includes(x), x);
	quiet(() => icon('tst-hostile'));
	assert.equal(warnings.filter(w => w.includes("'tst-hostile'")).length, 1, 'warned once per icon');
});

test('icons: a runtime pack with CSS escapes or var() in paint values is placed without them', () => {
	addIcons({ 'tst-escape': { k: 'f', a: { fill: 'u\\72l(#wp1-g)' }, e: [['rect', { width: 1, fill: '\\75rl(#g)', stroke: 'var(--x)' }], 'M0 0h1'] } });
	const { warned } = quiet(() => icon('tst-escape'));
	const sym = symbol('tst-escape');
	assert.deepEqual(Object.keys(sym.attrs).sort(), ['id', 'viewBox'], 'a (which replaces the attributes of k) loses the escaped url()');
	assert.deepEqual(sym.children[0].attrs, { width: '1' });
	assert.equal(warned.length, 1, warned.join('\n'));
	for (const el of [sym, ...sym.children]) for (const v of Object.values(el.attrs)) assert.ok(!v.includes('\\') && !/var\(/i.test(v), v);
});

test('icons: a runtime pack using stroke-dasharray still renders it', () => {
	addIcons({ 'tst-dash': { e: [['circle', { cx: 12, cy: 12, r: 9, 'stroke-dasharray': '2 3', 'vector-effect': 'non-scaling-stroke' }]] } });
	const { warned } = quiet(() => icon('tst-dash'));
	assert.deepEqual(warned, []);
	assert.equal(symbol('tst-dash').children[0].attrs['stroke-dasharray'], '2 3');
	assert.equal(symbol('tst-dash').children[0].attrs['vector-effect'], 'non-scaling-stroke');
});

test('icons: dropped attributes and tags are warned once per icon; unknown ids name the site icon sets', () => {
	addIcons({ 'tst-g': { e: [['g', {}], ['use', { href: '#x' }], 'M0 0'] } });
	const { warned } = quiet(() => { icon('tst-g'); icon('tst-g'); });
	assert.equal(warned.length, 1);
	assert.match(warned[0], /'tst-g': dropped <g>, <use>/);
	const unknown = quiet(() => { icon('acme-unknown'); icon('acme-unknown'); icon('ti-unknown-thing'); });
	assert.equal(unknown.warned.length, 2);
	assert.match(unknown.warned[0], /'acme-unknown' — not in src\/icons\/tabler\.js, src\/icons\/custom\.js or a site icon set \(config\.iconSets\)/);
	assert.match(unknown.warned[1], /run npm run icons/);
});

test("icons: addIcons accepts { k: 'd', e: [], e2: [...] }; a site icon set registers through addIconSet", () => {
	const { warned } = quiet(() => addIcons({ 'tst-only2': { k: 'd', e2: ['M0 0h1'] }, 'tst-bad': { k: 'f', e2: ['M0 0h1'] } }));
	assert.match(warned.join('\n'), /skipped invalid icon 'tst-bad'/);
	assert.equal(hasIcon('tst-only2'), true);
	assert.equal(hasIcon('tst-bad'), false);
	const r = cleanIconSet({ format: SET_FORMAT, icons: { 'acme-rocket': { k: 'd', e: [], e2: ['M0 0h1'] }, 'acme-gone': { e: [['image', {}]] } } });
	addIconSet(r, 'site/icon-sets/t.json');
	assert.equal(hasIcon('acme-rocket'), true);
	assert.equal(hasIcon('acme-gone'), false);
	assert.equal(icon('acme-rocket').children[0].attrs.href, '#i-acme-rocket');
	assert.equal(symbol('acme-rocket').children[0].attrs.class, 'i-duo');
});

test('glyphOf: the precedence of tile()', () => {
	assert.ok(hasIcon('ti-cookie') && !hasIcon('ti-not-built'));
	assert.deepEqual(glyphOf({ icon: 'ti-cookie' }), { icon: 'ti-cookie' });
	assert.deepEqual(glyphOf({ mark: 'C', icon: 'ti-cookie' }), { mark: 'C' });
	assert.deepEqual(glyphOf({ logo: 'jpkcom', mark: 'C' }), { logo: 'jpkcom' });
	assert.deepEqual(glyphOf({ logo: 'missing', icon: 'ti-cookie' }), { icon: 'ti-cookie' }, 'an unknown logo falls through');
	assert.deepEqual(glyphOf({ icon: 'ti-not-built' }, 'ti-cookie'), { icon: 'ti-cookie' }, 'an icon that is not built → the fallback');
	assert.deepEqual(glyphOf({}), { icon: 'ti-app-window' });
	assert.deepEqual(glyphOf(null), { icon: 'ti-app-window' });
	assert.deepEqual(glyphOf({ mark: '', icon: 'ti-cookie' }), { icon: 'ti-cookie' }, 'an empty mark is none');
});

test('glyphOf: an icon of a site icon set counts as known (appGlyph shows it like tile())', () => {
	addIconSet(cleanIconSet({ format: SET_FORMAT, icons: { 'acme-cookie': { k: 'f', e: ['M0 0h1'] } } }), 'site/icon-sets/g.json');
	assert.deepEqual(glyphOf({ icon: 'acme-cookie' }), { icon: 'acme-cookie' });
	assert.deepEqual(glyphOf({ icon: 'acme-not-in-set' }, 'ti-cookie'), { icon: 'ti-cookie' });
});

test('iconReplace: icon() and symbolHref() draw the target for a replaced id; has() and glyphOf() keep the id', () => {
	addIconSet(cleanIconSet({ format: SET_FORMAT, icons: {
		'acme-cog': { k: 'd', vb: '0 0 512 512', e: ['M0 0h1'], e2: ['M1 1h1'] },
		'acme-xmark': { k: 'f', e: ['M0 0h2'] }
	} }), 'site/icon-sets/r.json');
	try {
		const problems = setIconReplace({ 'ti-settings': 'acme-cog', 'wc-close': 'acme-xmark', 'ti-cookie': 'ti-settings' });
		assert.equal(problems.length, 1, 'ti-settings is a key itself: one step, warned');
		assert.equal(icon('ti-settings').children[0].attrs.href, '#i-acme-cog');
		assert.equal(icon('wc-close', 'i wc').children[0].attrs.href, '#i-acme-xmark');
		assert.equal(icon('ti-cookie').children[0].attrs.href, '#i-ti-settings', 'not chained');
		assert.equal(symbolHref('ti-settings'), '#i-acme-cog');
		assert.equal(symbol('acme-cog').children[0].attrs.class, 'i-duo', 'the target is built as it is (two-tone)');
		assert.equal(hasIcon('ti-settings'), true);
		assert.deepEqual(glyphOf({ icon: 'ti-settings' }), { icon: 'ti-settings' }, 'glyphOf names the id asked for');
		assert.equal(appGlyph({ icon: 'ti-settings' }).children[0].attrs.href, '#i-acme-cog', 'app glyphs and tiles draw through icon()');
		assert.equal(icon('ti-x').children[0].attrs.href, '#i-ti-x', 'ids without a replacement are untouched');
	} finally {
		setIconReplace({});
	}
	assert.equal(icon('ti-settings').children[0].attrs.href, '#i-ti-settings', 'a new map replaces the old one');
});

test('iconReplace: a pair with an unknown key or target is left out — the original glyph stays', () => {
	try {
		const problems = setIconReplace({ 'ti-cookie': 'acme-not-loaded', 'ti-not-built': 'acme-cog', 'ti-x': 'acme-xmark' });
		assert.equal(problems.length, 2, problems.join('\n'));
		assert.match(problems[0], /'ti-cookie' → 'acme-not-loaded': 'acme-not-loaded' is not a known icon/);
		assert.match(problems[1], /'ti-not-built' is not a known icon/);
		const { value, warned } = quiet(() => icon('ti-cookie'));
		assert.equal(value.children[0].attrs.href, '#i-ti-cookie', 'the Tabler original is the fallback');
		assert.deepEqual(warned, []);
		assert.equal(icon('ti-x').children[0].attrs.href, '#i-acme-xmark');
		assert.equal(quiet(() => icon('ti-not-built')).value.children.length, 0, 'an unknown key renders empty as before');
	} finally {
		setIconReplace({});
	}
});

test('iconReplace: the boot applies config.iconReplace after the icon sets and before any module is imported', () => {
	const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/boot/main.js'), 'utf8');
	const body = src.slice(src.indexOf('async function boot()'));
	const sets = body.indexOf('loadIconSets()');
	const apply = body.indexOf('applyIconReplace();');
	const modulesAt = body.indexOf('modules.loadAll(');
	assert.ok(sets > 0 && apply > sets && modulesAt > apply, 'loadIconSets → applyIconReplace → modules.loadAll');
	assert.match(src, /function applyIconReplace\(\) \{\n\ttry \{\n\t\tconst problems = setIconReplace\(config\.iconReplace\);/);
});
