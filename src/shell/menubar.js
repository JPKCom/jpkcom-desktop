/* JPKCom Desktop — menu bar model: brand, app, site, Window and Help menus; the status area — © Jean Pierre Kolb — MIT License

   WHICH menus the bar shows (the engine in menus.js runs them):

     brand   the brand glyph (config.brand.glyph): About this desktop, Settings,
             Wallpaper, Backup, the site's home page and legal pages, Restart,
             Shut down. Hosts the folded menus on phones — first, as submenus
             above About this desktop (as in the original; menus.js host).
     app     the active window's app name: "Copy link to this window", then
             the window's own items (wm.menu.app: the kind's menu + Quit)
     site    one menu per entry of site/apps.js menus[]:
               { id?, label: text, items: [appId | '-' | { collection: id }
                                           | { label, url } | { label, items: [...] }] }
     window  the Window menu of the window manager (wm.menu.window)
     help    How it works, the author's profiles (config.author.links)

   Entries of apps that cannot open now (module missing) are left out, so a
   menu never offers something that does nothing.

   The status area (#mb-status) on the right holds buttons of several parts
   in a fixed order — menubar.addStatus(el, order): search 10, language 80,
   weather 85, clock 90 (lower = further left in left-to-right languages; the
   weather sits right before the clock, both open the calendar side by side). */

import { config } from '../core/config.js';
import { ROOT, isCompact } from '../core/env.js';
import { on } from '../core/bus.js';
import { t, L, i18n } from '../core/i18n.js';
import { brandGlyph } from '../core/icons.js';
import { registry } from '../core/registry.js';
import { launch } from '../core/router.js';
import { h, copyText, foreignLang, langText, markLang } from '../core/dom.js';
import { confirm } from '../core/dialog.js';
import { get as service } from '../core/services.js';
import { V } from '../core/store.js';
import { register, update, render as renderMenus } from './menus.js';

const ID = /^[a-z][a-z0-9-]{0,31}$/;
const { isObj } = V;
const isText = v => (typeof v === 'string' && v.length > 0) || (isObj(v) && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));
/* A site text as a menu item label: { label, lang } — lang when it fell back to another language */
const labelOf = v => {
	const r = i18n.resolve(v);
	return { label: r.text, lang: foreignLang(r.lang) };
};
/* An app's name for the bar: a string, or a <span lang> when it fell back to another language */
const nameNode = app => {
	const lang = foreignLang(registry.nameLang(app));
	return lang ? markLang(h('span', { text: registry.name(app) }), lang) : registry.name(app);
};
const isUrl = v => (typeof v === 'string' && v.length > 0 && v.length < 2000) || (isObj(v) && Object.values(v).every(x => typeof x === 'string' && x.length < 2000));

/**
 * Cleans site/apps.js menus[] (pure, exported for tests): every menu needs a
 * label and items; items are app ids, '-', { collection }, { label, url } or
 * { label, items } (one level of submenus). A grouped { collection } inside a
 * submenu is accepted — siteEntries() lists its groups flat there, since the
 * engine opens one submenu level. Invalid entries are reported and skipped.
 * Returns [{ id, label, items }].
 */
export function cleanSiteMenus(raw, warn = console.warn) {
	if (raw == null) return [];
	if (!Array.isArray(raw)) {
		warn('[menubar] site data: menus must be an array — ignored');
		return [];
	}
	const used = new Set();
	const item = (x, where, depth) => {
		if (x === '-') return '-';
		if (typeof x === 'string') return /^[a-z0-9][a-z0-9-]{0,63}$/.test(x) ? x : null;
		if (!isObj(x)) return null;
		if (typeof x.collection === 'string') return { collection: x.collection, ...(isText(x.label) ? { label: x.label } : {}) };
		if (isText(x.label) && isUrl(x.url)) return { label: x.label, url: x.url };
		if (depth === 0 && isText(x.label) && Array.isArray(x.items)) {
			const sub = x.items.map(y => item(y, where, 1)).filter(y => y != null);
			return sub.length ? { label: x.label, items: sub } : null;
		}
		warn(`[menubar] site data: ${where}: skipped the entry ${JSON.stringify(x)?.slice(0, 120)}`);
		return null;
	};
	const out = [];
	raw.forEach((m, i) => {
		if (!isObj(m) || !isText(m.label) || !Array.isArray(m.items)) {
			warn(`[menubar] site data: menus[${i}] needs a label and items — skipped`);
			return;
		}
		let id = typeof m.id === 'string' && ID.test(m.id) ? `site-${m.id}` : `site-${i + 1}`;
		while (used.has(id)) id += '-x';
		used.add(id);
		const items = m.items.map(x => item(x, `menus[${i}]`, 0)).filter(x => x != null);
		out.push({ id, label: m.label, items });
	});
	return out;
}

