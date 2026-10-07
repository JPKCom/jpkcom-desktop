/* JPKCom Desktop — notification banners under the menu bar — © Jean Pierre Kolb — MIT License

   show({ title, body, icon, tint, app, url, meta, date, timeout, run }) puts a
   banner at the top end of the screen (service 'notifications', also
   Desk.notifyBanner). The whole banner is a button: it opens run(), else
   url in app (launch(app, { url })), else url the desktop way, else app.
   A banner hides itself after timeout ms (config.notify.hideMs; 0 = stays)
   — never while the pointer or the focus is on it — and at most
   config.notify.maxBanners stay at once (the oldest goes). What a banner is
   about (a feed, a reminder …) is the business of the caller; the feed
   check is the notify module's. A language switch clears the banners: they
   were written in the old language.

   Banners never cover the desktop icons: on wide screens they sit next to the
   first icon column (notifications.css); on phones the icon grid moves below
   them while any is shown — body.has-notifs and --notifs-h (the stack's
   height) follow the stack. */

import { config } from '../core/config.js';
import { on } from '../core/bus.js';
import { reduceMotion, later } from '../core/env.js';
import { t, i18n } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { icon, tile } from '../core/icons.js';
import { registry } from '../core/registry.js';
import { launch, openUrl } from '../core/router.js';

let box = null;

const num = (v, min, max, fallback) => (Number.isFinite(v) && v >= min && v <= max ? v : fallback);
const hideMs = () => num(config.notify?.hideMs, 0, 600000, 9000);
const maxBanners = () => Math.round(num(config.notify?.maxBanners, 1, 10, 3));

/**
 * A relative date for a banner: 'Today', 'Yesterday' or a short date (with
 * the year when it is not this year's). Exported for the calendar's feed list.
 */
export function when(ms, now = new Date()) {
	const d = new Date(ms);
	const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
	if (days === 0) return t('core.today');
	if (days === 1) return t('core.yesterday');
	return i18n.fmtDate(d, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export const stamp = ms => h('time', { datetime: new Date(ms).toISOString(), text: when(ms) });

/* The stack's height for the icon grid on phones (desktop-icons.css): 0 → no class, no property */
function fit() {
	const height = box?.isConnected && box.children.length ? Math.ceil(box.getBoundingClientRect().height) : 0;
	document.body.classList.toggle('has-notifs', height > 0);
	if (height > 0) document.body.style.setProperty('--notifs-h', `${height}px`);
	else document.body.style.removeProperty('--notifs-h');
}

function container() {
	if (!box?.isConnected) {
		box = h('div', { class: 'notifs', role: 'region', 'aria-label': t('shell.notifications'), 'aria-live': 'polite' });
		document.body.append(box);
		/* Banners grow (a longer title) and go: the height follows */
		if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(box);
	}
	return box;
}

function dismiss(el) {
	if (!el.isConnected || el.classList.contains('is-out')) return;
	clearTimeout(el.hideTimer);
	el.classList.add('is-out');
	el.classList.remove('is-in');
	later(() => {
		el.remove();
		fit();
	}, config.ui.animMs);
}

/* What the banner shows on its left: the app's tile, else an icon on a tint */
function leading(opts, app) {
	if (app) return tile(app);
	return tile({ icon: typeof opts.icon === 'string' ? opts.icon : 'ti-bell', tint: opts.tint ?? 'slate' });
}

/** Shows a banner. Returns { close() }, or null without a title. */
export function show(opts = {}) {
	const title = typeof opts.title === 'string' ? opts.title.trim().slice(0, 200) : '';
	if (!title) return null;
	const body = typeof opts.body === 'string' ? opts.body.trim().slice(0, 300) : '';
	const app = typeof opts.app === 'string' ? registry.get(opts.app) : null;
	const metaText = typeof opts.meta === 'string' && opts.meta ? opts.meta : app ? registry.name(app) : '';
	/* date: ms, a Date or an ISO string */
	const ms = opts.date instanceof Date ? opts.date.getTime() : typeof opts.date === 'string' ? Date.parse(opts.date) : opts.date;
	const date = Number.isFinite(ms) ? ms : null;
	const timeout = num(opts.timeout, 0, 600000, hideMs());

	const action = () => {
		if (typeof opts.run === 'function') return opts.run();
		if (app && typeof opts.url === 'string') return launch(app.id, { url: opts.url });
		if (typeof opts.url === 'string') return openUrl(opts.url);
		if (app) return launch(app.id);
		return null;
	};

	const el = h('div', { class: 'notif' },
		h('button', {
			type: 'button', class: 'notif-main',
			onclick: () => {
				dismiss(el);
				try {
					action();
				} catch (err) {
					console.error('[notifications] banner action failed:', err);
				}
			}
		},
		leading(opts, app),
		h('span', { class: 'notif-text' },
			metaText || date ? h('span', { class: 'notif-meta' }, h('span', { text: metaText }), date ? stamp(date) : null) : null,
			h('span', { class: 'notif-title', text: title }),
			body ? h('span', { class: 'notif-sum', text: body }) : null)),
		h('button', {
			type: 'button', class: 'notif-close', 'aria-label': t('shell.notifClose'), title: t('shell.notifClose'),
			onclick: () => dismiss(el)
		}, icon('ti-x')));

	/* Hides itself after the timeout — never while the pointer or the focus is on it */
	const arm = () => {
		clearTimeout(el.hideTimer);
		if (timeout > 0) el.hideTimer = setTimeout(() => { if (!el.matches(':hover, :focus-within')) dismiss(el); else arm(); }, timeout);
	};
	el.addEventListener('pointerenter', () => clearTimeout(el.hideTimer));
	el.addEventListener('pointerleave', arm);
	el.addEventListener('focusin', () => clearTimeout(el.hideTimer));
	el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) arm(); });

	const list = container();
	list.append(el);
	/* At most maxBanners at once: the oldest give way */
	const live = [...list.children].filter(x => !x.classList.contains('is-out'));
	for (const old of live.slice(0, Math.max(0, live.length - maxBanners()))) dismiss(old);
	if (reduceMotion()) el.classList.add('is-in');
	else requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
	fit();
	arm();
	return Object.freeze({ close: () => dismiss(el) });
}

/** Hides every banner. */
export function clear() {
	for (const el of [...(box?.children ?? [])]) dismiss(el);
}

export function initNotifications() {
	on('lang:change', () => {
		clear();
		box?.setAttribute('aria-label', t('shell.notifications'));
	});
	return Object.freeze({ show, clear, when, stamp });
}
