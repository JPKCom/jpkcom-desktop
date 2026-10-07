/* JPKCom Desktop — window manager strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'wm': window controls, layouts, the Window menu, the overview.
   Used as t('wm.<key>'). */
export default {
	/* Window controls */
	close: 'Close',
	minimize: 'Minimise to Dock',
	zoom: 'Zoom',

	/* Layouts */
	tileLeft: 'Move to left half',
	tileRight: 'Move to right half',
	tileBoth: 'Tile side by side',
	tileMenu: 'Arrange window',

	/* Window menu */
	window: 'Window',
	closeAll: 'Close all windows',
	closeOthers: 'Close other windows',
	showAll: 'Show all windows',
	nextWindow: 'Next window',
	noWindows: 'No open windows',
	quit: 'Quit {name}',

	/* Overview: the screen reader hint when it opens (its name in menus and shortcut lists: shell.scOverview, wm.showAll) */
	overviewHint: {
		one: 'Window overview: {n} window. Arrow keys select, Enter opens, Esc closes.',
		other: 'Window overview: {n} windows. Arrow keys select, Enter opens, Esc closes.'
	},

	/* Session: the windows come back on the next visit (settings switch, storage labels) */
	restoreWins: 'Reopen windows on next visit',
	sessionLabel: 'Remembered windows',

	/* Browser tab title while a window is active */
	docTitle: '{name} — {brand}'
};
