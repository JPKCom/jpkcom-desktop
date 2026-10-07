/* JPKCom Desktop — Notes app: many short texts, the first line is the title — © Jean Pierre Kolb — MIT License

   A list of notes (newest first, searchable) beside the text of the current
   one; on phones and in a narrow window (notes.css container query) the
   list and the text take turns (.is-detail). Storage key
   'notes' (model.js). An emptied note disappears once you move on, as in
   common notes apps. Deleting moves a note to the trash without a question
   (trash type 'note' puts it back). Other tabs of the desktop stay in sync
   through 'store:change' (external). */

import Desk from '../../core/api.js';
import { labels, winButton, mod, hasSheet, newId } from '../kit.js';
import { cleanNotes, cleanNote, titleOf, previewOf, search as searchNotes, dropEmpty as withoutEmpty, restoreNote } from './model.js';

const { h, t, i18n, store } = Desk;
const KEY = 'notes';

const load = () => store.getJson(KEY, cleanNotes, null) ?? { notes: [], current: null };

/* The open window: the trash puts notes back through it, so nothing typed
   in the last few hundred milliseconds gets lost */
let live = null;

const noteTitle = n => titleOf(n.text) ?? t('notes.newNote');
const notePreview = n => previewOf(n.text) ?? t('notes.noText');