/* ---------- Building blocks ---------- */

const canOpen = id => {
	const app = registry.get(id);
	return !!app && registry.available(app);
};

/* A launch entry for an app that can open now; label: own text or the app name */
const appItem = (id, label = null) => (canOpen(id) ? { app: id, ...(label ? { label } : {}) } : null);

/* An entry that opens a core panel (About, Settings …) — text only, as in the original */
const panelItem = (id, key) => (canOpen(id) ? { label: t(key), run: () => launch(id) } : null);

const compact = list => list.filter(x => x != null);

/**
 * The entries of a collection: "Open <collection>", then its groups as submenus (or its items).
 * flat (a collection inside a submenu — the engine opens one submenu level): the items of all
 * groups as plain entries, the groups separated by '-'.
 */
function collectionItems(id, label, { flat = false } = {}) {
	const c = registry.collection(id);
	if (!c) return [];
	const head = c.app && canOpen(c.app) ? [{ app: c.app, ...(label ? labelOf(label) : { label: t('shell.openCollection', { name: L(c.name) }) }) }] : [];
	const items = group => registry.items(id, { group }).filter(a => registry.available(a)).map(a => ({ app: a.id }));
	const groups = c.groups.filter(g => items(g.id).length);
	let body;
	if (!c.groups.length) body = items(null);
	else if (flat) body = groups.flatMap((g, i) => (i ? ['-', ...items(g.id)] : items(g.id)));
	else {
		body = groups.map(g => ({
			...labelOf(g.name), app: { icon: g.icon ?? c.icon, tint: g.tint ?? c.tint }, submenu: () => items(g.id)
		}));
	}
	return [...head, ...(head.length && body.length ? ['-'] : []), ...body];
}

/** The entries of a site menu; depth > 0 inside a submenu (no further submenus there). Exported for tests. */
export function siteEntries(list, depth = 0) {
	const out = [];
	for (const x of list) {
		if (x === '-') out.push('-');
		else if (typeof x === 'string') out.push(appItem(x));
		else if (x.collection) out.push(...collectionItems(x.collection, x.label, { flat: depth > 0 }));
		else if (x.url) out.push({ ...labelOf(x.label), url: L(x.url) });
		else if (x.items) {
			const sub = siteEntries(x.items, depth + 1);
			if (sub.some(s => s !== '-')) out.push({ ...labelOf(x.label), submenu: sub });
		}
	}
	return compact(out);
}

/* config.site.legal: app ids or { label, url } */
function legalItems() {
	return compact((Array.isArray(config.site.legal) ? config.site.legal : []).map(x => {
		if (typeof x === 'string') return appItem(x);
		if (isObj(x) && isText(x.label) && isUrl(x.url)) return { ...labelOf(x.label), url: L(x.url) };
		return null;
	}));
}

/* Every app id and URL a site menu offers (also inside submenus) */
function siteTargets() {
	const out = new Set();
	const walk = list => {
		for (const x of list) {
			if (typeof x === 'string') out.add(`app:${x}`);
			else if (x?.items) walk(x.items);
			else if (x?.url) out.add(`url:${L(x.url)}`);
		}
	};
	cleanSiteMenus(registry.data('menus'), () => {}).forEach(m => walk(m.items));
	return out;
}

/* On phones the brand sheet also holds the folded site menus: legal entries a
   site menu offers already are not listed twice (the original left them out
   there; the rest stay so imprint and privacy remain reachable) */
function brandLegalItems() {
	const all = legalItems();
	if (!isCompact()) return all;
	const shown = siteTargets();
	return all.filter(x => !(x.app && shown.has(`app:${x.app}`)) && !(x.url && shown.has(`url:${x.url}`)));
}

function homeItem() {
	const home = config.site.home;
	if (!isUrl(home)) return null;
	let url = null;
	try {
		url = new URL(L(home), ROOT);
	} catch {
		return null;
	}
	return /^https?:$/.test(url.protocol) ? { label: t('shell.classicSite'), run: () => { location.href = url.href; } } : null;
}

const authorItems = () => compact((config.author.links ?? []).map(l => {
	const app = registry.get(`author-${l.id}`);
	return app ? appItem(app.id, registry.desc(app) || registry.name(app)) : null;
}));

const active = () => service('wm')?.active?.() ?? null;

/* ---------- The menus ---------- */

