/* JPKCom Desktop — tests: storage registry (reset groups shown or hidden through visible(), reset of hidden groups, keys of another installation) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../src/core/storage-registry.js';
import { store } from '../src/core/store.js';

/* A Storage stand-in for the shared store (it reads globalThis.localStorage lazily) */
const memory = new Map();
globalThis.localStorage = {
	get length() { return memory.size; },
	key: i => [...memory.keys()][i] ?? null,
	getItem: k => (memory.has(k) ? memory.get(k) : null),
	setItem: (k, v) => memory.set(k, String(v)),
	removeItem: k => memory.delete(k)
};

const ids = list => list.map(g => g.id);

test('reset groups: without visible() a group is always shown; resetGroups() returns the shown ones in order', () => {
	storage.registerGroup({ id: 'plain', label: 'Plain', order: 50 }, 'demo');
	const shown = storage.resetGroups();
	assert.ok(ids(shown).includes('plain'));
	assert.ok(ids(shown).includes('settings'), 'core groups have no predicate');
	assert.ok(shown.every(g => g.shown === true));
	const orders = shown.map(g => g.order);
	assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('reset groups: visible() hides a group while it answers no — { all: true } still lists it, marked', () => {
	let open = false;
	storage.registerGroup({ id: 'secret', label: 'Secret', order: 85, visible: () => open }, 'demo');
	assert.equal(ids(storage.resetGroups()).includes('secret'), false);
	const all = storage.resetGroups({ all: true });
	const g = all.find(x => x.id === 'secret');
	assert.ok(g);
	assert.equal(g.shown, false);
	assert.deepEqual(g.keys, []);
	open = true;
	assert.equal(ids(storage.resetGroups()).includes('secret'), true, 'read live, nothing cached');
	open = 1;
	assert.equal(storage.resetGroups().find(x => x.id === 'secret').shown, true, 'truthy counts');
	open = false;
	assert.equal(ids(storage.resetGroups()).includes('secret'), false);
});

test('reset groups: a stored value of one of its keys always shows a hidden group', () => {
	storage.registerGroup({ id: 'quiet', label: 'Quiet', order: 60, visible: () => false }, 'demo');
	storage.registerKey('quiet-data', { type: 'json', reset: 'quiet' }, 'demo');
	assert.equal(ids(storage.resetGroups()).includes('quiet'), false);
	store.setJson('quiet-data', { a: 1 });
	const g = storage.resetGroups().find(x => x.id === 'quiet');
	assert.ok(g, 'data can never be hidden from a reset');
	assert.deepEqual(g.keys, ['quiet-data']);
	store.remove('quiet-data');
	assert.equal(ids(storage.resetGroups()).includes('quiet'), false);
});

test('reset groups: a throwing visible() shows the group and is reported once', () => {
	const warned = [];
	const { warn } = console;
	console.warn = (...a) => warned.push(a.join(' '));
	try {
		storage.registerGroup({ id: 'broken-pred', label: 'Broken', visible() { throw new Error('boom'); } }, 'demo');
		assert.equal(ids(storage.resetGroups()).includes('broken-pred'), true);
		assert.equal(ids(storage.resetGroups()).includes('broken-pred'), true);
	} finally {
		console.warn = warn;
	}
	assert.equal(warned.filter(w => w.includes("'broken-pred'")).length, 1);
});

test('reset groups: a non-function visible is ignored (shown)', () => {
	storage.registerGroup({ id: 'odd-pred', label: 'Odd', visible: false }, 'demo');
	assert.equal(ids(storage.resetGroups()).includes('odd-pred'), true);
});

test('reset: a hidden group named by id is still reset (keys removed, onReset run)', async () => {
	let ran = 0;
	storage.registerGroup({ id: 'hidden-run', label: 'Hidden', visible: () => false, onReset: () => { ran++; } }, 'demo');
	storage.registerKey('hidden-key', { type: 'text', reset: 'hidden-run' }, 'demo');
	assert.equal(ids(storage.resetGroups()).includes('hidden-run'), false);
	const done = await storage.reset(['hidden-run']);
	assert.deepEqual(done, ['hidden-run']);
	assert.equal(ran, 1);
	store.set('hidden-key', 'x');
	await storage.reset(['hidden-run']);
	assert.equal(store.get('hidden-key'), null);
	assert.equal(ran, 2);
});

test('reset groups: removeModule withdraws hidden groups as well', () => {
	storage.registerGroup({ id: 'gone-pred', label: 'Gone', visible: () => false }, 'gone');
	assert.ok(ids(storage.resetGroups({ all: true })).includes('gone-pred'));
	storage.removeModule('gone');
	assert.equal(ids(storage.resetGroups({ all: true })).includes('gone-pred'), false);
});

/* ---------- Another installation whose namespace starts with this one ('jpkdesk-next' next to 'jpkdesk', §14) ---------- */

test('another installation: names(), usage(), backup, revokeAll and "everything" leave its keys alone', async () => {
	const { revokeAll } = await import('../src/core/consent.js');
	assert.equal(store.prefix, 'jpkdesk-');
	for (const k of [...memory.keys()]) memory.delete(k);
	try {
		/* this desktop: core 'lang', a module key, a consent, a leftover of a module no longer there */
		storage.registerKey('foreign-test', { type: 'json' }, 'foreign-demo');
		store.set('lang', 'en');
		store.setJson('foreign-test', { a: 1 });
		store.set('consent-weather', 'on');
		store.set('removed-mod', 'x');
		/* the other installation 'jpkdesk-next': names declared here, a consent, a module unknown here */
		const theirs = {
			'jpkdesk-next-lang': 'de', 'jpkdesk-next-foreign-test': '{"a":2}', 'jpkdesk-next-consent-weather': 'on',
			'jpkdesk-next-hello': '{"n":1}'
		};
		for (const [k, v] of Object.entries(theirs)) memory.set(k, v);

		assert.deepEqual(store.names().sort(), ['consent-weather', 'foreign-test', 'lang', 'removed-mod']);
		assert.equal(store.owns('jpkdesk-next-hello'), false);
		assert.equal(store.owns('jpkdesk-consent-weather'), true);
		const u = store.usage();
		const theirSize = Object.entries(theirs).reduce((n, [k, v]) => n + (k.length + v.length) * 2, 0);
		assert.equal(u.all - u.own, theirSize);

		/* backup: names only, never their keys; a file with their names knows none of them */
		const doc = storage.snapshot();
		assert.deepEqual(Object.keys(doc.data).sort(), ['foreign-test', 'lang']);
		const res = storage.inspect({ format: doc.format, data: { 'next-lang': 'de', 'next-foreign-test': { a: 2 }, lang: 'en' } });
		assert.deepEqual(res.entries.map(e => e.name), ['lang']);
		assert.deepEqual(res.unknown.sort(), ['next-foreign-test', 'next-lang']);

		/* revoking every consent leaves theirs */
		revokeAll();
		assert.equal(store.get('consent-weather'), null);
		assert.equal(memory.get('jpkdesk-next-consent-weather'), 'on');

		/* Settings → Reset with everything picked removes every name of store.names() (settings-window.js runReset) */
		for (const name of store.names()) store.remove(name);
		assert.deepEqual([...memory.keys()].sort(), Object.keys(theirs).sort());
	} finally {
		storage.removeModule('foreign-demo');
		for (const k of [...memory.keys()]) memory.delete(k);
	}
});

test('another installation named \'<ns>-consent\': consent declares only its registered services\' keys holding \'on\'', async () => {
	const { revokeAll, register, unregister } = await import('../src/core/consent.js');
	for (const k of [...memory.keys()]) memory.delete(k);
	try {
		register({ id: 'weather', hosts: 'api.example.org' }, 'consent-demo');
		store.set('lang', 'en');
		store.set('consent-weather', 'on');
		store.set('consent-gone', 'on');        // a service no longer here: a leftover of this desktop
		/* the other installation 'jpkdesk-consent' (a valid namespace): core names, a module key, its consent */
		const theirs = {
			'jpkdesk-consent-lang': 'de', 'jpkdesk-consent-session': '{}', 'jpkdesk-consent-notes': '{"notes":[1]}',
			'jpkdesk-consent-consent-weather': 'on'
		};
		for (const [k, v] of Object.entries(theirs)) memory.set(k, v);

		/* it shows: its keys are not this desktop's; the registered consent stays this desktop's */
		assert.equal(store.owns('jpkdesk-consent-notes'), false);
		assert.equal(store.owns('jpkdesk-consent-lang'), false);
		assert.equal(store.owns('jpkdesk-consent-consent-weather'), false);
		assert.equal(store.owns('jpkdesk-consent-weather'), true);
		/* a leftover consent under '<ns>-consent-' now looks like its key (§14 limits): kept, not deleted */
		assert.deepEqual(store.names().sort(), ['consent-weather', 'lang']);

		/* Settings → Reset with only "Settings" picked revokes this desktop's consents only */
		revokeAll();
		assert.equal(store.get('consent-weather'), null);
		for (const [k, v] of Object.entries(theirs)) assert.equal(memory.get(k), v, k);
		/* the key of a revoked consent (a 'storage' event in another tab) is still judged this desktop's */
		assert.equal(store.owns('jpkdesk-consent-weather'), true);

		/* "everything" */
		for (const name of store.names()) store.remove(name);
		assert.deepEqual([...memory.keys()].sort(), ['jpkdesk-consent-gone', ...Object.keys(theirs)].sort());
	} finally {
		unregister('weather');
		for (const k of [...memory.keys()]) memory.delete(k);
	}
});

test('revokeAll removes consent keys only: a \'consent-…\' key that holds something else stays', async () => {
	const { revokeAll } = await import('../src/core/consent.js');
	for (const k of [...memory.keys()]) memory.delete(k);
	try {
		/* an installation 'jpkdesk-consent' that has written only names not declared here cannot be told
		   apart (§14 limits), so its keys count as this desktop's — a partial reset still leaves them */
		memory.set('jpkdesk-consent-hello', '{"n":1}');
		store.set('consent-old', 'on');
		assert.deepEqual(store.names().sort(), ['consent-hello', 'consent-old']);
		revokeAll();
		assert.deepEqual([...memory.keys()], ['jpkdesk-consent-hello']);
	} finally {
		for (const k of [...memory.keys()]) memory.delete(k);
	}
});
