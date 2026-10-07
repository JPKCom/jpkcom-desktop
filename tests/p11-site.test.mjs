/* JPKCom Desktop — tests: the example site (manifest, content, data) and the manifest validator — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest, validateSiteData } from '../tools/validate-manifest.mjs';
import { cleanFortunes } from '../src/apps/fortune/model.js';
import { parseFeed } from '../src/modules/notify/core.js';
import manifest from '../site/apps.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'de'];

const walk = (dir, out = []) => {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
};

/* ---------- The validator ---------- */

const ctx = (over = {}) => ({
	languages: LANGS,
	tints: new Set(['slate', 'blue', 'orange']),
	moduleApps: new Map([['notes', 'notes'], ['about-desktop', 'panels'], ['launcher', 'shell']]),
	modules: new Set(['wm', 'shell', 'panels', 'reader', 'viewer', 'catalog', 'notes']),
	authorLinks: ['github'],
	icon: id => (['ti-book', 'ti-user', 'jpk'].includes(id) ? 'ok' : id === 'ti-cookie' ? 'build' : 'unknown'),
	file: () => true,
	i18n: (ns, key) => ns === 'notes' && key === 'appName',
	...over
});

test('validator: a clean manifest passes', () => {
	const r = validateManifest({
		apps: [
			{ id: 'about', kind: 'page', icon: 'ti-book', tint: 'slate', name: { en: 'About', de: 'Über' }, url: { en: 'a.html', de: 'b.html' } },
			{ id: 'notes', dock: true },
			{ id: 'me', alias: 'author-github' }
		],
		collections: [{ id: 'links', name: 'Links', groups: [{ id: 'g', name: 'G' }], items: [{ slug: 'x', group: 'g', name: 'X', url: 'https://example.org/' }] }],
		menus: [{ label: { en: 'Pages', de: 'Seiten' }, items: ['about', '-', { collection: 'links' }, { label: '@notes.appName', url: 'a.html' }] }],
		files: { about: 'a.md' }
	}, ctx());
	assert.deepEqual(r.errors, []);
	assert.deepEqual(r.warnings, []);
	assert.deepEqual(r.stats, { apps: 2, collections: 1, items: 1, menus: 1, files: 1 });
});

test('validator: finds bad ids, kinds, references, urls, icons, tints and missing languages', () => {
	const r = validateManifest({
		apps: [
			{ id: 'Bad Id', kind: 'page', name: 'x' },
			{ id: 'a', kind: 'page', name: { en: 'A' }, url: 'javascript:alert(1)', icon: 'ti-nope', tint: 'purple' },
			{ id: 'a', kind: 'web', name: 'A again', url: 'x.html' },
			{ id: 'l', kind: 'link', name: 'L', url: 'http://example.org/' },
			{ id: 'ghost', alias: 'nowhere' },
			{ id: 'over', dock: true },
			{ id: 'p', kind: 'page', name: 'P' },
			{ id: 'm', kind: 'page', name: 'M', url: '//host/x', mark: 'TOOLONG' }
		],
		collections: [
			{ id: 'c', name: 'C', groups: [{ id: 'g', name: 'G' }, { id: 'g', name: 'G2' }],
				items: [{ slug: 'x', group: 'zz', name: 'X', url: 'https://e.org/' }, { slug: 'x', group: 'g', name: 'dup', url: 'y' }, { slug: 'y', group: 'g', app: 'none' }] },
			{ id: 'c', name: 'twice' }
		],
		menus: [{ label: 'M', items: ['missing', { collection: 'nope' }, { label: 'x' }] }, { items: [] }],
		files: { about: 'javascript:x' }
	}, ctx({ config: { site: { legal: ['imprint'], defaultPageApp: 'about' } } }));
	const all = r.errors.map(e => `${e.where}: ${e.msg}`).join('\n');
	for (const part of [
		"'Bad Id': id must match",
		"no text for 'de'",
		'protocol javascript: is not allowed',
		"icon 'ti-nope' does not exist",
		"duplicate id 'a'",
		'a link needs an absolute https:// address',
		"alias target 'nowhere' does not exist",
		"a 'page' app needs a url",
		'protocol-relative',
		'mark must be 1–4 characters',
		"group 'g' is defined twice",
		"unknown group 'zz'",
		"slug 'x' is used twice",
		"alias target 'none' does not exist",
		"collection 'c' is defined twice",
		"app 'missing' does not exist",
		"collection 'nope' does not exist",
		'needs a url or items',
		'menus[1]: label is missing',
		"files 'about'",
		"config site.legal[0]: app 'imprint' does not exist",
		"config site.defaultPageApp: app 'about' does not exist"
	]) assert.ok(all.includes(part), `expected: ${part}\n---\n${all}`);
	const warns = r.warnings.map(e => `${e.where}: ${e.msg}`).join('\n');
	assert.match(warns, /tint 'purple' is not in config\.theme\.tints/);
	assert.match(warns, /override record for 'over'/);
	assert.ok(!all.includes('also used by'), 'a duplicate site id is reported once');
});

