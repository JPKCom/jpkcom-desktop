/* JPKCom Desktop — tests: Reader helpers (rules, titles, alternates, cache, history, sanitiser URLs) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	splitSelectors, firstMatch, validateReaderConfig, compileRules, matchRule, cleanTitle, pickAlternate,
	createLru, createHistory, pushEntry, moveEntry, canBack, canForward, cleanLang, demotedLevel, readText, DEFAULT_RULE, DEFAULT_SEPARATOR
} from '../src/modules/reader/util.js';
import { mapClasses, prefixIdrefs, rewriteUrlRefs, rewriteUrl, rewriteSrcset } from '../src/modules/reader/sanitize.js';

const ORIGIN = 'https://desk.example';
const ROOT = `${ORIGIN}/desk/`;
const resolve = (raw, base) => {
	try {
		const u = new URL(raw, base);
		/* like router.resolveUrl with config.site.hosts = ['live.example'] */
		return u.hostname === 'live.example' ? new URL(u.pathname + u.search + u.hash, ORIGIN) : u;
	} catch {
		return null;
	}
};

test('splitSelectors keeps commas inside parentheses, brackets and quotes', () => {
	assert.deepEqual(splitSelectors('main article, article, main'), ['main article', 'article', 'main']);
	assert.deepEqual(splitSelectors(':is(a, b) > c, [data-x="1,2"], d'), [':is(a, b) > c', '[data-x="1,2"]', 'd']);
	assert.deepEqual(splitSelectors(''), []);
	assert.deepEqual(splitSelectors(null), []);
});

test('firstMatch tries the selectors in list order and skips invalid ones', () => {
	const calls = [];
	const root = { querySelector: sel => { calls.push(sel); if (sel === '%%') throw new Error('bad'); return sel === 'article' ? { sel } : null; } };
	assert.deepEqual(firstMatch(root, 'main article, %%, article, main'), { sel: 'article' });
	assert.deepEqual(calls, ['main article', '%%', 'article']);
	assert.equal(firstMatch(root, 'nav'), null);
});

test('validateReaderConfig cleans rules, separator and cache size', () => {
	const warnings = [];
	const cfg = validateReaderConfig({
		rules: [
			{ match: 'site/content/', content: 'main article', title: 'h1', lead: '.lead' },
			{ match: '^/docs/', content: 'article' },
			{ match: '^(' },
			{ content: 'main' },
			'nope',
			{ match: 'x/', content: '%%bad', title: '' }
		],
		titleSeparator: '(',
		cacheSize: 9999
	}, m => warnings.push(m), sel => { if (sel.includes('%')) throw new Error('invalid'); return true; });
	assert.equal(cfg.rules.length, 3);
	assert.deepEqual(cfg.rules[0], { match: 'site/content/', content: 'main article', title: 'h1', lead: '.lead' });
	assert.equal(cfg.rules[1].title, null);
	assert.equal(cfg.rules[2].content, DEFAULT_RULE.content);
	assert.equal(cfg.titleSeparator, DEFAULT_SEPARATOR);
	assert.equal(cfg.cacheSize, 24);
	assert.ok(warnings.length >= 5);
	assert.deepEqual(validateReaderConfig(null, () => {}), { rules: [], titleSeparator: DEFAULT_SEPARATOR, cacheSize: 24 });
	assert.equal(validateReaderConfig({ cacheSize: 0 }).cacheSize, 0);
});

test('compiled rules: prefixes relative to the root (sub-folder install), regular expressions on the absolute path', () => {
	const rules = compileRules([
		{ match: 'site/content/', content: 'main', title: 'h1', lead: null },
		{ match: '^/blog/\\d+/', content: 'article', title: null, lead: null },
		{ match: '/abs/', content: 'div', title: null, lead: null }
	], ROOT);
	assert.equal(matchRule(rules, '/desk/site/content/en/about.html').content, 'main');
	assert.equal(matchRule(rules, '/site/content/en/about.html'), DEFAULT_RULE);
	assert.equal(matchRule(rules, '/blog/2026/x.html').content, 'article');
	assert.equal(matchRule(rules, '/abs/page.html').content, 'div');
	assert.equal(matchRule([], '/x'), DEFAULT_RULE);
});

