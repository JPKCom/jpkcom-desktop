/* JPKCom Desktop — Notes app: many short texts, the first line is the title — © Jean Pierre Kolb — MIT License

   A list of notes (newest first, searchable) beside the text of the current
   one; on phones and in a narrow window (notes.css container query) the
   list and the text take turns (.is-detail). Storage key
   'notes' (model.js). An emptied note disappears once you move on, as in
   common notes apps. Deleting moves a note to the trash without a question
   (trash type 'note' puts it back). Other tabs of the desktop stay in sync
   through 'store:change' (external).

   This file is the descriptor; the window is window.js, loaded when it first
   opens (app field load, windowStyles). */

import Desk from '../../core/api.js';
import { cleanNotes, cleanNote, restoreNote } from './model.js';

const { store } = Desk;
export const KEY = 'notes';

export const load = () => store.getJson(KEY, cleanNotes, null) ?? { notes: [], current: null };

/* The open window's handle (window.js), once its content is built */
const live = () => Desk.wm?.get('notes')?.state.notes ?? null;

export default {
	id: 'notes',
	kind: 'app',
	i18n: ['notes', 'kit'],
	windowStyles: ['notes.css'],

	app: {
		icon: 'ti-note', tint: 'orange', size: [780, 520], name: '@notes.appName', desc: '@notes.appDesc',
		load: () => import('./window.js')
	},

	storage: {
		notes: { type: 'json', backup: true, reset: 'notes', label: '@notes.appName', validate: cleanNotes, count: v => v.notes.length }
	},
	resetGroups: [{ id: 'notes', label: '@notes.appName', hint: '@notes.resetHint', order: 40 }],

	trash: {
		note: {
			icon: 'ti-note', label: '@notes.trashType', app: 'notes',
			restore(n) {
				if (!cleanNote(n)) return false;
				live()?.flush();
				const next = restoreNote(load(), n);
				if (!next || !store.setJson(KEY, next)) return false;
				live()?.reload(next.current);
				return true;
			}
		}
	}
};
