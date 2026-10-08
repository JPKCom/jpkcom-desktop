/* JPKCom Desktop — settings: appearance preferences, the row helpers and the section and row registry — © Jean Pierre Kolb — MIT License

   Own preferences (storage keys, reset group 'settings'):
     theme      'dark' | 'light' | 'auto'          → html[data-theme] (always resolved), 'theme:change'
     accent     accent id | '#rrggbb' (custom)     → --accent, --on-accent (black or white, whichever reads better),
                                                    --accent-ring (focus rings, selection marks: ≥ 3:1 on --win-bg)
   boot/theme.js applied both before the first paint; from here on this module
   owns them (and follows the system while "auto" is chosen). Dock size,
   magnification, desktop icons and clock seconds belong to the shell — the
   rows here switch them through the dock, desktop and clock services.

   The window: a sidebar of SECTIONS and the rows of the chosen one. Sections
   and rows are a registry — built-in ones below, plus what modules contribute
   in their descriptor:
     settingsSections: [{ id, label, icon, tint, order }]
     settings: [{ id, section, order, render(ctx) → Node | Node[] | null }]
   (a contribution with the id of a built-in row replaces it). ctx offers the
   row helpers (row, toggle, segments, select, button) and redraw(). A redraw
   rebuilds the pane and keeps the keyboard focus on the control with the same
   data-key. Service 'settings': show(section), sections(), redraw(), the row
   helpers, addSection(), addRow(), get()/set() of the own preferences.

   The window itself (sidebar, what the built-in rows draw, the reset
   section) is settings-window.js, loaded when it first opens; this file
   keeps what the boot and other modules need: the preferences, the helpers,
   the registry and sections(). */

import Desk from '../core/api.js';
import { HEX, onAccent, accentRing, mergeById } from './pure.js';
import { installService } from './install.js';

const { h, t, L, store } = Desk;
const tcfg = Desk.config.theme;
export const MODES = ['dark', 'light', 'auto'];
export const SECTION_ID = /^[a-z][a-z0-9-]{0,31}$/;
export const accents = tcfg.accents ?? {};
export const allowCustom = tcfg.allowCustomAccent !== false;
const systemLight = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

/* ============================================================
   Preferences
   ============================================================ */

/** A method of a service, bound — or null (the service or the method is missing) */
export function fnOf(obj, name) {
	return typeof obj?.[name] === 'function' ? obj[name].bind(obj) : null;
}

export const validTheme = v => (MODES.includes(v) ? v : null);
export const validAccent = v => {
	if (typeof v !== 'string') return null;
	if (Object.hasOwn(accents, v)) return v;
	return allowCustom && HEX.test(v) ? v.toLowerCase() : null;
};

const defaultTheme = () => validTheme(tcfg.default) ?? 'dark';
export const theme = () => validTheme(store.get('theme')) ?? defaultTheme();
export const accent = () => validAccent(store.get('accent')) ?? validAccent(tcfg.accent) ?? Object.keys(accents)[0] ?? 'blue';

/** Storage declarations of the own preferences (registered by src/panels/index.js) */
export const SETTINGS_KEYS = {
	theme: { type: 'text', reset: 'settings', label: '@settings.theme', validate: validTheme },
	accent: { type: 'text', reset: 'settings', label: '@settings.accent', validate: validAccent }
};

export const accentHex = a => (HEX.test(a) ? a : accents[a] ?? null);
let last = null;   // the last theme:change payload (events only on real changes)

/* theme.js did this before the first paint; here it follows every change */
function apply() {
	const root = document.documentElement;
	const mode = theme();
	const resolved = mode === 'light' || (mode === 'auto' && systemLight?.matches) ? 'light' : 'dark';
	root.dataset.theme = resolved;
	const a = accent();
	root.style.setProperty('--accent', HEX.test(a) ? a : `var(--accent-${a})`);
	const hex = accentHex(a);
	if (hex) root.style.setProperty('--on-accent', onAccent(hex));
	else root.style.removeProperty('--on-accent');
	/* Focus rings and selection marks: the accent, made to reach 3:1 against the window background */
	const bg = getComputedStyle(root).getPropertyValue('--win-bg').trim();
	const ring = hex ? accentRing(hex, HEX.test(bg) ? bg : resolved === 'light' ? '#fbfbfc' : '#18212a') : null;
	if (ring && ring.toLowerCase() !== hex.toLowerCase()) root.style.setProperty('--accent-ring', ring);
	else root.style.removeProperty('--accent-ring');

	const now = { theme: mode, resolved, accent: a };
	if (last && (last.theme !== now.theme || last.resolved !== now.resolved || last.accent !== now.accent)) Desk.emit('theme:change', { ...now });
	last = now;
}

