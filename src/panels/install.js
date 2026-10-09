/* JPKCom Desktop — install: the desktop as an installed app (web app manifest + service worker) — © Jean Pierre Kolb — MIT License

   With config.pwa.enabled, a secure context and a <link rel="manifest"> in
   index.html (the PWA files are deployed), the service worker ./sw.js at the
   installation root is registered after 'load' — its scope is the root, so a
   sub-folder install works. The browser's install offer (beforeinstallprompt,
   where engines have it) is kept for the button in Settings → General.

   Service 'install': state ('installed' | 'offer' | 'share' | 'menu' | 'off'),
   run() (shows the browser's install question), enabled. Event
   'install:change' { state } (new; documented in docs/packages/p03-panels.md).

   New version: the worker starts the desktop from its offline copy and says
   { type: 'desk:update' } when a complete new copy is ready (sw.js, fast start)
   or a new worker took over — a banner offers the reload (once per page), and
   the event 'install:update' {} tells anyone else.

   Caches of a service worker the site used before this desktop (config.offline.legacyCaches,
   exact names or 'prefix*', never a name of sw.js's own scheme): deleted by the reset group
   "Offline copies", ~30 s after 'controllerchange' (the earlier worker may still finish
   requests and write to them after the hand-over), and 3 s after each start when this page
   does not register the worker (pwa.enabled false …) — sw.js sweeps at the start otherwise.
   Never while a worker at another script URL controls the page: it would write them again. While a
   worker at sw.js's URL controls it, the page asks that worker ({ type: 'desk:legacy-sweep' }) instead of
   deleting: after a rollback it may be the earlier worker at the same URL, which ignores the message. */

import Desk from '../core/api.js';
import { legacyMatcher } from '../core/config.js';

const cfg = Desk.config.pwa;
const legacyList = Desk.config.offline?.legacyCaches ?? [];
const START_SWEEP_MS = 3000;      // pwa.enabled false: after each start, off the critical path
const HANDOVER_SWEEP_MS = 30000;  // after controllerchange: the earlier worker may still finish requests
let offer = null;   // the browser's install prompt, kept for the Settings button
let ready = false;

/* Touch devices whose browsers install only from the share sheet (no beforeinstallprompt) */
const shareSheet = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const enabled = () => cfg?.enabled !== false && ready;

function state() {
	if (!enabled()) return 'off';
	if (Desk.env.isStandalone()) return 'installed';
	if (offer) return 'offer';
	return shareSheet() ? 'share' : 'menu';
}

const changed = () => Desk.emit('install:change', { state: state() });

async function run() {
	if (!offer) return false;
	const e = offer;
	offer = null;
	try {
		e.prompt();
		await e.userChoice;
	} catch { /* dismissed or not allowed */ }
	changed();
	return true;
}

export function initInstall() {
	ready = typeof document !== 'undefined' && !!document.querySelector('link[rel="manifest"]');
	const registers = cfg?.enabled !== false && ready && Desk.env.isSecure && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
	scheduleSweep(legacyList, { registers });
	if (cfg?.enabled === false) return;
	addEventListener('beforeinstallprompt', e => {
		e.preventDefault();
		offer = e;
		changed();
	});
	addEventListener('appinstalled', () => {
		offer = null;
		changed();
	});
	matchMedia('(display-mode: standalone)').addEventListener?.('change', changed);

	if (registers) {
		navigator.serviceWorker.addEventListener('message', e => {
			if (e.data?.type === 'desk:update') updateReady();
		});
		const register = () => navigator.serviceWorker.register(Desk.env.asset('sw.js'), { scope: Desk.env.root })
			.catch(err => { if (Desk.config.debug) console.info('[install] no offline mode:', err?.message ?? err); });
		if (document.readyState === 'complete') register();
		else addEventListener('load', register, { once: true });
	}
}

/* A new version is one reload away: say so once (a banner when the shell offers them) */
let updateShown = false;
function updateReady() {
	if (updateShown) return;
	updateShown = true;
	Desk.emit('install:update', {});
	const banner = Desk.notifyBanner({
		title: Desk.t('settings.updateReady'), body: Desk.t('settings.updateReadyHint'),
		icon: 'ti-refresh', timeout: 0, run: () => location.reload()
	});
	if (!banner) Desk.announce(Desk.t('settings.updateReady'));
}

