/* JPKCom Desktop — Reader: content pages rendered natively (window kind 'page') — © Jean Pierre Kolb — MIT License

   A page app (kind 'page') shows same-origin HTML pages without an iframe:
   fetch (Accept: text/html) → DOMParser (inert) → the content region by
   config.reader.rules → allowlist sanitiser → imported node by node
   (extract.js, sanitize.js). Every window keeps its own back/forward history
   with scroll positions; a language switch follows the page's hreflang
   alternate (or the app's URL for the new language while the start page is
   shown); links route like everywhere else on the desktop: same-origin pages
   load in this window, apps open their window, files and other origins a new
   tab. Fetched pages are kept in a small LRU cache (config.reader.cacheSize).

   Service 'reader': open(url) → boolean — opens a same-origin page in the
   page app with the longest matching URL prefix (router.pageApp).

   This file is the descriptor (configuration, acceptUrl, the service); the
   window is kind.js, loaded with the first page window (defineKind load). */

import Desk from '../../core/api.js';
import { validateReaderConfig, compileRules, createLru, DEFAULT_SEPARATOR, DEFAULT_CACHE } from './util.js';

/* The configuration the window code (kind.js) reads: compiled rules, title separator, page cache */
export const shared = { rules: [], separator: DEFAULT_SEPARATOR, cache: createLru(DEFAULT_CACHE) };

export const root = () => Desk.env.root;
export const resolve = (raw, base) => Desk.router.resolveUrl(raw, base);
export const sameOrigin = url => !!url && /^https?:$/.test(url.protocol) && url.origin === location.origin;
export const appHref = app => resolve(Desk.apps.url(app), root())?.href ?? null;

/* ---------- The window kind ---------- */

/* The window code comes with the first page window (kind.js). acceptUrl stays here: session
   restore and deep links ask it before any window exists */
const pageKind = {
	load: () => import('./kind.js'),

	/* A stored or linked path may open in a page app when it routes to the Reader
	   (not an app, not a file) — never the desktop itself nor a reserved folder (router.pageAllowed) */
	acceptUrl(app, path) {
		const url = resolve(path, location.origin);
		if (!sameOrigin(url)) return null;
		const rel = Desk.router.relPath(url);
		if (rel === '' || /^index\.html?$/i.test(rel ?? '') || !Desk.router.pageAllowed(url.pathname)) return null;
		return Desk.router.route(url).page ? url.pathname + url.search + url.hash : null;
	}
};

/* ---------- Service ---------- */

/** Opens a same-origin page in the page app with the longest matching URL prefix. */
function open(raw) {
	const url = resolve(raw, root());
	if (!sameOrigin(url)) return false;
	const app = Desk.router.pageApp(url.pathname);
	return app ? Desk.launch(app.id, { url: url.pathname + url.search + url.hash }) !== false : false;
}

export default {
	id: 'reader',
	kind: 'module',
	requires: ['wm'],
	i18n: ['reader'],
	windowStyles: ['reader.css'],
	configKey: 'reader',

	validateConfig(section, warn) {
		const probe = typeof document !== 'undefined' ? document.createDocumentFragment() : null;
		return validateReaderConfig(section, warn, probe ? sel => (probe.querySelector(sel), true) : null);
	},

	setup(desk) {
		const cfg = desk.modules.config('reader') ?? validateReaderConfig(desk.config.reader);
		shared.rules = compileRules(cfg.rules, desk.env.root);
		shared.separator = cfg.titleSeparator;
		shared.cache = createLru(cfg.cacheSize);
		desk.wm.defineKind('page', pageKind);
		desk.provide('reader', Object.freeze({ open }));
	}
};
