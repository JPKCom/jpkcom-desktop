/* JPKCom Desktop — tests: one version number everywhere — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/core/env.js';

test('version: package.json and src/core/env.js agree (backups, cache names and About read VERSION)', () => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	assert.equal(pkg.version, VERSION);
	assert.match(VERSION, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});
