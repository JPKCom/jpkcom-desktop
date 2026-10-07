/* JPKCom Desktop — trash: deleted items wait here for config.trash.days — © Jean Pierre Kolb — MIT License

   Modules put items in (Desk.toTrash(type, title, data)) and take them back
   through the restore() of the trash type they declared in their descriptor
   (trash: { note: { restore(data, item) { … }, icon, label, app } }); the bin
   itself knows no formats. Items of a type nobody declares right now (a
   module switched off) stay until they expire — they cannot be put back
   meanwhile. Other tabs of the desktop stay in sync ('store:change').

   Service 'trash': add(type, title, data) → boolean, count(), list(),
   putBack(id), purge(id), empty(), askEmpty(). Event 'trash:change' { count }. */

import Desk from '../core/api.js';
import { cleanTrash, trashId } from './pure.js';

const { h, t, L, store, storage } = Desk;
const KEY = 'trash';
/* Validated by the core (validateConfig): an invalid site value is warned about and
   replaced by the default — no second default kept here */
const cfg = Desk.config.trash;
const DAYS = cfg.days;
const MAX = cfg.max;
export const ICON_EMPTY = 'ti-trash';
export const ICON_FULL = 'tif-trash';

const views = new Set();
let items = [];

/** Validator of the storage key (also for backups) */
export const validateStored = v => cleanTrash(v, { days: DAYS, max: MAX });

const load = () => store.getJson(KEY, validateStored, { items: [] }).items;

/* Full or empty: the app carries icon (empty) and iconFull; the dock shows iconFull
   while count() > 0 and re-renders on 'trash:change' */
function changed() {
	for (const v of views) {
		if (v.isConnected) v.redraw();
		else views.delete(v);
	}
	Desk.emit('trash:change', { count: items.length });
}

function save() {
	if (!store.setJson(KEY, { items })) Desk.announce(t('core.storageFull'), { assertive: true });
	changed();
}