test('validator: terminal files in the object form { url, aliases }', () => {
	const ok = validateManifest({
		files: {
			readme: { url: 'README.md', aliases: ['about.md', 'info'] },
			guide: { url: { en: 'en/guide.md', de: 'de/guide.md' } },
			plain: { en: 'en/a.md', de: 'de/a.md' }
		}
	}, ctx());
	assert.deepEqual(ok.errors, []);
	assert.deepEqual(ok.warnings, [], 'aliases is no language');
	assert.equal(ok.stats.files, 3);
	const bad = validateManifest({
		files: {
			a: { url: 'javascript:x', aliases: ['ok'] },
			b: { url: 'b.md', aliases: 'b2' },
			c: { url: 'c.md', aliases: ['has space', 7] },
			d: { url: { en: 'd.md' }, alias: ['x'] },
			e: { url: 'https://example.org/e.md' },
			f: { url: 'f.md', aliases: ['A'] },
			g: { url: null }
		}
	}, ctx());
	const errs = bad.errors.map(e => `${e.where}: ${e.msg}`).join('\n');
	for (const part of ["files 'a': path 'javascript:x'", "files 'b': aliases must be a list", "alias \"has space\" must be a short name", 'alias 7 must be', "files 'g': url is missing"]) {
		assert.ok(errs.includes(part), `expected: ${part}\n---\n${errs}`);
	}
	const warns = bad.warnings.map(e => `${e.where}: ${e.msg}`).join('\n');
	assert.match(warns, /files 'd': unknown field 'alias'/);
	assert.match(warns, /files 'd': path has no address for 'de'/);
	assert.match(warns, /files 'e': the terminal reads same-origin files only/);
	assert.match(warns, /files 'f': alias 'A' is also the name of the file 'a'/);
});

test('validator: collection webUrl, allLabel and webLabel', () => {
	const item = { slug: 'x', name: 'X', url: 'https://example.org/' };
	const ok = validateManifest({
		collections: [
			{ id: 'a', name: 'A', webUrl: 'links/', allLabel: '@notes.appName', webLabel: { en: 'On the web', de: 'Im Web' }, items: [item] },
			{ id: 'b', name: 'B', webUrl: { en: 'https://example.org/en/', de: 'https://example.org/de/' }, items: [item] }
		]
	}, ctx());
	assert.deepEqual(ok.errors, []);
	assert.deepEqual(ok.warnings, []);
	const bad = validateManifest({
		collections: [
			{ id: 'a', name: 'A', webUrl: 'javascript:alert(1)', allLabel: '', webLabel: { en: 'Web' }, items: [item] },
			{ id: 'b', name: 'B', webUrl: 42, allLabel: 3, webLabel: '@notes.nope', items: [item] }
		]
	}, ctx());
	const errs = bad.errors.map(e => `${e.where}: ${e.msg}`).join('\n');
	for (const part of ["webUrl 'javascript:alert(1)': the protocol javascript:", 'allLabel is empty', "webLabel has no text for 'de'",
		"'b': webUrl must be a string or a { lang: url } map", "'b': allLabel must be a text"]) {
		assert.ok(errs.includes(part), `expected: ${part}\n---\n${errs}`);
	}
	assert.match(bad.warnings.map(w => w.msg).join('\n'), /webLabel '@notes\.nope': no such key/);
});

