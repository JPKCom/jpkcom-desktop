/* JPKCom Desktop — tests: shell (P2) — shortcuts, dock pins, deep links, drop, menus, language switch — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys, matchKeys, searchShortcut } from '../src/shell/shortcuts.js';
import { cleanPins, movePin, pinTarget } from '../src/shell/dock.js';
import { desktopApps } from '../src/shell/desktop-icons.js';
import { parseHash, hashOf } from '../src/shell/deeplinks.js';
import { kindOf, accepts, assign } from '../src/shell/drop.js';
import { cleanSiteMenus, siteEntries } from '../src/shell/menubar.js';
import { shortCode, nextLang, switchLabel, items as languageItems } from '../src/shell/lang.js';
import { filterApps, launcherEntries } from '../src/shell/launcher.js';
import { reach } from '../src/shell/title-fit.js';
import { group, windowItems } from '../src/shell/context-menu.js';
import { labelLang } from '../src/shell/menus.js';
import { canPopOut, kindDef, acceptUrl as wmAcceptUrl } from '../src/wm/wm.js';
import { player } from '../src/apps/media/player.js';
import { provide } from '../src/core/services.js';
import { registry, createRegistry } from '../src/core/registry.js';
import { i18n } from '../src/core/i18n.js';
import { ROOT } from '../src/core/env.js';

const key = (k, mods = {}) => ({ key: k, code: mods.code ?? '', ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, altKey: !!mods.alt, shiftKey: !!mods.shift });

test('shortcuts: parseKeys reads modifiers, key names and physical codes', () => {
	assert.deepEqual(parseKeys('Mod+K'), { mod: true, ctrl: false, alt: false, shift: false, meta: false, key: 'k', code: null });
	assert.equal(parseKeys('Ctrl+ArrowUp').key, 'arrowup');
	assert.equal(parseKeys('Ctrl+Shift+Backquote').code, 'Backquote');
	assert.equal(parseKeys('Ctrl+Shift+Backquote').shift, true);
	assert.equal(parseKeys('F3').key, 'f3');
	assert.equal(parseKeys('Alt+Space').key, ' ');
	assert.equal(parseKeys('Ctrl++').key, '+');
	assert.equal(parseKeys('Foo+K'), null, 'unknown modifier');
	assert.equal(parseKeys(''), null);
	assert.equal(parseKeys(42), null);
});

test('shortcuts: matchKeys — Mod is Ctrl or ⌘, Alt and Shift must match', () => {
	const modK = parseKeys('Mod+K');
	assert.ok(matchKeys(modK, key('k', { ctrl: true })));
	assert.ok(matchKeys(modK, key('K', { meta: true })));
	assert.ok(!matchKeys(modK, key('k')));
	assert.ok(!matchKeys(modK, key('k', { ctrl: true, alt: true })));
	assert.ok(!matchKeys(modK, key('k', { ctrl: true, shift: true })));
	const f3 = parseKeys('F3');
	assert.ok(matchKeys(f3, key('F3')));
	assert.ok(!matchKeys(f3, key('F3', { ctrl: true })));
	const cycle = parseKeys('Ctrl+Backquote');
	assert.ok(matchKeys(cycle, key('^', { ctrl: true, code: 'Backquote' })));
	assert.ok(!matchKeys(cycle, key('^', { ctrl: true, shift: true, code: 'Backquote' })));
	assert.ok(matchKeys(parseKeys('Ctrl+Shift+Backquote'), key('°', { ctrl: true, shift: true, code: 'Backquote' })));
	/* Punctuation that needs Shift on some layouts still matches */
	assert.ok(matchKeys(parseKeys('?'), key('?', { shift: true })));
	assert.ok(!matchKeys(parseKeys('a'), key('A', { shift: true })));
});

test('dock: cleanPins keeps valid unique ids up to max', () => {
	assert.deepEqual(cleanPins(['notes', 'notes', 'x y', 'calc', 5, 'Todo'], 60), ['notes', 'calc']);
	assert.deepEqual(cleanPins(['a', 'b', 'c'], 2), ['a', 'b']);
	assert.equal(cleanPins('notes'), null);
	assert.equal(cleanPins(null), null);
});

