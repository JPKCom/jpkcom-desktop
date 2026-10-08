/* JPKCom Desktop — tests: storage registry (reset groups shown or hidden through visible(), reset of hidden groups) — © Jean Pierre Kolb — MIT License */

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