/**
 * The cache names sw.js gives an installation at this root: '<namespace>:<base>:<version>-<hash>'
 * (+ '-next', a prepared update) and '<namespace>:<base>:pages', whatever the namespace (one folder
 * holds one installation) — the same pattern as cacheNames().own in sw.js. Desktops in other folders
 * are not matched. Pure.
 */
export function ownCaches(root) {
	const base = new URL(root).pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^[a-z][a-z0-9-]{0,23}:${base}:(?:[0-9][0-9A-Za-z.+-]*-[0-9a-f]{8}(?:-next)?|pages)$`);
}

/** Cache names the reset group "Offline copies" deletes: this root's own and the legacy ones. Pure. */
export const cachesToForget = (keys, root, list) => {
	const own = ownCaches(root);
	const legacy = legacyMatcher(list);
	return keys.filter(k => own.test(k) || legacy(k));
};

/** Deletes the legacy caches that exist; resolves to their names ([] without a list or Cache API) */
export async function sweepLegacy(list = legacyList, store = globalThis.caches) {
	if (!list.length || !store) return [];
	const match = legacyMatcher(list);
	const gone = (await store.keys()).filter(match);
	await Promise.all(gone.map(k => store.delete(k)));
	return gone;
}

/**
 * Schedules the page-side sweeps (only with a non-empty list and a Cache API):
 *   HANDOVER_SWEEP_MS after 'controllerchange' — a new worker took over; the earlier one may still write
 *   START_SWEEP_MS after 'load' — only when this page does not register the worker (registers: false),
 *     because then no worker of this installation sweeps at the start
 * A sweep is skipped while a worker at another script URL than this installation's sw.js controls the
 * page (it would re-create the caches at once). While a worker at this URL controls it, the page does not
 * delete them itself: it posts { type: 'desk:legacy-sweep' } to that worker (sw.js sweeps when it is in
 * charge; an earlier worker the site rolled back to at the same URL ignores it). Only an uncontrolled page
 * sweeps itself. Everything injectable for tests. Returns whether anything was scheduled.
 */
export function scheduleSweep(list = legacyList, {
	registers = true,
	win = globalThis,
	container = globalThis.navigator?.serviceWorker,
	store = globalThis.caches,
	timer = setTimeout,
	ownUrl = Desk.env.asset('sw.js')
} = {}) {
	if (!list.length || !store) return false;
	const sweep = () => {
		const controller = container?.controller ?? null;
		const url = controller?.scriptURL;
		if (url && url !== ownUrl) {
			if (Desk.config.debug) console.info('[install] legacy caches kept: another service worker controls this page', url);
			return;
		}
		if (controller) {
			/* A worker at this installation's URL — but after a rollback that may be the earlier worker, back
			   at the same URL, and these are its caches again: the page cannot tell. So it asks the worker;
			   sw.js sweeps only while it is in charge of its registration, any other worker ignores it. */
			try {
				controller.postMessage({ type: 'desk:legacy-sweep' });
			} catch { /* the worker is gone: nothing to ask */ }
			return;
		}
		sweepLegacy(list, store).catch(() => {});
	};
	container?.addEventListener?.('controllerchange', () => timer(sweep, HANDOVER_SWEEP_MS), { once: true });
	if (!registers) {
		const later = () => timer(sweep, START_SWEEP_MS);
		if (win.document?.readyState === 'complete') later();
		else win.addEventListener?.('load', later, { once: true });
	}
	return true;
}

/** Reset group "Offline copies": unregisters this root's service worker and deletes its caches and the
    legacy ones (config.offline.legacyCaches; an explicit request, so no check for a foreign worker) */
export async function forgetOffline() {
	try {
		/* Exactly this scope — a desktop at '/' must not unregister the one in '/desk/' */
		const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
		await Promise.all(regs.filter(r => r.scope === Desk.env.root).map(r => r.unregister()));
	} catch { /* no service worker */ }
	try {
		for (const k of cachesToForget(await caches.keys(), Desk.env.root, legacyList)) await caches.delete(k);
	} catch { /* no Cache API */ }
}

/** Whether offline copies can exist at all (the reset group is offered then) */
export const offlinePossible = () => cfg?.enabled !== false && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export const installService = Object.freeze({
	get state() { return state(); },
	get enabled() { return enabled(); },
	run
});
