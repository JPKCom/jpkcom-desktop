/* JPKCom Desktop — keyboard shortcuts that work everywhere, also inside same-origin iframes — © Jean Pierre Kolb — MIT License

   One registry for the whole desktop. A shortcut is
     { id, keys: 'Mod+K' | ['F3', 'Ctrl+ArrowUp'], run(e) → false when not handled,
       label: text | '@ns.key', hint?, scope: 'global' | 'window', inEditable?, when?() → boolean }
   from a module descriptor (contribution point 'shortcuts') or added at
   runtime (service 'shortcuts': add(def) → remove()). Keys of iframes never
   reach the page, so the web window kind hands every loaded frame document
   to watch(frame).

   Key specs: modifiers Mod (Ctrl, or ⌘ on keyboards that have it — either
   one is accepted), Ctrl, Alt, Shift, Meta, then a key: a KeyboardEvent.key
   name ('K', 'F3', 'ArrowUp', '/', 'Escape', 'Space') or a physical key code
   ('Backquote', 'IntlBackslash', 'KeyK', 'Digit1') for keys whose character
   depends on the keyboard layout.

   The built-in shortcuts of the original: Mod+K search (when a search module
   is loaded and config.search.shortcut is not null), F3 and Ctrl+↑ the window overview, Ctrl+^ (the key left of 1)
   the next window, with Shift the previous one. */

import { config } from '../core/config.js';
import { editable } from '../core/dom.js';
import { L, i18n } from '../core/i18n.js';
import { get as service } from '../core/services.js';
import { follow } from './contrib.js';

