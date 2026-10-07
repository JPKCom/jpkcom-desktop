/* JPKCom Desktop — tests: search engine (folding, scoring, grouping, shortcuts, config, providers) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	fold, queryWords, entry, score, rank, parseCombo, matchCombo, ariaKeys,
	cleanConfig, cleanProvider, cleanResults, excerptParts, isScriptPath
} from '../src/modules/search/engine.js';

test('fold: case, accents and ß', () => {
	assert.equal(fold('Größe Café'), 'grosse cafe');
	assert.equal(fold(null), '');
	assert.deepEqual(queryWords('  Über   Notes '), ['uber', 'notes']);
	assert.deepEqual(queryWords('   '), []);
});

test('entry: folded fields, sub falls back to the group label', () => {
	const e = entry({ app: { id: 'tool-json' }, group: 'c-tools', name: 'JSON Formatter', slug: 'json', cat: 'Entwicklung', desc: '' });
	assert.equal(e.name, 'json formatter');
	assert.deepEqual(e.words, ['json', 'formatter']);
	assert.equal(e.sub, 'Entwicklung');
	assert.equal(e.label, 'JSON Formatter');
	const d = entry({ app: {}, group: 'apps', name: 'Notes', desc: 'Quick notes' });
	assert.equal(d.sub, 'Quick notes');
});

test('score: name start > word start > name > slug > group > description; every word must hit', () => {
	const e = entry({ app: {}, group: 'apps', name: 'Text Editor', slug: 'editor-x', cat: 'Office', desc: 'Write plain files' });
	assert.equal(score(e, ['text']), 100);
	assert.equal(score(e, ['edi']), 80);
	assert.equal(score(e, ['xt']), 60);
	assert.equal(score(e, ['or-x']), 50);
	assert.equal(score(e, ['offi']), 30);
	assert.equal(score(e, ['plain']), 20);
	assert.equal(score(e, ['text', 'plain']), 120);
	assert.equal(score(e, ['text', 'nothing']), 0);
});

test('rank: max per group, best group first, ties by name and natural order', () => {
	const index = [
		entry({ app: { id: 'a1' }, group: 'apps', name: 'Calendar', desc: 'dates' }),
		entry({ app: { id: 'a2' }, group: 'apps', name: 'Calculator' }),
		entry({ app: { id: 't1' }, group: 'c-tools', name: 'Cal Converter' }),
		entry({ app: { id: 't2' }, group: 'c-tools', name: 'Color picker', desc: 'cal' }),
		entry({ app: { id: 't3' }, group: 'c-tools', name: 'Base64' })
	];
	const groups = [{ id: 'apps', max: 1 }, { id: 'c-tools', max: 5 }];
	const r = rank(index, 'cal', groups);
	assert.equal(r.length, 2);
	assert.equal(r[0].group.id, 'apps');           // both groups start at 100: natural order decides
	assert.equal(r[0].items.length, 1);            // max 1
	assert.equal(r[0].items[0].e.app.id, 'a2');    // 'Calculator' before 'Calendar' (same score, by name)
	assert.deepEqual(r[1].items.map(x => x.e.app.id), ['t1', 't2']);
	const r2 = rank(index, 'conv', groups);
	assert.equal(r2.length, 1);
	assert.equal(r2[0].group.id, 'c-tools');
	assert.deepEqual(rank(index, '  ', groups), []);
	/* the group with the best hit comes first */
	const r3 = rank(index, 'color', groups);
	assert.equal(r3[0].group.id, 'c-tools');
});

test('combos: parse, match (Mod accepts ⌘ or Ctrl), aria-keyshortcuts', () => {
	assert.deepEqual([...parseCombo('Mod+Shift+K').mods].sort(), ['Mod', 'Shift']);
	assert.equal(parseCombo('Mod+K').key, 'k');
	assert.equal(parseCombo('Ctrl++').key, '+');
	const ev = (key, m = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...m });
	assert.equal(matchCombo('Mod+K', ev('k', { ctrlKey: true })), true);
	assert.equal(matchCombo('Mod+K', ev('K', { ctrlKey: true })), true);
	assert.equal(matchCombo('Mod+K', ev('k', { metaKey: true })), true);
	assert.equal(matchCombo('Ctrl+K', ev('k', { metaKey: true })), false);
	assert.equal(matchCombo('Meta+K', ev('k', { metaKey: true })), true);
	assert.equal(matchCombo('Mod+K', ev('k', { ctrlKey: true, shiftKey: true })), false);
	assert.equal(matchCombo('Mod+K', ev('k')), false);
	assert.equal(matchCombo('Alt+Space', ev(' ', { altKey: true })), true);
	assert.equal(ariaKeys('Mod+K'), 'Control+K');
	assert.equal(ariaKeys('Mod+K', true), 'Meta+K');
	assert.equal(ariaKeys('Alt+Shift+f'), 'Alt+Shift+F');
});

