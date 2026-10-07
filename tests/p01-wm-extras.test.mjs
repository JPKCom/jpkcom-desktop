/* JPKCom Desktop — tests: WM extras (snap zones, tile menu config, overview grid, session validation) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zoneAt, cleanEdge } from '../src/wm/snap.js';
import { cleanTileMenu } from '../src/wm/tilemenu.js';
import { cleanOverview, overviewGrid, overviewMove } from '../src/wm/overview.js';
import { readSession, entryOf, validSession, validKeep, MAX_STATE, cleanSession, topmost } from '../src/wm/session.js';

/* ---------- snap ---------- */

test('snap: zoneAt — top edge zooms, side edges tile, the middle is free', () => {
	assert.equal(zoneAt(500, 0, 1000, 8), 'max');
	assert.equal(zoneAt(500, -5, 1000, 8), 'max');
	assert.equal(zoneAt(0, 0, 1000, 8), 'max', 'the top wins in the corner');
	assert.equal(zoneAt(8, 300, 1000, 8), 'left');
	assert.equal(zoneAt(-20, 300, 1000, 8), 'left');
	assert.equal(zoneAt(992, 300, 1000, 8), 'right');
	assert.equal(zoneAt(1200, 300, 1000, 8), 'right');
	assert.equal(zoneAt(9, 300, 1000, 8), null);
	assert.equal(zoneAt(500, 1, 1000, 8), null);
	assert.equal(zoneAt(16, 300, 1000, 18), 'left', 'touch: wider edge');
	assert.equal(zoneAt(16, 300, 1000, 8), null);
	assert.equal(zoneAt(NaN, 300, 1000, 8), null);
});

test('snap: cleanEdge accepts [mouse, touch] and falls back otherwise', () => {
	const warns = [];
	assert.deepEqual(cleanEdge([4, 30]), [4, 30]);
	assert.deepEqual(cleanEdge(undefined, m => warns.push(m)), [8, 18]);
	assert.equal(warns.length, 0, 'missing is not an error');
	assert.deepEqual(cleanEdge([4], m => warns.push(m)), [8, 18]);
	assert.deepEqual(cleanEdge([-1, 5], m => warns.push(m)), [8, 18]);
	assert.deepEqual(cleanEdge('8', m => warns.push(m)), [8, 18]);
	assert.equal(warns.length, 3);
});

/* ---------- tile menu ---------- */

test('tile menu: cleanTileMenu — defaults, overrides, off, invalid values', () => {
	const warns = [];
	const w = m => warns.push(m);
	assert.deepEqual(cleanTileMenu(undefined, w), { delay: 450, hideDelay: 250 });
	assert.deepEqual(cleanTileMenu({ delay: 300 }, w), { delay: 300, hideDelay: 250 });
	assert.equal(cleanTileMenu(false, w), null);
	assert.deepEqual(cleanTileMenu({ delay: -1, hideDelay: 'x' }, w), { delay: 450, hideDelay: 250 });
	assert.deepEqual(cleanTileMenu([1, 2], w), { delay: 450, hideDelay: 250 });
	assert.equal(warns.length, 3);
});

/* ---------- overview ---------- */

test('overview: cleanOverview — defaults and validation', () => {
	const warns = [];
	const w = m => warns.push(m);
	assert.deepEqual(cleanOverview(undefined, w), { labelHeight: 30, padding: [12, 40] });
	assert.deepEqual(cleanOverview({ labelHeight: 24, padding: [8, 32] }, w), { labelHeight: 24, padding: [8, 32] });
	assert.deepEqual(cleanOverview({ labelHeight: 'big', padding: [1] }, w), { labelHeight: 30, padding: [12, 40] });
	assert.equal(warns.length, 2);
});

test('overview: one small window stays at its size and moves to the centre', () => {
	const area = { w: 1200, h: 800 };
	const { cols, cells } = overviewGrid([{ x: 0, y: 0, w: 400, h: 300 }], area, { pad: 40, label: 30 });
	assert.equal(cols, 1);
	assert.equal(cells[0].s, 1);
	const centreX = 0 + 400 / 2 + cells[0].dx;
	assert.equal(centreX, 600);
	assert.equal(cells[0].cx, 600);
	/* the label sits under the window */
	assert.ok(cells[0].bottom > 0 && cells[0].bottom < 800);
});

