/* JPKCom Desktop — tests: editor, notes and tasks data (validation, find, counting, trash restore) and the app kit — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mod, newId, isId } from '../src/apps/kit.js';
import {
	cleanDraft, cleanDoc, draftChars, countLines, countWords, countChars, lineCol, escapeRe, pattern, findMatches,
	replacement, isBinary, WS_RE, WS_CLASS, DEFAULTS
} from '../src/apps/editor/model.js';
import { cleanNotes, titleOf, previewOf, search, dropEmpty, restoreNote } from '../src/apps/notes/model.js';
import { cleanTodos, visible, counts, moveItem, reorder, restoreItem, MAX_TEXT } from '../src/apps/todo/model.js';

/* ---------- Kit ---------- */

test('kit: mod, newId, isId', () => {
	assert.equal(mod({ ctrlKey: true }), true);
	assert.equal(mod({ metaKey: true }), true);
	assert.equal(mod({ ctrlKey: true, altKey: true }), false);
	assert.equal(mod({}), false);
	const a = newId();
	assert.ok(isId(a), a);
	assert.notEqual(a, newId());
	assert.equal(isId('a"]x'), false);
	assert.equal(isId(''), false);
	assert.equal(isId('x'.repeat(41)), false);
	assert.equal(isId(42), false);
});

/* ---------- Editor ---------- */

test('editor: cleanDraft keeps valid tabs, drops duplicates, caps the count, fixes unsafe ids', () => {
	assert.equal(cleanDraft(null), null);
	assert.equal(cleanDraft('x'), null);
	assert.equal(cleanDraft({ tabs: [] }), null);
	const v = cleanDraft({
		tabs: [
			{ id: 'a1', text: 'one', name: 'a.txt', dirty: true, pos: 99 },
			{ id: 'a1', text: 'duplicate' },
			{ id: 'b"]', text: 'unsafe id' },
			{ id: 'c', text: 5 },
			{ id: 'd', text: 'x', name: 'n'.repeat(300), pos: -1 }
		],
		current: 'a1', wrap: true, ws: false
	});
	assert.equal(v.tabs.length, 3);
	assert.deepEqual(v.tabs[0], { id: 'a1', text: 'one', name: 'a.txt', dirty: true, pos: 3 });
	assert.ok(isId(v.tabs[1].id) && v.tabs[1].id !== 'b"]');
	assert.deepEqual({ name: v.tabs[2].name, pos: v.tabs[2].pos }, { name: null, pos: 0 });
	assert.equal(v.current, 'a1');
	assert.equal(v.wrap, true);
	assert.equal(v.ws, false);
	const many = cleanDraft({ tabs: Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, text: '' })) }, { maxTabs: 5 });
	assert.equal(many.tabs.length, 5);
	assert.equal(cleanDraft({ tabs: Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, text: '' })) }).tabs.length, DEFAULTS.maxTabs);
});

test('editor: cleanDraft reads the single-document draft of older versions and applies switch defaults', () => {
	const v = cleanDraft({ text: 'old', name: 'x.md', dirty: false, pos: 2, wrap: true });
	assert.equal(v.tabs.length, 1);
	assert.equal(v.tabs[0].text, 'old');
	assert.equal(v.wrap, true);
	assert.equal(v.ws, true);
	assert.equal(v.current, null);
	const d = cleanDraft({ tabs: [{ id: 'a', text: '' }], current: 'missing' }, { wrap: true, invisibles: false });
	assert.equal(d.current, null);
	assert.equal(d.wrap, true);
	assert.equal(d.ws, false);
	assert.equal(cleanDoc({ text: '' }).name, null);
});

test('editor: counting lines, words, characters, positions', () => {
	assert.equal(countLines(''), 1);
	assert.equal(countLines('a\nb\n'), 3);
	assert.equal(countWords('  one two\nthree '), 3);
	assert.equal(countChars('a😀b'), 3);
	/* the same as the array forms they replace (no arrays: big texts are counted per keystroke) */
	for (const v of ['', ' ', 'a\u00a0b\u3000c', '\ud800\ud800\udc00', '\udc00\ud800', 'x\ud83d\ude00\udc00 y\tz\n']) {
		assert.equal(countChars(v), [...v].length, JSON.stringify(v));
		assert.equal(countWords(v), (v.match(/\S+/g) || []).length, JSON.stringify(v));
	}
	assert.deepEqual(lineCol('ab\ncde', 4), { line: 2, col: 2 });
	assert.deepEqual(lineCol('ab', 0), { line: 1, col: 1 });
	assert.equal(draftChars({ tabs: [{ text: 'abc' }, { text: 'de' }, { text: 1 }] }), 5);
	assert.equal(draftChars(null), 0);
});