/* A site that renamed apps and kept the old ids as aliases for old links (ARCHITECTURE §7 "Aliases") */
const aliasRegistry = () => {
	const reg = createRegistry({ warn: () => {} });
	reg.load({
		apps: [
			{ id: 'notes', kind: 'web', name: 'Notes', url: '/notes/', dock: true, desktop: true },
			{ id: 'calc', kind: 'web', name: 'Calculator', url: '/calc/', dock: true },
			{ id: 'old-notes', alias: 'notes', hidden: true },
			{ id: 'older-notes', alias: 'old-notes', hidden: true },
			{ id: 'notes-too', alias: 'notes' },
			{ id: 'old-ghost', alias: 'not-there-yet', hidden: true },
			/* a hidden web window and a visible alias of it (pinnable as the alias, as in 1.2) */
			{ id: 'wiki-window', kind: 'web', name: 'Wiki', url: '/wiki/', hidden: true },
			{ id: 'wiki', alias: 'wiki-window', hidden: false, name: 'Wiki' },
			{ id: 'old-wiki', alias: 'wiki-window', hidden: true },
			/* a manifest mistake: two aliases pointing at each other */
			{ id: 'cyc-a', alias: 'cyc-b', hidden: true },
			{ id: 'cyc-b', alias: 'cyc-a', hidden: true }
		],
		collections: [
			{ id: 'picks', prefix: 'pick', name: 'Picks', itemKind: 'web', items: [{ slug: 'notes', app: 'notes' }] }
		]
	});
	return reg;
};

/* the dock's pinnable() without the availability check */
const canPin = a => typeof a.kind === 'string' && !a.hidden && !a.nodock;

test('dock: cleanPins resolves alias ids to their target and keeps the first of each', () => {
	const reg = aliasRegistry();
	const resolve = id => pinTarget(id, x => reg.get(x), canPin);
	assert.equal(reg.get('old-notes').alias, 'notes');
	assert.equal(reg.get('older-notes').alias, 'notes', 'an alias of an alias ends at the app');
	/* a stored list from before the rename: the old id keeps its place, the later target pin goes */
	assert.deepEqual(cleanPins(['old-notes', 'calc', 'notes', 'older-notes', 'pick-notes', 'notes-too'], 60, resolve), ['notes', 'calc']);
	assert.deepEqual(cleanPins(['calc', 'old-notes'], 60, resolve), ['calc', 'notes'], 'order kept');
	/* ids the registry does not know (yet) stay; a hidden alias whose target is missing points at the target */
	assert.deepEqual(cleanPins(['later-app', 'old-ghost'], 60, resolve), ['later-app', 'not-there-yet']);
	/* max counts the resolved list; a resolver that answers nonsense keeps the stored id */
	assert.deepEqual(cleanPins(['old-notes', 'notes', 'calc'], 2, resolve), ['notes', 'calc']);
	assert.deepEqual(cleanPins(['notes', 'calc'], 60, () => 'Not An Id'), ['notes', 'calc']);
	assert.deepEqual(cleanPins(['notes', 'notes'], 60, null), ['notes'], 'without a resolver as before');
	assert.equal(cleanPins('old-notes', 60, resolve), null);
});

test('dock: pinTarget ends at an app or keeps the id, so resolving settles in one pass', () => {
	const reg = aliasRegistry();
	const get = x => reg.get(x);
	const resolve = id => pinTarget(id, get, canPin);
	assert.equal(resolve('notes'), 'notes');
	assert.equal(resolve('old-notes'), 'notes');
	assert.equal(resolve('later-app'), 'later-app', 'unknown ids stay');
	/* a cycle never resolves: the stored id stays (before, a → b → a → … flipped on every pass) */
	assert.equal(resolve('cyc-a'), 'cyc-a');
	assert.equal(resolve('cyc-b'), 'cyc-b');
	const once = cleanPins(['cyc-a', 'notes'], 60, resolve);
	assert.deepEqual(once, ['cyc-a', 'notes']);
	assert.deepEqual(cleanPins(once, 60, resolve), once);
	/* a visible alias of an app that cannot be pinned stays the alias; a hidden one moves to the target */
	assert.equal(resolve('wiki'), 'wiki');
	assert.equal(resolve('old-wiki'), 'wiki-window');
	/* without canPin every alias that ends at an app resolves */
	assert.equal(pinTarget('wiki', get), 'wiki-window');
	/* idempotent for every id the registry knows, and for raw views */
	for (const a of reg.list({ hidden: true })) assert.equal(resolve(resolve(a.id)), resolve(a.id), a.id);
	assert.equal(pinTarget('x', () => ({ id: 'x', alias: 'x' })), 'x', 'an alias of itself stays');
	assert.equal(pinTarget('x', () => null), 'x');
});