test('overview: four equal windows make a 2 × 2 grid, scales never exceed 1', () => {
	const r = { x: 100, y: 100, w: 800, h: 600 };
	const { cols, cells } = overviewGrid([r, r, r, r], { w: 1280, h: 760 }, { pad: 40, label: 30 });
	assert.equal(cols, 2);
	assert.equal(cells.length, 4);
	for (const c of cells) assert.ok(c.s > 0 && c.s <= 1);
	/* same row → same centre line; next row lower */
	assert.equal(cells[0].bottom, cells[1].bottom);
	assert.ok(cells[2].bottom > cells[0].bottom);
	assert.ok(cells[1].cx > cells[0].cx);
});

test('overview: a short last row is centred', () => {
	const r = { x: 0, y: 0, w: 600, h: 400 };
	const area = { w: 1200, h: 800 };
	const { cols, cells } = overviewGrid([r, r, r], area, { pad: 40, label: 30 });
	assert.equal(cols, 2);
	/* the third window (alone in row 2) is in the middle of the area */
	assert.equal(Math.round(cells[2].cx), 600);
});

test('overview: empty list and tiny areas do not break', () => {
	assert.deepEqual(overviewGrid([], { w: 100, h: 100 }), { cols: 0, cells: [] });
	const { cells } = overviewGrid([{ x: 0, y: 0, w: 900, h: 700 }], { w: 50, h: 40 }, { pad: 40, label: 30 });
	assert.ok(cells[0].s > 0, 'scale stays positive');
});

test('overview: keyboard moves inside the grid', () => {
	assert.equal(overviewMove(0, 5, 3, 'ArrowRight'), 1);
	assert.equal(overviewMove(4, 5, 3, 'ArrowRight'), 4, 'stops at the end');
	assert.equal(overviewMove(0, 5, 3, 'ArrowLeft'), 0, 'stops at the start');
	assert.equal(overviewMove(1, 5, 3, 'ArrowDown'), 4);
	assert.equal(overviewMove(2, 5, 3, 'ArrowDown'), 4, 'clamped to the last');
	assert.equal(overviewMove(4, 5, 3, 'ArrowUp'), 1);
	assert.equal(overviewMove(4, 5, 3, 'Tab'), 0, 'Tab wraps');
	assert.equal(overviewMove(0, 5, 3, 'Tab', true), 4, 'Shift+Tab wraps back');
	assert.equal(overviewMove(0, 5, 3, 'a'), null);
	assert.equal(overviewMove(0, 0, 3, 'Tab'), null);
});

/* ---------- session ---------- */

const APPS = {
	notes: { id: 'notes', kind: 'app' },
	about: { id: 'about', kind: 'page' },
	calc: { id: 'calc', kind: 'app', fixed: true },
	launcher: { id: 'launcher', kind: 'launcher' },
	gh: { id: 'gh', kind: 'link' },
	dropped: { id: 'dropped', kind: 'image', transient: true }
};
const ctx = (extra = {}) => ({
	max: 20,
	minSize: [280, 180],
	lookup: id => APPS[id] ?? null,
	accept: (app, url) => (app.kind === 'page' && url.startsWith('/site/') ? url : null),
	...extra
});

test('session: shape check and the restore switch', () => {
	assert.equal(validSession(null), null);
	assert.equal(validSession({ v: 2, wins: [] }), null);
	assert.equal(validSession({ v: 1, wins: {} }), null);
	assert.ok(validSession({ v: 1, wins: [] }));
	assert.equal(validKeep('on'), 'on');
	assert.equal(validKeep('off'), 'off');
	assert.equal(validKeep('yes'), null);
	assert.equal(readSession('nonsense', ctx()), null);
	assert.equal(readSession([1, 2], ctx()), null);
});

test('session: only known apps that can open, once each, no launcher/link/transient', () => {
	const s = readSession({
		v: 1, active: 'notes',
		wins: [
			{ id: 'ghost' }, { id: 'notes' }, { id: 'notes' }, { id: 'launcher' }, { id: 'gh' }, { id: 'dropped' },
			{ id: 'Bad Id' }, null, 'x', { id: 'about' }
		]
	}, ctx());
	assert.deepEqual(s.list.map(w => w.app.id), ['notes', 'about']);
	assert.equal(s.active, 'notes');
});

test('session: at most max windows — the topmost ones are kept', () => {
	const wins = ['notes', 'about', 'calc'].map(id => ({ id }));
	const s = readSession({ v: 1, wins }, ctx({ max: 2 }));
	assert.deepEqual(s.list.map(w => w.app.id), ['about', 'calc']);
});

