/* JPKCom Desktop — the public Desk API — © Jean Pierre Kolb — MIT License

   One frozen object for modules, apps and outside scripts. ES modules import
   it (import Desk from '../../core/api.js'), classic scripts read
   window.JPKDesk (the same object, exposed by boot/main.js). Its shape is the
   contract in docs/ARCHITECTURE.md → "Public Desk API"; additions are fine,
   changes to existing members are breaking changes.

   Services that optional parts provide (window manager, menus, search, …)
   appear as live getters: Desk.wm, Desk.search, … are null while nobody
   provides them, so callers write Desk.search?.open('x'). */

import { VERSION, PROJECT, ROOT, asset, isCompact, reduceMotion, isStandalone, isSecure, hasCmdKey, later, clamp } from './env.js';
import { config } from './config.js';
import { bus, on, off, once, emit } from './bus.js';
import { store, V } from './store.js';
import { i18n, t, L } from './i18n.js';
import { h, s, $, $$, clear, abbr, editable, focusable, trapFocus, markLang, foreignLang, langText, cssEscape, debounce, saveFile, copyText } from './dom.js';
import { fold } from './text.js';
import { isSafeUrl, safeUrl } from './url.js';
import { dialog } from './dialog.js';
import { icon, hasIcon, addIcons, symbolHref, logo, addLogo, brandGlyph, tile, appGlyph, tintValue } from './icons.js';
import { announce } from './a11y.js';
import { registry, IMAGE_EXT, initials } from './registry.js';
import { router, launch, openUrl, download } from './router.js';
import { net } from './net.js';
import { consent } from './consent.js';
import { storage } from './storage-registry.js';
import { modules } from './modules.js';
import { services, get as service } from './services.js';

/** Service names with a getter on Desk (Desk.<name> → the provided object or null) */
export const SERVICE_NAMES = Object.freeze([
	'wm', 'snap', 'overview', 'session',
	'menus', 'menubar', 'dock', 'launcher', 'desktop', 'shortcuts', 'contextmenu', 'notifications', 'power', 'deeplinks', 'drop', 'clock', 'langmenu',
	'settings', 'wallpaper', 'backup', 'trash', 'about', 'help', 'install',
	'reader', 'viewer', 'catalog', 'search', 'calendar', 'holidays', 'weather', 'notify', 'vault',
	'terminal', 'media', 'fortune'
]);

const Desk = {
	version: VERSION,
	project: PROJECT,
	config,

	/* Events */
	bus, on, off, once, emit,

	/* Environment */
	env: Object.freeze({ root: ROOT, asset, isCompact, reduceMotion, isStandalone, isSecure, hasCmdKey, later, clamp }),
	isCompact,
	reduceMotion,

	/* Language */
	i18n,
	t,
	L,
	lang: () => i18n.lang(),

	/* DOM, icons, accessibility */
	h,
	s,
	dom: Object.freeze({ h, s, $, $$, clear, abbr, editable, focusable, trapFocus, markLang, foreignLang, langText, cssEscape, debounce, saveFile, copyText }),
	/** Text matching: fold(text, locale) — lower case, no diacritics, ß → ss (core/text.js) */
	text: Object.freeze({ fold }),
	icon,
	tile,
	icons: Object.freeze({ icon, has: hasIcon, add: addIcons, symbolHref, logo, addLogo, brandGlyph, tile, appGlyph, tintValue }),
	announce,
	/** Question sheets: sheet(within, opts) → id | null, confirm(within, opts) → boolean, alert(within, opts) */
	dialog,

	/* Storage */
	store,
	V,
	storage,

	/* Apps, collections, URLs */
	apps: registry,
	IMAGE_EXT,
	initials,
	router,
	launch,
	openUrl,
	download,
	/** URLs from data: isSafe(raw) (cheap string check), safe(raw, base, origin) → URL | null (core/url.js) */
	url: Object.freeze({ isSafe: isSafeUrl, safe: safeUrl }),

	/* Network and consent */
	net,
	consent,

	/* Modules and services */
	modules,
	services,
	provide: services.provide,
	service,

	/* Shortcuts into services (null-safe; no-ops while the service is missing) */

	/** Names of the open windows, bottom to top (z-order) */
	windows: () => (service('wm')?.stack?.() ?? []).map(w => registry.name(w.app)),
	/** Closes a window */
	close: win => service('wm')?.close?.(win),
	/** Opens the search with a query */
	searchFor: q => service('search')?.open?.(q),
	/** Opens the settings at a section */
	showSettings: section => service('settings')?.show?.(section),
	/** Puts an item into the trash: trash type (declared in a descriptor), title, data */
	toTrash: (type, title, data) => service('trash')?.add?.(type, title, data) ?? false,
	/** Shows a banner notification: { title, body, icon, app, url, timeout } */
	notifyBanner: opts => service('notifications')?.show?.(opts) ?? null,
	/** Asks the menus to rebuild (app names, window list) */
	refreshMenus: () => emit('menus:refresh', {})
};

for (const name of SERVICE_NAMES) {
	if (Object.hasOwn(Desk, name)) throw new Error(`Desk.${name} would shadow a service getter`);
	Object.defineProperty(Desk, name, { get: () => service(name), enumerable: true });
}

Object.freeze(Desk);

/** Publishes the API as window.JPKDesk (boot/main.js calls this once). */
export function expose() {
	if (typeof window !== 'undefined' && !('JPKDesk' in window)) {
		Object.defineProperty(window, 'JPKDesk', { value: Desk, writable: false, configurable: false, enumerable: false });
	}
}

export default Desk;
