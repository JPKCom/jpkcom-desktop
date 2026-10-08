/* JPKCom Desktop — Reader: the page window (loaded with the first one) — © Jean Pierre Kolb — MIT License

   The hooks of window kind 'page' apart from acceptUrl (index.js keeps that:
   session restore and deep links ask it before any window exists). Fetches a
   page, extracts and sanitises it (extract.js, sanitize.js) and keeps the
   window's own back/forward history; win.state.reader is the window's state.
   index.js defines the kind with load: () => import('./kind.js') and holds
   the configuration (shared: rules, title separator, page cache). */

import Desk from '../../core/api.js';
import { h } from '../../core/dom.js';
import { createHistory, pushEntry, moveEntry, canBack, canForward, pickAlternate, readText } from './util.js';
import { extract } from './extract.js';
import { shared, resolve, root, sameOrigin, appHref } from './index.js';

const MAX_HTML = 5 * 1024 * 1024;
const TIMEOUT = 15000;

let uid = 0;

const t = (key, params) => Desk.t(key, params);
const noHash = href => href.replace(/#.*$/, '');

/* ---------- Fetching ---------- */

async function fetchPage(href) {
	const hit = shared.cache.get(href);
	if (hit) return hit;
	const until = Date.now() + TIMEOUT;
	const res = await Desk.net.request(href, { accept: 'text/html', timeout: TIMEOUT });
	const type = res.headers.get('content-type') || '';
	if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
		res.body?.cancel().catch(() => {});
		throw new Error(`not an HTML page (${type || 'no type'})`);
	}
	/* The body under the rest of the same deadline and within MAX_HTML bytes */
	const html = await readText(res, { maxBytes: MAX_HTML, timeout: until - Date.now() });
	const page = { html, url: res.url || href };
	shared.cache.set(href, page);
	return page;
}

/* ---------- Window state ---------- */

const R = win => win.state.reader;

function updateNav(win) {
	const r = R(win);
	r.back.disabled = !canBack(r.hist);
	r.fwd.disabled = !canForward(r.hist);
}

function errorNotice(win) {
	return h('div', { class: 'panel notice reader-error' },
		Desk.tile(win.app),
		h('h3', { text: t('reader.pageError') }),
		h('p', { text: t('reader.pageErrorText') }),
		h('button', { type: 'button', class: 'btn', text: t('core.openTab'), onclick: () => popOut(win) }));
}

/**
 * Loads a page. mode: 'push' (new history entry), 'history' (back/forward,
 * restored scroll) or 'reload' (bypasses the cache).
 */
async function load(win, href, mode = 'push') {
	const r = R(win);
	if (!r || r.closed) return;
	const target = resolve(href, r.url ?? root());
	if (!target) return;
	const hash = target.hash;
	target.hash = '';

	/* go() already stored the scroll position for back/forward */
	if (r.hist.idx >= 0 && mode !== 'history' && r.loader.classList.contains('is-done')) {
		r.hist.list[r.hist.idx].scroll = Math.round(r.scroller.scrollTop);
	}
	if (mode === 'push') pushEntry(r.hist, target.href, 0);
	if (mode === 'reload') shared.cache.delete(target.href);
	updateNav(win);

	const token = ++r.token;
	r.loader.classList.remove('is-done');

	let page;
	try {
		if (!sameOrigin(target)) throw new Error('only pages of this site open in the Reader');
		const hit = await fetchPage(target.href);
		if (token !== r.token || r.closed) return;
		page = extract(hit.html, hit.url, { rules: shared.rules, separator: shared.separator, prefix: r.prefix, origin: location.origin, resolve });
		r.url = hit.url;
		r.hist.list[r.hist.idx].url = hit.url;
	} catch (err) {
		if (token !== r.token || r.closed) return;
		if (Desk.config.debug) console.warn(`[reader] ${target.href}:`, err);
		r.url = target.href;
		r.alternates = {};
		r.title = null;
		r.titleLang = null;
		r.failed = true;
		r.scroller.replaceChildren(errorNotice(win));
		win.setTitle(null);
		r.loader.classList.add('is-done');
		win.changed('location');
		return;
	}

	r.failed = false;
	r.alternates = page.alternates;
	r.title = page.title || null;
	r.titleLang = page.lang || null;
	r.scroller.replaceChildren(page.node);
	win.setTitle(r.title, r.titleLang);
	r.loader.classList.add('is-done');

	const anchor = hash && document.getElementById(r.prefix + safeDecode(hash.slice(1)));
	if (anchor && r.scroller.contains(anchor)) scrollToEl(win, anchor, false);
	else r.scroller.scrollTop = mode === 'push' ? 0 : r.hist.list[r.hist.idx]?.scroll ?? 0;
	if (mode === 'push' && r.hist.list.length > 1) r.scroller.focus({ preventScroll: true });
	win.changed('location');
}

