/* JPKCom Desktop — tests: Fortune app data, deck, languages and online sources — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeText, isSafeLink, cleanBlock, cleanFortunes, createDeck, pickLang, baseLang, cleanState, pushHistory, MAX_HISTORY,
	cleanLangs, fetchCodes, DEFAULT_LANGS, cleanTexts, cleanLocal, sourceFor, TEXT_KEYS, MAX_HOSTS
} from '../src/apps/fortune/model.js';
import {
	jokeapi, uselessfacts, cleanProvider, checkRequestUrl, categoriesFor, createSources, consentTag, staleConsent
} from '../src/apps/fortune/providers.js';
import { readFileSync } from 'node:fs';

const plain = s => normalizeText(String(s).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"'));

test('normalizeText collapses spaces per line, drops empty lines, cuts long texts', () => {
	assert.equal(normalizeText('  a   b \n\n  c  d  '), 'a b\nc d');
	assert.equal(normalizeText('a\r\nb'), 'a\nb');
	assert.equal(normalizeText(42), '');
	const long = normalizeText('word '.repeat(400), 100);
	assert.ok(long.length <= 100);
	assert.ok(long.endsWith('…'));
	assert.ok(!long.includes('wor…'), 'cut at a word boundary');
});

test('isSafeLink: relative, /path and https only', () => {
	for (const ok of ['site/content/en/x.html', '/docs/', 'https://example.org/', '../x.html?y=1#z']) assert.ok(isSafeLink(ok), ok);
	for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/', 'http://example.org/', ' x', '', null, 'mailto:a@b.c']) {
		assert.ok(!isSafeLink(bad), String(bad));
	}
});

test('cleanBlock keeps valid unique ids and reports the rest', () => {
	const msgs = [];
	assert.deepEqual(cleanBlock(['fun', 'fun', 'Bad', 3, 'web'], m => msgs.push(m)), ['fun', 'web']);
	assert.equal(msgs.length, 2);
	assert.deepEqual(cleanBlock(null), []);
	assert.deepEqual(cleanBlock('fun', m => msgs.push(m)), []);
});

test('cleanFortunes validates entries, categories, signatures and links', () => {
	const warns = [];
	const d = cleanFortunes({
		lang: 'en', by: 'JPKCom',
		categories: { keys: 'Keyboard', fun: 'Fun', empty: 'Unused', BAD: 'x' },
		items: [
			'A bare string',
			{ text: '  Spaced   out  ', cat: 'keys' },
			{ text: 'No signature', by: null },
			{ text: 'Own signature', by: 'Someone' },
			{ text: 'Unknown cat', cat: 'nope' },
			{ text: 'Blocked', cat: 'fun' },
			{ text: 'Bad link', url: 'javascript:alert(1)' },
			{ text: 'Good link', url: 'site/content/en/about.html' },
			{ text: '' },
			42,
			'A bare string'
		]
	}, { block: ['fun'], warn: m => warns.push(m) });
	assert.equal(d.lang, 'en');
	assert.deepEqual(d.categories, [{ id: 'keys', label: 'Keyboard' }], 'only used, unblocked categories');
	const texts = d.items.map(x => x.text);
	assert.deepEqual(texts, ['A bare string', 'Spaced out', 'No signature', 'Own signature', 'Unknown cat', 'Bad link', 'Good link']);
	assert.equal(d.items[0].by, 'JPKCom');
	assert.equal(d.items[2].by, null);
	assert.equal(d.items[3].by, 'Someone');
	assert.equal(d.items[4].cat, null);
	assert.equal(d.items[5].url, null);
	assert.equal(d.items[6].url, 'site/content/en/about.html');
	assert.ok(warns.length >= 4);
	assert.ok(Object.isFrozen(d.items[0]));
});

test('cleanFortunes: arrays, the language from the file code, nothing usable → null', () => {
	assert.equal(cleanFortunes(['x'], { code: 'de' }).lang, 'de');
	assert.equal(cleanFortunes({ lang: 'pt-BR', items: ['x'] }).lang, 'pt-BR');
	assert.equal(cleanFortunes({ items: [] }), null);
	assert.equal(cleanFortunes({ items: [{ text: '  ' }] }), null);
	assert.equal(cleanFortunes(null), null);
	assert.equal(cleanFortunes({ items: 'x' }), null);
});

test('createDeck: every entry once per round, never the same twice in a row', () => {
	const items = ['a', 'b', 'c', 'd'].map(text => ({ text, cat: text === 'a' || text === 'b' ? 'x' : 'y' }));
	let seed = 7;
	const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	const deck = createDeck(items, rnd);
	let prev = null;
	for (let round = 0; round < 25; round++) {
		const seen = new Set();
		for (let i = 0; i < items.length; i++) {
			const it = deck.draw();
			assert.notEqual(it, prev, 'no immediate repeat');
			seen.add(it.text);
			prev = it;
		}
		assert.equal(seen.size, items.length, 'a full round shows each entry once');
	}
	for (let i = 0; i < 10; i++) assert.equal(deck.draw('x').cat, 'x');
	assert.equal(deck.draw('nothing'), null);
	assert.equal(createDeck([], rnd).draw(), null);
	const one = createDeck([{ text: 'only' }], rnd);
	assert.equal(one.draw().text, 'only');
	assert.equal(one.draw().text, 'only', 'a single entry may repeat');
});

test('pickLang follows the fallback chain, then the base language, then the source', () => {
	assert.equal(pickLang(['de', 'en'], ['en', 'de']), 'de');
	assert.equal(pickLang(['de-AT', 'de', 'en'], ['en', 'de']), 'de');
	assert.equal(pickLang(['pt-BR'], ['en', 'pt']), 'pt');
	assert.equal(pickLang(['fr', 'en'], ['en', 'de']), 'en');
	assert.equal(pickLang(['fr'], ['de']), 'de');
	assert.equal(pickLang(['fr'], null), 'fr');
	assert.equal(baseLang('pt-BR'), 'pt');
});

test('cleanState and pushHistory', () => {
	assert.deepEqual(cleanState({ source: 'remote', x: 1 }), { source: 'remote' });
	assert.equal(cleanState({ source: 'cloud' }), null);
	assert.equal(cleanState('local'), null);
	let h = { list: [], idx: -1 };
	for (let i = 0; i < MAX_HISTORY + 5; i++) h = pushHistory(h.list, h.idx, i);
	assert.equal(h.list.length, MAX_HISTORY);
	assert.equal(h.list.at(-1), MAX_HISTORY + 4);
	assert.equal(h.idx, MAX_HISTORY - 1);
	/* going back, then a new entry drops the forward part */
	const back = pushHistory([1, 2, 3], 0, 9);
	assert.deepEqual(back, { list: [1, 9], idx: 1 });
});