/** The own preferences: { theme, accent, resolved } */
export const prefs = () => ({ theme: theme(), accent: accent(), resolved: document.documentElement.dataset.theme });

/** Changes a preference: set('theme', 'light' | 'dark' | 'auto'), set('accent', 'violet' | '#rrggbb'). false for invalid values. */
export function setPref(key, value, { quiet = false } = {}) {
	const stored = key === 'theme' ? validTheme(value) : key === 'accent' ? validAccent(value) : null;
	if (stored == null) return false;
	store.set(key, stored);
	apply();
	if (!quiet) redraw();
	return true;
}

/* ============================================================
   Row helpers — positional (as in the original) or one options object
   ============================================================ */

let uid = 0;
/** A number for element ids, unique on the page (the window's ids use it as well) */
export const nextUid = () => ++uid;
/** The open settings panes (settings-window.js adds them; redraw() rebuilds them) */
export const views = new Set();
const optsOf = (args, names) => (args.length === 1 && args[0] && typeof args[0] === 'object' && !args[0].nodeType && !Array.isArray(args[0])
	? args[0]
	: Object.fromEntries(names.map((n, i) => [n, args[i]])));
/* A text to append: '@ns.key' and { lang: text } that fell back to another language come as
   <span lang> (Desk.dom.langText), so screen readers read them with the right voice */
export const marked = v => (v == null || v === false ? null : typeof v === 'object' && v?.nodeType ? v : Desk.dom.langText(v));
const label = (content, hint, props = {}) => h('span', { class: 'set-label', ...props }, marked(content), hint ? h('small', {}, marked(hint)) : null);

/** A label/control row: row(label, hint, control) | row({ label, hint, control }) */
export function row(...args) {
	const o = optsOf(args, ['label', 'hint', 'control']);
	return h('div', { class: 'set-row', 'data-row': o.key ?? null }, label(o.label, o.hint), o.control ?? null);
}

/**
 * A switch row; the whole row is the label of the checkbox. data-key lets a redraw find it again.
 * toggle(key, label, hint, checked, onChange, plain) | toggle({ key, label, hint, checked, onChange, plain, disabled })
 * plain: an ordinary checkbox (a choice, not an on/off setting)
 */
export function toggle(...args) {
	const o = optsOf(args, ['key', 'label', 'hint', 'checked', 'onChange', 'plain']);
	const input = h('input', {
		type: 'checkbox', role: o.plain ? null : 'switch', class: o.plain ? 'check' : 'switch', 'data-key': o.key,
		checked: !!o.checked, disabled: !!o.disabled,
		onchange: () => o.onChange?.(input.checked)
	});
	return h('label', { class: 'set-row' }, label(o.label, o.hint), input);
}

/* [[value, text, lang?]] or [{ value, label, lang }] — a text that fell back to another language gets its lang */
const option = (value, v, lang) => {
	const r = Desk.i18n.resolve(v);
	return { value: String(value), label: r.text, lang: lang ?? Desk.dom.foreignLang(r.lang) };
};
const options = list => (Array.isArray(list) ? list : []).map(x => (Array.isArray(x) ? option(x[0], x[1], x[2]) : option(x?.value, x?.label, x?.lang)));

/**
 * Native radios as segments: segments(key, label, hint, options, value, onChange)
 * | segments({ key, label, hint, options, value, onChange }) — options [[value, text, lang?]]
 */
export function segments(...args) {
	const o = optsOf(args, ['key', 'label', 'hint', 'options', 'value', 'onChange']);
	const id = `set-g${++uid}`;
	const name = `set-${o.key}-${uid}`;
	return h('div', { class: 'set-row' },
		label(o.label, o.hint, { id }),
		h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': id },
			options(o.options).map(x => Desk.dom.markLang(h('label', {},
				h('input', { type: 'radio', name, value: x.value, 'data-key': o.key, checked: x.value === String(o.value), onchange: () => o.onChange?.(x.value) }),
				h('span', { text: x.label })), x.lang))));
}

