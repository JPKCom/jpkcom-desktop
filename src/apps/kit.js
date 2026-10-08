/* JPKCom Desktop — app kit: shared helpers of the productivity apps — © Jean Pierre Kolb — MIT License

   What the editor, notes, tasks and calculator have in common (and what
   other apps may reuse): ids, the Ctrl/⌘ test, labels that follow the
   language switch, title-bar buttons, the question sheets (re-exported from
   Desk.dialog — one accessible implementation for the whole desktop) and a
   copy button with feedback.

   Pure parts (newId, isId, mod, clamp helpers) work in Node as well; the
   tests import them from here. */

import Desk from '../core/api.js';

/* ---------- Question sheets (core/dialog.js) ---------- */

/** sheet(within, { title, text, buttons, focus, cancel }) → Promise<id | null> */
export const sheet = (within, opts) => Desk.dialog.sheet(within, opts);
/** confirm(within, { title, text, ok, cancel, danger }) → Promise<boolean> */
export const confirm = (within, opts) => Desk.dialog.confirm(within, opts);
/** alert(within, { title, text, ok }) → Promise<void> */
export const alert = (within, opts) => Desk.dialog.alert(within, opts);

/** A question is open inside the window: its own shortcuts keep out */
export const hasSheet = win => !!win?.el?.querySelector('.sheet');

/* ---------- Pure helpers ---------- */

/** Ctrl or ⌘ without Alt — the modifier of document shortcuts (save, open, find) */
export const mod = e => !!(e.ctrlKey || e.metaKey) && !e.altKey;

/** A short random id: time + randomness in base 36 ([0-9a-z], at most 20 characters) */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Ids from storage end up in selectors and DOM ids: [a-z0-9-], 1–40 characters, starting with a letter or digit */
export const isId = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v);

/** A finite number (timestamps) */
export const isNum = v => typeof v === 'number' && Number.isFinite(v);

/* ---------- Labels that follow the language switch ---------- */

/**
 * Binds translated texts to elements and applies them again after a language
 * switch (call apply() from the app's relabel hook).
 *   const lb = labels();
 *   lb.bind(button, 'editor.save')                         → aria-label + title
 *   lb.bind(input, 'notes.search', ['aria-label', 'placeholder'])
 *   lb.bind(heading, 'calc.history', ['text'])
 *   lb.bind(button, () => Desk.t('editor.wrapTitle', { keys: Desk.i18n.keys('Alt+Z') }), ['title'])
 * key: 'ns.key' or a function returning the text.
 */
export function labels() {
	const list = [];
	const text = key => (typeof key === 'function' ? key() : Desk.t(key));
	const put = ([el, key, attrs]) => {
		const value = text(key);
		for (const a of attrs) {
			if (a === 'text') el.textContent = value;
			else el.setAttribute(a, value);
		}
	};
	return {
		bind(el, key, attrs = ['aria-label', 'title']) {
			const entry = [el, key, attrs];
			list.push(entry);
			put(entry);
			return el;
		},
		apply: () => list.forEach(put)
	};
}

/**
 * A title-bar button (.win-btn) whose label follows the language:
 * winButton(win, lb, 'ti-device-floppy', 'editor.save', run) — the label is
 * its accessible name and tooltip.
 */
export function winButton(win, lb, glyph, key, onClick, cls = null) {
	const btn = typeof win?.button === 'function'
		? win.button({ icon: glyph, label: '', onClick, cls })
		: Desk.h('button', { type: 'button', class: ['win-btn', cls], onclick: onClick }, Desk.icon(glyph));
	return lb.bind(btn, key);
}

/* ---------- Copy with feedback ---------- */

/**
 * Copies text and lets a button say so for a moment: its title becomes
 * doneKey's text and it gets .is-done (the glyph turns green); afterwards the
 * label of key comes back. The live region announces core.copied.
 * key/doneKey: 'ns.key' or a function returning the text, like labels().bind.
 * Resolves true when the text reached the clipboard.
 */
export async function copyWithFeedback(btn, text, { key, doneKey = 'core.copied', ms = 1200 } = {}) {
	const ok = await Desk.dom.copyText(text);
	if (!ok || !btn) return ok;
	const label = k => (typeof k === 'function' ? k() : Desk.t(k));
	clearTimeout(copyTimers.get(btn));
	btn.title = label(doneKey);
	btn.classList.add('is-done');
	copyTimers.set(btn, setTimeout(() => {
		btn.classList.remove('is-done');
		if (key) btn.title = label(key);
	}, ms));
	return ok;
}

const copyTimers = new WeakMap();
