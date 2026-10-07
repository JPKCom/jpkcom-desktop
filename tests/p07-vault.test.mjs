/* JPKCom Desktop — tests: vault (key derivation, sealed format v1/v2, content check, config, module service) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import {
	derive, seal, open, header, readHeader, sameParams, normUser, effectiveSalt, fileName, isFileId,
	clean, cleanText, cleanConfig, toCollectionItems, collectionDef, takenIds,
	MAGIC, DEFAULT_SALT, DEFAULT_ITERATIONS, DEFAULT_ICON, MAX_ITEMS
} from '../src/modules/vault/vault-core.js';
import { createRegistry } from '../src/core/registry.js';
import vault from '../src/modules/vault/index.js';

const FAST = { salt: 'test-salt', iterations: 10000 };   // the lowest config.vault.iterations accepts
const enc = new TextEncoder();

test('normUser: case, spaces and Unicode form of the user name do not matter', () => {
	assert.equal(normUser('  Ärger '), 'ärger');
	assert.equal(normUser('Ärger'), 'ärger');
	assert.equal(normUser(null), '');
	assert.equal(effectiveSalt(''), DEFAULT_SALT);
	assert.equal(effectiveSalt('x'), 'x');
	assert.equal(fileName('ab'), 'ab.bin');
	assert.ok(isFileId('0123456789abcdef0123456789abcdef'));
	assert.ok(!isFileId('../x'));
});

test('derive: same credentials → same file; any change → another file', async () => {
	const a = await derive('Tester ', 'secret', FAST);
	const b = await derive('tester', 'secret', FAST);
	assert.ok(isFileId(a.file));
	assert.equal(a.file, b.file);
	assert.equal(a.user, 'tester');
	assert.equal(a.key.extractable, false);
	assert.deepEqual(a.key.usages, ['decrypt']);
	assert.notEqual((await derive('tester', 'Secret', FAST)).file, a.file);
	assert.notEqual((await derive('tester', 'secret', { ...FAST, salt: 'other' })).file, a.file);
	assert.notEqual((await derive('tester', 'secret', { ...FAST, iterations: 1001 })).file, a.file);
	/* "ab" + "c" ≠ "a" + "bc" */
	assert.notEqual((await derive('ab', 'c', FAST)).file, (await derive('a', 'bc', FAST)).file);
});

test('derive: the original scheme (PBKDF2-SHA-256 over JSON [user, pass], bits 256–383 = file name)', async () => {
	const { file } = await derive('User', 'pässword', { salt: '', iterations: 2000 });
	const bits = pbkdf2Sync(Buffer.from(JSON.stringify(['user', 'pässword'])), Buffer.from(DEFAULT_SALT), 2000, 64, 'sha256');
	assert.equal(file, bits.subarray(32, 48).toString('hex'));
});

test('seal/open: round trip with the parameters in an authenticated header (version 2)', async () => {
	const { key } = await derive('u', 'p', { ...FAST, usages: ['encrypt', 'decrypt'] });
	const value = { groups: [{ id: 'g', name: { en: 'G', de: 'G' } }], items: [] };
	const sealed = await seal(key, value, FAST);
	assert.deepEqual([...sealed.subarray(0, 4)], MAGIC);
	assert.equal(sealed[4], 2);
	const head = readHeader(sealed);
	assert.equal(head.version, 2);
	assert.equal(head.iterations, 10000);
	assert.equal(head.salt, 'test-salt');
	assert.equal(head.size, header(FAST).length);
	assert.ok(sameParams(head, FAST));
	assert.ok(!sameParams(head, { ...FAST, iterations: 2000 }));
	assert.deepEqual(await open(key, sealed), value);
	assert.deepEqual(await open(key, sealed.buffer), value);
	assert.deepEqual(await open(key, sealed, FAST), value);
	await assert.rejects(open(key, sealed, { salt: 'other', iterations: 10000 }), /other parameters/);
	/* two seals of the same value differ (random IV) */
	assert.notDeepEqual(await seal(key, value, FAST), sealed);
});

test('open: a changed byte anywhere, a wrong key or a foreign file throws', async () => {
	const { key } = await derive('u', 'p', { ...FAST, usages: ['encrypt', 'decrypt'] });
	const sealed = await seal(key, { a: 1 }, FAST);
	for (const at of [6, 12, sealed.length - 1, header(FAST).length + 2]) {
		const bad = sealed.slice();
		bad[at] ^= 1;
		await assert.rejects(open(key, bad));
	}
	const other = (await derive('u', 'q', FAST)).key;
	await assert.rejects(open(other, sealed));
	await assert.rejects(open(key, enc.encode('<!doctype html><html>…</html>')), /unknown format/);
	await assert.rejects(open(key, new Uint8Array(3)), /unknown format/);
	assert.equal(readHeader(new Uint8Array([0x4a, 0x50, 0x4b, 0x56, 9, 0, 0])), null);
	assert.throws(() => header({ salt: 'x'.repeat(300) }), /at most/);
});

