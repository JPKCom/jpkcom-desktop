/* JPKCom Desktop — tests: the example site (manifest, content, data) and the manifest validator — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest, validateSiteData, validateIconSets, setPrefixes } from '../tools/validate-manifest.mjs';
import { readIconSets } from '../tools/icon-set-files.mjs';
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

test('validator: an alias cycle is an error, an alias chain is fine', () => {
	const r = validateManifest({
		apps: [
			{ id: 'about', kind: 'page', icon: 'ti-book', name: { en: 'About', de: 'Über' }, url: { en: 'a.html', de: 'b.html' } },
			{ id: 'old-about', alias: 'about', hidden: true },
			{ id: 'older-about', alias: 'old-about', hidden: true },
			{ id: 'loop-a', alias: 'loop-b', hidden: true },
			{ id: 'loop-b', alias: 'loop-c', hidden: true },
			{ id: 'loop-c', alias: 'loop-a', hidden: true }
		]
	}, ctx());
	const all = r.errors.map(e => `${e.where}: ${e.msg}`);
	assert.equal(all.length, 3, all.join('\n'));
	assert.ok(all[0].startsWith("apps[3] 'loop-a': the aliases form a cycle (loop-a → loop-b → loop-c → loop-a)"), all[0]);
	assert.ok(all.every(e => e.includes('form a cycle')));
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

test('validator: man syntax', () => {
	const it = (slug, man) => ({ slug, name: slug, url: 'https://example.org/', ...(man === undefined ? {} : { man }) });
	const ok = validateManifest({
		collections: [
			{ id: 'tools', name: 'Tools', man: { en: 'help/en/{slug}.md', de: 'help/{slug}.md' },
				items: [it('a'), it('b', 'help/b.md'), it('c', false), it('d', { en: 'x/{collection}/{id}.md', de: 'y/{lang}/{slug}.md' }), { slug: 'e', app: 'notes', man: 'help/e.md' }] },
			{ id: 'games', name: 'Games', man: false, items: [it('g')] }
		]
	}, ctx({ config: { terminal: { manUrl: 'm/{lang}/{slug}.md' } } }));
	assert.deepEqual(ok.errors, []);
	assert.deepEqual(ok.warnings, []);

	const bad = validateManifest({
		collections: [
			{ id: 'a', name: 'A', man: 'help/fixed.md', items: [
				it('scheme', 'https://x.example/a.md'), it('host', '//x.example/a.md'), it('space', 'help/a b.md'),
				it('ph', 'help/{name}.md'), it('lang', { 'not a lang': 'x.md' }),
				{ slug: 'al', app: 'notes', man: 'javascript:alert(1)' }
			] },
			{ id: 'b', name: 'B', man: { en: 'x/{slug}.html', de: 'x/{slug}.md' }, items: [it('p', 'pages/p/'), it('q', { en: 'q.md' })] }
		]
	}, ctx());
	const errs = bad.errors.map(e => `${e.where}: ${e.msg}`).join('\n');
	for (const part of [
		"'a': man 'help/fixed.md' applies to many items and needs {slug} or {id}",
		"'scheme': man \"https://x.example/a.md\" must be a path on this site",
		"'host': man \"//x.example/a.md\" must be a path on this site",
		"'space': man \"help/a b.md\" must be a path on this site",
		"'ph': man: unknown placeholder {name} — only {slug} {id} {collection} {lang}",
		"'lang': man: 'not a lang' is not a language tag",
		"'al': man \"javascript:alert(1)\" must be a path on this site"
	]) assert.ok(errs.includes(part), `expected: ${part}\n---\n${errs}`);
	assert.equal(bad.errors.length, 7);
	const warns = bad.warnings.map(w => `${w.where}: ${w.msg}`).join('\n');
	for (const part of [
		"'b': man [en] 'x/{slug}.html' is not a .md/.markdown/.txt file — it is only shown as a link",
		"'p': man 'pages/p/' is not a .md/.markdown/.txt file",
		"'q': man has no path for 'de'"
	]) assert.ok(warns.includes(part), `expected: ${part}\n---\n${warns}`);

	const lonely = validateManifest({ apps: [{ id: 'p', kind: 'page', name: 'P', url: 'p.html' }] },
		ctx({ config: { terminal: { manUrl: 'm/{name}.md' } } }));
	assert.match(lonely.errors.map(e => `${e.where}: ${e.msg}`).join('\n'), /config terminal\.manUrl: manUrl: unknown placeholder \{name\}/);
	assert.match(lonely.warnings.map(w => `${w.where}: ${w.msg}`).join('\n'), /config terminal\.manUrl: is set, but the manifest has no collection/);
});

test('validator: a relative template with no files gives warnings only, counted per collection and language', () => {
	const have = new Set(['help/a.md', 'help/en/a.md', 'help/b.md']);
	const file = p => have.has(p);
	const items = ['a', 'b', 'c'].map(slug => ({ slug, name: slug, url: 'https://example.org/' }));
	const r = validateManifest({
		collections: [
			{ id: 'tools', name: 'Tools', man: { de: 'help/{slug}.md', en: 'help/en/{slug}.md' }, items: [...items, { slug: 'd', app: 'notes' }, { slug: 'off', name: 'Off', url: 'https://example.org/', man: false }] },
			{ id: 'root', name: 'Root', man: '/abs/{slug}.md', items: [{ slug: 'z', name: 'Z', url: 'https://example.org/' }] }
		]
	}, ctx({ file }));
	assert.deepEqual(r.errors, []);
	const warns = r.warnings.map(w => `${w.where}: ${w.msg}`);
	assert.deepEqual(warns, [
		"collection 'tools': man has no file for 3 of 4 items in 'en' (e.g. help/en/b.md) — man says \"no manual page\"",
		"collection 'tools': man has no file for 2 of 4 items in 'de' (e.g. help/c.md) — man says \"no manual page\""
	], 'the alias item d counts with its own slug; /root paths are not checkable');
	/* manUrl is the level when the collection sets none; a string without {lang} is counted once */
	const u = validateManifest({ collections: [{ id: 'games', name: 'Games', items }] }, ctx({ file, config: { terminal: { manUrl: 'help/{slug}.md' } } }));
	assert.deepEqual(u.warnings.map(w => w.msg), ['config terminal.manUrl has no file for 1 of 3 items (e.g. help/c.md) — man says "no manual page"']);
});

