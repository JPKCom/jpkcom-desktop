/* JPKCom Desktop — tests: namespaced store and validators — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, V } from '../src/core/store.js';

/* A Storage stand-in; full() makes every write throw like a full quota */
function memory() {
	const m = new Map();
	let full = false;
	return {
		get length() { return m.size; },
		key: i => [...m.keys()][i] ?? null,
		getItem: k => (m.has(k) ? m.get(k) : null),
		setItem(k, v) {
			if (full) throw new DOMException('quota', 'QuotaExceededError');
			m.set(k, String(v));
		},
		removeItem: k => m.delete(k),
		full: on => { full = on; },
		raw: m
	};
}

test('keys carry the namespace prefix', () => {
	const local = memory();
	const s = createStore({ ns: 'demo', local });
	assert.equal(s.key('theme'), 'demo-theme');
	assert.equal(s.set('theme', 'light'), true);
	assert.equal(local.raw.get('demo-theme'), 'light');
	assert.equal(s.get('theme'), 'light');
	s.remove('theme');
	assert.equal(s.get('theme'), null);
});

test('unavailable or full storage never throws', () => {
	const broken = createStore({ ns: 'x', local: () => { throw new Error('blocked'); } });
	assert.equal(broken.get('a'), null);
	assert.equal(broken.set('a', '1'), false);
	assert.deepEqual(broken.names(), []);
	assert.deepEqual(broken.usage(), { own: 0, all: 0 });
	const local = memory();
	const s = createStore({ ns: 'x', local });
	local.full(true);
	assert.equal(s.set('a', '1'), false);
	assert.equal(s.setJson('a', { b: 1 }), false);
});

test('getJson validates and falls back', () => {
	const local = memory();
	const s = createStore({ ns: 'x', local });
	const valid = v => (V.isObj(v) && V.int(v.n, 0, 10) !== null ? { n: v.n } : null);
	assert.equal(s.getJson('cfg', valid, 'fb'), 'fb');
	local.setItem('x-cfg', '{not json');
	assert.equal(s.getJson('cfg', valid, 'fb'), 'fb');
	s.setJson('cfg', { n: 99 });
	assert.equal(s.getJson('cfg', valid, 'fb'), 'fb');
	s.setJson('cfg', { n: 3, extra: true });
	assert.deepEqual(s.getJson('cfg', valid, 'fb'), { n: 3 });
	/* a validator that throws counts as invalid */
	assert.equal(s.getJson('cfg', () => { throw new Error('x'); }, 'fb'), 'fb');
});

test('choice and flag', () => {
	const local = memory();
	const s = createStore({ ns: 'x', local });
	assert.equal(s.choice('size', ['small', 'large'], 'medium'), 'medium');
	s.set('size', 'huge');
	assert.equal(s.choice('size', ['small', 'large'], 'medium'), 'medium');
	s.set('size', 'large');
	assert.equal(s.choice('size', ['small', 'large'], 'medium'), 'large');
	assert.equal(s.flag('seconds', true), true);
	s.setFlag('seconds', false);
	assert.equal(local.raw.get('x-seconds'), 'off');
	assert.equal(s.flag('seconds', true), false);
	s.set('seconds', 'maybe');
	assert.equal(s.flag('seconds', true), true);
});

test('names() and usage() only count own keys', () => {
	const local = memory();
	local.setItem('other-app', 'zzzz');
	const s = createStore({ ns: 'x', local });
	s.set('a', '12');
	s.set('b', '3');
	assert.deepEqual(s.names().sort(), ['a', 'b']);
	const u = s.usage();
	assert.equal(u.own, ('x-a12'.length + 'x-b3'.length) * 2);
	assert.equal(u.all, u.own + ('other-app'.length + 4) * 2);
});

test('change notifications', () => {
	const seen = [];
	const s = createStore({ ns: 'x', local: memory(), notify: n => seen.push(n) });
	s.set('a', 1);
	s.remove('a');
	assert.deepEqual(seen, ['a', 'a']);
});

test('validators', () => {
	assert.equal(V.str('abc', 3), 'abc');
	assert.equal(V.str('abcd', 3), null);
	assert.equal(V.str(5), null);
	assert.equal(V.int(5, 0, 10), 5);
	assert.equal(V.int(5.5, 0, 10), null);
	assert.equal(V.int(11, 0, 10), null);
	assert.equal(V.num(Infinity), null);
	assert.equal(V.num(0.5, 0, 1), 0.5);
	assert.equal(V.bool(false), false);
	assert.equal(V.bool('true'), null);
	assert.equal(V.oneOf('b', ['a', 'b']), 'b');
	assert.equal(V.oneOf('c', ['a', 'b']), null);
	assert.equal(V.hex('#AABBCC'), '#aabbcc');
	assert.equal(V.hex('#abc'), null);
	assert.equal(V.hex('red'), null);
	assert.equal(V.id('notes-1'), 'notes-1');
	assert.equal(V.id('Notes'), null);
	assert.equal(V.id('a b'), null);
	assert.equal(V.id('x"]'), null);
	assert.deepEqual(V.list([1, 'x', 2, 3], v => V.int(v), 2), [1, 2]);
	assert.equal(V.list('nope', v => v), null);
	assert.equal(V.path('/docs/a'), '/docs/a');
	assert.equal(V.path('//evil.example'), null);
	assert.equal(V.path('https://x'), null);
	assert.equal(V.isObj([]), false);
	assert.equal(V.isObj(null), false);
	assert.equal(V.isObj({}), true);
});
