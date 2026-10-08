/* JPKCom Desktop — tests: Reader helpers (rules, titles, alternates, cache, history, sanitiser URLs, code colours) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	splitSelectors, firstMatch, validateReaderConfig, compileRules, matchRule, cleanTitle, pickAlternate,
	createLru, createHistory, pushEntry, moveEntry, canBack, canForward, cleanLang, demotedLevel, readText, DEFAULT_RULE, DEFAULT_SEPARATOR, DEFAULT_SCOPE
} from '../src/modules/reader/util.js';
import { mapClasses, prefixIdrefs, rewriteUrlRefs, rewriteUrl, rewriteSrcset } from '../src/modules/reader/sanitize.js';
import {
	parseColor, formatColor, blend, contrast, parseStyle, guardPair, tintPair, MIN_CONTRAST, CODE_SURFACE
} from '../src/modules/reader/styles.js';

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
	assert.deepEqual(validateReaderConfig(null, () => {}), {
		rules: [], titleSeparator: DEFAULT_SEPARATOR, cacheSize: 24, keepStyles: true, styleScope: DEFAULT_SCOPE, styleVars: null
	});
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

/* ---------- Code colours (styles.js) ---------- */

const rgb = (r, g, b, a = 1) => ({ r, g, b, a });

test('validateReaderConfig: keepStyles, styleScope and styleVars', () => {
	const warnings = [];
	const check = sel => { if (sel.includes('%')) throw new Error('invalid'); return true; };
	const ok = validateReaderConfig({ keepStyles: false, styleScope: 'pre.hl, code', styleVars: '--hl-' }, m => warnings.push(m), check);
	assert.deepEqual([ok.keepStyles, ok.styleScope, ok.styleVars], [false, 'pre.hl, code', '--hl-']);
	assert.deepEqual(warnings, []);
	const bad = validateReaderConfig({ keepStyles: 'yes', styleScope: '%%', styleVars: '--Hl-' }, m => warnings.push(m), check);
	assert.deepEqual([bad.keepStyles, bad.styleScope, bad.styleVars], [true, DEFAULT_SCOPE, null]);
	assert.equal(warnings.length, 3);
	for (const v of ['--', '--a', 'hl-', '--a--', '--a b-', `--${'a'.repeat(40)}-`, 7, ['--a-']]) {
		assert.equal(validateReaderConfig({ styleVars: v }).styleVars, null, String(v));
	}
	assert.equal(validateReaderConfig({ styleVars: '--shiki-dark-' }).styleVars, '--shiki-dark-');
	/* never a prefix of the desktop's own tokens that reader.css reads (--reader-link, --text-2 …) */
	for (const v of ['--reader-', '--text-', '--accent-', '--highlight-', '--win-', '--reader-code-']) {
		const w = [];
		assert.equal(validateReaderConfig({ styleVars: v }, m => w.push(m)).styleVars, null, v);
		assert.equal(w.length, 1, v);
	}
	assert.equal(validateReaderConfig({ styleVars: '--readers-' }).styleVars, '--readers-', 'only whole words');
	assert.equal(validateReaderConfig({ styleScope: '' }).styleScope, DEFAULT_SCOPE);
	/* styleScope goes whole into el.closest(): one invalid part invalidates the list (a rule's
	   content list, tried part by part, keeps its valid parts) */
	const listCheck = sel => { if (sel.includes('%')) throw new Error('invalid'); return true; };
	const partly = [];
	assert.equal(validateReaderConfig({ styleScope: 'pre, %%' }, m => partly.push(m), listCheck).styleScope, DEFAULT_SCOPE);
	assert.equal(partly.length, 1);
	const rule = validateReaderConfig({ rules: [{ match: '/', content: 'main, %%' }] }, m => partly.push(m), listCheck);
	assert.equal(rule.rules[0].content, 'main, %%');
	assert.equal(partly.length, 1);
});