test('cleanTitle drops the site part', () => {
	assert.equal(cleanTitle('About me | JPKCom'), 'About me');
	assert.equal(cleanTitle('Über mich — Seite'), 'Über mich');
	assert.equal(cleanTitle('A-B testing'), 'A-B testing');
	assert.equal(cleanTitle('  Spaced   out  '), 'Spaced out');
	assert.equal(cleanTitle('Page :: Site', '\\s::\\s'), 'Page');
	assert.equal(cleanTitle('Page | Site', '('), 'Page');
	assert.equal(cleanTitle(''), '');
	assert.equal(cleanTitle(null), '');
});

test('pickAlternate: exact code, then base language, never x-default', () => {
	const alt = { 'de-DE': '/de/', en: '/en/', 'x-default': '/' };
	assert.equal(pickAlternate(alt, 'de'), '/de/');
	assert.equal(pickAlternate(alt, 'en'), '/en/');
	assert.equal(pickAlternate(alt, 'en-US'), '/en/');
	assert.equal(pickAlternate(alt, 'fr'), null);
	assert.equal(pickAlternate({ 'x-default': '/' }, 'x-default'), null);
	assert.equal(pickAlternate(null, 'de'), null);
});

test('LRU cache keeps the most recently used pages', () => {
	const c = createLru(2);
	c.set('a', 1);
	c.set('b', 2);
	assert.equal(c.get('a'), 1);
	c.set('c', 3);
	assert.deepEqual(c.keys(), ['a', 'c']);
	assert.equal(c.get('b'), undefined);
	const none = createLru(0);
	none.set('a', 1);
	assert.equal(none.size, 0);
});

test('history: push drops forward entries, move stays inside', () => {
	const hist = createHistory();
	assert.equal(canBack(hist), false);
	pushEntry(hist, '/a');
	pushEntry(hist, '/b');
	pushEntry(hist, '/c');
	assert.equal(moveEntry(hist, -1).url, '/b');
	assert.equal(moveEntry(hist, -1).url, '/a');
	assert.equal(moveEntry(hist, -1), null);
	assert.equal(canForward(hist), true);
	pushEntry(hist, '/d');
	assert.deepEqual(hist.list.map(e => e.url), ['/a', '/d']);
	assert.equal(canForward(hist), false);
	assert.equal(canBack(hist), true);
});

test('cleanLang accepts BCP 47 shapes only', () => {
	assert.equal(cleanLang('de-DE'), 'de-DE');
	assert.equal(cleanLang(' en '), 'en');
	assert.equal(cleanLang('x" onload'), null);
	assert.equal(cleanLang(''), null);
});

test('sanitiser: classes, idrefs and SVG url() references', () => {
	assert.equal(mapClasses('box  lead x"y reader-page'), 'c-box c-lead c-reader-page');
	assert.equal(mapClasses(''), '');
	/* the Reader's own classes stay usable (as in the original), its container does not */
	assert.equal(mapClasses('reader-lead keep reader-hero reader-page'), 'reader-lead c-keep reader-hero c-reader-page');
	assert.equal(prefixIdrefs('a  b', 'r1-'), 'r1-a r1-b');
	assert.equal(rewriteUrlRefs('url(#grad)', 'r1-'), 'url(#r1-grad)');
	assert.equal(rewriteUrlRefs("url('#m')", 'r1-'), 'url(#r1-m)');
	assert.equal(rewriteUrlRefs('url(https://evil.example/x.svg#a)', 'r1-'), null);
	assert.equal(rewriteUrlRefs('url(data:image/svg+xml,x)', 'r1-'), null);
	assert.equal(rewriteUrlRefs('#fff', 'r1-'), '#fff');
	assert.equal(rewriteUrlRefs('javascript:alert(1)', 'r1-'), null);
});