test('dock: alias pins do not depend on which kinds the modules have defined yet', () => {
	/* The dock resolves (and writes back) its own list at the shell's setup, before the Reader,
	   Catalog and Viewer define page/collection/image: the wm's built-in kinds only */
	const defined = new Set(['web', 'app', 'native', 'link', 'launcher']);
	const reg = createRegistry({ warn: () => {}, kindCheck: k => defined.has(k) });
	reg.load({ apps: [
		{ id: 'about-page', kind: 'page', name: 'About', url: '/about/', hidden: true },
		{ id: 'about', alias: 'about-page', hidden: false, name: 'About' },
		{ id: 'old-about', alias: 'about-page', hidden: true },
		{ id: 'help', kind: 'page', name: 'Help', url: '/help/' },
		{ id: 'old-help', alias: 'help', hidden: true },
		{ id: 'later', alias: 'vault-app' },
		{ id: 'old-later', alias: 'vault-app', hidden: true }
	] });
	/* the dock's two tests: dockable (static, decides the alias rule) and pinnable (launchable now) */
	const dockable = a => !!a && typeof a.kind === 'string' && a.kind !== 'launcher' && !a.hidden && !a.nodock;
	const pinnable = a => dockable(a) && reg.available(a);
	const resolve = id => pinTarget(id, x => reg.get(x), dockable);
	const stored = ['about', 'old-about', 'old-help', 'later', 'old-later'];
	const atStart = cleanPins(stored, 60, resolve);
	assert.deepEqual(atStart, ['about', 'about-page', 'help', 'later', 'vault-app']);
	assert.equal(pinnable(reg.get('about')), false, 'page is not defined yet');
	defined.add('page');
	assert.deepEqual(cleanPins(atStart, 60, resolve), atStart, 'the same list once page is defined');
	assert.equal(pinnable(reg.get('about')), true, 'the visible alias is shown');
	/* a visible alias waits for a target that comes later; then the usual rule applies */
	reg.register({ id: 'vault-app', kind: 'page', name: 'Vault', url: '/v/' });
	assert.deepEqual(cleanPins(atStart, 60, resolve), ['about', 'about-page', 'help', 'vault-app']);
});

test('desktop icons: desktopApps skips aliases, which inherit desktop: true from their target', () => {
	const reg = aliasRegistry();
	assert.equal(reg.get('notes-too').desktop, true, 'the alias view inherits the flag');
	assert.equal(reg.get('pick-notes').desktop, true, 'so does an alias item');
	assert.deepEqual(desktopApps(reg.list({ hidden: true })).map(a => a.id), ['notes']);
	assert.deepEqual(desktopApps(reg.list()).map(a => a.id), ['notes']);
	assert.deepEqual(desktopApps([{ id: 'a', desktop: true }, { id: 'b' }, { id: 'c', desktop: true, alias: 'a' }]).map(a => a.id), ['a']);
});

test('dock: movePin swaps within the section and keeps hidden pins', () => {
	const isLink = id => id.startsWith('link-');
	const pins = ['a', 'link-x', 'b', 'hidden', 'c', 'link-y'];
	const visible = id => id !== 'hidden';
	assert.deepEqual(movePin(pins, 'b', 1, { isLink, visible }), ['a', 'c', 'b', 'link-x', 'hidden', 'link-y']);
	assert.deepEqual(movePin(pins, 'link-y', -1, { isLink, visible }), ['link-y', 'link-x', 'a', 'b', 'hidden', 'c']);
	assert.equal(movePin(pins, 'a', -1, { isLink, visible }), null, 'first cannot go further');
	assert.equal(movePin(pins, 'c', 1, { isLink, visible }), null, 'last app');
	assert.equal(movePin(pins, 'nope', 1, { isLink, visible }), null);
});

