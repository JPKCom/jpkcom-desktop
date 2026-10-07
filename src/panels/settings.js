/* JPKCom Desktop — settings: appearance, dock and desktop preferences, and the window that gathers every switch — © Jean Pierre Kolb — MIT License

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
   helpers, addSection(), addRow(), get()/set() of the own preferences. */

import Desk from '../core/api.js';
import { HEX, onAccent, accentRing, contrast, mergeById, groupState } from './pure.js';
import { installService } from './install.js';
import { download as downloadBackup } from './backup.js';

const { h, t, L, store, storage } = Desk;
const tcfg = Desk.config.theme;
const MODES = ['dark', 'light', 'auto'];
const SIZES = ['small', 'medium', 'large'];
const SECTION_ID = /^[a-z][a-z0-9-]{0,31}$/;
const accents = tcfg.accents ?? {};
const allowCustom = tcfg.allowCustomAccent !== false;
const systemLight = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

/* ============================================================
   Preferences
   ============================================================ */

/** A method of a service, bound — or null (the service or the method is missing) */
function fnOf(obj, name) {
	return typeof obj?.[name] === 'function' ? obj[name].bind(obj) : null;
}

export const validTheme = v => (MODES.includes(v) ? v : null);
export const validAccent = v => {
	if (typeof v !== 'string') return null;
	if (Object.hasOwn(accents, v)) return v;
	return allowCustom && HEX.test(v) ? v.toLowerCase() : null;
};

const defaultTheme = () => validTheme(tcfg.default) ?? 'dark';
const theme = () => validTheme(store.get('theme')) ?? defaultTheme();
const accent = () => validAccent(store.get('accent')) ?? validAccent(tcfg.accent) ?? Object.keys(accents)[0] ?? 'blue';

/** Storage declarations of the own preferences (registered by src/panels/index.js) */
export const SETTINGS_KEYS = {
	theme: { type: 'text', reset: 'settings', label: '@settings.theme', validate: validTheme },
	accent: { type: 'text', reset: 'settings', label: '@settings.accent', validate: validAccent }
};

const accentHex = a => (HEX.test(a) ? a : accents[a] ?? null);
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

/* ---------- Dock and desktop icons (owned by the shell's services) ---------- */

const dockSize = () => fnOf(Desk.dock, 'size')?.() ?? 'medium';
const dockSizes = () => fnOf(Desk.dock, 'sizes')?.() ?? SIZES;
const magnify = () => !!fnOf(Desk.dock, 'magnify')?.();
const iconsHidden = () => !!fnOf(Desk.desktop, 'hidden')?.();

function setDockSize(v) {
	Desk.dock.setSize(v);
	/* the dock's height changed: windows keep clear of it */
	requestAnimationFrame(() => Desk.wm?.relayout?.());
	redraw();
}

/* ============================================================
   Row helpers — positional (as in the original) or one options object
   ============================================================ */

let uid = 0;
const views = new Set();
const optsOf = (args, names) => (args.length === 1 && args[0] && typeof args[0] === 'object' && !args[0].nodeType && !Array.isArray(args[0])
	? args[0]
	: Object.fromEntries(names.map((n, i) => [n, args[i]])));
/* A text to append: '@ns.key' and { lang: text } that fell back to another language come as
   <span lang> (Desk.dom.langText), so screen readers read them with the right voice */
const marked = v => (v == null || v === false ? null : typeof v === 'object' && v?.nodeType ? v : Desk.dom.langText(v));
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


/* Session restore (P1): keeping() may be a method or a flag */
const keeping = () => {
	const s = Desk.session;
	return typeof s?.keeping === 'function' ? s.keeping() : !!s?.keeping;
};
const dockCustom = () => {
	const d = Desk.dock;
	return typeof d?.isCustom === 'function' ? d.isCustom() : d?.isCustom !== false;
};
const clockSeconds = () => {
	const c = Desk.clock;
	return typeof c?.seconds === 'function' ? c.seconds() : !!c?.seconds;
};

let refocus = null;   // a selector to focus after the next render (language switch rebuilds the window)

