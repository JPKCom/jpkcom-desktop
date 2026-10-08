/* JPKCom Desktop — tests: JSON Feed parsing, seen state, banner plan, feed per language, the app a banner shows — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanSeen, newsOf, bannerPlan, daysAgo, feedFor, routedAppOf, appFor, commonApp, holdsAll, homeFor, cleanLabel, metaOf, metaFor } from '../src/modules/notify/core.js';
import { createRegistry } from '../src/core/registry.js';
import { createRouter } from '../src/core/router.js';

const ORIGIN = 'https://desk.example';
const FEED = `${ORIGIN}/site/data/feed.en.json`;
const resolve = raw => {
	try {
		return new URL(raw, FEED);
	} catch {
		return null;
	}
};
const now = Date.UTC(2026, 9, 6, 12);

test('parseFeed: same origin, title, past date, prefix; newest first; no duplicates', () => {
	const data = {
		version: 'https://jsonfeed.org/version/1.1',
		items: [
			{ url: '/news/a/', title: ' A ', date_published: '2026-10-01T10:00:00Z', summary: ' Sum ' },
			{ url: 'https://other.example/x/', title: 'Foreign', date_published: '2026-10-02T10:00:00Z' },
			{ url: '/news/b/', title: 'B', date_published: '2026-10-03T10:00:00Z' },
			{ url: '/news/b/', title: 'B again', date_published: '2026-10-03T10:00:00Z' },
			{ url: '/news/future/', title: 'Future', date_published: '2027-01-01T00:00:00Z' },
			{ url: '/news/untitled/', title: '  ', date_published: '2026-10-01T00:00:00Z' },
			{ url: '/news/nodate/', title: 'No date' },
			{ url: 'javascript:alert(1)', title: 'Evil', date_published: '2026-10-01T00:00:00Z' },
			{ url: '/elsewhere/c/', title: 'C', date_published: '2026-10-04T10:00:00Z' },
			null
		]
	};
	const all = parseFeed(data, { resolve, origin: ORIGIN, now });
	assert.deepEqual(all.map(x => x.title), ['C', 'B', 'A']);
	assert.equal(all[2].summary, 'Sum');
	assert.equal(all[2].path, '/news/a/');
	const news = parseFeed(data, { resolve, origin: ORIGIN, now, prefix: '/news/' });
	assert.deepEqual(news.map(x => x.title), ['B', 'A']);
	assert.equal(parseFeed(data, { resolve, origin: ORIGIN, now, max: 1 }).length, 1);
	assert.deepEqual(parseFeed(null, { resolve, origin: ORIGIN, now }), []);
	assert.deepEqual(parseFeed({ items: 'x' }, { resolve, origin: ORIGIN, now }), []);
});

test('seen state per language', () => {
	assert.deepEqual(cleanSeen({ en: 5, de: 'x', 'pt-BR': 7, 'bad key': 1, fr: -1 }), { en: 5, 'pt-BR': 7 });
	assert.equal(cleanSeen([1]), null);
	/* A last-seen date from the future would hide all news for good */
	const now = 1_700_000_000_000;
	assert.deepEqual(cleanSeen({ en: 8e15, de: now + 3600000, fr: now + 2 * 86400000 }, now), { de: now + 3600000 });
	assert.deepEqual(cleanSeen({ en: Date.now() + 30 * 86400000, de: 1 }), { de: 1 });   // real clock without `now`
	const items = [{ date: 30 }, { date: 20 }, { date: 10 }];
	assert.deepEqual(newsOf(items, undefined), [{ date: 30 }]);
	assert.deepEqual(newsOf(items, 15), [{ date: 30 }, { date: 20 }]);
	assert.deepEqual(newsOf(items, 30), []);
});

test('banner plan: more than max fold into a summary', () => {
	const five = [1, 2, 3, 4, 5];
	assert.deepEqual(bannerPlan(five, 3), { shown: [1, 2], more: 3 });
	assert.deepEqual(bannerPlan([1, 2, 3], 3), { shown: [1, 2, 3], more: 0 });
	assert.deepEqual(bannerPlan(five, 1), { shown: [], more: 5 });
	assert.deepEqual(bannerPlan([1], 0), { shown: [1], more: 0 });
});