/* Today: the time; otherwise the date, short */
function shortDate(ms) {
	const d = new Date(ms);
	if (d.toDateString() === new Date().toDateString()) return i18n.fmtTime(d, { hour: '2-digit', minute: '2-digit' });
	return i18n.fmtDate(d, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function mount(win, body) {
	let data = load();
	let query = '';
	let saved = true;
	const lb = labels();

	const search = h('input', { type: 'search', class: 'field-input', name: 'notes-search', autocomplete: 'off', spellcheck: 'false' });
	lb.bind(search, 'notes.search', ['aria-label', 'placeholder']);
	const list = lb.bind(h('ul', { class: 'notes-list' }), 'notes.list', ['aria-label']);
	const ta = h('textarea', { class: 'notes-text', name: 'note', spellcheck: 'true' });
	lb.bind(ta, 'notes.text', ['aria-label']);
	lb.bind(ta, 'notes.placeholder', ['placeholder']);
	const meta = h('p', { class: 'notes-meta' });
	const backBtn = lb.bind(h('button', { type: 'button', class: 'notes-back', onclick: () => back() }, Desk.icon('ti-chevron-left')), 'notes.back');
	const root = h('div', { class: 'notes' },
		h('div', { class: 'notes-side' },
			h('label', { class: 'field notes-search' }, Desk.icon('ti-search'), search),
			list),
		h('div', { class: 'notes-main' },
			h('div', { class: 'notes-head' }, backBtn, meta),
			ta));
	body.append(root);

	const newBtn = winButton(win, lb, 'ti-edit', 'notes.newNote', () => create());
	const delBtn = winButton(win, lb, 'ti-trash', 'kit.moveToTrash', () => remove());
	win.addActions(newBtn, delBtn);

	const byId = id => data.notes.find(n => n.id === id);
	const persist = Desk.dom.debounce(() => {
		saved = store.setJson(KEY, data);
		renderMeta();
	}, 300);

	/* ---------- Drawing ---------- */

	function renderList() {
		const shown = searchNotes(data.notes, query);
		list.replaceChildren(...shown.map(n => h('li', {},
			h('button', { type: 'button', class: 'notes-item', dataset: { id: n.id }, 'aria-current': n.id === data.current ? 'true' : null },
				h('span', { class: 'notes-title', text: noteTitle(n) }),
				h('span', { class: 'notes-sub' },
					h('span', { class: 'notes-date', text: shortDate(n.modified) }),
					h('span', { class: 'notes-preview', text: notePreview(n) }))))));
		if (!shown.length) list.append(h('li', { class: 'notes-empty', text: t(query ? 'notes.noResults' : 'notes.empty') }));
	}

	function renderMeta() {
		const n = byId(data.current);
		if (!saved) meta.textContent = t('kit.notSaved');
		else meta.textContent = n ? t('notes.edited', { date: i18n.fmtDate(n.modified, { dateStyle: 'long', timeStyle: 'short' }) }) : '';
		meta.classList.toggle('is-warn', !saved);
		delBtn.disabled = !n;
	}

	function renderEditor() {
		const n = byId(data.current);
		ta.value = n ? n.text : '';
		renderMeta();
	}

	/* ---------- Selecting, creating, removing ---------- */

	/* An emptied note disappears once you move on */
	function dropEmpty(except) {
		const before = data.notes.length;
		data.notes = withoutEmpty(data.notes, except);
		if (data.notes.length !== before) persist();
	}

	function select(id, detail = true) {
		dropEmpty(id);
		data.current = id;
		renderList();
		renderEditor();
		persist();
		if (detail) root.classList.add('is-detail');
	}

	function back() {
		root.classList.remove('is-detail');
		list.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
	}

	function create() {
		const now = Date.now();
		const n = { id: newId(), text: '', created: now, modified: now };
		dropEmpty(null);
		data.notes.push(n);
		query = '';
		search.value = '';
		select(n.id);
		ta.focus();
	}

	/* Into the trash, no question asked — it can be put back from there */
	function remove() {
		const n = byId(data.current);
		if (!n) return;
		if (n.text.trim()) Desk.toTrash('note', noteTitle(n), { ...n });
		data.notes = data.notes.filter(x => x !== n);
		data.current = searchNotes(data.notes, '')[0]?.id ?? null;
		root.classList.remove('is-detail');
		renderList();
		renderEditor();
		persist();
	}

	ta.addEventListener('input', () => {
		let n = byId(data.current);
		if (!n) {
			const now = Date.now();
			n = { id: newId(), text: '', created: now, modified: now };
			data.notes.push(n);
			data.current = n.id;
		}
		n.text = ta.value;
		n.modified = Date.now();
		renderList();
		renderMeta();
		persist();
	});

	search.addEventListener('input', () => {
		query = search.value.trim();
		renderList();
	});

	list.addEventListener('click', e => {
		const btn = e.target.closest('.notes-item');
		if (btn) select(btn.dataset.id);
	});

	/* Arrow keys walk the list, Delete removes the selected note */
	list.addEventListener('keydown', e => {
		const btn = e.target.closest('.notes-item');
		if (!btn) return;
		const items = [...list.querySelectorAll('.notes-item')];
		const i = items.indexOf(btn);
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
			if (next) {
				const id = next.dataset.id;
				select(id, false);
				list.querySelector(`[data-id="${Desk.dom.cssEscape(id)}"]`)?.focus();
			}
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			select(btn.dataset.id, false);
			remove();
			(list.querySelector('[aria-current="true"]') ?? search).focus();
		}
	});

	/* Ctrl/⌘+F: the search field */
	win.el.addEventListener('keydown', e => {
		if (!mod(e) || hasSheet(win)) return;
		if (e.key.toLowerCase() === 'f') {
			e.preventDefault();
			root.classList.remove('is-detail');
			search.focus();
			search.select();
		}
	});

	/* ---------- Other tabs, backups, the trash ---------- */

	function reload(id) {
		persist.cancel();
		data = load();
		saved = true;
		if (id && byId(id)) data.current = id;
		renderList();
		/* Typing goes on undisturbed: the text is only replaced when the field is not in use */
		if (document.activeElement !== ta || !byId(data.current)) renderEditor();
		else renderMeta();
	}

	const offStore = Desk.on('store:change', ({ name, external } = {}) => {
		if (name === KEY && external) reload();
	});
	const offRestore = Desk.on('storage:restore', ({ names } = {}) => {
		if (names?.includes(KEY)) reload();
	});
	const offReset = Desk.on('storage:reset', ({ groups } = {}) => {
		if (groups?.includes('notes')) reload();
	});

	live = {
		flush: () => persist.flush(),
		reload(id) {
			reload(id);
			if (id) renderEditor();
		}
	};

	win.state.notes = {
		ta, lb, root, search, persist, renderList, renderMeta, dropEmpty,
		off() {
			offStore();
			offRestore();
			offReset();
		},
		menu: () => [
			{ label: t('notes.newNote'), run: create },
			{ label: t('kit.moveToTrash'), disabled: !byId(data.current), run: remove },
			'-',
			{ label: t('notes.search'), shortcut: 'Mod+F', run: () => { root.classList.remove('is-detail'); search.focus(); } }
		]
	};

	renderList();
	renderEditor();
}

export default {
	id: 'notes',
	kind: 'app',
	i18n: ['notes', 'kit'],
	styles: ['notes.css'],

	app: { icon: 'ti-note', tint: 'orange', size: [780, 520], name: '@notes.appName', desc: '@notes.appDesc' },

	storage: {
		notes: { type: 'json', backup: true, reset: 'notes', label: '@notes.appName', validate: cleanNotes, count: v => v.notes.length }
	},
	resetGroups: [{ id: 'notes', label: '@notes.appName', hint: '@notes.resetHint', order: 40 }],

	trash: {
		note: {
			icon: 'ti-note', label: '@notes.trashType', app: 'notes',
			restore(n) {
				if (!cleanNote(n)) return false;
				live?.flush();
				const next = restoreNote(load(), n);
				if (!next || !store.setJson(KEY, next)) return false;
				live?.reload(next.current);
				return true;
			}
		}
	},

	mount,

	focus(win) {
		const a = document.activeElement;
		if (win.el.contains(a) && a !== win.el) return;
		const { ta, root, search } = win.state.notes;
		/* List and text take turns (phone, narrow window): the hidden text cannot take the focus */
		const target = ta.getClientRects().length ? ta : (root.querySelector('.notes-item[aria-current="true"]') ?? search);
		target?.focus({ preventScroll: true });
	},

	menu: win => win.state.notes.menu(),

	relabel(win) {
		win.state.notes.lb.apply();
		win.state.notes.renderList();
		win.state.notes.renderMeta();
	},

	unmount(win) {
		const s = win.state.notes;
		s.dropEmpty(null);
		s.persist.flush();
		s.off();
		live = null;
	}
};
