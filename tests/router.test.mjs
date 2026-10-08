/* JPKCom Desktop — tests: registry (apps, collections) and router — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, initials } from '../src/core/registry.js';
import { createRouter } from '../src/core/router.js';

const ORIGIN = 'https://desk.example';
const ROOT = `${ORIGIN}/desktop/`;

function setup(siteExtra = {}) {
	const warnings = [];
	const reg = createRegistry({ L: v => (typeof v === 'string' ? v : v?.en ?? Object.values(v ?? {})[0] ?? ''), warn: m => warnings.push(m) });
	reg.load({
		apps: [
			{ id: 'about', kind: 'page', name: { en: 'About', de: 'Über' }, url: { en: 'site/content/en/about.html', de: 'site/content/de/about.html' } },
			{ id: 'docs', kind: 'page', name: 'Docs', url: 'site/content/en/docs/' },
			{ id: 'demo', kind: 'web', name: 'Demo', url: 'demo/' },
			{ id: 'notes', kind: 'app', name: 'Notes', dock: true },
			{ id: 'BadId', kind: 'page', name: 'x' },
			{ id: 'nokind', name: 'x' },
			{ id: 'insecure', kind: 'link', name: 'x', url: 'http://example.org/' },
			{ id: 'secure', kind: 'link', name: 'Example', url: 'https://example.org/path/' }
		],
		collections: [
			{
				id: 'games', prefix: 'game', name: 'Games', basePath: 'games/', urlTemplate: 'games/{slug}/', initials: true, sort: 'alpha',
				groups: [{ id: 'arcade', name: 'Arcade', tint: 'violet', icon: 'ti-device-gamepad' }],
				items: [
					{ slug: 'zeta', group: 'arcade', name: 'Zeta Run' },
					{ slug: 'alpha', group: 'arcade', name: 'alpha', icon: 'ti-star' },
					{ slug: 'ghost', group: 'missing', name: 'Ghost' },
					{ slug: 'Bad Slug', group: 'arcade', name: 'x' }
				]
			},
			{
				id: 'showcase', prefix: 'sc', name: 'Showcase', sort: 'manual',
				items: [
					{ slug: 'notes', app: 'notes', desc: 'Alias' },
					{ slug: 'site', name: 'Site', url: 'https://example.org/' },
					{ slug: 'logo', name: 'Logo', url: 'site/wallpapers/logo.svg' },
					{ slug: 'err', name: 'Error page', url: '/404.html' },
					{ slug: 'ftp', name: 'FTP', url: 'ftp://example.org/' }
				]
			}
		],
		menus: [{ id: 'pages', label: 'Pages', items: ['about'] }],
		...siteExtra
	});
	const launched = [];
	const tabs = [];
	const router = createRouter({
		registry: reg,
		site: { hosts: ['www.desk.example'], routes: [{ match: '^/desktop/special/?$', app: 'demo' }, { prefix: 'downloads/', tab: true }, { match: '[', app: 'x' }], defaultPageApp: 'about' },
		origin: ORIGIN,
		root: ROOT,
		launch: (id, opts) => { launched.push([id, opts]); return true; },
		openTab: href => tabs.push(href)
	});
	return { reg, router, warnings, launched, tabs };
}

test('registry: invalid entries are skipped with a warning, never thrown', () => {
	const { reg, warnings } = setup();
	assert.equal(reg.has('BadId'), false);
	assert.equal(reg.has('nokind'), false);
	assert.equal(reg.has('insecure'), false);
	assert.equal(reg.get('secure').url, 'https://example.org/path/');
	assert.equal(reg.get('secure').host, 'example.org/path');
	assert.equal(reg.has('game-ghost'), false);
	assert.equal(reg.has('sc-ftp'), false);
	assert.ok(warnings.some(w => w.includes("unknown group 'missing'")));
	assert.ok(warnings.length >= 5);
	/* an entry without kind is an override record for an app another source brings, not an error */
	assert.deepEqual(reg.pendingOverrides(), ['nokind']);
	assert.deepEqual(reg.data('menus'), [{ id: 'pages', label: 'Pages', items: ['about'] }]);
});