function brandItems() {
	const power = service('power');
	return compact([
		panelItem('about-desktop', 'shell.aboutDesktop'),
		panelItem('settings', 'shell.settingsMore'),
		'-',
		panelItem('wallpaper', 'shell.wallpaperMore'),
		panelItem('backup', 'shell.backupMore'),
		'-',
		homeItem(),
		...brandLegalItems(),
		'-',
		power ? { label: t('shell.restart'), run: () => askPower(power, 'restart') } : null,
		power ? { label: t('shell.shutdown'), run: () => askPower(power, 'shutdown') } : null
	]);
}

/* "Restart …" / "Shut down …": a sheet asks first (the menu items end in an ellipsis);
   power.restart() and power.shutdown() themselves act at once */
let asking = false;
async function askPower(power, what) {
	if (asking) return;
	asking = true;
	try {
		const ok = await confirm(null, {
			title: t(`shell.${what}Ask`),
			text: t(`shell.${what}Text`),
			ok: t(`shell.${what}Do`)
		});
		if (ok) power[what]();
	} finally {
		asking = false;
	}
}

/** "Copy link to this window" — every window can hand out its desktop link (not dropped files,
    nor a window that shows a file from the device right now: wm.canLink(win) is false then) */
export function copyLinkItem(win) {
	const links = service('deeplinks');
	if (!win || win.app.transient || !links) return null;
	if (service('wm')?.canLink?.(win) === false) return null;
	return { label: t('shell.copyDeskLink'), run: () => copyText(links.linkFor(win)) };
}

function appMenuItems() {
	const win = active();
	const wm = service('wm');
	if (!win || !wm) {
		return compact([panelItem('about-desktop', 'shell.aboutDesktop'), panelItem('help', 'shell.howto')]);
	}
	const link = copyLinkItem(win);
	const own = wm.menu.app(win);
	/* A window kind without its own menu (panels, apps without a menu hook) gets
	   About this desktop and How it works before Quit, as without a window */
	const general = own.length === 1 ? compact([panelItem('about-desktop', 'shell.aboutDesktop'), panelItem('help', 'shell.howto')]) : [];
	return [...(link ? [link, '-'] : []), ...general, ...(general.length ? ['-'] : []), ...own];
}

function helpItems() {
	const authors = authorItems();
	return compact([panelItem('help', 'shell.howto'), ...(authors.length ? ['-', ...authors] : [])]);
}

/* ---------- Status area ---------- */

let status = null;

/**
 * Puts a button (or any element) into the status area at the right of the
 * menu bar. order: search 10, language 80, weather 85, clock 90 — lower
 * goes first. Returns remove().
 */
export function addStatus(el, order = 50) {
	status ??= document.getElementById('mb-status');
	if (!status || !(el instanceof Element)) return () => {};
	el.dataset.order = String(Number.isFinite(order) ? order : 50);
	const next = [...status.children].find(c => c !== el && Number(c.dataset.order ?? 50) > Number(el.dataset.order));
	status.insertBefore(el, next ?? null);
	return () => el.remove();
}

/* ---------- Setup ---------- */

export function initMenubar() {
	const header = document.getElementById('menubar');
	const relabel = () => header?.setAttribute('aria-label', t('core.menubar'));
	relabel();
	on('lang:change', relabel);

	register({
		id: 'brand', order: 0, cls: 'mb-logo', compact: 'keep', host: true,
		label: () => brandGlyph(),
		aria: () => t('shell.brandMenu', { name: config.brand.menuLabel }),
		items: brandItems
	});

	register({
		id: 'app', order: 10, cls: 'mb-app', compact: 'keep',
		label: () => {
			const win = active();
			return win ? nameNode(win.app) : config.brand.menuLabel;
		},
		items: appMenuItems
	});

	cleanSiteMenus(registry.data('menus')).forEach((m, i) => {
		register({
			id: m.id, order: 20 + i, label: () => langText(m.label),
			items: () => siteEntries(m.items),
			when: () => siteEntries(m.items).length > 0
		});
	});

	register({
		id: 'window', order: 80, label: () => t('wm.window'),
		items: () => service('wm')?.menu.window() ?? [],
		when: () => !!service('wm')
	});

	register({
		id: 'help', order: 90, label: () => t('shell.help'),
		items: helpItems,
		when: () => helpItems().length > 0
	});

	/* The app menu follows the active window (its name, its items) */
	const follow = () => update('app');
	for (const name of ['window:focus', 'window:open', 'window:close']) on(name, follow);
	/* Panels and services that come later fill the brand and help menus */
	on('service:provide', ({ name } = {}) => {
		if (['power', 'deeplinks', 'overview'].includes(name)) renderMenus();
	});

	return Object.freeze({ render: renderMenus, addStatus, update });
}
