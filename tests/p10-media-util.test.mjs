/* JPKCom Desktop — tests: media players' file types and pure helpers — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSIONS, EXT, ACCEPT, MEDIA_TYPES, kindOf, extOf, stem, formatName, types } from '../src/apps/media/types.js';
import { clock, ratioParts, bitRate, nextIndex, nextOff, repeatAfter, cleanMediaConfig, typeFor, mediaBlob, MEDIA_DEFAULTS } from '../src/apps/media/util.js';
import { readFileSync } from 'node:fs';
import media from '../src/apps/media/index.js';

test('kindOf: MIME type first, then the extension', () => {
	assert.equal(kindOf({ name: 'a.mp3', type: 'audio/mpeg' }), 'audio');
	assert.equal(kindOf({ name: 'a.webm', type: 'audio/webm' }), 'audio', 'MIME wins over the extension');
	assert.equal(kindOf({ name: 'a.ogg', type: 'video/ogg' }), 'video');
	assert.equal(kindOf({ name: 'Clip.MKV', type: '' }), 'video');
	assert.equal(kindOf({ name: 'song.FLAC', type: '' }), 'audio');
	assert.equal(kindOf({ name: 'notes.txt', type: 'text/plain' }), null);
	assert.equal(kindOf({ name: 'mp3', type: '' }), null);
	assert.equal(kindOf(null), null);
});

test('one shared list: extensions, regexes and accept strings agree', () => {
	for (const kind of ['audio', 'video']) {
		for (const ext of EXTENSIONS[kind]) {
			assert.ok(EXT[kind].test(`x${ext.toUpperCase()}`), ext);
			assert.ok(ACCEPT[kind].split(',').includes(ext), ext);
			assert.equal(kindOf({ name: `x${ext}`, type: '' }), kind);
		}
	}
	assert.equal(ACCEPT.audio.split(',')[0], 'audio/*');
	assert.equal(ACCEPT.video.split(',')[0], 'video/*');
	const copy = types();
	copy.extensions.audio.push('.zzz');
	assert.ok(!EXTENSIONS.audio.includes('.zzz'), 'types() hands out copies');
});

test('the shell drop handler sorts every shared extension like media does (no drift)', async () => {
	/* Checks drop.js by behaviour, not by its source text; skipped while the shell module is absent */
	const drop = await import('../src/shell/drop.js').catch(() => null);
	if (typeof drop?.kindOf !== 'function') return;
	for (const kind of ['audio', 'video']) {
		for (const ext of EXTENSIONS[kind]) {
			assert.equal(drop.kindOf({ name: `x${ext}`, type: '' }), kind, ext);
			assert.equal(drop.kindOf({ name: `X${ext.toUpperCase()}`, type: '' }), kind, ext);
		}
	}
});

test('names: extension, stem, format', () => {
	assert.equal(extOf('Track 01.MP3'), 'mp3');
	assert.equal(extOf('noext'), '');
	assert.equal(stem('Track 01.mp3'), 'Track 01');
	assert.equal(stem('a.b.flac'), 'a.b');
	assert.equal(formatName('x.mov', 'video/quicktime'), 'MOV');
	assert.equal(formatName('x.xyz', 'audio/x-foo'), 'audio/x-foo');
	assert.equal(formatName('x.xyz', ''), 'XYZ');
	assert.equal(formatName('noext', ''), '');
});

test('clock', () => {
	assert.equal(clock(0), '0:00');
	assert.equal(clock(205.9), '3:25');
	assert.equal(clock(3727), '1:02:07');
	assert.equal(clock(NaN), '–:––');
	assert.equal(clock(Infinity), '–:––');
	assert.equal(clock(-1), '–:––');
});

test('ratioParts and bitRate', () => {
	assert.deepEqual(ratioParts(1920, 1080), { a: 16, b: 9 });
	assert.deepEqual(ratioParts(1280, 1024), { a: 5, b: 4 });
	assert.equal(ratioParts(1001, 999), null);
	assert.equal(ratioParts(0, 100), null);
	assert.equal(bitRate(1000000, 8), 1000);
	assert.equal(bitRate(1000, NaN), 0);
	assert.equal(bitRate(1000, 0), 0);
});

test('next index and repeat switches', () => {
	assert.equal(nextIndex(0, 3, 'off'), 1);
	assert.equal(nextIndex(2, 3, 'off'), null);
	assert.equal(nextIndex(2, 3, 'all'), 0);
	assert.equal(nextIndex(-1, 3, 'all'), null);
	assert.equal(nextOff(0, 1, 'one'), true);
	assert.equal(nextOff(0, 2, 'off'), false);
	/* a switch toggles its mode; the other mode replaces it */
	assert.equal(repeatAfter('off', 'one'), 'one');
	assert.equal(repeatAfter('one', 'one'), 'off');
	assert.equal(repeatAfter('one', 'all', { count: 3 }), 'all');
	assert.equal(repeatAfter('all', 'one', { count: 3 }), 'one');
	/* the menu sets directly */
	assert.equal(repeatAfter('one', 'one', { direct: true }), 'one');
	/* "repeat playlist" needs two files */
	assert.equal(repeatAfter('off', 'all', { count: 1 }), 'off');
	assert.equal(repeatAfter('off', 'nonsense'), 'off');
});