test('session: max 0 keeps no window (slice(-0) would keep all)', () => {
	const wins = ['notes', 'about'].map(id => ({ id }));
	assert.deepEqual(readSession({ v: 1, wins }, ctx({ max: 0 })).list, []);
	assert.deepEqual(topmost([1, 2, 3], 0), []);
	assert.deepEqual(topmost([1, 2, 3], 2), [2, 3]);
	assert.deepEqual(topmost([1, 2, 3], 9), [1, 2, 3]);
});

test('session: cleanSession — defaults, valid values, warned fallbacks', () => {
	const D = { restore: true, debounceMs: 400, maxWindows: 20 };
	const msgs = [];
	const warn = m => msgs.push(m);
	assert.deepEqual(cleanSession(undefined, warn), D);
	assert.equal(msgs.length, 0);
	assert.deepEqual(cleanSession({ restore: false, debounceMs: 0, maxWindows: 0 }, warn),
		{ restore: false, debounceMs: 0, maxWindows: 0 });
	assert.equal(msgs.length, 0);
	assert.deepEqual(cleanSession({}, warn), D);
	assert.equal(msgs.length, 0);
	assert.deepEqual(cleanSession({ restore: 'off', debounceMs: -1, maxWindows: 2.5 }, warn), D);
	assert.equal(msgs.length, 3);
	assert.deepEqual(cleanSession({ debounceMs: NaN, maxWindows: -3 }, warn), D);
	assert.equal(msgs.length, 5);
	assert.deepEqual(cleanSession('x', warn), D);
	assert.equal(msgs.length, 6);
});

test('session: rectangles, layouts, min, url, state are validated', () => {
	const s = readSession({
		v: 1, active: '<script>',
		wins: [
			{ id: 'notes', rect: { x: 10, y: 20, w: 100, h: 50 }, layout: 'left', min: 'yes', url: '/site/x', state: { a: 1 } },
			{ id: 'about', rect: { x: 1, y: 2, w: Infinity, h: 300 }, layout: 'diagonal', min: true, url: '/site/page.html' },
			{ id: 'calc', rect: { x: 1, y: 2, w: 300, h: 300 }, layout: 'max', url: '//evil.example/', state: { big: 'x'.repeat(MAX_STATE) } }
		]
	}, ctx());
	const [notes, about, calc] = s.list;
	assert.deepEqual(notes.rect, { x: 10, y: 20, w: 280, h: 180 }, 'grown to the minimum size');
	assert.equal(notes.layout, 'left');
	assert.equal(notes.min, false, 'only true counts');
	assert.equal(notes.url, null, 'kind does not accept it');
	assert.deepEqual(notes.state, { a: 1 });
	assert.equal(about.rect, null, 'non-finite rect dropped');
	assert.equal(about.layout, null);
	assert.equal(about.min, true);
	assert.equal(about.url, '/site/page.html');
	assert.equal(calc.layout, null, 'fixed windows take no layout');
	assert.equal(calc.url, null, 'protocol-relative url refused before the kind sees it');
	assert.equal(calc.state, null, 'oversized state dropped');
	assert.equal(s.active, null, 'invalid active id');
});

test('session: a throwing lookup or accept never breaks reading', () => {
	const s = readSession({ v: 1, wins: [{ id: 'notes', url: '/site/a' }, { id: 'about', url: '/site/b' }] }, ctx({
		lookup: id => {
			if (id === 'notes') throw new Error('boom');
			return APPS[id];
		},
		accept: () => {
			throw new Error('boom');
		}
	}));
	assert.deepEqual(s.list.map(w => [w.app.id, w.url]), [['about', null]]);
});

test('session: entryOf rounds the rectangle and caps the state', () => {
	const win = { app: { id: 'notes' }, rect: { x: 10.4, y: 20.6, w: 300.5, h: 200.2 }, layout: 'right', min: 1 };
	assert.deepEqual(entryOf(win, '/site/a', { n: 1 }), {
		id: 'notes', rect: { x: 10, y: 21, w: 301, h: 200 }, layout: 'right', min: true, url: '/site/a', state: { n: 1 }
	});
	const big = entryOf({ ...win, layout: 'weird' }, null, { s: 'x'.repeat(MAX_STATE + 1) });
	assert.equal(big.state, null);
	assert.equal(big.layout, null);
	assert.equal(big.url, null);
	/* round trip: what is written can be read back */
	const back = readSession({ v: 1, active: 'notes', wins: [entryOf(win, null, { n: 1 })] }, ctx());
	assert.equal(back.list[0].layout, 'right');
	assert.equal(back.list[0].min, true);
	assert.deepEqual(back.list[0].state, { n: 1 });
});