test('editor: find patterns, matches and literal replacements', () => {
	assert.equal(pattern(''), null);
	assert.equal(pattern('(', { regex: true }), undefined);
	assert.equal(escapeRe('a.b*'), 'a\\.b\\*');
	const text = 'Foo foo f.o';
	assert.deepEqual(findMatches(text, pattern('foo')), [[0, 3], [4, 7]]);
	assert.deepEqual(findMatches(text, pattern('foo', { matchCase: true })), [[4, 7]]);
	assert.deepEqual(findMatches(text, pattern('f.o')), [[8, 11]]);
	assert.deepEqual(findMatches(text, pattern('f.o', { regex: true })), [[0, 3], [4, 7], [8, 11]]);
	assert.deepEqual(findMatches(text, pattern('f\\.o', { regex: true })), [[8, 11]]);
	/* Empty matches are skipped, the limit holds */
	assert.deepEqual(findMatches('abc', pattern('x*', { regex: true })), []);
	assert.equal(findMatches('aaaa', pattern('a'), 2).length, 2);
	assert.equal('a'.replace(/a/, replacement('$&$1', false)), '$&$1');
	assert.equal('a'.replace(/(a)/, replacement('[$1]', true)), '[a]');
	assert.equal(isBinary('ok\u0000'), true);
	assert.equal(isBinary('ok'), false);
});

test('editor: invisible characters are classified by group', () => {
	const classes = [];
	let m;
	WS_RE.lastIndex = 0;
	/* Written as escapes: raw bidi controls and zero-width characters do not belong in source files */
	const text = 'a  b\tc\u00a0d\u200be\u202ef\u2066g\ufeffh\u3000i';
	while ((m = WS_RE.exec(text))) classes.push(WS_CLASS[m.findIndex((g, k) => k && g)]);
	assert.deepEqual(classes, ['ed-ws-s', 'ed-ws-t', 'ed-ws-u', 'ed-ws-z', 'ed-ws-z', 'ed-ws-z', 'ed-ws-z', 'ed-ws-u']);
	/* The source of the pattern stays plain ASCII */
	assert.match(WS_RE.source, /^[\x20-\x7e]+$/);
});

