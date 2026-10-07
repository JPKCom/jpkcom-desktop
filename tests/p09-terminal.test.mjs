/* JPKCom Desktop — tests: terminal (parsing, matching, history, config, files, Markdown rows, command registry, DNS, calendar, browser and storage helpers) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	fold, parse, distance, nearest, commonPrefix, resolve, completeLine, cleanState, pushHistory, historyLine,
	cleanConfig, cleanDoh, fillTemplate, cleanFiles, isSafeHref, inlineParts, markdownRows, human, isRelPath, MAX_LINE
} from '../src/apps/terminal/lib.js';
import { createCommands, cleanDef, textOf } from '../src/apps/terminal/registry.js';
import { dnsName, reverseName, isIp, records, readAnswer, digArgs } from '../src/apps/terminal/commands/net.js';
import { monthGrid, asciiLogo, JPK_LOGO } from '../src/apps/terminal/commands/sys.js';
import { uaBrowser, uaOs, hintOs, utcOffset, BI_SECTIONS } from '../src/apps/terminal/commands/browser.js';
import { dfRow, dfLines, areaUse, AREA_QUOTA } from '../src/apps/terminal/commands/storage.js';
import eggs, { TEAPOT } from '../src/apps/terminal/commands/eggs.js';
import { dirArg } from '../src/apps/terminal/commands/fs.js';
import terminal from '../src/apps/terminal/index.js';

/* ---------- lib ---------- */

test('fold and parse: accents and case do not matter, quotes keep spaces', () => {
	assert.equal(fold('Über ÉCOLE'), 'uber ecole');
	assert.equal(fold('Straße'), 'strasse', 'the same rule as Search and Catalog');
	assert.deepEqual(parse('open  "My App"  x'), ['open', 'My App', 'x']);
	assert.deepEqual(parse("echo 'a b' c"), ['echo', 'a b', 'c']);
	assert.deepEqual(parse(''), []);
	assert.deepEqual(parse(null), []);
});

test('distance, nearest and commonPrefix', () => {
	assert.equal(distance('kitten', 'sitting'), 3);
	assert.equal(distance('', 'abc'), 3);
	assert.equal(nearest('hlep', ['help', 'history', 'ls']), 'help');
	assert.equal(nearest('xyzzy', ['help', 'ls']), null);
	assert.equal(commonPrefix(['history', 'hist', 'hi']), 'hi');
	assert.equal(commonPrefix([]), '');
});

test('resolve: exact key/name, then unique prefix, then unique part', () => {
	const list = [
		{ key: 'notes', name: 'Notes' }, { key: 'todo', name: 'Tasks' },
		{ key: 'calc', name: 'Calculator' }, { key: 'cal', name: 'Calendar' }
	];
	assert.equal(resolve('Notes', list).hit.key, 'notes');
	assert.equal(resolve('tasks', list).hit.key, 'todo');
	assert.equal(resolve('cal', list).hit.key, 'cal');         // exact beats prefix
	assert.equal(resolve('calcu', list).hit.key, 'calc');
	assert.equal(resolve('ca', list).many.length, 2);
	assert.equal(resolve('ulat', list).hit.key, 'calc');       // part of a name
	assert.deepEqual(resolve('zzz', list), {});
	assert.deepEqual(resolve('', list), {});
	/* equal keys: the earlier one wins */
	assert.equal(resolve('x', [{ key: 'x', name: 'First' }, { key: 'x', name: 'Second' }]).hit.name, 'First');
});

test('completeLine: one match, common prefix, several matches, none', () => {
	assert.deepEqual(completeLine('he', ['help', 'history']), { value: 'help ' });
	assert.deepEqual(completeLine('hi', ['history', 'hist-x']), { value: 'hist' });
	assert.deepEqual(completeLine('h', ['help', 'history']), { list: ['help', 'history'] });
	assert.equal(completeLine('zz', ['help']), null);
	assert.deepEqual(completeLine('open no', ['notes', 'nope']), { list: ['nope', 'notes'] });
	assert.deepEqual(completeLine('open not', ['notes', 'nope']), { value: 'open notes ' });
	assert.deepEqual(completeLine('ls ', ['apps/', 'apps/']), { value: 'ls apps/ ' });
});