test('validator: a literal item man to a missing file is one warning, not an error', () => {
	const r = validateManifest({
		collections: [{ id: 'tools', name: 'Tools', items: [
			{ slug: 'a', name: 'A', url: 'https://example.org/', man: 'help/missing.md' },
			{ slug: 'b', name: 'B', url: 'https://example.org/', man: { en: 'help/en/b.md', de: 'help/de/b.md' } }
		] }]
	}, ctx({ file: p => p === 'help/en/b.md' }));
	assert.deepEqual(r.errors, []);
	assert.deepEqual(r.warnings.map(w => `${w.where}: ${w.msg}`), [
		"collections[0] 'tools' items[0] 'a': man 'help/missing.md': no such file in the project — man says \"no manual page\"",
		"collections[0] 'tools' items[1] 'b': man 'help/de/b.md' [de]: no such file in the project — man says \"no manual page\""
	]);
});

test('validator: collection webApp', () => {
	const item = { slug: 'x', name: 'X', url: 'https://example.org/' };
	const web = { id: 'tools-web', kind: 'web', hidden: true, url: 'https://example.org/tools/', name: 'Web' };
	const tools = over => ({ id: 'tools', name: 'T', basePath: '/tools/', webUrl: '/tools/', items: [item], ...over });
	const run = (over, apps = [], c = ctx()) => validateManifest({ apps: [web, ...apps], collections: [tools(over)] }, c);
	const msgs = list => list.map(e => `${e.where}: ${e.msg}`).join('\n');

	const ok = run({ webApp: 'tools-web' });
	assert.deepEqual(ok.errors, []);
	assert.deepEqual(ok.warnings, [], 'webApp silences the basePath warning');
	const mod = run({ webApp: 'notes' });
	assert.deepEqual(mod.errors, []);
	assert.deepEqual(mod.warnings, []);

	assert.match(msgs(run({ webApp: 'nope' }).errors), /web app 'nope' does not exist/);
	assert.match(msgs(run({ webApp: 7 }).errors), /webApp must be an app id/);
	assert.match(msgs(run({ webApp: 'tools' }).errors), /webApp 'tools' is a Catalog of this collection/);
	assert.match(msgs(run({ webApp: 'browse' }, [{ id: 'browse', kind: 'collection', collection: 'tools', name: 'B' }]).errors),
		/webApp 'browse' is a Catalog of this collection/);
	assert.match(msgs(run({ webApp: 'old' }, [{ id: 'old', alias: 'tools' }]).errors), /webApp 'old' is a Catalog of this collection/);

	const unused = run({ app: null, webApp: 'tools-web' });
	assert.deepEqual(unused.errors, []);
	assert.match(msgs(unused.warnings), /webApp is unused/);
	const home = { id: 'tools-home', kind: 'web', url: 'https://example.org/', name: 'H' };
	assert.match(msgs(run({ app: 'tools-home', webApp: 'tools-web' }, [home]).warnings), /webApp is unused/, 'app is no Catalog');
	const browse = { id: 'browse', kind: 'collection', collection: 'tools', name: 'B' };
	const used = run({ app: null, webApp: 'tools-web' }, [browse]);
	assert.deepEqual(used.errors, []);
	assert.deepEqual(used.warnings, [], 'another Catalog AppEntry shows the collection');
	const page = { id: 'tools-page', kind: 'page', hidden: true, url: '/tools/index.html', name: 'P' };
	const noReader = run({ webApp: 'tools-page' }, [page], ctx({ modules: new Set(['wm', 'shell', 'panels', 'catalog']) }));
	assert.match(msgs(noReader.warnings), /webApp 'tools-page'.*needs the module 'reader'/);
	const atBase = run({ webApp: 'tools-page' }, [{ ...page, url: { en: '/tools/', de: '/tools/index.html' } }]);
	assert.deepEqual(atBase.errors, []);
	assert.match(msgs(atBase.warnings), /page app at the collection's basePath.*url '\/tools\/index\.html'/);
	assert.deepEqual(run({ webApp: 'tools-page' }, [page]).warnings, [], 'a page app on <basePath>index.html is fine');
});

test('validator: webUrl equal to basePath without webApp is a warning', () => {
	const item = { slug: 'x', name: 'X', url: 'https://example.org/' };
	const web = { id: 'tools-web', kind: 'web', hidden: true, url: 'https://example.org/tools/', name: 'Web' };
	const run = (webUrl, { apps = [], config } = {}) => validateManifest({
		apps: [web, ...apps],
		collections: [{ id: 'tools', name: 'T', basePath: '/tools/', webUrl, items: [item] }]
	}, ctx(config ? { config } : {}));
	const trap = /webUrl '\/tools\/?' is this collection's basePath/;
	for (const v of ['/tools/', '/tools', { en: '/tools', de: '/tools/' }]) {
		const r = run(v);
		assert.deepEqual(r.errors, [], JSON.stringify(v));
		assert.equal(r.warnings.filter(w => trap.test(w.msg)).length, 1, JSON.stringify(v));
	}
	for (const v of ['/tools/index.html', '/en/tools/']) assert.deepEqual(run(v).warnings, [], v);
	assert.deepEqual(run('/tools/', { apps: [{ id: 'tools', webApp: 'tools-web' }] }).warnings, [], 'webApp on the override record');
	assert.deepEqual(run('/tools/', { config: { site: { routes: [{ match: '^/tools/?$', app: 'tools-web' }] } } }).warnings, [],
		'a site route sends it elsewhere');
	assert.deepEqual(run('/tools/', { config: { site: { routes: [{ prefix: 'tools/', tab: true }] } } }).warnings, []);
	assert.equal(run('/tools/', { config: { site: { routes: [{ match: '^/tools/?$', app: 'tools' }] } } }).warnings.length, 1,
		'a route to this Catalog is no way out');
	/* the router sends basePath to the collection's app only: without a Catalog there, nothing leads back */
	const runApp = (app, apps = []) => validateManifest({
		apps: [web, ...apps],
		collections: [{ id: 'tools', name: 'T', app, basePath: '/tools/', webUrl: '/tools/', items: [item] }]
	}, ctx());
	const browse = { id: 'browse', kind: 'collection', collection: 'tools', name: 'B' };
	assert.deepEqual(runApp(null, [browse]).warnings, [], 'app: null');
	assert.deepEqual(runApp('tools-home', [{ id: 'tools-home', kind: 'web', url: 'https://example.org/', name: 'H' }]).warnings, [],
		'app is a web app');
	assert.equal(runApp('tools-cat').warnings.filter(w => trap.test(w.msg)).length, 1, 'app names a Catalog of its own');
	assert.equal(runApp('old', [{ id: 'old', alias: 'browse' }, browse]).warnings.filter(w => trap.test(w.msg)).length, 1,
		'app is an alias of a Catalog of this collection');
});

test('validator: web button fields on a Catalog app entry and its override record', () => {
	const item = { slug: 'x', name: 'X', url: 'https://example.org/' };
	const collections = [{ id: 'tools', name: 'T', items: [item] }];
	const over = validateManifest({ apps: [{ id: 'tools', webApp: 'nope' }], collections }, ctx());
	assert.match(over.errors.map(e => `${e.where}: ${e.msg}`).join('\n'), /'tools': web app 'nope' does not exist/);
	/* fields 1.1.0 did not check on apps: warnings only, so a site that passed still passes */
	const entry = validateManifest({
		apps: [{ id: 'browse', kind: 'collection', collection: 'tools', name: 'B', webUrl: 'javascript:x', webLabel: { en: 'X' }, allLabel: '' }],
		collections
	}, ctx());
	assert.deepEqual(entry.errors, []);
	const warns = entry.warnings.map(w => w.msg).join('\n');
	assert.match(warns, /webUrl 'javascript:x'/);
	assert.match(warns, /webLabel has no text for 'de'/);
	assert.match(warns, /allLabel is empty/);
	const overWarn = validateManifest({ apps: [{ id: 'tools', webUrl: 42 }], collections }, ctx());
	assert.deepEqual(overWarn.errors, []);
	assert.match(overWarn.warnings.map(w => w.msg).join('\n'), /webUrl must be a string or a \{ lang: url \} map/);
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

/* ---------- Site icon sets ---------- */

const SET = (icons, extra = {}) => JSON.stringify({ format: 'jpkcom-desktop-icons/1', name: 'Test', license: 'MIT', icons, ...extra });

/** A temporary installation root with the given files → readIconSets() of it */
function withSets(files, cfg, fn) {
	const dir = mkdtempSync(join(tmpdir(), 'p11-sets-'));
	try {
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(dirname(join(dir, path)), { recursive: true });
			writeFileSync(join(dir, path), text);
		}
		return fn(readIconSets(dir, { vault: { dir: 'site/vault/' }, ...cfg }));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const setIconCtx = sets => ctx({
	iconSets: sets,
	icon: id => {
		if (['ti-book', 'jpk'].includes(id) || sets.ids.has(id)) return 'ok';
		return setPrefixes(sets.sets).has(id.split('-')[0]) ? 'set' : 'unknown';
	}
});

test('validator: icons of a configured site icon set count as known in apps, collections, groups and items', () => {
	withSets({ 'site/icon-sets/a.json': SET({ 'acme-rocket': { k: 'd', vb: '0 0 512 512', e: ['M0 0h1'], e2: ['M1 1h1'] }, 'acme-star': { k: 'f', e: ['M0 0'] } }) },
		{ iconSets: ['site/icon-sets/a.json'] }, sets => {
			assert.deepEqual([...sets.ids], [['acme-rocket', 'site/icon-sets/a.json'], ['acme-star', 'site/icon-sets/a.json']]);
			const r = validateManifest({
				apps: [{ id: 'about', kind: 'page', icon: 'acme-rocket', name: 'A', url: 'a.html' }],
				collections: [{ id: 'c', name: 'C', icon: 'acme-star', defaultIcon: 'acme-rocket', groups: [{ id: 'g', name: 'G', icon: 'acme-star' }],
					items: [{ slug: 'x', group: 'g', name: 'X', url: 'https://example.org/', icon: 'acme-rocket' }] }]
			}, setIconCtx(sets));
			assert.deepEqual(r.errors, []);
			const v = validateIconSets(sets.sets);
			assert.deepEqual(v, { errors: [], warnings: [] });
		});
});

test("validator: an id with a set's prefix that the set lacks is an error naming the set", () => {
	withSets({ 'site/icon-sets/a.json': SET({ 'acme-rocket': { k: 'f', e: ['M0 0'] } }) }, { iconSets: ['site/icon-sets/a.json'] }, sets => {
		const r = validateManifest({ apps: [{ id: 'x', kind: 'page', icon: 'acme-snake', name: 'X', url: 'a.html' }, { id: 'y', kind: 'page', icon: 'other-thing', name: 'Y', url: 'a.html' }] }, setIconCtx(sets));
		const errs = r.errors.map(e => e.msg).join('\n');
		assert.match(errs, /icon 'acme-snake' is not in the site icon set\(s\) with prefix 'acme' \(site\/icon-sets\/a\.json\)/);
		assert.match(errs, /icon 'other-thing' is neither a Tabler id \(ti-…, tif-…\), a custom glyph nor an icon of a site icon set/);
	});
});

test('validator: a missing, non-JSON or wrongly formatted set file is an error', () => {
	withSets({
		'site/icon-sets/bad.json': '{ nope',
		'site/icon-sets/fmt.json': JSON.stringify({ format: 'other/1', icons: {} })
	}, { iconSets: ['site/icon-sets/none.json', 'site/icon-sets/bad.json', 'site/icon-sets/fmt.json'] }, sets => {
		const { errors } = validateIconSets(sets.sets);
		const text = errors.map(e => `${e.where}: ${e.msg}`).join('\n');
		assert.match(text, /site icon set site\/icon-sets\/none\.json does not exist/);
		assert.match(text, /bad\.json: site icon set refused: invalid JSON/);
		assert.match(text, /fmt\.json: site icon set refused: format must be "jpkcom-desktop-icons\/1"/);
		assert.equal(errors.length, 3);
		assert.equal(sets.ids.size, 0);
	});
});

test('validator: reserved prefixes, duplicate ids across sets and dropped allowlist items are errors', () => {
	withSets({
		'site/icon-sets/a.json': SET({ 'acme-a': { e: ['M0 0'] }, 'ti-home': { e: ['M0 0'] } }),
		'icon-sets/b.json': SET({ 'acme-a': { e: ['M0 0'] }, 'acme-b': { e: [['path', { d: 'M0 0', onclick: 'x' }]] } })
	}, { iconSets: ['site/icon-sets/a.json', 'icon-sets/b.json'] }, sets => {
		const { errors } = validateIconSets(sets.sets);
		const text = errors.map(e => `${e.where}: ${e.msg}`).join('\n');
		assert.match(text, /a\.json: 'ti-home': the prefix 'ti' belongs to the project/);
		assert.match(text, /b\.json: 'acme-a': an earlier icon set brings this id already/);
		assert.match(text, /b\.json: 'acme-b': dropped onclick/);
		assert.equal(sets.ids.get('acme-a'), 'site/icon-sets/a.json', 'the first set wins');
		assert.equal(sets.ids.get('acme-b'), 'icon-sets/b.json');
	});
});

test('validator: a set inside vault.dir is an error', () => {
	for (const dir of ['site/vault/', '/site/vault/']) {
		withSets({ 'site/vault/i.json': SET({ 'acme-a': { e: ['M0 0'] } }) }, { iconSets: ['site/vault/i.json'], vault: { dir } }, sets => {
			assert.equal(sets.sets[0].below, 'vault', dir);
			assert.match(validateIconSets(sets.sets).errors.map(e => e.msg).join('\n'), /lies inside vault\.dir — the service worker never caches it/);
		});
	}
});

test('validator: a set above 256 KiB is a warning; above 2 MiB an error', () => {
	const icons = {};
	for (let i = 0; i < 400; i++) icons[`acme-i${i}`] = { k: 'f', e: [`M0 0${'h1'.repeat(400)}`] };
	withSets({ 'site/icon-sets/big.json': SET(icons), 'site/icon-sets/huge.json': SET({ 'acme-x': { k: 'f', e: ['M0 0'] } }, { pad: 'x'.repeat(2 * 1024 * 1024) }) },
		{ iconSets: ['site/icon-sets/big.json', 'site/icon-sets/huge.json'] }, sets => {
			const r = validateIconSets(sets.sets);
			assert.match(r.warnings.map(w => w.msg).join('\n'), /site icon set site\/icon-sets\/big\.json is \d+ KiB \(400 icons\) — ship only the icons the site uses/);
			assert.match(r.errors.map(e => e.msg).join('\n'), /refused: \d+ KiB, larger than 2 MiB/);
		});
});

test("validator: a k 'o' set icon on a 512 grid without stroke-width in a is a warning", () => {
	const icons = { 'acme-ok': { vb: '0 0 512 512', a: { fill: 'none', stroke: 'currentColor', 'stroke-width': 32 }, e: ['M0 0'] }, 'acme-tabler': { e: ['M0 0'] } };
	for (let i = 0; i < 7; i++) icons[`acme-thin${i}`] = { vb: '0 0 512 512', e: ['M0 0'] };
	withSets({ 'site/icon-sets/o.json': SET(icons) }, { iconSets: ['site/icon-sets/o.json'] }, sets => {
		const warns = validateIconSets(sets.sets).warnings.map(w => w.msg);
		assert.equal(warns.length, 6);
		assert.match(warns[0], /'acme-thin0' is an outline icon on a 512×512 grid — --icon-stroke \(1\.75\) is in viewBox units/);
		assert.match(warns[5], /2 more outline icons/);
	});
});

test('validator: brand.glyph from a set passes; an unknown brand.glyph warns', () => {
	withSets({ 'site/icon-sets/a.json': SET({ 'acme-logo': { k: 'f', e: ['M0 0'] } }) }, { iconSets: ['site/icon-sets/a.json'] }, sets => {
		const ok = validateManifest({ apps: [] }, { ...setIconCtx(sets), config: { brand: { glyph: 'acme-logo' } } });
		assert.deepEqual(ok.warnings, []);
		const bad = validateManifest({ apps: [] }, { ...setIconCtx(sets), config: { brand: { glyph: 'acme-gone' } } });
		assert.match(bad.warnings.map(w => `${w.where}: ${w.msg}`).join('\n'), /config brand\.glyph: config\.brand\.glyph 'acme-gone' is not a known icon — the menu bar shows ti-app-window/);
	});
});

test('validator: config.iconReplace — keys must be known project icons, targets known icons (set, Tabler, custom)', () => {
	withSets({ 'site/icon-sets/a.json': SET({ 'acme-cog': { k: 'f', e: ['M0 0'] }, 'acme-sun': { k: 'd', e2: ['M0 0'] } }) }, { iconSets: ['site/icon-sets/a.json'] }, sets => {
		const base = setIconCtx(sets);
		const c = { ...base, icon: id => (id === 'ti-cookie' ? 'build' : ['ti-user', 'wc-close'].includes(id) ? 'ok' : base.icon(id)) };
		const ok = validateManifest({ apps: [] }, { ...c, config: { iconReplace: { 'ti-book': 'acme-cog', 'wc-close': 'acme-sun', 'ti-user': 'ti-book' } } });
		assert.deepEqual(ok.errors, []);
		assert.deepEqual(ok.warnings.map(w => w.where), ["config iconReplace['ti-user']"], 'a target that is replaced itself: not chained (warning)');
		assert.match(ok.warnings[0].msg, /'ti-book' is replaced itself — replacements are not chained, 'ti-user' shows 'ti-book'/);

		const bad = validateManifest({ apps: [] }, { ...c, config: { iconReplace: {
			'ti-nope': 'acme-cog', 'ti-book': 'acme-gone', 'ti-user': 'other-thing', 'wc-close': 'ti-cookie', jpk: 'acme-cog', 'acme-cog': 'ti-book'
		} } });
		const errs = bad.errors.map(e => `${e.where}: ${e.msg}`).join('\n');
		assert.match(errs, /config iconReplace\['ti-nope'\]: 'ti-nope' does not exist in Tabler Icons — nothing to replace/);
		assert.match(errs, /config iconReplace\['ti-book'\]: target 'acme-gone' is not in the site icon set\(s\) with prefix 'acme' \(site\/icon-sets\/a\.json\)/);
		assert.match(errs, /config iconReplace\['ti-user'\]: target 'other-thing' is neither a Tabler id/);
		assert.equal(bad.errors.length, 3, errs);
		assert.match(bad.warnings.map(w => `${w.where}: ${w.msg}`).join('\n'), /config iconReplace\['wc-close'\]: target 'ti-cookie' is not in src\/icons\/tabler\.js yet — run npm run icons/);
		assert.ok(!errs.includes('jpk') && !errs.includes("['acme-cog']"), 'keys that are not replaceable ids are config warnings (buildConfig), not checked here');

		/* a Tabler-looking typo says so; a chain only through a pair without an error */
		const typo = validateManifest({ apps: [] }, { ...c, config: { iconReplace: { 'ti-user': 'ti-book', 'ti-book': 'ti-bookz', 'wc-close': 'wc-nope' } } });
		const terrs = typo.errors.map(e => `${e.where}: ${e.msg}`).join('\n');
		assert.match(terrs, /config iconReplace\['ti-book'\]: target 'ti-bookz' does not exist in Tabler Icons — 'ti-book' would stay/);
		assert.match(terrs, /config iconReplace\['wc-close'\]: target 'wc-nope' is neither a Tabler id/);
		assert.equal(typo.errors.length, 2, terrs);
		assert.deepEqual(typo.warnings, [], 'ti-book keeps its own glyph (its pair has an error) — ti-user → ti-book is no chain');
	});
});

test('validator: the CLI reports iconReplace problems of the config (shape as config warnings, unknown target as error)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'p11-replace-'));
	try {
		const conf = join(dir, 'config.js');
		writeFileSync(conf, `${readFileSync(join(ROOT, 'site/config.js'), 'utf8')}\nwindow.DESKTOP_CONFIG.iconReplace = { 'ti-settings': 'ti-sun', 'jpk': 'ti-sun', 'ti-sun': 'acme-gone' };\n`);
		const r = spawnSync(process.execPath, [join(ROOT, 'tools/validate-manifest.mjs'), '--config', conf, '--json'], { encoding: 'utf8' });
		const out = JSON.parse(r.stdout);
		assert.equal(r.status, 1);
		assert.deepEqual(out.errors.map(e => e.where), ["config iconReplace['ti-sun']"]);
		assert.match(out.errors[0].msg, /target 'acme-gone' is neither a Tabler id/);
		const warns = out.warnings.map(w => w.msg).join('\n');
		assert.match(warns, /config\.iconReplace: 'jpk' is not a replaceable icon id/);
		assert.doesNotMatch(warns, /is replaced itself/, "'ti-sun' → 'acme-gone' has an error, so 'ti-sun' is not replaced — no chain");
		assert.match(warns, /config\.iconReplace: 'jpk' is not a replaceable icon id/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
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

test('validator: online only skips the fortunes, needs remote and services.fortune', () => {
	const opts = { languages: ['en'], read: () => undefined, modules: new Set(['fortune']) };
	const msgs = r => [...r.errors, ...r.warnings].map(e => `${e.where}: ${e.msg}`);
	let r = validateSiteData({ fortune: { local: false, remote: 'example', dir: 'd/' }, services: { fortune: true } }, opts);
	assert.deepEqual(msgs(r), [], 'no "no sayings" warning online only');
	for (const remote of [null, 'Bad Id']) {
		r = validateSiteData({ fortune: { local: false, remote, dir: 'd/' }, services: { fortune: true } }, opts);
		const all = msgs(r).join('\n');
		assert.match(all, /no sayings for 'en'/, 'the fortunes loop runs');
		assert.equal(r.warnings.filter(w => w.where === 'config fortune').length, 1, String(remote));
		assert.match(all, /local: false needs remote/);
	}
	r = validateSiteData({ fortune: { local: false, remote: 'example', dir: 'd/' } }, opts);
	assert.match(msgs(r).join('\n'), /needs services\.fortune: true/);
});

test('validator: fortune texts need every configured language', async () => {
	const { TEXT_KEYS } = await import('../src/apps/fortune/model.js');
	const run = texts => validateSiteData({ fortune: { texts } },
		{ languages: ['en', 'de'], read: () => undefined, textKeys: TEXT_KEYS, modules: new Set(['fortune']) });
	let r = run({ next: { en: 'N' } });
	assert.equal(r.errors.length, 1);
	assert.match(r.errors[0].msg, /no text for 'de'/);
	r = run({ bogus: 'x' });
	assert.equal(r.errors.length, 0);
	assert.equal(r.warnings.length, 1);
	assert.match(r.warnings[0].msg, /cannot be replaced/);
	r = run({ next: '@my.next' });
	assert.deepEqual([...r.errors, ...r.warnings], []);
	r = run({ next: 3 });
	assert.match(r.errors[0].msg, /must be a text/);
	assert.deepEqual(run({ next: { en: 'N', de: 'N' } }).errors, []);
});

test('validator: fortune texts with placeholders the app does not fill', async () => {
	const { TEXT_KEYS, placeholderWarning } = await import('../src/apps/fortune/model.js');
	const run = texts => validateSiteData({ fortune: { texts } },
		{ languages: ['en', 'de'], read: () => undefined, textKeys: TEXT_KEYS, placeholderWarning, modules: new Set(['fortune']) });
	let r = run({ askText: { en: '{provider} from {host}', de: '{provider} von {host}' }, keys: '{space}', storageLabel: 'Facts', askText2: '@my.x' });
	assert.deepEqual([...r.errors, ...r.warnings], []);
	r = run({ error: { en: '{hots} is silent', de: '{host} schweigt' }, web: 'On {host}' });
	assert.deepEqual(r.errors, []);
	assert.equal(r.warnings.length, 2);
	assert.match(r.warnings[0].msg, /texts\.error uses \{hots\}, which the app does not fill \(placeholders: host\)/);
	assert.equal(r.warnings[0].where, 'config fortune.texts.error');
	assert.match(r.warnings[1].msg, /placeholders: none/);
	/* without placeholderWarning (an older model.js) nothing is checked */
	r = validateSiteData({ fortune: { texts: { web: 'On {host}' } } },
		{ languages: ['en'], read: () => undefined, textKeys: TEXT_KEYS, modules: new Set(['fortune']) });
	assert.deepEqual(r.warnings, []);
});

test('validator: a replaced askText must name the host of a built-in provider', async () => {
	const { TEXT_KEYS, placeholderWarning, hostWarning } = await import('../src/apps/fortune/model.js');
	const providerHosts = { facts: ['facts.example.org'] };
	const run = (askText, remote = 'facts', opts = {}) => validateSiteData({ fortune: { remote, texts: { askText } } },
		{ languages: ['en', 'de'], read: () => undefined, textKeys: TEXT_KEYS, placeholderWarning, hostWarning, providerHosts, modules: new Set(['fortune']), ...opts });
	for (const ok of [
		{ en: 'Load from {host}?', de: 'Von {host} laden?' },
		{ en: 'Load from facts.example.org?', de: 'Von FACTS.example.org laden?' },
		'@my.ask'
	]) assert.deepEqual(run(ok).warnings, [], JSON.stringify(ok));
	let r = run({ en: 'Load facts?', de: 'Von {host} laden?' });
	assert.deepEqual(r.errors, []);
	assert.equal(r.warnings.length, 1);
	assert.equal(r.warnings[0].where, 'config fortune.texts.askText');
	assert.match(r.warnings[0].msg, /texts\.askText \('en'\) does not name the host the request goes to — use \{host\} or write out facts\.example\.org/);
	r = run('Load facts?');
	assert.match(r.warnings[0].msg, /^texts\.askText does not name the host/);
	/* hosts unknown here (no remote, a provider a module adds) or no hostWarning → not checked */
	assert.deepEqual(run('Load facts?', null).warnings, []);
	assert.deepEqual(run('Load facts?', 'from-a-module').warnings, []);
	assert.deepEqual(run('Load facts?', 'facts', { hostWarning: null }).warnings, []);
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