test('editor: the window code is loaded on demand — the descriptor never imports window.js statically', () => {
	const src = f => readFileSync(new URL(`../src/apps/editor/${f}`, import.meta.url), 'utf8');
	const index = src('index.js');
	assert.doesNotMatch(index, /^\s*import[^(]*['"]\.\/window\.js['"]/m);
	assert.match(index, /load: \(\) => import\('\.\/window\.js'\)/);
	assert.match(index, /windowStyles: \['editor\.css'\]/);
	assert.doesNotMatch(index, /\bstyles: \[/, 'every rule of editor.css is inside the window');
	assert.match(src('window.js'), /^export default \{\n\tmount,/m);
});

/* ---------- Notes ---------- */

test('notes: cleanNotes validates notes and the current id', () => {
	assert.equal(cleanNotes(null), null);
	assert.equal(cleanNotes([1]), null);
	const v = cleanNotes({
		notes: [
			{ id: 'n1', text: 'Hello\nworld', created: 1, modified: 5 },
			{ id: 'n1', text: 'dup', created: 1, modified: 1 },
			{ id: 'n2', text: 'x', created: 'yesterday', modified: 1 },
			{ id: 'n"3', text: 'x', created: 1, modified: 1 },
			{ id: 'n4', text: 'Second', created: 2, modified: 9, extra: true }
		],
		current: 'gone'
	});
	assert.deepEqual(v.notes.map(n => n.id), ['n1', 'n4']);
	assert.equal(v.notes[1].extra, undefined);
	assert.equal(v.current, 'n1');
	assert.equal(cleanNotes({ notes: [], current: 'x' }).current, null);
	assert.equal(cleanNotes({ notes: [{ id: 'a', text: '', created: 1, modified: 1 }], current: 'a' }).current, 'a');
});

test('notes: title, preview, search, empty notes', () => {
	assert.equal(titleOf('\n  Title  \n\nbody'), 'Title');
	assert.equal(previewOf('Title\n\n body '), 'body');
	assert.equal(titleOf('  \n '), null);
	assert.equal(previewOf('only'), null);
	assert.equal(titleOf('x'.repeat(100)).length, 80);
	const notes = [
		{ id: 'a', text: 'Cherry pie', created: 1, modified: 1 },
		{ id: 'b', text: 'Banana', created: 1, modified: 3 },
		{ id: 'c', text: '   ', created: 1, modified: 2 }
	];
	assert.deepEqual(search(notes, '').map(n => n.id), ['b', 'c', 'a']);
	assert.deepEqual(search(notes, ' CHERRY ').map(n => n.id), ['a']);
	assert.deepEqual(dropEmpty(notes, null).map(n => n.id), ['a', 'b']);
	assert.deepEqual(dropEmpty(notes, 'c').map(n => n.id), ['a', 'b', 'c']);
});

test('notes: a restored note becomes current, a taken id is replaced', () => {
	const data = { notes: [{ id: 'a', text: 'x', created: 1, modified: 1 }], current: 'a' };
	const r = restoreNote(data, { id: 'b', text: 'back', created: 1, modified: 2 });
	assert.equal(r.current, 'b');
	assert.equal(r.notes.length, 2);
	const clash = restoreNote(data, { id: 'a', text: 'again', created: 1, modified: 2 });
	assert.notEqual(clash.current, 'a');
	assert.ok(isId(clash.current));
	assert.equal(restoreNote(data, { id: 'z', text: 1 }), null);
	assert.equal(data.notes.length, 1, 'input stays unchanged');
});

/* ---------- Tasks ---------- */

test('todo: cleanTodos validates items and the filter', () => {
	assert.equal(cleanTodos(null), null);
	const v = cleanTodos({
		items: [
			{ id: 't1', text: 'one', done: false, created: 1 },
			{ id: 't1', text: 'dup', done: false, created: 1 },
			{ id: 't2', text: 'x'.repeat(MAX_TEXT + 1), done: false, created: 1 },
			{ id: 't3', text: 'three', done: 'yes', created: 1 },
			{ id: 't4', text: 'four', done: true, created: 4 }
		],
		filter: 'later'
	});
	assert.deepEqual(v.items.map(x => x.id), ['t1', 't4']);
	assert.equal(v.filter, 'all');
	assert.equal(cleanTodos({ items: 'x', filter: 'done' }).filter, 'done');
});

test('todo: filters, counts, moving, reordering, restoring', () => {
	const items = [
		{ id: 'a', text: 'a', done: false, created: 1 },
		{ id: 'b', text: 'b', done: true, created: 2 },
		{ id: 'c', text: 'c', done: false, created: 3 }
	];
	assert.deepEqual(visible(items, 'open').map(x => x.id), ['a', 'c']);
	assert.deepEqual(visible(items, 'done').map(x => x.id), ['b']);
	assert.equal(visible(items, 'all').length, 3);
	assert.deepEqual(counts(items), { open: 2, done: 1, all: 3 });
	assert.deepEqual(moveItem(items, 'b', -1).map(x => x.id), ['b', 'a', 'c']);
	assert.equal(moveItem(items, 'a', -1), null);
	assert.equal(moveItem(items, 'c', 1), null);
	assert.deepEqual(reorder(items, ['c', 'a', 'b']).map(x => x.id), ['c', 'a', 'b']);
	assert.deepEqual(reorder(items, ['c']).map(x => x.id), ['c', 'a', 'b']);
	const r = restoreItem({ items, filter: 'all' }, { id: 'a', text: 'again', done: false, created: 9 });
	assert.equal(r.items.length, 4);
	assert.notEqual(r.items[3].id, 'a');
	assert.equal(restoreItem({ items, filter: 'all' }, { id: 'q', text: 'x' }), null);
});

test('todo: the window code is loaded on demand — the descriptor never imports window.js statically', () => {
	const src = f => readFileSync(new URL(`../src/apps/todo/${f}`, import.meta.url), 'utf8');
	const index = src('index.js');
	assert.doesNotMatch(index, /^\s*import[^(]*['"]\.\/window\.js['"]/m);
	assert.match(index, /load: \(\) => import\('\.\/window\.js'\)/);
	assert.match(index, /windowStyles: \['todo\.css'\]/);
	assert.doesNotMatch(index, /\bstyles: \[/, 'every rule of todo.css is inside the window');
	assert.doesNotMatch(index, /\blet live\b/, 'the trash reaches the window through wm.get()');
	assert.match(src('window.js'), /^export default \{\n\tmount,/m);
});
