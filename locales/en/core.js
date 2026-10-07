/* JPKCom Desktop — core strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'core': landmarks, common actions, states, errors and the core
   reset groups. Used as t('core.<key>') — or t('<key>'), core is the default.
   Placeholders are named: {name}. Plural values: { one, other } (plus zero,
   two, few, many or exact '=0' forms where a language needs them). */
export default {
	/* Landmarks */
	desktop: 'Desktop',
	menubar: 'Menu bar',
	dock: 'Dock',

	/* Common actions */
	open: 'Open',
	close: 'Close',
	cancel: 'Cancel',
	ok: 'OK',
	yes: 'Yes',
	no: 'No',
	back: 'Back',
	forward: 'Forward',
	reload: 'Reload',
	show: 'Show',
	search: 'Search',
	download: 'Download',
	copyLink: 'Copy link',
	copied: 'Copied',
	openTab: 'Open in new tab',
	newTab: '{name} (opens in new tab)',
	moreActions: 'More actions',

	/* States */
	loading: 'Loading …',
	noResults: 'No results',
	today: 'Today',
	yesterday: 'Yesterday',
	newMark: '(new)',
	items: { one: '{n} item', other: '{n} items' },
	characters: { one: '{n} character', other: '{n} characters' },
	/* sizes below 1 KB (larger ones use the language's unit names) */
	bytes: '{n} B',

	/* Errors */
	notAvailable: '{name} is not available',
	storageFull: 'Not enough storage in this browser — not saved.',
	offline: 'No connection',
	netTimeout: 'The service did not answer in time.',
	netError: 'The service cannot be reached right now.',

	/* Key names in shortcut hints (i18n.keys('Mod+K') → 'Ctrl+K'; keyboards with a ⌘ key show symbols instead) */
	keyCtrl: 'Ctrl',
	keyAlt: 'Alt',
	keyShift: 'Shift',
	keyMeta: 'Meta',
	keyEnter: 'Enter',
	keyEsc: 'Esc',
	keySpace: 'Space',
	keyTab: 'Tab',
	keyBackspace: 'Backspace',
	keyDelete: 'Del',
	keyPageUp: 'Page Up',
	keyPageDown: 'Page Down',
	keyHome: 'Home',
	keyEnd: 'End',
	keyJoin: '+',

	/* Language */
	language: 'Language',

	/* Project */
	version: 'Version {version}',
	credit: '{product} by {author}',
	license: 'MIT License',
	author: 'Author',

	/* Online services: the question before a service's first request */
	consentTitle: 'Load data from {host}?',
	consentText: 'This feature fetches data from {host}. Its provider then receives your IP address and the usual details your browser sends (such as browser type and language). You can withdraw your consent at any time in the settings.',
	consentAllow: 'Allow',
	consentDeny: 'Not now',
	serviceOff: 'This online service is switched off on this site.',

	/* Reset groups of the core (Settings → Reset) */
	resetSettings: 'Settings',
	resetSettingsHint: 'Language, mode, accent colour, dock options, switches and consents to online services',
	resetSession: 'Windows and notifications',
	resetSessionHint: 'Remembered windows, notifications already shown, cached data of online services'
};