test('days ago and the feed of a language', () => {
	const today = new Date(2026, 9, 6, 9).getTime();
	assert.equal(daysAgo(new Date(2026, 9, 6, 1).getTime(), today), 0);
	assert.equal(daysAgo(new Date(2026, 9, 5, 23).getTime(), today), 1);
	assert.equal(daysAgo(new Date(2026, 9, 1).getTime(), today), 5);
	const feeds = { en: 'site/data/feed.en.json', de: 'site/data/feed.de.json' };
	assert.deepEqual(feedFor(feeds, ['de-AT', 'de', 'en']), { code: 'de', path: 'site/data/feed.de.json' });
	assert.deepEqual(feedFor(feeds, ['fr', 'en']), { code: 'en', path: 'site/data/feed.en.json' });
	assert.equal(feedFor({}, ['en']), null);
	assert.equal(feedFor(null, ['en']), null);
});

/* ---------- Which app a banner shows (V5) ---------- */

test('appFor: the fixed app when it can open, else the router\'s choice', () => {
	const available = id => id === 'news' || id === 'blog';
	const routeOf = path => (path.startsWith('/blog/') ? 'blog' : path.endsWith('.pdf') ? null : 'about');
	assert.equal(appFor('/x/', { fixed: 'news', available, routeOf }), 'news');
	assert.equal(appFor('/blog/a/', { fixed: 'gone', available, routeOf }), 'blog', 'a fixed app that cannot open → the router');
	assert.equal(appFor('/blog/a/', { fixed: null, available, routeOf }), 'blog');
	assert.equal(appFor('/other/', { fixed: null, available, routeOf }), 'about');
	assert.equal(appFor('/file.pdf', { fixed: null, available, routeOf }), null);
	assert.equal(appFor('/x/', { routeOf: () => '' }), null);
	assert.equal(appFor('/x/'), null);
});

/* A registry and router as the desktop builds them, with neutral example apps */
function desk() {
	const reg = createRegistry({ L: v => (typeof v === 'string' ? v : v?.en ?? ''), warn: () => {} });
	reg.load({
		apps: [
			{ id: 'about', kind: 'page', name: 'About', url: 'site/content/en/about.html' },
			{ id: 'blog', kind: 'page', name: 'Blog', icon: 'ti-news', url: { en: 'site/content/en/blog/', de: 'site/content/de/blog/' } },
			{ id: 'tips', kind: 'page', name: 'Tips', url: 'site/content/en/blog/tips/' },
			{ id: 'guide', kind: 'page', name: 'Guide', url: 'site/content/en/guide.html' },
			{ id: 'news', kind: 'app', name: 'News' },
			{ id: 'gone', kind: 'app', name: 'Gone' }
		]
	});
	reg.setImpl('news', {});
	const router = createRouter({
		registry: reg,
		site: {
			routes: [
				{ prefix: 'downloads/', tab: true },
				{ prefix: 'news/', app: 'news' },
				{ prefix: 'old/', app: 'gone' },
				{ prefix: 'manual/', app: 'guide' }
			],
			defaultPageApp: 'about'
		},
		origin: ORIGIN, root: `${ORIGIN}/desk/`
	});
	const available = id => reg.available(id);
	return { reg, router, available, routeOf: p => routedAppOf(p, { router, available }) };
}

