/* JPKCom Desktop — tests: URL checks for data (core/url.js) and the registry that uses them — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl, safeUrl } from '../src/core/url.js';
import { createRegistry } from '../src/core/registry.js';

const BASE = 'https://site.example/desk/';
const ORIGIN = 'https://site.example';

test('isSafeUrl(): paths and http(s) pass; schemes, //host and parser tricks do not', () => {
	for (const ok of ['docs/a.html', '/x/y', 'https://other.example/', 'http://a.example/x', 'a b.pdf', '?q=1', '#top']) {
		assert.equal(isSafeUrl(ok), true, ok);
	}
	for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'blob:https://site.example/x', '//evil.example/x',
		'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:x', '/\t/evil.example/x', '/\n/evil.example/x',
		'/\\evil.example/x', '\\\\evil.example', ' /x', '/x ', '\u0000/x', '/x\u007f', '', 'x'.repeat(2001), null, 42]) {
		assert.equal(isSafeUrl(bad), false, JSON.stringify(bad));
	}
});

test('safeUrl(): parses, requires http(s), keeps relative values on the origin', () => {
	assert.equal(safeUrl('docs/a.html', BASE, ORIGIN)?.href, 'https://site.example/desk/docs/a.html');
	assert.equal(safeUrl('https://other.example/x', BASE, ORIGIN)?.href, 'https://other.example/x');
	for (const bad of ['java\tscript:alert(1)', 'java\nscript:alert(1)', '/\t/evil.example/x', '/\\evil.example/x', ' /x', 'javascript:x']) {
		assert.equal(safeUrl(bad, BASE, ORIGIN), null, JSON.stringify(bad));
	}
	/* what the parser would have made of them */
	assert.equal(new URL('java\tscript:alert(1)', BASE).protocol, 'javascript:');
	assert.equal(new URL('/\t/evil.example/x', BASE).host, 'evil.example');
});

test('registry: manifest URLs with control characters or a backslash are refused', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.load({
		collections: [{
			id: 'docs', prefix: 'doc', name: 'Docs', sort: 'manual',
			items: [
				{ slug: 'ok', name: 'OK', url: 'docs/a.html' },
				{ slug: 'tab-js', name: 'Bad', url: 'java\tscript:alert(1)' },
				{ slug: 'nl-host', name: 'Bad', url: '/\n/evil.example/x' },
				{ slug: 'bs-host', name: 'Bad', url: '/\\evil.example/x' }
			]
		}]
	});
	assert.ok(reg.has('doc-ok'));
	for (const id of ['doc-tab-js', 'doc-nl-host', 'doc-bs-host']) assert.equal(reg.has(id), false, id);
	assert.equal(warnings.length, 3);
});

test('registry: item docs and guide links follow the same rule (a bad one is dropped, the item stays)', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.load({
		collections: [{
			id: 'tools', prefix: 'tool', name: 'Tools', sort: 'manual',
			items: [
				{ slug: 'good', name: 'Good', url: 'tools/a/', docs: 'docs/a/', guide: { en: '/en/guide/', de: '/de/anleitung/' } },
				{ slug: 'bad', name: 'Bad', url: 'tools/b/', docs: '/\t/evil.example/x', guide: 'java\tscript:alert(1)' }
			]
		}]
	});
	assert.equal(reg.get('tool-good').docs, 'docs/a/');
	assert.deepEqual({ ...reg.get('tool-good').guide }, { en: '/en/guide/', de: '/de/anleitung/' });
	assert.ok(reg.has('tool-bad'), 'the item itself stays');
	assert.equal(reg.get('tool-bad').docs, undefined);
	assert.equal(reg.get('tool-bad').guide, undefined);
	assert.equal(warnings.length, 2);
});