test('parseColor: hex, rgb(), hsl(), named — nothing else', () => {
	assert.deepEqual(parseColor('#Fa0'), rgb(255, 170, 0));
	assert.deepEqual(parseColor('#ff000080'), rgb(255, 0, 0, 0.502));
	assert.deepEqual(parseColor(' #102030 '), rgb(16, 32, 48));
	assert.deepEqual(parseColor('rgb(10, 20, 30)'), rgb(10, 20, 30));
	assert.deepEqual(parseColor('rgba(10,20,30,.5)'), rgb(10, 20, 30, 0.5));
	assert.deepEqual(parseColor('rgb(100% 0% 50% / 25%)'), rgb(255, 0, 128, 0.25));
	assert.deepEqual(parseColor('rgb(300 -5 0)'), rgb(255, 0, 0));
	assert.deepEqual(parseColor('hsl(120deg 100% 50%)'), rgb(0, 255, 0));
	assert.deepEqual(parseColor('hsla(240, 100%, 50%, 1)'), rgb(0, 0, 255));
	assert.deepEqual(parseColor('RebeccaPurple'), rgb(102, 51, 153));
	assert.deepEqual(parseColor('grey'), rgb(128, 128, 128));
	for (const bad of ['', null, 'transparent', 'currentcolor', 'inherit', 'canvastext', '#12', '#12345', '#ggg',
		'var(--x)', 'url(x)', 'rgb(var(--r) 0 0)', 'rgb(calc(1) 0 0)', 'rgb(1 2)', 'rgb(1, 2 3)', 'rgb(1, 2, 3 / 1)',
		'rgb(1 2 3 / 1 / 2)', 'rgb(1 2 3 /)', 'oklch(50% 0.1 120)', 'color(srgb 1 0 0)', 'rgb(1e3 0 0)', 'hsl(1turn 50% 50%)',
		'red blue', 'expression(alert(1))', 'rgb((1) 2 3)', 'light-dark(#000, #fff)', '-webkit-link']) {
		assert.equal(parseColor(bad), null, String(bad));
	}
});

test('formatColor, blend and contrast', () => {
	assert.equal(formatColor(rgb(255, 170, 0)), '#ffaa00');
	assert.equal(formatColor(rgb(1, 2, 3, 0.5)), 'rgb(1 2 3 / 0.5)');
	assert.deepEqual(blend(rgb(255, 255, 255, 0.5), rgb(0, 0, 0)), rgb(128, 128, 128));
	assert.equal(contrast(rgb(0, 0, 0), rgb(255, 255, 255)), 21);
	assert.equal(contrast(rgb(9, 9, 9), rgb(9, 9, 9)), 1);
	assert.ok(Math.abs(contrast(rgb(0x77, 0x77, 0x77), rgb(255, 255, 255)) - 4.48) < 0.01);
});

test('parseStyle keeps the allowlist only, written by the Reader', () => {
	assert.deepEqual(parseStyle('color:#F8F8F2'), { color: rgb(248, 248, 242), bg: null, props: [] });
	assert.deepEqual(parseStyle('background-color:#191a21;color:#f8f8f2'),
		{ color: rgb(248, 248, 242), bg: rgb(25, 26, 33), props: [] });
	assert.deepEqual(parseStyle('background: navy'), { color: null, bg: rgb(0, 0, 128), props: [] });
	assert.deepEqual(parseStyle('color:#50fa7b;font-weight:700;FONT-STYLE: Italic;text-decoration:underline line-through').props,
		[['font-weight', '700'], ['font-style', 'italic'], ['text-decoration-line', 'underline line-through']]);
	assert.deepEqual(parseStyle('font-weight:bold;font-weight:1001').props, [['font-weight', 'bold']]);
	assert.deepEqual(parseStyle('text-decoration:none').props, [['text-decoration-line', 'none']]);
	/* later declarations win, as in CSS */
	assert.deepEqual(parseStyle('color:red;color:blue').color, rgb(0, 0, 255));
	/* dropped declaration by declaration */
	const mixed = parseStyle('position:fixed;top:0;width:100vw;display:none;opacity:0;font-size:0;color:#abc;'
		+ 'background-image:linear-gradient(red,blue);background:#000 url(x);text-decoration:underline wavy red;'
		+ 'font-weight:var(--w);color:var(--c);--hl-dark:#fff;transform:scale(0);visibility:hidden;content:x');
	assert.deepEqual(mixed, { color: rgb(170, 187, 204), bg: null, props: [] });
	/* refused as a whole: escapes, comments, quotes, !important, braces, at-rules */
	for (const bad of ['color:#f00 !important', 'color:\\72 ed', 'color:/**/red', 'font-family:"x";color:red',
		"color:red;x:'", 'color:red}body{color:blue', '@import x;color:red', 'color:red<', '', '   ', null,
		`color:red;${'x'.repeat(2000)}`]) {
		assert.equal(parseStyle(bad), null, String(bad));
	}
	assert.equal(parseStyle('position:absolute;left:0'), null);
});

test('parseStyle: custom properties only with the configured prefix and colour values', () => {
	const css = 'color:#24292e;--hl-dark:#E1E4E8;--hl-dark-bg:rgb(36 41 46);--hl-dark-font-style:italic;'
		+ '--hl-x:var(--y);--other:#fff;--HL-up:#fff;--hl-:#fff';
	assert.deepEqual(parseStyle(css, { vars: '--hl-' }).props, [['--hl-dark', '#e1e4e8'], ['--hl-dark-bg', '#24292e']]);
	assert.deepEqual(parseStyle(css).props, []);
	assert.equal(parseStyle('--hl-dark:#fff'), null);
});

