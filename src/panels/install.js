/* JPKCom Desktop — install: the desktop as an installed app (web app manifest + service worker) — © Jean Pierre Kolb — MIT License

   With config.pwa.enabled, a secure context and a <link rel="manifest"> in
   index.html (the PWA files are deployed), the service worker ./sw.js at the
   installation root is registered after 'load' — its scope is the root, so a
   sub-folder install works. The browser's install offer (beforeinstallprompt,
   where engines have it) is kept for the button in Settings → General.

   Service 'install': state ('installed' | 'offer' | 'share' | 'menu' | 'off'),
   run() (shows the browser's install question), enabled. Event
   'install:change' { state } (new; documented in docs/packages/p03-panels.md). */

import Desk from '../core/api.js';

const cfg = Desk.config.pwa;
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
	if (cfg?.enabled === false) return;
	ready = typeof document !== 'undefined' && !!document.querySelector('link[rel="manifest"]');
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

	if (ready && Desk.env.isSecure && 'serviceWorker' in navigator) {
		const register = () => navigator.serviceWorker.register(Desk.env.asset('sw.js'), { scope: Desk.env.root })
			.catch(err => { if (Desk.config.debug) console.info('[install] no offline mode:', err?.message ?? err); });
		if (document.readyState === 'complete') register();
		else addEventListener('load', register, { once: true });
	}
}

/**
 * The cache names sw.js gives an installation at this root: '<namespace>:<base>:<version>-<hash>'
 * and '<namespace>:<base>:pages', whatever the namespace (one folder holds one installation) —
 * the same pattern as cacheNames().own in sw.js. Desktops in other folders are not matched. Pure.
 */
export function ownCaches(root) {
	const base = new URL(root).pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^[a-z][a-z0-9-]{0,23}:${base}:(?:[0-9][0-9A-Za-z.+-]*-[0-9a-f]{8}|pages)$`);
}

/** Reset group "Offline copies": unregisters this root's service worker and deletes its caches */
export async function forgetOffline() {
	try {
		/* Exactly this scope — a desktop at '/' must not unregister the one in '/desk/' */
		const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
		await Promise.all(regs.filter(r => r.scope === Desk.env.root).map(r => r.unregister()));
	} catch { /* no service worker */ }
	try {
		const own = ownCaches(Desk.env.root);
		for (const k of await caches.keys()) if (own.test(k)) await caches.delete(k);
	} catch { /* no Cache API */ }
}

/** Whether offline copies can exist at all (the reset group is offered then) */
export const offlinePossible = () => cfg?.enabled !== false && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export const installService = Object.freeze({
	get state() { return state(); },
	get enabled() { return enabled(); },
	run
});