test('open: version 1 files of the original desktop are still read', async () => {
	const { key } = await derive('u', 'p', { salt: '', iterations: 1000, usages: ['encrypt', 'decrypt'] });
	const head = new Uint8Array([...MAGIC, 1]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, enc.encode('{"links":[]}')));
	const file = new Uint8Array([...head, ...iv, ...body]);
	const h = readHeader(file);
	assert.equal(h.version, 1);
	assert.equal(h.salt, DEFAULT_SALT);
	assert.equal(h.iterations, DEFAULT_ITERATIONS);
	assert.deepEqual(await open(key, file), { links: [] });
	assert.deepEqual(await open(key, file, { salt: '', iterations: DEFAULT_ITERATIONS }), { links: [] });
});

test('cleanText: strings and language maps of any size', () => {
	assert.equal(cleanText(' Work '), 'Work');
	assert.deepEqual(cleanText({ en: 'Work', de: ' Arbeit ', fr: '', 'zh-Hant': '工作', 'bad key': 'x', pl: 3 }), { en: 'Work', de: 'Arbeit', 'zh-Hant': '工作' });
	assert.equal(cleanText({ en: '' }), null);
	assert.equal(cleanText(''), null);
	assert.equal(cleanText('x'.repeat(61), 60), null);
	assert.equal(cleanText(['a']), null);
});

const DATA = {
	groups: [
		{ id: 'work', name: { en: 'Work', de: 'Arbeit' }, icon: 'ti-briefcase', tint: 'blue', desc: 'Job' },
		{ id: 'lab', name: 'Lab', tint: ['#ff0000', '#00ff00'] },
		{ id: 'empty', name: 'Empty' }
	],
	items: [
		{ slug: 'wiki', group: 'work', name: 'Wiki', url: 'https://wiki.example.org', desc: { en: 'Our wiki' }, icon: 'ti-book' },
		{ slug: 'nas', group: 'lab', name: 'NAS', url: 'http://192.168.1.10:5000/', desc: '' }
	]
};

test('clean: a valid vault passes; empty groups leave; icons fall back item → group → default', () => {
	const r = clean(DATA, { icons: id => id.startsWith('ti-'), tints: n => n === 'blue' });
	assert.deepEqual(r.problems, []);
	assert.deepEqual(r.groups.map(g => g.id), ['work', 'lab']);
	assert.equal(r.groups[0].desc, 'Job');
	assert.equal(r.groups[1].icon, DEFAULT_ICON);
	assert.deepEqual(r.groups[1].tint, ['#ff0000', '#00ff00']);
	assert.equal(r.items[0].url, 'https://wiki.example.org/');
	assert.equal(r.items[0].icon, 'ti-book');
	assert.equal(r.items[1].icon, DEFAULT_ICON);
	assert.equal(r.items[1].url, 'http://192.168.1.10:5000/');
	assert.ok(!('desc' in r.items[1]));
});

test('clean: every finding is a problem; unusable entries are dropped', () => {
	const r = clean({
		groups: [{ id: 'g', name: 'G', icon: 'fa-x', tint: 'mauve' }, { id: 'g', name: 'Twice' }, { id: 'Bad', name: 'x' }, { id: 'taken', name: 'T' }],
		items: [
			{ slug: 'a', group: 'g', name: 'A', url: 'https://user:pw@example.org/' },
			{ slug: 'b', group: 'g', name: 'B', url: 'javascript:alert(1)' },
			{ slug: 'c', group: 'nope', name: 'C', url: 'https://c.example/' },
			{ slug: 'used', group: 'g', name: 'U', url: 'https://u.example/' },
			{ slug: 'ok', group: 'g', name: 'Ok', url: 'https://ok.example/', icon: 'fa-y', desc: 5 },
			{ slug: 'ok', group: 'g', name: 'Again', url: 'https://ok.example/' },
			{ slug: 'x y', group: 'g', name: 'X', url: 'https://x.example/' }
		]
	}, { taken: { groups: new Set(['taken']), slugs: new Set(['used']) }, icons: id => id.startsWith('ti-'), tints: n => n === 'blue' });
	assert.deepEqual(r.groups.map(g => [g.id, g.icon, g.tint]), [['g', DEFAULT_ICON, 'slate']]);
	assert.deepEqual(r.items.map(x => [x.slug, x.icon]), [['ok', DEFAULT_ICON]]);
	const text = r.problems.join('\n');
	for (const part of ['icon "fa-x"', 'unknown tint "mauve"', 'id "g" is already taken', 'groups[2]: needs id', 'id "taken" is already taken',
		'without credentials', 'group must be one', 'items[3] (used): slug is already taken', 'icon "fa-y"', 'desc is not a text',
		'items[5] (ok): slug is already taken', 'items[6] (x y): needs slug']) {
		assert.ok(text.includes(part), `missing problem: ${part}\n${text}`);
	}
});