test('guardPair: a kept pair must stay readable; outside a code block only a pair the page gives', () => {
	const code = CODE_SURFACE;
	assert.ok(MIN_CONTRAST >= 2);
	/* inside a code block: against the surface */
	assert.equal(guardPair({ color: rgb(0x50, 0xfa, 0x7b), bg: null }, code).keep, true);
	assert.equal(guardPair({ color: rgb(0x11, 0x17, 0x1e), bg: null }, code).keep, false);
	assert.equal(guardPair({ color: rgb(0x16, 0x1c, 0x24), bg: null }, code).keep, false);
	/* a hidden-text pair the page sets itself */
	assert.equal(guardPair({ color: rgb(250, 250, 250), bg: rgb(255, 255, 255) }, code).keep, false);
	/* the page's own background replaces the surface for its children */
	const pre = guardPair({ color: rgb(0x24, 0x29, 0x2e), bg: rgb(255, 255, 255) }, code);
	assert.equal(pre.keep, true);
	assert.deepEqual(pre.bg, rgb(255, 255, 255));
	assert.equal(guardPair({ color: rgb(0xf8, 0xf8, 0xf2), bg: null }, pre).keep, false);
	assert.equal(guardPair({ color: rgb(0xd7, 0x3a, 0x49), bg: null }, pre).keep, true);
	/* a background alone is checked against the inherited text colour */
	assert.equal(guardPair({ color: null, bg: rgb(0xdd, 0xe5, 0xec) }, code).keep, false);
	/* alpha: blended over what lies below */
	assert.equal(guardPair({ color: rgb(255, 255, 255, 0.05), bg: null }, code).keep, false);
	assert.equal(guardPair({ color: rgb(255, 255, 255, 0.8), bg: null }, code).keep, true);
	assert.equal(guardPair({ color: null, bg: rgb(255, 255, 255, 0.9) }, code).keep, false);
	/* outside a code block the surface is unknown: only a complete opaque pair of the page */
	assert.equal(guardPair({ color: rgb(255, 0, 0), bg: null }, null).keep, false);
	assert.equal(guardPair({ color: null, bg: rgb(0, 0, 0) }, null).keep, false);
	assert.equal(guardPair({ color: rgb(255, 255, 255), bg: rgb(0, 0, 0, 0.5) }, null).keep, false);
	const inline = guardPair({ color: rgb(255, 255, 255), bg: rgb(0, 0, 0) }, null);
	assert.equal(inline.keep, true);
	assert.equal(guardPair({ color: rgb(255, 200, 0), bg: null }, inline).keep, true);
	/* a dropped pair passes on what it sat on; no colours at all → nothing to check */
	assert.deepEqual(guardPair({ color: rgb(0x11, 0x17, 0x1e), bg: null }, code), { keep: false, fg: code.fg, bg: code.bg });
	assert.deepEqual(guardPair({ color: null, bg: null }, null), { keep: true, fg: null, bg: null });
});

test('tintPair: the translucent backgrounds in between count (a colour hidden on a highlight)', () => {
	const code = CODE_SURFACE;
	const tint = rgb(143, 192, 255, 0.24);                    // the dark --highlight of a <mark>
	const marked = tintPair(code, [tint]);
	assert.deepEqual(marked.fg, code.fg);
	assert.deepEqual(marked.bg, blend(tint, code.bg));
	/* a colour that passes on the surface but is close to the highlight is refused inside the mark */
	const sly = rgb(0x46, 0x5a, 0x73);
	assert.ok(contrast(sly, code.bg) >= MIN_CONTRAST);
	assert.equal(guardPair({ color: sly, bg: null }, code).keep, true);
	assert.equal(guardPair({ color: sly, bg: null }, marked).keep, false);
	/* outermost first; nothing to lay over → the pair itself */
	assert.deepEqual(tintPair(code, [tint, tint]).bg, blend(tint, blend(tint, code.bg)));
	assert.deepEqual(tintPair(code, []), { fg: code.fg, bg: code.bg });
	assert.equal(tintPair(null, [tint]), null);
	assert.deepEqual(tintPair({ fg: null, bg: null }, [tint]), { fg: null, bg: null });
});

test('reader.css: inside kept colours no desktop text colour applies (links, headings)', async () => {
	const { readFile } = await import('node:fs/promises');
	const css = await readFile(new URL('../src/modules/reader/reader.css', import.meta.url), 'utf8');
	const KEPT_MARK = 'data-reader-kept';
	const rule = new RegExp(`\\[${KEPT_MARK}\\] \\* \\{\\s*color: inherit;`);
	assert.match(css, rule);
	const src = await readFile(new URL('../src/modules/reader/extract.js', import.meta.url), 'utf8');
	assert.match(src, new RegExp(`KEPT_MARK = '${KEPT_MARK}'`), 'extract.js sets the attribute the stylesheet reads');
	/* the sanitiser drops every data-* attribute of a page, so a page cannot set the mark itself */
	const san = await readFile(new URL('../src/modules/reader/sanitize.js', import.meta.url), 'utf8');
	assert.match(san, /name\.startsWith\('data-'\)/);
});
