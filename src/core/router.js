/* JPKCom Desktop — URLs: resolve, route, page app, open, launch — © Jean Pierre Kolb — MIT License

   Where does a link go?
     external origin          → new tab (noopener)
     same origin, routed      → an app window (config.site.routes, collection base paths)
     same origin, a file      → new tab (any extension except .html/.htm)
     same origin, a page      → the page app with the longest matching URL prefix (Reader),
                                else config.site.defaultPageApp, else a new tab
                                (never the desktop itself — its root, index.html — nor a
                                reserved folder such as config.vault.dir: pageAllowed())

   Absolute links to one of config.site.hosts count as same origin, so a site
   that links to its own live domain stays inside the desktop while testing.
   Nothing here knows any concrete site: every rule comes from the config and
   from the collections in site/apps.js. */

import { config } from './config.js';
import { ROOT } from './env.js';
import { registry } from './registry.js';
import { get as service } from './services.js';
import { h } from './dom.js';

const PATH_SEGMENT = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Creates a router (exported for tests).
 *   registry   the app registry
 *   site       { hosts, routes, defaultPageApp } (config.site)
 *   origin     location.origin of the page
 *   root       absolute URL of the installation folder (env.ROOT)
 *   reserved   folders that never open as a page (config.vault.dir): root-relative or root-absolute
 *   launch(id, opts), openTab(href)   side effects (injected)
 */
