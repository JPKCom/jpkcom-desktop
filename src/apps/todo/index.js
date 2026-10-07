/* JPKCom Desktop — Tasks app: one list — add, tick, edit, reorder, filter — © Jean Pierre Kolb — MIT License

   Storage key 'todos' ({ items, filter }, model.js). Editing in place by
   double-click or Enter on the checkbox; reordering by the grip (pointer
   drag) or Alt+↑/↓ (only while all tasks are shown); Delete/Backspace on the
   checkbox and "Remove completed" move tasks to the trash one by one, so each
   can be put back (trash type 'todo'). Other tabs of the desktop stay in sync
   through 'store:change' (external). */

import Desk from '../../core/api.js';
import { labels, newId } from '../kit.js';
import { FILTERS, MAX_TEXT, cleanTodos, cleanItem, visible, counts, moveItem, reorder, restoreItem } from './model.js';

const { h, t, store } = Desk;
const KEY = 'todos';

const load = () => store.getJson(KEY, cleanTodos, null) ?? { items: [], filter: 'all' };

/* The open window: the trash puts tasks back through it, so nothing typed
   in the last few hundred milliseconds gets lost */
let live = null;

const EMPTY = { all: 'todo.emptyAll', open: 'todo.emptyOpen', done: 'todo.emptyDone' };