test('registry: collections derive apps, kinds, icons, tints and marks', () => {
	const { reg } = setup();
	const zeta = reg.get('game-zeta');
	assert.equal(zeta.kind, 'web');
	assert.equal(zeta.url, 'games/zeta/');
	assert.equal(zeta.tint, 'violet');
	assert.equal(zeta.icon, 'ti-device-gamepad');
	assert.equal(zeta.mark, 'ZR');
	assert.equal(reg.get('game-alpha').mark, undefined);
	assert.equal(reg.get('sc-site').kind, 'link');
	assert.equal(reg.get('sc-logo').kind, 'image');
	assert.equal(reg.get('sc-err').kind, 'web');
	/* the collection's own browser app */
	assert.equal(reg.get('games').kind, 'collection');
	assert.equal(reg.get('games').collection, 'games');
	assert.equal(initials('Space Invaders'), 'SI');
	assert.equal(initials('Tetris'), 'Te');
});

test('registry: aliases show their target, available() needs an impl for app kinds', () => {
	const { reg } = setup();
	const alias = reg.get('sc-notes');
	assert.equal(alias.alias, 'notes');
	assert.equal(alias.kind, 'app');
	assert.equal(alias.name, 'Notes');
	assert.equal(alias.desc, 'Alias');
	assert.equal(reg.available('notes'), false);
	reg.register({ id: 'notes', kind: 'app', name: 'Notes (module)', icon: 'ti-notes' }, { source: 'module', module: 'notes', impl: { mount() {} } });
	assert.equal(reg.available('notes'), true);
	assert.equal(reg.available('sc-notes'), true);
	/* site fields win over the module manifest; the module adds what the site left out */
	assert.equal(reg.get('notes').name, 'Notes');
	assert.equal(reg.get('notes').icon, 'ti-notes');
	assert.equal(reg.get('notes').dock, true);
	assert.equal(typeof reg.impl('sc-notes').mount, 'function');
});

test('registry: items() sorts alpha by group then name, manual keeps order', () => {
	const { reg } = setup();
	assert.deepEqual(reg.items('games').map(a => a.id), ['game-alpha', 'game-zeta']);
	assert.deepEqual(reg.items('showcase').map(a => a.id), ['sc-notes', 'sc-site', 'sc-logo', 'sc-err']);
	assert.deepEqual(reg.items('nope'), []);
});

test('registry: extendCollection and removeSource (private bookmarks)', () => {
	const { reg } = setup();
	reg.extendCollection('games', { groups: [{ id: 'private', name: 'Private' }], items: [{ slug: 'secret', group: 'private', name: 'Secret', url: 'https://intra.example/' }], prepend: true }, { source: 'vault' });
	assert.equal(reg.get('game-secret').kind, 'link');
	assert.equal(reg.collection('games').groups[0].id, 'private');
	reg.removeSource('vault');
	assert.equal(reg.has('game-secret'), false);
	assert.equal(reg.collection('games').groups.length, 1);
});

test('registry: collections keep webUrl, allLabel and webLabel', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.addCollection({
		id: 'tools', name: 'Tools', webUrl: { en: '/en/tools/', de: '/de/werkzeuge/' },
		allLabel: { en: 'All tools', de: 'Alle Werkzeuge' }, webLabel: 'Tools on the web', items: []
	});
	const c = reg.collection('tools');
	assert.deepEqual({ ...c.webUrl }, { en: '/en/tools/', de: '/de/werkzeuge/' });
	assert.deepEqual({ ...c.allLabel }, { en: 'All tools', de: 'Alle Werkzeuge' });
	assert.equal(c.webLabel, 'Tools on the web');
	reg.addCollection({ id: 'bad', name: 'Bad', webUrl: 'javascript:alert(1)', allLabel: 42 });
	assert.equal(reg.collection('bad').webUrl, null);
	assert.equal(reg.collection('bad').allLabel, null);
	assert.equal(reg.collection('bad').webLabel, null);
	assert.ok(warnings.some(w => w.includes('webUrl')));
	reg.addCollection({ id: 'plain', name: 'Plain' });
	assert.equal(warnings.filter(w => w.includes("'plain'")).length, 0);
});

