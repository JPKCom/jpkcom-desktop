/* JPKCom Desktop — tests: config merge/validation, module ordering, token sync, icon data — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildConfig, deepMerge, DEFAULTS, legacyMatcher } from '../src/core/config.js';
import { orderByRequires } from '../src/core/modules.js';
import tabler from '../src/icons/tabler.js';

test('config: defaults without a site config', () => {
	const c = buildConfig(undefined);
	assert.equal(c.namespace, 'jpkdesk');
	assert.deepEqual([...c.languages], ['de', 'en']);
	assert.equal(c.defaultLang, 'en');
	assert.ok(Object.isFrozen(c.theme.accents));
});

test('config: objects merge, arrays and language maps replace, null removes colours', () => {
	const c = buildConfig({
		theme: { accents: { red: '#aa2222', pink: null }, tints: { sun: ['#ffcc00', '#ff8800'] } },
		languages: ['en', 'fr'],
		site: { description: { en: 'Only English' } },
		wm: { gap: 10 }
	});
	assert.equal(c.theme.accents.red, '#aa2222');
	assert.equal(c.theme.accents.blue, '#3571c0');
	assert.equal('pink' in c.theme.accents, false);
	assert.deepEqual([...c.theme.tints.sun], ['#ffcc00', '#ff8800']);
	assert.deepEqual([...c.languages], ['en', 'fr']);
	assert.deepEqual({ ...c.site.description }, { en: 'Only English' });
	assert.equal(c.wm.gap, 10);
	assert.deepEqual([...c.wm.minSize], [280, 180]);
	/* the defaults themselves are untouched */
	assert.equal(DEFAULTS.theme.accents.pink, '#c5306f');
});

