/* JPKCom Desktop — language switch in the menu bar: a toggle for two languages, a menu for more — © Jean Pierre Kolb — MIT License

   The button shows a globe and the short code of the current language.
   Two languages (config.languages): a click switches to the other one; its
   accessible name ends with "Switch to …" in the OTHER language
   (shell.langSwitchTo of that language). The name comes from the button's
   content, not aria-label: two visually hidden spans, the second one with
   lang (and dir) of the target language — an aria-label is one string without
   a language, screen readers would speak the action with the wrong voice.
   Three or more: a menu with every language under its own name
   (i18n.displayName) as radio items. One language: no button at all.
   The switch itself is i18n.setLang(): every part relabels itself on the
   'lang:change' event. */

import { on } from '../core/bus.js';
import { t, i18n } from '../core/i18n.js';
import { asset } from '../core/env.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { get as service } from '../core/services.js';
import { labelLang } from './menus.js';

/**
 * The short text on the button: the language code in capitals — the base
 * language ('de-AT' → 'DE') unless two offered languages share it. Pure.
 */
export function shortCode(code, all = []) {
	const base = String(code).split('-')[0];
	const shared = all.filter(c => String(c).split('-')[0] === base).length > 1;
	return (shared ? String(code) : base).toUpperCase();
}

/** The language a two-language toggle switches to (null with fewer or more than two). Pure. */
export function nextLang(current, all) {
	if (!Array.isArray(all) || all.length !== 2) return null;
	return all[0] === current ? all[1] : all[0];
}

let btn = null;

/* "Switch to <language>" in that language itself: shell.langSwitchTo from the
   language's own shell locale (its lookup chain), {name} = its own name */
const phrases = new Map(); // code → string | null (loading or none)

function phraseIn(code) {
	if (phrases.has(code)) return phrases.get(code);
	phrases.set(code, null);
	(async () => {
		for (const c of i18n.chain(code)) {
			try {
				const v = (await import(asset(`locales/${c}/shell.js`))).default?.langSwitchTo;
				if (typeof v === 'string' && v.length > 0 && v.length < 200) {
					phrases.set(code, v);
					relabel();
					return;
				}
			} catch { /* no such locale file: the next in the chain */ }
		}
	})();
	return null;
}

/** "Switch to <name>" written in the target language (pure; falls back to the current language). */
export function switchLabel(template, name, fallback) {
	return typeof template === 'string' ? template.replaceAll('{name}', name) : fallback;
}

const langs = () => i18n.available();

function relabel() {
	if (!btn) return;
	const all = langs();
	const cur = i18n.lang();
	btn.hidden = all.length < 2;
	const code = h('span', { text: shortCode(cur, all) });
	const current = i18n.displayName(cur);
	const next = nextLang(cur, all);
	if (next) {
		/* The action in the target language: someone who cannot read this one still finds it */
		const name = i18n.displayName(next, next);
		const label = t('shell.langToggle', { current });
		const action = switchLabel(phraseIn(next), name, t('shell.langSwitchTo', { name }));
		/* The phrase is only in the target language once its locale file is loaded */
		const own = phrases.get(next) ? labelLang(next, { dirOf: c => i18n.dir(c), pageDir: document.documentElement.dir }) : { lang: null, dir: null };
		code.setAttribute('aria-hidden', 'true');
		btn.replaceChildren(icon('ti-world'), code,
			h('span', { class: 'visually-hidden', text: label }),
			h('span', { class: 'visually-hidden', lang: own.lang, dir: own.dir, text: ` ${action}` }));
		btn.removeAttribute('aria-label');
		btn.removeAttribute('aria-haspopup');
		btn.removeAttribute('aria-expanded');
		btn.title = `${label} ${action}`;
	} else {
		btn.replaceChildren(icon('ti-world'), code);
		btn.setAttribute('aria-label', t('shell.langMenu', { current }));
		btn.setAttribute('aria-haspopup', 'menu');
		btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');
		btn.title = btn.getAttribute('aria-label');
	}
}

export const setLang = code => i18n.setLang(code);

/* Every offered language as a radio item, each named in its own language —
   lang tells screen readers to pronounce the name that way (exported for tests) */
export function items() {
	const cur = i18n.lang();
	return langs().map(code => ({
		label: i18n.displayName(code, code), lang: code, radio: true, checked: code === cur,
		run: () => setLang(code)
	}));
}

function onClick(e) {
	const all = langs();
	const next = nextLang(i18n.lang(), all);
	if (next) {
		setLang(next);
		return;
	}
	service('menus')?.dropdown(btn, items(), btn.getAttribute('aria-label'), e.detail === 0);
}

/** Builds #mb-lang into the status area. */
export function initLang(addStatus) {
	btn = h('button', { type: 'button', class: 'mb-item mb-lang', id: 'mb-lang', onclick: onClick });
	addStatus(btn, 80);
	relabel();
	on('lang:change', relabel);
	return Object.freeze({ render: relabel, set: setLang, items, get button() { return btn; } });
}