test('cleanState: validates the stored history', () => {
	assert.equal(cleanState(null), null);
	assert.equal(cleanState([1]), null);
	assert.deepEqual(cleanState({}), { history: [], last: null });
	const v = cleanState({ history: ['ls', 3, '', 'x'.repeat(MAX_LINE + 1), 'a\u0007b', 'help'], last: 1700000000000 });
	assert.deepEqual(v, { history: ['ls', 'help'], last: 1700000000000 });
	assert.deepEqual(cleanState({ history: ['a', 'b', 'c'] }, 2).history, ['b', 'c']);
	assert.deepEqual(cleanState({ history: ['a'] }, 0).history, []);
	assert.equal(cleanState({ last: -5 }).last, null);
	assert.equal(cleanState({ last: Infinity }).last, null);
});

test('pushHistory: trims, no duplicate in a row, keeps size lines', () => {
	let s = { history: [], last: null };
	s = pushHistory(s, '  ls  ', 3);
	s = pushHistory(s, 'ls', 3);
	s = pushHistory(s, 'help', 3);
	s = pushHistory(s, 'date', 3);
	s = pushHistory(s, 'cal', 3);
	assert.deepEqual(s.history, ['help', 'date', 'cal']);
	assert.equal(pushHistory(s, '   ', 3), s);
	assert.equal(pushHistory(s, 'x', 0), s);
});

test('historyLine: a sensitive command keeps only its name (no password in history or backup)', () => {
	const cmds = createCommands({ warn: () => {} });
	cmds.register('login', { run() {}, hidden: true, sensitive: true }, { source: 'module:vault' });
	cmds.register('echo', { run() {}, sensitive: 'yes' });
	assert.equal(cmds.get('login').def.sensitive, true);
	assert.equal(cmds.get('echo').def.sensitive, false, 'only true counts');
	let s = { history: [], last: null };
	for (const line of ['login alice hunter2-secret', 'LOGIN', 'echo a b', 'logn alice pw']) {
		const [name] = parse(line);
		s = pushHistory(s, historyLine(line, cmds.get(fold(name))), 10);
	}
	assert.deepEqual(s.history, ['login', 'echo a b', 'logn alice pw'], 'unknown names stay as typed, as in any shell');
	assert.ok(!JSON.stringify(s).includes('hunter2'));
	assert.equal(historyLine('  ls -a ', null), 'ls -a');
});

test('cleanConfig: defaults, invalid values warned and replaced', () => {
	const warns = [];
	const warn = m => warns.push(m);
	assert.deepEqual(cleanConfig(undefined), { user: 'guest', doh: null, eggs: true, historySize: 100, manUrl: null });
	const c = cleanConfig({ user: 'a b', doh: { url: 'http://x/resolve' }, eggs: 'yes', historySize: -1, manUrl: 'https://x/{slug}.md' }, warn);
	assert.deepEqual(c, { user: 'guest', doh: null, eggs: true, historySize: 100, manUrl: null });
	assert.equal(warns.length, 5);
	const ok = cleanConfig({ user: 'ada', doh: { url: 'https://dns.example/resolve', name: 'Example DNS' }, eggs: false, historySize: 0, manUrl: 'docs/{lang}/{slug}.md' });
	assert.equal(ok.user, 'ada');
	assert.deepEqual(ok.doh, { url: 'https://dns.example/resolve', host: 'dns.example', name: 'Example DNS' });
	assert.equal(ok.eggs, false);
	assert.equal(ok.historySize, 0);
	assert.equal(ok.manUrl, 'docs/{lang}/{slug}.md');
});

test('cleanDoh: https only, name defaults to the host', () => {
	assert.equal(cleanDoh(null), null);
	assert.equal(cleanDoh({ url: 'ftp://x/' }), null);
	assert.equal(cleanDoh({ url: 'https://user:pw@x/' }), null);
	assert.equal(cleanDoh({ url: 'not a url' }), null);
	assert.deepEqual(cleanDoh({ url: 'https://dns.google/resolve' }), { url: 'https://dns.google/resolve', host: 'dns.google', name: 'dns.google' });
});

test('fillTemplate and isRelPath', () => {
	assert.equal(fillTemplate('docs/{lang}/{slug}.md', { lang: 'de', slug: 'a b' }), 'docs/de/a%20b.md');
	assert.equal(fillTemplate('{x}/{slug}', { slug: 's' }), '{x}/s');
	assert.ok(isRelPath('site/x.md'));
	assert.ok(isRelPath('LICENSE'));
	assert.ok(!isRelPath('https://x/y'));
	assert.ok(!isRelPath('//host/x'));
	assert.ok(!isRelPath('javascript:alert(1)'));
	assert.ok(!isRelPath('a b'));
});

