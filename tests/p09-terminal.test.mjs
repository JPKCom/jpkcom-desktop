/* JPKCom Desktop — tests: terminal (parsing, matching, history, config, files, Markdown rows, command registry, DNS, calendar, browser and storage helpers) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	fold, parse, distance, nearest, commonPrefix, resolve, completeLine, cleanState, pushHistory, historyLine,
	cleanConfig, cleanDoh, fillTemplate, cleanFiles, isSafeHref, inlineParts, markdownRows, human, isRelPath, MAX_LINE,
	MAN_VARS, isTextPath, MAX_MAN_SOURCES, expandMan, manPlan, hasManual, manLookup, manMiss, isHtmlType, manOutcome
} from '../src/apps/terminal/lib.js';
import { cleanMan } from '../src/core/man.js';
import { createCommands, cleanDef, textOf } from '../src/apps/terminal/registry.js';
import { dnsName, reverseName, isIp, records, readAnswer, digArgs } from '../src/apps/terminal/commands/net.js';
import { monthGrid, asciiLogo, JPK_LOGO } from '../src/apps/terminal/commands/sys.js';
import { uaBrowser, uaOs, hintOs, utcOffset, BI_SECTIONS } from '../src/apps/terminal/commands/browser.js';
import { dfRow, dfLines, areaUse, AREA_QUOTA } from '../src/apps/terminal/commands/storage.js';
import eggs, { TEAPOT } from '../src/apps/terminal/commands/eggs.js';
import { dirArg } from '../src/apps/terminal/commands/fs.js';
import terminal, { ORDER, commands } from '../src/apps/terminal/index.js';
import core from '../src/apps/terminal/commands/core.js';
import fsCommands from '../src/apps/terminal/commands/fs.js';
import sys from '../src/apps/terminal/commands/sys.js';
import browser from '../src/apps/terminal/commands/browser.js';
import storage from '../src/apps/terminal/commands/storage.js';
import netCommands from '../src/apps/terminal/commands/net.js';
import { readFileSync } from 'node:fs';

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
	assert.ok(!isRelPath('a\u0001b'), 'stricter now: no control character (src/core/url.js isSitePath)');
});

/* ---------- Manual pages of entries (man, manUrl) ---------- */

test('cleanMan: item values need no {slug}, templates do; unknown placeholders, bad language keys, scheme, //host, whitespace refused; false and null kept', () => {
	assert.deepEqual(cleanMan(undefined), { value: null, problem: null });
	assert.deepEqual(cleanMan(null), { value: null, problem: null });
	assert.deepEqual(cleanMan(false), { value: false, problem: null });
	assert.equal(cleanMan('help/fixed.md').value, 'help/fixed.md');
	assert.equal(cleanMan('/help/fixed.md').value, '/help/fixed.md', 'root-absolute is a path on this site');
	assert.equal(cleanMan('help/fixed.md', { template: true }).problem.code, 'template');
	assert.equal(cleanMan('help/{id}.md', { template: true }).value, 'help/{id}.md');
	assert.deepEqual({ ...cleanMan({ en: 'help/en/{slug}.md', 'de-AT': 'help/{slug}.md' }, { template: true }).value },
		{ en: 'help/en/{slug}.md', 'de-AT': 'help/{slug}.md' });
	const code = (v, o) => cleanMan(v, o).problem?.code;
	assert.equal(code('help/{name}.md'), 'placeholder');
	assert.equal(code('help/{Slug}.md'), 'placeholder');
	assert.equal(code('https://x.example/a.md'), 'path');
	assert.equal(code('//x.example/a.md'), 'path');
	assert.equal(code('javascript:alert(1)'), 'path');
	assert.equal(code('help/a b.md'), 'path');
	assert.equal(code('help/a\tb.md'), 'path');
	assert.equal(code('help\\a.md'), 'path');
	assert.equal(code(`${'x'.repeat(498)}.md`), 'path', '> 500 characters');
	assert.equal(code({ 'not a lang': 'x/{slug}.md' }), 'lang');
	assert.equal(code({}), 'type');
	assert.equal(code(true), 'type');
	assert.equal(code(['a.md']), 'type');
	assert.equal(code({ en: 'ok.md', de: 'https://x/a.md' }), 'path', 'one bad path spoils the whole map');
	assert.equal(cleanMan({ en: 'ok.md', de: 'x/{slug}' }, { template: true }).problem.code, 'template');
	assert.equal(cleanMan({ en: 'x/{slug}', de: 'a b' }).value, null);
});