function safeDecode(s) {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

function go(win, delta) {
	const r = R(win);
	if (r.hist.idx < 0) return;
	if (r.loader.classList.contains('is-done')) r.hist.list[r.hist.idx].scroll = Math.round(r.scroller.scrollTop);
	const entry = moveEntry(r.hist, delta);
	if (entry) load(win, entry.url, 'history');
}

function reload(win) {
	const r = R(win);
	if (r?.hist.idx >= 0) load(win, r.hist.list[r.hist.idx].url, 'reload');
}

function popOut(win) {
	const href = R(win)?.url || appHref(win.app);
	if (href) window.open(href, '_blank', 'noopener');
}

/* scrollIntoView() would also scroll the page behind the desktop — scroll the reader only */
function scrollToEl(win, el, smooth) {
	const sc = R(win).scroller;
	const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12;
	sc.scrollTo({ top, behavior: smooth && !Desk.reduceMotion() ? 'smooth' : 'auto' });
}

function scrollToId(win, id) {
	const el = document.getElementById(id);
	if (el && R(win).scroller.contains(el)) scrollToEl(win, el, true);
}

/* Links: in-page anchors scroll, same-origin pages load here, apps open their
   window, files and other origins open a new tab (Desk.openUrl) */
function onClick(win, e) {
	const a = e.target.closest?.('a[href]');
	if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
	const r = R(win);
	const raw = a.getAttribute('href');
	if (raw.startsWith('#')) {
		e.preventDefault();
		scrollToId(win, safeDecode(raw.slice(1)));
		return;
	}
	const url = resolve(raw, r.url ?? root());
	if (!url || !/^https?:$/.test(url.protocol)) return;   // mailto:, tel: — the browser handles them
	e.preventDefault();
	if (!sameOrigin(url)) {
		Desk.openUrl(url.href);
		return;
	}
	if (r.url) {
		const here = new URL(r.url);
		if (url.pathname === here.pathname && url.search === here.search && url.hash) {
			scrollToId(win, r.prefix + safeDecode(url.hash.slice(1)));
			return;
		}
	}
	const route = Desk.router.route(url);
	if (route.page) load(win, url.href);
	else Desk.openUrl(url.href);
}

/* ---------- The window kind ---------- */

function relabelButtons(win) {
	const r = R(win);
	for (const [btn, key] of [[r.back, 'core.back'], [r.fwd, 'core.forward'], [r.reloadBtn, 'core.reload'], [r.tabBtn, 'core.openTab']]) {
		btn.setAttribute('aria-label', t(key));
		btn.title = t(key);
	}
	r.loader.setAttribute('aria-label', t('core.loading'));
}

export default {
	mount(win, body, bar, opts = {}) {
		const r = {
			hist: createHistory(),
			token: 0,
			prefix: `r${++uid}-`,
			url: null,
			alternates: {},
			failed: false,
			title: null,
			closed: false,
			start: typeof opts.url === 'string' && opts.url ? opts.url : Desk.apps.url(win.app),
			startHref: appHref(win.app),
			scroll: Number.isFinite(opts.scroll) && opts.scroll > 0 ? opts.scroll : 0
		};
		win.state.reader = r;

		r.back = win.button({ icon: 'ti-chevron-left', label: t('core.back'), cls: 'reader-back', disabled: true, onClick: () => go(win, -1) });
		r.fwd = win.button({ icon: 'ti-chevron-right', label: t('core.forward'), cls: 'reader-fwd', disabled: true, onClick: () => go(win, 1) });
		bar.insertBefore(h('div', { class: 'win-nav' }, r.back, r.fwd), win.titleEl);
		r.reloadBtn = win.button({ icon: 'ti-refresh', label: t('core.reload'), onClick: () => reload(win) });
		r.tabBtn = win.button({ icon: 'ti-external-link', label: t('core.openTab'), onClick: () => popOut(win) });
		win.addActions(r.reloadBtn, r.tabBtn);

		r.scroller = h('div', { class: 'reader', tabindex: '0', 'aria-labelledby': win.titleEl.id });
		r.loader = h('div', { class: 'win-loading', role: 'status', 'aria-label': t('core.loading') });
		body.append(r.scroller, r.loader);
		r.scroller.addEventListener('click', e => onClick(win, e));

		/* After restore() (it runs right after mount): a restored window returns to
		   its scroll position, as back/forward does */
		queueMicrotask(() => {
			if (r.closed) return;
			const start = resolve(r.start, root());
			if (r.scroll > 0 && start) {
				pushEntry(r.hist, noHash(start.href), r.scroll);
				load(win, start.href, 'history');
			} else {
				load(win, r.start);
			}
		});
	},

	restore(win, state) {
		const r = R(win);
		const scroll = Desk.V.num(state?.scroll, 0, 1e7);
		if (r && scroll != null && r.hist.idx < 0) r.scroll = scroll;
	},

	serialize(win) {
		const r = R(win);
		if (!r) return null;
		/* Still loading (e.g. right after a restore): keep the position it is heading for */
		const scroll = r.loader.classList.contains('is-done') ? r.scroller.scrollTop : r.hist.list[r.hist.idx]?.scroll ?? r.scroll;
		return { scroll: Math.round(scroll || 0) };
	},

	reopen(win, opts) {
		if (typeof opts?.url === 'string' && opts.url) load(win, opts.url);
	},

	/* Language switch: the page's alternate in the new language; else, while the
	   app's start page is shown, the app's URL for that language */
	relabel(win) {
		const r = R(win);
		relabelButtons(win);
		const alt = pickAlternate(r.alternates, Desk.lang());
		const next = appHref(win.app);
		const prevStart = r.startHref;
		r.startHref = next;
		if (alt && noHash(alt) !== noHash(r.url ?? '')) {
			load(win, alt);
		} else if (next && prevStart && next !== prevStart && (!r.url || noHash(r.url) === noHash(prevStart))) {
			load(win, next);
		} else {
			if (r.failed) r.scroller.replaceChildren(errorNotice(win));
			/* No page title (none found, still loading, an error): the app's name in the new language */
			win.setTitle(r.title, r.titleLang);
		}
	},

	unmount(win) {
		const r = R(win);
		if (!r) return;
		r.closed = true;
		r.token++;
	},

	reload,
	popOut,
	locationOf: win => R(win)?.hist.list[R(win).hist.idx]?.url ?? null,

	menu(win) {
		const r = R(win);
		return [
			{ label: t('core.back'), disabled: !canBack(r.hist), run: () => go(win, -1) },
			{ label: t('core.forward'), disabled: !canForward(r.hist), run: () => go(win, 1) },
			'-',
			{ label: t('core.reload'), run: () => reload(win) },
			{ label: t('core.openTab'), run: () => popOut(win) }
		];
	}
};