test('deep links: parseHash', () => {
	assert.deepEqual(parseHash('#/site/content/en/about.html'), { path: '/site/content/en/about.html' });
	assert.deepEqual(parseHash('#app=notes'), { app: 'notes' });
	assert.deepEqual(parseHash('#app%3Dnotes'), { app: 'notes' });
	assert.deepEqual(parseHash('#search=hello%20world'), { search: 'hello world' });
	assert.equal(parseHash('#search=' + 'x'.repeat(400)).search.length, 200);
	assert.equal(parseHash('#//evil.example/'), null);
	/* A backslash counts as a slash, tabs and newlines vanish: no way around the '//host' rule */
	assert.equal(parseHash('#/%5Cevil.example/x'), null, 'encoded backslash');
	assert.equal(parseHash('#/\\evil.example/'), null, 'raw backslash');
	assert.equal(parseHash('#/%09/evil.example/'), null, 'tab');
	assert.equal(parseHash('#/%0A/evil.example/'), null, 'newline');
	assert.equal(parseHash('#/%7F'), null, 'DEL');
	assert.equal(parseHash('#app=Bad Id'), null);
	assert.equal(parseHash('#%E0%A4%A'), null, 'broken escape');
	assert.equal(parseHash(''), null);
	assert.equal(parseHash('#javascript:alert(1)'), null);
	/* No scheme-like first segment, no dot segments: such paths cannot be pages of this site */
	assert.equal(parseHash('#/blob:http://host/0b5c'), null, 'blob URL');
	assert.equal(parseHash('#/data:text/html,<script>alert(1)</script>'), null, 'data URL');
	assert.equal(parseHash('#/data%3Atext/html,x'), null, 'encoded colon');
	assert.equal(parseHash('#/../../etc/passwd'), null, 'dot segments');
	assert.equal(parseHash('#/docs/./x.html'), null, 'single dot segment');
	assert.equal(parseHash('#/docs/..'), null, 'trailing dot segment');
	assert.equal(parseHash('#/%252e%252e/etc/passwd'), null, 'double-encoded dot segments');
	assert.deepEqual(parseHash('#/docs/a:b.html'), { path: '/docs/a:b.html' }, 'a colon further on is a file name');
	assert.deepEqual(parseHash('#/docs/..x/.well/'), { path: '/docs/..x/.well/' }, 'dots inside a name');
});

test('deep links: parseHash reads #app=<id>&path= and ignores unknown parameters', () => {
	assert.deepEqual(parseHash('#app=wiki&path=/wiki/a/b.html?x=1&y=2'), { app: 'wiki', url: '/wiki/a/b.html?x=1&y=2' }, 'path= comes last and keeps its query');
	assert.deepEqual(parseHash('#app%3Dwiki%26path%3D%2Fwiki%2F'), { app: 'wiki', url: '/wiki/' });
	assert.deepEqual(parseHash('#app=wiki&path=/wiki/a%2520b/'), { app: 'wiki', url: '/wiki/a%20b/' }, 'one decoding');
	assert.deepEqual(parseHash('#app=x&foo=1'), { app: 'x' }, 'an unknown parameter still opens the app');
	assert.deepEqual(parseHash('#app=wiki&foo=1&path=/wiki/a/'), { app: 'wiki', url: '/wiki/a/' });
	/* a bad path is dropped, the app still opens */
	for (const bad of ['//evil.example/', '/\\evil.example/', '/%09/x', '/../x', '/%2e%2e/x', '/blob:http://h/0', 'wiki/', '']) {
		assert.deepEqual(parseHash(`#app=wiki&path=${bad}`), { app: 'wiki' }, JSON.stringify(bad));
	}
	for (const bad of ['#app=Bad&path=/x', '#app=&path=/x', '#app=wiki&', '#app=wiki&Foo=1']) assert.equal(parseHash(bad), null, bad);
});

test('deep links: hashOf — the hash for a window', () => {
	const w = { id: 'wiki', kind: 'web', startPath: '/wiki/start/' };
	assert.equal(hashOf({ ...w, transient: true, path: '/wiki/a/' }), '');
	assert.equal(hashOf({ id: 'about', kind: 'page', path: '/site/content/en/a.html' }), '#/site/content/en/a.html');
	assert.equal(hashOf({ id: 'demo', kind: 'web', path: '/desk/demos/x/', routedApp: 'demo' }), '#/desk/demos/x/', 'the path leads back to the app');
	assert.equal(hashOf({ ...w, path: '/wiki/a/', accepted: '/wiki/a/' }), '#app=wiki&path=/wiki/a/');
	assert.equal(hashOf({ ...w, path: '/wiki/a%20b/', accepted: '/wiki/a%20b/' }), '#app=wiki&path=/wiki/a%2520b/', "'%' written as '%25'");
	assert.equal(hashOf({ ...w, path: '/wiki/start/', accepted: '/wiki/start/' }), '#app=wiki', 'the start page: the app alone');
	assert.equal(hashOf({ ...w, path: '/wiki/a/', accepted: null }), '#app=wiki', 'no linkPaths: as in 1.1');
	assert.equal(hashOf({ ...w }), '#app=wiki', 'no location');
	/* round trip: one decoding in parseHash gives the exact path back */
	for (const path of ['/wiki/a/', '/wiki/a%20b/?q=a%26b&x=1', '/wiki/%C3%A4/']) {
		assert.equal(parseHash(hashOf({ ...w, path, accepted: path })).url, path, path);
	}
});

