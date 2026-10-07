/* JPKCom Desktop — Fortune app strings: German — © Jean Pierre Kolb — MIT License

   Namespace 'fortune' (src/apps/fortune). Placeholders: {host} host name(s) of
   the online source, {provider} its name, {language} a language name,
   {name} a signature, {space}/{back}/{next} key names and arrows. */
export default {
	appName: 'Glückskeks',
	appDesc: 'Tipps, Tastenkürzel und ein bisschen Witz — einer nach dem anderen',

	/* Controls */
	source: 'Quelle',
	sourceLocal: 'Eingebaute Sprüche',
	category: 'Kategorie',
	any: 'Alle Kategorien',
	next: 'Nächster Spruch',
	retry: 'Erneut versuchen',
	prev: 'Vorheriger Spruch',
	copy: 'Spruch kopieren',
	copied: 'Kopiert',
	web: 'Mehr dazu',
	privacy: 'Datenschutz und Einstellungen …',
	by: '— {name}',
	keys: '{space} oder N: nächster Spruch · {back}: vorheriger',

	/* States */
	loading: 'Der Keks wird geknackt …',
	error: '{host} antwortet gerade nicht. Versuch es gleich noch einmal.',
	localError: 'Die Sprüche ließen sich nicht laden.',
	empty: 'In dieser Kategorie gibt es noch nichts.',
	offline: 'Keine Internetverbindung.',

	/* The question before an online source is used */
	askTitle: 'Bevor etwas geladen wird',
	askText: 'Die Texte von {provider} kommen von {host}, einem Dienst außerhalb dieser Website. Sobald du sie lädst, erhält dessen Betreiber deine IP-Adresse und die üblichen Angaben deines Browsers (etwa Browsertyp und Sprache). Diese Website speichert davon nichts.',
	askText2: 'Deine Wahl gilt für diesen Browser — zurücknehmen kannst du sie jederzeit in den Einstellungen unter „Online-Dienste“.',
	askLang: 'Die Texte sind auf {language}.',
	allow: 'Einverstanden, laden',
	deny: 'Lieber die eingebauten Sprüche',
	toSettings: 'Einstellungen öffnen',

	/* Terminal-Befehl `fortune` */
	cmd: 'ein Spruch aus dem Glückskeks',
	cmdMan: 'Gibt einen der eingebauten Sprüche der Glückskeks-App aus, mit Signatur, wenn er eine hat — wie der klassische Befehl. Die Online-Quelle der App wird hier nie gefragt.',

	/* Settings, backup */
	service: 'Glückskeks: Witze und Fakten aus dem Netz',
	serviceHint: 'Die App fragt vor der ersten Anfrage selbst nach',
	storageLabel: 'Glückskeks-Quelle',

	/* Online sources */
	providerFacts: 'Unnütze Fakten',
	catProgramming: 'Programmieren',
	catMisc: 'Verschiedenes',
	catPun: 'Wortspiele',
	catSpooky: 'Gruseliges',
	catChristmas: 'Weihnachten'
};