test('clean: the original format (linkCategories / links / cat) is read; limits', () => {
	const r = clean({
		linkCategories: [{ id: 'dev', name: { de: 'Entwicklung', en: 'Development' }, icon: 'fad-code', tint: 'teal' }],
		links: [{ slug: 'gh', cat: 'dev', name: 'Hub', url: 'https://hub.example/', desc: '' }]
	}, { icons: id => id.startsWith('ti-'), tints: () => true });
	assert.deepEqual(r.groups.map(g => [g.id, g.icon]), [['dev', DEFAULT_ICON]]);
	assert.deepEqual(r.items.map(x => [x.slug, x.group]), [['gh', 'dev']]);
	assert.ok(r.problems.some(p => p.startsWith('linkCategories[0]: icon')));
	assert.deepEqual(clean(null).problems, ['groups: none usable']);
	const many = clean({ groups: [{ id: 'g', name: 'G' }], items: Array.from({ length: MAX_ITEMS + 5 }, (_, i) => ({ slug: `s${i}`, group: 'g', name: 'N', url: 'https://e.example/' })) });
	assert.equal(many.items.length, MAX_ITEMS);
	assert.ok(many.problems.some(p => p.includes('at most')));
});

test('cleanConfig: salt, iterations and the folder are checked', () => {
	const warns = [];
	const c = cleanConfig({ salt: 42, iterations: 5, dir: '../x/', collection: 'Bad Id', maxBytes: -1 }, m => warns.push(m));
	assert.deepEqual(c, { salt: '', iterations: DEFAULT_ITERATIONS, dir: 'site/vault/', collection: 'bookmarks', maxBytes: 1048576 });
	assert.equal(warns.length, 5);
	const low = [];
	assert.equal(cleanConfig({ salt: 's', iterations: 200000, dir: '/data/' }, m => low.push(m)).iterations, 200000);
	assert.ok(low[0].includes('below the recommended'));
	assert.deepEqual(cleanConfig(undefined).dir, 'site/vault/');
	assert.equal(cleanConfig({ salt: 'ä'.repeat(128) }).salt, '');   // 256 bytes
});

test('collection items: they join a collection first and leave with removeSource', () => {
	const reg = createRegistry({ warn: () => {} });
	reg.addCollection({ id: 'bookmarks', prefix: 'link', name: 'Bookmarks', groups: [{ id: 'pub', name: 'Public' }],
		items: [{ slug: 'site', group: 'pub', name: 'Site', url: 'https://site.example/' }] });
	const taken = takenIds(reg.collection('bookmarks'), reg.list({ hidden: true, unavailable: true }));
	assert.deepEqual([...taken.groups], ['pub']);
	assert.deepEqual([...taken.slugs], ['site']);
	const { groups, items } = clean({ groups: [{ id: 'mine', name: 'Mine' }, { id: 'pub', name: 'Twice' }],
		items: [{ slug: 'wiki', group: 'mine', name: 'Wiki', url: 'https://wiki.example/' }, { slug: 'site', group: 'mine', name: 'Clash', url: 'https://x.example/' }] }, { taken });
	const list = toCollectionItems(items);
	assert.equal(list[0].kind, 'link');
	assert.equal(list[0].nodock, true);
	reg.extendCollection('bookmarks', { groups, items: list, prepend: true }, { source: 'vault' });
	assert.deepEqual(reg.collection('bookmarks').groups.map(g => g.id), ['mine', 'pub']);
	assert.deepEqual(reg.items('bookmarks').map(a => a.id), ['link-wiki', 'link-site']);
	assert.equal(reg.get('link-wiki').source, 'vault');
	assert.equal(reg.get('link-wiki').host, 'wiki.example');
	reg.removeSource('vault');
	assert.deepEqual(reg.items('bookmarks').map(a => a.id), ['link-site']);
	assert.deepEqual(reg.collection('bookmarks').groups.map(g => g.id), ['pub']);
	assert.equal(collectionDef('bookmarks', 'B').prefix, 'link');
});