test('sanitiser: URLs are re-resolved and checked', () => {
	const base = `${ORIGIN}/desk/site/content/en/about.html`;
	const ctx = (tag, svg = false) => ({ tag, svg, base, prefix: 'r1-', resolve });
	assert.equal(rewriteUrl('href', '#top', ctx('a')), '#r1-top');
	assert.equal(rewriteUrl('href', 'docs.html', ctx('a')), `${ORIGIN}/desk/site/content/en/docs.html`);
	assert.equal(rewriteUrl('href', 'https://live.example/x/', ctx('a')), `${ORIGIN}/x/`);
	assert.equal(rewriteUrl('href', 'mailto:a@b.example', ctx('a')), 'mailto:a@b.example');
	assert.equal(rewriteUrl('href', 'javascript:alert(1)', ctx('a')), null);
	assert.equal(rewriteUrl('href', ' JaVaScRiPt:alert(1)', ctx('a')), null);
	assert.equal(rewriteUrl('href', 'data:text/html,x', ctx('a')), null);
	assert.equal(rewriteUrl('href', 'vbscript:x', ctx('a')), null);
	assert.equal(rewriteUrl('src', '../img/a.png', ctx('img')), `${ORIGIN}/desk/site/content/img/a.png`);
	assert.equal(rewriteUrl('src', 'data:image/png;base64,AAAA', ctx('img')), 'data:image/png;base64,AAAA');
	assert.equal(rewriteUrl('src', 'data:image/svg+xml,<svg/>', ctx('img')), null);
	assert.equal(rewriteUrl('src', 'data:image/png;base64,AAAA', ctx('video')), null);
	assert.equal(rewriteUrl('src', '#x', ctx('img')), null);
	assert.equal(rewriteUrl('href', '#icon', ctx('use', true)), '#r1-icon');
	assert.equal(rewriteUrl('href', 'sprite.svg#icon', ctx('use', true)), null);
	assert.equal(rewriteUrl('href', '', ctx('a')), null);
	assert.equal(rewriteUrl('cite', 'ftp://x.example/', ctx('blockquote')), null);
});

test('sanitiser: srcset candidates', () => {
	const base = `${ORIGIN}/desk/p/`;
	assert.equal(rewriteSrcset('a.png 1x, b.png 2x', { base, resolve }), `${ORIGIN}/desk/p/a.png 1x, ${ORIGIN}/desk/p/b.png 2x`);
	assert.equal(rewriteSrcset('a.png 480w,b.png 960w', { base, resolve }), `${ORIGIN}/desk/p/a.png 480w, ${ORIGIN}/desk/p/b.png 960w`);
	assert.equal(rewriteSrcset('javascript:x 1x', { base, resolve }), null);
	assert.equal(rewriteSrcset('a.png onerror=x', { base, resolve }), `${ORIGIN}/desk/p/a.png`);
});

test('demotedLevel: page headings sit two levels under the window title (h2)', () => {
	assert.deepEqual([1, 2, 3, 4, 5, 6].map(demotedLevel), [3, 4, 5, 6, 6, 6]);
	assert.equal(demotedLevel('x'), 3);
});

test('readText: body within a deadline and a byte limit, the transfer cancelled otherwise', async () => {
	const enc = new TextEncoder();
	const streamed = (parts, { stall = false, length = null } = {}) => {
		let cancelled = false;
		const body = new ReadableStream({
			async pull(c) {
				if (parts.length) c.enqueue(enc.encode(parts.shift()));
				else if (stall) await new Promise(() => {});
				else c.close();
			},
			cancel() {
				cancelled = true;
			}
		});
		const res = new Response(body, { headers: length == null ? {} : { 'content-length': String(length) } });
		return { res, cancelled: () => cancelled };
	};
	assert.equal(await readText(streamed(['<p>Gr', 'üße</p>']).res, { maxBytes: 100 }), '<p>Grüße</p>');
	const stalled = streamed(['<html>'], { stall: true });
	await assert.rejects(readText(stalled.res, { timeout: 50 }), { code: 'timeout' });
	assert.ok(stalled.cancelled());
	const big = streamed(['12345', '67890', 'x']);
	await assert.rejects(readText(big.res, { maxBytes: 8 }), { code: 'size' });
	assert.ok(big.cancelled());
	await assert.rejects(readText(streamed(['x'], { length: 999 }).res, { maxBytes: 10 }), { code: 'size' });
	assert.equal(await readText(new Response(null)), '');
});