function mount(win, body) {
	let data = load();
	let saved = true;
	let editing = null;
	const lb = labels();
	const uid = win.id;

	const input = h('input', { type: 'text', class: 'todo-input', name: 'task', maxlength: String(MAX_TEXT), autocomplete: 'off' });
	lb.bind(input, 'todo.placeholder', ['aria-label', 'placeholder']);
	const addBtn = lb.bind(h('button', { type: 'submit', class: 'todo-add-btn' }, Desk.icon('ti-plus')), 'todo.add');
	const form = h('form', { class: 'todo-add' }, input, addBtn);
	const filterBtns = FILTERS.map(f => h('button', { type: 'button', class: 'todo-filter', dataset: { filter: f } }));
	const filters = lb.bind(h('div', { class: 'todo-filters', role: 'group' }, filterBtns), 'todo.filter', ['aria-label']);
	const list = lb.bind(h('ul', { class: 'todo-list' }), 'todo.list', ['aria-label']);
	const summary = h('span', { class: 'todo-summary', 'aria-live': 'polite' });
	const clearBtn = lb.bind(h('button', { type: 'button', class: 'btn todo-clear' }), 'todo.clear', ['text']);
	body.append(h('div', { class: 'todo' }, form, filters, list, h('div', { class: 'todo-status' }, summary, clearBtn)));

	const persist = Desk.dom.debounce(() => {
		saved = store.setJson(KEY, data);
		renderStatus();
	}, 200);
	const byId = id => data.items.find(x => x.id === id);
	const rowOf = id => list.querySelector(`.todo-item[data-id="${Desk.dom.cssEscape(id)}"]`);

	/* ---------- Drawing ---------- */

	function renderStatus() {
		const c = counts(data.items);
		summary.textContent = saved
			? t('todo.status', { open: t('todo.statusOpen', { n: c.open }), done: t('todo.statusDone', { n: c.done }) })
			: t('kit.notSaved');
		summary.classList.toggle('is-warn', !saved);
		clearBtn.disabled = !c.done;
		filterBtns.forEach((b, i) => {
			const f = FILTERS[i];
			b.replaceChildren(h('span', { text: t(`todo.${f}`) }), h('span', { class: 'todo-count', text: Desk.i18n.fmtNumber(c[f]) }));
			b.setAttribute('aria-pressed', String(data.filter === f));
		});
	}

	function render(focusId) {
		const shown = visible(data.items, data.filter);
		const movable = data.filter === 'all';
		const moveLabel = t('todo.move', { keys: Desk.i18n.keys('Alt') });
		list.replaceChildren(...shown.map(x => {
			const textId = `${uid}-todo-${x.id}`;
			return h('li', { class: ['todo-item', x.done && 'is-done'], dataset: { id: x.id } },
				movable ? h('button', { type: 'button', class: 'todo-grip', tabindex: '-1', 'aria-label': moveLabel, title: moveLabel }, Desk.icon('ti-grip-horizontal')) : null,
				h('input', { type: 'checkbox', class: 'todo-check', props: { checked: x.done }, 'aria-labelledby': textId }),
				h('span', { class: 'todo-text', id: textId, title: t('todo.edit'), text: x.text }),
				h('button', { type: 'button', class: 'todo-del', 'aria-label': t('todo.deleteNamed', { name: x.text }), title: t('kit.moveToTrash') },
					Desk.icon('ti-x')));
		}));
		if (!shown.length) list.append(h('li', { class: 'todo-empty', text: t(EMPTY[data.filter]) }));
		renderStatus();
		if (focusId) rowOf(focusId)?.querySelector('.todo-check')?.focus();
	}

	function update(fn, focusId) {
		fn();
		persist();
		render(focusId);
	}

	/* ---------- Adding, ticking, filtering ---------- */

	form.addEventListener('submit', e => {
		e.preventDefault();
		const text = input.value.trim().slice(0, MAX_TEXT);
		if (!text) return;
		update(() => {
			data.items.push({ id: newId(), text, done: false, created: Date.now() });
			if (data.filter === 'done') data.filter = 'all';
		});
		input.value = '';
		list.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
	});

	filters.addEventListener('click', e => {
		const b = e.target.closest('.todo-filter');
		if (b) update(() => { data.filter = b.dataset.filter; });
	});

	list.addEventListener('change', e => {
		const li = e.target.closest('.todo-item');
		if (!li || !e.target.matches('.todo-check')) return;
		const x = byId(li.dataset.id);
		if (!x) return;
		update(() => { x.done = e.target.checked; }, data.filter === 'all' ? x.id : null);
	});

	/* Into the trash, no question asked — it can be put back from there */
	function removeItem(id, focusNext) {
		const lis = [...list.querySelectorAll('.todo-item')];
		const i = lis.findIndex(li => li.dataset.id === id);
		const next = lis[i + 1] || lis[i - 1];
		const x = byId(id);
		if (x) Desk.toTrash('todo', x.text, { ...x });
		update(() => { data.items = data.items.filter(y => y.id !== id); }, focusNext ? next?.dataset.id : null);
		/* The list may be empty now: the focus goes back to the input */
		if (focusNext && !next) input.focus({ preventScroll: true });
	}

	list.addEventListener('click', e => {
		const del = e.target.closest('.todo-del');
		if (del) removeItem(del.closest('.todo-item').dataset.id, true);
	});

	/* ---------- Editing in place: double-click, or Enter on the checkbox ---------- */

	function edit(li) {
		const x = byId(li.dataset.id);
		const span = li.querySelector('.todo-text');
		if (!x || !span) return;
		const field = h('input', { type: 'text', class: 'todo-edit', name: 'task-edit', maxlength: String(MAX_TEXT), props: { value: x.text },
			'aria-label': t('todo.edit') });
		editing = x.id;
		span.replaceWith(field);
		field.focus();
		field.select();
		let done = false;
		const finish = keep => {
			if (done) return;
			done = true;
			editing = null;
			const text = field.value.trim();
			if (keep && !text) {
				removeItem(x.id, true);
				return;
			}
			update(() => { if (keep) x.text = text; }, x.id);
		};
		field.addEventListener('keydown', e => {
			e.stopPropagation();
			if (e.key === 'Enter') {
				e.preventDefault();
				finish(true);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				finish(false);
			}
		});
		field.addEventListener('blur', () => finish(true));
	}

	list.addEventListener('dblclick', e => {
		const span = e.target.closest('.todo-text');
		if (span) edit(span.closest('.todo-item'));
	});

	/* ---------- Order ---------- */

	function move(id, delta) {
		const next = moveItem(data.items, id, delta);
		if (next) update(() => { data.items = next; }, id);
	}

	list.addEventListener('keydown', e => {
		if (!e.target.matches('.todo-check')) return;
		const li = e.target.closest('.todo-item');
		const id = li.dataset.id;
		if (e.key === 'Enter') {
			e.preventDefault();
			edit(li);
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			removeItem(id, true);
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			if (e.altKey && data.filter === 'all') move(id, e.key === 'ArrowUp' ? -1 : 1);
			else (e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling)?.querySelector('.todo-check')?.focus();
		}
	});

	/* Drag by the grip: the row follows the pointer between its neighbours */
	list.addEventListener('pointerdown', e => {
		const grip = e.target.closest('.todo-grip');
		if (!grip || e.button !== 0) return;
		e.preventDefault();
		const li = grip.closest('.todo-item');
		grip.setPointerCapture(e.pointerId);
		li.classList.add('is-dragging');
		const moveRow = ev => {
			const siblings = [...list.querySelectorAll('.todo-item:not(.is-dragging)')];
			const below = siblings.find(s => {
				const r = s.getBoundingClientRect();
				return ev.clientY < r.top + r.height / 2;
			});
			if (below) list.insertBefore(li, below);
			else list.append(li);
		};
		const end = () => {
			grip.removeEventListener('pointermove', moveRow);
			grip.removeEventListener('pointerup', end);
			grip.removeEventListener('pointercancel', end);
			li.classList.remove('is-dragging');
			const order = [...list.querySelectorAll('.todo-item')].map(x => x.dataset.id);
			update(() => { data.items = reorder(data.items, order); });
		};
		grip.addEventListener('pointermove', moveRow);
		grip.addEventListener('pointerup', end);
		grip.addEventListener('pointercancel', end);
	});

	/* Completed tasks go to the trash one by one, so each can be put back */
	clearBtn.addEventListener('click', () => {
		const done = data.items.filter(x => x.done);
		if (!done.length) return;
		for (const x of done) Desk.toTrash('todo', x.text, { ...x });
		update(() => { data.items = data.items.filter(x => !x.done); });
		input.focus({ preventScroll: true });
	});

	/* ---------- Other tabs, backups ---------- */

	function reload() {
		persist.cancel();
		data = load();
		saved = true;
		render();
	}

	const offStore = Desk.on('store:change', ({ name, external } = {}) => {
		if (name === KEY && external && !editing) reload();
	});
	const offRestore = Desk.on('storage:restore', ({ names } = {}) => {
		if (names?.includes(KEY)) reload();
	});
	const offReset = Desk.on('storage:reset', ({ groups } = {}) => {
		if (groups?.includes('todos')) reload();
	});

	live = { flush: () => persist.flush(), reload };

	win.state.todo = {
		input, lb, render, persist,
		off() {
			offStore();
			offRestore();
			offReset();
		}
	};
	render();
}

