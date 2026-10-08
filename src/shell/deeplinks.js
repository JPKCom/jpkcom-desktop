/* JPKCom Desktop — deep links: the address bar shows the active window — © Jean Pierre Kolb — MIT License

   index.html#/<path>     opens a same-origin page the desktop way (router.openUrl:
                          a routed app, the Reader, or a new tab for files); the
                          desktop itself (root, index.html) and reserved folders
                          (config.vault.dir) are ignored (router.pageAllowed), so are
                          paths that cannot be pages ('/blob:…', '/data:…', '/../…')
   index.html#app=<id>    opens an app (not links: popups nobody asked for)
   index.html#search=<q>  opens the search with a query (when a search module is loaded)

   The address bar always shows the active window; every new window is a
   history entry, so Back closes it (and Forward opens it again). The entry
   itself carries what it opened ({ desk: position, id, hash }), so this also
   works after a reload. Windows the session restored add no entries; a link
   in the address wins and opens on top of them ('desk:ready' runs the session
   first, then this). */

import { config } from '../core/config.js';
import { on } from '../core/bus.js';
import { registry } from '../core/registry.js';
import { launch, router } from '../core/router.js';
import { get as service } from '../core/services.js';

/**
 * What a hash asks for (pure, exported for tests):
 *   { path: '/x/' } | { app: 'id' } | { search: 'text' } | null
 */
export function parseHash(hash) {
	let raw = String(hash ?? '').replace(/^#/, '');
	if (!raw || raw.length > 2000) return null;
	try {
		raw = decodeURIComponent(raw);
	} catch {
		return null;
	}
	/* URL parsers read a backslash as '/' and drop tabs and newlines: '/\host' and '/<TAB>/host'
	   would lead to another site. Hash data is untrusted (ARCHITECTURE §5). A page of this site
	   has no scheme-like first segment ('/blob:…', '/data:…') and no dot segments ('/../x',
	   also '%2e' — URL parsers read it as a dot): such links are dropped, not opened as an
	   unavailable page. */
	if (/^\/(?!\/)/.test(raw)) {
		if (/[\\\u0000-\u001f\u007f]/.test(raw) || /^\/[^/?#]*:/.test(raw)) return null;
		if (/\/(?:\.|%2e){1,2}(?=[/?#]|$)/i.test(raw)) return null;
		return { path: raw };
	}
	if (raw.startsWith('app=')) {
		const id = raw.slice(4);
		return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? { app: id } : null;
	}
	if (raw.startsWith('search=')) return { search: raw.slice(7, 207) };
	return null;
}

let quiet = false;     // windows opened or closed by the history itself add no entries
let started = false;   // nothing is written before 'desk:ready' (the session restores first)
let current = null;    // the state of the entry we are on

const base = () => location.pathname + location.search;
const wm = () => service('wm');

/** The shortest way back to what a window shows: '#/path', '#app=id' or '' (dropped files). */
export function hashFor(win) {
	if (!win || win.app.transient) return '';
	const path = wm()?.locationOf?.(win) ?? null;
	if (path) {
		/* A page window: its page; another window: only if the path leads back to this very app */
		if (win.kind === 'page') return `#${path}`;
		try {
			if (router.route(new URL(path, location.origin)).app === win.app.id) return `#${path}`;
		} catch { /* not a URL */ }
	}
	return `#app=${encodeURIComponent(win.app.id)}`;
}

/** Opens what a hash asks for. */
export function openHash(hash) {
	const want = parseHash(hash);
	if (!want) return;
	if (want.path) {
		/* Second guard: a deep link only ever opens something of this site */
		const url = router.resolveUrl(want.path);
		if (!url || router.isExternal(url)) return;
		/* Never the desktop itself (#/index.html) or a reserved folder (#/site/vault/…): ignored silently */
		if (!router.route(url).app && !router.pageAllowed(url.pathname)) return;
		router.openUrl(url.href);
	} else if (want.app) {
		const app = registry.get(want.app);
		if (app && app.kind !== 'launcher' && app.kind !== 'link' && registry.available(app)) launch(app.id);
	} else if (want.search != null) {
		service('search')?.open?.(want.search);
	}
}

function write(method, state, hash) {
	try {
		history[method](state, '', base() + hash);
	} catch { /* Safari: too many calls in a row */ }
	current = history.state;
}

const same = (a, b) => {
	try {
		return decodeURIComponent(a) === decodeURIComponent(b);
	} catch {
		return a === b;
	}
};

/* Address bar = active window; the entry keeps its place in the history */
function sync() {
	if (!started) return;
	const win = wm()?.active?.() ?? null;
	const hash = win ? hashFor(win) : '';
	if (!same(location.hash, hash)) write('replaceState', { ...current, hash }, hash);
}

/** An absolute link to a window — config.site.origin when the site sets its public origin. */
export function linkFor(win) {
	let origin = location.origin;
	if (typeof config.site.origin === 'string' && /^https?:\/\/[^/\s]+$/i.test(config.site.origin.replace(/\/$/, ''))) {
		origin = config.site.origin.replace(/\/$/, '');
	}
	return new URL(base() + hashFor(win), origin).href;
}

function onPop(e) {
	const to = e.state;
	quiet = true;
	try {
		if (!Number.isInteger(to?.desk)) {
			/* A link typed into the address bar: open it and give the entry a place */
			openHash(location.hash);
			write('replaceState', { desk: (current?.desk ?? 0) + 1, id: wm()?.active?.()?.app.id ?? null, hash: location.hash }, location.hash);
		} else if (current && to.desk < current.desk) {
			/* Back: the window this entry opened closes */
			const win = current.id ? wm()?.get?.(current.id) : null;
			if (win) wm().close(win);
			current = to;
		} else if (current && to.desk > current.desk) {
			/* Forward: it opens again */
			openHash(to.hash);
			current = to;
		} else {
			current = to;
		}
	} finally {
		quiet = false;
	}
	sync();
}

/** After the session came back: a link in the address wins and comes to the front. */
export function start() {
	if (started) return;
	const had = history.state;
	quiet = true;
	try {
		if (location.hash) openHash(location.hash);
	} finally {
		quiet = false;
	}
	started = true;
	current = Number.isInteger(had?.desk) ? had : { desk: 0, id: null, hash: '' };
	write('replaceState', current, location.hash);
	sync();
}

export function initDeeplinks() {
	on('window:open', ({ win, restore } = {}) => {
		if (!started || quiet) return;
		if (restore || !win) {
			sync();
			return;
		}
		/* Dropped files get an entry too (no hash): Back closes them */
		const hash = hashFor(win);
		write('pushState', { desk: (current?.desk ?? 0) + 1, id: win.app.id, hash }, hash);
	});
	/* 'window:ready': a window whose code loaded later knows its location only now */
	for (const name of ['window:focus', 'window:change', 'window:ready', 'window:close', 'window:minimize']) {
		on(name, () => { if (!quiet) sync(); });
	}
	addEventListener('popstate', onPop);
	return Object.freeze({ linkFor, hashFor, open: openHash, start, parse: parseHash });
}
