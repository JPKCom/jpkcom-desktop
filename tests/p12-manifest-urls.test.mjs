/* JPKCom Desktop — tests: url values in the manifest validator — © Jean Pierre Kolb — MIT License

   tools/validate-manifest.mjs judges every url the way a browser parses it: the URL parser
   drops tab/CR/LF and reads a backslash as '/', so 'java<TAB>script:' would run script and
   '/<TAB>/host' or '/<backslash>host' would load another host. Each case is checked with and
   without a file checker (the CLI passes one, callers of validateManifest may not). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../tools/validate-manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ctx = file => ({
	languages: ['en'],
	modules: new Set(['wm', 'reader']),
	icon: () => 'ok',
	...(file ? { file } : {})
});
const FILES = [() => true, () => false, () => null, null];
const run = (url, kind, file) => validateManifest({ apps: [{ id: 'x', kind, name: 'X', url }] }, ctx(file));

const BAD = ['/\t/evil.example/x', '/\\evil.example/x', '/\\\\evil.example/x', 'java\tscript:alert(1)', 'java\nscript:x',
	'java\rscript:x', ' /x', '/x ', 'x\u0000.html', 'x\u007f.html', '\\\\evil.example/x', '//evil.example/x',
	'javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,x', 'https:\\\\evil.example', 'https://exa mple.org/'];

for (const kind of ['web', 'page', 'link']) {
	test(`validator: unsafe ${kind} urls are refused with and without a file checker`, () => {
		for (const u of BAD) {
			for (const file of FILES) {
				const r = run(u, kind, file);
				assert.ok(r.errors.some(e => /^url\b/.test(e.msg)), `${kind} ${JSON.stringify(u)} (file: ${file ? file() : 'none'}) → ${JSON.stringify(r.errors)}`);
			}
		}
	});
}

test('validator: safe urls still pass (relative, /path, https, encoded space, query, hash)', () => {
	for (const u of ['site/content/en/about.html', './x.html', '/desk/x.html', 'x.html?a=1&b=%20#top', 'https://example.org/a%20b']) {
		for (const file of [() => true, null]) {
			const r = run(u, 'web', file);
			assert.deepEqual(r.errors, [], `${u}: ${JSON.stringify(r.errors)}`);
		}
	}
	assert.deepEqual(run('https://example.org/', 'link', null).errors, []);
	assert.equal(run('http://example.org/', 'web', null).warnings.length, 1, 'http: is a warning for frames');
	const spaced = run('a b.html', 'web', () => true);
	assert.deepEqual(spaced.errors, [], 'a space inside a path is percent-encoded by the parser: allowed, as at runtime');
	assert.ok(spaced.warnings.some(w => /%20/.test(w.msg)), 'but the validator suggests %20');
	assert.ok(run(`${'a'.repeat(2001)}.html`, 'web', null).errors.length, 'too long');
});

test('validator: the file check uses the normalised path', () => {
	const seen = [];
	run('./a/../site/x.html?v=1#y', 'web', p => (seen.push(p), true));
	assert.deepEqual(seen, ['site/x.html']);
	const missing = run('site/nope.html', 'web', () => false);
	assert.ok(missing.errors.some(e => /no such file/.test(e.msg)));
});

/* ---------- scope and linkPaths (web windows) ---------- */

const SCOPE_MANIFEST = {
	apps: [
		{ id: 'ok', kind: 'web', name: 'OK', url: '/wiki/start/', scope: '/wiki/', linkPaths: true },
		{ id: 'up', kind: 'web', name: 'Up', url: '/wiki/start/', scope: '../x/' },
		{ id: 'all', kind: 'web', name: 'All', url: '/wiki/start/', scope: '/' },
		{ id: 'pg', kind: 'page', name: 'Page', url: '/docs/a.html', scope: 'docs/' },
		{ id: 'pl', kind: 'page', name: 'Page links', url: '/docs/b.html', linkPaths: true },
		{ id: 'out', kind: 'web', name: 'Outside', url: '/forum/x/', scope: '/wiki/' },
		{ id: 'notes', scope: '/a/../b/' }
	],
	collections: [{ id: 'wk', name: 'Wiki', itemKind: 'auto', app: null, items: [{ slug: 'x', name: 'X', url: '/wiki/x/', scope: '/wiki/' }] }]
};
const scopeProblems = list => list.filter(p => /scope|linkPaths/.test(p.msg)).map(p => `${p.where}: ${p.msg}`);
const EXPECTED = {
	errors: [/^apps\[1\] 'up': scope "\.\.\/x\/" must be a folder path/, /^apps\[2\] 'all': scope '\/' covers the whole site/, /^apps\[6\] 'notes': scope "\/a\/\.\.\/b\/" must be a folder path/],
	warnings: [/^apps\[3\] 'pg': scope is only used by kind 'web'/, /^apps\[4\] 'pl': linkPaths is only used by kind 'web'/, /^apps\[5\] 'out': the start page '\/forum\/x\/' lies outside scope '\/wiki\/'/]
};
const matchAll = (got, want, what) => {
	assert.equal(got.length, want.length, `${what}: ${JSON.stringify(got, null, 1)}`);
	want.forEach((re, i) => assert.match(got[i], re, what));
};

test('validator: scope and linkPaths', () => {
	const r = validateManifest(SCOPE_MANIFEST, { languages: ['en'], modules: new Set(['wm', 'reader', 'catalog']), icon: () => 'ok', moduleApps: new Map([['notes', 'notes']]) });
	matchAll(scopeProblems(r.errors), EXPECTED.errors, 'errors');
	matchAll(scopeProblems(r.warnings), EXPECTED.warnings, 'warnings');
});

test('validator CLI: --json lists the scope and linkPaths problems', () => {
	const dir = mkdtempSync(join(tmpdir(), 'p12-scope-'));
	try {
		const file = join(dir, 'apps.mjs');
		writeFileSync(file, `export default ${JSON.stringify(SCOPE_MANIFEST)};\n`);
		const run = spawnSync(process.execPath, [join(ROOT, 'tools/validate-manifest.mjs'), '--json', '--manifest', file], { cwd: ROOT, encoding: 'utf8' });
		const out = JSON.parse(run.stdout);
		matchAll(scopeProblems(out.errors), EXPECTED.errors, 'errors');
		matchAll(scopeProblems(out.warnings), EXPECTED.warnings, 'warnings');
		assert.equal(run.status, 1);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