export default {
	id: 'todo',
	kind: 'app',
	i18n: ['todo', 'kit'],
	styles: ['todo.css'],

	app: { icon: 'ti-list-check', tint: 'green', size: [460, 560], name: '@todo.appName', desc: '@todo.appDesc' },

	storage: {
		todos: {
			type: 'json', backup: true, reset: 'todos', label: '@todo.appName', validate: cleanTodos,
			/* "12 (3 open)" — a ready text for the backup and reset summaries */
			count: v => (v.items.length
				? t('todo.countOpen', { tasks: t('todo.tasks', { n: v.items.length }), open: t('todo.statusOpen', { n: counts(v.items).open }) })
				: 0)
		}
	},
	resetGroups: [{ id: 'todos', label: '@todo.appName', hint: '@todo.resetHint', order: 45 }],

	trash: {
		todo: {
			icon: 'ti-list-check', label: '@todo.trashType', app: 'todo',
			restore(x) {
				if (!cleanItem(x)) return false;
				live?.flush();
				const next = restoreItem(load(), x);
				if (!next || !store.setJson(KEY, next)) return false;
				live?.reload();
				return true;
			}
		}
	},

	mount,

	focus(win) {
		const a = document.activeElement;
		if (!win.el.contains(a) || a === win.el) win.state.todo.input.focus({ preventScroll: true });
	},

	relabel(win) {
		win.state.todo.lb.apply();
		win.state.todo.render();
	},

	unmount(win) {
		win.state.todo.persist.flush();
		win.state.todo.off();
		live = null;
	}
};
