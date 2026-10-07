/* JPKCom Desktop — menu bar clock (opens the calendar when a calendar module is loaded) — © Jean Pierre Kolb — MIT License

   Weekday, day and month, then the time — in the format of the current
   language (the order of the parts comes from the locale string
   shell.clockDate). A narrow screen (or a crowded menu bar: body.mb-tight,
   menubar-fit.js) drops the date; the accessible name always keeps it.
   With seconds on (stored flag 'seconds', settings) the clock ticks every
   second; its accessible name changes by the minute only, so a screen
   reader on the focused clock is not told every second. */

import { on } from '../core/bus.js';
import { t, i18n } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { get as service } from '../core/services.js';

export const SECONDS_KEY = 'seconds';
/* Below this width the menu bar shows the time only (as the original) */
const DATE_MIN_WIDTH = 600;

let btn = null;
let time = null;
let timer = 0;

export const showSeconds = () => store.flag(SECONDS_KEY, false);

function dateText(now) {
	const p = i18n.dateParts(now, { weekday: 'short', day: 'numeric', month: 'short' });
	return t('shell.clockDate', { weekday: p.weekday ?? '', day: p.day ?? '', month: p.month ?? '' });
}

/** Draws the clock now and plans the next tick (next second, or next minute). */
export function tick() {
	clearTimeout(timer);
	if (!btn) return;
	const now = new Date();
	const secs = showSeconds();
	const clock = i18n.fmtTime(now, { hour: '2-digit', minute: '2-digit', ...(secs ? { second: '2-digit' } : {}) });
	const date = dateText(now);
	const showDate = innerWidth >= DATE_MIN_WIDTH;
	/* The date is its own span: a crowded menu bar hides it (body.mb-tight), the label keeps it */
	time.replaceChildren(...(showDate ? [h('span', { class: 'mb-date', text: date }), ' '] : []), clock);
	time.dateTime = now.toISOString();
	const calendar = !!service('calendar');
	const label = t(calendar ? 'shell.clockLabelCalendar' : 'shell.clockLabel', { date, time: i18n.fmtTime(now) });
	if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
	/* A popup button only while a calendar opens from it (the calendar keeps aria-expanded up to date) */
	if (calendar) {
		btn.setAttribute('aria-haspopup', 'dialog');
		if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');
	} else {
		btn.removeAttribute('aria-haspopup');
		btn.removeAttribute('aria-expanded');
	}
	const ms = now.getSeconds() * 1000 + now.getMilliseconds();
	timer = setTimeout(tick, (secs ? 1000 - (ms % 1000) : 60000 - ms) + 20);
}

export function setSeconds(on) {
	store.setFlag(SECONDS_KEY, !!on);
	tick();
}

/** Builds #mb-clock into the status area (addStatus from the menu bar). */
export function initClock(addStatus) {
	time = h('time', { id: 'mb-time' });
	btn = h('button', {
		type: 'button', class: 'mb-item mb-clock', id: 'mb-clock',
		onclick: () => service('calendar')?.toggle?.(btn)
	}, time);
	addStatus(btn, 90);
	tick();

	on('lang:change', tick);
	on('service:provide', ({ name } = {}) => { if (name === 'calendar') tick(); });
	on('store:change', ({ name } = {}) => { if (name === SECONDS_KEY) tick(); });
	on('storage:reset', tick);
	on('storage:restore', tick);
	addEventListener('resize', tick);
	/* A tab in the background throttles timers: catch up when it comes back */
	document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

	return Object.freeze({ tick, setSeconds, seconds: showSeconds, get button() { return btn; } });
}