function langRow() {
	const codes = Desk.i18n.available();
	const list = codes.map(c => [c, Desk.i18n.displayName(c), c]);
	const change = v => {
		refocus = codes.length <= 3 ? `[data-key="lang"][value="${Desk.dom.cssEscape(v)}"]` : '[data-key="lang"]';
		Desk.i18n.setLang(v);
	};
	/* Up to three languages as segments, more in a list */
	return codes.length <= 3
		? segments('lang', '@settings.language', null, list, Desk.lang(), change)
		: select('lang', '@settings.language', null, list, Desk.lang(), change);
}

function installRow() {
	const st = installService.state;
	return row('@settings.install', '@settings.installHint', st === 'offer'
		? button('install', '@settings.installBtn', () => installService.run())
		: h('span', { class: 'set-value', text: t(`settings.install.${st}`) }));
}

const accentName = id => (HEX.test(id) ? t('settings.accentCustomName', { color: id })
	: Desk.i18n.has(`settings.accent.${id}`) ? t(`settings.accent.${id}`) : id);

let customColor = null;   // the custom accent last picked (kept while a named one is chosen)

function accentRow() {
	const id = `set-g${++uid}`;
	const current = accent();
	const custom = HEX.test(current);
	if (custom) customColor = current;
	const pick = customColor ?? accentHex(current) ?? '#3571c0';
	const hint = () => {
		const a = accent();
		const hex = accentHex(a);
		if (!HEX.test(a) || !hex) return accentName(a);
		const on = onAccent(hex);
		/* Two whole sentences: the colour word must agree with the sentence in every language */
		return t(on === '#fff' ? 'settings.accentContrastWhite' : 'settings.accentContrastBlack', {
			name: accentName(a),
			ratio: Desk.i18n.fmtNumber(contrast(on, hex), { maximumFractionDigits: 1 })
		});
	};
	const small = h('small', { text: hint() });
	const customSpan = h('span', { style: { '--c': pick } });
	const customRadio = allowCustom ? h('input', {
		type: 'radio', name: `set-accent-${uid}`, value: 'custom', 'data-key': 'accent', checked: custom,
		'aria-label': t('settings.accentCustom'), onchange: () => setPref('accent', picker.value)
	}) : null;
	/* While the picker is dragged: live, without rebuilding the pane (that would close the picker) */
	const picker = allowCustom ? h('input', {
		type: 'color', class: 'set-color', value: pick, 'data-key': 'accent-color', 'aria-label': t('settings.accentPick'),
		oninput: e => {
			const v = e.target.value.toLowerCase();
			customColor = v;
			customSpan.style.setProperty('--c', v);
			customRadio.checked = true;
			setPref('accent', v, { quiet: true });
			small.textContent = hint();
		},
		onchange: () => redraw()
	}) : null;

	return h('div', { class: 'set-row' },
		h('span', { class: 'set-label', id }, t('settings.accent'), small),
		h('div', { class: 'set-accents' },
			h('div', { class: 'swatches', role: 'radiogroup', 'aria-labelledby': id },
				Object.entries(accents).map(([a, hex]) => h('label', { title: accentName(a) },
					h('input', { type: 'radio', name: `set-accent-${uid}`, value: a, 'data-key': 'accent', checked: a === current, 'aria-label': accentName(a), onchange: () => setPref('accent', a) }),
					h('span', { style: { '--c': hex } }))),
				allowCustom ? h('label', { title: t('settings.accentCustom'), class: 'set-custom-accent' }, customRadio, customSpan) : null),
			picker));
}

function consentRows() {
	return Desk.consent.list().map(s => {
		const hosts = s.hosts.length ? Desk.i18n.list(s.hosts) : null;
		const hint = s.hint ? (hosts ? t('settings.serviceHint', { hint: L(s.hint), hosts }) : L(s.hint)) : hosts;
		return toggle(`consent-${s.id}`, s.label, hint, Desk.consent.granted(s.id), on => {
			Desk.consent.set(s.id, on);
			redraw();
		});
	});
}

/* ---------- Reset: groups of stored keys back to the start ---------- */

const picked = new Set();
let resetAsk = false;
let askFresh = false;   // the question just appeared: it takes the focus and scrolls into view

