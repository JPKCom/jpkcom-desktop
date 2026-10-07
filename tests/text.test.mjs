/* JPKCom Desktop — tests: shared text folding and the ⌘-key check (core/text.js, core/env.js) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold } from '../src/core/text.js';
import { hasCmdKey } from '../src/core/env.js';

test('fold(): lower case, no diacritics, ß → ss, locale-aware lower-casing', () => {
	assert.equal(fold('Straße'), 'strasse');
	assert.equal(fold('STRASSE'), 'strasse');
	assert.equal(fold('Ärger Über'), 'arger uber');
	assert.equal(fold('Crème Brûlée', 'fr'), 'creme brulee');
	assert.equal(fold('İstanbul', 'tr'), 'istanbul');
	assert.equal(fold('İstanbul'), 'istanbul');
	assert.equal(fold('Title', 'not a locale!'), 'title');
	assert.equal(fold(null), '');
	assert.equal(fold(42), '42');
});

test('hasCmdKey(): false without a navigator, true on Apple platforms', () => {
	const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	try {
		Object.defineProperty(globalThis, 'navigator', { value: { platform: 'MacIntel' }, configurable: true });
		assert.equal(hasCmdKey(), true);
		Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32' }, configurable: true });
		assert.equal(hasCmdKey(), false);
		Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
		assert.equal(hasCmdKey(), false);
	} finally {
		if (had) Object.defineProperty(globalThis, 'navigator', had);
		else delete globalThis.navigator;
	}
});
