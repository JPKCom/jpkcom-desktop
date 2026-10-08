/* JPKCom Desktop — Editor app: plain-text documents in tabs — © Jean Pierre Kolb — MIT License

   Tabs (config.editor.maxTabs, default 20), line numbers, word wrap (Alt+Z),
   invisible characters (Alt+I), find and replace (Ctrl/⌘+F, G; regular
   expressions, match case), open and save local files (Ctrl/⌘+O, S,
   Shift+S) — through the File System Access API where the browser has it
   (Save then writes back into the same file), else a file input and a
   download. Every tab's draft survives in storage key 'editor' (model.js).

   One textarea per tab (hidden when not current), so each keeps its own
   undo history, cursor and scroll; gutter, highlight layers and the wrap
   mirror are shared and rebuilt on a tab switch. Replacing goes through
   execCommand('insertText'), so the browser's undo keeps working.

   Alt shortcuts are matched by e.code: on some keyboard layouts Alt+Z types a
   character ("Ω"). Ctrl+T/W/PageUp/PageDown belong to the browser's own tabs,
   hence Alt+T, W, PageUp, PageDown here. A text file dropped on the desktop
   opens in a tab of its own (contribution 'files').

   This file is the descriptor; the window is window.js, loaded when it first
   opens (app field load, windowStyles). */

import Desk from '../../core/api.js';
import { DEFAULTS, cleanDraft, emptyDoc, draftChars } from './model.js';

const { t, store } = Desk;
export const KEY = 'editor';

/** The effective options: DEFAULTS + config.editor (validated by validateConfig) */
export const cfg = () => ({ ...DEFAULTS, ...(Desk.modules.config('editor') ?? {}) });

const validateDraft = v => cleanDraft(v, cfg());

export function loadDraft() {
	const c = cfg();
	return store.getJson(KEY, validateDraft, null) ?? { tabs: [emptyDoc()], current: null, wrap: c.wrap, ws: c.invisibles };
}

export default {
	id: 'editor',
	kind: 'app',
	i18n: ['editor'],
	windowStyles: ['editor.css'],

	app: {
		icon: 'ti-file-text', tint: 'blue', size: [820, 560], name: '@editor.appName', desc: '@editor.appDesc',
		load: () => import('./window.js')
	},

	storage: {
		editor: {
			type: 'json', backup: true, reset: 'editor', label: '@editor.draftLabel', validate: validateDraft,
			/* "1,234 characters" — a ready text for the backup and reset summaries */
			count: v => {
				const n = draftChars(v);
				return n ? t('core.characters', { n }) : 0;
			}
		}
	},
	resetGroups: [{ id: 'editor', label: '@editor.draftLabel', hint: '@editor.resetHint', order: 50 }],

	/* A text file dropped on the desktop: a tab of its own (the shell decides what counts as text) */
	files: {
		text: {
			label: '@editor.dropLabel',
			icon: 'ti-file-text',
			order: 50,
			/* The window may still be loading its code: the file goes in once it is mounted → Promise<boolean> */
			async open(file) {
				if (!Desk.launch('editor')) return false;
				const win = Desk.wm?.get('editor');
				if (!win || !(await win.ready) || Desk.wm.get('editor') !== win) return false;
				return win.state.editor?.openFile(file) ?? false;
			}
		}
	},

	/* Optional config section editor: { maxTabs, maxFileBytes, wrap, invisibles } */
	configKey: 'editor',
	validateConfig(section, warn) {
		const out = {};
		if (!section || typeof section !== 'object' || Array.isArray(section)) {
			if (section != null) warn('must be an object — using the defaults');
			return out;
		}
		const int = (k, min, max) => {
			if (section[k] === undefined) return;
			if (Number.isInteger(section[k]) && section[k] >= min && section[k] <= max) out[k] = section[k];
			else warn(`${k} must be an integer ${min}–${max} — using ${DEFAULTS[k]}`);
		};
		const bool = k => {
			if (section[k] === undefined) return;
			if (typeof section[k] === 'boolean') out[k] = section[k];
			else warn(`${k} must be true or false — using ${DEFAULTS[k]}`);
		};
		int('maxTabs', 1, 100);
		int('maxFileBytes', 1024, 50 * 1024 * 1024);
		bool('wrap');
		bool('invisibles');
		return out;
	},

};