/* Physical key codes (layout independent) — everything else is compared with event.key */
const CODE = /^(Key[A-Z]|Digit[0-9]|Numpad[A-Za-z0-9]+|Backquote|IntlBackslash|IntlRo|IntlYen|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/;
const MODS = { mod: 'mod', ctrl: 'ctrl', control: 'ctrl', strg: 'ctrl', alt: 'alt', option: 'alt', shift: 'shift', meta: 'meta', cmd: 'meta', command: 'meta', super: 'meta' };
const NAMES = { space: ' ', spacebar: ' ', esc: 'escape', del: 'delete', up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };

/**
 * Parses 'Mod+Shift+K' → { mod, ctrl, alt, shift, meta, key: 'k', code: null }, or null
 * when the spec is not usable. Pure (exported for tests).
 */
export function parseKeys(spec) {
	if (typeof spec !== 'string' || !spec.trim() || spec.length > 60) return null;
	const parts = spec.split(/\+(?!$)/).map(p => p.trim()).filter(Boolean);
	if (!parts.length) return null;
	const out = { mod: false, ctrl: false, alt: false, shift: false, meta: false, key: null, code: null };
	for (const [i, part] of parts.entries()) {
		const last = i === parts.length - 1;
		const mod = MODS[part.toLowerCase()];
		if (!last) {
			if (!mod) return null;
			out[mod] = true;
			continue;
		}
		if (CODE.test(part)) out.code = part;
		else out.key = NAMES[part.toLowerCase()] ?? part.toLowerCase();
	}
	return out;
}

/**
 * Does a keydown event match a parsed spec? Mod accepts Ctrl or ⌘ (as the
 * original: ⌘K and Ctrl+K both open the search). Alt must match exactly;
 * Shift too — except for punctuation keys ('?', '/') that need Shift on some
 * layouts. Pure (exported for tests).
 */
export function matchKeys(p, e) {
	if (!p || !e) return false;
	if (p.code ? e.code !== p.code : String(e.key ?? '').toLowerCase() !== p.key) return false;
	if (p.mod) {
		if (!(e.ctrlKey || e.metaKey)) return false;
		if (p.ctrl && !e.ctrlKey) return false;
		if (p.meta && !e.metaKey) return false;
	} else if (!!e.ctrlKey !== p.ctrl || !!e.metaKey !== p.meta) {
		return false;
	}
	if (!!e.altKey !== p.alt) return false;
	const punctuation = !p.code && p.key.length === 1 && !/[\p{L}\p{N} ]/u.test(p.key);
	if (p.shift ? !e.shiftKey : e.shiftKey && !punctuation) return false;
	return true;
}

const list = [];   // { id, keys: [spec], parsed: [parsed], run, label, hint, scope, inEditable, when, module, test, builtin }

/* A built-in shortcut gives way to one a module adds with the same id (e.g. the search's own 'search') */
const overridden = def => def.builtin && !!def.id && list.some(d => d !== def && !d.builtin && d.id === def.id);

/* A shortcut that only fires in its own app's window (scope 'window') */
function inScope(def) {
	if (def.scope !== 'window') return true;
	const win = service('wm')?.active?.();
	if (!win) return false;
	return def.app ? win.app.id === def.app : !!def.module && win.app.module === def.module;
}

function handle(e) {
	if (e.isComposing || e.defaultPrevented) return;
	/* Switched off (or going down): the rest of the page is inert, no shortcut may reach it */
	if (service('power')?.isOff?.()) return;
	for (const def of list) {
		let hit;
		try {
			if (def.test) {
				hit = def.test(e) === true;
			} else {
				if (!def.parsed.some(p => matchKeys(p, e))) continue;
				if (editable(e.target) && !(typeof def.inEditable === 'function' ? def.inEditable(e) : def.inEditable)) continue;
				if (overridden(def) || !inScope(def) || (def.when && def.when() === false)) continue;
				hit = def.run(e) !== false;
			}
		} catch (err) {
			console.error(`[shortcuts] '${def.id ?? def.keys}' failed:`, err);
			hit = false;
		}
		if (hit) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
	}
}

/**
 * Adds a shortcut: { id?, keys, run, label?, hint?, scope?, app?, inEditable?, when? }
 * — or a plain function (e) → true when it handled the key (as in the original).
 * inEditable: also while typing in a field — true, false or (e) → boolean
 * (default: only combinations with Ctrl, ⌘ or Alt, and function keys). Returns remove().
 */
export function add(def, module = null) {
	let entry;
	if (typeof def === 'function') {
		entry = { test: def, module };
	} else {
		const keys = (Array.isArray(def?.keys) ? def.keys : [def?.keys]).filter(k => typeof k === 'string');
		const parsed = keys.map(parseKeys);
		if (!keys.length || parsed.some(p => !p) || typeof def.run !== 'function') {
			console.warn(`[shortcuts] '${def?.id ?? def?.keys}' needs keys like 'Mod+K' and a run() function — skipped`);
			return () => {};
		}
		const strong = parsed.every(p => p.mod || p.ctrl || p.meta || p.alt || /^f\d{1,2}$/.test(p.key ?? ''));
		entry = {
			id: typeof def.id === 'string' ? def.id : null, keys, parsed, run: def.run,
			label: def.label ?? null, hint: def.hint ?? null,
			scope: def.scope === 'window' ? 'window' : 'global', app: typeof def.app === 'string' ? def.app : null,
			inEditable: typeof def.inEditable === 'boolean' || typeof def.inEditable === 'function' ? def.inEditable : strong,
			when: typeof def.when === 'function' ? def.when : null,
			module: def.module ?? module,
			builtin: def.builtin === true
		};
	}
	list.push(entry);
	return () => {
		const i = list.indexOf(entry);
		if (i >= 0) list.splice(i, 1);
	};
}

/**
 * The shortcuts with a label (help panel):
 * [{ id, keys: 'F3' (the first spec), combos: ['F3', 'Ctrl+ArrowUp'], display: 'F3 / Ctrl+↑', label, scope, module }]
 * display is ready to show: the hint (layout-dependent keys such as Ctrl+^) or every combination through i18n.keys().
 */
export function listShortcuts() {
	return list
		.filter(d => !d.test && d.label && !overridden(d) && (!d.when || d.when() !== false))
		.map(d => ({
			id: d.id, keys: d.keys[0], combos: [...d.keys],
			display: d.hint ? L(d.hint) : d.keys.map(k => i18n.keys(k)).join(' / '),
			label: L(d.label), scope: d.scope, module: d.module
		}));
}

/** Every loaded document of an iframe: its contentDocument is new each time (same origin only). */
export function watch(frame) {
	try {
		frame?.contentDocument?.addEventListener('keydown', handle, true);
	} catch { /* cross-origin */ }
}

/**
 * The search shortcut of a config value (config.search.shortcut): the site's own
 * combination, 'Mod+K' when it is missing or unusable, null when the site switched
 * it off (null — false and '' too, as the search module reads them). Pure.
 */
export function searchShortcut(k) {
	if (k === null || k === false || k === '') return null;
	return typeof k === 'string' && parseKeys(k) ? k : 'Mod+K';
}

const searchKeys = () => searchShortcut(config.search?.shortcut);

export function initShortcuts() {
	addEventListener('keydown', handle, true);

	/* Search: only while a search module provides the service; Mod+K closes it again.
	   search.shortcut: null switches it off — no key, no row in list() */
	const searchSpec = searchKeys();
	if (searchSpec) {
		add({
			id: 'search', keys: searchSpec, label: '@shell.scSearch', inEditable: true, builtin: true,
			when: () => !!service('search'),
			run() {
				const search = service('search');
				if (!search) return false;
				if (search.isOpen?.()) search.close?.();
				else search.open?.();
				return true;
			}
		});
	}

	/* The window overview: F3, or Ctrl + ↑ — not while typing (Ctrl + ↑ moves the caret by paragraph there) */
	add({
		id: 'overview', keys: ['F3', 'Ctrl+ArrowUp'], label: '@shell.scOverview', builtin: true,
		inEditable: e => e.key === 'F3',
		when: () => !!service('overview'),
		run: () => {
			const overview = service('overview');
			if (!overview) return false;
			overview.toggle();
			return true;
		}
	});

	/* Next / previous window: Ctrl + the key left of 1 (Backquote on US layouts, ^ or < on others) */
	add({
		id: 'next-window', keys: ['Ctrl+Backquote', 'Ctrl+IntlBackslash'], label: '@shell.scNext', hint: '@shell.scNextKeys', inEditable: true, builtin: true,
		run: () => {
			const wm = service('wm');
			if (!wm) return false;
			wm.cycle(1);
			return true;
		}
	});
	add({
		id: 'previous-window', keys: ['Ctrl+Shift+Backquote', 'Ctrl+Shift+IntlBackslash'], label: '@shell.scPrevious', hint: '@shell.scPreviousKeys', inEditable: true, builtin: true,
		run: () => {
			const wm = service('wm');
			if (!wm) return false;
			wm.cycle(-1);
			return true;
		}
	});

	/* Modules: descriptor field shortcuts: [{ id, keys, label, scope, run }] */
	const removers = new Map();
	follow('shortcuts', {
		add(item) {
			const off = add({ ...item, builtin: false }, item.module);
			if (!removers.has(item.module)) removers.set(item.module, []);
			removers.get(item.module).push(off);
		},
		remove(moduleId) {
			for (const off of removers.get(moduleId) ?? []) off();
			removers.delete(moduleId);
		}
	});

	/* builtin is the shell's own flag: a def from outside is never one */
	return Object.freeze({ add: def => add(typeof def === 'function' ? def : { ...def, builtin: false }), list: listShortcuts, watch, parse: parseKeys, matches: matchKeys });
}
