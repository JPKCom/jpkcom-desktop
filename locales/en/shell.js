/* JPKCom Desktop — shell strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'shell': menu bar, menus, dock, launcher, desktop icons and the
   other parts of src/shell. Used as t('shell.<key>'). */
export default {
	/* Menus */
	brandMenu: '{name} menu',
	contextMenu: 'Context menu',
	menuOf: '{name}: actions',

	/* Brand menu */
	aboutDesktop: 'About this desktop …',
	settingsMore: 'Settings …',
	wallpaperMore: 'Customise wallpaper …',
	backupMore: 'Back up and restore …',
	classicSite: 'Classic website',
	restart: 'Restart …',
	shutdown: 'Shut down …',
	restartAsk: 'Restart the desktop now?',
	restartText: 'The page loads again. Changes in open windows that are not saved yet are lost.',
	restartDo: 'Restart',
	shutdownAsk: 'Shut down the desktop now?',
	shutdownText: 'Changes in open windows that are not saved yet are lost.',
	shutdownDo: 'Shut down',

	/* App, site and Help menus */
	copyDeskLink: 'Copy link to this window',
	openCollection: 'Open {name}',
	help: 'Help',
	howto: 'How it works',

	/* All apps */
	allApps: 'All apps',
	allAppsDesc: 'Every app at a glance, with a search',
	openLauncher: 'Open all apps',
	searchEverywhere: 'Search everywhere for “{q}”',

	/* Clock: the date in the menu bar ({weekday}, {day}, {month} in the language's short forms) */
	clockDate: '{weekday} {day} {month}',
	clockLabel: '{date}, {time}',
	clockLabelCalendar: '{date}, {time}, calendar',

	/* Language switch (two languages). The button's name is langToggle, then
	   langSwitchTo of the OTHER language, in that language (marked with its lang):
	   someone who cannot read this one still finds the switch.
	   langSwitchTo: {name} is this language's own name. */
	langToggle: 'Language: {current}.',
	langSwitchTo: 'Switch to {name}',
	langMenu: 'Language: {current}',

	/* Dock */
	dockAdd: 'Add to Dock',
	dockKeep: 'Keep in Dock',
	dockRemove: 'Remove from Dock',
	dockReset: 'Reset Dock',
	moveLeft: 'Move left',
	moveRight: 'Move right',
	/* Accessible names of dock items with a state (the dot and the full trash only show it) */
	dockOpen: '{name}, open',
	dockMinimised: '{name}, minimised',
	dockTrashFull: { one: '{name}, one item', other: '{name}, {n} items' },

	/* Desktop */
	desktopMenu: 'Desktop',
	wallpaperMenu: 'Wallpaper',
	showIcons: 'Show icons',
	hideIcons: 'Hide icons',

	/* Notification banners */
	notifications: 'Notifications',
	notifClose: 'Close notification',

	/* Files dropped onto the desktop ({list}: what the apps open, e.g. "text in the editor and images in the image viewer") */
	dropTitle: 'Drop to open',
	dropSub: 'Opens {list}',
	dropNope: '“{name}” cannot be opened here',

	/* Shut down */
	powerOff: 'The desktop is switched off',
	powerOn: 'Switch on',

	/* Keyboard shortcuts (help) */
	scSearch: 'Search',
	scOverview: 'Show all windows',
	scNext: 'Next window',
	scNextKeys: 'Ctrl+`',
	scPrevious: 'Previous window',
	scPreviousKeys: 'Ctrl+Shift+`',

	/* Stored values (backup, reset) */
	storeDock: 'Apps in the Dock',
	storeDockSize: 'Dock size',
	storeMagnify: 'Dock magnification',
	storeIcons: 'Desktop icons',
	storeSeconds: 'Clock with seconds',
	resetDock: 'Dock layout',
	resetDockHint: 'Pinned apps and their order'
};
