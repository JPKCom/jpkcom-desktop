/* JPKCom Desktop — tests: shell (P2) — shortcuts, dock pins, deep links, drop, menus, language switch — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys, matchKeys, searchShortcut } from '../src/shell/shortcuts.js';
import { cleanPins, movePin } from '../src/shell/dock.js';
import { parseHash } from '../src/shell/deeplinks.js';
import { kindOf, accepts, assign } from '../src/shell/drop.js';
import { cleanSiteMenus, siteEntries } from '../src/shell/menubar.js';
import { shortCode, nextLang, switchLabel, items as languageItems } from '../src/shell/lang.js';
import { filterApps, launcherEntries } from '../src/shell/launcher.js';
import { reach } from '../src/shell/title-fit.js';
import { group, windowItems } from '../src/shell/context-menu.js';
import { labelLang } from '../src/shell/menus.js';
import { canPopOut, kindDef } from '../src/wm/wm.js';
import { player } from '../src/apps/media/player.js';
import { provide } from '../src/core/services.js';
import { registry, createRegistry } from '../src/core/registry.js';
import { i18n } from '../src/core/i18n.js';

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
