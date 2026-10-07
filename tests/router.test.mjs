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
