/* JPKCom Desktop — boot sequence (ES module entry point) — © Jean Pierre Kolb — MIT License

   index.html loads, in this order:
     site/config.js      classic script: window.DESKTOP_CONFIG
     src/boot/preload.js classic script (generated): preload hints for every file the boot needs
     src/boot/theme.js   classic script: theme, accent, colours before the first paint
     src/boot/main.js    this module (deferred by nature)

   Boot steps (each one awaited, a failure in an optional part never stops the rest):
     1. environment: body.compact / body.standalone, live changes as bus events
     2. i18n: language metadata, start language, 'core' strings; <html lang dir> — and at
     3. the same time site data: site/apps.js (apps, collections, menus, files) into the
        registry, plus one link app per author profile; and the site icon sets
        (config.iconSets, JSON) into src/core/icons.js — so every module sees their icons;
        then config.iconReplace (the desktop's own glyphs drawn with icons of those sets)
     4. window.JPKDesk (the frozen public API)
     5. modules: core parts (wm, shell, panels), then config.modules, then config.apps —
        imported in parallel, set up in dependency order
     6. 'desk:ready' — session restore, deep links and other "after start" work hook in here

   The boot cover (html[data-boot=pending], set by theme.js) belongs to the
   shell's power service, which replaces it with the boot screen on
   'desk:ready'. Without that service, or when the boot fails, it goes here. */

import { config } from '../core/config.js';
import { initEnv, asset, ROOT } from '../core/env.js';
import { emit } from '../core/bus.js';
import { initI18n } from '../core/i18n.js';
import { registry } from '../core/registry.js';
import { modules } from '../core/modules.js';
import { has as hasService } from '../core/services.js';
import Desk, { expose } from '../core/api.js';
import { request } from '../core/net.js';
import { addIconSet, setIconReplace } from '../core/icons.js';
import { cleanIconSet, MAX_SET_BYTES } from '../core/icon-sets.js';

/* Required parts of the desktop, each a descriptor at src/<part>/index.js */
const CORE_PARTS = ['wm', 'shell', 'panels'];

async function loadSiteData() {
	try {
		const mod = await import(asset(config.site.data));
		registry.load(mod.default ?? {});
	} catch (err) {
		console.error(`[desktop] ${config.site.data} could not be loaded:`, err);
	}
	registry.authorLinks(config.author.links);
}

/* Site icon sets (docs/ARCHITECTURE.md §13): optional data — nothing here may fail the boot.
   Fetched in parallel (the preload hint of src/boot/preload.js is reused: same URL, no Accept header),
   registered in config order once all answers are in: the first set that brings an id wins */
async function loadIconSets() {
	try {
		const vault = asset(config.vault.dir);
		const sets = config.iconSets.flatMap(src => {
			const url = asset(src);
			if (url.startsWith(ROOT) && !url.startsWith(vault)) return [{ src, url }];
			console.warn(`[icons] site icon set ${src} refused: outside the installation root or inside vault.dir`);
			return [];
		});
		if (!sets.length) return;
		const answers = await Promise.allSettled(sets.map(({ url }) =>
			request(url, { read: 'json', maxBytes: MAX_SET_BYTES, timeout: 8000 })));
		const taken = new Set();
		answers.forEach((a, i) => {
			const { src } = sets[i];
			try {
				if (a.status === 'rejected') return console.warn(`[icons] site icon set ${src} not loaded:`, a.reason);
				const r = cleanIconSet(a.value, { taken });
				if (r.fatal) return console.warn(`[icons] site icon set ${src} refused: ${r.fatal}`);
				for (const p of r.problems.slice(0, 10)) console.warn(`[icons] ${src}: ${p}`);
				if (r.problems.length > 10) console.warn(`[icons] ${src}: ${r.problems.length - 10} more problems`);
				for (const id of Object.keys(r.icons)) taken.add(id);
				addIconSet(r, src);
			} catch (err) {
				console.warn(`[icons] site icon set ${src} left out:`, err);
			}
		});
	} catch (err) {
		console.warn('[icons] site icon sets left out:', err);
	}
}

/* config.iconReplace (docs/ARCHITECTURE.md §13): once the sets are registered, before any module is imported.
   A pair whose key or target is not a known icon is warned about and left out — the original glyph stays */
function applyIconReplace() {
	try {
		const problems = setIconReplace(config.iconReplace);
		for (const p of problems.slice(0, 10)) console.warn(`[icons] config.iconReplace: ${p}`);
		if (problems.length > 10) console.warn(`[icons] config.iconReplace: ${problems.length - 10} more problems`);
	} catch (err) {
		console.warn('[icons] config.iconReplace left out:', err);
	}
}

/* The pre-paint cover must never stay: removed when nobody shows a boot screen, at the latest after a while */
const uncover = () => delete document.documentElement.dataset.boot;
const coverTimer = setTimeout(uncover, Math.max(10000, config.boot.ms * 4));

async function boot() {
	initEnv({ compactQuery: config.ui.compactQuery, emit });
	/* theme.js set it from the raw config already; this is the validated value */
	document.documentElement.style.setProperty('--anim', `${config.ui.animMs}ms`);

	/* Strings, site data and icon sets side by side: registry.load() resolves texts only when they are
	   read; no module is imported before all three are done */
	await Promise.all([initI18n(), loadSiteData(), loadIconSets()]);
	applyIconReplace();
	document.title = config.brand.name;
	const heading = document.getElementById('desk-title');
	if (heading) heading.textContent = config.brand.name;
	expose();

	await modules.loadAll([
		{ kind: 'core', refs: CORE_PARTS },
		{ kind: 'module', refs: config.modules },
		{ kind: 'app', refs: config.apps }
	], Desk);

	document.body.classList.add('is-ready');
	emit('desk:ready', {});
	if (!hasService('power')) uncover();
}

boot().catch(err => {
	console.error('[desktop] boot failed:', err);
	uncover();
}).finally(() => {
	if (!document.documentElement.dataset.boot) clearTimeout(coverTimer);
});