test('window manager: the web kind gates linked paths with linkPaths and navigates only an untouched frame', () => {
	const web = kindDef('web');
	assert.equal(typeof web.acceptUrl, 'function');
	assert.equal(typeof web.reopen, 'function');
	const rootPath = new URL(ROOT).pathname;
	const app = { id: 'w', kind: 'web', url: 'demos/clock/' };
	const p = `${rootPath}demos/other/`;
	assert.equal(web.acceptUrl(app, p, 'link'), null, 'a link needs linkPaths');
	assert.equal(web.acceptUrl(app, p, 'session'), p);
	assert.equal(web.acceptUrl(app, p, 'launch'), p);
	assert.equal(web.acceptUrl({ ...app, linkPaths: true }, p, 'link'), p);
	assert.equal(wmAcceptUrl(app, p, 'bogus'), null, 'an unknown origin counts as a link');
	assert.equal(wmAcceptUrl(app, p), p, 'no origin: launch');
	assert.equal(wmAcceptUrl({ ...app, linkPaths: true }, p, 'link'), p);
	assert.equal(web.acceptUrl(app, rootPath, 'session'), null, 'never the desktop itself');
	/* reopen: only while the frame shows what the desktop loaded or is loading into it; never on restore */
	const origin = 'https://desk.example';
	const stub = (now, loaded) => {
		const frame = { src: 'unchanged', contentWindow: { location: { href: `${origin}${now}` } } };
		return { kind: 'web', def: web, app, frame, state: { loaded }, el: { querySelector: () => null } };
	};
	globalThis.location = new URL(`${origin}${rootPath}`);
	try {
		const target = `${rootPath}demos/clock/b.html`;
		const restored = stub(`${rootPath}demos/clock/`, `${rootPath}demos/clock/`);
		web.reopen(restored, { restore: true, url: target });
		assert.equal(restored.frame.src, 'unchanged', 'a restore never navigates');
		const fresh = stub(`${rootPath}demos/clock/`, `${rootPath}demos/clock/`);
		web.reopen(fresh, { url: target });
		assert.equal(fresh.frame.src, `${origin}${target}`, 'an untouched frame follows');
		assert.equal(fresh.state.expect, true);
		const touched = stub(`${rootPath}demos/clock/c.html`, `${rootPath}demos/clock/`);
		web.reopen(touched, { url: target });
		assert.equal(touched.frame.src, 'unchanged', 'the visitor navigated: only shown');
		const refused = stub(`${rootPath}demos/clock/`, `${rootPath}demos/clock/`);
		web.reopen(refused, { url: '/elsewhere/' });
		assert.equal(refused.frame.src, 'unchanged', 'a location outside the folder is refused');
		/* a load the desktop started has not finished yet (the session just restored the window): untouched */
		const loading = stub('', undefined);
		loading.frame.contentWindow.location.href = 'about:blank';
		loading.frame.src = `${origin}${rootPath}demos/clock/c.html`;
		loading.state.expect = true;
		web.reopen(loading, { url: target });
		assert.equal(loading.frame.src, `${origin}${target}`, 'a link wins over a restore that is still loading');
		assert.equal(loading.state.expect, true);
		const same = stub('', undefined);
		let sets = 0;
		same.frame = { contentWindow: { location: { href: 'about:blank' } }, get src() { return `${origin}${target}`; }, set src(v) { sets++; } };
		same.state.expect = true;
		web.reopen(same, { url: target });
		assert.equal(sets, 0, 'already loading that location: not loaded twice');
	} finally {
		delete globalThis.location;
	}
});

test('drop: kindOf by MIME type, else by extension', () => {
	assert.equal(kindOf({ name: 'a.png', type: 'image/png' }), 'image');
	assert.equal(kindOf({ name: 'a.svg', type: '' }), 'image');
	assert.equal(kindOf({ name: 'song.flac', type: '' }), 'audio');
	assert.equal(kindOf({ name: 'clip', type: 'video/mp4' }), 'video');
	assert.equal(kindOf({ name: 'notes.md', type: '' }), 'text');
	assert.equal(kindOf({ name: 'data.json', type: 'application/json' }), 'text');
	assert.equal(kindOf({ name: 'Makefile', type: '' }), 'text');
	assert.equal(kindOf({ name: 'setup.exe', type: 'application/x-msdownload' }), null);
	assert.equal(kindOf({ name: 'doc.pdf', type: 'application/pdf' }), null);
});