/** A <select> row: select(key, label, hint, options, value, onChange) | select({ … }) */
export function select(...args) {
	const o = optsOf(args, ['key', 'label', 'hint', 'options', 'value', 'onChange']);
	const id = `set-g${++uid}`;
	return h('div', { class: 'set-row' },
		h('label', { class: 'set-label', for: id }, marked(o.label), o.hint ? h('small', {}, marked(o.hint)) : null),
		h('select', { class: 'set-select', id, 'data-key': o.key, onchange: e => o.onChange?.(e.target.value) },
			options(o.options).map(x => Desk.dom.markLang(h('option', { value: x.value, selected: x.value === String(o.value), text: x.label }), x.lang))));
}

/** A button: button(key, label, run, disabled) | button({ key, label, run, disabled, danger, primary }) */
export function button(...args) {
	const o = optsOf(args, ['key', 'label', 'run', 'disabled']);
	return h('button', {
		type: 'button', class: ['btn', o.primary && 'btn-primary', o.danger && 'btn-danger'], 'data-key': o.key,
		disabled: !!o.disabled, onclick: o.run ?? o.onClick
	}, marked(o.label));
}

/* ============================================================
   Sections and rows (registry)
   ============================================================ */

const extraSections = new Set();
const extraRows = new Set();

const BUILTIN_SECTIONS = [
	{ id: 'general', label: '@settings.secGeneral', icon: 'ti-adjustments-horizontal', tint: 'graphite', order: 10, always: true },
	{ id: 'look', label: '@settings.secLook', icon: 'ti-palette', tint: 'pink', order: 20, always: true },
	{ id: 'dock', label: '@settings.secDock', icon: 'ti-device-desktop', tint: 'blue', order: 30 },
	{ id: 'online', label: '@settings.secOnline', icon: 'ti-world', tint: 'teal', order: 40 },
	{ id: 'data', label: '@settings.secData', icon: 'ti-archive', tint: 'green', order: 50, always: true },
	{ id: 'reset', label: '@settings.secReset', icon: 'ti-arrow-back-up', tint: 'pink', order: 90, always: true }
];

/*
 * Built-in rows: { id, section, order, when? } — what they draw is in settings-window.js
 * (by id), loaded with the window. A row without when() always shows something.
 */
const BUILTIN_ROWS = [
	{ id: 'lang', section: 'general', order: 10, when: () => Desk.i18n.available().length > 1 },
	{ id: 'restore', section: 'general', order: 20, when: () => !!fnOf(Desk.session, 'setKeeping') },
	{ id: 'seconds', section: 'general', order: 40, when: () => !!fnOf(Desk.clock, 'setSeconds') },
	{ id: 'install', section: 'general', order: 60, when: () => installService.enabled },

	{ id: 'theme', section: 'look', order: 10 },
	{ id: 'accent', section: 'look', order: 20, when: () => Object.keys(accents).length > 0 || allowCustom },
	{ id: 'wallpaper', section: 'look', order: 30, when: () => Desk.apps.available('wallpaper') },

	{ id: 'icons', section: 'dock', order: 10, when: () => !!fnOf(Desk.desktop, 'setHidden') && fnOf(Desk.desktop, 'enabled')?.() !== false },
	{ id: 'docksize', section: 'dock', order: 20, when: () => !!fnOf(Desk.dock, 'setSize') },
	{ id: 'magnify', section: 'dock', order: 30, when: () => !!fnOf(Desk.dock, 'setMagnify') },
	{ id: 'dockreset', section: 'dock', order: 40, when: () => !!fnOf(Desk.dock, 'reset') },

	/* One switch per offered service: nothing to show without one */
	{ id: 'consent', section: 'online', order: 10, when: () => Desk.consent.list().length > 0 },

	{ id: 'storage', section: 'data', order: 10 },
	{ id: 'backup', section: 'data', order: 20, when: () => Desk.apps.available('backup') },
	{ id: 'trash', section: 'data', order: 30, when: () => Desk.apps.available('trash') },

	{ id: 'reset', section: 'reset', order: 10 }
].map(r => Object.freeze(r));

/** The ctx a row's render(ctx) gets: the row helpers and redraw() */
export const ctx = section => Object.freeze({ section, row, toggle, segments, select, button, redraw, h, t, L });

/* Contributed rows and sections (descriptor settings / settingsSections, addRow / addSection) */
const contributedRows = () => [...Desk.modules.contributions('settings'), ...extraRows]
	.filter(r => typeof r.id === 'string' && typeof r.section === 'string' && typeof r.render === 'function');