test('jokeapi: request in the chosen language, safe mode, blocked categories never asked for', () => {
	const u = new URL(jokeapi.url({ lang: 'de', block: ['spooky'] }));
	assert.equal(u.hostname, 'v2.jokeapi.dev');
	assert.equal(u.searchParams.get('lang'), 'de');
	assert.ok(u.searchParams.has('safe-mode'));
	assert.match(u.searchParams.get('blacklistFlags'), /nsfw.*political.*explicit/);
	assert.ok(!decodeURIComponent(u.pathname).includes('Spooky'));
	assert.ok(!decodeURIComponent(u.pathname).includes('Any'), 'never "Any" (dark humour)');
	assert.match(decodeURIComponent(new URL(jokeapi.url({ cat: 'pun' })).pathname), /\/joke\/Pun$/);
	assert.ok(checkRequestUrl(jokeapi, jokeapi.url({})));
	/* "All" names only the categories this language has jokes in */
	const allDe = decodeURIComponent(new URL(jokeapi.url({ lang: 'de' })).pathname);
	assert.ok(allDe.includes('Christmas') && !allDe.includes('Spooky'));
	assert.match(decodeURIComponent(new URL(jokeapi.url({ lang: 'fr' })).pathname), /\/joke\/Misc$/);
	assert.ok(decodeURIComponent(new URL(jokeapi.url({ lang: 'en' })).pathname).includes('Spooky'));
});