test('drop: handlers by accept, mime or built-in kind; order decides', () => {
	const text = { id: 'text', order: 50, open() {} };
	const md = { id: 'markdown', accept: ['.md'], order: 10, open() {} };
	const pdf = { id: 'pdf', mime: /^application\/pdf$/, open() {} };
	const audio = { id: 'audio', mime: 'audio/', multiple: true, open() {} };
	const files = [
		{ name: 'a.md', type: 'text/markdown' }, { name: 'b.txt', type: 'text/plain' },
		{ name: 'c.pdf', type: 'application/pdf' }, { name: 'd.mp3', type: 'audio/mpeg' }, { name: 'e.exe', type: '' }
	];
	assert.ok(accepts(md, files[0]));
	assert.ok(!accepts(md, files[1]));
	assert.ok(accepts(text, files[1]));
	const { groups, rest } = assign([text, md, pdf, audio], files);
	assert.deepEqual(groups.get(md).map(f => f.name), ['a.md']);
	assert.deepEqual(groups.get(text).map(f => f.name), ['b.txt']);
	assert.deepEqual(groups.get(pdf).map(f => f.name), ['c.pdf']);
	assert.deepEqual(groups.get(audio).map(f => f.name), ['d.mp3']);
	assert.deepEqual(rest.map(f => f.name), ['e.exe']);
});

test('menu bar: cleanSiteMenus validates site menus', () => {
	const warns = [];
	const out = cleanSiteMenus([
		{ id: 'pages', label: { en: 'Pages', de: 'Seiten' }, items: ['about', '-', { collection: 'bookmarks' }, { label: 'Docs', url: 'docs/' }, 'Bad Id', { what: 1 }] },
		{ label: 'More', items: [{ label: 'Sub', items: ['about', { label: 'Deeper', items: ['x'] }] }] },
		{ label: 'No items' },
		'nonsense'
	], m => warns.push(m));
	assert.equal(out.length, 2);
	assert.equal(out[0].id, 'site-pages');
	assert.deepEqual(out[0].items, ['about', '-', { collection: 'bookmarks' }, { label: 'Docs', url: 'docs/' }]);
	assert.equal(out[1].id, 'site-2');
	assert.deepEqual(out[1].items, [{ label: 'Sub', items: ['about'] }], 'one level of submenus');
	assert.ok(warns.length >= 3);
	assert.deepEqual(cleanSiteMenus(null), []);
	assert.deepEqual(cleanSiteMenus({}, () => {}), []);
});

test('language switch: short codes and the toggle target', () => {
	assert.equal(shortCode('de', ['de', 'en']), 'DE');
	assert.equal(shortCode('de-AT', ['de-AT', 'en']), 'DE');
	assert.equal(shortCode('pt-BR', ['pt-BR', 'pt-PT']), 'PT-BR');
	assert.equal(nextLang('de', ['de', 'en']), 'en');
	assert.equal(nextLang('en', ['de', 'en']), 'de');
	assert.equal(nextLang('en', ['de', 'en', 'fr']), null);
	assert.equal(nextLang('en', ['en']), null);
});

test('language switch: the action is written in the target language', async () => {
	const de = (await import('../locales/de/shell.js')).default;
	const en = (await import('../locales/en/shell.js')).default;
	assert.equal(switchLabel(en.langSwitchTo, 'English', 'x'), 'Switch to English');
	assert.equal(switchLabel(de.langSwitchTo, 'Deutsch', 'x'), 'Auf Deutsch umschalten');
	assert.equal(switchLabel(null, 'Deutsch', 'Switch to Deutsch'), 'Switch to Deutsch', 'not loaded yet: fallback');
	/* The German UI names the action in English, as in the original — in a part of its own
	   (lang="en" on that span), so langToggle carries no {action} any more */
	assert.equal(de.langToggle.replace('{current}', 'Deutsch'), 'Sprache: Deutsch.');
	assert.equal(en.langToggle.replace('{current}', 'English'), 'Language: English.');
	assert.ok(!de.langToggle.includes('{action}') && !en.langToggle.includes('{action}'));
});

