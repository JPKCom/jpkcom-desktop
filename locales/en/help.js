/* JPKCom Desktop — "How it works" strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'help' (src/panels/help.js). Each row is <key>Title + <key>Text; a row is
   shown only while the part it explains is loaded. {keys}: the search shortcut;
   searchTextNoKeys replaces searchText when the site has none (search.shortcut: null). */
export default {
	appName: 'How it works',
	title: 'How it works',
	shortcuts: 'Keyboard shortcuts',

	openTitle: 'Open',
	openText: 'Double-click an icon, tap it on a touchscreen, or click it in the Dock',
	allAppsTitle: 'All apps',
	allAppsText: 'The first icon in the Dock shows every app with a search; Esc closes it',
	searchTitle: 'Search',
	searchText: '{keys}, / or the magnifier in the menu bar: search apps, collections and pages',
	searchTextNoKeys: '/ or the magnifier in the menu bar: search apps, collections and pages',
	contextTitle: 'Right-click',
	contextText: 'Or long press: menus for the desktop, the Dock, icons and title bars — also to add apps to the Dock or remove them, arrange windows or close the others',
	sortDockTitle: 'Sort the Dock',
	sortDockText: 'Drag the icons, or press Alt + arrow keys on one',
	moveTitle: 'Move',
	moveText: 'Drag a window by its title bar',
	resizeTitle: 'Resize',
	resizeText: 'Drag any edge or corner of a window',
	zoomTitle: 'Zoom',
	zoomText: 'Double-click the title bar or use the zoom button of the window controls',
	minimizeTitle: 'Minimise',
	minimizeText: 'The minimise button puts the window into the Dock; click the Dock to bring it back',
	overviewTitle: 'All windows',
	overviewText: 'The window overview lays out every window side by side; arrow keys pick one, Enter opens it',
	overviewKeyText: '{overview} lays out every window side by side; arrow keys pick one, Enter opens it',
	overviewKeysText: '{overview} lays out every window side by side, {next} switches to the next window',
	linksTitle: 'Links',
	linksText: 'The address bar always shows the active window — copy it to share. The browser’s Back closes the window opened last',
	keyboardTitle: 'Keyboard',
	keyboardText: 'Tab reaches the menu bar, arrow keys move through menus, Esc closes them',
	editorTabTitle: 'Tab in the editor',
	editorTabText: 'In the editor Tab inserts a tab; press Esc first, then Tab moves on',
	terminalTabTitle: 'Tab in the terminal',
	terminalTabText: 'In the terminal Tab completes a command; on an empty line Tab moves on'
};
