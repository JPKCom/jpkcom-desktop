/* JPKCom Desktop — boot screen, restart, shut down — © Jean Pierre Kolb — MIT License

   Boot: once per browser session (sessionStorage 'booted'), unless reduced
   motion is on or config.boot.enabled is false — boot/theme.js decides that
   before the first paint and covers the page (html[data-boot=pending]). On
   'desk:ready' this replaces the cover with the boot screen: the brand glyph,
   a progress bar over config.boot.ms and the credit "JPKCom Desktop by
   Jean Pierre Kolb" (config.credit), then fades it out.

   Restart: the boot screen comes back on the next load. Shut down: the screen
   goes dark, then config.power.shutdownUrl (a URL or { lang: url }) — or,
   without one, an "off" screen with a power button that starts the desktop
   again. From the moment the screen starts to go dark (restart or shut down)
   power.isOff() is true and no key reaches the desktop any more: a guard in
   the window's capture phase stops every keydown and keyup (the browser's own
   default actions — Tab, Enter on the power button — still happen), and the
   shortcuts check isOff() themselves, since their listener comes first.

   Back after a shutdownUrl can bring this page back from the back/forward
   cache exactly as it was left: dark, without a power button, the key guard
   still on. A 'pageshow' that is persisted while off therefore reloads the
   page with the boot screen — the same as the off screen's power button (the
   session was saved on the way out). */

import { config } from '../core/config.js';
import { PROJECT, ROOT, reduceMotion, later } from '../core/env.js';
import { t, L } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { icon, brandGlyph } from '../core/icons.js';
import { store } from '../core/store.js';
import { get as service } from '../core/services.js';

const BOOTED = 'booted';

let off = false;

/* No key reaches the desktop while it goes down or is off. stopImmediatePropagation()
   in the window's capture phase keeps every later listener out (menus, context menu,
   the search's "/" …) without preventing the default action of the focused power button */
function guard(e) {
	e.stopImmediatePropagation();
}

function halt() {
	if (off) return;
	off = true;
	addEventListener('keydown', guard, true);
	addEventListener('keyup', guard, true);
}

/** Is the desktop going down (restart, shut down) or switched off? */
export const isOff = () => off;

const bootMs = () => (Number.isFinite(config.boot?.ms) && config.boot.ms >= 0 ? Math.min(config.boot.ms, 10000) : 1100);

function credit() {
	if (config.credit === false) return null;
	return h('p', { class: 'boot-credit', text: t('core.credit', { product: PROJECT.name, author: PROJECT.author }) });
}

function screen({ bar = true } = {}) {
	const fill = h('div', { class: 'boot-fill' });
	const el = h('div', { class: 'boot', 'aria-hidden': 'true', 'data-island': 'dark' },
		brandGlyph('i boot-glyph'),
		bar ? h('div', { class: 'boot-bar' }, fill) : null,
		bar ? credit() : null);
	document.body.append(el);
	return { el, fill };
}

const uncover = () => delete document.documentElement.dataset.boot;

/** Shows the boot screen when boot/theme.js announced one (runs on 'desk:ready'). */
export function boot() {
	if (document.documentElement.dataset.boot !== 'pending') return;
	if (reduceMotion() || config.boot?.enabled === false) {
		uncover();
		return;
	}
	store.sset(BOOTED, '1');
	const { el, fill } = screen();
	/* The real screen is in place: the plain cover underneath can go */
	uncover();
	const done = () => {
		el.classList.add('is-hidden');
		setTimeout(() => el.remove(), 500);
	};
	if (typeof fill.animate !== 'function') {
		done();
		return;
	}
	fill.animate([{ width: '0%' }, { width: '70%', offset: 0.6 }, { width: '100%' }], { duration: bootMs(), easing: 'ease-in-out', fill: 'forwards' })
		.finished.then(done, done);
}

/* Fades a dark screen in (CSSOM opacity: the CSP allows it) */
function fadeIn(el) {
	el.style.opacity = '0';
	requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
}

/** Saves what needs saving, then reloads with the boot screen. */
export function restart() {
	halt();
	store.sremove(BOOTED);
	try {
		service('session')?.save?.();
	} catch { /* nothing to save */ }
	const { el } = screen({ bar: false });
	fadeIn(el);
	later(() => location.reload(), 500);
}

function shutdownTarget() {
	const raw = config.power?.shutdownUrl;
	const value = raw == null ? null : L(raw);
	if (!value) return null;
	try {
		const url = new URL(value, ROOT);
		return /^https?:$/.test(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

/* Everything on the page but the off screen is inert — the shell and every overlay
   (banners, drop zone, modules' popups), also ones added later; aria-modal alone
   neither moves nor keeps the focus */
function isolate(el) {
	const still = n => { if (n instanceof HTMLElement && n !== el && n.tagName !== 'SCRIPT') n.inert = true; };
	for (const n of document.body.children) still(n);
	new MutationObserver(list => {
		for (const m of list) for (const n of m.addedNodes) still(n);
	}).observe(document.body, { childList: true });
}

/* The desktop is off: a dark screen with a power button; the rest of the page is inert */
function offScreen(el) {
	isolate(el);
	el.classList.add('power-off');
	el.removeAttribute('aria-hidden');
	el.setAttribute('role', 'dialog');
	el.setAttribute('aria-modal', 'true');
	el.setAttribute('aria-label', t('shell.powerOff'));
	const btn = h('button', {
		type: 'button', class: 'power-on', 'aria-label': t('shell.powerOn'), title: t('shell.powerOn'),
		onclick: () => {
			store.sremove(BOOTED);
			location.reload();
		}
	}, icon('ti-power'));
	el.append(h('p', { class: 'power-text', text: t('shell.powerOff') }), btn);
	btn.focus({ preventScroll: true });
}

/** Closes nothing, saves the session, darkens the screen, then leaves (or shows the off screen). */
export function shutdown() {
	halt();
	try {
		service('session')?.save?.();
	} catch { /* nothing to save */ }
	service('menus')?.close();
	const { el } = screen({ bar: false });
	fadeIn(el);
	const target = shutdownTarget();
	later(() => {
		if (target) location.href = target;
		else offScreen(el);
	}, 900);
}

export function initPower() {
	addEventListener('pageshow', e => {
		if (e.persisted && off) {
			store.sremove(BOOTED);
			location.reload();
		}
	});
	return Object.freeze({ boot, restart, shutdown, isOff });
}
