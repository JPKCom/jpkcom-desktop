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
        registry, plus one link app per author profile
     4. window.JPKDesk (the frozen public API)
     5. modules: core parts (wm, shell, panels), then config.modules, then config.apps —
        imported in parallel, set up in dependency order
     6. 'desk:ready' — session restore, deep links and other "after start" work hook in here

   The boot cover (html[data-boot=pending], set by theme.js) belongs to the
   shell's power service, which replaces it with the boot screen on
   'desk:ready'. Without that service, or when the boot fails, it goes here. */

import { config } from '../core/config.js';
import { initEnv, asset } from '../core/env.js';
import { emit } from '../core/bus.js';
import { initI18n } from '../core/i18n.js';
import { registry } from '../core/registry.js';
import { modules } from '../core/modules.js';
import { has as hasService } from '../core/services.js';
import Desk, { expose } from '../core/api.js';

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

/* The pre-paint cover must never stay: removed when nobody shows a boot screen, at the latest after a while */
const uncover = () => delete document.documentElement.dataset.boot;
const coverTimer = setTimeout(uncover, Math.max(10000, config.boot.ms * 4));

async function boot() {
	initEnv({ compactQuery: config.ui.compactQuery, emit });
	/* theme.js set it from the raw config already; this is the validated value */
	document.documentElement.style.setProperty('--anim', `${config.ui.animMs}ms`);

	/* Strings and site data side by side: registry.load() resolves texts only when they are read */
	await Promise.all([initI18n(), loadSiteData()]);
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