function stateText(g) {
	if (g.id === 'offline') return t('settings.resetOfflineState');
	const keys = g.keys.map(name => {
		const k = storage.key(name);
		const stored = store.get(name) != null;
		return { stored, value: stored ? storage.read(name) : null, count: k?.count, backup: k?.backup };
	});
	const s = groupState(keys);
	switch (s.kind) {
		case 'default': return t('settings.stateDefault');
		case 'empty': return t('settings.stateEmpty');
		case 'count': return t('settings.stateCount', { n: s.n });
		case 'text': return s.text;
		case 'stored': return t('settings.stateStored');
		case 'custom': return t('settings.stateCustom');
		default: return null;
	}
}

function restart() {
	if (typeof Desk.power?.restart === 'function') Desk.power.restart();
	else location.reload();
}

/* Open apps write what they still hold first (closing flushes), then the keys go,
   then the desktop restarts — nothing in memory can write them back */
async function runReset() {
	const groups = storage.resetGroups();
	const ids = groups.filter(g => picked.has(g.id)).map(g => g.id);
	if (!ids.length) return;
	const everything = ids.length === groups.length;
	const wm = Desk.wm;
	for (const w of wm?.list?.() ?? []) wm.close(w, { force: true });
	await storage.reset(ids);
	/* Everything means every key of the desktop, also ones no group knows (yet) */
	if (everything) {
		for (const name of store.names()) store.remove(name);
		try {
			await Desk.vault?.forget?.();
		} catch { /* nothing kept */ }
	}
	picked.clear();
	resetAsk = false;
	restart();
}

function resetRows() {
	const groups = storage.resetGroups();
	const all = groups.length > 0 && groups.every(g => picked.has(g.id));
	const names = groups.filter(g => picked.has(g.id)).map(g => L(g.label));
	const pick = (id, on) => {
		if (on) picked.add(id);
		else picked.delete(id);
		resetAsk = false;
		redraw();
	};
	return [
		h('p', { class: 'set-intro', text: t('settings.resetIntro') }),
		...groups.map(g => {
			const hint = g.hint ? L(g.hint) : null;
			const state = stateText(g);
			return toggle(`rs-${g.id}`, g.label, hint && state ? t('settings.hintState', { hint, state }) : hint ?? state,
				picked.has(g.id), on => pick(g.id, on), true);
		}),
		h('div', { class: 'set-actions' },
			button('rs-all', t(all ? 'settings.resetNone' : 'settings.resetAll'), () => {
				if (all) picked.clear();
				else groups.forEach(g => picked.add(g.id));
				resetAsk = false;
				redraw();
			}),
			button({ key: 'rs-go', label: '@settings.resetGo', danger: true, disabled: !picked.size || resetAsk, run: () => { resetAsk = true; askFresh = true; redraw(); } })),
		...(resetAsk && picked.size ? [h('div', { class: 'set-confirm', role: 'alert' },
			h('p', { text: all ? t('settings.resetAskAll') : t('settings.resetAsk', { names: Desk.i18n.list(names) }) }),
			h('div', { class: 'set-actions' },
				button('rs-cancel', t('core.cancel'), () => { resetAsk = false; redraw(); }),
				button('rs-backup', '@settings.resetBackup', () => downloadBackup()),
				button({ key: 'rs-do', label: '@settings.resetDo', danger: true, run: runReset })))] : [])
	];
}

