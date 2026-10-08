/* JPKCom Desktop — Fortune app strings: English (reference locale) — © Jean Pierre Kolb — MIT License

   Namespace 'fortune' (src/apps/fortune). Placeholders: {host} host name(s) of
   the online source, {provider} its name, {language} a language name,
   {name} a signature, {space}/{back}/{next} key names and arrows. */
export default {
	appName: 'Fortune',
	appDesc: 'Tips, shortcuts and a little wit — one at a time',

	/* Controls */
	source: 'Source',
	sourceLocal: 'Built-in sayings',
	category: 'Category',
	any: 'All categories',
	next: 'Next fortune',
	retry: 'Try again',
	prev: 'Previous fortune',
	copy: 'Copy fortune',
	copied: 'Copied',
	web: 'Learn more',
	privacy: 'Privacy and settings …',
	by: '— {name}',
	keys: '{space} or N: next · {back}: previous',

	/* States */
	loading: 'Cracking the cookie …',
	error: '{host} is not answering right now. Please try again in a moment.',
	localError: 'The sayings could not be loaded.',
	empty: 'Nothing in this category yet.',
	offline: 'No internet connection.',
	noSource: 'No source is available for this app right now.',

	/* The question before an online source is used */
	askTitle: 'Before anything is fetched',
	askText: 'The texts of {provider} come from {host}, a service outside this site. As soon as you load them, its operator receives your IP address and the usual details your browser sends (such as browser type and language). This site stores none of this.',
	askText2: 'Your choice applies to this browser — you can take it back at any time in Settings under “Online services”.',
	askLang: 'The texts are in {language}.',
	allow: 'Agree and load',
	deny: 'No, use the built-in sayings',
	denyOnline: 'No, thanks',
	toSettings: 'Open settings',

	/* Terminal command `fortune` */
	cmd: 'a saying from the fortune cookie',
	cmdMan: 'Prints one of the built-in sayings of the Fortune app, with its signature when it has one — like the classic command. The online source of the app is never asked here.',

	/* Settings, backup */
	service: 'Fortune: jokes and facts from the web',
	serviceHint: 'The app asks by itself before the first request',
	storageLabel: 'Fortune source',

	/* Online sources */
	providerFacts: 'Useless Facts',
	catProgramming: 'Programming',
	catMisc: 'Miscellaneous',
	catPun: 'Puns',
	catSpooky: 'Spooky',
	catChristmas: 'Christmas'
};