/* ---------- The module with a fake desk (no IndexedDB in Node: keep() → false) ---------- */

function fakeDesk(files) {
	const events = [];
	const services = new Map();
	const ready = [];
	const reg = createRegistry({ L: v => (typeof v === 'string' ? v : v?.en ?? Object.values(v ?? {})[0] ?? ''), warn: () => {} });
	reg.addCollection({ id: 'bookmarks', prefix: 'link', name: 'Bookmarks', allowHttp: true, groups: [{ id: 'pub', name: 'Public' }],
		items: [{ slug: 'site', group: 'pub', name: 'Site', url: 'https://site.example/' }] });
	const NetError = class extends Error {
		constructor(code, status) {
			super(code);
			this.code = code;
			this.status = status;
		}
	};
	const desk = {
		config: { debug: false, vault: FAST, theme: { tints: { blue: [], slate: [] } } },
		apps: reg,
		icons: { has: id => id.startsWith('ti-') },
		store: { key: n => `test-${n}` },
		env: { asset: p => `http://localhost/${p}` },
		modules: { config: () => cleanConfig({ ...FAST, dir: 'site/vault/' }) },
		net: {
			async request(url, opts = {}) {
				if (url.includes('offline')) throw new NetError('network', 0);
				const name = url.split('/').pop();
				if (!files.has(name)) throw new NetError('http', 404);
				/* the body is read inside the request (timeout and size limit cover it) */
				assert.equal(opts.read, 'bytes');
				assert.ok(opts.maxBytes > 0);
				const bytes = files.get(name);
				if (bytes.length > opts.maxBytes) throw new NetError('size', 0);
				return bytes.slice();
			}
		},
		i18n: { fmtNumber: n => String(n), isYes: a => /^(y|yes)$/i.test(String(a).trim()) },
		t: (key, params) => `${key}${params ? ` ${JSON.stringify(params)}` : ''}`,
		L: v => (typeof v === 'string' ? v : v?.en),
		emit: (name, payload) => events.push([name, payload]),
		once: (name, fn) => ready.push(fn),
		provide: (name, impl) => services.set(name, impl)
	};
	return { desk, events, services, reg, ready };
}

test('module: service, unlock/lock through the collection, terminal login/logout', async () => {
	const { key, file } = await derive('Tester', 'right password', { ...FAST, usages: ['encrypt', 'decrypt'] });
	const files = new Map([[fileName(file), await seal(key, DATA, FAST)]]);
	const { desk, events, services, reg, ready } = fakeDesk(files);
	const warn = console.warn;
	console.warn = () => {};
	try {
		vault.setup(desk);
	} finally {
		console.warn = warn;
	}
	const V = services.get('vault');
	assert.ok(V);
	assert.equal(ready.length, 1);
	assert.equal(V.available(), true);
	assert.equal(V.user(), null);
	assert.equal(await V.unlock('tester', 'wrong'), 'denied');
	assert.equal(await V.unlock('Tester', 'right password'), 'ok');
	assert.equal(V.user(), 'tester');
	assert.deepEqual(events.at(-1), ['vault:change', { unlocked: true, user: 'tester' }]);
	assert.deepEqual(reg.collection('bookmarks').groups.map(g => g.id), ['work', 'lab', 'pub']);
	assert.equal(reg.get('link-wiki').source, 'vault');
	assert.deepEqual(V.summary(), [{ id: 'work', name: 'Work', count: 1 }, { id: 'lab', name: 'Lab', count: 1 }]);
	assert.equal(await V.keep(), false);
	await V.lock();
	assert.equal(V.user(), null);
	assert.equal(reg.get('link-wiki'), null);
	assert.deepEqual(reg.items('bookmarks').map(a => a.id), ['link-site']);
	assert.deepEqual(events.at(-1), ['vault:change', { unlocked: false, user: null }]);

	/* terminal: login asks user, password (secret), keep; logout */
	const terminal = vault.terminal;
	assert.equal(terminal.login.hidden, true);
	const out = [];
	const answers = ['Tester', 'right password', 'n'];
	const asked = [];
	const io = {
		say: (text, cls) => out.push(['say', text, cls]),
		err: text => out.push(['err', text]),
		table: rows => out.push(['table', rows]),
		readLine: async (label, opts) => {
			asked.push([label, opts?.secret === true]);
			return answers.shift();
		}
	};
	await terminal.login.run([], io);
	assert.deepEqual(asked, [['vault.user', false], ['vault.pass', true], ['vault.keep', false]]);
	assert.deepEqual(out.map(o => o[0]), ['say', 'say', 'table']);
	assert.equal(out[1][1], 'vault.ok {"user":"tester"}');
	assert.deepEqual(out[2][1], [['  Work', '1'], ['  Lab', '1']]);
	assert.ok(!JSON.stringify(out).includes('right password'));
	out.length = 0;
	await terminal.logout.run([], io);
	assert.deepEqual(out, [['say', 'vault.loggedOut', undefined]]);
	out.length = 0;
	await terminal.logout.run([], io);
	assert.deepEqual(out, [['err', 'vault.notLoggedIn']]);
	/* a cancelled question (null) stops quietly */
	answers.push(null);
	out.length = 0;
	await terminal.login.run([], io);
	assert.deepEqual(out, []);
	/* a wrong password */
	answers.push('tester', 'nope');
	await terminal.login.run([], io);
	assert.deepEqual(out.at(-1), ['err', 'vault.denied']);
	/* arguments are ignored with a hint (the terminal keeps them out of its history) */
	assert.equal(terminal.login.sensitive, true);
	answers.push(null);
	out.length = 0;
	await terminal.login.run(['alice', 'hunter2-secret'], io);
	assert.deepEqual(out, [['say', 'vault.noArgs', 'term-dim']]);
});

