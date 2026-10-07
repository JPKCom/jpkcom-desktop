/* JPKCom Desktop — DOM helpers: h(), s(), editable(), focusable(), copyText(), markLang(), langText() — © Jean Pierre Kolb — MIT License

   The whole desktop builds its DOM with these helpers: createElement /
   createElementNS plus textContent. There is no innerHTML anywhere, and h()
   refuses the keys that would bring it back (also inside props: {}). Inline styles only go through
   CSSOM (style: { prop: value } → style.setProperty), because the CSP
   (style-src 'self') blocks style="" attributes. */

import { SVGNS } from './env.js';
import { t, i18n } from './i18n.js';
import { announce } from './a11y.js';

/* Keys that would bring HTML parsing back — refused as props and inside props: {} */
export const FORBIDDEN = new Set(['innerHTML', 'outerHTML', 'html', 'srcdoc', 'insertAdjacentHTML', 'setHTMLUnsafe']);

/**
 * The event name of an on<name> prop: onclick → 'click', onClick → 'click'
 * (camel case is lower-cased); names with ':' or '-' keep their case
 * ('onjpkdesk:lang:change'). Exported for tests.
 */
export const eventName = k => {
	const name = k.slice(2);
	return /[:-]/.test(name) ? name : name.toLowerCase();
};

/** Throws when a props object (h(…, { props })) holds a key that parses HTML. Exported for tests. */
export function checkProps(v) {
	for (const k of Object.keys(v ?? {})) {
		if (FORBIDDEN.has(k)) throw new Error(`h(): props.${k} is not allowed — build nodes instead`);
	}
	return v;
}

function applyProps(el, props, svg) {
	for (const [k, v] of Object.entries(props ?? {})) {
		if (v == null || v === false) continue;
		if (FORBIDDEN.has(k)) throw new Error(`h(): '${k}' is not allowed — build nodes instead`);
		if (k === 'class') {
			const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
			if (svg) el.setAttribute('class', cls);
			else el.className = cls;
		} else if (k === 'text') {
			el.textContent = v;
		} else if (k === 'style') {
			if (typeof v !== 'object') throw new Error('h(): style must be an object ({ prop: value }); style="" strings are blocked by the CSP');
			for (const [p, x] of Object.entries(v)) if (x != null) el.style.setProperty(p, String(x));
		} else if (k === 'dataset') {
			for (const [p, x] of Object.entries(v)) if (x != null) el.dataset[p] = String(x);
		} else if (k.startsWith('on') && typeof v === 'function') {
			el.addEventListener(eventName(k), v);
		} else if (k === 'props') {
			/* DOM properties instead of attributes: { value: 'x', checked: true } */
			Object.assign(el, checkProps(v));
		} else {
			if (/^on/i.test(k)) throw new Error(`h(): event handler '${k}' must be a function`);
			el.setAttribute(k, v === true ? '' : v);
		}
	}
}

function append(el, kids) {
	for (const kid of kids.flat(Infinity)) {
		if (kid != null && kid !== false) el.append(kid);
	}
}

/**
 * Builds an HTML element.
 *   h('button', { class: 'btn', type: 'button', text: t('core.open'), onclick: run })
 * props: class (string|array), text, style {}, dataset {}, on<event> (function;
 * onClick works like onclick), props {} (DOM properties), anything else becomes
 * an attribute (true → '').
 * Children: nodes or strings, nested arrays allowed, null/false skipped.
 */
export function h(tag, props = {}, ...kids) {
	const el = document.createElement(tag);
	applyProps(el, props, false);
	append(el, kids);
	return el;
}

/** Builds an SVG element — same props as h(). */
export function s(tag, props = {}, ...kids) {
	const el = document.createElementNS(SVGNS, tag);
	applyProps(el, props, true);
	append(el, kids);
	return el;
}

/** Empties a node (replaceChildren keeps references elsewhere intact). */
export const clear = el => el.replaceChildren();

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** <abbr title> */
export const abbr = (text, title) => h('abbr', { title, text });

/** Typing somewhere? Shortcuts without a modifier keep out then. */
export const editable = node => !!node?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

const TABBABLE = [
	'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'summary',
	'[contenteditable]:not([contenteditable="false"])', '[tabindex]'
].join(',');

/** Keyboard-reachable elements inside root, in DOM order (for focus traps and roving focus). */
export function focusable(root) {
	return [...root.querySelectorAll(TABBABLE)].filter(el =>
		el.tabIndex >= 0 && !el.closest('[inert], [hidden]') && el.getClientRects().length > 0);
}