test('merge: terminal.manUrl replaces as a whole', () => {
	const layered = { terminal: { user: 'guest', manUrl: { de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' } } };
	const merged = deepMerge(layered, { terminal: { manUrl: { fr: 'aide/{slug}.md' } } });
	assert.deepEqual(merged.terminal.manUrl, { fr: 'aide/{slug}.md' }, 'no German or English path left next to the site\'s own');
	assert.equal(merged.terminal.user, 'guest', 'the rest of terminal still merges');
	assert.equal(deepMerge(layered, { terminal: { manUrl: 'docs/{slug}.md' } }).terminal.manUrl, 'docs/{slug}.md');
	const c = buildConfig({ terminal: { manUrl: { en: 'm/{slug}.md' } } });
	assert.deepEqual({ ...c.terminal.manUrl }, { en: 'm/{slug}.md' });
});

test('config: invalid values fall back with a warning', () => {

	const warnings = [];
	const c = buildConfig({
		namespace: 'Bad Name!', defaultLang: 'fr', languages: ['de', 'en'], theme: { default: 'neon', accent: 'nope', accents: { 'Bad': '#123456', ok: 'blue' } },
		modules: ['reader', 'Bad Module', { id: 'mine', src: 'site/modules/mine/index.js' }], services: { weather: 'yes' }
	}, m => warnings.push(m));
	assert.equal(c.namespace, 'jpkdesk');
	assert.equal(c.defaultLang, 'de');
	assert.equal(c.theme.default, 'dark');
	assert.equal(c.theme.accent, 'blue');
	assert.equal('Bad' in c.theme.accents, false);
	assert.equal('ok' in c.theme.accents, false);
	assert.deepEqual(c.modules.map(m => (typeof m === 'string' ? m : m.id)), ['reader', 'mine']);
	assert.equal(c.services.weather, false);
	assert.ok(warnings.length >= 7);
});

test('config: DEFAULTS hold the module sections, so their validateConfig runs without a site section', () => {
	const expected = {
		'notify.pathPrefix': null,
		'weather.everyMs': 1800000,
		'fortune.remote': null,
		'fortune.dir': 'site/data/fortunes/',
		'fortune.langs': ['de', 'en'],
		'fortune.block': [],
		'fortune.local': true,
		'fortune.texts': {},
		'media.maxItems': 200,
		'media.seekStep': 5,
		'editor.maxTabs': 20,
		'editor.maxFileBytes': 5242880,
		'editor.wrap': false,
		'editor.invisibles': true,
		'calc.historySize': 50
	};
	const get = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
	const has = (o, p) => {
		const keys = p.split('.');
		const last = keys.pop();
		const parent = keys.reduce((x, k) => x?.[k], o);
		return parent != null && Object.hasOwn(parent, last);
	};
	const c = buildConfig({});
	for (const [path, value] of Object.entries(expected)) {
		assert.ok(has(DEFAULTS, path), `DEFAULTS.${path}`);
		assert.deepEqual(get(DEFAULTS, path), value, `DEFAULTS.${path}`);
		assert.ok(has(c, path), `buildConfig({}).${path}`);
		const v = get(c, path);
		assert.deepEqual(Array.isArray(v) ? [...v] : v, value, `buildConfig({}).${path}`);
	}
	for (const k of ['media', 'editor', 'calc', 'fortune']) assert.ok(Object.hasOwn(c, k), k);
});

test('config: prototype pollution keys are ignored', () => {
	const merged = deepMerge({ a: 1 }, JSON.parse('{"__proto__": {"polluted": true}, "b": 2}'));
	assert.equal(merged.b, 2);
	assert.equal({}.polluted, undefined);
});

test('modules: orderByRequires puts dependencies first and skips broken ones', () => {
	const warnings = [];
	const list = [
		{ id: 'weather', requires: ['calendar'] },
		{ id: 'calendar', requires: [] },
		{ id: 'search' },
		{ id: 'orphan', requires: ['missing'] },
		{ id: 'a', requires: ['b'] },
		{ id: 'b', requires: ['a'] },
		{ id: 'uses-core', requires: ['wm'] }
	];
	const out = orderByRequires(list, m => warnings.push(m), new Set(['wm']));
	assert.deepEqual(out.map(d => d.id), ['calendar', 'weather', 'search', 'uses-core']);
	assert.ok(warnings.some(w => w.includes('circular')));
	assert.ok(warnings.some(w => w.includes("'orphan' requires 'missing'")));
});

test('tokens.css mirrors the accent and tint defaults of config.js', () => {
	const css = readFileSync(new URL('../src/css/tokens.css', import.meta.url), 'utf8');
	for (const [id, hex] of Object.entries(DEFAULTS.theme.accents)) {
		assert.match(css, new RegExp(`--accent-${id}:\\s*${hex};`, 'i'), `--accent-${id}`);
	}
	for (const [id, [a, b]] of Object.entries(DEFAULTS.theme.tints)) {
		assert.match(css, new RegExp(`--t-${id}:\\s*${a},\\s*${b};`, 'i'), `--t-${id}`);
	}
	const theme = readFileSync(new URL('../src/boot/theme.js', import.meta.url), 'utf8');
	const builtIn = theme.match(/new Set\(\[([^\]]+)\]\)/)[1].match(/'([a-z-]+)'/g).map(s => s.slice(1, -1));
	assert.deepEqual(builtIn, Object.keys(DEFAULTS.theme.accents));
});

test('tabler.js: generated entries are well-formed, without the bounding box path', () => {
	assert.ok(Object.keys(tabler).length > 0);
	for (const [id, def] of Object.entries(tabler)) {
		assert.match(id, /^tif?-[a-z0-9-]+$/);
		assert.ok(def.k === 'o' || def.k === 'f');
		assert.equal(def.k === 'f', id.startsWith('tif-'));
		for (const e of def.e) {
			if (typeof e === 'string') assert.notEqual(e, 'M0 0h24v24H0z');
			else assert.ok(Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'object');
		}
	}
});

test('config: trash, backup and wallpaper tones are validated with a warning', () => {
	const warnings = [];
	const cfg = buildConfig({
		trash: { days: 'x', max: -3 },
		backup: { maxBytes: 'big', filePrefix: '../evil name', format: 42 },
		wallpaper: { images: [{ id: 'a', src: 'a.jpg', tone: 'pink' }, { id: 'b', src: 'b.jpg', tone: 'light' }] }
	}, m => warnings.push(m));
	assert.deepEqual({ ...cfg.trash }, { ...DEFAULTS.trash });
	assert.deepEqual({ ...cfg.backup }, { ...DEFAULTS.backup });
	for (const k of ['trash.days', 'trash.max', 'backup.maxBytes', 'backup.filePrefix', 'backup.format', 'images[0].tone']) {
		assert.ok(warnings.some(w => w.includes(k)), k);
	}
	assert.equal(cfg.wallpaper.images[0].tone, undefined);
	assert.equal(cfg.wallpaper.images[1].tone, 'light');
	const fine = buildConfig({ trash: { days: 0.5, max: 10 }, backup: { filePrefix: 'my-site_1.0' } }, m => warnings.push(`unexpected ${m}`));
	assert.equal(fine.trash.days, 0.5);
	assert.equal(fine.backup.filePrefix, 'my-site_1.0');
	assert.ok(!warnings.some(w => w.startsWith('unexpected')));
});

test('config: offline.legacyCaches defaults to [] and is cleaned with warnings', () => {
	const warnings = [];
	const plain = buildConfig({}, m => warnings.push(m));
	assert.deepEqual([...plain.offline.legacyCaches], []);
	assert.deepEqual(warnings, []);
	const cfg = buildConfig({ offline: { legacyCaches: ['oldsite-pages', '*', 'ns:/x/:pages', 3] } }, m => warnings.push(m));
	assert.deepEqual([...cfg.offline.legacyCaches], ['oldsite-pages']);
	assert.equal(warnings.length, 3);
	assert.ok(warnings.every(w => w.includes('config.offline.legacyCaches')));
	assert.ok(Object.isFrozen(cfg.offline.legacyCaches));
	assert.equal(cfg.offline.maxPages, 80, 'the other offline keys keep their defaults');
	warnings.length = 0;
	assert.deepEqual([...buildConfig({ offline: { legacyCaches: 'x' } }, m => warnings.push(m)).offline.legacyCaches], []);
	assert.equal(warnings.length, 1);
	assert.ok(warnings[0].includes('config.offline.legacyCaches'));
	warnings.length = 0;
	const broken = buildConfig({ offline: 'none' }, m => warnings.push(m));
	assert.deepEqual([...broken.offline.legacyCaches], []);
	assert.equal(broken.offline.fastStart, true);
	assert.equal(warnings.length, 1, 'one warning for the section, none for the list');
	assert.deepEqual(DEFAULTS.offline.legacyCaches, [], 'the defaults are untouched');
});

test('config: legacyMatcher refuses this project\'s scheme even for a matching prefix', () => {
	const match = legacyMatcher(['olddesk*']);
	assert.equal(match('olddesk:/x/:pages'), false);
	assert.equal(match('olddesk:/:2.0.0-89abcdef-next'), false);
	assert.equal(match('olddesk-shell'), true);
	assert.equal(match('olddesk:/x/:media'), true, 'not a name of the scheme');
});

test('config: iconSets defaults to [] and keeps valid relative .json paths in order', () => {
	assert.deepEqual([...buildConfig(undefined).iconSets], []);
	assert.deepEqual([...DEFAULTS.iconSets], []);
	const warns = [];
	const c = buildConfig({ iconSets: ['site/icon-sets/b.json', 'site/icon-sets/a.json', 'icons.json'] }, w => warns.push(w));
	assert.deepEqual([...c.iconSets], ['site/icon-sets/b.json', 'site/icon-sets/a.json', 'icons.json']);
	assert.deepEqual(warns, []);
});

test('config: iconSets drops invalid entries and duplicates and keeps at most 8 (warned)', () => {
	const warns = [];
	const nine = Array.from({ length: 9 }, (_, i) => `site/icon-sets/s${i}.json`);
	const c = buildConfig({ iconSets: ['../x.json', 'site/icon-sets/s0.json', 7, '/abs.json', 'site/%2e%2e/x.json', 'https://cdn.example/x.json', ...nine] }, w => warns.push(w));
	assert.deepEqual([...c.iconSets], ['site/icon-sets/s0.json', ...nine.slice(1, 8)]);
	assert.equal(warns.length, 7, warns.join('\n'));
	assert.ok(warns.every(w => /^config\.iconSets\[\d+\] must be a \.json path/.test(w)));
	assert.match(warns.find(w => w.includes('[6]')), /duplicates — skipped "site\/icon-sets\/s0\.json"/);
	assert.match(warns.at(-1), /s8\.json/);
});

test('config: a non-array iconSets (true, {}) is warned about and becomes []', () => {
	for (const v of [true, {}, 'site/icon-sets/x.json', null]) {
		const warns = [];
		assert.deepEqual([...buildConfig({ iconSets: v }, w => warns.push(w)).iconSets], [], JSON.stringify(v));
		assert.match(warns.join('\n'), /config\.iconSets is invalid/);
	}
});
