/* JPKCom Desktop — tests: JSON Feed parsing, seen state, banner plan, feed per language — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanSeen, newsOf, bannerPlan, daysAgo, feedFor } from '../src/modules/notify/core.js';

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
