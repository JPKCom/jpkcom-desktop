/* JPKCom Desktop — "How it works": how to use the desktop, plus its keyboard shortcuts — © Jean Pierre Kolb — MIT License

   The intro is the site description (config.site.description). The rows
   explain what the desktop offers right now — a row about the dock, the
   search or the window overview only appears while that part is loaded —
   and the shortcut list is generated from the shortcuts service
   (shortcuts.list(): { id, keys, display, label }), so it never disagrees
   with the keys that really work. The window overview row names its keys
   (and those of the next window) from the same list.

   The whole file is the window: loaded when it first opens (app field load
   in src/panels/index.js, which also provides the service 'help'). */

import Desk from '../core/api.js';

const { h, t, L } = Desk;

const hasApp = id => {
	const app = Desk.apps.get(id);
	return !!app && Desk.apps.available(app);
};

/* [key, condition] — the text is help.<key>Title / help.<key>Text */
const ROWS = [
	['open', () => true],
	['allApps', () => !!Desk.launcher],
	['search', () => !!Desk.search],
	['context', () => !!Desk.contextmenu],
	['sortDock', () => !!Desk.dock],
	['move', () => !!Desk.wm],
	['resize', () => !!Desk.wm],
	['zoom', () => !!Desk.wm],
	['minimize', () => !!Desk.wm && !!Desk.dock],
	['overview', () => !!Desk.overview],
	['links', () => !!Desk.deeplinks],
	['keyboard', () => !!Desk.menus],
	/* Two apps take Tab over for themselves — and say how to leave them */
	['editorTab', () => hasApp('editor')],
	['terminalTab', () => hasApp('terminal')]
];

function listed() {
	try {
		const list = Desk.shortcuts?.list?.();
		return Array.isArray(list) ? list.filter(s => s && typeof s.keys === 'string') : [];
	} catch {
		return [];
	}
}

/* Ready to show: every combination and the layout hint (Ctrl + ^ / Ctrl + `) come in display */
const comboOf = s => (typeof s.display === 'string' && s.display ? s.display : Desk.i18n.keys(s.keys));

function shortcuts(list) {
	const seen = new Set();
	return list.filter(s => s.label != null).map(s => {
		const label = typeof s.label === 'function' ? s.label() : L(s.label);
		return [comboOf(s), label];
	}).filter(([keys, label]) => {
		if (!label || seen.has(`${keys}|${label}`)) return false;
		seen.add(`${keys}|${label}`);
		return true;
	});
}

/* The overview row as in the original: "F3 or Ctrl + ↑ lays out …, Ctrl + ` switches to the next window" */
function overviewText(list) {
	const find = id => list.find(s => s.id === id);
	/* In a sentence: "F3 or Ctrl+↑" (a list in the language) — unless the display is a layout hint */
	const inText = s => {
		const combos = Array.isArray(s.combos) ? s.combos.filter(k => typeof k === 'string') : [];
		const plain = combos.map(k => Desk.i18n.keys(k));
		return combos.length > 1 && comboOf(s) === plain.join(' / ')
			? Desk.i18n.list(plain, { type: 'disjunction', style: 'long' })
			: comboOf(s);
	};
	const overview = find('overview');
	const next = find('next-window');
	if (overview && next) return t('help.overviewKeysText', { overview: inText(overview), next: inText(next) });
	if (overview) return t('help.overviewKeyText', { overview: inText(overview) });
	return t('help.overviewText');
}

/**
 * The text key and parameters of a row: the search row names its shortcut — or,
 * when the site switched it off (search.shortcut null), the text without keys. Pure.
 */
export function rowText(key, shortcut) {
	if (key !== 'search') return [`help.${key}Text`, {}];
	return typeof shortcut === 'string' && shortcut ? ['help.searchText', { keys: shortcut }] : ['help.searchTextNoKeys', {}];
}

/* The search combination as the search module and the shortcuts service see it */
function searchCombo() {
	const k = Desk.config.search?.shortcut;
	if (k === null || k === false || k === '') return null;
	/* An unusable combination falls back to Mod+K there, so here as well */
	const usable = typeof k === 'string' && (Desk.shortcuts?.parse ? !!Desk.shortcuts.parse(k) : true);
	return Desk.i18n.keys(usable ? k : 'Mod+K');
}

function renderHelp() {
	const list = listed();
	const keys = shortcuts(list);
	const combo = searchCombo();
	const intro = L(Desk.config.site?.description);
	return h('div', { class: 'panel help' },
		h('h2', { text: t('help.title') }),
		intro ? h('p', { text: intro }) : null,
		h('ul', { class: 'help-list' }, ROWS.filter(([, ok]) => ok()).map(([k]) => h('li', {},
			h('b', { text: t(`help.${k}Title`) }),
			h('span', { text: k === 'overview' ? overviewText(list) : t(...rowText(k, combo)) })))),
		keys.length ? [
			h('h3', { text: t('help.shortcuts') }),
			h('ul', { class: 'help-list help-keys' }, keys.map(([combo, label]) => h('li', {},
				h('span', {}, h('kbd', { text: combo })),
				h('span', { text: label }))))
		] : null);
}

export default { render: renderHelp };