/* Built-in rows: { id, section, order, when?, render(ctx) } */
const BUILTIN_ROWS = [
	{ id: 'lang', section: 'general', order: 10, when: () => Desk.i18n.available().length > 1, render: langRow },
	{ id: 'restore', section: 'general', order: 20, when: () => !!fnOf(Desk.session, 'setKeeping'),
		render: () => toggle('restore', '@settings.restore', '@settings.restoreHint', keeping(), on => { Desk.session.setKeeping(on); redraw(); }) },
	{ id: 'seconds', section: 'general', order: 40, when: () => !!fnOf(Desk.clock, 'setSeconds'),
		render: () => toggle('seconds', '@settings.seconds', '@settings.secondsHint', clockSeconds(), on => { Desk.clock.setSeconds(on); redraw(); }) },
	{ id: 'install', section: 'general', order: 60, when: () => installService.enabled, render: installRow },

	{ id: 'theme', section: 'look', order: 10,
		render: () => segments('theme', '@settings.theme', theme() === 'auto' ? '@settings.themeAutoHint' : null,
			MODES.map(x => [x, `@settings.theme.${x}`]), theme(), v => setPref('theme', v)) },
	{ id: 'accent', section: 'look', order: 20, when: () => Object.keys(accents).length > 0 || allowCustom, render: accentRow },
	{ id: 'wallpaper', section: 'look', order: 30, when: () => Desk.apps.available('wallpaper'),
		render: () => row('@settings.wallpaper', null, button('wallpaper', '@settings.wallpaperMore', () => Desk.launch('wallpaper'))) },

	{ id: 'icons', section: 'dock', order: 10, when: () => !!fnOf(Desk.desktop, 'setHidden') && fnOf(Desk.desktop, 'enabled')?.() !== false,
		render: () => toggle('icons', '@settings.icons', null, !iconsHidden(), on => { Desk.desktop.setHidden(!on); redraw(); }) },
	{ id: 'docksize', section: 'dock', order: 20, when: () => !!fnOf(Desk.dock, 'setSize'),
		render: () => segments('docksize', '@settings.dockSize', '@settings.dockSizeHint',
			dockSizes().map(x => [x, Desk.i18n.has(`settings.size.${x}`) ? `@settings.size.${x}` : x]), dockSize(), setDockSize) },
	{ id: 'magnify', section: 'dock', order: 30, when: () => !!fnOf(Desk.dock, 'setMagnify'),
		render: () => toggle('magnify', '@settings.magnify', '@settings.magnifyHint', magnify(), on => { Desk.dock.setMagnify(on); redraw(); }) },
	{ id: 'dockreset', section: 'dock', order: 40, when: () => !!fnOf(Desk.dock, 'reset'),
		render: () => row('@settings.dockReset', '@settings.dockResetHint', button('dockreset', '@settings.dockReset', () => { Desk.dock.reset(); redraw(); }, !dockCustom())) },

	{ id: 'consent', section: 'online', order: 10, render: consentRows },

	{ id: 'storage', section: 'data', order: 10,
		render() {
			const u = store.usage();
			return row('@settings.storage', '@settings.storageHint', h('span', { class: 'set-value',
				text: t('settings.storageValue', { own: Desk.i18n.fmtBytes(u.own), all: Desk.i18n.fmtBytes(u.all) }) }));
		} },
	{ id: 'backup', section: 'data', order: 20, when: () => Desk.apps.available('backup'),
		render: () => row('@backup.title', null, button('backup', '@settings.backupOpen', () => Desk.launch('backup'))) },
	{ id: 'trash', section: 'data', order: 30, when: () => Desk.apps.available('trash'),
		render: () => row(Desk.apps.get('trash')?.name ?? Desk.apps.name(Desk.apps.get('trash')), t('settings.trashValue', { n: Desk.trash?.count?.() ?? 0 }),
			button('trash', '@core.open', () => Desk.launch('trash'))) },

	{ id: 'reset', section: 'reset', order: 10, render: resetRows }
];

const ctx = section => Object.freeze({ section, row, toggle, segments, select, button, redraw, h, t, L });

/* Contributed rows and sections (descriptor settings / settingsSections, addRow / addSection) */
const contributedRows = () => [...Desk.modules.contributions('settings'), ...extraRows]
	.filter(r => typeof r.id === 'string' && typeof r.section === 'string' && typeof r.render === 'function');

function rowsOf(sectionId) {
	const defs = mergeById([
		...BUILTIN_ROWS.filter(r => r.section === sectionId),
		...contributedRows().filter(r => r.section === sectionId)
	]);
	const c = ctx(sectionId);
	const nodes = [];
	for (const r of defs) {
		try {
			if (r.when && !r.when()) continue;
			const out = r.render(c);
			for (const n of [out].flat(Infinity)) if (n?.nodeType) nodes.push(n);
		} catch (err) {
			console.error(`[settings] row '${r.id}'${r.module ? ` of '${r.module}'` : ''} failed:`, err);
		}
	}
	/* Online services: the explanation only when there is something to switch */
	if (sectionId === 'online' && nodes.length) nodes.unshift(h('p', { class: 'set-intro', text: t('settings.onlineIntro') }));
	return nodes;
}

