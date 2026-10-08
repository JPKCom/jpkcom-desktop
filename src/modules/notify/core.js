/* JPKCom Desktop — feed notifications: JSON Feed parsing, seen state, news (pure) — © Jean Pierre Kolb — MIT License

   JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/): only items with a
   title, a date that has come and a same-origin url (inside pathPrefix when
   one is set) count. Which app a banner shows (routedAppOf, appFor, commonApp,
   holdsAll, homeFor) and its meta line (cleanLabel, metaOf, metaFor). No DOM, no
   desktop imports but the import-free core/is.js (the router and the registry come
   in as parameters) — tests use these directly. */

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

/* ---------- Which app a banner shows ---------- */

/**
 * The app an article opens in: the fixed app (config.notify.app) when it can open now,
 * else the one the router sends the path to → id | null (a file, a tab, nothing that opens).
 * available(id) → boolean; routeOf(path) → id | null (the router's choice).
 */
export function appFor(path, { fixed = null, available = () => false, routeOf = () => null } = {}) {
	if (typeof fixed === 'string' && fixed && available(fixed)) return fixed;
	const id = routeOf(path);
	return typeof id === 'string' && id ? id : null;
}

/**
 * The app the router sends a path to, step by step as router.openUrl() does: not http(s)
 * or another origin → null; route() → a routed app when it can open now (available(id)),
 * a tab route → null; a page → pageApp() (the page app with the longest URL prefix, else
 * site.defaultPageApp) → id | null. router: { resolveUrl, isExternal, route, pageApp }.
 */
export function routedAppOf(path, { router, available = () => false } = {}) {
	if (!router || typeof path !== 'string') return null;
	const url = router.resolveUrl(path);
	if (!url || !/^https?:$/.test(url.protocol) || router.isExternal(url)) return null;
	const to = router.route(url);
	if (to.app) return available(to.app) ? to.app : null;
	if (to.tab) return null;
	return router.pageApp(url.pathname)?.id ?? null;
}

/** The one app all articles open in → id | null (none, several, or any article without an app) */
export function commonApp(ids) {
	const list = Array.isArray(ids) ? ids : [];
	const set = new Set(list);
	return set.size === 1 && typeof list[0] === 'string' && list[0] ? list[0] : null;
}

/**
 * Does every path lie below one of the app's URL paths (bases: absolute paths)? Then the
 * app's start page is the home of these articles (the list), not a fallback that merely
 * shows them (site.defaultPageApp).
 */
export function holdsAll(bases, paths) {
	const list = (Array.isArray(bases) ? bases : []).filter(b => typeof b === 'string' && b);
	return list.length > 0 && Array.isArray(paths) && paths.length > 0
		&& paths.every(p => typeof p === 'string' && list.some(b => p.startsWith(b)));
}

/**
 * What the summary banner may open as the articles' home (its start page, the list) → id | null.
 * id: the app all articles open in (commonApp); fixed: config.notify.app; app: its registry
 * record; root: the installation root URL the app's URLs resolve against; paths: the
 * articles' paths. The fixed app and an app that is not a page app (a routed app: site
 * route, collection item) are home; a page app only when one of its URLs holds every
 * article (holdsAll) — not site.defaultPageApp merely showing pages nothing else claims.
 */
export function homeFor(id, { fixed = null, app = null, root, paths = [] } = {}) {
	if (typeof id !== 'string' || !id) return null;
	if (id === fixed || app?.kind !== 'page') return id;
	const urls = typeof app.url === 'string' ? [app.url] : Object.values(isObj(app.url) ? app.url : {});
	const bases = urls.map(u => {
		try {
			return new URL(u, root).pathname;
		} catch {
			return null;
		}
	});
	return holdsAll(bases, paths) ? id : null;
}

/**
 * config.notify.label: a text or a { lang: text } map, each at most 60 characters
 * (trimmed) → the cleaned value | null (null, '' and anything else).
 */
export function cleanLabel(v) {
	const text = x => (typeof x === 'string' && x.trim() && x.trim().length <= 60 ? x.trim() : null);
	if (typeof v === 'string') return text(v);
	if (!isObj(v)) return null;
	const out = {};
	for (const [k, x] of Object.entries(v)) {
		if (LANG.test(k) && text(x)) out[k] = text(x);
	}
	return Object.keys(out).length ? out : null;
}

/**
 * The banner's meta line: join(label, name) with both, else whichever there is ('' = none).
 * A label equal to the app name (any case) is shown once.
 */
export function metaOf(label, name, join) {
	const l = typeof label === 'string' ? label.trim() : '';
	const n = typeof name === 'string' ? name.trim() : '';
	if (l && n && l.toLowerCase() !== n.toLowerCase()) return join(l, n);
	return l || n;
}

/**
 * The meta line of a banner about app id (or null): label (config.notify.label, resolved
 * with L) and the app's name (nameOf(id)) through metaOf → text | undefined (nothing: the
 * shell's default).
 */
export function metaFor(id, { label = null, L = v => (typeof v === 'string' ? v : ''), nameOf = () => '', join } = {}) {
	const l = label ? L(label) : '';
	const n = typeof id === 'string' && id ? nameOf(id) : '';
	return metaOf(l, n, join) || undefined;
}