test('categoriesFor: per-language categories of a provider', () => {
	const p = cleanProvider(jokeapi);
	assert.deepEqual(p.emptyStatus, [400]);
	assert.ok(!categoriesFor(p, 'de').some(c => c.id === 'spooky'));
	assert.ok(categoriesFor(p, 'en-GB').some(c => c.id === 'spooky'));
	assert.deepEqual(categoriesFor(p, 'fr').map(c => c.id), ['misc']);
	const any = cleanProvider({ id: 'x', name: 'X', hosts: ['api.example.org'], categories: [{ id: 'a', label: 'A' }],
		emptyStatus: [404, 200, 'x'], url: () => '', parse: () => null });
	assert.deepEqual(categoriesFor(any, 'xx').map(c => c.id), ['a'], 'no langs: every language');
	assert.deepEqual([...any.emptyStatus], [404]);
});

test('jokeapi: parsing single and two-part jokes, flags and errors', () => {
	const single = jokeapi.parse({ type: 'single', joke: 'A &quot;joke&quot; <b>here</b>', category: 'Programming', flags: {}, safe: true, lang: 'en' }, { plain, lang: 'en' });
	assert.deepEqual(single, { text: 'A "joke" here', url: null, lang: 'en', cat: 'programming' });
	const two = jokeapi.parse({ type: 'twopart', setup: 'Why?', delivery: 'Because.', category: 'Pun', flags: {}, safe: true, lang: 'de' }, { plain, lang: 'en' });
	assert.equal(two.text, 'Why?\nBecause.');
	assert.equal(two.lang, 'de');
	assert.equal(jokeapi.parse({ type: 'single', joke: 'x', category: 'Misc', flags: { political: true }, safe: true }, { plain, lang: 'en' }), null);
	assert.equal(jokeapi.parse({ type: 'single', joke: 'x', category: 'Misc', flags: {}, safe: false }, { plain, lang: 'en' }), null);
	assert.equal(jokeapi.parse({ type: 'single', joke: 'x', category: 'Dark', flags: {}, safe: true }, { plain, lang: 'en' }), null);
	assert.throws(() => jokeapi.parse({ error: true, message: 'Something broke' }, { plain, lang: 'en' }), e => e.code !== 'empty');
	assert.throws(() => jokeapi.parse({ error: true, code: 106, message: 'No matching joke found' }, { plain, lang: 'en' }), e => e.code === 'empty');
	assert.throws(() => jokeapi.parse({ type: 'single', joke: 3 }, { plain, lang: 'en' }));
});

test('uselessfacts: language, origin link (https only), source as signature, text', () => {
	assert.equal(new URL(uselessfacts.url({ lang: 'de' })).searchParams.get('language'), 'de');
	const ok = uselessfacts.parse({ id: 'abc', text: 'Fact.', language: 'en', source: 'djtech.net',
		source_url: 'https://www.djtech.net/humor/x.htm', permalink: 'https://uselessfacts.jsph.pl/api/v2/facts/abc' }, { plain, lang: 'en' });
	assert.deepEqual(ok, { text: 'Fact.', url: 'https://www.djtech.net/humor/x.htm', by: 'djtech.net', lang: 'en' });
	const http = uselessfacts.parse({ text: 'Fact.', source: '<b>NEON</b>', source_url: 'http://www.neon.de/x',
		permalink: 'https://uselessfacts.jsph.pl/api/v2/facts/abc' }, { plain, lang: 'de' });
	assert.equal(http.url, null, 'no http link, and never the JSON permalink');
	assert.equal(http.by, 'NEON');
	assert.equal(http.lang, 'de');
	assert.equal(uselessfacts.parse({ text: 'F', source_url: 'javascript:alert(1)' }, { plain, lang: 'en' }).url, null);
	assert.equal(uselessfacts.parse({ text: 'F', source_url: 'https://u:p@x.example/' }, { plain, lang: 'en' }).url, null);
	assert.throws(() => uselessfacts.parse({}, { plain, lang: 'en' }));
});

test('cleanProvider and checkRequestUrl keep providers on their own hosts', () => {
	assert.equal(cleanProvider(null), null);
	assert.equal(cleanProvider({ id: 'x', name: 'X', hosts: ['not a host'], url() {}, parse() {} }), null);
	assert.equal(cleanProvider({ id: 'x', name: 'X', hosts: ['api.example.org'] }), null, 'needs url and parse');
	const p = cleanProvider({ id: 'mine', name: { en: 'Mine' }, hosts: ['api.example.org'], langs: ['en', 'xx-!'],
		categories: [{ id: 'a', label: 'A' }, { id: 'B', label: 'b' }], url: () => 'https://api.example.org/x', parse: () => null });
	assert.deepEqual([...p.langs], ['en']);
	assert.deepEqual(p.categories.map(c => c.id), ['a']);
	assert.equal(checkRequestUrl(p, 'https://api.example.org/x?y=1'), 'https://api.example.org/x?y=1');
	assert.equal(checkRequestUrl(p, 'http://api.example.org/x'), null);
	assert.equal(checkRequestUrl(p, 'https://other.example.org/x'), null);
	assert.equal(checkRequestUrl(p, 'nonsense'), null);
	assert.ok(cleanProvider(jokeapi));
	assert.ok(cleanProvider(uselessfacts));
});