/**
 * Keeps Tab inside container (dialogs, overlays). Returns a function that removes the trap.
 * Esc handling stays with the caller.
 */
export function trapFocus(container) {
	const onKey = e => {
		if (e.key !== 'Tab') return;
		const list = focusable(container);
		if (!list.length) {
			e.preventDefault();
			return;
		}
		const first = list[0];
		const last = list.at(-1);
		if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	};
	container.addEventListener('keydown', onKey);
	return () => container.removeEventListener('keydown', onKey);
}

/**
 * The language to mark on a text found in `lang` (i18n.resolve() → { lang }): lang when
 * its base language is not the page's, else null (nothing to mark).
 */
export function foreignLang(lang) {
	const base = c => String(c).split('-')[0].toLowerCase();
	return typeof lang === 'string' && lang && base(lang) !== base(i18n.lang()) ? lang : null;
}

/**
 * A manifest or locale text ready to append — string, '@ns.key' (params fill it) or
 * { lang: text }: the plain string, or a <span lang> when the text fell back to another
 * language than the page's (see markLang).
 */
export function langText(v, params) {
	const r = i18n.resolve(v, params);
	return foreignLang(r.lang) ? markLang(h('span', { text: r.text }), r.lang) : r.text;
}

/**
 * Marks text that fell back to another language (i18n.resolve() → { text, lang }):
 * sets el.lang — and el.dir when that language's direction differs from the page's —
 * when lang's base language is not the page's; otherwise removes both again
 * (markLang owns these two attributes of el). Screen readers then speak the text
 * with the right voice (WCAG 3.1.2). Returns el.
 */
export function markLang(el, lang) {
	if (!el?.setAttribute) return el;
	if (foreignLang(lang)) {
		el.setAttribute('lang', lang);
		const dir = i18n.dir(lang);
		if (dir !== i18n.dir()) el.setAttribute('dir', dir);
		else el.removeAttribute('dir');
	} else {
		el.removeAttribute('lang');
		el.removeAttribute('dir');
	}
	return el;
}

/** CSS.escape with a fallback (ids from data are validated anyway). */
export const cssEscape = v => (globalThis.CSS?.escape ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`));

/** Debounce with flush() (write pending work now) and cancel(). */
export function debounce(fn, ms) {
	let timer = 0;
	let args = null;
	const run = () => {
		timer = 0;
		const a = args;
		args = null;
		fn(...a);
	};
	const d = (...a) => {
		args = a;
		clearTimeout(timer);
		timer = setTimeout(run, ms);
	};
	d.flush = () => {
		if (timer) {
			clearTimeout(timer);
			run();
		}
	};
	d.cancel = () => {
		clearTimeout(timer);
		timer = 0;
		args = null;
	};
	return d;
}

/**
 * Saves a Blob or text as a download through a temporary <a download>. A Blob (a File from the
 * device) is retyped application/octet-stream first: its short-lived URL never carries a document
 * type (an SVG or HTML file in a blob: URL of the desktop's origin would run as a page, §5).
 */
export function saveFile(data, fileName, type = 'application/octet-stream') {
	const blob = data instanceof Blob ? data.slice(0, data.size, 'application/octet-stream') : new Blob([data], { type });
	const url = URL.createObjectURL(blob);
	const a = h('a', { href: url, download: fileName, hidden: true });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies text to the clipboard: the Clipboard API, else a hidden <textarea>
 * with execCommand('copy') (older engines, http on a LAN address). On success
 * announces core.copied (announce: false to stay quiet). Resolves true/false.
 */
export async function copyText(text, { announce: speak = true } = {}) {
	const value = String(text ?? '');
	let ok = false;
	try {
		if (globalThis.navigator?.clipboard?.writeText && globalThis.isSecureContext !== false) {
			await navigator.clipboard.writeText(value);
			ok = true;
		}
	} catch { /* blocked: try the fallback */ }
	if (!ok && typeof document !== 'undefined') {
		const before = document.activeElement;
		const area = h('textarea', { class: 'visually-hidden', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
		area.value = value;
		document.body.append(area);
		try {
			area.select();
			ok = document.execCommand('copy') === true;
		} catch {
			ok = false;
		}
		area.remove();
		if (before?.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
	}
	if (ok && speak) announce(t('core.copied'));
	return ok;
}
