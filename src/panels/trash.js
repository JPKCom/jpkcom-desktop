/* JPKCom Desktop — trash: deleted items wait here for config.trash.days — © Jean Pierre Kolb — MIT License

   Modules put items in (Desk.toTrash(type, title, data)) and take them back
   through the restore() of the trash type they declared in their descriptor
   (trash: { note: { restore(data, item) { … }, icon, label, app } }); the bin
   itself knows no formats. Items of a type nobody declares right now (a
   module switched off) stay until they expire — they cannot be put back
   meanwhile. Other tabs of the desktop stay in sync ('store:change').

   Service 'trash': add(type, title, data) → boolean, count(), list(),
   putBack(id), purge(id), empty(), askEmpty(). Event 'trash:change' { count }.

   The window's list is trash-window.js, loaded when it first opens; the
   store, the question before emptying and the service stay here. */

import Desk from '../core/api.js';
import { cleanTrash, trashId } from './pure.js';

const { t, store, storage } = Desk;
const KEY = 'trash';
/* Validated by the core (validateConfig): an invalid site value is warned about and
   replaced by the default — no second default kept here */
const cfg = Desk.config.trash;
export const DAYS = cfg.days;
const MAX = cfg.max;
export const ICON_EMPTY = 'ti-trash';
export const ICON_FULL = 'tif-trash';

/** The open trash panels (trash-window.js adds them; root.redraw() rebuilds one) */
export const views = new Set();
let items = [];

/** The items as they are (oldest first) — for the window, not to be changed */
export const current = () => items;

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

/* ---------- Emptying (asks inside the window) ---------- */

let asking = false;
/** Is the question before emptying open? */
export const isAsking = () => asking;

/** The question before emptying, inside the trash window (a sheet; Esc = cancel).
    The panel is not rebuilt while the sheet opens: the dialog gives the focus back
    to the button that asked, so that button must still be there. */
export async function confirmEmpty(within) {
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

/** From a context menu: open the bin and ask right away — once its content is there (win.ready) */
export async function askEmpty() {
	if (!items.length) return;
	Desk.launch('trash');
	const win = Desk.wm?.get('trash');
	if (win && await win.ready && Desk.wm.get('trash') === win) await confirmEmpty(win);
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
