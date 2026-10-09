/* JPKCom Desktop — settings window: the sidebar of sections, the built-in rows, the reset section — © Jean Pierre Kolb — MIT License

   Loaded when the settings window first opens (app field load in
   src/panels/index.js). The preferences, the row helpers, the section and row
   registry and sections() stay in settings.js (service 'settings'); this file
   draws: what each built-in row shows (RENDER, by the row ids of
   BUILTIN_ROWS there), the window and its hooks. The chosen section lives
   here — Desk.launch('settings', { section }) hands it over (mount, reopen). */

import Desk from '../core/api.js';
import { HEX, onAccent, contrast } from './pure.js';
import { groupState, sameIds, keptPicks, resetPlan } from './pure-window.js';
import { installService } from './install.js';
import { download as downloadBackup } from './backup.js';
import {
	MODES, SECTION_ID, accents, allowCustom, accentHex, theme, accent, setPref, fnOf, marked, nextUid,
	row, toggle, segments, select, button, ctx, rowDefs, sections, redraw, views
} from './settings.js';

const { h, t, L, store, storage } = Desk;

/* ---------- Dock and desktop icons (owned by the shell's services) ---------- */

const dockSize = () => fnOf(Desk.dock, 'size')?.() ?? 'medium';
const dockSizes = () => fnOf(Desk.dock, 'sizes')?.() ?? ['small', 'medium', 'large'];
const magnify = () => !!fnOf(Desk.dock, 'magnify')?.();
const iconsHidden = () => !!fnOf(Desk.desktop, 'hidden')?.();

function setDockSize(v) {
	Desk.dock.setSize(v);
	/* the dock's height changed: windows keep clear of it */
	requestAnimationFrame(() => Desk.wm?.relayout?.());
	redraw();
}

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

/* ============================================================
   Built-in rows
   ============================================================ */

let refocus = null;   // a selector to focus after the next render (language switch rebuilds the window)

function langRow() {
	const codes = Desk.i18n.available();
	/* A language picker: each language under its own name (endonym), marked with its lang */
	const list = codes.map(c => [c, Desk.i18n.displayName(c, c), c]);
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
	const uid = nextUid();
	const id = `set-g${uid}`;
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
let asked = null;       // the ids of the groups shown when the question was asked

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

/* The groups shown now (a group with visible() may be hidden, §14). A pick whose group
   went hidden meanwhile (e.g. a logout in the terminal) is dropped, so nothing names it;
   an open question closes whenever the shown groups changed — what it asked about (a
   partial pick or everything) may mean something else now */
function shownGroups() {
	const groups = storage.resetGroups();
	const ids = groups.map(g => g.id);
	const keep = new Set(keptPicks(picked, ids));
	for (const id of picked) if (!keep.has(id)) picked.delete(id);
	if (resetAsk && !sameIds(asked, ids)) resetAsk = false;
	return groups;
}

/* Open apps write what they still hold first (closing flushes), then the keys go,
   then the desktop restarts — nothing in memory can write them back */
async function runReset() {
	/* Only what the question asked about: a changed set of shown groups closes it instead
	   (a partial pick must never turn into everything, nor everything into a part) */
	const shown = storage.resetGroups().map(g => g.id);
	const plan = resetAsk ? resetPlan(shown, picked, storage.resetGroups({ all: true }).map(g => g.id), asked) : null;
	if (!plan) {
		resetAsk = false;
		redraw();
		return;
	}
	const wm = Desk.wm;
	for (const w of wm?.list?.() ?? []) wm.close(w, { force: true });
	/* Everything also reaches the groups hidden now (their onReset, e.g. a forgotten login) */
	await storage.reset(plan.ids);
	/* Everything means every key of the desktop, also ones no group knows (yet) — never the keys of
	   another installation whose namespace starts with this one (store.names(), §14) */
	if (plan.everything) {
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
	const groups = shownGroups();
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
			button({ key: 'rs-go', label: '@settings.resetGo', danger: true, disabled: !picked.size || resetAsk, run: () => { resetAsk = true; askFresh = true; asked = groups.map(g => g.id); redraw(); } })),
		...(resetAsk && picked.size ? [h('div', { class: 'set-confirm', role: 'alert' },
			h('p', { text: all ? t('settings.resetAskAll') : t('settings.resetAsk', { names: Desk.i18n.list(names) }) }),
			h('div', { class: 'set-actions' },
				button('rs-cancel', t('core.cancel'), () => { resetAsk = false; redraw(); }),
				button('rs-backup', '@settings.resetBackup', () => downloadBackup()),
				button({ key: 'rs-do', label: '@settings.resetDo', danger: true, run: runReset })))] : [])
	];
}