test('fortune: only languages with a file are fetched (config.fortune.langs) — no 404 for the others', async () => {
	const { readdirSync } = await import('node:fs');
	const shipped = readdirSync(new URL('../site/data/fortunes/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
	assert.deepEqual([...DEFAULT_LANGS].sort(), shipped, 'the default lists exactly the shipped files');
	assert.deepEqual(fetchCodes(['zz', 'en'], ['de', 'en']), ['en'], 'a language without a file falls back without a request');
	assert.deepEqual(fetchCodes(['de-AT', 'de', 'en'], ['de', 'en']), ['de', 'en']);
	assert.deepEqual(fetchCodes(['zz', 'en'], null), ['zz', 'en'], 'null tries every code');
	assert.deepEqual(fetchCodes(['zz'], []), []);
	const warnings = [];
	assert.deepEqual(cleanLangs(undefined), ['de', 'en']);
	assert.equal(cleanLangs(null), null);
	assert.deepEqual(cleanLangs(['fr', 'en', 'fr']), ['fr', 'en']);
	assert.deepEqual(cleanLangs(['../x'], m => warnings.push(m)), ['de', 'en']);
	assert.deepEqual(cleanLangs('en', m => warnings.push(m)), ['de', 'en']);
	assert.equal(warnings.length, 2);
});

test('fortune: the window loads on demand — the descriptor does not import window.js, fortune.css is window-only', async () => {
	const src = readFileSync(new URL('../src/apps/fortune/index.js', import.meta.url), 'utf8');
	assert.doesNotMatch(src, /^\s*(import|export)\b[^;]*from\s*['"]\.\/window\.js['"]/m);
	assert.match(src, /load: \(\) => import\('\.\/window\.js'\)/, 'a literal import (service worker, preload)');
	const { default: fortune } = await import('../src/apps/fortune/index.js');
	assert.deepEqual(fortune.windowStyles, ['fortune.css']);
	assert.equal(fortune.styles, undefined);
	for (const hook of ['mount', 'focus', 'relabel', 'menu', 'unmount']) assert.equal(fortune[hook], undefined, `${hook} comes with load()`);
	assert.equal(typeof fortune.terminal.fortune.run, 'function', 'the terminal command stays in the descriptor');
	const { default: hooks } = await import('../src/apps/fortune/window.js');
	for (const hook of ['mount', 'focus', 'relabel', 'menu', 'unmount']) assert.equal(typeof hooks[hook], 'function', hook);
});

/* ---------- Sources from modules, consent bound to the provider, online only, app texts ---------- */

const def = (id, hosts = ['api.example.org']) => ({ id, name: 'X', hosts, url: () => 'https://api.example.org/', parse: () => null });

/** createSources with a fake consent object and a warn collector; remote is changeable */
function sourcesKit(remote = null) {
	const calls = [];
	const warns = [];
	const state = { remote };
	const s = createSources({
		builtIns: [jokeapi, uselessfacts],
		remote: () => state.remote,
		consent: { register: p => calls.push(['reg', p.id, [...p.hosts]]), unregister: () => calls.push(['unreg']) },
		warn: m => warns.push(m)
	});
	return { s, calls, warns, state };
}

test('createSources: built-ins, consent for a configured built-in', () => {
	const { s, calls } = sourcesKit('jokeapi');
	assert.deepEqual(s.ids(), ['jokeapi', 'uselessfacts']);
	assert.deepEqual(s.builtIn(), ['jokeapi', 'uselessfacts']);
	assert.deepEqual(calls, [], 'no consent call before fromContributions');
	s.fromContributions([]);
	assert.deepEqual(calls, [['reg', 'jokeapi', ['v2.jokeapi.dev']]]);
	s.fromContributions([]);
	assert.equal(calls.length, 1, 'registered once');
	const none = sourcesKit(null);
	none.s.fromContributions([]);
	assert.deepEqual(none.calls, [], 'nothing configured, nothing registered');
});

test('createSources: a provider from a module set up before the app', () => {
	const { s, calls, warns } = sourcesKit('example');
	s.fromContributions([Object.freeze({ ...def('example'), module: 'm' })]);
	assert.equal(s.configured().id, 'example');
	assert.deepEqual(calls, [['reg', 'example', ['api.example.org']]]);
	assert.deepEqual(warns, []);
});

test('createSources: a provider from a module set up after the app', () => {
	const { s, calls } = sourcesKit('example');
	s.fromContributions([]);
	assert.deepEqual(calls, [], 'unknown yet: no registration');
	const list = [Object.freeze({ ...def('example'), module: 'm' })];
	s.onLoaded('other', list);
	assert.equal(s.has('example'), false, 'only the items of the loaded module');
	s.onLoaded('m', list);
	assert.deepEqual(calls, [['reg', 'example', ['api.example.org']]]);
	assert.equal(s.configured().id, 'example');
});

test('createSources: the same contribution twice is adopted once', () => {
	const { s, calls, warns } = sourcesKit('example');
	const list = [Object.freeze({ ...def('example'), module: 'm' })];
	s.fromContributions(list);
	s.onLoaded('m', list);
	assert.equal(s.ids().filter(id => id === 'example').length, 1);
	assert.deepEqual(warns, [], 'silently');
	assert.equal(calls.filter(c => c[0] === 'reg').length, 1);
});

test('createSources: duplicate ids keep the first', () => {
	const { s, warns } = sourcesKit(null);
	assert.ok(s.add(def('example'), 'a'));
	assert.equal(s.add(def('example', ['b.example.org']), 'b'), null);
	assert.equal(warns.length, 1);
	assert.match(warns[0], /exists already/);
	assert.deepEqual([...s.get('example').hosts], ['api.example.org']);
	assert.equal(s.add(def('jokeapi'), 'c'), null, 'a built-in id is taken as well');
});

test('createSources: a failed module takes its providers and the consent', () => {
	const { s, calls } = sourcesKit('example');
	s.fromContributions([Object.freeze({ ...def('example'), module: 'm' })]);
	assert.deepEqual(s.onFailed('m'), ['example']);
	assert.equal(s.has('example'), false);
	assert.deepEqual(calls, [['reg', 'example', ['api.example.org']], ['unreg']]);
	assert.deepEqual(s.onFailed('x'), []);
	assert.equal(calls.length, 2);
	assert.deepEqual(s.onFailed(null), []);
	assert.ok(s.has('jokeapi') && s.has('uselessfacts'), 'built-ins are never dropped');
	/* the imperative path: addProvider(def, { module }) */
	assert.ok(s.add(def('example', ['c.example.org']), 'n'));
	assert.deepEqual(calls.at(-1), ['reg', 'example', ['c.example.org']]);
	assert.deepEqual(s.onFailed('n'), ['example']);
	assert.deepEqual(calls.at(-1), ['unreg']);
});

test('createSources: invalid definitions', () => {
	const { s, calls, warns } = sourcesKit('bad');
	assert.equal(s.add({ id: 'bad' }), null);
	assert.equal(warns.length, 1);
	assert.deepEqual(calls, []);
	/* a class instance loses its prototype methods in the loader's copy */
	class P {
		constructor() {
			this.id = 'cls';
			this.name = 'C';
			this.hosts = ['api.example.org'];
		}
		url() { return 'https://api.example.org/'; }
		parse() { return null; }
	}
	s.fromContributions([Object.freeze({ ...new P(), module: 'm' })]);
	assert.equal(s.has('cls'), false);
	assert.match(warns.at(-1), /needs url\(\) and parse\(\)/);
});

test('createSources: unknown remote reported once at ready', () => {
	const { s, state } = sourcesKit('nope');
	s.fromContributions([]);
	const first = s.ready({ local: true, offered: true });
	assert.equal(first.length, 1);
	assert.match(first[0], /unknown online source 'nope'/);
	assert.match(first[0], /jokeapi, uselessfacts/);
	assert.doesNotMatch(first[0], /nothing to show/);
	assert.deepEqual(s.ready({ local: true, offered: true }), [], 'once');
	state.remote = 'jokeapi';
	assert.deepEqual(sourcesKit('jokeapi').s.ready({ local: true, offered: true }), []);
	assert.match(sourcesKit('nope').s.ready({ local: false, offered: true })[0], /nothing to show$/);
	const services = sourcesKit('jokeapi').s.ready({ local: false, offered: false });
	assert.equal(services.length, 1);
	assert.match(services[0], /services\.fortune is not true/);
	assert.deepEqual(sourcesKit(null).s.ready({ local: true, offered: false }), []);
});

test('staleConsent: agreeing for A, then configuring B asks again', () => {
	const a = cleanProvider(def('alpha', ['b.example.org', 'a.example.org']));
	const b = cleanProvider(def('beta'));
	assert.equal(consentTag(a), 'alpha@a.example.org,b.example.org', 'hosts sorted');
	assert.equal(staleConsent({ granted: true, agreed: consentTag(a), provider: b }), true);
	assert.equal(staleConsent({ granted: true, agreed: consentTag(a), provider: a }), false);
	const otherHosts = cleanProvider(def('alpha', ['c.example.org']));
	assert.equal(staleConsent({ granted: true, agreed: consentTag(a), provider: otherHosts }), true);
	assert.equal(staleConsent({ granted: true, agreed: null, provider: a }), true, 'from before the binding');
	assert.equal(staleConsent({ granted: false, agreed: null, provider: a }), false);
	assert.equal(staleConsent({ granted: true, agreed: null, provider: null }), false);
});

test('cleanState keeps source and agreed', () => {
	assert.deepEqual(cleanState({ source: 'remote', agreed: 'example@api.example.org' }), { source: 'remote', agreed: 'example@api.example.org' });
	assert.equal(cleanState({ agreed: 'x' }), null, 'no @');
	assert.deepEqual(cleanState({ agreed: 'example@api.example.org' }), { agreed: 'example@api.example.org' });
	assert.deepEqual(cleanState({ source: 'local', agreed: 'Bad@Host' }), { source: 'local' });
	assert.equal(cleanState({ agreed: `example@${'a'.repeat(2100)}` }), null, 'too long');
	for (const junk of [null, 'local', 3, [], { source: 'cloud', agreed: 7 }]) assert.equal(cleanState(junk), null);
});

test('every accepted provider keeps its agreement through cleanState; too many hosts are rejected', () => {
	/* the longest valid host name: 253 characters, labels of at most 63 */
	const host = n => `${String.fromCharCode(97 + n)}${'a'.repeat(62)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
	assert.equal(host(0).length, 253);
	const hosts = Array.from({ length: MAX_HOSTS }, (_, i) => host(i));
	const id = `x${'y'.repeat(31)}`;
	const p = cleanProvider(def(id, hosts));
	assert.ok(p, 'MAX_HOSTS longest host names are accepted');
	const tag = consentTag(p);
	assert.ok(tag.length > 2000);
	assert.deepEqual(cleanState({ agreed: tag }), { agreed: tag }, 'the tag round-trips');
	assert.equal(staleConsent({ granted: true, agreed: cleanState({ agreed: tag }).agreed, provider: p }), false);
	const warns = [];
	assert.equal(cleanProvider(def('many', [...hosts, 'z.example.org']), m => warns.push(m)), null, 'one host too many');
	assert.match(warns.join(), /at most 8/);
	const dup = cleanProvider(def('dup', [...hosts, hosts[0]]));
	assert.equal(dup?.hosts.length, MAX_HOSTS, 'duplicates count once');
});

test('cleanTexts keeps known keys with texts and reports the rest', () => {
	const warns = [];
	const w = m => warns.push(m);
	const ok = cleanTexts({ loading: 'x', service: { en: 'a', de: 'b' }, cmd: '@my.cmd' }, w);
	assert.deepEqual(ok, { loading: 'x', service: { en: 'a', de: 'b' }, cmd: '@my.cmd' });
	assert.ok(Object.isFrozen(ok) && Object.isFrozen(ok.service));
	assert.deepEqual(warns, []);
	for (const bad of [{ bogus: 'x' }, { next: 3 }, { next: {} }, { error: 'x' }, { next: { en: '' } }]) {
		const before = warns.length;
		assert.deepEqual(cleanTexts(bad, w), {});
		assert.equal(warns.length, before + 1, JSON.stringify(bad));
	}
	assert.match(warns[0], /texts\.bogus cannot be replaced \(keys: next, /);
	assert.match(warns[1], /texts\.next must be a text/);
	assert.match(warns[3], /texts\.error cannot be replaced/, 'a key with placeholders');
	const n = warns.length;
	assert.deepEqual(cleanTexts(null, w), {});
	assert.deepEqual(cleanTexts(undefined, w), {});
	assert.equal(warns.length, n, 'silently');
	assert.deepEqual(cleanTexts('next', w), {});
	assert.match(warns.at(-1), /texts must be an object/);
	assert.ok(TEXT_KEYS.includes('noSource') && TEXT_KEYS.includes('denyOnline'));
	for (const k of ['error', 'askText', 'askLang', 'keys', 'by']) assert.ok(!TEXT_KEYS.includes(k), `${k} has placeholders`);
});

test('cleanLocal and sourceFor: stored choice, online only, no source', () => {
	const warns = [];
	assert.equal(cleanLocal(undefined), true);
	assert.equal(cleanLocal(false), false);
	assert.equal(cleanLocal('no', m => warns.push(m)), true);
	assert.equal(warns.length, 1);
	assert.equal(sourceFor({ stored: 'remote', local: true, remote: true }), 'remote');
	assert.equal(sourceFor({ stored: 'remote', local: true, remote: false }), 'local');
	assert.equal(sourceFor({ stored: 'local', local: true, remote: true }), 'local');
	assert.equal(sourceFor({ stored: undefined, local: true, remote: true }), 'local');
	for (const stored of ['local', 'remote', undefined]) {
		assert.equal(sourceFor({ stored, local: false, remote: true }), 'remote');
		assert.equal(sourceFor({ stored, local: false, remote: false }), null);
	}
});

test('validateConfig: local and texts', async () => {
	const { default: fortune } = await import('../src/apps/fortune/index.js');
	const run = section => {
		const warns = [];
		return { out: fortune.validateConfig(section, m => warns.push(m)), warns };
	};
	let r = run({});
	assert.equal(r.out.local, true);
	assert.deepEqual(r.out.texts, {});
	assert.deepEqual(r.warns, []);
	assert.equal(run({ remote: 'jokeapi', local: false }).out.local, false);
	r = run({ local: 'no' });
	assert.equal(r.out.local, true);
	assert.equal(r.warns.length, 1);
	for (const section of [{ local: false }, { local: false, remote: 'Bad Id' }]) {
		r = run(section);
		assert.equal(r.out.local, true);
		assert.ok(r.warns.some(m => /local: false needs an online source/.test(m)), JSON.stringify(section));
	}
	assert.equal(run({ texts: { next: 'N' } }).out.texts.next, 'N');
});

test('the descriptor wires the lifecycle', async () => {
	const { default: fortune } = await import('../src/apps/fortune/index.js');
	const on = [];
	const once = [];
	const provided = [];
	const warns = [];
	const { warn } = console;
	console.warn = m => warns.push(String(m));
	try {
		fortune.setup({
			modules: { contributions: point => (point === 'fortuneProviders' ? [] : []) },
			on: name => on.push(name),
			once: name => once.push(name),
			provide: (name, impl) => provided.push([name, impl])
		});
	} finally {
		console.warn = warn;
	}
	for (const name of ['module:loaded', 'module:failed', 'consent:change']) assert.ok(on.includes(name), name);
	assert.ok(once.includes('modules:ready'));
	assert.equal(provided[0][0], 'fortune');
	for (const k of ['random', 'addProvider', 'providers', 'source']) assert.equal(typeof provided[0][1][k], 'function', k);
	assert.deepEqual(warns.filter(m => m.includes('[fortune]')), [], 'nothing reported during setup()');
	const src = readFileSync(new URL('../src/apps/fortune/index.js', import.meta.url), 'utf8');
	assert.doesNotMatch(src, /setup\(desk\)[\s\S]*unknown online source/, 'the check is deferred to modules:ready');
});

test('terminal fortune: texts and when', async () => {
	const { default: fortune } = await import('../src/apps/fortune/index.js');
	const cmd = fortune.terminal.fortune;
	for (const k of ['run', 'help', 'man', 'when']) assert.equal(typeof cmd[k], 'function', k);
});