test('registry: items keep a valid man (path, { lang: path }, false); a bad one or an unknown placeholder is dropped with a warning, the item stays', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.addCollection({
		id: 'tools', prefix: 'tool', name: 'Tools', items: [
			{ slug: 'a', name: 'A', url: 'tools/a/', man: 'help/tools/a.md' },
			{ slug: 'b', name: 'B', url: 'tools/b/', man: { en: 'help/en/tools/{slug}.md', de: 'help/tools/{slug}.md' } },
			{ slug: 'c', name: 'C', url: 'tools/c/', man: false },
			{ slug: 'd', name: 'D', url: 'tools/d/', man: 'https://other.example/d.md' },
			{ slug: 'e', name: 'E', url: 'tools/e/', man: 'help/{name}.md' },
			{ slug: 'f', name: 'F', url: 'tools/f/' }
		]
	});
	assert.equal(reg.get('tool-a').man, 'help/tools/a.md');
	assert.deepEqual({ ...reg.get('tool-b').man }, { en: 'help/en/tools/{slug}.md', de: 'help/tools/{slug}.md' });
	assert.equal(reg.get('tool-c').man, false);
	for (const id of ['tool-d', 'tool-e', 'tool-f']) {
		assert.equal(reg.has(id), true, `${id} stays`);
		assert.equal('man' in reg.get(id), false, `${id} has no man`);
	}
	assert.equal(warnings.filter(w => /man must be false, a path on this site/.test(w)).length, 2);
});

test('registry: an alias view never carries its target\'s man', () => {
	const reg = createRegistry({ warn: () => {} });
	reg.addCollection({
		id: 'tools', prefix: 'tool', name: 'Tools', items: [
			{ slug: 'json', name: 'JSON', url: 'tools/json/', man: 'help/json.md', docs: 'help/json/' },
			{ slug: 'jq', app: 'tool-json' },
			{ slug: 'yq', app: 'tool-json', man: 'help/yq.md' }
		]
	});
	const jq = reg.get('tool-jq');
	assert.equal(jq.alias, 'tool-json');
	assert.equal('man' in jq, false, 'not the target\'s manual');
	assert.equal(jq.docs, 'help/json/', 'docs is still inherited (1.1.0)');
	assert.equal(jq.slug, 'jq');
	assert.equal(reg.get('tool-yq').man, 'help/yq.md');
	assert.equal(reg.get('tool-json').man, 'help/json.md');
});