test('module: a site without the collection gets one while the vault is unlocked', async () => {
	const { key, file } = await derive('a', 'b', { ...FAST, usages: ['encrypt', 'decrypt'] });
	const files = new Map([[fileName(file), await seal(key, DATA, FAST)]]);
	const { desk, services } = fakeDesk(files);
	const reg = createRegistry({ warn: () => {} });
	desk.apps = reg;
	desk.modules = { config: () => cleanConfig({ ...FAST, collection: 'private' }) };
	const warn = console.warn;
	console.warn = () => {};
	try {
		vault.setup(desk);
	} finally {
		console.warn = warn;
	}
	const V = services.get('vault');
	assert.equal(await V.unlock('a', 'b'), 'ok');
	assert.equal(reg.get('private').kind, 'collection');
	assert.deepEqual(reg.items('private').map(a => a.id).sort(), ['link-wiki'].concat(reg.get('link-nas') ? ['link-nas'] : []).sort());
	await V.lock();
	assert.equal(reg.get('private'), null);
	assert.equal(await V.unlock('a', 'b'), 'ok');
	assert.equal(reg.get('private').kind, 'collection');
	await V.lock();
	/* The core registry removes the vault's own collection on lock; an older one kept it (empty) */
	assert.deepEqual(reg.collections().map(c => c.id), typeof reg.removeCollection === 'function' ? [] : ['private'],
		'removed by removeCollection(), else kept (empty)');
});

test('module: logging in again keeps the open Catalog window; lock closes it and removes the own collection', async () => {
	const one = await derive('a', 'b', { ...FAST, usages: ['encrypt', 'decrypt'] });
	const two = await derive('c', 'd', { ...FAST, usages: ['encrypt', 'decrypt'] });
	const files = new Map([[fileName(one.file), await seal(one.key, DATA, FAST)], [fileName(two.file), await seal(two.key, DATA, FAST)]]);
	const { desk, services } = fakeDesk(files);
	const reg = createRegistry({ warn: () => {} });
	const removed = [];
	desk.apps = { ...reg, removeCollection: id => removed.push(id) };
	desk.modules = { config: () => cleanConfig({ ...FAST, collection: 'private' }) };
	const open = new Set();
	const closed = [];
	desk.wm = { get: id => (open.has(id) ? { id } : null), close: win => { open.delete(win.id); closed.push(win.id); } };
	const warn = console.warn;
	console.warn = () => {};
	try {
		vault.setup(desk);
	} finally {
		console.warn = warn;
	}
	const V = services.get('vault');
	assert.equal(await V.unlock('a', 'b'), 'ok');
	open.add('private');
	assert.equal(await V.unlock('c', 'd'), 'ok');
	assert.equal(V.user(), 'c');
	assert.deepEqual(closed, [], 'a new login only redraws the window');
	assert.deepEqual(removed, []);
	assert.equal(reg.get('private').kind, 'collection');
	assert.ok(reg.get('link-wiki'));
	await V.lock();
	assert.deepEqual(closed, ['private']);
	assert.deepEqual(removed, ['private']);
	assert.equal(reg.get('private'), null);
});
