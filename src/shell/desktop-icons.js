/* JPKCom Desktop — desktop icons: the apps with desktop: true — © Jean Pierre Kolb — MIT License

   Mouse: a click selects, a double click opens. Touch, pen and keyboard:
   one activation opens. A click on the bare desktop deselects the icons and
   deactivates the windows.

   config.desktop.icons: false switches the icons off for the whole site;
   otherwise the person can hide them (stored 'icons': 'shown' | 'hidden',
   body.icons-hidden) from the desktop's context menu or the settings. */

import { config } from '../core/config.js';
import { on } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { h, cssEscape, markLang } from '../core/dom.js';
import { tile } from '../core/icons.js';
import { store } from '../core/store.js';
import { registry } from '../core/registry.js';
import { launch } from '../core/router.js';
import { get as service } from '../core/services.js';

export const ICONS_KEY = 'icons';

let ul = null;
let pointerType = 'mouse';
let signature = '';

/** The site offers desktop icons at all (config.desktop.icons) */
export const enabled = () => config.desktop?.icons !== false;
/** The person hid them */
export const isHidden = () => store.get(ICONS_KEY) === 'hidden';

function apply() {
	document.body.classList.toggle('icons-hidden', !enabled() || isHidden());
}

export function setHidden(hidden) {
	store.set(ICONS_KEY, hidden ? 'hidden' : 'shown');
	apply();
}

/** The apps on the desktop, in manifest order (only those that can open now). */
const apps = () => registry.list().filter(a => a.desktop);

export function render(force = false) {
	if (!ul) return;
	const list = enabled() ? apps() : [];
	const sig = [document.documentElement.lang, ...list.map(a => `${a.id}:${a.icon}:${a.tint}:${registry.name(a)}`)].join('|');
	ul.setAttribute('aria-label', t('core.desktop'));
	if (!force && sig === signature) return;
	signature = sig;
	const focused = ul.contains(document.activeElement) ? document.activeElement.closest('.icon')?.dataset.app : null;
	ul.replaceChildren(...list.map(app => h('li', {},
		h('button', {
			type: 'button', class: 'icon', dataset: { app: app.id },
			'aria-label': app.kind === 'link' ? t('core.newTab', { name: registry.name(app) }) : null
		},
		tile(app),
		markLang(h('span', { class: 'icon-label', text: registry.name(app) }), registry.nameLang(app)))
	)));
	if (focused) ul.querySelector(`.icon[data-app="${cssEscape(focused)}"]`)?.focus({ preventScroll: true });
}

/** Marks one icon as selected (null: none). */
export function select(btn) {
	if (!ul) return;
	for (const b of ul.querySelectorAll('.icon')) b.classList.toggle('is-selected', b === btn);
}

export function initDesktopIcons() {
	ul = document.getElementById('desktop-icons');
	const workspace = document.getElementById('workspace');
	if (!ul) return null;
	apply();

	ul.addEventListener('pointerdown', e => { pointerType = e.pointerType; }, true);

	/* Mouse: click selects, double-click opens. Touch, pen and keyboard: one activation opens. */
	ul.addEventListener('click', e => {
		const btn = e.target.closest('.icon');
		if (!btn) return;
		select(btn);
		if (e.detail === 0 || pointerType !== 'mouse') launch(btn.dataset.app);
	});

	ul.addEventListener('dblclick', e => {
		const btn = e.target.closest('.icon');
		if (btn && pointerType === 'mouse') launch(btn.dataset.app);
	});

	/* A click on the bare desktop deselects icons and deactivates windows */
	workspace?.addEventListener('pointerdown', e => {
		if (e.target.closest('.win, .icon')) return;
		select(null);
		service('wm')?.focus?.(null);
	});

	on('apps:change', () => render());
	on('lang:change', () => render(true));
	on('store:change', ({ name } = {}) => { if (name === ICONS_KEY) apply(); });
	on('storage:reset', apply);
	on('storage:restore', apply);
	render(true);

	return Object.freeze({ render, select, enabled, hidden: isHidden, setHidden });
}