test('routedAppOf: the app router.openUrl() opens a path in', () => {
	const { router, available } = desk();
	const of = p => routedAppOf(p, { router, available });
	assert.equal(of('/desk/site/content/en/blog/one.html'), 'blog', 'page app, URL prefix');
	assert.equal(of('/desk/site/content/de/blog/eins.html'), 'blog', 'a URL of another language');
	assert.equal(of('/desk/site/content/en/blog/tips/two.html'), 'tips', 'the longest prefix wins');
	assert.equal(of('/desk/site/content/en/other.html'), 'about', 'site.defaultPageApp');
	assert.equal(of('/desk/news/today.html'), 'news', 'a site route to an app that can open');
	assert.equal(of('/desk/manual/intro.html'), 'guide', 'a site route to a page app');
	assert.equal(of('/desk/old/x.html'), null, 'a site route to an app that cannot open');
	assert.equal(of('/desk/downloads/x.html'), null, 'a tab route');
	assert.equal(of('/desk/site/content/en/blog/file.zip'), null, 'a file');
	assert.equal(of('https://other.example/blog/'), null, 'another origin');
	assert.equal(of('mailto:someone@desk.example'), null, 'not http(s)');
	assert.equal(of('http://[bad'), null, 'not a URL');
	assert.equal(of(42), null);
	assert.equal(routedAppOf('/desk/site/content/en/blog/one.html', {}), null, 'no router');
	assert.equal(routedAppOf('/desk/news/today.html', { router }), null, 'nothing counts as available by default');
});

test('appFor with the real router: the fixed app first, else the router\'s choice', () => {
	const { available, routeOf } = desk();
	const opts = { fixed: null, available, routeOf };
	assert.equal(appFor('/desk/site/content/en/blog/one.html', opts), 'blog');
	assert.equal(appFor('/desk/site/content/en/blog/tips/two.html', opts), 'tips');
	assert.equal(appFor('/desk/downloads/x.html', opts), null);
	assert.equal(appFor('/desk/site/content/en/other.html', { ...opts, fixed: 'news' }), 'news', 'fixed app that can open');
	assert.equal(appFor('/desk/site/content/en/other.html', { ...opts, fixed: 'gone' }), 'about', 'fixed app that cannot open');
	const news = ['/desk/site/content/en/blog/one.html', '/desk/site/content/en/blog/three.html'].map(p => appFor(p, opts));
	assert.equal(commonApp(news), 'blog');
	assert.equal(commonApp([...news, appFor('/desk/site/content/en/blog/tips/two.html', opts)]), null);
});

test('homeFor: what the summary banner opens as the articles\' home', () => {
	const { reg } = desk();
	const root = `${ORIGIN}/desk/`;
	const home = (id, fixed, paths) => homeFor(id, { fixed, app: id ? reg.get(id) : null, root, paths });
	const other = ['/desk/site/content/en/other.html', '/desk/site/content/en/more.html'];
	assert.equal(home('about', 'about', other), 'about', 'the fixed app, even when its URL holds none of them');
	assert.equal(home('news', null, ['/desk/news/a.html']), 'news', 'a routed app that is not a page app');
	assert.equal(home('blog', null, ['/desk/site/content/en/blog/a.html', '/desk/site/content/de/blog/b.html']), 'blog',
		'a page app one of whose URLs holds every article');
	assert.equal(home('blog', null, ['/desk/site/content/en/blog/a.html', '/desk/site/content/en/other.html']), null,
		'a page app that holds only some');
	assert.equal(home('about', null, other), null, 'site.defaultPageApp merely showing them');
	assert.equal(home('guide', null, ['/desk/manual/intro.html']), null, 'a page app reached through a site route counts by its URL too');
	assert.equal(home(null, 'about', other), null, 'no common app');
	assert.equal(homeFor('', { fixed: '' }), null);
	assert.equal(homeFor('blog', { app: { kind: 'page', url: 'http://[bad' }, root, paths: ['/x'] }), null, 'a URL that does not parse');
});

test('commonApp: one app for all, else null', () => {
	assert.equal(commonApp(['a', 'a', 'a']), 'a');
	assert.equal(commonApp(['a']), 'a');
	assert.equal(commonApp(['a', 'b']), null);
	assert.equal(commonApp(['a', null]), null);
	assert.equal(commonApp([null, null]), null);
	assert.equal(commonApp([]), null);
	assert.equal(commonApp(null), null);
});

