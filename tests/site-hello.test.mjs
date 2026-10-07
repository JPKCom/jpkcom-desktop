/* JPKCom Desktop — tests: the example site app "Hello" (stored data, texts) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHello, clip, EMPTY, MAX_NAME } from '../site/modules/hello/model.js';
import en from '../site/modules/hello/locales/en/hello.js';
import de from '../site/modules/hello/locales/de/hello.js';

test('hello: cleanHello keeps a valid value and repairs the rest', () => {
	assert.deepEqual(cleanHello({ name: '  Alex ', opens: 3 }), { name: 'Alex', opens: 3 });
	assert.deepEqual(cleanHello({ name: 7, opens: -1 }), { name: '', opens: 0 });
	assert.deepEqual(cleanHello({ opens: 2.5 }), { name: '', opens: 0 });
	assert.deepEqual(cleanHello({ name: 'x', opens: Number.MAX_SAFE_INTEGER + 1 }), { name: 'x', opens: 0 });
	for (const bad of [null, undefined, 'x', 5, [], [1]]) assert.equal(cleanHello(bad), null, JSON.stringify(bad));
	assert.deepEqual(EMPTY, { name: '', opens: 0 });
	assert.ok(Object.isFrozen(EMPTY));
});

test('hello: names are cut at 60 characters, never inside a character', () => {
	assert.equal(MAX_NAME, 60);
	assert.equal(clip('a'.repeat(70)).length, 60);
	const smile = '\u{1F600}';
	const cut = clip(smile.repeat(61));
	assert.equal([...cut].length, 60);
	assert.equal(cut, smile.repeat(60), 'no half surrogate pair at the end');
	assert.equal(cleanHello({ name: smile.repeat(61), opens: 0 }).name, smile.repeat(60));
});

test('hello: en and de have the same keys, placeholders and plural forms', () => {
	assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
	assert.match(en.greeting, /\{name\}/);
	assert.match(de.greeting, /\{name\}/);
	for (const d of [en, de]) {
		assert.equal(typeof d.opens.one, 'string');
		assert.match(d.opens.other, /\{n\}/);
	}
});