test('validator: icons still to build and kinds without their module are warnings', () => {
	const r = validateManifest({
		apps: [{ id: 'f', kind: 'collection', collection: 'c', name: 'F', icon: 'ti-cookie' }],
		collections: [{ id: 'c', name: 'C', items: [{ slug: 'i', name: 'I', url: 'pic.png' }] }]
	}, ctx({ modules: new Set(['wm']) }));
	assert.deepEqual(r.errors, []);
	const warns = r.warnings.map(w => w.msg).join('\n');
	assert.match(warns, /run npm run icons/);
	const nested = validateManifest({
		collections: [{ id: 'c', name: 'C', groups: [{ id: 'g', name: 'G' }], items: [{ slug: 'i', group: 'g', name: 'I', url: 'https://e.org/' }] }],
		menus: [{ label: 'M', items: [{ label: 'Sub', items: [{ collection: 'c' }] }] }]
	}, ctx());
	assert.match(nested.warnings.map(w => w.msg).join('\n'), /are listed flat/);
	assert.match(warns, /needs the module 'catalog'/);
	assert.match(warns, /needs the module 'viewer'/);
});

test('validator: site data — fortunes and feeds per language', () => {
	const files = {
		'd/en.json': { items: ['x'] },
		'd/de.json': new Error('invalid JSON: x'),
		'feed.en.json': { version: 'https://jsonfeed.org/version/1.1', items: [] }
	};
	const r = validateSiteData({ fortune: { dir: 'd/', block: [] }, notify: { feeds: { en: 'feed.en.json', de: 'feed.de.json' } } },
		{ languages: ['en', 'de', 'fr'], read: p => files[p], cleanFortunes, modules: new Set(['fortune', 'notify']) });
	const all = [...r.errors, ...r.warnings].map(e => `${e.where}: ${e.msg}`).join('\n');
	assert.match(all, /d\/de\.json: invalid JSON/);
	assert.match(all, /no sayings for 'fr'/);
	assert.match(all, /feed\.de\.json does not exist/);
	assert.match(all, /no feed for fr/);
});

test('validator CLI: the example site has no errors and no warnings', () => {
	const run = spawnSync(process.execPath, [join(ROOT, 'tools/validate-manifest.mjs'), '--json', '--strict'], { cwd: ROOT, encoding: 'utf8' });
	const out = JSON.parse(run.stdout);
	assert.deepEqual(out.errors, [], JSON.stringify(out.errors, null, 1));
	assert.deepEqual(out.warnings, [], JSON.stringify(out.warnings, null, 1));
	assert.equal(run.status, 0);
});