test('holdsAll: the app\'s URL is the home of every article', () => {
	const blog = ['/desk/site/content/en/blog/', '/desk/site/content/de/blog/'];
	assert.equal(holdsAll(blog, ['/desk/site/content/en/blog/a.html', '/desk/site/content/de/blog/b.html?x=1']), true);
	assert.equal(holdsAll(blog, ['/desk/site/content/en/blog/a.html', '/desk/site/content/en/other.html']), false);
	assert.equal(holdsAll(['/desk/site/content/en/changelog.html'], ['/desk/site/content/en/changelog.html?release=1']), true);
	assert.equal(holdsAll([null, ''], ['/x']), false);
	assert.equal(holdsAll(blog, []), false);
	assert.equal(holdsAll(null, ['/x']), false);
	assert.equal(holdsAll(['/'], [7]), false);
});

test('label and meta line', () => {
	assert.equal(cleanLabel(' Example News '), 'Example News');
	assert.equal(cleanLabel(''), null);
	assert.equal(cleanLabel('   '), null);
	assert.equal(cleanLabel('x'.repeat(61)), null);
	assert.equal(cleanLabel(7), null);
	assert.equal(cleanLabel(null), null);
	assert.equal(cleanLabel(['a']), null);
	assert.deepEqual(cleanLabel({ en: 'News', de: ' Neues ', 'bad key': 'x', fr: 3, it: '' }), { en: 'News', de: 'Neues' });
	assert.equal(cleanLabel({ fr: 3 }), null);
	const join = (site, app) => `${site} · ${app}`;
	assert.equal(metaOf('Example News', 'Blog', join), 'Example News · Blog');
	assert.equal(metaOf('', 'Blog', join), 'Blog');
	assert.equal(metaOf('Example News', '', join), 'Example News');
	assert.equal(metaOf('blog', 'Blog', join), 'blog', 'a label equal to the name is shown once');
	assert.equal(metaOf(null, undefined, join), '');
});

test('metaFor: the banner\'s meta line', () => {
	const join = (site, app) => `${site} · ${app}`;
	const nameOf = id => ({ blog: 'Blog', about: 'About' })[id] ?? '';
	const L = v => (typeof v === 'string' ? v : v?.de ?? v?.en ?? '');
	assert.equal(metaFor('blog', { label: null, L, nameOf, join }), 'Blog', 'no label → the app name');
	assert.equal(metaFor(null, { label: null, L, nameOf, join }), undefined, 'no label, no app → the shell default');
	assert.equal(metaFor('blog', { label: { en: 'News', de: 'Neues' }, L, nameOf, join }), 'Neues · Blog', 'label with app');
	assert.equal(metaFor('blog', { label: 'Example News', nameOf, join }), 'Example News · Blog', 'a plain text label');
	assert.equal(metaFor(null, { label: 'Example News', L, nameOf, join }), 'Example News', 'label without app');
	assert.equal(metaFor('unknown', { label: 'Example News', L, nameOf, join }), 'Example News', 'an app without a name');
	assert.equal(metaFor('blog', { label: 'BLOG', L, nameOf, join }), 'BLOG', 'a label equal to the name, once');
	assert.equal(metaFor('blog', { nameOf, join }), 'Blog');
});

test('validateConfig: label', async () => {
	const { default: notify } = await import('../src/modules/notify/index.js');
	const run = section => {
		const warns = [];
		return { out: notify.validateConfig(section, m => warns.push(m)), warns };
	};
	let r = run({});
	assert.equal(r.out.label, null);
	assert.deepEqual(r.warns, []);
	r = run({ label: { en: 'News', de: 'Neues' } });
	assert.deepEqual(r.out.label, { en: 'News', de: 'Neues' });
	assert.deepEqual(r.warns, []);
	r = run({ label: 'News' });
	assert.equal(r.out.label, 'News');
	r = run({ label: 42 });
	assert.equal(r.out.label, null);
	assert.equal(r.warns.length, 1);
	r = run({ label: { en: 'News', xx_bad: 'x' } });
	assert.deepEqual(r.out.label, { en: 'News' });
	assert.equal(r.warns.length, 1);
	r = run({ label: null });
	assert.equal(r.out.label, null);
	assert.deepEqual(r.warns, []);
});
