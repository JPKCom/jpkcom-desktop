/* JPKCom Desktop — feed notifications: banners for new articles, the news list in the calendar — © Jean Pierre Kolb — MIT License

   Optional module 'notify'. Reads the site's JSON Feed of the current language
   (config.notify.feeds: { lang: path }, same origin; a language without a feed
   uses the next one of its fallback chain) shortly after the start and shows
   what is new since the last visit:

   - first visit: the latest article; later: everything newer than the last one
     announced (remembered per feed language); more than config.notify.maxBanners
     fold into a summary banner ("And 4 more new articles")
   - banners go through the notifications service (Desk.notifyBanner, shell); they
     open the article in config.notify.app (else wherever the router sends the URL)
   - the calendar lists the latest three (order 20), new ones marked; opening the
     calendar dismisses the banners, as a notification centre does
   - Settings → General: a switch for the banners (stored 'notify': on/off)

   config.notify: { feeds, app, hideMs, maxBanners, pathPrefix } — pathPrefix (relative to
   the installation root) limits the items to one part of the site.
   Service 'notify': check(banners = true), clear(), enabled(), setEnabled(on), items().
   Emits 'notify:new' { items } when a check finds articles that were not announced yet. */

import Desk from '../../core/api.js';
import { parseFeed, cleanSeen, newsOf, bannerPlan, daysAgo, feedFor } from './core.js';