/**
 * The rows of a section in order — built-in ones (without render(): the window draws them)
 * and contributed ones, a contribution replacing the built-in row of its id.
 */
export function rowDefs(sectionId) {
	return mergeById([
		...BUILTIN_ROWS.filter(r => r.section === sectionId),
		...contributedRows().filter(r => r.section === sectionId)
	]);
}

/* Does a section show anything now? A built-in row counts once its when() agrees,
   a contributed one when its render(ctx) gives a node */
function hasRows(sectionId) {
	const c = ctx(sectionId);
	return rowDefs(sectionId).some(r => {
		try {
			if (r.when && !r.when()) return false;
			if (typeof r.render !== 'function') return true;
			return [r.render(c)].flat(Infinity).some(n => n?.nodeType);
		} catch (err) {
			console.error(`[settings] row '${r.id}'${r.module ? ` of '${r.module}'` : ''} failed:`, err);
			return false;
		}
	});
}

/** Sections that have rows, in order: [{ id, label, icon, tint, order }] */
export function sections() {
	const list = mergeById([...BUILTIN_SECTIONS, ...Desk.modules.contributions('settingsSections'), ...extraSections])
		.filter(s => SECTION_ID.test(s.id));
	return list.filter(s => s.always || hasRows(s.id))
		.map(s => ({ id: s.id, label: s.label ?? s.id, icon: typeof s.icon === 'string' ? s.icon : 'ti-settings', tint: s.tint ?? 'graphite', order: s.order }));
}

/* ============================================================
   Window (settings-window.js, loaded when it first opens)
   ============================================================ */

/** Rebuilds the open settings panes (the keyboard focus stays on the control with the same data-key) */
export function redraw() {
	for (const v of views) {
		if (v.isConnected) v.redraw();
		else views.delete(v);
	}
}

/** Opens the settings at a section (the window keeps its section when that one has no rows now) */
export function show(id) {
	Desk.launch('settings', typeof id === 'string' ? { section: id } : {});
}

/* ============================================================
   Setup
   ============================================================ */

export function initSettings() {
	apply();
	systemLight?.addEventListener('change', () => { if (theme() === 'auto') apply(); });

	/* Another tab changed a preference; a reset or restore removed them */
	const OWN = new Set(Object.keys(SETTINGS_KEYS));
	const SHOWN = new Set(['lang', 'icons', 'docksize', 'magnify', 'seconds', 'restore', 'trash']);
	Desk.on('store:change', ({ name, external } = {}) => {
		if (OWN.has(name) && external) apply();
		/* another tab, or the desktop's context menu (icons), changed what a row shows.
		   Own keys written here redraw through setPref() — or must not (quiet: the accent
		   picker is being dragged, a rebuild would close it) */
		if ((OWN.has(name) && external) || SHOWN.has(name) || name?.startsWith('consent-')) redraw();
	});
	Desk.on('storage:reset', () => {
		apply();
		redraw();
	});
	/* Rows follow what the other parts offer right now */
	for (const ev of ['consent:change', 'consent:register', 'trash:change', 'install:change', 'service:provide',
		'module:loaded', 'module:failed', 'dock:change', 'vault:change', 'storage:groups']) Desk.on(ev, redraw);
}

/** Adds a section at runtime (site scripts): { id, label, icon, tint, order } → remove() */
export function addSection(def) {
	if (!def || !SECTION_ID.test(def.id ?? '')) {
		console.warn(`[settings] invalid section ${JSON.stringify(def)}`);
		return () => {};
	}
	const item = Object.freeze({ ...def });
	extraSections.add(item);
	redraw();
	return () => {
		extraSections.delete(item);
		redraw();
	};
}

/** Adds a row at runtime: { id, section, order, render(ctx) } → remove() */
export function addRow(def) {
	if (!def || typeof def.id !== 'string' || typeof def.section !== 'string' || typeof def.render !== 'function') {
		console.warn('[settings] addRow needs { id, section, render(ctx) }');
		return () => {};
	}
	const item = Object.freeze({ ...def });
	extraRows.add(item);
	redraw();
	return () => {
		extraRows.delete(item);
		redraw();
	};
}

export const settingsService = Object.freeze({
	show,
	sections,
	redraw,
	row, toggle, segments, select, button,
	addSection,
	addRow,
	/** Own preferences: get() → { theme, accent, resolved }; set('theme' | 'accent', value) → boolean */
	get: prefs,
	set: setPref
});