/** Sections that have rows, in order: [{ id, label, icon, tint, order }] */
export function sections() {
	const list = mergeById([...BUILTIN_SECTIONS, ...Desk.modules.contributions('settingsSections'), ...extraSections])
		.filter(s => SECTION_ID.test(s.id));
	return list.filter(s => s.always || rowsOf(s.id).length > 0)
		.map(s => ({ id: s.id, label: s.label ?? s.id, icon: typeof s.icon === 'string' ? s.icon : 'ti-settings', tint: s.tint ?? 'graphite', order: s.order }));
}

/* ============================================================
   Window
   ============================================================ */

let section = 'general';

export function redraw() {
	for (const v of views) {
		if (v.isConnected) v.redraw();
		else views.delete(v);
	}
}

export function renderSettings() {
	const root = h('div', { class: 'settings' });
	const titleId = `set-title-${++uid}`;

	root.redraw = () => {
		const focused = root.contains(document.activeElement) ? document.activeElement : null;
		const key = focused?.dataset.key;
		const keep = key ? `[data-key="${Desk.dom.cssEscape(key)}"]${focused.type === 'radio' ? `[value="${Desk.dom.cssEscape(focused.value)}"]` : ''}` : null;
		const scroll = root.querySelector('.set-main')?.scrollTop ?? 0;
		const list = sections();
		if (!list.some(s => s.id === section)) section = list[0]?.id ?? 'general';
		const current = list.find(s => s.id === section);

		const side = h('nav', { class: 'set-side', 'aria-label': t('settings.title') },
			h('ul', {}, list.map(s => h('li', {},
				h('button', {
					type: 'button', class: 'set-cat', 'data-key': `cat-${s.id}`, 'aria-current': s.id === section ? 'true' : null,
					onclick: () => {
						section = s.id;
						root.redraw();
						root.querySelector('.set-main').scrollTop = 0;
					}
				}, Desk.tile({ icon: s.icon, tint: s.tint }), h('span', {}, marked(s.label)))))));
		const main = h('section', { class: 'set-main', 'aria-labelledby': titleId },
			Desk.dom.markLang(h('h2', { id: titleId, text: current ? L(current.label) : '' }), current ? Desk.i18n.resolve(current.label).lang : null),
			rowsOf(section));
		root.replaceChildren(side, main);
		main.scrollTop = scroll;

		/* Keep the keyboard where it was after a change redrew the pane; a new question takes it */
		const ask = root.querySelector('[data-key="rs-do"]');
		if (ask && askFresh) {
			askFresh = false;
			ask.focus({ preventScroll: true });
			/* By hand: scrollIntoView() would scroll the desktop as well */
			const over = ask.closest('.set-confirm').getBoundingClientRect().bottom - main.getBoundingClientRect().bottom;
			if (over > 0) main.scrollTop += over + 16;
		} else if (keep) {
			root.querySelector(keep)?.focus({ preventScroll: true });
		}
	};

	views.add(root);
	root.redraw();
	if (refocus) {
		const sel = refocus;
		refocus = null;
		requestAnimationFrame(() => root.querySelector(sel)?.focus({ preventScroll: true }));
	}
	return root;
}

/** Opens the settings at a section */
export function show(id) {
	if (typeof id === 'string' && sections().some(s => s.id === id)) section = id;
	Desk.launch('settings');
	redraw();
}

/* Window hooks of the settings app: mount() (not render()) so the native kind passes the
   open options — Desk.launch('settings', { section }) also picks the section of a new window */
export const settingsHooks = {
	mount(win, body, bar, opts) {
		if (typeof opts?.section === 'string' && sections().some(s => s.id === opts.section)) section = opts.section;
		body.append(renderSettings());
	},
	/* A language switch: rebuilt in the new language (focus comes back through refocus) */
	relabel(win) {
		win.body.replaceChildren(renderSettings());
	},
	/* Desk.launch('settings', { section }) on the open window */
	reopen(win, opts) {
		if (typeof opts?.section === 'string') show(opts.section);
	},
	serialize: () => ({ section }),
	restore(win, state) {
		if (typeof state?.section === 'string' && SECTION_ID.test(state.section)) {
			section = state.section;
			redraw();
		}
	}
};

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
		'module:loaded', 'module:failed', 'dock:change', 'vault:change']) Desk.on(ev, redraw);
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