test('cleanConfig: defaults, invalid values, pagefind', () => {
	const warnings = [];
	const warn = m => warnings.push(m);
	assert.deepEqual(cleanConfig(undefined), { pagefind: null, maxPerGroup: 6, shortcut: 'Mod+K' });
	assert.deepEqual(cleanConfig({ pagefind: null, maxPerGroup: 4, shortcut: null }), { pagefind: null, maxPerGroup: 4, shortcut: null });

	const bad = cleanConfig({ maxPerGroup: 0, shortcut: 'Mod+', pagefind: { path: 'javascript:alert(1)' } }, warn);
	assert.deepEqual(bad, { pagefind: null, maxPerGroup: 6, shortcut: 'Mod+K' });
	assert.equal(warnings.length, 3);

	const pf = cleanConfig({ pagefind: { path: 'pagefind/pagefind.js', excerptLength: 99, maxHits: 5, label: { en: 'Articles', de: 'Artikel' } } }, warn);
	assert.deepEqual(pf.pagefind, { path: 'pagefind/pagefind.js', excerptLength: 16, maxHits: 5, label: { en: 'Articles', de: 'Artikel' }, order: 900 });
	assert.equal(cleanConfig({ pagefind: '/pagefind/pagefind.js' }).pagefind.path, '/pagefind/pagefind.js');
	assert.equal(cleanConfig({ pagefind: { path: '//evil.example/p.js' } }).pagefind, null);
	assert.equal(cleanConfig({ pagefind: { path: 'https://cdn.example/p.js' } }).pagefind, null);
});

test('isScriptPath: same-origin script paths only', () => {
	assert.equal(isScriptPath('pagefind/pagefind.js'), true);
	assert.equal(isScriptPath('/pagefind/pagefind.js?v=2'), true);
	assert.equal(isScriptPath('./x.mjs'), true);
	assert.equal(isScriptPath('data:text/javascript,1'), false);
	assert.equal(isScriptPath('pagefind/'), false);
	assert.equal(isScriptPath('a b.js'), false);
});

test('cleanProvider: required fields and defaults', () => {
	const warnings = [];
	const warn = m => warnings.push(m);
	assert.equal(cleanProvider({ id: 'X', label: 'x', search() {} }, warn), null);
	assert.equal(cleanProvider({ id: 'notes', label: 'Notes' }, warn), null);
	assert.equal(cleanProvider({ id: 'notes', search() {} }, warn), null);
	assert.equal(warnings.length, 3);
	const p = cleanProvider({ id: 'notes', label: '@notes.title', search: () => [], max: 99, delay: 0 });
	assert.equal(p.order, 100);
	assert.equal(p.max, null);
	assert.equal(p.minLength, 1);
	assert.equal(p.delay, 0);
	assert.equal(p.warm, null);
	assert.equal(p.available, null);
	assert.ok(Object.isFrozen(p));
	const gone = cleanProvider({ id: 'pf', label: 'x', search: () => [], available: () => false });
	assert.equal(gone.available(), false);
});

test('cleanResults: rows need a title and a way to open; capped at max', () => {
	const run = () => {};
	const rows = cleanResults([
		{ title: 'A', run },
		{ title: '', run },
		{ title: 'No way to open' },
		{ title: 'B', url: 'docs/b/', sub: ['x', 42, { nodeType: 1 }], external: 'yes' },
		{ title: 'C', app: 'notes' },
		null,
		{ title: 'D', run }
	], 3);
	assert.deepEqual(rows.map(r => r.title), ['A', 'B', 'C']);
	assert.equal(rows[1].sub.length, 2);
	assert.equal(rows[1].external, false);
	assert.deepEqual(cleanResults('nope'), []);
});

test('cleanResults: an app only opens a row with a valid id', () => {
	const rows = cleanResults([
		{ title: 'tile only', app: { icon: 'ti-note' } },
		{ title: 'number', app: 42 },
		{ title: 'bad id', app: 'Not An Id' },
		{ title: 'id', app: 'notes' },
		{ title: 'entry', app: { id: 'notes', icon: 'ti-note' } },
		{ title: 'tile + run', app: { icon: 'ti-note' }, run() {} },
		{ title: 'number + url', app: 42, url: 'x/' }
	]);
	assert.deepEqual(rows.map(r => r.title), ['id', 'entry', 'tile + run', 'number + url']);
	assert.equal(rows[3].app, null);
	assert.deepEqual(rows[2].app, { icon: 'ti-note' });
});

test('excerptParts: only text and marks, leading dash dropped', () => {
	const parts = excerptParts([
		{ name: '#text', text: ' — JSON on the ' },
		{ name: 'MARK', text: 'command' },
		{ name: 'B', text: ' line' },
		{ name: '#text', text: '' }
	]);
	assert.deepEqual(parts, [
		{ mark: false, text: 'JSON on the ' },
		{ mark: true, text: 'command' },
		{ mark: false, text: ' line' }
	]);
});