test('cleanFiles: paths, language maps, aliases; invalid entries skipped', () => {
	const warns = [];
	const list = cleanFiles({
		about: { en: 'site/en/about.md', de: 'site/de/about.md' },
		license: 'LICENSE',
		imprint: { url: { en: 'en/imprint.md' }, aliases: ['Impressum', 'bad alias', 3] },
		evil: 'javascript:alert(1)',
		remote: 'https://example.com/x.md',
		'bad name': 'x.md',
		badmap: { en: 'x.md', 'not-a-lang!': 'y.md' }
	}, m => warns.push(m));
	assert.deepEqual(list.map(f => f.name), ['about', 'license', 'imprint']);
	assert.deepEqual(list[2].aliases, ['impressum']);
	assert.equal(warns.length, 4);
	assert.deepEqual(cleanFiles(null), []);
	assert.deepEqual(cleanFiles('x', () => {}), []);
});

test('isSafeHref and inline Markdown', () => {
	assert.ok(isSafeHref('https://example.com/'));
	assert.ok(isSafeHref('/docs/'));
	assert.ok(isSafeHref('docs/a.md'));
	assert.ok(isSafeHref('../a.md'));
	assert.ok(!isSafeHref('javascript:alert(1)'));
	assert.ok(!isSafeHref('//evil.example/'));
	assert.ok(!isSafeHref('http://example.com/'));
	assert.ok(!isSafeHref('data:text/html,x'));
	assert.deepEqual(inlineParts('a **b** `c` [d](https://e/) [f](javascript:x)'), [
		{ t: 'text', text: 'a ' }, { t: 'b', text: 'b' }, { t: 'text', text: ' ' }, { t: 'code', text: 'c' },
		{ t: 'text', text: ' ' }, { t: 'link', text: 'd', href: 'https://e/' }, { t: 'text', text: ' ' }, { t: 'text', text: 'f' }
	]);
});

test('markdownRows: front matter, headings, fences, no empty runs or trailing empties', () => {
	const md = '---\ntitle: x\n---\n# Title\n\n\n\nText **bold**\n```\ncode  line\n```\n\n';
	const rows = markdownRows(md);
	assert.deepEqual(rows.map(r => r.cls), ['term-h', null, null, 'term-pre term-block']);
	assert.equal(rows[0].parts[0].text, 'Title');
	assert.equal(rows[3].parts[0].text, 'code  line');
	assert.deepEqual(markdownRows('\r\nA\r\n'), [{ cls: null, parts: [{ t: 'text', text: 'A' }] }]);
	assert.deepEqual(markdownRows(''), []);
});

test('human: df -h style sizes', () => {
	assert.equal(human(0), '0');
	assert.equal(human(512), '512');
	assert.equal(human(5000), '4.9K');
	assert.equal(human(43008), '42K');
	assert.equal(human(1.2 * 1024 * 1024), '1.2M');
	assert.equal(human(5, (v, d) => `<${v.toFixed(d)}>`), '<5>');
});

/* ---------- registry ---------- */

test('command registry: register, duplicates, weak eggs, hidden, when, remove', () => {
	const warns = [];
	const reg = createCommands({ warn: m => warns.push(m) });
	const run = () => {};
	const offLs = reg.register('ls', { run, help: 'list' }, { source: 'builtin' });
	assert.equal(typeof offLs, 'function');
	assert.equal(reg.register('ls', { run }, { source: 'module:x' }), null);
	assert.equal(reg.register('Bad Name', { run }), null);
	assert.equal(reg.register('nofn', { help: 'x' }), null);
	assert.equal(warns.length, 3);

	reg.register('coffee', { run, hidden: true }, { source: 'builtin', weak: true });
	reg.register('later', { run, when: () => false });
	reg.register('boom', { run, when: () => { throw new Error('x'); } });
	assert.deepEqual(reg.names(), ['ls']);
	assert.deepEqual(reg.names({ hidden: true }), ['ls', 'coffee']);
	assert.equal(reg.get('later'), null);
	assert.equal(reg.get('boom'), null);
	assert.ok(reg.get('LS'));

	/* a real command replaces the weak egg and keeps its place */
	assert.equal(typeof reg.register('coffee', { run, help: 'brew' }, { source: 'module:cafe' }), 'function');
	assert.deepEqual(reg.names(), ['ls', 'coffee']);
	assert.equal(reg.get('coffee').source, 'module:cafe');
	assert.ok(reg.removeSource('module:cafe'));
	assert.equal(reg.get('coffee'), null);

	/* a weak egg after a real command of that name steps aside without a warning */
	const before = warns.length;
	reg.register('hello', { run, help: 'hi' }, { source: 'module:greet' });
	assert.equal(reg.register('hello', { run, hidden: true }, { source: 'builtin', weak: true }), null);
	assert.equal(warns.length, before);
	assert.equal(reg.get('hello').source, 'module:greet');

	/* a function is a command too */
	assert.ok(reg.register('fn', () => 'x'));
	assert.equal(typeof reg.get('fn').def.run, 'function');

	assert.ok(offLs());
	assert.equal(offLs(), false);
	assert.equal(reg.get('ls'), null);
});