test('registry: a collection\'s man needs {slug} or {id} in every value; false is kept; collection(id).man; collection(id).source', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.addCollection({ id: 'tools', name: 'Tools', man: { de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' } });
	reg.addCollection({ id: 'games', name: 'Games', man: false });
	reg.addCollection({ id: 'links', name: 'Links' });
	reg.addCollection({ id: 'fixed', name: 'Fixed', man: 'help/all.md' });
	reg.addCollection({ id: 'mixed', name: 'Mixed', man: { en: 'help/en/{id}.md', de: 'help/de/fixed.md' } });
	reg.addCollection({ id: 'odd', name: 'Odd', man: 'help/{group}/{slug}.md' });
	reg.addCollection({ id: 'mine', name: 'Mine', man: 'mine/{slug}.md' }, { source: 'vault' });
	assert.deepEqual({ ...reg.collection('tools').man }, { de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' });
	assert.equal(reg.collection('games').man, false);
	assert.equal(reg.collection('links').man, null);
	for (const id of ['fixed', 'mixed', 'odd']) assert.equal(reg.collection(id).man, null, id);
	assert.equal(warnings.filter(w => /man must be false, or a template on this site/.test(w)).length, 3);
	assert.equal(reg.collection('tools').source, 'site');
	assert.equal(reg.collection('mine').source, 'vault');
	assert.equal(reg.collection('mine').man, 'mine/{slug}.md');
});

test('registry: collections keep webApp, drop a bad one and their own Catalog', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	/* no existence check: tools-web is registered after the collection */
	reg.addCollection({ id: 'tools', name: 'Tools', basePath: 'tools/', webApp: 'tools-web', items: [] });
	reg.register({ id: 'tools-web', kind: 'web', name: 'Tools', hidden: true, url: 'tools/' });
	assert.equal(reg.collection('tools').webApp, 'tools-web');
	assert.equal(warnings.length, 0);
	reg.addCollection({ id: 'num', name: 'Num', webApp: 42 });
	reg.addCollection({ id: 'spaced', name: 'Spaced', webApp: 'Bad Id' });
	assert.equal(reg.collection('num').webApp, null);
	assert.equal(reg.collection('spaced').webApp, null);
	assert.equal(warnings.filter(w => w.includes('webApp must be an app id')).length, 2);
	reg.addCollection({ id: 'own', name: 'Own', webApp: 'own' });
	reg.addCollection({ id: 'own2', name: 'Own 2', app: 'browser', webApp: 'browser' });
	assert.equal(reg.collection('own').webApp, null);
	assert.equal(reg.collection('own2').webApp, null);
	assert.equal(warnings.filter(w => w.includes('own Catalog')).length, 2);
	reg.addCollection({ id: 'plain', name: 'Plain' });
	assert.equal(reg.collection('plain').webApp, null);
	assert.equal(warnings.filter(w => w.includes("'plain'")).length, 0);
});

test('registry: collection items pass nodock, hidden and allowHttp through', () => {

	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.addCollection({
		id: 'links', name: 'Links', items: [
			{ slug: 'intra', name: 'Intranet', url: 'http://intra.example/', allowHttp: true, nodock: true },
			{ slug: 'quiet', name: 'Quiet', url: 'https://example.org/', hidden: true },
			{ slug: 'plain', name: 'Plain', url: 'http://plain.example/' }
		]
	});
	const intra = reg.get('links-intra');
	assert.equal(intra.kind, 'link');
	assert.equal(intra.url, 'http://intra.example/');
	assert.equal(intra.nodock, true);
	assert.equal(intra.hidden, undefined);
	assert.equal(reg.get('links-quiet').hidden, true);
	assert.equal(reg.get('links-quiet').nodock, undefined);
	assert.equal(reg.list().some(a => a.id === 'links-quiet'), false);
	/* without allowHttp (item or collection) an http:// link is still refused */
	assert.equal(reg.has('links-plain'), false);
	assert.ok(warnings.some(w => w.includes('links-plain') || w.includes("'plain'") || w.includes('item 2')));
});

test('registry: removeCollection removes a collection another source added, never a site one', async () => {
	const { reg, warnings } = setup();
	reg.addCollection({
		id: 'bookmarks', name: 'Bookmarks', groups: [{ id: 'mine', name: 'Mine' }],
		items: [{ slug: 'a', group: 'mine', name: 'A', url: 'https://a.example/' }, { slug: 'b', group: 'mine', name: 'B', url: 'https://b.example/' }]
	}, { source: 'vault' });
	assert.equal(reg.get('bookmarks').kind, 'collection');
	assert.equal(reg.has('bookmarks-a'), true);
	assert.equal(reg.removeCollection('bookmarks'), true);
	assert.equal(reg.collection('bookmarks'), null);
	assert.equal(reg.has('bookmarks'), false);
	assert.equal(reg.has('bookmarks-a'), false);
	assert.equal(reg.has('bookmarks-b'), false);
	assert.equal(reg.collections().some(c => c.id === 'bookmarks'), false);
	/* after removeSource the apps are gone already — removing the empty collection still works */
	reg.addCollection({ id: 'private', name: 'Private', items: [{ slug: 'x', name: 'X', url: 'https://x.example/' }] }, { source: 'vault' });
	reg.removeSource('vault');
	assert.equal(reg.removeCollection('private'), true);
	assert.equal(reg.collection('private'), null);
	/* a browser app the site declared itself stays */
	reg.register({ id: 'shelf', kind: 'collection', collection: 'shelf', name: 'Shelf' });
	reg.addCollection({ id: 'shelf', name: 'Shelf', items: [] }, { source: 'vault' });
	assert.equal(reg.removeCollection('shelf'), true);
	assert.equal(reg.has('shelf'), true);
	/* site collections and unknown ids are refused */
	assert.equal(reg.removeCollection('games'), false);
	assert.equal(reg.has('game-zeta'), true);
	assert.ok(reg.collection('games'));
	assert.equal(reg.removeCollection('nope'), false);
	assert.ok(warnings.some(w => w.includes('removeCollection')));
});

test('router: resolveUrl rewrites own hosts to this origin', () => {
	const { router } = setup();
	assert.equal(router.resolveUrl('https://www.desk.example/desktop/x?y#z').href, `${ORIGIN}/desktop/x?y#z`);
	assert.equal(router.resolveUrl('https://other.example/a').origin, 'https://other.example');
	assert.equal(router.resolveUrl('site/a.html').href, `${ROOT}site/a.html`);
	assert.equal(router.resolveUrl('http://[bad'), null);
	assert.equal(router.relPath(new URL(`${ROOT}site/x.html`)), 'site/x.html');
	assert.equal(router.relPath(new URL('https://other.example/desktop/x')), null);
});

test('router: route() — config rules, collection base paths, files, pages', () => {
	const { router } = setup();
	const r = p => router.route(new URL(p, ORIGIN));
	assert.deepEqual(r('/desktop/special'), { app: 'demo' });
	assert.deepEqual(r('/desktop/downloads/file.zip'), { tab: true });
	assert.deepEqual(r('/desktop/games/'), { app: 'games' });
	assert.deepEqual(r('/desktop/games'), { app: 'games' });
	assert.deepEqual(r('/desktop/games/zeta/'), { app: 'game-zeta' });
	assert.deepEqual(r('/desktop/games/zeta/index.html'), { app: 'game-zeta' });
	assert.deepEqual(r('/desktop/games/unknown/'), { page: true });
	assert.deepEqual(r('/desktop/archive.tar.gz'), { tab: true });
	assert.deepEqual(r('/desktop/site/content/en/docs/intro.html'), { page: true });
	assert.deepEqual(r('/desktop/some/page/'), { page: true });
});

test('router: pageApp() takes the longest URL prefix, else the default page app', () => {
	const { router } = setup();
	assert.equal(router.pageApp('/desktop/site/content/en/docs/intro.html').id, 'docs');
	assert.equal(router.pageApp('/desktop/site/content/de/about.html').id, 'about');
	assert.equal(router.pageApp('/elsewhere/').id, 'about');
});

test('router: pageAllowed() / pageApp() — never the desktop itself or a reserved folder (default page app included)', () => {
	const { reg } = setup();
	const tabs = [];
	const launched = [];
	const router = createRouter({
		registry: reg, site: { defaultPageApp: 'about' }, origin: ORIGIN, root: ROOT, reserved: ['site/vault/', null, 'javascript:x', '/'],
		launch: (id, opts) => { launched.push([id, opts]); return true; }, openTab: href => tabs.push(href)
	});
	for (const p of ['/desktop/', '/desktop', '/desktop/index.html', '/desktop/INDEX.HTM', '/desktop/index.html?x=1', '/desktop/site/vault/', '/desktop/site/vault', '/desktop/site/vault/abc.bin']) {
		assert.equal(router.pageAllowed(p), false, p);
		assert.equal(router.pageApp(p), null, p);
	}
	for (const p of ['/desktop/site/content/en/docs/', '/desktop/site/content/en/index.html', '/elsewhere/', '/desktop/site/vaulted/']) {
		assert.equal(router.pageAllowed(p), true, p);
	}
	assert.equal(router.pageAllowed(42), false);
	/* a link to the desktop itself goes to a tab, never into the default page app */
	router.openUrl('/desktop/index.html');
	assert.deepEqual(launched, []);
	assert.deepEqual(tabs, [`${ORIGIN}/desktop/index.html`]);
});

test('router: openUrl() — external tab, app launch, reader with url, non-http refused', () => {
	const { router, launched, tabs } = setup();
	assert.equal(router.openUrl('https://other.example/x'), true);
	assert.equal(router.openUrl('javascript:alert(1)'), false);
	assert.equal(router.openUrl('mailto:a@b.c'), false);
	router.openUrl('/desktop/games/zeta/');
	router.openUrl('/desktop/site/content/en/docs/a.html?x=1#h');
	router.openUrl('/desktop/file.pdf');
	assert.deepEqual(tabs, ['https://other.example/x', `${ORIGIN}/desktop/file.pdf`]);
	assert.deepEqual(launched, [['game-zeta', undefined], ['docs', { url: '/desktop/site/content/en/docs/a.html?x=1#h' }]]);
});

test('router: openUrl() falls back to a new tab when the app or page app cannot open', () => {
	const { reg, router, tabs } = setup();
	const failing = createRouter({
		registry: reg, site: { routes: [], defaultPageApp: 'about' }, origin: ORIGIN, root: ROOT,
		launch: () => false, openTab: href => tabs.push(href)
	});
	assert.equal(failing.openUrl('/desktop/games/zeta/'), true);
	assert.equal(failing.openUrl('/desktop/site/content/en/docs/a.html'), true);
	assert.deepEqual(tabs, [`${ORIGIN}/desktop/games/zeta/`, `${ORIGIN}/desktop/site/content/en/docs/a.html`]);
	/* without a Reader no page app counts — the link goes to a tab instead of nowhere */
	reg.setKindCheck(kind => kind !== 'page');
	assert.equal(router.pageApp('/desktop/site/content/en/docs/intro.html'), null);
	assert.equal(router.pageApp('/elsewhere/'), null);
	router.openUrl('/desktop/site/content/en/about.html');
	assert.equal(tabs.at(-1), `${ORIGIN}/desktop/site/content/en/about.html`);
});

test('router: acceptPath() judges paths relative to the installation root (sub-folder install)', () => {
	const reg = createRegistry({ warn: () => {} });
	const root = `${ORIGIN}/desk/`;
	const router = createRouter({ registry: reg, site: {}, origin: ORIGIN, root });
	const start = `${root}demos/clock/index.html`;
	assert.equal(router.acceptPath(start, '/desk/demos/clock/?tz=UTC#x'), '/desk/demos/clock/?tz=UTC#x');
	assert.equal(router.acceptPath(start, '/desk/demos/other/'), '/desk/demos/other/');
	/* the desktop itself, other folders of the install and paths outside it never qualify */
	assert.equal(router.acceptPath(start, '/desk/'), null);
	assert.equal(router.acceptPath(start, '/desk/index.html'), null);
	assert.equal(router.acceptPath(start, '/desk/site/vault/x.bin'), null);
	assert.equal(router.acceptPath(start, '/elsewhere/demos/clock/'), null);
	assert.equal(router.acceptPath(start, '//evil.example/desk/demos/'), null);
	/* an explicit scope narrows it */
	assert.equal(router.acceptPath(start, '/desk/demos/other/', 'demos/clock/'), null);
	assert.equal(router.acceptPath(start, '/desk/demos/clock/a.html', 'demos/clock/'), '/desk/demos/clock/a.html');
	/* a start page directly in the root: only that page */
	assert.equal(router.acceptPath(`${root}game.html`, '/desk/game.html?level=2'), '/desk/game.html?level=2');
	assert.equal(router.acceptPath(`${root}game.html`, '/desk/other.html'), null);
	assert.equal(router.acceptPath(`${root}index.html`, '/desk/index.html'), null);
});

/* ---------- acceptPath: start pages outside the root, scopes, the boundary ---------- */

const mk = (root, reserved = []) => createRouter({ registry: createRegistry({ warn: () => {} }), site: {}, origin: ORIGIN, root: `${ORIGIN}${root}`, reserved });
const accepts = (router, start, scope, ok, refused) => {
	for (const p of ok) assert.equal(router.acceptPath(start, p, scope), p, `${p} accepted (start ${start}, scope ${scope})`);
	for (const p of refused) assert.equal(router.acceptPath(start, p, scope), null, `${p} refused (start ${start}, scope ${scope})`);
};

test('router: acceptPath() — a start page outside the root keeps its own folder', () => {
	const router = mk('/desk/');
	accepts(router, `${ORIGIN}/wiki/start/`, null,
		['/wiki/start/page.php?id=3#top', '/wiki/start'],
		['/wiki/other/', '/wiki/', '/wiki/startx/', '/forum/', '/', '/desk/', '/desk/index.html', '/desk/src/core/config.js']);
	accepts(router, `${ORIGIN}/wiki/start/index.html`, null, ['/wiki/start/a.html', '/wiki/start/'], ['/wiki/other.html']);
});

test('router: acceptPath() — a start page whose folder holds the root accepts only itself', () => {
	accepts(mk('/desk/'), `${ORIGIN}/status.html`, null, ['/status.html?from=x', '/status.html'], ['/other.html', '/']);
});

test('router: acceptPath() — the default folder never holds the installation root', () => {
	const router = mk('/portal/desk/');
	accepts(router, `${ORIGIN}/portal/clock/index.html`, null,
		['/portal/clock/a.html'], ['/portal/other/', '/portal/desk/', '/portal/desk/index.html', '/portal/']);
	accepts(router, `${ORIGIN}/portal/index.html`, null, ['/portal/index.html'], ['/portal/x.html']);
});

test('router: acceptPath() — a root-absolute scope', () => {
	const router = mk('/desk/');
	const start = `${ORIGIN}/wiki/start/`;
	accepts(router, start, '/wiki/', ['/wiki/other/p.html', '/wiki'], ['/wikis/', '/forum/']);
	/* without a trailing slash it is a folder all the same — and may narrow the default */
	accepts(router, start, '/wiki/start/a', ['/wiki/start/a/x'], ['/wiki/start/b']);
	/* the start page need not lie in it */
	accepts(router, start, '/forum/', ['/forum/t/1'], ['/wiki/start/x']);
});

test('router: acceptPath() — scopes that hold the root or lie inside it are ignored (one warning each)', t => {
	const warn = t.mock.method(console, 'warn', () => {});
	const router = mk('/desk/');
	const start = `${ORIGIN}/wiki/start/`;
	const scopes = ['/', '/desk/', '/DESK/', '/desk'];
	for (let round = 0; round < 2; round++) {
		for (const scope of scopes) accepts(router, start, scope, ['/wiki/start/x'], ['/wiki/other/', '/desk/src/x.js']);
	}
	const inside = `${ORIGIN}/desk/demos/clock/`;
	for (let round = 0; round < 2; round++) {
		for (const scope of ['/desk/demos/', '/Desk/site/']) accepts(router, inside, scope, ['/desk/demos/other/'], ['/Desk/site/vault/x.bin']);
	}
	assert.equal(warn.mock.callCount(), scopes.length + 2, 'one warning per distinct scope value');
	for (const c of warn.mock.calls) assert.match(String(c.arguments[0]), /^\[router\] app scope /);
});

test('router: acceptPath() — unsafe scopes are ignored', t => {
	t.mock.method(console, 'warn', () => {});
	const router = mk('/desk/');
	for (const scope of ['../wiki/', '/wiki/../desk/', '/wiki/%2e%2e/desk/', '/wiki/..;/desk/', '/wiki;x/',
		'https://desk.example/wiki/', '//evil.example/', '/wiki/?x', '/wiki/#x', '/wi\\ki/', '/wiki//x/', '/wiki%2fx/']) {
		accepts(router, `${ORIGIN}/wiki/start/`, scope, ['/wiki/start/y'], ['/forum/a/']);
	}
});

test('router: acceptPath() — dot segments are refused in the raw path and in the server view', () => {
	const router = mk('/desk/');
	accepts(router, `${ORIGIN}/wiki/start/`, null, [
		/* kept: sessions of 1.1 may hold encoded slashes and empty segments inside the folder */
		'/wiki/start/?next=%2Fdesk%2F', '/wiki/start/Title%2FSub', '/wiki/start//x'
	], [
		'/wiki/start/../../desk/index.html', '/wiki/start/./x', '/wiki/start/%2e%2e/x', '/wiki/start/%2E./x',
		'/wiki/start/..%2f..%2fdesk/', '/wiki/start/a%2F..%2F..%2F..%2Fdesk/', '/wiki/start/%5c..%5cdesk/',
		'/wiki/start/..;/..;/desk/', '/wiki/start/a\\b', '/wiki/start/\t/x', '//evil.example/wiki/',
		'https://desk.example/wiki/', 'wiki/start/', `/wiki/start/${'a'.repeat(500)}`
	]);
});

test('router: acceptPath() — case variants of the installation folder', () => {
	const router = mk('/desk/');
	assert.equal(router.acceptPath(`${ORIGIN}/DESK/`, '/DESK/'), null);
	assert.equal(router.acceptPath(`${ORIGIN}/DESK/demos/clock/`, '/DESK/demos/clock/a.html'), null);
	assert.equal(router.acceptPath(`${ORIGIN}/wiki/start/`, '/Desk'), null);
	assert.equal(router.acceptPath(`${ORIGIN}/desk/demos/clock/`, '/desk/INDEX.HTML'), null);
});

test('router: acceptPath() — reserved folders stay closed (also inside the app\'s folder)', () => {
	const router = mk('/desk/', ['site/vault']);
	const start = `${ORIGIN}/desk/site/demo/`;
	accepts(router, start, 'site/', ['/desk/site/content/a.html'],
		['/desk/site/vault/x.bin', '/desk/site/vault', '/desk/site//vault/x.bin', '/desk/site/vault%2Fx.bin']);
	/* escapes of unreserved characters: servers decode them, the URL parser keeps them */
	accepts(router, start, 'site/', ['/desk/site/cont%65nt/a.html', '/desk/site/a%20b.html'],
		['/desk/site/v%61ult/x.bin', '/desk/site/V%41ULT/x.bin', '/desk/s%69te/vault/x.bin', '/desk/site/vaul%74', '/desk/%69ndex.html']);
	accepts(router, start, null, ['/desk/site/content/a.html'], ['/desk/site/vault/x.bin']);
	/* path parameters (Tomcat/Jetty), trailing dots and spaces and stream suffixes (IIS/Windows) */
	accepts(router, `${ORIGIN}/desk/site/content/demos/x/index.html`, null,
		['/desk/site/content/a;b.html', '/desk/site/vault-x/a', '/desk/site/a%20b/c.html'],
		['/desk/site/vault;x/a', '/desk/site/vault./a', '/desk/site/vault%20/a', '/desk/site/vault%20./a', '/desk/site/vault::$INDEX_ALLOCATION/a',
			'/desk/site/vault:$i30:$INDEX_ALLOCATION/a', '/desk/site/VAULT;x/a', '/desk/site/vault;x', '/desk/site/vault.', '/desk/index.html;x', '/desk/index.html.']);
	accepts(router, `${ORIGIN}/desk/SITE/demo/`, 'SITE/', ['/desk/SITE/content/a.html'], ['/desk/SITE/Vault/x.bin']);
});

test('router: acceptPath() — one start page per language', () => {
	const router = mk('/desk/');
	const starts = [`${ORIGIN}/en/help/`, `${ORIGIN}/help/`];
	accepts(router, starts, null, ['/help/a/', '/en/help/b'], ['/en/x/', '/fr/help/']);
	accepts(router, starts, '/help/', ['/help/a/'], ['/en/help/b']);
});

test('router: acceptPath() — an origin-root install keeps the first-folder default', () => {
	const router = mk('/', ['site/vault']);
	accepts(router, `${ORIGIN}/wiki/start/`, null, ['/wiki/other/'], ['/', '/index.html', '/site/vault/x.bin']);
});

test('router: acceptPath() — another origin', () => {
	const router = mk('/desk/');
	accepts(router, 'https://other.example/wiki/', null, [], ['/wiki/', '/wiki/a', '/desk/demos/']);
	accepts(router, ['https://other.example/wiki/', `${ORIGIN}/wiki/`], null, ['/wiki/a'], ['/forum/']);
});

/* ---------- registry: scope and linkPaths ---------- */

test('registry: scope and linkPaths are validated once', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	const web = (id, extra) => ({ id, kind: 'web', name: id, url: '/wiki/', ...extra });
	reg.load({
		apps: [
			web('w1', { scope: '/wiki/', linkPaths: true }),
			web('w2', { scope: '../x/' }),
			web('w3', { scope: 'https://x.example/' }),
			web('w4', { scope: 42 }),
			{ id: 'p1', kind: 'page', name: 'P', url: 'a.html', scope: 'docs/' }
		]
	});
	assert.equal(reg.get('w1').scope, '/wiki/');
	assert.equal(reg.get('w1').linkPaths, true);
	for (const id of ['w2', 'w3', 'w4']) {
		assert.ok(reg.get(id), `${id} registered`);
		assert.equal('scope' in reg.get(id), false, `${id} without scope`);
	}
	assert.equal(warnings.filter(m => /scope/.test(m)).length, 3);
	assert.equal(reg.get('p1').scope, 'docs/', 'a valid scope stays on other kinds (no warning)');
	/* an override record is checked the same way */
	warnings.length = 0;
	reg.register({ id: 'w1', scope: '/a/../b/' });
	assert.equal(warnings.filter(m => /scope/.test(m)).length, 1);
	assert.equal(reg.get('w1').scope, '/wiki/', 'the bad override value does not replace the app\'s own');
	reg.register({ id: 'x', scope: '/a/../b/' });
	assert.equal(warnings.filter(m => /scope/.test(m)).length, 2);
});

test('registry: collection items pass scope and linkPaths through', () => {
	const warnings = [];
	const reg = createRegistry({ warn: m => warnings.push(m) });
	reg.addCollection({
		id: 'pages', prefix: 'p', name: 'Pages',
		items: [
			{ slug: 'a', name: 'A', url: '/wiki/a/', kind: 'web', scope: '/wiki/', linkPaths: true },
			{ slug: 'b', name: 'B', url: '/wiki/b/', kind: 'web', scope: '/x/../y/' },
			{ slug: 'c', name: 'C', url: '/wiki/c/', linkPaths: 'yes' }
		]
	});
	assert.equal(reg.get('p-a').scope, '/wiki/');
	assert.equal(reg.get('p-a').linkPaths, true);
	assert.ok(reg.get('p-b'));
	assert.equal('scope' in reg.get('p-b'), false);
	assert.equal(warnings.filter(m => /scope/.test(m)).length, 1, 'one warning, not two');
	assert.equal(reg.get('p-c').linkPaths, undefined, 'only true opts in');
});
