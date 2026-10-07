/* JPKCom Desktop — tests: the DOM helper's guards (no HTML parsing, event names) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORBIDDEN, checkProps, eventName, saveFile } from '../src/core/dom.js';

test('dom: props {} cannot smuggle in HTML parsing', () => {
	for (const k of ['innerHTML', 'outerHTML', 'srcdoc', 'insertAdjacentHTML', 'setHTMLUnsafe']) {
		assert.ok(FORBIDDEN.has(k), k);
		assert.throws(() => checkProps({ value: 'x', [k]: '<img src=x onerror=alert(1)>' }), /not allowed/);
	}
	assert.deepEqual(checkProps({ value: 'x', checked: true }), { value: 'x', checked: true });
	assert.equal(checkProps(undefined), undefined);
});

test('dom: on<Event> props become the right event names', () => {
	assert.equal(eventName('onclick'), 'click');
	assert.equal(eventName('onClick'), 'click');
	assert.equal(eventName('onKeyDown'), 'keydown');
	assert.equal(eventName('onjpkdesk:lang:change'), 'jpkdesk:lang:change');
	assert.equal(eventName('onmy-Event'), 'my-Event');
});

test('dom: saveFile hands a Blob (a device file) on as application/octet-stream, through <a download> only', () => {
	const made = [];
	const anchors = [];
	const saved = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
	globalThis.document = {
		createElement: tag => {
			const el = { tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, click() { anchors.push({ ...this.attrs }); }, remove() {} };
			return el;
		},
		body: { append() {} }
	};
	URL.createObjectURL = blob => {
		made.push(blob.type);
		return `blob:test/${made.length}`;
	};
	URL.revokeObjectURL = () => {};
	try {
		saveFile(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>'], { type: 'image/svg+xml' }), 'evil.svg');
		saveFile('{}', 'b.json', 'application/json');
		assert.deepEqual(made, ['application/octet-stream', 'application/json']);
		assert.ok(anchors.every(a => 'download' in a && /^blob:/.test(a.href)), 'every blob: href is a download');
		assert.equal(anchors[0].download, 'evil.svg');
	} finally {
		if (saved.document === undefined) delete globalThis.document;
		else globalThis.document = saved.document;
		URL.createObjectURL = saved.create;
		URL.revokeObjectURL = saved.revoke;
	}
});