test('cleanDef and textOf', () => {
	assert.equal(cleanDef(null), null);
	const d = cleanDef({ run() {}, help: { en: 'x' }, usage: 3, man: () => 'm', hidden: 'yes' });
	assert.deepEqual(d.help, { en: 'x' });
	assert.equal(d.usage, null);
	assert.equal(d.hidden, false);
	assert.equal(textOf(d.man), 'm');
	assert.equal(textOf(() => { throw new Error('x'); }), '');
	assert.equal(textOf(null), '');
	assert.equal(textOf('@a.b', v => `L(${v})`), 'L(@a.b)');
});

/* ---------- DNS ---------- */

test('dnsName: IDN to punycode, bad names refused', () => {
	assert.equal(dnsName('Example.COM.'), 'example.com');
	assert.equal(dnsName('bücher.de'), 'xn--bcher-kva.de');
	assert.equal(dnsName('_dmarc.example.com'), '_dmarc.example.com');
	assert.equal(dnsName(''), null);
	assert.equal(dnsName('a b'), null);
	assert.equal(dnsName('user@host'), null);
	assert.equal(dnsName('x'.repeat(254)), null);
});

test('reverseName and isIp', () => {
	assert.equal(reverseName('192.0.2.1'), '1.2.0.192.in-addr.arpa');
	assert.equal(reverseName('256.1.1.1'), null);
	assert.equal(reverseName('2001:db8::1'), '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
	assert.equal(reverseName('1::2::3'), null);
	assert.equal(reverseName('1:2:3'), null);
	assert.ok(isIp('10.0.0.1'));
	assert.ok(isIp('::1'));
	assert.ok(!isIp('example.com'));
});

test('records and readAnswer: plain, capped values', () => {
	const r = records([{ name: 'a.', type: 1, TTL: 60, data: '1.2.3.4' }, { name: 'b.', type: 9999, data: 'x' }, { name: 1, data: 'x' }, null]);
	assert.deepEqual(r, [{ name: 'a.', ttl: 60, type: 'A', data: '1.2.3.4' }, { name: 'b.', ttl: 0, type: 'TYPE9999', data: 'x' }]);
	assert.equal(readAnswer({}), null);
	assert.deepEqual(readAnswer({ Status: 0, RD: true, RA: true, Answer: [] }), { status: 0, flags: ['qr', 'rd', 'ra'], answer: [], authority: [] });
});

test('digArgs: name, type, +short, -x', () => {
	assert.deepEqual(digArgs(['example.com']), { name: 'example.com', type: 'A', short: false });
	assert.deepEqual(digArgs(['mx', 'example.com', '+short']), { name: 'example.com', type: 'MX', short: true });
	assert.deepEqual(digArgs(['example.com', 'txt']), { name: 'example.com', type: 'TXT', short: false });
	assert.deepEqual(digArgs(['mx']), { name: 'mx', type: 'A', short: false });     // the only word is the name
	assert.deepEqual(digArgs(['-x', '192.0.2.1']), { name: '1.2.0.192.in-addr.arpa', type: 'PTR', short: false });
	assert.deepEqual(digArgs(['-x', 'nope']), { error: 'badIp', value: 'nope' });
	assert.deepEqual(digArgs([]), { error: 'usage' });
	assert.deepEqual(digArgs(['a b']), { error: 'badName', value: 'a b' });
});

/* ---------- cal, neofetch, browser, df ---------- */

test('monthGrid: weeks from the first day of the week', () => {
	/* October 2026 starts on a Thursday */
	const mon = monthGrid(2026, 9, 1);
	assert.deepEqual(mon[0], [null, null, null, 1, 2, 3, 4]);
	assert.equal(mon.flat().filter(Boolean).length, 31);
	const sun = monthGrid(2026, 9, 7);
	assert.deepEqual(sun[0], [null, null, null, null, 1, 2, 3]);
	/* February 2021 starts on a Monday and fills four weeks */
	assert.equal(monthGrid(2021, 1, 1).length, 4);
});

test('asciiLogo: the configured art or the JPK default', () => {
	assert.equal(asciiLogo(null), JPK_LOGO);
	assert.equal(asciiLogo([]), JPK_LOGO);
	assert.equal(asciiLogo(['x'.repeat(41)]), JPK_LOGO);
	assert.equal(asciiLogo(['a\u0000']), JPK_LOGO);
	assert.deepEqual(asciiLogo(['/\\', '\\/']), ['/\\', '\\/']);
});

test('browser helpers: user agent, system, UTC offset', () => {
	assert.deepEqual(uaBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'), ['Firefox', '128.0']);
	assert.deepEqual(uaBrowser('Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'), ['Microsoft Edge', '126.0.0.0']);
	assert.deepEqual(uaBrowser('nothing'), [null, null]);
	assert.equal(uaOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'Android 14');
	assert.equal(uaOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows 10/11');
	assert.equal(uaOs('Mozilla/5.0 (X11; Linux x86_64)'), 'Linux');
	assert.equal(hintOs('Windows', '15.0.0'), 'Windows 11');
	assert.equal(hintOs('Windows', '10.0.0'), 'Windows 10');
	assert.equal(hintOs('Linux', '6.1.0'), 'Linux 6.1');
	assert.equal(hintOs('', ''), null);
	assert.equal(utcOffset(120), 'UTC+02:00');
	assert.equal(utcOffset(-330), 'UTC−05:30');
	assert.ok(BI_SECTIONS.includes('features'));
});

test('df rows and table, areaUse', () => {
	const fmt = n => String(n);
	assert.deepEqual(dfRow('local', 100, 25, '/h', fmt), ['local', '100', '25', '75', '25%', '/h']);
	assert.deepEqual(dfRow('x', 100, 150, '/h', fmt), ['x', '100', '150', '0', '100%', '/h']);
	const lines = dfLines(['FS', 'Size', 'Used', 'Avail', 'Use%', 'Mount'], [['a', '1', '2', '3', '4%', '/x']]);
	assert.equal(lines[0], 'FS  Size  Used  Avail  Use%  Mount');
	assert.equal(lines[1], 'a      1     2      3    4%  /x');
	const area = { length: 2, key: i => ['k1', 'kk2'][i], getItem: k => ({ k1: 'abc', kk2: '' })[k] };
	assert.deepEqual(areaUse(area), [{ key: 'k1', size: 5 }, { key: 'kk2', size: 3 }]);
	assert.equal(areaUse({ get length() { throw new Error('blocked'); } }), null);
	assert.equal(AREA_QUOTA, 5242880);
});

test('eggs: hidden, the teapot instead of a site page', () => {
	for (const [name, def] of Object.entries(eggs)) assert.equal(def.hidden, true, name);
	assert.ok(TEAPOT.length > 3);
	assert.equal(eggs.coffee, eggs.tea);
});

test('dirArg: directories, home, parent, unknown', () => {
	/* without site data only 'apps' exists */
	assert.equal(dirArg('apps/', ''), 'apps');
	assert.equal(dirArg('~/Apps', ''), 'apps');
	assert.equal(dirArg('~', 'apps'), '');
	assert.equal(dirArg('..', 'apps'), '');
	assert.equal(dirArg('.', 'apps'), 'apps');
	assert.equal(dirArg('../apps', 'apps'), 'apps');
	assert.equal(dirArg('nowhere', ''), null);
});

/* ---------- descriptor ---------- */

test('descriptor: app, storage, reset group, config cleaner, no DNS consent without a resolver', () => {
	assert.equal(terminal.id, 'terminal');
	assert.equal(terminal.kind, 'app');
	assert.deepEqual(terminal.i18n, ['terminal']);
	assert.equal(terminal.app.icon, 'ti-terminal-2');
	assert.equal(terminal.storage.term.reset, 'terminal');
	assert.equal(terminal.storage.term.validate('x'), null);
	assert.deepEqual(terminal.storage.term.validate({ history: ['ls'] }), { history: ['ls'], last: null });
	assert.equal(terminal.storage.term.count({ history: ['a', 'b'] }), 2);
	assert.equal(terminal.resetGroups[0].id, 'terminal');
	assert.deepEqual(terminal.consent, []);
	assert.equal(terminal.validateConfig({ historySize: 5 }, () => {}).historySize, 5);
	for (const hook of ['mount', 'focus', 'relabel', 'menu', 'unmount', 'setup']) assert.equal(typeof terminal[hook], 'function', hook);
});
