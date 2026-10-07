/* JPKCom Desktop — tests: image viewer helpers and its new-tab rule — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extOf, baseName, isImageFile, typeOf, blobType, formatName, ratioParts, px, svgSizeFromAttrs, deviceSource, megapixelFormat, ACCEPT, MAX_BYTES } from '../src/modules/viewer/util.js';

test('extensions and file names', () => {
	assert.equal(extOf('Photo.JPG'), 'jpg');
	assert.equal(extOf('a/b/logo.svg?x=1#y'), 'svg');
	assert.equal(extOf('Makefile'), '');
	assert.equal(extOf(''), '');
	assert.equal(baseName('site/img/logo.svg?x'), 'logo.svg');
	assert.equal(baseName('https://x.example/a/b.png#c'), 'b.png');
});

test('image files by type, else by extension', () => {
	assert.equal(isImageFile({ type: 'image/png', name: 'x' }), true);
	assert.equal(isImageFile({ type: '', name: 'shot.WEBP' }), true);
	assert.equal(isImageFile({ type: 'text/plain', name: 'notes.txt' }), false);
	assert.equal(isImageFile(null), false);
	assert.ok(ACCEPT.includes('image/svg+xml'));
	assert.equal(MAX_BYTES, 50 * 1024 * 1024);
});

test('types and format names', () => {
	assert.equal(typeOf('', 'logo.svg'), 'image/svg+xml');
	assert.equal(typeOf('application/octet-stream', 'a.jpeg'), 'image/jpeg');
	assert.equal(typeOf('image/png', 'a.jpg'), 'image/png');
	assert.equal(typeOf('image/x-foo', 'a'), 'image/x-foo');
	assert.equal(formatName('image/svg+xml'), 'SVG');
	assert.equal(formatName('image/x-foo'), 'X-FOO');
	assert.equal(formatName('image/vnd.microsoft.icon'), 'ICO');
});

test('aspect ratio reduces to small whole numbers only', () => {
	assert.deepEqual(ratioParts(1920, 1080), { a: 16, b: 9 });
	assert.deepEqual(ratioParts(500, 500), { a: 1, b: 1 });
	assert.equal(ratioParts(1921, 1080), null);
	assert.equal(ratioParts(10.5, 3), null);
	assert.equal(ratioParts(0, 10), null);
});

test('SVG size: width/height in px, else the viewBox', () => {
	assert.equal(px('120'), 120);
	assert.equal(px(' 12.5 px '), 12.5);
	assert.ok(Number.isNaN(px('50%')));
	assert.ok(Number.isNaN(px('10em')));
	assert.deepEqual(svgSizeFromAttrs('200', '100px', null), { w: 200, h: 100, box: false });
	assert.deepEqual(svgSizeFromAttrs('100%', null, '0 0 1000 500'), { w: 1000, h: 500, box: true });
	assert.deepEqual(svgSizeFromAttrs(null, null, '0,0,24,24'), { w: 24, h: 24, box: true });
	assert.equal(svgSizeFromAttrs(null, null, '0 0 0 10'), null);
	assert.equal(svgSizeFromAttrs(null, null, null), null);
});

test('blob type of a device picture: a known image type, else octet-stream', () => {
	assert.equal(blobType('image/png', 'a.png'), 'image/png');
	assert.equal(blobType('', 'logo.SVG'), 'image/svg+xml');
	assert.equal(blobType('text/html', 'a.html'), 'application/octet-stream');
	assert.equal(blobType('image/x-foo', 'a'), 'application/octet-stream');
	assert.equal(blobType('', ''), 'application/octet-stream');
});

test('megapixels: two significant digits below 1 MP, one decimal above', () => {
	const fmt = mp => new Intl.NumberFormat('en', megapixelFormat(mp)).format(mp);
	assert.equal(fmt((64 * 48) / 1e6), '0.0031');
	assert.equal(fmt(0.48), '0.48');
	assert.equal(fmt(12.345678), '12.3');
	assert.equal(fmt(1), '1');
});

test('device pictures: an SVG never gets a blob: URL (data: instead), raster types do', () => {
	assert.equal(deviceSource('image/svg+xml', 'evil.svg'), 'data');
	assert.equal(deviceSource('', 'logo.SVG'), 'data', 'by extension');
	assert.equal(deviceSource('image/svg+xml', 'x.png'), 'data', 'the type wins');
	assert.equal(deviceSource('image/png', 'a.png'), 'blob');
	assert.equal(deviceSource('image/webp', 'a.webp'), 'blob');
	assert.equal(deviceSource('text/html', 'a.html'), 'blob', 'octet-stream blob — never a document type');
});

/* The window kinds' hooks, without a browser: the descriptor's setup hands them to a stub desk */
async function viewerKind() {
	const kinds = {};
	const { default: viewer } = await import('../src/modules/viewer/index.js');
	viewer.setup({ wm: { defineKind: (k, def) => { kinds[k] = def; } }, provide: () => {} });
	return kinds;
}
const winWith = current => ({ state: { viewer: { current } } });

test('viewer: no "copy link" while a device file shows (canLink)', async () => {
	const kinds = await viewerKind();
	for (const kind of ['image', 'viewer']) {
		const def = kinds[kind];
		assert.equal(typeof def.canLink, 'function', kind);
		assert.equal(def.canLink(winWith({ url: 'blob:http://localhost/1', owned: true })), false);
		assert.equal(def.canLink(winWith({ url: 'http://localhost/x.svg', owned: true })), false, 'owned even without blob:');
		assert.equal(def.canLink(winWith({ url: 'http://localhost/site/img/a.png', file: null })), true);
		assert.equal(def.canLink(winWith(null)), true, 'an empty viewer: #app=viewer leads back to it');
		assert.equal(def.canLink({ state: {} }), true);
	}
});

test('viewer: device files never open in a new tab (canPopOut, popOut)', async () => {
	const kinds = await viewerKind();
	for (const kind of ['image', 'viewer']) {
		const def = kinds[kind];
		assert.equal(typeof def.canPopOut, 'function', kind);
		assert.equal(def.canPopOut(winWith({ url: 'blob:http://localhost/1', owned: true })), false);
		assert.equal(def.canPopOut(winWith({ url: 'blob:http://localhost/2' })), false, 'a blob URL even when not owned');
		assert.equal(def.canPopOut(winWith({ url: 'http://localhost/x.svg', owned: true })), false, 'owned even without blob:');
		assert.equal(def.canPopOut(winWith({ url: 'http://localhost/site/img/a.png', file: null })), true);
		assert.equal(def.canPopOut(winWith(null)), false, 'an empty viewer offers nothing');
		assert.equal(def.canPopOut({ state: {} }), false);
	}
	const opened = [];
	const had = Object.hasOwn(globalThis, 'window');
	const saved = globalThis.window;
	globalThis.window = { open: (...a) => { opened.push(a); return null; } };
	try {
		kinds.viewer.popOut(winWith({ url: 'blob:http://localhost/1', owned: true }));
		kinds.image.popOut(winWith({ url: 'BLOB:http://localhost/3' }));
		kinds.viewer.popOut(winWith(null));
		assert.equal(opened.length, 0, 'no window.open for device files');
		kinds.image.popOut(winWith({ url: 'http://localhost/site/img/a.png' }));
		assert.deepEqual(opened, [['http://localhost/site/img/a.png', '_blank', 'noopener']]);
	} finally {
		if (had) globalThis.window = saved;
		else delete globalThis.window;
	}
});