/** Puts an item into the trash. type: declared by a module (descriptor trash: { type: { restore } }). */
export function add(type, title, data) {
	if (!storage.trashType(type)) {
		console.warn(`[trash] unknown type '${type}' — declare it in the module descriptor (trash: { ${type}: { restore } })`);
		return false;
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
	items.push({ id: trashId(), type, title: String(title ?? '').slice(0, 120), data, deleted: Date.now() });
	items = items.slice(-MAX);
	save();
	return true;
}

/** Hands an item back to its module; it leaves the trash when restore() does not answer false. */
export async function putBack(id) {
	const item = items.find(x => x.id === id);
	const type = item && storage.trashType(item.type);
	if (!type) return false;
	let ok;
	try {
		ok = await type.restore(item.data, { ...item });
	} catch (err) {
		console.error(`[trash] restoring a '${item.type}' failed:`, err);
		ok = false;
	}
	if (ok === false) return false;
	items = items.filter(x => x.id !== id);
	save();
	return true;
}

export function purge(id) {
	items = items.filter(x => x.id !== id);
	save();
}

export function empty() {
	items = [];
	save();
}

/* ---------- Window ---------- */

const appOf = item => {
	const type = storage.trashType(item.type);
	const app = type?.app ? Desk.apps.get(type.app) : null;
	return { type, app };
};

function when(ms) {
	const d = new Date(ms);
	return new Date().toDateString() === d.toDateString()
		? Desk.i18n.fmtTime(d, { hour: '2-digit', minute: '2-digit' })
		: Desk.i18n.fmtDate(d, { day: 'numeric', month: 'short' });
}

let asking = false;

/** The question before emptying, inside the trash window (a sheet; Esc = cancel).
    The panel is not rebuilt while the sheet opens: the dialog gives the focus back
    to the button that asked, so that button must still be there. */
async function confirmEmpty(within) {
	if (asking || !items.length) return;
	asking = true;
	try {
		const ok = await Desk.dialog.confirm(within, {
			title: t('trash.ask', { n: items.length }),
			text: t('trash.askText'),
			ok: t('trash.doEmpty'),
			danger: true
		});
		if (ok) {
			empty();
			Desk.announce(t('trash.emptied'));
		}
	} finally {
		asking = false;
		changed();
		/* Emptied (the button went) or the opener was lost: the keyboard stays in the bin */
		const active = document.activeElement;
		const panel = within?.el?.isConnected ? within.el.querySelector('.trash-panel') : null;
		if (panel && (!active || active === document.body)) {
			(panel.querySelector('.trash-empty:not(:disabled)') ?? panel.querySelector('h2'))?.focus({ preventScroll: true });
		}
	}
}

export function renderTrash(win) {
	const root = h('div', { class: 'panel trash-panel' });

	root.redraw = () => {
		const focused = root.contains(document.activeElement) ? document.activeElement : null;
		const focusedId = focused?.closest?.('.trash-item')?.dataset.id;
		const focusedIndex = focusedId ? [...root.querySelectorAll('.trash-item')].findIndex(li => li.dataset.id === focusedId) : -1;
		const onEmpty = focused?.classList.contains('trash-empty');
		const title = Desk.apps.name(Desk.apps.get('trash')) || t('trash.title');

		const head = h('div', { class: 'trash-head' },
			h('div', {},
				h('h2', { tabindex: '-1', text: title }),
				h('p', { text: t('trash.intro', { n: DAYS }) })),
			h('button', {
				type: 'button', class: 'btn trash-empty', disabled: !items.length, 'aria-disabled': asking ? 'true' : null, text: t('trash.empty'),
				onclick: () => confirmEmpty(win)
			}));

		const list = items.length
			? h('ul', { class: 'trash-list', 'aria-label': title }, [...items].reverse().map(x => {
				const { type, app } = appOf(x);
				const name = x.title || t('trash.untitled');
				const source = app ? Desk.apps.name(app) : type ? L(type.label) : x.type;
				return h('li', { class: 'trash-item', 'data-id': x.id },
					app ? Desk.tile(app) : Desk.tile({ icon: type?.icon ?? 'ti-file-unknown', tint: 'graphite' }),
					h('span', { class: 'trash-text' },
						h('span', { class: 'trash-name', text: name }),
						h('span', { class: 'trash-meta', text: t('trash.meta', { source, when: when(x.deleted) }) })),
					h('button', {
						type: 'button', class: 'btn trash-back', text: t('trash.putBack'),
						'aria-label': t('trash.putBackItem', { name }), disabled: !type,
						title: type ? null : t('trash.noType'),
						onclick: () => putBack(x.id)
					}),
					h('button', {
						type: 'button', class: 'win-btn trash-purge', 'aria-label': t('trash.purgeItem', { name }), title: t('trash.purge'),
						onclick: () => purge(x.id)
					}, Desk.icon('ti-x')));
			}))
			: h('p', { class: 'trash-none', text: t('trash.none') });

		root.replaceChildren(head, list);

		/* Keep the keyboard where it was: the same item, else the one that took its place, else the heading */
		if (onEmpty) {
			(root.querySelector('.trash-empty:not(:disabled)') ?? root.querySelector('h2'))?.focus({ preventScroll: true });
		} else if (focusedId) {
			const sel = `.trash-item[data-id="${Desk.dom.cssEscape(focusedId)}"]`;
			const same = root.querySelector(sel);
			const was = focused?.classList.contains('trash-purge') ? '.trash-purge' : '.trash-back';
			const next = same ?? root.querySelectorAll('.trash-item')[Math.max(0, focusedIndex - 1)] ?? null;
			const btn = next?.querySelector(`${was}:not(:disabled)`) ?? next?.querySelector('button:not(:disabled)');
			(btn ?? root.querySelector('h2'))?.focus({ preventScroll: true });
		}
	};

	views.add(root);
	root.redraw();
	return root;
}

/** From a context menu: open the bin and ask right away */
export function askEmpty() {
	if (!items.length) return;
	Desk.launch('trash');
	const win = Desk.wm?.get('trash');
	if (win) confirmEmpty(win);
}

export function initTrash() {
	items = load();
	/* Re-save when loading dropped expired items */
	if (store.get(KEY) != null && items.length !== (store.getJson(KEY, v => v)?.items?.length ?? 0)) store.setJson(KEY, { items });
	/* Another tab changed the bin; a reset or restored backup wrote it */
	Desk.on('store:change', ({ name, external } = {}) => {
		if (name !== KEY || !external) return;
		items = load();
		changed();
	});
	Desk.on('storage:reset', ({ groups } = {}) => {
		if (!groups?.includes('trash')) return;
		items = [];
		changed();
	});
	/* A module that declares a trash type came later: put back becomes possible;
	   one whose setup failed lost its type: put back is not possible any more */
	Desk.on('module:loaded', () => { if (items.length) changed(); });
	Desk.on('module:failed', () => { if (items.length) changed(); });
}

/** The trash tile's menu in the dock: open, then empty (asks first) */
export const dockMenu = () => [
	{ label: t('core.open'), run: () => Desk.launch('trash') },
	'-',
	{ label: t('trash.empty'), disabled: !items.length, run: askEmpty }
];

export const trashService = Object.freeze({
	add,
	count: () => items.length,
	list: () => items.map(x => ({ id: x.id, type: x.type, title: x.title, deleted: x.deleted })),
	putBack,
	purge,
	empty,
	askEmpty,
	open: () => Desk.launch('trash')
});
