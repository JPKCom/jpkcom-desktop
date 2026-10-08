/* JPKCom Desktop — tests: Fortune app data, deck, languages and online sources — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeText, isSafeLink, cleanBlock, cleanFortunes, createDeck, pickLang, baseLang, cleanState, pushHistory, MAX_HISTORY,
	cleanLangs, fetchCodes, DEFAULT_LANGS
} from '../src/apps/fortune/model.js';
import { jokeapi, uselessfacts, cleanProvider, checkRequestUrl, categoriesFor } from '../src/apps/fortune/providers.js';
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