const SEEN = 'feed';
const ON = 'notify';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
/* A path ('site/data/feed.en.json', '/news/') or an http(s) URL — never another scheme or '//host' */
const isPath = p => typeof p === 'string' && p.length > 0 && !p.startsWith('//') && (!/^[a-z][a-z0-9+.-]*:/i.test(p) || /^https?:\/\//i.test(p));

let cfg = { feeds: {}, app: null, hideMs: 9000, maxBanners: 3, pathPrefix: null };
const feeds = new Map();    // feed code → items, newest first
const loading = new Map();  // feed code → Promise
const fresh = new Map();    // feed code → Set of paths that are new on this visit
const handles = new Set();  // open banners
const warned = new Set();

const enabled = () => Desk.store.flag(ON, true);
const hasFeeds = () => Object.keys(cfg.feeds).length > 0;
const currentFeed = () => feedFor(cfg.feeds, Desk.i18n.chain());

/* ---------- Seen state ---------- */

const readSeen = () => Desk.store.getJson(SEEN, cleanSeen, {});

function markSeen(code, ms) {
	const v = readSeen();
	if (v[code] >= ms) return;
	v[code] = ms;
	Desk.store.setJson(SEEN, v);
}

/* ---------- Loading ---------- */

function feedUrl(path) {
	let url;
	try {
		url = new URL(path, Desk.env.root);
	} catch {
		url = null;
	}
	if (!url || url.origin !== location.origin) {
		if (!warned.has(path)) {
			warned.add(path);
			console.warn(`[notify] feed ${JSON.stringify(path)} is not on this site — skipped`);
		}
		return null;
	}
	return url;
}

function load(feed) {
	if (feeds.has(feed.code)) return Promise.resolve(feeds.get(feed.code));
	if (loading.has(feed.code)) return loading.get(feed.code);
	const url = feedUrl(feed.path);
	if (!url) return Promise.resolve([]);
	const prefix = cfg.pathPrefix ? new URL(cfg.pathPrefix, Desk.env.root).pathname : null;
	const p = Desk.net.getJson(url.href, { accept: 'application/feed+json, application/json' })
		.then(data => {
			const items = parseFeed(data, {
				resolve: raw => Desk.router.resolveUrl(raw, url.href),
				origin: location.origin,
				prefix
			});
			feeds.set(feed.code, items);
			return items;
		})
		.finally(() => loading.delete(feed.code));
	loading.set(feed.code, p);
	return p;
}

/* ---------- Opening ---------- */

function openItem(path) {
	if (!(cfg.app && Desk.launch(cfg.app, { url: path }))) Desk.openUrl(path);
}

/* The summary banner opens the app with the list of articles; without one (app: null
   or not installed) the newest article, wherever the router sends its URL */
function openApp(fallback) {
	if (!(cfg.app && Desk.launch(cfg.app)) && fallback) Desk.openUrl(fallback);
}

function when(ms) {
	const days = daysAgo(ms);
	if (days === 0) return Desk.t('core.today');
	if (days === 1) return Desk.t('core.yesterday');
	const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
	return Desk.i18n.fmtDate(ms, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

const stamp = ms => Desk.h('time', { datetime: new Date(ms).toISOString(), text: when(ms) });

/* ---------- Banners ---------- */

function banner(opts) {
	const handle = Desk.notifyBanner({ app: cfg.app, timeout: cfg.hideMs, ...opts });
	if (handle) handles.add(handle);
}

function clear() {
	for (const handle of handles) {
		try {
			handle.close?.();
		} catch { /* already gone */ }
	}
	handles.clear();
}

async function check(banners = true) {
	const feed = currentFeed();
	if (!feed) return;
	const lang = Desk.lang();
	let items;
	try {
		items = await load(feed);
	} catch (err) {
		if (Desk.config.debug) console.warn(`[notify] feed '${feed.path}':`, err);
		return;
	}
	if (!items.length || lang !== Desk.lang()) return;
	const news = newsOf(items, readSeen()[feed.code]);
	if (!fresh.has(feed.code)) fresh.set(feed.code, new Set(news.map(x => x.path)));
	markSeen(feed.code, items[0].date);
	Desk.calendar?.redraw?.();
	if (!news.length) return;
	Desk.emit('notify:new', { items: news.map(x => ({ ...x })) });
	if (!banners || !enabled()) return;
	const { shown, more } = bannerPlan(news, cfg.maxBanners);
	shown.forEach((it, i) => setTimeout(() => banner({
		title: it.title, body: it.summary || null, url: it.path, date: it.date,
		run: () => openItem(it.path)
	}), i * 300));
	if (more) {
		setTimeout(() => banner({
			title: Desk.t(shown.length ? 'notify.more' : 'notify.newCount', { n: more }),
			run: () => openApp(news[0].path)
		}), shown.length * 300);
	}
}

function setEnabled(on) {
	Desk.store.setFlag(ON, on);
	if (!on) clear();
	Desk.settings?.redraw?.();
}

/* ---------- Calendar: the notification centre ---------- */

function section({ close }) {
	const feed = currentFeed();
	const items = feed ? feeds.get(feed.code) : null;
	if (!items?.length) return null;
	const { h, t } = Desk;
	const isNew = it => !!fresh.get(feed.code)?.has(it.path);
	return h('section', { class: 'cal-news', 'aria-labelledby': 'cal-news-title' },
		h('h3', { class: 'cal-sub', id: 'cal-news-title', text: t('notify.sectionTitle') }),
		h('ul', {}, items.slice(0, 3).map((it, i) => h('li', {},
			h('button', {
				type: 'button', class: 'cal-news-item', 'data-key': `news-${i}`, title: it.title,
				onclick: () => {
					close();
					openItem(it.path);
				}
			},
			h('span', { class: isNew(it) ? 'cal-news-dot is-new' : 'cal-news-dot', 'aria-hidden': 'true' }),
			h('span', { class: 'cal-news-name', text: it.title }),
			isNew(it) ? h('span', { class: 'visually-hidden', text: ` ${t('core.newMark')}` }) : null,
			stamp(it.date))))));
}

/* ---------- Settings → General ---------- */

/* Through the settings' helper (ctx), else the same markup by hand */
function toggleRow(ctx) {
	if (!hasFeeds()) return null;
	const { h, t } = Desk;
	if (typeof ctx?.toggle === 'function') {
		return ctx.toggle({ key: 'notify', label: t('notify.toggle'), hint: t('notify.toggleHint'), checked: enabled(), onChange: setEnabled });
	}
	const input = h('input', {
		type: 'checkbox', role: 'switch', class: 'switch', 'data-key': 'notify', checked: enabled(),
		onchange: () => setEnabled(input.checked)
	});
	return h('label', { class: 'set-row' },
		h('span', { class: 'set-label' }, t('notify.toggle'), h('small', { text: t('notify.toggleHint') })),
		input);
}

/* ---------- Descriptor ---------- */

export default {
	id: 'notify',
	kind: 'module',
	i18n: ['notify'],
	styles: ['notify.css'],

	storage: {
		notify: { type: 'text', backup: true, reset: 'settings', label: '@notify.toggle', validate: v => (v === 'on' || v === 'off' ? v : null) },
		feed: { type: 'json', backup: false, reset: 'session', label: '@notify.seenLabel', validate: cleanSeen }
	},

	configKey: 'notify',
	validateConfig(section, warn) {
		const out = section && typeof section === 'object' ? section : {};
		const list = {};
		if (out.feeds !== undefined && (out.feeds === null || typeof out.feeds !== 'object' || Array.isArray(out.feeds))) {
			warn('feeds must be an object { lang: path }');
		} else {
			for (const [lang, path] of Object.entries(out.feeds ?? {})) {
				if (LANG.test(lang) && isPath(path)) list[lang] = path;
				else warn(`feeds.${lang}: ${JSON.stringify(path)} skipped`);
			}
		}
		out.feeds = list;
		if (out.app !== null && !(typeof out.app === 'string' && ID.test(out.app))) {
			if (out.app !== undefined) warn(`app ${JSON.stringify(out.app)} is not an app id — the router decides instead`);
			out.app = null;
		}
		if (!(Number.isInteger(out.hideMs) && out.hideMs >= 1000)) {
			if (out.hideMs !== undefined) warn('hideMs must be a whole number ≥ 1000');
			out.hideMs = 9000;
		}
		if (!(Number.isInteger(out.maxBanners) && out.maxBanners >= 1 && out.maxBanners <= 10)) {
			if (out.maxBanners !== undefined) warn('maxBanners must be 1–10');
			out.maxBanners = 3;
		}
		if (out.pathPrefix !== null && out.pathPrefix !== undefined && !(isPath(out.pathPrefix) && !/^https?:/i.test(out.pathPrefix))) {
			warn(`pathPrefix ${JSON.stringify(out.pathPrefix)} must be a path — ignored`);
			out.pathPrefix = null;
		}
		out.pathPrefix ??= null;
		return out;
	},

	calendar: [{ id: 'notify', order: 20, render: section }],
	settings: [{ id: 'notify', section: 'general', order: 30, render: toggleRow }],

	setup(desk) {
		cfg = desk.modules.config('notify') ?? cfg;
		desk.provide('notify', Object.freeze({
			check: (banners = true) => check(banners),
			clear,
			enabled,
			setEnabled,
			items: () => [...(feeds.get(currentFeed()?.code) ?? [])].map(x => ({ ...x }))
		}));
		/* News after the boot screen, not on top of it */
		desk.on('desk:ready', () => setTimeout(() => check(true), 1800));
		desk.on('calendar:open', clear);
		/* Language switch: banners of the old language go, the new feed fills the calendar */
		desk.on('lang:change', () => {
			clear();
			check(false);
		});
	}
};