test('launcher: filterApps searches names and descriptions', () => {
	const apps = [{ id: 'notes', name: 'Notes', desc: 'Quick notes' }, { id: 'calc', name: 'Calculator', desc: 'Numbers' }];
	assert.deepEqual(filterApps(apps, '').map(a => a.id), ['notes', 'calc']);
	assert.deepEqual(filterApps(apps, 'CALC').map(a => a.id), ['calc']);
	assert.deepEqual(filterApps(apps, 'quick').map(a => a.id), ['notes']);
	assert.deepEqual(filterApps(apps, 'zzz'), []);
});

test('title fit: reach measures both edges', () => {
	/* controls at the start, actions at the end of a 400px bar */
	assert.deepEqual(reach([{ left: 12, width: 60 }, { left: 300, width: 92 }], 400), { left: 72, right: 100 });
	assert.deepEqual(reach([{ left: 0, width: 0 }], 400), { left: 0, right: 0 });
});

test('context menu: group joins non-empty groups with separators', () => {
	assert.deepEqual(group([1], [], [2, 3], null, [4]), [1, '-', 2, 3, '-', 4]);
	assert.deepEqual(group([], []), []);
});

test('shortcuts: searchShortcut — the site\'s combination, Mod+K as fallback, null switches it off', () => {
	assert.equal(searchShortcut('Alt+S'), 'Alt+S');
	assert.equal(searchShortcut(undefined), 'Mod+K', 'missing');
	assert.equal(searchShortcut(42), 'Mod+K', 'not a string');
	assert.equal(searchShortcut('Foo+K'), 'Mod+K', 'unusable');
	assert.equal(searchShortcut(null), null, 'switched off: no built-in search shortcut, no row in list()');
	assert.equal(searchShortcut(false), null, 'as the search module reads it');
	assert.equal(searchShortcut(''), null, 'as the search module reads it');
});

/* ---------- popOut gate (files from the device must never open as a document of the desktop) ---------- */

const fakeWin = (def, extra = {}) => ({ kind: 'image', def, app: { id: 'img', name: 'Image', transient: true }, ...extra });

test('window manager: canPopOut — per window, false wins, a failing check counts as no', () => {
	const errors = console.error;
	console.error = () => {};
	try {
		assert.equal(canPopOut(null), false);
		assert.equal(canPopOut(fakeWin({ popOut() {} })), true, 'a kind with popOut');
		assert.equal(canPopOut(fakeWin({})), false, 'neither popOut nor a location');
		globalThis.location = new URL('https://example.com/');
		assert.equal(canPopOut(fakeWin({ locationOf: () => '/x' })), true, 'a location opens in a tab');
		assert.equal(canPopOut(fakeWin({ popOut() {}, canPopOut: () => false })), false);
		assert.equal(canPopOut(fakeWin({ popOut() {}, canPopOut: () => undefined })), true, 'only false says no');
		assert.equal(canPopOut(fakeWin({ popOut() {}, canPopOut() { throw new Error('x'); } })), false);
	} finally {
		console.error = errors;
		delete globalThis.location;
	}
});

test('window manager: app windows — canPopOut only with the implementation\'s popOut or a location; never for the media players', () => {
	const appWin = impl => ({ kind: 'app', def: kindDef('app'), impl, app: { id: 'x', kind: 'app' } });
	assert.ok(kindDef('app') && kindDef('native'));
	assert.equal(canPopOut(appWin({ mount() {} })), false, 'neither popOut nor a location (Notes, Tasks …)');
	assert.equal(canPopOut(appWin(player('audio'))), false, 'Audio Player');
	assert.equal(canPopOut(appWin(player('video'))), false, 'Video Player');
	assert.equal(canPopOut({ ...appWin(player('audio')), kind: 'native', def: kindDef('native') }), false);
	assert.equal(canPopOut(appWin({ mount() {}, popOut() {} })), true, 'own popOut');
	globalThis.location = new URL('https://example.com/');
	try {
		assert.equal(canPopOut(appWin({ mount() {}, locationOf: () => '/docs/' })), true, 'a location');
		assert.equal(canPopOut(appWin({ mount() {}, locationOf: () => null })), false, 'no location now');
		assert.equal(canPopOut(appWin({ mount() {}, locationOf: () => '/docs/', canPopOut: () => false })), false);
	} finally {
		delete globalThis.location;
	}
});

