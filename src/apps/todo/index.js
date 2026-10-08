/* JPKCom Desktop — Tasks app: one list — add, tick, edit, reorder, filter — © Jean Pierre Kolb — MIT License

   Storage key 'todos' ({ items, filter }, model.js). Editing in place by
   double-click or Enter on the checkbox; reordering by the grip (pointer
   drag) or Alt+↑/↓ (only while all tasks are shown); Delete/Backspace on the
   checkbox and "Remove completed" move tasks to the trash one by one, so each
   can be put back (trash type 'todo'). Other tabs of the desktop stay in sync
   through 'store:change' (external).

   This file is the descriptor; the window is window.js, loaded when it first
   opens (app field load, windowStyles). */

import Desk from '../../core/api.js';
import { cleanTodos, cleanItem, counts, restoreItem } from './model.js';

const { t, store } = Desk;
export const KEY = 'todos';

export const load = () => store.getJson(KEY, cleanTodos, null) ?? { items: [], filter: 'all' };

/* The open window's handle (window.js), once its content is built */
const live = () => Desk.wm?.get('todo')?.state.todo ?? null;

export default {
	id: 'todo',
	kind: 'app',
	i18n: ['todo', 'kit'],
	windowStyles: ['todo.css'],

	app: {
		icon: 'ti-list-check', tint: 'green', size: [460, 560], name: '@todo.appName', desc: '@todo.appDesc',
		load: () => import('./window.js')
	},

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
				live()?.flush();
				const next = restoreItem(load(), x);
				if (!next || !store.setJson(KEY, next)) return false;
				live()?.reload();
				return true;
			}
		}
	}
};
