/* JPKCom Desktop — calendar popover: month grid, ISO weeks, holidays, sections of other modules — © Jean Pierre Kolb — MIT License

   Optional module 'calendar'. A popover under the menu bar that opens from
   the clock (shell) or the weather button: today's date, a month grid with ISO
   week numbers (config.calendar.weekNumbers), the first weekday from
   config.calendar.firstDay or the language (i18n.weekInfo()), weekends from the
   language, public holidays through the 'holidays' service, then the sections
   other modules contribute.

   Service 'calendar':
     toggle(opener, { section }?)   opens under opener (gets aria-expanded) or closes when it is open for that opener;
                                    section: the id of a contributed section to scroll to (the weather button: 'weather')
     open(opener, opts?)  close(returnFocus = false)  isOpen()  opener()  redraw()

   Extension point 'calendar' (descriptor field):
     calendar: [{ id, order, render(ctx) → Node | null }]
     ctx: { view: { y, m } (month shown, m 0-based), today: Date, close(returnFocus), redraw() }
     Shipped: holidays (order 0), weather (10), notify (20). A section that throws is skipped.

   Keyboard: Esc closes (focus back to the opener), PageUp/PageDown page through the
   months; a month change (buttons, keys, Today) is announced through Desk.announce(). A redraw (language switch, fresh weather) keeps the focus on the control with
   the same data-key. Opening emits 'popovers:close' { except: 'calendar' } and
   'calendar:open'; closing 'calendar:close'. A pointer press outside, a window blur
   (click into an iframe) or another popover closes it. */

import Desk from '../../core/api.js';
import { isoWeek, sameDay, columnDay, sampleDay, resolveFirstDay, monthGrid, shiftMonth } from './core.js';

let el = null;
let opener = null;
let view = null;   // { y, m }
let pendingKey = null;   // data-key of a control that was disabled when a redraw wanted to focus it
let cfg = { firstDay: 'auto', weekNumbers: true };

const firstDay = () => resolveFirstDay(cfg.firstDay, Desk.i18n.weekInfo());

function weekendDays() {
	const w = Desk.i18n.weekInfo().weekend;
	return Array.isArray(w) && w.length ? w : [6, 7];
}

/* Contributed sections, in order; read each time so withdrawn modules drop out */
const sections = () => Desk.modules.contributions('calendar')
	.filter(c => typeof c.render === 'function')
	.sort((a, b) => (Number.isFinite(a.order) ? a.order : 100) - (Number.isFinite(b.order) ? b.order : 100));

function holidaysOn(d) {
	try {
		return Desk.holidays?.on?.(d) ?? [];
	} catch {
		return [];
	}
}