test('launcher: All apps never lists collection items — aliases included, the Catalog apps listed', () => {
	const reg = createRegistry({ warn: () => {} });
	reg.load({
		apps: [
			{ id: 'about-desktop', kind: 'web', name: 'About this desktop', url: '/about/' },
			{ id: 'gh', kind: 'link', name: 'Code host', url: 'https://example.com/' },
			{ id: 'launcher', kind: 'launcher', name: 'All apps' }
		],
		collections: [
			{ id: 'bookmarks', app: 'bookmarks', prefix: 'link', name: 'Bookmarks', itemKind: 'link', items: [
				{ slug: 'gh', app: 'gh' },
				{ slug: 'plain', name: 'Plain', url: 'https://example.org/' }
			] },
			{ id: 'showcase', prefix: 'show', name: 'Showcase', itemKind: 'web', items: [{ slug: 'system', app: 'about-desktop' }] }
		]
	});
	const listed = launcherEntries(reg.list()).map(a => a.id);
	assert.ok(listed.includes('gh') && listed.includes('about-desktop'), 'the targets themselves');
	assert.ok(!listed.some(id => /^(link|show)-/.test(id)), `no collection item: ${listed}`);
	assert.ok(!listed.includes('launcher'));
	assert.equal(reg.get('bookmarks')?.kind, 'collection', 'the Catalog app is registered');
	assert.ok(listed.includes('bookmarks'), `the Catalog app itself is listed: ${listed}`);
	assert.equal(reg.get('link-gh').item, true, 'an alias item is an item');
	assert.equal(reg.get('link-gh').alias, 'gh');
	assert.deepEqual(launcherEntries([{ id: 'odd', kind: 'app', collection: 'c' }, { id: 'f', kind: 'image', transient: true }]), []);
	assert.deepEqual(launcherEntries([{ id: 'cat', kind: 'collection', collection: 'c' }]).map(a => a.id), ['cat'], 'a Catalog app is listed');
});

test('context menu: windowItems offers no "Open in new tab" when the window says canPopOut false', () => {
	let allowed = false;
	const win = fakeWin({ popOut() {}, canPopOut: () => allowed });
	provide('wm', {
		menu: { layout: () => [] }, list: () => [win], has: () => false,
		reload() {}, popOut() {}, close() {}, locationOf: () => null, canPopOut
	});
	const labels = () => windowItems(win).filter(x => x !== '-').map(x => x.label);
	assert.ok(!labels().includes('core.openTab'));
	allowed = true;
	assert.ok(labels().includes('core.openTab'));
});

/* ---------- Site menus: collections inside a submenu ---------- */

test('menu bar: a grouped collection inside a submenu is listed flat (one submenu level)', () => {
	registry.load({
		collections: [{
			id: 'grouped', name: 'Grouped', itemKind: 'link',
			groups: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }],
			items: [
				{ slug: 'a', group: 'one', name: 'A', url: 'https://example.com/a' },
				{ slug: 'b', group: 'two', name: 'B', url: 'https://example.com/b' }
			]
		}]
	});
	const [top] = siteEntries([{ collection: 'grouped' }]);
	assert.equal(top.app, 'grouped', 'Open <collection> first');
	assert.ok(siteEntries([{ collection: 'grouped' }]).some(x => x.submenu), 'top level keeps its group submenus');

	const [sub] = siteEntries([{ label: 'More', items: [{ collection: 'grouped' }] }]);
	assert.ok(Array.isArray(sub.submenu));
	assert.ok(!sub.submenu.some(x => x !== '-' && x.submenu), 'no submenu inside the submenu');
	assert.deepEqual(sub.submenu.map(x => (x === '-' ? '-' : x.app)), ['grouped', '-', 'grouped-a', '-', 'grouped-b']);
});

/* ---------- Labels in another language ---------- */

test('menus: labelLang marks a label in another language, dir only when it differs', () => {
	const dirOf = c => (c === 'ar' ? 'rtl' : 'ltr');
	assert.deepEqual(labelLang('fr', { dirOf, pageDir: 'ltr' }), { lang: 'fr', dir: null });
	assert.deepEqual(labelLang('ar', { dirOf, pageDir: 'ltr' }), { lang: 'ar', dir: 'rtl' });
	assert.deepEqual(labelLang('de-AT', { dirOf, pageDir: 'rtl' }), { lang: 'de-AT', dir: 'ltr' });
	assert.deepEqual(labelLang('not a lang!'), { lang: null, dir: null });
	assert.deepEqual(labelLang(undefined), { lang: null, dir: null });
});

test('language switch: the language menu items carry their own language', () => {
	const list = languageItems();
	assert.ok(list.length >= 2);
	assert.deepEqual(list.map(x => x.lang), i18n.available());
	for (const x of list) assert.ok(labelLang(x.lang).lang, `${x.lang} is a usable lang attribute`);
});