/* What the built-in rows draw, by their id (BUILTIN_ROWS in settings.js: section, order, when) */
const RENDER = {
	lang: langRow,
	restore: () => toggle('restore', '@settings.restore', '@settings.restoreHint', keeping(), on => { Desk.session.setKeeping(on); redraw(); }),
	seconds: () => toggle('seconds', '@settings.seconds', '@settings.secondsHint', clockSeconds(), on => { Desk.clock.setSeconds(on); redraw(); }),
	install: installRow,

	theme: () => segments('theme', '@settings.theme', theme() === 'auto' ? '@settings.themeAutoHint' : null,
		MODES.map(x => [x, `@settings.theme.${x}`]), theme(), v => setPref('theme', v)),
	accent: accentRow,
	wallpaper: () => row('@settings.wallpaper', null, button('wallpaper', '@settings.wallpaperMore', () => Desk.launch('wallpaper'))),

	icons: () => toggle('icons', '@settings.icons', null, !iconsHidden(), on => { Desk.desktop.setHidden(!on); redraw(); }),
	docksize: () => segments('docksize', '@settings.dockSize', '@settings.dockSizeHint',
		dockSizes().map(x => [x, Desk.i18n.has(`settings.size.${x}`) ? `@settings.size.${x}` : x]), dockSize(), setDockSize),
	magnify: () => toggle('magnify', '@settings.magnify', '@settings.magnifyHint', magnify(), on => { Desk.dock.setMagnify(on); redraw(); }),
	dockreset: () => row('@settings.dockReset', '@settings.dockResetHint', button('dockreset', '@settings.dockReset', () => { Desk.dock.reset(); redraw(); }, !dockCustom())),

	consent: consentRows,

	storage() {
		const u = store.usage();
		return row('@settings.storage', '@settings.storageHint', h('span', { class: 'set-value',
			text: t('settings.storageValue', { own: Desk.i18n.fmtBytes(u.own), all: Desk.i18n.fmtBytes(u.all) }) }));
	},
	backup: () => row('@backup.title', null, button('backup', '@settings.backupOpen', () => Desk.launch('backup'))),
	trash: () => row(Desk.apps.get('trash')?.name ?? Desk.apps.name(Desk.apps.get('trash')), t('settings.trashValue', { n: Desk.trash?.count?.() ?? 0 }),
		button('trash', '@core.open', () => Desk.launch('trash'))),

	reset: resetRows
};

function rowsOf(sectionId) {
	const c = ctx(sectionId);
	const nodes = [];
	for (const r of rowDefs(sectionId)) {
		try {
			if (r.when && !r.when()) continue;
			/* A built-in row has no render() of its own: its drawing is here */
			const draw = typeof r.render === 'function' ? r.render : RENDER[r.id];
			const out = draw?.(c);
			for (const n of [out].flat(Infinity)) if (n?.nodeType) nodes.push(n);
		} catch (err) {
			console.error(`[settings] row '${r.id}'${r.module ? ` of '${r.module}'` : ''} failed:`, err);
		}
	}
	/* Online services: the explanation only when there is something to switch */
	if (sectionId === 'online' && nodes.length) nodes.unshift(h('p', { class: 'set-intro', text: t('settings.onlineIntro') }));
	return nodes;
}

/* ============================================================
   Window
   ============================================================ */

let section = 'general';

/* A section asked for from outside (open options, a stored session) — kept when it has rows now */
function pickSection(id) {
	if (typeof id !== 'string' || !sections().some(s => s.id === id)) return false;
	section = id;
	return true;
}

function renderSettings() {
	const root = h('div', { class: 'settings' });
	const titleId = `set-title-${nextUid()}`;

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

/* Window hooks of the settings app: mount() (not render()) so the native kind passes the
   open options — Desk.launch('settings', { section }) also picks the section of a new window */
export default {
	mount(win, body, bar, opts) {
		pickSection(opts?.section);
		body.append(renderSettings());
	},
	/* A language switch: rebuilt in the new language (focus comes back through refocus) */
	relabel(win) {
		win.body.replaceChildren(renderSettings());
	},
	/* Desk.launch('settings', { section }) on the open window */
	reopen(win, opts) {
		if (pickSection(opts?.section)) redraw();
	},
	serialize: () => ({ section }),
	restore(win, state) {
		if (typeof state?.section === 'string' && SECTION_ID.test(state.section)) {
			section = state.section;
			redraw();
		}
	}
};