test('validator CLI: a relative site.home still builds and checks the website app', () => {
	const dir = mkdtempSync(join(tmpdir(), 'p11-validate-'));
	try {
		const conf = join(dir, 'config.js');
		const run = file => JSON.parse(spawnSync(process.execPath,
			[join(ROOT, 'tools/validate-manifest.mjs'), '--json', '--config', file], { cwd: ROOT, encoding: 'utf8' }).stdout);
		writeFileSync(conf, `${readFileSync(join(ROOT, 'site/config.js'), 'utf8')}\nwindow.DESKTOP_CONFIG.site.home = null;\n`);
		const without = run(conf);
		writeFileSync(conf, `${readFileSync(join(ROOT, 'site/config.js'), 'utf8')}\nwindow.DESKTOP_CONFIG.site.home = { en: '/', de: '/de/' };\n`);
		const relative = run(conf);
		assert.equal(relative.stats.apps, without.stats.apps + 1, 'the website app is part of the check');
		assert.deepEqual(relative.errors, [], JSON.stringify(relative.errors, null, 1));
		assert.equal('location' in globalThis, false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

/* ---------- The example site ---------- */

test('manifest: no content or URLs of the private original', () => {
	const src = readFileSync(join(ROOT, 'site/apps.js'), 'utf8');
	assert.ok(!/jpkc\.com\/(?!['"])/.test(src.replace('https://www.jpkc.com/', '')), 'only the author link to jpkc.com');
	assert.ok(!/awork|\/db\/|\/tools\/|\/games\/|chuck/i.test(src));
	assert.equal(manifest.apps.filter(a => a.kind).length >= 5, true);
});

test('fortunes: every configured language has a clean file with about forty sayings', () => {
	for (const l of LANGS) {
		const raw = JSON.parse(readFileSync(join(ROOT, `site/data/fortunes/${l}.json`), 'utf8'));
		const warns = [];
		const d = cleanFortunes(raw, { code: l, warn: m => warns.push(m) });
		assert.deepEqual(warns, [], `${l}: ${warns.join('; ')}`);
		assert.ok(d.items.length >= 38, `${l}: ${d.items.length} sayings`);
		assert.equal(d.items.length, raw.items.length, `${l}: nothing dropped`);
		assert.equal(d.lang, l);
		for (const it of d.items) {
			if (it.url && !/^https:/.test(it.url)) assert.ok(existsSync(join(ROOT, it.url.split(/[?#]/)[0], it.url.endsWith('/') ? 'index.html' : '')), `${l}: ${it.url}`);
		}
	}
	const en = JSON.parse(readFileSync(join(ROOT, 'site/data/fortunes/en.json'), 'utf8'));
	const de = JSON.parse(readFileSync(join(ROOT, 'site/data/fortunes/de.json'), 'utf8'));
	assert.deepEqual(Object.keys(en.categories), Object.keys(de.categories), 'the same category ids in every language');
});

test('feeds: JSON Feed 1.1, items parse as same-origin past entries for the notifications', () => {
	for (const l of LANGS) {
		const feed = JSON.parse(readFileSync(join(ROOT, `site/data/feed.${l}.json`), 'utf8'));
		assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
		assert.equal(feed.language, l);
		const base = new URL(`http://localhost/site/data/feed.${l}.json`);
		const items = parseFeed(feed, { resolve: raw => new URL(raw, base), origin: base.origin, now: Date.parse('2026-12-31') });
		assert.equal(items.length, feed.items.length, `${l}: every item counts`);
		for (const it of items) assert.ok(existsSync(join(ROOT, it.path.split('?')[0])), it.path);
	}
});

test('content pages: Reader markup, language, alternates, no inline code', () => {
	const pages = walk(join(ROOT, 'site/content')).filter(p => p.endsWith('.html'));
	assert.ok(pages.length >= 16);
	for (const p of pages) {
		const html = readFileSync(p, 'utf8');
		const rel = p.slice(ROOT.length + 1);
		assert.match(html, /^<!doctype html>/i, rel);
		assert.match(html, /<html lang="[a-z]{2}">/, rel);
		assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), `${rel}: inline script`);
		assert.ok(!/<style|\sstyle=|\son[a-z]+=/i.test(html), `${rel}: inline style or handler`);
		assert.ok(!/jpkc\.com\/[a-z]/i.test(html), `${rel}: deep link into the private site`);
		for (const [, href] of html.matchAll(/<link rel="(?:alternate|stylesheet)"[^>]*href="([^"]+)"/g)) {
			assert.ok(existsSync(resolve(dirname(p), href)), `${rel}: ${href}`);
		}
		if (rel.includes('/demos/')) continue;
		assert.match(html, /<main>\s*<article>\s*<h1>[^<]+<\/h1>\s*<p class="lead">/, `${rel}: main > article > h1 + p.lead`);
		assert.match(html, /<title>[^<]+ \| JPKCom Desktop<\/title>/, rel);
		for (const [, href] of html.matchAll(/<a href="(?!https?:|#|mailto:)([^"#?]+)/g)) {
			assert.ok(existsSync(resolve(dirname(p), href)), `${rel}: link ${href}`);
		}
	}
	/* imprint and privacy are clearly marked templates in every language */
	for (const l of LANGS) {
		for (const name of ['imprint', 'privacy']) {
			const html = readFileSync(join(ROOT, `site/content/${l}/${name}.html`), 'utf8');
			assert.match(html, /class="template-note"/);
			assert.match(html, /\[[^\]]+\]/, 'placeholders in square brackets');
		}
	}
});
