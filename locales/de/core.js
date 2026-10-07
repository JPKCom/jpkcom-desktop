/* JPKCom Desktop — core strings: German — © Jean Pierre Kolb — MIT License
   Keys and placeholders: see locales/en/core.js (the reference locale). */
export default {
	/* Landmarks */
	desktop: 'Schreibtisch',
	menubar: 'Menüleiste',
	dock: 'Dock',

	/* Common actions */
	open: 'Öffnen',
	close: 'Schließen',
	cancel: 'Abbrechen',
	ok: 'OK',
	yes: 'Ja',
	no: 'Nein',
	back: 'Zurück',
	forward: 'Vorwärts',
	reload: 'Neu laden',
	show: 'Anzeigen',
	search: 'Suchen',
	download: 'Herunterladen',
	copyLink: 'Link kopieren',
	copied: 'Kopiert',
	openTab: 'In neuem Tab öffnen',
	newTab: '{name} (öffnet in neuem Tab)',
	moreActions: 'Weitere Aktionen',

	/* States */
	loading: 'Lädt …',
	noResults: 'Keine Treffer',
	today: 'Heute',
	yesterday: 'Gestern',
	newMark: '(neu)',
	items: { one: '{n} Objekt', other: '{n} Objekte' },
	characters: { one: '{n} Zeichen', other: '{n} Zeichen' },
	/* sizes below 1 KB (larger ones use the language's unit names) */
	bytes: '{n} B',

	/* Errors */
	notAvailable: '{name} ist nicht verfügbar',
	storageFull: 'Nicht genug Speicher in diesem Browser — nicht gespeichert.',
	offline: 'Keine Verbindung',
	netTimeout: 'Der Dienst hat nicht rechtzeitig geantwortet.',
	netError: 'Der Dienst ist gerade nicht erreichbar.',

	/* Key names in shortcut hints */
	keyCtrl: 'Strg',
	keyAlt: 'Alt',
	keyShift: 'Umschalt',
	keyMeta: 'Meta',
	keyEnter: 'Eingabe',
	keyEsc: 'Esc',
	keySpace: 'Leertaste',
	keyTab: 'Tab',
	keyBackspace: 'Rücktaste',
	keyDelete: 'Entf',
	keyPageUp: 'Bild↑',
	keyPageDown: 'Bild↓',
	keyHome: 'Pos1',
	keyEnd: 'Ende',
	keyJoin: '+',

	/* Language */
	language: 'Sprache',

	/* Project */
	version: 'Version {version}',
	credit: '{product} von {author}',
	license: 'MIT-Lizenz',
	author: 'Autor',

	/* Online services: the question before a service's first request */
	consentTitle: 'Daten von {host} laden?',
	consentText: 'Diese Funktion holt Daten von {host}. Der Anbieter erhält dabei deine IP-Adresse und die üblichen Angaben deines Browsers (etwa Browsertyp und Sprache). Du kannst deine Zustimmung jederzeit in den Einstellungen widerrufen.',
	consentAllow: 'Erlauben',
	consentDeny: 'Nicht jetzt',
	serviceOff: 'Dieser Online-Dienst ist auf dieser Website abgeschaltet.',

	/* Reset groups of the core (Settings → Reset) */
	resetSettings: 'Einstellungen',
	resetSettingsHint: 'Sprache, Modus, Akzentfarbe, Dock-Optionen, Schalter und Zustimmungen zu Online-Diensten',
	resetSession: 'Fenster und Mitteilungen',
	resetSessionHint: 'Gemerkte Fenster, schon gezeigte Mitteilungen, zwischengespeicherte Daten von Online-Diensten'
};
