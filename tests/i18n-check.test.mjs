/* JPKCom Desktop — tests: the locale checker also checks the locales/ folders of site modules — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* A small project in a temp folder: the tool, en + de core strings, one source file, one site module */
function project(moduleDe) {
	const root = mkdtempSync(join(tmpdir(), 'jpkdesk-i18n-'));
	const put = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	mkdirSync(join(root, 'tools'));
	copyFileSync(join(ROOT, 'tools/i18n-check.mjs'), join(root, 'tools/i18n-check.mjs'));
	put('locales/en/_meta.js', "export default { name: 'English', intl: 'en-GB', dir: 'ltr', yes: '^(y|yes)$' };");
	put('locales/de/_meta.js', "export default { name: 'Deutsch', intl: 'de-DE', dir: 'ltr', yes: '^(j|ja|y|yes)$' };");
	put('locales/en/core.js', "export default { hi: 'Hi' };");
	put('locales/de/core.js', "export default { hi: 'Hallo' };");
	put('src/x.js', "t('hi'); t('mod.greet'); t('mod.opens');");
	put('site/modules/mod/locales/en/mod.js', "export default { greet: 'Hi {name}', opens: { one: '{n} time', other: '{n} times' } };");
	if (moduleDe !== null) put('site/modules/mod/locales/de/mod.js', `export default ${moduleDe};`);
	const run = spawnSync(process.execPath, [join(root, 'tools/i18n-check.mjs')], { encoding: 'utf8' });
	rmSync(root, { recursive: true, force: true });
	return { code: run.status, out: run.stdout + run.stderr };
}

test('i18n-check: a complete site module passes', () => {
	const r = project("{ greet: 'Hallo {name}', opens: { one: '{n}-mal', other: '{n}-mal' } }");
	assert.equal(r.code, 0, r.out);
});

test('i18n-check: a missing language file of a site module is an error', () => {
	const r = project(null);
	assert.equal(r.code, 1, r.out);
	assert.match(r.out, /site\/modules\/mod\/locales\/de\/mod\.js/);
});

test('i18n-check: missing keys and placeholders in a site module are errors', () => {
	const r = project("{ greet: 'Hallo' }");
	assert.equal(r.code, 1, r.out);
	assert.match(r.out, /missing 'opens'/);
	assert.match(r.out, /'greet' placeholders differ/);
});

test('i18n-check: a site module namespace that the core has is an error', () => {
	const root = mkdtempSync(join(tmpdir(), 'jpkdesk-i18n-'));
	const put = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	mkdirSync(join(root, 'tools'));
	copyFileSync(join(ROOT, 'tools/i18n-check.mjs'), join(root, 'tools/i18n-check.mjs'));
	put('locales/en/_meta.js', "export default { name: 'English', intl: 'en-GB', dir: 'ltr', yes: '^(y|yes)$' };");
	put('locales/en/core.js', "export default { hi: 'Hi' };");
	put('src/x.js', "t('hi');");
	put('site/modules/bad/locales/en/core.js', "export default { hi: 'Hijack' };");
	const run = spawnSync(process.execPath, [join(root, 'tools/i18n-check.mjs')], { encoding: 'utf8' });
	rmSync(root, { recursive: true, force: true });
	assert.equal(run.status, 1, run.stdout);
	assert.match(run.stdout, /namespace 'core' is also a core namespace/);
});