test('cleanConfig: manUrl as a { lang: template } map', () => {
	const warns = [];
	const map = { de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' };
	assert.deepEqual({ ...cleanConfig({ manUrl: map }, m => warns.push(m)).manUrl }, map);
	assert.equal(cleanConfig({ manUrl: 'docs/{collection}/{id}.md' }).manUrl, 'docs/{collection}/{id}.md');
	assert.deepEqual(warns, []);
});

test('cleanConfig: a manUrl map with a bad key, path or placeholder is ignored as a whole', () => {
	for (const bad of [{ en: 'x/{slug}.md', 'not a lang': 'y/{slug}.md' }, { en: 'https://x/{slug}.md' }, { en: 'x/{name}.md' }, { en: 'x/fixed.md' }, 'x/{slug}.md '.trim() + ' y']) {
		const warns = [];
		assert.equal(cleanConfig({ manUrl: bad }, m => warns.push(m)).manUrl, null, JSON.stringify(bad));
		assert.equal(warns.length, 1, JSON.stringify(bad));
		assert.match(warns[0], /manUrl must be null, a path template on this site or a \{ lang: template \} map/);
	}
	const warns = [];
	assert.equal(cleanConfig({ manUrl: false }, m => warns.push(m)).manUrl, null);
	assert.deepEqual(warns, [], 'false is null, without a warning');
});

const VARS = { slug: 'a', id: 'tool-a', collection: 'tools' };

test('expandMan: a string with {lang} follows the chain; without {lang} one path', () => {
	assert.deepEqual(expandMan('m/{lang}/{slug}.md', VARS, ['de', 'en']), ['m/de/a.md', 'm/en/a.md']);
	assert.deepEqual(expandMan('m/{collection}/{id}.md', VARS, ['de', 'en']), ['m/tools/tool-a.md']);
	assert.deepEqual(expandMan(null, VARS, ['en']), []);
	assert.deepEqual(expandMan(false, VARS, ['en']), []);
});

test('expandMan: a map in chain order, base-language match (de-AT ↔ de), first value last, each path once', () => {
	const map = { fr: 'fr/{slug}.md', de: 'de/{slug}.md', en: 'en/{slug}.md' };
	assert.deepEqual(expandMan(map, VARS, ['en', 'de']), ['en/a.md', 'de/a.md', 'fr/a.md']);
	assert.deepEqual(expandMan(map, VARS, ['de-AT', 'de', 'en']), ['de/a.md', 'en/a.md', 'fr/a.md']);
	assert.deepEqual(expandMan({ 'de-AT': 'at/{lang}/{slug}.md', en: 'en/{slug}.md' }, VARS, ['de', 'en']), ['at/de-AT/a.md', 'en/a.md'],
		'{lang} in a map is the map key');
	assert.deepEqual(expandMan({ en: 'same.md', de: 'same.md' }, VARS, ['de', 'en']), ['same.md']);
});

test('expandMan: asymmetric layouts — de without, en with a language folder', () => {
	const map = { de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' };
	assert.deepEqual(expandMan(map, VARS, ['en', 'de']), ['help/en/tools/a.md', 'help/tools/a.md']);
	assert.deepEqual(expandMan(map, VARS, ['de', 'en']), ['help/tools/a.md', 'help/en/tools/a.md']);
});

test('expandMan: placeholders are URL-encoded and fill exactly MAN_VARS', () => {
	assert.deepEqual([...MAN_VARS], ['slug', 'id', 'collection', 'lang']);
	const all = MAN_VARS.map(v => `{${v}}`).join('/');
	assert.deepEqual(expandMan(all, { slug: 'a b', id: 'x/y', collection: 'c?' }, ['de-AT']), ['a%20b/x%2Fy/c%3F/de-AT']);
	for (const v of MAN_VARS) assert.doesNotMatch(expandMan(`p/{${v}}.md`, VARS, ['en'])[0], /\{/, v);
	assert.ok(isTextPath('a/b.MD?x=1#y') && isTextPath('a.markdown') && isTextPath('a.txt') && !isTextPath('a/') && !isTextPath('a.html'));
});

/* A collection item as catalog.js targets() gives it */
const item = (slug, app = {}, kind = 'tools') => ({
	kind, key: slug, id: `tool-${slug}`, name: slug,
	app: { id: `tool-${slug}`, slug, collection: kind, source: 'site', ...app }
});
const SITE = { man: null, source: 'site' };
const plan = (entry, { collection = SITE, manUrl = null, chain = ['de', 'en'] } = {}) => manPlan({ entry, collection, manUrl, chain });

test('manPlan: the item\'s man wins over docs text, the collection\'s man and manUrl', () => {
	const p = plan(item('a', { man: 'own/a.md', docs: 'docs/a.md' }), { collection: { man: 'coll/{slug}.md', source: 'site' }, manUrl: 'cfg/{slug}.md' });
	assert.deepEqual(p, { texts: ['own/a.md'], page: 'docs/a.md', off: false }, 'docs that is not printed is the link');
	const c = plan(item('a'), { collection: { man: 'coll/{lang}/{slug}.md', source: 'site' }, manUrl: 'cfg/{slug}.md' });
	assert.deepEqual(c.texts, ['coll/de/a.md', 'coll/en/a.md']);
	const u = plan(item('a'), { manUrl: { en: 'cfg/en/{slug}.md' } });
	assert.deepEqual(u.texts, ['cfg/en/a.md']);
	assert.equal(hasManual(plan(item('a'))), false, 'nothing set → no manual');
});

test('manPlan: the collection\'s man applies to its items only; another collection falls back to manUrl', () => {
	const tools = { man: 'tools/{slug}.md', source: 'site' };
	const games = { man: null, source: 'site' };
	assert.deepEqual(plan(item('a'), { collection: tools, manUrl: 'all/{collection}/{slug}.md' }).texts, ['tools/a.md']);
	assert.deepEqual(plan(item('snake', {}, 'games'), { collection: games, manUrl: 'all/{collection}/{slug}.md' }).texts, ['all/games/snake.md']);
	const off = plan(item('snake', {}, 'games'), { collection: { man: false, source: 'site' }, manUrl: 'all/{slug}.md' });
	assert.deepEqual(off, { texts: [], page: null, off: true }, 'false stops here; manUrl is not used');
	assert.equal(hasManual(off), false);
});

test('manPlan: templates skip items of another source (vault) — their own man still counts', () => {
	const coll = { man: 'links/{slug}.md', source: 'site' };
	const secret = item('private-bank', { source: 'vault' }, 'links');
	assert.deepEqual(plan(secret, { collection: coll, manUrl: 'all/{slug}.md' }), { texts: [], page: null, off: false });
	const own = item('private-bank', { source: 'vault', man: 'vault-help/bank.md' }, 'links');
	assert.deepEqual(plan(own, { collection: coll }).texts, ['vault-help/bank.md']);
	/* a collection the vault brings itself: its template applies to its own items */
	assert.deepEqual(plan(secret, { collection: { man: 'v/{slug}.md', source: 'vault' } }).texts, ['v/private-bank.md']);
});

test('manPlan: manUrl never applies to a collection another source brought (the vault\'s own one)', () => {
	/* the vault creates config.vault.collection itself (no man) when the site has none of that id */
	const vaultColl = { man: null, source: 'vault' };
	const secret = item('my-secret-bank', { source: 'vault' }, 'bookmarks');
	const p = plan(secret, { collection: vaultColl, manUrl: 'docs/{lang}/{slug}.md' });
	assert.deepEqual(p, { texts: [], page: null, off: false }, 'no request carries the private slug');
	assert.equal(hasManual(p), false, 'Tab completion does not list it');
	assert.deepEqual(plan(secret, { collection: vaultColl, manUrl: { en: 'docs/{slug}/' } }).page, null, 'nor a page link');
	/* the site's own items keep manUrl */
	assert.deepEqual(plan(item('a'), { manUrl: 'docs/{slug}.md' }).texts, ['docs/a.md']);
});

test('manPlan: an alias item uses its own man or its collection\'s template with its own slug', () => {
	const coll = { man: 'm/{slug}.md', source: 'site' };
	/* the registry's alias view carries no man of its target: only the alias's own */
	const alias = item('system', { alias: 'about-desktop', id: 'tool-system', docs: 'docs/about/' });
	assert.deepEqual(plan(alias, { collection: coll }), { texts: ['m/system.md'], page: 'docs/about/', off: false });
	assert.deepEqual(plan(item('system', { alias: 'about-desktop', man: 'x.md' }), { collection: coll }).texts, ['x.md']);
});

test('manPlan: man false keeps a docs page as the link; a docs text file not printed becomes the link', () => {
	assert.deepEqual(plan(item('a', { man: false, docs: 'docs/a/' })), { texts: [], page: 'docs/a/', off: true });
	assert.deepEqual(plan(item('a', { man: false, docs: 'docs/a.md' })), { texts: [], page: 'docs/a.md', off: true });
	assert.deepEqual(plan(item('a', { docs: 'docs/a.md' }), { collection: { man: false, source: 'site' } }), { texts: [], page: 'docs/a.md', off: true });
});

test('manPlan: ~/apps entries: docs only, no templates (1.1.0 behaviour)', () => {
	const app = (docs, extra = {}) => ({ kind: 'apps', key: 'notes', id: 'notes', name: 'Notes', app: { id: 'notes', docs, ...extra } });
	assert.deepEqual(plan(app('help/notes.md', { man: 'ignored.md' }), { collection: null, manUrl: 'all/{slug}.md' }), { texts: ['help/notes.md'], page: null, off: false });
	assert.deepEqual(plan(app('https://example.org/notes'), { collection: null, manUrl: 'all/{slug}.md' }), { texts: [], page: 'https://example.org/notes', off: false });
	assert.deepEqual(plan(app(undefined), { collection: null, manUrl: 'all/{slug}.md' }), { texts: [], page: null, off: false });
});

test('manPlan: compatibility — a docs text file is printed first when there is no man; a non-text manUrl becomes the page link', () => {
	assert.deepEqual(plan(item('a', { docs: 'docs/a.md' }), { manUrl: 'cfg/{lang}/{slug}.md' }).texts, ['docs/a.md', 'cfg/de/a.md', 'cfg/en/a.md']);
	assert.deepEqual(plan(item('a'), { manUrl: 'cfg/{slug}/' }), { texts: [], page: 'cfg/a/', off: false });
	/* a { lang: url } docs is resolved by L */
	const p = manPlan({ entry: item('a', { docs: { en: 'en/a.md', de: 'de/a.md' } }), collection: SITE, chain: ['de'], L: v => v.de });
	assert.deepEqual(p.texts, ['de/a.md']);
	/* isText decides: an external .md is no text to read but a link */
	const ext = manPlan({ entry: item('a', { docs: 'https://x.example/a.md' }), collection: SITE, chain: ['en'], isText: x => isTextPath(x) && !/^https:/.test(x) });
	assert.deepEqual(ext, { texts: [], page: 'https://x.example/a.md', off: false });
});

test('manPlan: at most MAX_MAN_SOURCES text paths', () => {
	assert.equal(MAX_MAN_SOURCES, 6);
	const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
	const p = plan(item('x', { docs: 'docs/x.md' }), { manUrl: 'm/{lang}/{slug}.md', chain });
	assert.equal(p.texts.length, 6);
	assert.equal(p.texts[0], 'docs/x.md');
});

test('manLookup: an exact name without a manual beats a unique prefix with one', () => {
	const list = [item('snake'), item('snake-solver', { man: 's.md' })];
	const has = x => hasManual(plan(x));
	const r = manLookup('snake', list, has);
	assert.equal(r.hit.key, 'snake');
	assert.equal(r.manual, false);
	assert.equal(manLookup('SNAKE-solver', list, has).manual, true);
});

test('manLookup: prefix/part among entries with a manual first, then a prefix among all; several → many', () => {
	const list = [item('json-tool', { man: 'j.md' }), item('json-old'), item('yaml', { man: 'y.md' }), item('yak'), item('yeti')];
	const has = x => hasManual(plan(x));
	const r = manLookup('json', list, has);
	assert.equal(r.hit.key, 'json-tool', 'the one with a manual among two prefixes');
	assert.equal(r.manual, true);
	const old = manLookup('json-o', list, has);
	assert.equal(old.hit.key, 'json-old');
	assert.equal(old.manual, false, 'a unique hit among all: no manual');
	assert.equal(manLookup('ya', list, has).hit.key, 'yaml');
	assert.deepEqual(manLookup('ye', [item('yeti'), item('yes')], has).many.map(x => x.key), ['yeti', 'yes']);
	assert.deepEqual(manLookup('zzz', list, has), {});
	assert.deepEqual(manLookup('  ', list, has), {});
});

test('manLookup: no part match among entries without a manual; exact only for a hidden command name', () => {
	const entry = (key, name) => ({ kind: 'apps', key, id: key, name, app: { id: key } });
	const list = [entry('terminal', 'Terminal'), entry('calc', 'Calculator'), entry('notes', 'Notes'), entry('writing-pages', 'Writing pages')];
	const has = x => x.key === 'writing-pages';
	/* `rm` (an undocumented egg) is a part of "Terminal" — it must not name it */
	assert.deepEqual(manLookup('rm', list, has), {});
	assert.deepEqual(manLookup('rm', list, has, { exact: true }), {});
	/* part matches still count among entries with a manual; prefixes among all */
	assert.equal(manLookup('pages', list, has).hit.key, 'writing-pages');
	assert.equal(manLookup('term', list, has).hit.key, 'terminal');
	/* the query names a hidden command: only an entry of exactly that name answers */
	assert.deepEqual(manLookup('term', list, has, { exact: true }), {});
	assert.equal(manLookup('Notes', list, has, { exact: true }).hit.key, 'notes');
});

test('manMiss: 404/410 missing, network/timeout stop, aborted aborted, 500/size/parse failed; isHtmlType', () => {
	const e = (code, status = 0) => Object.assign(new Error(code), { code, status });
	assert.equal(manMiss(e('http', 404)), 'missing');
	assert.equal(manMiss(e('http', 410)), 'missing');
	assert.equal(manMiss(e('http', 500)), 'failed');
	assert.equal(manMiss(e('http', 403)), 'failed');
	assert.equal(manMiss(e('size')), 'failed');
	assert.equal(manMiss(e('parse')), 'failed');
	assert.equal(manMiss(e('network')), 'stop');
	assert.equal(manMiss(e('timeout')), 'stop');
	assert.equal(manMiss(e('aborted')), 'aborted');
	assert.equal(manMiss(Object.assign(new Error('x'), { name: 'AbortError' })), 'aborted');
	assert.equal(manMiss(null), 'failed');
	assert.ok(isHtmlType('text/html; charset=utf-8') && isHtmlType('TEXT/HTML'));
	assert.ok(!isHtmlType('text/markdown') && !isHtmlType('text/plain') && !isHtmlType(null) && !isHtmlType('application/xhtml+xml'));
});

test('manOutcome: print, link, error, none, aborted — every row of the outcome table, including off with a page', () => {
	assert.equal(manOutcome({ texts: ['a.md'], aborted: true, loaded: true }), 'aborted');
	assert.equal(manOutcome({ texts: ['a.md'], loaded: true }), 'print');
	assert.equal(manOutcome({ texts: ['a.md'], page: 'p/', loaded: true }), 'print');
	assert.equal(manOutcome({ texts: [], page: 'p/' }), 'link');
	assert.equal(manOutcome({ texts: ['a.md', 'b.md'], missing: 1, failed: 1 }), 'error');
	assert.equal(manOutcome({ texts: ['a.md'], page: 'p/', failed: 1 }), 'error');
	assert.equal(manOutcome({ texts: ['a.md', 'b.md'], missing: 2 }), 'none', 'every file missing is no error');
	assert.equal(manOutcome({ texts: ['a.md'], page: 'p/', missing: 1 }), 'none');
	assert.equal(manOutcome({ texts: [], page: null }), 'none');
	assert.equal(manOutcome({ texts: [], page: 'p/', off: true }), 'none', 'off with a page: the note plus the link');
	assert.equal(manOutcome(), 'none');
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

test('command registry: reserved names keep their place and win over other sources', () => {
	const warns = [];
	const reg = createCommands({ warn: m => warns.push(m) });
	const run = () => {};
	/* the built-ins load with the window: setup() reserves their names first */
	reg.reserve(['help', 'ls', 'Bad Name', 'egg'], 'builtin');
	assert.deepEqual(reg.names({ hidden: true }), []);
	assert.equal(reg.has('ls'), false);
	assert.equal(reg.register('ls', { run }, { source: 'module:x' }), null);
	assert.equal(reg.register('ls', { run }, { source: 'runtime' }), null);
	assert.equal(warns.length, 2);
	assert.match(warns[0], /exists already \(builtin\)/);
	assert.ok(reg.register('login', { run, hidden: true }, { source: 'module:vault' }));
	assert.equal(reg.register('egg', { run, hidden: true }, { source: 'builtin', weak: true }), null);
	assert.equal(warns.length, 2);
	assert.deepEqual(reg.names({ hidden: true }), ['login']);
	/* filled later by its own source: in the reserved order, before the module's command */
	assert.ok(reg.register('ls', { run }, { source: 'builtin' }));
	assert.ok(reg.register('help', { run }, { source: 'builtin' }));
	assert.deepEqual(reg.names({ hidden: true }), ['help', 'ls', 'login']);
	assert.equal(reg.register('ls', { run }, { source: 'builtin' }), null);
	/* taken names are not reserved again */
	reg.reserve(['login'], 'builtin');
	assert.equal(reg.get('login').source, 'module:vault');
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
	assert.equal(typeof terminal.setup, 'function');
	/* the window is window.js, loaded on demand: no window hooks in the descriptor */
	assert.equal(typeof terminal.app.load, 'function');
	assert.deepEqual(terminal.windowStyles, ['terminal.css']);
	assert.equal(terminal.styles, undefined);
	for (const hook of ['mount', 'focus', 'relabel', 'menu', 'unmount']) assert.equal(terminal[hook], undefined, hook);
});

test('descriptor: loads neither the window nor the built-in commands', () => {
	const read = file => readFileSync(new URL(`../src/apps/terminal/${file}`, import.meta.url), 'utf8');
	const imports = file => [...read(file).matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
	/* the boot part: index.js and what it imports — never the window, lib.js, catalog.js or commands/ */
	assert.deepEqual(imports('index.js'), ['../../core/api.js', './config.js', './registry.js']);
	assert.deepEqual(imports('registry.js'), ['./config.js']);
	/* the rules of manual values (src/core/man.js, pure) come with the boot: manUrl is checked there */
	assert.deepEqual(imports('config.js'), ['../../core/is.js', '../../core/man.js']);
	assert.match(read('index.js'), /load: \(\) => import\('\.\/window\.js'\)/);
});

test('window: hooks, and ORDER names every built-in command', async () => {
	const win = (await import('../src/apps/terminal/window.js')).default;
	for (const hook of ['mount', 'focus', 'relabel', 'menu', 'unmount']) assert.equal(typeof win[hook], 'function', hook);
	const all = {
		...core, ...fsCommands({ ...cleanConfig({}) }), ...sys, ...browser, ...storage,
		...netCommands({ url: 'https://dns.example/resolve', host: 'dns.example', name: 'x' }, 'dns')
	};
	assert.deepEqual(Object.keys(all).sort(), [...ORDER].sort());
	/* importing the window registered the built-ins (without a DNS resolver: no dig/host/nslookup) */
	assert.ok(commands.list({ hidden: true }).some(e => e.name === 'ls' && e.source === 'builtin'));
	assert.equal(commands.has('dig'), false);
});
