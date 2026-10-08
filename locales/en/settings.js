/* JPKCom Desktop — settings strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'settings' (src/panels/settings.js, src/panels/install.js). Accent names are
   'accent.<id>' — a site that adds an accent in config.theme.accents names it here
   (without a name the id is shown). */
export default {
	title: 'Settings',

	/* Sections */
	secGeneral: 'General',
	secLook: 'Appearance',
	secDock: 'Desktop & Dock',
	secOnline: 'Online services',
	secData: 'Data',
	secReset: 'Reset',

	/* General */
	language: 'Language',
	restore: 'Reopen windows on next visit',
	restoreHint: 'Open windows come back with their position and content',
	seconds: 'Show time with seconds',
	secondsHint: 'The clock in the menu bar shows seconds as well',
	install: 'Install as an app',
	installHint: 'Its own window without the browser bar, also offline',
	installBtn: 'Install',
	updateReady: 'A new version of the desktop is ready',
	updateReadyHint: 'Reload to use it',
	'install.installed': 'Installed',
	'install.share': 'Browser share menu: Add to Home Screen',
	'install.menu': 'Browser menu: Install app',
	'install.off': 'Not available',

	/* Appearance */
	theme: 'Mode',
	themeAutoHint: 'Follows the system',
	'theme.dark': 'Dark',
	'theme.light': 'Light',
	'theme.auto': 'Auto',
	accent: 'Accent colour',
	'accent.blue': 'Blue',
	'accent.violet': 'Violet',
	'accent.pink': 'Pink',
	'accent.orange': 'Orange',
	'accent.green': 'Green',
	'accent.teal': 'Teal',
	'accent.graphite': 'Graphite',
	accentCustom: 'Custom colour',
	accentPick: 'Choose a custom accent colour',
	accentCustomName: 'Custom colour {color}',
	accentContrastWhite: '{name} · white text on it ({ratio}:1)',
	accentContrastBlack: '{name} · black text on it ({ratio}:1)',
	wallpaper: 'Wallpaper',
	wallpaperMore: 'Customise wallpaper …',

	/* Desktop & Dock */
	icons: 'Icons on the desktop',
	dockSize: 'Dock size',
	dockSizeHint: 'On phones the dock sizes itself',
	'size.small': 'Small',
	'size.medium': 'Medium',
	'size.large': 'Large',
	magnify: 'Magnification',
	magnifyHint: 'Icons grow under the pointer',
	dockReset: 'Reset Dock',
	dockResetHint: 'The dock’s original set of apps',

	/* Online services */
	onlineIntro: 'These features fetch data from services outside this site. As soon as you use one, its provider receives your IP address and the usual details your browser sends (such as browser type and language). Without your consent everything stays off. This site stores none of it — your choice lives in this browser only.',
	serviceHint: '{hint} · {hosts}',

	/* Data */
	storage: 'Storage used',
	storageHint: 'This browser’s local storage for this site, shared with its other pages (about 5 MB)',
	storageValue: '{own} desktop · {all} in total',
	backupOpen: 'Back up and restore …',
	trashValue: { one: '{n} item', other: '{n} items' },

	/* Reset */
	resetIntro: 'Choose what goes back to its initial state. The desktop restarts afterwards. Data of other pages of this site stays untouched.',
	resetAll: 'Select all',
	resetNone: 'Clear selection',
	resetGo: 'Reset …',
	resetAsk: 'Reset: {names}. This cannot be undone — download a backup first if you want to keep anything.',
	resetAskAll: 'Reset everything: all settings and data of the desktop. This cannot be undone — download a backup first if you want to keep anything.',
	resetBackup: 'Download backup',
	resetDo: 'Reset and restart',
	resetOffline: 'Offline copies',
	resetOfflineHint: 'App files and pages read',
	resetOfflineState: 'loaded fresh on restart',
	hintState: '{hint} · {state}',
	stateDefault: 'default',
	stateEmpty: 'empty',
	stateCount: { one: '{n} entry', other: '{n} entries' },
	stateStored: 'stored',
	stateCustom: 'customised'
};