function render() {
	if (!el) return;
	const { h, t, i18n, icon } = Desk;
	const today = new Date();
	const fd = firstDay();
	const weekend = weekendDays();
	const weeks = cfg.weekNumbers !== false;
	const cols = Array.from({ length: 7 }, (_, i) => columnDay(i, fd));
	const titleId = 'cal-title';

	/* Weekday names; a trailing abbreviation dot does not fit the narrow column */
	const head = h('tr', {},
		weeks ? h('th', { scope: 'col', class: 'cal-wk' }, h('abbr', { title: t('calendar.weekLong'), text: t('calendar.week') })) : null,
		cols.map(wd => h('th', { scope: 'col', class: weekend.includes(wd) ? 'is-weekend' : null },
			h('abbr', {
				title: i18n.fmtDate(sampleDay(wd), { weekday: 'long' }),
				text: i18n.fmtDate(sampleDay(wd), { weekday: 'short' }).replace(/\.$/, '')
			}))));

	const rows = monthGrid(view.y, view.m, fd).map(row => h('tr', {},
		weeks ? h('th', { scope: 'row', class: 'cal-wk', 'aria-label': t('calendar.weekRow', { week: String(row.week) }) }, String(row.week)) : null,
		row.days.map((d, i) => {
			const isToday = sameDay(d, today);
			const hols = holidaysOn(d);
			const holLabel = hols.length ? i18n.list(hols.map(x => x.name)) : null;
			const marks = [];
			if (isToday) marks.push(t('calendar.todayMark'));
			if (holLabel) marks.push(t('calendar.holidayMark', { name: holLabel }));
			const cls = [
				weekend.includes(cols[i]) ? 'is-weekend' : '',
				hols.length ? 'is-holiday' : '',
				d.getMonth() !== view.m ? 'is-other' : '',
				isToday ? 'is-today' : ''
			].filter(Boolean);
			return h('td', { class: cls.length ? cls : null, 'aria-current': isToday ? 'date' : null, title: holLabel },
				h('span', { text: String(d.getDate()) }),
				marks.length ? h('span', { class: 'visually-hidden', text: ` ${t('calendar.marks', { marks: i18n.list(marks, { type: 'unit', style: 'long' }) })}` }) : null);
		})));

	/* Sections of other modules (holidays, weather, news) */
	const ctx = Object.freeze({ view: { ...view }, today, close: back => close(back), redraw: () => render() });
	const extra = [];
	for (const s of sections()) {
		try {
			const node = s.render(ctx);
			if (node instanceof Node) {
				if (node instanceof HTMLElement && s.id) node.dataset.section = String(s.id);
				extra.push(node);
			}
		} catch (err) {
			console.warn(`[calendar] section '${s.id ?? '?'}' of '${s.module}' failed:`, err);
		}
	}

	/* A redraw keeps the keyboard where it was; a control that is disabled for the moment
	   (refresh while loading) gets the focus back on a later redraw */
	const active = document.activeElement;
	const hadFocus = el.contains(active) && active !== el;
	const waiting = !hadFocus && active === el && pendingKey !== null;
	const focusKey = hadFocus ? active.dataset?.key ?? null : waiting ? pendingKey : null;
	const isCurrent = view.y === today.getFullYear() && view.m === today.getMonth();
	el.setAttribute('aria-label', t('calendar.title'));
	el.replaceChildren(
		h('p', { class: 'cal-now' },
			h('span', { text: i18n.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
			weeks ? h('span', { class: 'cal-now-wk', text: t('calendar.weekNumber', { week: String(isoWeek(today)) }) }) : null),
		h('div', { class: 'cal-head' },
			h('h2', { class: 'cal-title', id: titleId, text: monthLabel() }),
			h('button', { type: 'button', class: 'cal-btn cal-prev', 'data-key': 'prev', 'aria-label': t('calendar.prevMonth'), title: t('calendar.prevMonth'), onclick: () => page(-1) },
				icon('ti-chevron-left')),
			h('button', { type: 'button', class: 'cal-today', 'data-key': 'today', disabled: isCurrent, text: t('calendar.today'), onclick: goToday }),
			h('button', { type: 'button', class: 'cal-btn cal-next', 'data-key': 'next', 'aria-label': t('calendar.nextMonth'), title: t('calendar.nextMonth'), onclick: () => page(1) },
				icon('ti-chevron-right'))),
		h('table', { class: weeks ? 'cal-grid' : 'cal-grid no-weeks', 'aria-labelledby': titleId },
			h('thead', {}, head),
			h('tbody', {}, rows)),
		...extra);
	if (hadFocus || waiting) {
		const again = focusKey ? el.querySelector(`[data-key="${Desk.dom.cssEscape(focusKey)}"]`) : null;
		const ok = again && !again.disabled;
		(ok ? again : el).focus({ preventScroll: true });
		/* Only a control that exists but is busy (disabled) waits for the focus; one that
		   is gone (retry after success) gives up its claim */
		pendingKey = again && !ok ? focusKey : null;
	} else {
		pendingKey = null;
	}
}

/* The month shown, as the title says it */
const monthLabel = () => Desk.i18n.fmtDate(new Date(view.y, view.m, 1), { month: 'long', year: 'numeric' });

/* render() rebuilds the whole popover, so a live region in it would be new each time and
   stay silent: a month change by the user is announced through the shared live region
   (not on redraws — language switch, fresh weather — that keep the month) */
const announceMonth = () => Desk.announce(monthLabel());

/* Paging is the user's own navigation: a waiting focus claim does not survive it */
function page(delta) {
	pendingKey = null;
	view = shiftMonth(view, delta);
	render();
	announceMonth();
}

/* "Today" disables itself; the focus stays on the popover as in the original and does
   not jump back to the button on a later redraw */
function goToday() {
	const now = new Date();
	const moved = view.y !== now.getFullYear() || view.m !== now.getMonth();
	view = { y: now.getFullYear(), m: now.getMonth() };
	render();
	pendingKey = null;
	if (moved) announceMonth();
}

function onKey(e) {
	if (e.key === 'Escape') {
		e.preventDefault();
		e.stopPropagation();
		close(true);
	} else if (e.key === 'PageUp') {
		e.preventDefault();
		page(-1);
	} else if (e.key === 'PageDown') {
		e.preventDefault();
		page(1);
	}
}

/* from: the button that opened it — the clock, or the weather (which then shows its part) */
function open(from = null, { section = null } = {}) {
	if (el) close();
	Desk.emit('popovers:close', { except: 'calendar' });
	const now = new Date();
	view = { y: now.getFullYear(), m: now.getMonth() };
	opener = from instanceof Element ? from : null;
	pendingKey = null;
	el = Desk.h('div', { class: 'calendar', id: 'calendar', role: 'dialog', 'aria-label': Desk.t('calendar.title'), tabindex: '-1', onkeydown: onKey });
	document.body.append(el);
	render();
	if (opener) {
		opener.setAttribute('aria-expanded', 'true');
		opener.setAttribute('aria-controls', 'calendar');
	}
	el.focus({ preventScroll: true });
	Desk.emit('calendar:open', { section });
	/* By hand: scrollIntoView() would scroll the desktop as well */
	if (section) {
		const part = el.querySelector(`[data-section="${Desk.dom.cssEscape(String(section))}"]`);
		if (part) el.scrollTop = part.offsetTop - 8;
	}
	return true;
}

function close(returnFocus = false) {
	if (!el) return;
	el.remove();
	el = null;
	const from = opener;
	opener = null;
	if (from) {
		from.setAttribute('aria-expanded', 'false');
		from.removeAttribute('aria-controls');
		if (returnFocus && from.isConnected && !from.hidden) from.focus();
	}
	Desk.emit('calendar:close', {});
}

function toggle(from = null, opts = {}) {
	const again = !!el && opener === (from instanceof Element ? from : null);
	close();
	if (!again) open(from, opts);
	return !!el;
}

/* ---------- Descriptor ---------- */

export default {
	id: 'calendar',
	kind: 'module',
	i18n: ['calendar'],
	styles: ['calendar.css'],

	configKey: 'calendar',
	validateConfig(section, warn) {
		const out = section && typeof section === 'object' ? section : {};
		if (out.firstDay !== 'auto' && !(Number.isInteger(out.firstDay) && out.firstDay >= 1 && out.firstDay <= 7)) {
			if (out.firstDay !== undefined) warn(`firstDay must be 'auto' or 1–7 (1 = Monday) — ${JSON.stringify(out.firstDay)} ignored`);
			out.firstDay = 'auto';
		}
		if (typeof out.weekNumbers !== 'boolean') {
			if (out.weekNumbers !== undefined) warn('weekNumbers must be true or false');
			out.weekNumbers = true;
		}
		return out;
	},

	setup(desk) {
		cfg = desk.modules.config('calendar') ?? cfg;
		desk.provide('calendar', Object.freeze({
			toggle,
			open,
			close,
			isOpen: () => !!el,
			opener: () => opener,
			redraw: () => render()
		}));

		document.addEventListener('pointerdown', e => {
			if (el && !el.contains(e.target) && !(opener && opener.contains(e.target))) close();
		}, true);
		addEventListener('blur', () => close());
		desk.on('popovers:close', ({ except } = {}) => {
			if (except !== 'calendar') close();
		});
		/* Labels, new sections, a holiday region that arrived later */
		for (const name of ['lang:change', 'holidays:change', 'module:loaded', 'module:failed']) desk.on(name, () => render());
	}
};
