/* JPKCom Desktop — feed notifications: JSON Feed parsing, seen state, news (pure) — © Jean Pierre Kolb — MIT License

   JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/): only items with a
   title, a date that has come and a same-origin url (inside pathPrefix when
   one is set) count. No DOM, no desktop imports but the
   import-free core/is.js — tests use these directly. */

import { isObj } from '../../core/is.js';

const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * Feed items → [{ path, date, title, summary }], newest first, at most max.
 * resolve(raw) → URL | null (relative to the feed; the site's own hosts count as this origin);
 * origin: this page's origin; prefix: a path the item must start with (or null).
 */
export function parseFeed(data, { resolve, origin, prefix = null, now = Date.now(), max = 50 }) {
	const items = [];
	const seen = new Set();
	for (const it of Array.isArray(data?.items) ? data.items : []) {
		const url = typeof it?.url === 'string' ? resolve(it.url) : null;
		if (!url || url.origin !== origin || !/^https?:$/.test(url.protocol)) continue;
		if (prefix && !url.pathname.startsWith(prefix)) continue;
		const date = Date.parse(it?.date_published);
		if (typeof it.title !== 'string' || !it.title.trim() || !Number.isFinite(date) || date > now) continue;
		const path = url.pathname + url.search;
		if (seen.has(path)) continue;
		seen.add(path);
		items.push({
			path,
			date,
			title: it.title.trim().slice(0, 200),
			summary: typeof it.summary === 'string' ? it.summary.trim().slice(0, 300) : ''
		});
	}
	items.sort((a, b) => b.date - a.date);
	return items.slice(0, max);
}

/** The stored "newest item already announced" per feed language: { lang: ms } */
export function cleanSeen(v, now) {
	if (!isObj(v)) return null;
	/* A last-seen date from the future would hide every article until then */
	const limit = (Number.isFinite(now) ? now : Date.now()) + 86400000;
	const out = {};
	for (const [k, ms] of Object.entries(v).slice(0, 50)) {
		if (LANG.test(k) && typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= limit) out[k] = ms;
	}
	return out;
}

/** First visit (nothing seen): the latest item; later: everything newer than the last one announced. */
export const newsOf = (items, seen) => (seen === undefined ? items.slice(0, 1) : items.filter(x => x.date > seen));

/**
 * How many banners: up to max one per item; more than max fold the rest into a
 * summary banner → { shown: items, more: count folded (0 = no summary) }.
 */
export function bannerPlan(news, max) {
	const m = Math.max(1, Math.floor(max) || 1);
	if (news.length <= m) return { shown: news, more: 0 };
	const shown = news.slice(0, m - 1);
	return { shown, more: news.length - shown.length };
}

/** Whole calendar days between an instant and now (0 = today, 1 = yesterday, negative = future) */
export function daysAgo(ms, now = Date.now()) {
	const d = new Date(ms);
	const n = new Date(now);
	return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
}

/**
 * The feed of a language: the first of chain (lang, base, default, en) that
 * config.notify.feeds names → { code, path } | null.
 */
export function feedFor(feeds, chain) {
	if (!isObj(feeds)) return null;
	for (const code of chain) {
		if (typeof feeds[code] === 'string' && feeds[code]) return { code, path: feeds[code] };
	}
	return null;
}