test('config section media is cleaned', () => {
	const warns = [];
	const warn = m => warns.push(m);
	assert.deepEqual(cleanMediaConfig(undefined, warn), MEDIA_DEFAULTS);
	assert.deepEqual(cleanMediaConfig({ maxItems: 50, seekStep: 10 }, warn), { maxItems: 50, seekStep: 10 });
	assert.deepEqual(cleanMediaConfig({ maxItems: 0, seekStep: 'x' }, warn), MEDIA_DEFAULTS);
	assert.equal(warns.length, 2);
	assert.deepEqual(cleanMediaConfig([1], warn), MEDIA_DEFAULTS);
	assert.equal(warns.length, 3);
});

test('blob types: every accepted extension has a media type of its kind', () => {
	for (const kind of ['audio', 'video']) {
		for (const ext of EXTENSIONS[kind]) {
			assert.match(MEDIA_TYPES[ext.slice(1)] ?? '', new RegExp(`^${kind}/`), ext);
			assert.equal(typeFor(ext, kind), MEDIA_TYPES[ext.slice(1)]);
		}
	}
	assert.equal(typeFor('mp3', 'audio'), 'audio/mpeg');
	assert.equal(typeFor('MKV', 'video'), 'video/x-matroska');
	assert.equal(typeFor('mp3', 'video'), 'application/octet-stream', 'not an extension of this kind');
	assert.equal(typeFor('html', 'audio'), 'application/octet-stream');
	assert.equal(typeFor('', undefined), 'application/octet-stream');
});

test('mediaBlob: never a document type in a player blob URL', () => {
	const file = (body, name, type) => new File([body], name, { type });
	const real = file('ID3', 'song.mp3', 'audio/mpeg');
	assert.equal(mediaBlob(real, 'audio'), real, 'a real media type passes through');
	const empty = mediaBlob(file('x', 'clip.webm', ''), 'video');
	assert.equal(empty.type, 'video/webm');
	assert.equal(empty.size, 1);
	assert.equal(mediaBlob(file('<svg/>', 'song.mp3', 'text/html'), 'audio').type, 'audio/mpeg');
	assert.equal(mediaBlob(file('<svg/>', 'evil.svg', 'image/svg+xml'), 'audio').type, 'application/octet-stream');
	assert.equal(mediaBlob(file('x', 'a.mp4', 'video/mp4; codecs=avc1'), 'video').type, 'video/mp4', 'parameters are not passed on');
});

test('descriptor: the player window loads on demand (no static import of player.js or tags.js), the guards are direct', async () => {
	const src = readFileSync(new URL('../src/apps/media/index.js', import.meta.url), 'utf8');
	assert.doesNotMatch(src, /^\s*(import|export)\b[^;]*from\s*['"]\.\/(player|tags)\.js['"]/m);
	assert.deepEqual(media.windowStyles, ['media.css']);
	assert.equal(media.styles, undefined, 'every rule of media.css is inside the player window');
	for (const app of media.apps) {
		assert.equal(typeof app.load, 'function', app.id);
		assert.match(String(app.load), /import\('\.\/player\.js'\)/, 'a literal import (service worker, preload)');
		assert.equal(app.mount, undefined, `${app.id}: mount comes with load()`);
		assert.equal(app.canPopOut(), false, `${app.id}: never "Open in new tab"`);
		assert.equal(app.canLink({ state: {} }), true, 'an empty player may be linked');
		assert.equal(app.canLink({ state: { media: { snapshot: () => ({ count: 1 }) } } }), false, 'not with files from the device');
	}
});

test('service media: add() and open() wait for the window (win.ready) and resolve with the files added', async () => {
	let svc = null;
	const opened = [];
	const wins = {};
	const fakeWin = kind => {
		let done;
		const got = [];
		const win = { state: {}, ready: new Promise(r => { done = r; }), got };
		win.build = (ok = true) => {
			if (ok) win.state.media = { add: list => (got.push(...list), list.length) };
			done(ok);
		};
		return (wins[kind] = win);
	};
	media.setup({
		provide: (id, s) => { svc = s; },
		wm: { open: kind => (opened.push(kind), wins[kind] ?? fakeWin(kind)) }
	});
	const f = (name, type = '') => ({ name, type });
	const p = svc.open([f('a.mp3', 'audio/mpeg'), f('b.mp4'), f('c.flac'), f('x.txt', 'text/plain')]);
	assert.ok(p instanceof Promise);
	assert.deepEqual(opened, ['audio', 'video'], 'both players open at once, audio first');
	wins.video.build();
	wins.audio.build();
	assert.equal(await p, 3);
	assert.deepEqual(wins.audio.got.map(x => x.name), ['a.mp3', 'c.flac']);
	assert.deepEqual(wins.video.got.map(x => x.name), ['b.mp4']);
	assert.equal(await svc.add('audio', [f('d.ogg')]), 1, 'an open player takes files at once');
	assert.equal(await svc.add('nope', [f('d.ogg')]), 0);
	assert.equal(await svc.add('audio', []), 0);
	assert.equal(await svc.open(null), 0);
	delete wins.video;
	const failed = svc.add('video', [f('e.webm')]);
	wins.video.build(false);
	assert.equal(await failed, 0, 'a window that could not be built takes nothing');
	assert.equal(await media.files.audio.open([f('g.mp3')]), 1, 'the drop handler goes through open()');
});
