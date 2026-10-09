/* JPKCom Desktop — tests: namespaced store, validators and which keys are this desktop's — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, ownKeys, V } from '../src/core/store.js';

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

/* ---------- Another installation whose namespace starts with this one ('jpkdesk-next' next to 'jpkdesk') ---------- */

/* Declared names as the registry and consent claim them: listed names, and 'consent-<id>' of a registered service */
const declared = (list, services = ['weather', 'x']) => name =>
	list.includes(name) || (name.startsWith('consent-') && services.includes(name.slice(8)));

test('ownKeys: keys of an installation whose namespace starts with this one are not this desktop\'s', () => {
	const keys = [
		'jpkdesk-lang', 'jpkdesk-notes', 'jpkdesk-weather-data', 'jpkdesk-consent-weather', 'jpkdesk-oldmod',
		'jpkdesk-next-lang', 'jpkdesk-next-notes', 'jpkdesk-next-hello', 'jpkdesk-next-consent-weather',
		'jpkdesk2-lang', 'other-app', 'jpkdesk'
	];
	const known = declared(['lang', 'notes', 'weather-data']);
	assert.deepEqual(ownKeys(keys, 'jpkdesk', known), [
		'jpkdesk-lang', 'jpkdesk-notes', 'jpkdesk-weather-data', 'jpkdesk-consent-weather',
		'jpkdesk-oldmod'   // undeclared, no other installation behind it: a leftover of this desktop
	]);
	/* the other installation sees only its own keys anyway */
	assert.deepEqual(ownKeys(keys, 'jpkdesk-next', known), [
		'jpkdesk-next-lang', 'jpkdesk-next-notes', 'jpkdesk-next-hello', 'jpkdesk-next-consent-weather'
	]);
	/* one declared key of it is enough: also its consent keys show it */
	assert.deepEqual(ownKeys(['jpkdesk-lang', 'jpkdesk-next-consent-x', 'jpkdesk-next-hello'], 'jpkdesk', known), ['jpkdesk-lang']);
});

test('ownKeys: a declared name is always this desktop\'s and never shows another installation', () => {
	/* 'weather-data' declared: not a sign of an installation 'jpkdesk-weather', even though 'data' is declared too */
	const known = declared(['weather', 'weather-data', 'data']);
	assert.deepEqual(ownKeys(['jpkdesk-weather-data', 'jpkdesk-weather-x'], 'jpkdesk', known),
		['jpkdesk-weather-data', 'jpkdesk-weather-x']);
	/* 'next-lang' declared here: no sign of 'jpkdesk-next' ('next-x' stays), but 'jpkdesk-next-two' shows */
	const k2 = declared(['lang', 'next-lang']);
	assert.deepEqual(ownKeys(['jpkdesk-next-lang', 'jpkdesk-next-x', 'jpkdesk-next-two-lang', 'jpkdesk-next-two-x'], 'jpkdesk', k2),
		['jpkdesk-next-lang', 'jpkdesk-next-x']);
	/* a declared name under another installation's '<p>-' stays this desktop's */
	const k3 = declared(['lang', 'next-notes']);
	assert.deepEqual(ownKeys(['jpkdesk-next-lang', 'jpkdesk-next-notes', 'jpkdesk-next-x'], 'jpkdesk', k3),
		['jpkdesk-next-notes']);
});