export function createRouter({ registry: reg, site, origin, root, reserved = [], launch = () => false, openTab = () => {} }) {
	const hosts = new Set((site.hosts ?? []).map(h => String(h).toLowerCase()));
	const rootPath = new URL(root).pathname;

	const abs = path => {
		try {
			return new URL(path, root).pathname;
		} catch {
			return null;
		}
	};
	const reservedDirs = (Array.isArray(reserved) ? reserved : [])
		.filter(d => typeof d === 'string' && d && !/^[a-z][a-z0-9+.-]*:|^\/\/|^\\/i.test(d))
		.map(d => abs(d.endsWith('/') ? d : `${d}/`))
		/* the root or a folder above it would shut out every page: ignored */
		.filter(d => d && !rootPath.startsWith(d));

	/**
	 * May this same-origin path open as a page in a page app? Never the desktop itself
	 * (the installation root, index.html) nor a reserved folder (the vault's sealed files).
	 */
	function pageAllowed(path) {
		if (typeof path !== 'string') return false;
		const p = path.split(/[?#]/)[0];
		if (p.startsWith(rootPath)) {
			const rest = p.slice(rootPath.length);
			if (rest === '' || /^index\.html?$/i.test(rest)) return false;
		} else if (`${p}/` === rootPath) {
			return false;
		}
		return !reservedDirs.some(d => p.startsWith(d) || `${p}/` === d);
	}

	/** Compiles config.site.routes once: { match: 'regex' | prefix: '/path/', app | tab | page } */
	const rules = (site.routes ?? []).flatMap((r, i) => {
		let test = null;
		try {
			if (typeof r?.match === 'string') {
				const re = new RegExp(r.match);
				test = p => re.test(p);
			} else if (typeof r?.prefix === 'string') {
				const pre = abs(r.prefix);
				test = p => pre !== null && p.startsWith(pre);
			}
		} catch (err) {
			console.warn(`[router] config.site.routes[${i}]: invalid pattern (${err.message}) — skipped`);
		}
		if (!test || !(r.app || r.tab || r.page)) {
			if (test) console.warn(`[router] config.site.routes[${i}] needs app, tab or page — skipped`);
			return [];
		}
		return [{ test, app: r.app ?? null, tab: r.tab === true, page: r.page === true }];
	});

	/** Absolute URL (or null); links to config.site.hosts are rewritten to this origin. */
	function resolveUrl(raw, base = root) {
		let url;
		try {
			url = new URL(raw, base);
		} catch {
			return null;
		}
		if (/^https?:$/.test(url.protocol) && url.origin !== origin && hosts.has(url.hostname.toLowerCase())) {
			url = new URL(url.pathname + url.search + url.hash, origin);
		}
		return url;
	}

	const isExternal = url => url.origin !== origin;

	/** The path of a same-origin URL relative to the installation folder, else null */
	const relPath = url => (url.origin === origin && url.pathname.startsWith(rootPath) ? url.pathname.slice(rootPath.length) : null);

	/** { app } | { tab: true } | { page: true } for a same-origin URL */
	function route(url) {
		const p = url.pathname;
		for (const r of rules) {
			if (!r.test(p)) continue;
			if (r.app && reg.has(r.app)) return { app: r.app };
			if (r.tab) return { tab: true };
			if (r.page) return { page: true };
		}
		for (const c of reg.collections()) {
			if (!c.basePath) continue;
			const base = abs(c.basePath.endsWith('/') ? c.basePath : `${c.basePath}/`);
			if (!base) continue;
			const bare = base.replace(/\/$/, '');
			if (p === bare || p === base) {
				if (c.app && reg.has(c.app)) return { app: c.app };
				continue;
			}
			if (!p.startsWith(base)) continue;
			const slug = p.slice(base.length).replace(/\/(index\.html?)?$/, '');
			if (PATH_SEGMENT.test(slug) && reg.has(`${c.prefix}-${slug}`)) return { app: `${c.prefix}-${slug}` };
		}
		if (/\.[a-z0-9]{2,5}$/i.test(p) && !/\.html?$/i.test(p)) return { tab: true };
		return { page: true };
	}

	/**
	 * The page app (kind 'page') whose URL is the longest prefix of path; else the
	 * default page app; else null. Only apps that can open now count (no Reader → none);
	 * a path that may not open as a page (pageAllowed) has none.
	 */
	function pageApp(path) {
		if (!pageAllowed(path)) return null;
		let best = null;
		let len = 0;
		for (const app of reg.list({ hidden: true, kinds: ['page'] })) {
			const urls = typeof app.url === 'string' ? [app.url] : Object.values(app.url ?? {});
			for (const u of urls) {
				const p = abs(u);
				if (p && path.startsWith(p) && p.length > len) {
					best = app;
					len = p.length;
				}
			}
		}
		if (best) return best;
		const fallback = site.defaultPageApp ? reg.get(site.defaultPageApp) : null;
		return fallback?.kind === 'page' && reg.available(fallback) ? fallback : null;
	}

	/**
	 * Opens any link the way the desktop would. false when it is not an http(s)
	 * link. A route or page app that cannot open now (its module is missing)
	 * falls back to a new tab, so a link never goes nowhere.
	 */
	function openUrl(raw, base = root) {
		const url = resolveUrl(raw, base);
		if (!url || !/^https?:$/.test(url.protocol)) return false;
		if (isExternal(url)) {
			openTab(url.href);
			return true;
		}
		const r = route(url);
		if (r.app && launch(r.app) !== false) return true;
		if (!r.tab && !r.app) {
			const app = pageApp(url.pathname);
			if (app && launch(app.id, { url: url.pathname + url.search + url.hash }) !== false) return true;
		}
		openTab(url.href);
		return true;
	}

	const rel = p => (typeof p === 'string' && p.startsWith(rootPath) ? p.slice(rootPath.length) : null);

	/**
	 * May a stored or linked same-origin path open in a window whose start page is
	 * start (absolute URL)? It must lie inside the app's folder, relative to the
	 * installation root: scope (a root-relative folder such as 'demos/clock/'),
	 * by default the start page's first folder below the root. The desktop
	 * itself (the root, index.html) never qualifies. Returns the normalised path
	 * (+ query and hash) or null. Used by the 'web' window kind (session, deep links).
	 */
	function acceptPath(start, path, scope = null) {
		if (typeof path !== 'string' || path.length > 500 || !/^\/(?!\/)/.test(path)) return null;
		let s;
		let u;
		try {
			s = new URL(start, root);
			u = new URL(path, origin);
		} catch {
			return null;
		}
		if (s.origin !== origin || u.origin !== origin) return null;
		const target = rel(u.pathname);
		if (target == null || target === '' || /^index\.html?$/i.test(target)) return null;
		let folder;
		if (typeof scope === 'string' && scope && !/^[a-z][a-z0-9+.-]*:|^\/|^\\/i.test(scope)) {
			folder = rel(new URL(scope.endsWith('/') ? scope : `${scope}/`, root).pathname);
		} else {
			const top = rel(s.pathname)?.split('/')[0];
			folder = top && !/^index\.html?$/i.test(top) ? (rel(s.pathname).includes('/') ? `${top}/` : top) : null;
		}
		if (!folder) return null;
		const inside = folder.endsWith('/') ? target.startsWith(folder) || `${target}/` === folder : target === folder;
		return inside ? u.pathname + u.search + u.hash : null;
	}

	return Object.freeze({ resolveUrl, isExternal, relPath, route, pageApp, pageAllowed, openUrl, acceptPath });
}

/* ---------- The desktop's instance ---------- */

const openTab = href => window.open(href, '_blank', 'noopener');

/**
 * Launches an app by id: the "All apps" launcher toggles, links open in a new
 * tab, aliases launch their target, everything else opens a window through
 * the window manager. Returns false when the app is unknown or unavailable.
 */
export function launch(id, opts = {}) {
	const app = registry.get(id);
	if (!app) {
		if (config.debug) console.warn(`[router] launch: unknown app '${id}'`);
		return false;
	}
	if (app.alias) return launch(app.alias, opts);
	if (!registry.available(app)) return false;
	if (app.kind === 'launcher') {
		service('launcher')?.toggle?.();
		return true;
	}
	service('launcher')?.close?.();
	if (app.kind === 'link') {
		openTab(registry.url(app));
		return true;
	}
	const wm = service('wm');
	if (!wm) {
		console.warn(`[router] launch('${id}'): no window manager loaded`);
		return false;
	}
	return !!wm.open(app, opts);
}

export const router = createRouter({
	registry,
	site: config.site,
	origin: typeof location !== 'undefined' ? location.origin : new URL(ROOT).origin,
	root: ROOT,
	reserved: [config.vault?.dir],
	launch,
	openTab
});

export const { resolveUrl, route, pageApp, pageAllowed, openUrl, acceptPath } = router;

/**
 * Downloads a file through a temporary <a download>. Only http(s) URLs (resolved
 * against the installation root) and blob: URLs of this page are used — never
 * javascript:, data: or anything else a value from data could turn into.
 * Returns true when the download was started.
 */
export function download(url, fileName = String(url).split(/[?#]/)[0].split('/').pop() || 'download') {
	let target;
	try {
		target = url instanceof URL ? url : new URL(String(url), ROOT);
	} catch {
		target = null;
	}
	const pageOrigin = typeof location !== 'undefined' ? location.origin : new URL(ROOT).origin;
	if (!target || !(/^https?:$/.test(target.protocol) || (target.protocol === 'blob:' && target.origin === pageOrigin))) {
		console.warn(`[router] download(): refused ${String(url).slice(0, 80)} — only http(s) and this page's blob: URLs`);
		return false;
	}
	const a = h('a', { href: target.href, download: String(fileName || 'download'), hidden: true });
	document.body.append(a);
	a.click();
	a.remove();
	return true;
}