test('ownKeys: namespaces of several segments; only valid namespaces count; undeclared keys alone stay', () => {
	const known = declared(['lang', 'notes']);
	assert.deepEqual(ownKeys(['jpkdesk-a-b-lang', 'jpkdesk-a-b-hello', 'jpkdesk-a-hello', 'jpkdesk-notes'], 'jpkdesk', known),
		['jpkdesk-a-hello', 'jpkdesk-notes'], "'jpkdesk-a-b' shows, 'jpkdesk-a' does not");
	/* '<ns>-<p>' longer than 24 characters is no namespace */
	const long = `jpkdesk-${'a'.repeat(17)}-lang`;
	assert.deepEqual(ownKeys([long], 'jpkdesk', known), [long]);
	assert.deepEqual(ownKeys(['jpkdesk-a_b-lang', 'jpkdesk-A-lang', 'jpkdesk--lang', 'jpkdesk-9x-lang', 'jpkdesk-x--lang'], 'jpkdesk', known),
		['jpkdesk-a_b-lang', 'jpkdesk-A-lang', 'jpkdesk--lang'], "'jpkdesk-9x' and 'jpkdesk-x-' are valid namespaces, the others are none");
	/* without any declared key of it, another installation cannot be told apart */
	assert.deepEqual(ownKeys(['jpkdesk-next-hello'], 'jpkdesk', known), ['jpkdesk-next-hello']);
	/* robust: odd entries, a throwing test, no test */
	assert.deepEqual(ownKeys([null, 5, 'jpkdesk-a'], 'jpkdesk', () => { throw new Error('x'); }), ['jpkdesk-a']);
	assert.deepEqual(ownKeys(['jpkdesk-a'], 'jpkdesk'), ['jpkdesk-a']);
});

test('ownKeys (documented limit): a leftover named \'<x>-<declared name>\' makes \'<ns>-<x>\' look like another installation', () => {
	/* a module no longer on the site left 'reader-lang' and 'reader-pos': 'lang' is declared, so 'jpkdesk-reader'
	   shows, and every 'reader-…' leftover is kept by "Reset everything" (§14 "Whose keys", limit 4) */
	const known = declared(['lang', 'notes']);
	assert.deepEqual(ownKeys(['jpkdesk-lang', 'jpkdesk-reader-lang', 'jpkdesk-reader-pos', 'jpkdesk-oldmod'], 'jpkdesk', known),
		['jpkdesk-lang', 'jpkdesk-oldmod']);
	/* while the module is there its names are declared, and nothing shows */
	const withReader = declared(['lang', 'notes', 'reader-lang', 'reader-pos']);
	assert.deepEqual(ownKeys(['jpkdesk-lang', 'jpkdesk-reader-lang', 'jpkdesk-reader-pos'], 'jpkdesk', withReader),
		['jpkdesk-lang', 'jpkdesk-reader-lang', 'jpkdesk-reader-pos']);
});

test('names(), usage() and owns() leave another installation\'s keys out; claim() declares names', () => {
	const local = memory();
	const s = createStore({ ns: 'jpkdesk', local });
	s.set('lang', 'de');
	s.set('oldmod', '1');
	local.setItem('jpkdesk-next-lang', 'en');
	local.setItem('jpkdesk-next-hello', 'x');
	/* nothing declared yet: the prefix alone cannot tell them apart */
	assert.deepEqual(s.names().sort(), ['lang', 'next-hello', 'next-lang', 'oldmod']);
	const undo = s.claim('lang');
	assert.deepEqual(s.names().sort(), ['lang', 'oldmod']);
	assert.equal(s.owns('jpkdesk-lang'), true);
	assert.equal(s.owns('jpkdesk-next-lang'), false);
	assert.equal(s.owns('jpkdesk-next-hello'), false);
	assert.equal(s.owns('jpkdesk-gone'), true, 'a key just removed (storage event) still counts');
	assert.equal(s.owns('other'), false);
	assert.equal(s.owns(null), false);
	const u = s.usage();
	assert.equal(u.own, ('jpkdesk-langde'.length + 'jpkdesk-oldmod1'.length) * 2);
	assert.equal(u.all, u.own + ('jpkdesk-next-langen'.length + 'jpkdesk-next-hellox'.length) * 2);
	/* removing everything this desktop owns leaves the other installation alone */
	for (const name of s.names()) s.remove(name);
	assert.deepEqual([...local.raw.keys()].sort(), ['jpkdesk-next-hello', 'jpkdesk-next-lang']);
	undo();
	assert.deepEqual(s.names().sort(), ['next-hello', 'next-lang']);
	/* a function claim; a throwing one answers no; anything else is ignored */
	s.claim(name => name === 'lang');
	s.claim(() => { throw new Error('x'); });
	assert.equal(typeof s.claim(42), 'function');
	assert.deepEqual(s.names(), []);
	const broken = createStore({ ns: 'x', local: () => { throw new Error('blocked'); } });
	assert.equal(broken.owns('x-a'), true);
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
