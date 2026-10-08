/* JPKCom Desktop — site configuration — © Jean Pierre Kolb — MIT License

   The one file a site owner edits (together with site/apps.js and the
   content under site/). It is a classic script, loaded before everything else,
   so the pre-paint script (src/boot/theme.js) can read it too.

   Every key is optional: whatever is missing falls back to the defaults in
   src/core/config.js (which mirror the values written out below). Invalid
   values are reported in the browser console and replaced by the default.
   Two values show the example site instead of the generic default:
   site.legal (default []) and notify.app (default 'about') — they name apps
   of the example manifest (site/apps.js: imprint, privacy, changelog).
   `npm run validate` checks such app references against site/apps.js.

   Merge rules: objects merge key by key with the defaults; arrays and plain
   values replace them; language maps ({ de: …, en: … }) replace as a whole.
   In theme.accents, theme.tints and services, null removes a default entry.

   Texts that differ per language are written as { en: '…', de: '…', … } —
   any language code works; the lookup falls back lang → base language →
   defaultLang → 'en' → the first value. */

window.DESKTOP_CONFIG = {

	/* Prefix of every localStorage key ('jpkdesk-theme'), IndexedDB name, Cache name and DOM event
	   ('jpkdesk:lang:change'). Change it when several desktops share one origin. [a-z][a-z0-9-], max 24 */
	namespace: 'jpkdesk',

	/* More console output: missing translations, skipped manifest entries, placeholder modules */
	debug: false,

	/* ---------- Brand: how the desktop names itself ----------
	   The JPK monogram and the JPKCom logo (glyph 'jpk', logo 'jpkcom', the default asciiLogo,
	   assets/icons/, the author-monogram/author-emblem motifs) are brand assets, not MIT: show them
	   unchanged as this desktop's default brand, or replace them for your own identity (CREDITS.md). */
	brand: {
		name: 'JPKCom Desktop',        // document title, hidden page heading, About, terminal, backup error message (backup file names: backup.filePrefix)
		shortName: 'JPK Desktop',      // iOS home-screen title (set at runtime); keep equal to short_name in manifest.webmanifest, the installed app title, which nothing can change at runtime
		menuLabel: 'JPKCom',           // accessible name of the brand menu in the menu bar
		glyph: 'jpk',                  // monochrome brand glyph: icon id (sprite) — 'jpk' is the JPK monogram
		logo: 'jpkcom',                // detailed logo (About, tiles with logo: true): a logo id, null = glyph only
		asciiLogo: null,               // terminal neofetch art: array of lines, null = the JPK default
		host: null,                    // host name shown in the terminal prompt, null = location.hostname
		themeColor: '#1c2935'          // browser UI colour (<meta name="theme-color">)
	},

	/* ---------- Author: the credit that stays visible (About, boot, terminal, README) ---------- */
	author: {
		name: 'Jean Pierre Kolb',
		brand: 'JPKCom',
		url: 'https://www.jpkc.com/',
		/* Profile links: each becomes a link app 'author-<id>' (dock: true pins it by default) */
		links: [
			{ id: 'github', name: 'GitHub', icon: 'ti-brand-github', tint: 'black', url: 'https://github.com/JPKCom', dock: true,
				label: { en: 'JPKCom on GitHub', de: 'JPKCom auf GitHub' } },
			{ id: 'mastodon', name: 'Mastodon', icon: 'ti-brand-mastodon', tint: 'indigo', url: 'https://mastodon.social/@JPKCom', dock: true,
				label: { en: 'JPKCom on Mastodon', de: 'JPKCom auf Mastodon' } }
		]
	},

	/* "JPKCom Desktop by Jean Pierre Kolb" in About, boot screen and terminal. Please keep it. */
	credit: true,

	/* ---------- Languages ---------- */
	/* Codes with a folder in locales/ (locales/README.md explains how to add one), in menu order.
	   Two languages show a toggle in the menu bar, three or more a menu. */
	languages: ['de', 'en'],
	/* Used when the browser asks for none of the languages above; also the second fallback for texts */
	defaultLang: 'en',

	/* ---------- Site ---------- */
	site: {
		data: 'site/apps.js',          // the manifest: apps, collections, menus, files
		origin: null,                  // the public origin, for links shared from the desktop (null = current)
		hosts: [],                     // own host names: absolute links to them count as internal (e.g. ['www.example.org'])
		home: null,                    // "Classic website" entry: a URL or { en: '/', de: '/de/' } (null = hidden)
		/* Menu entries for imprint/privacy below "Classic website" in the brand menu: app ids or
		   { label: { en, de }, url }. The example site ships both as templates (site/content/<lang>/imprint.html,
		   privacy.html) — fill them in before publishing. On phones, entries a site menu already offers are
		   not repeated. (default []) */
		legal: ['imprint', 'privacy'],
		description: {
			en: 'A desktop-style web interface — windows, dock and apps in the browser.',
			de: 'Eine Weboberfläche im Stil eines Desktops — Fenster, Dock und Apps im Browser.'
		},
		/* Extra routing rules for same-origin links, checked first:
		   { match: '^/demo/?$', app: 'demo' }   a regular expression on the path → an app
		   { prefix: 'downloads/', tab: true }   a path prefix (relative to the desktop) → new tab
		   { match: '^/docs/', page: true }      → the Reader */
		routes: [],
		/* Page app for same-origin pages no other page app claims (null = open them in a new tab) */
		defaultPageApp: 'about'
	},

	/* ---------- About this desktop ---------- */
	about: {
		/* Rows shown INSTEAD of the automatic ones (system, apps, languages, licence): [{ label, value }]
		   or { en: [...], de: [...] }; null = automatic (the version is always shown under the name).
		   value: a text, or its parts [text | { text, lang?, abbr? }] — abbr becomes <abbr title>, lang
		   <span lang>: [{ text: 'HTML', abbr: 'Hypertext Markup Language' }, ', ', { text: 'Vanilla JavaScript', lang: 'en' }] */
		rows: null,
		moreInfo: null,                // "More information …" button: an app id or a URL on this site or https; null = no button
		/* holder: a name, or its parts [{ text, lang }] (joined with spaces; each part with a lang becomes
		   <span lang>, so screen readers pronounce it right) */
		copyright: { holder: 'Jean Pierre Kolb', since: 2026 }
	},

	/* ---------- Appearance ---------- */
	theme: {
		default: 'dark',               // 'dark' | 'light' | 'auto' (follows the system) — until the user chooses
		accent: 'blue',                // an accent id below, or '#rrggbb' when allowCustomAccent is true
		allowCustomAccent: true,       // offers a colour picker; text on it turns black or white for contrast
		/* Accent colours: id → '#rrggbb'. White text needs ≥ 4.5:1 on them. Add your own, null removes one.
		   Name them in the 'settings' locale namespace as 'accent.<id>' (otherwise the id is shown). */
		accents: {
			blue: '#3571c0',
			violet: '#7853d8',
			pink: '#c5306f',
			orange: '#b35412',
			green: '#23813f',
			teal: '#0f7d78',
			graphite: '#626e79'
		},
		/* App tile gradients: id → [top, bottom]. Apps use them as tint: 'blue' (or a pair directly) */
		tints: {
			slate: ['#8497a9', '#3c4955'],
			blue: ['#56adff', '#1c62d6'],
			orange: ['#ffb547', '#ef6420'],
			teal: ['#45d8c4', '#0e8783'],
			pink: ['#ff78aa', '#d0266a'],
			violet: ['#a476ff', '#5a2dd4'],
			black: ['#454552', '#0a0a10'],
			indigo: ['#7a7bff', '#563acc'],
			graphite: ['#a2acb6', '#58626c'],
			green: ['#52d879', '#1b9245']
		},
		/* Window controls: side 'left' | 'right', style 'classic' (coloured dots) | 'minimal' (monochrome glyphs) */
		windowControls: { side: 'left', style: 'classic' }
	},

	/* Site icon sets: your own icons next to Tabler — JSON files (format: docs/ARCHITECTURE.md §13), paths
	   relative to the installation root ('site/icon-sets/x.json'), at most 8; loaded before the modules, kept
	   offline by the service worker. Their ids ('<prefix>-<name>', a prefix of your own) work everywhere a
	   Tabler id does (site/apps.js, vault data, brand.glyph). Two-tone icons: tune --icon-duo-opacity /
	   --icon-duo-color in site/theme.css. A set's licence is your business — the project ships none, and
	   site/icon-sets/ is git-ignored in the public repository.
	   Example: iconSets: ['site/icon-sets/duotone.json'] */
	iconSets: [],

	/* ---------- Wallpaper ---------- */
	wallpaper: {
		/* Until the user picks one: { type: 'gradient', from, to, dir } | { type: 'color', color }
		   | { type: 'svg', id: <motif> } | { type: 'image', id: <image id> }.
		   dir: 'glow' (light from the top) | 'down' | 'diag' | 'radial' */
		default: { type: 'gradient', from: '#3c4955', to: '#0c1925', dir: 'glow' },
		/* Generated SVG motifs offered, in this order (author-monogram and author-emblem show the JPK
		   monogram and logo, brand assets: drop them for your own identity, see CREDITS.md). The original ids
		   'monogram', 'emblem', 'blueprint' are accepted as aliases of author-* (stored values, old backups) */
		motifs: ['author-monogram', 'author-emblem', 'author-blueprint', 'waves', 'dunes', 'aurora', 'orbit', 'horizon', 'graphite'],
		colors: [
			{ id: 'slate', color: '#3c4955', name: { en: 'Slate', de: 'Schiefer' } },
			{ id: 'midnight', color: '#0f1c29', name: { en: 'Midnight', de: 'Mitternacht' } },
			{ id: 'graphite', color: '#2a2d33', name: { en: 'Graphite', de: 'Graphit' } },
			{ id: 'petrol', color: '#0f4c52', name: { en: 'Petrol', de: 'Petrol' } },
			{ id: 'fir', color: '#1d3b2e', name: { en: 'Fir', de: 'Tanne' } },
			{ id: 'plum', color: '#3a2748', name: { en: 'Plum', de: 'Pflaume' } },
			{ id: 'bordeaux', color: '#4a1f2a', name: { en: 'Bordeaux', de: 'Bordeaux' } },
			{ id: 'sand', color: '#8c7a62', name: { en: 'Sand', de: 'Sand' } }
		],
		gradients: [
			{ id: 'jpkcom', from: '#3c4955', to: '#0c1925', dir: 'glow', name: 'JPKCom' },
			{ id: 'slate', from: '#596c7e', to: '#0c1925', dir: 'diag', name: { en: 'Slate', de: 'Schiefer' } },
			{ id: 'ocean', from: '#2b6cb0', to: '#0b1a33', dir: 'diag', name: { en: 'Ocean', de: 'Ozean' } },
			{ id: 'sunset', from: '#f28c6b', to: '#4b2c7a', dir: 'down', name: { en: 'Sunset', de: 'Abendrot' } },
			{ id: 'lagoon', from: '#1fa2a6', to: '#1b2447', dir: 'diag', name: { en: 'Lagoon', de: 'Lagune' } },
			{ id: 'lavender', from: '#8e7ad6', to: '#221a3d', dir: 'radial', name: { en: 'Lavender', de: 'Lavendel' } },
			{ id: 'forest', from: '#4f8a5b', to: '#0f2417', dir: 'down', name: { en: 'Forest', de: 'Wald' } }
		],
		/* Image wallpapers: { id, src: 'site/wallpapers/x.webp' (relative or root path, no scheme or //host —
		   CSP img-src 'self'), name: { en, de }, credit: '…', tone: 'light' | 'dark' }
		   tone (default 'dark'): set 'light' for a bright picture — the menu bar gets its darker glass and
		   the desktop icon labels a backing, so their white text stays readable on light ground */
		images: [],
		/* Heavy effects (blur in the aurora motif): 'auto' (off with reduced motion) | 'on' | 'off' */
		reducedEffects: 'auto'
	},

	/* ---------- Interface ---------- */
	ui: {
		animMs: 240,                   // window animations (ms); reduced motion skips them
		/* Compact (phone) layout: the only breakpoint, read by CSS through body.compact */
		compactQuery: '(max-width: 760px), (max-height: 520px) and (pointer: coarse)'
	},

	/* ---------- Windows ---------- */
	wm: {
		gap: 6,                        // px between tiled windows and the screen edge
		minSize: [280, 180],           // smallest window (px)
		defaultSize: [1040, 720],      // largest default size of a new window (px, capped by the screen)
		cascade: 26,                   // offset between new windows (px)
		snap: true,                    // drag to an edge to tile; false switches edge snapping off
		snapEdge: [8, 18],             // edge width that triggers snapping: [mouse, touch] (px)
		tileMenu: { delay: 450, hideDelay: 250 },   // tile menu on the zoom button: delays (ms), or false to switch it off
		doubleTapMs: 350,              // double tap on a title bar zooms
		/* iframe windows (kind 'web'): permissions policy and sandbox (per app: app.allow, app.sandbox).
		   Pages from another origin are already isolated by the browser. A page on the desktop's
		   own origin is fully trusted: it can read the stored data and use a kept vault key — serve
		   only your own code there, or give an untrusted page sandbox: 'allow-scripts' (never
		   together with 'allow-same-origin'). docs/deploy.md §3 "Same origin = full trust" */
		iframe: { allow: 'fullscreen; clipboard-write', sandbox: null }
	},
	overview: { labelHeight: 30, padding: [12, 40] },          // window overview: label height, padding [compact, normal]
	session: { restore: true, debounceMs: 400, maxWindows: 20 }, // reopen windows on the next visit (users can switch it off); 0 maxWindows keeps no windows
	/* pins: app ids in order, null = apps with dock: true; max: the most apps a person can pin to the Dock
	   (the stored list is cut there) */
	dock: { size: 'medium', magnify: false, pins: null, max: 60 },
	desktop: { icons: true },                                   // icons on the desktop (apps with desktop: true)
	boot: { enabled: true, ms: 1100 },                          // boot screen once per browser session
	/* "Shut down" goes here — a URL or { en: …, de: … } (http(s) or a path relative to the desktop);
	   null = an off screen with a power button that starts the desktop again */
	power: { shutdownUrl: null },

	/* ---------- Modules and apps ---------- */
	/* Optional modules in src/modules/<id>/ — leave one out and it is not loaded at all.
	   Available: reader, viewer, catalog, search, calendar, holidays, weather, notify, vault.
	   Own modules: { id: 'mine', src: 'site/modules/mine/index.js' } */
	modules: ['reader', 'viewer', 'catalog', 'search', 'calendar', 'notify'],
	/* Apps in src/apps/<id>/: editor, notes, todo, calc, terminal, media (audio + video), fortune */
	apps: ['editor', 'notes', 'todo', 'calc', 'terminal', 'media', 'fortune',
		/* A site app: lives in site/modules/hello/ with its own texts and CSS — a template for your own
		   (copy the folder, see the comment at the top of its index.js); remove the line to drop it */
		{ id: 'hello', src: 'site/modules/hello/index.js' }],

	/* ---------- Online services ---------- */
	/* Features that contact other servers. false = not offered on this site at all; true = offered,
	   and each user still has to agree before the first request. Every host you switch on must also
	   be allowed in the Content-Security-Policy (connect-src) of your server. */
	services: {
		weather: false,                // weather in the menu bar and calendar; add the provider host (api.open-meteo.com or api.brightsky.dev) to connect-src
		geolocation: false,            // "Use my location" for the weather (needs Permissions-Policy geolocation=(self))
		fortune: false,                // online source for the Fortune app (fortune.remote); allow its host in connect-src
		dns: false                     // dig / host / nslookup in the terminal (terminal.doh)
	},

	/* ---------- Module settings ---------- */

	/* Reader: how content is taken out of a fetched page. First matching rule wins.
	   match: a path prefix relative to the desktop's folder ('site/content/' works in a sub-folder
	   install too; '/…' is an absolute path on this host) or a regular expression on the absolute
	   path, written as a string starting with '^'.
	   content: a selector list tried in order; a title outside the content becomes the heading above the
	   page, a lead outside goes under that heading; a lead inside is marked .reader-lead. Invalid
	   selectors and regular expressions are reported and skipped. */
	reader: {
		rules: [{ match: 'site/content/', content: 'main article, article, main', title: 'h1', lead: '.lead' }],
		titleSeparator: '\\s[|—–]\\s', // splits "Page | Site" titles
		cacheSize: 24                  // pages kept in memory (one cache shared by all Reader windows; 0 = none, max 200)
	},

	/* Search (Mod+K, '/', the magnifier in the menu bar).
	   pagefind: null, or the full-text index of the site's pages { path: 'pagefind/pagefind.js' (same origin,
	     relative to the root or /…), excerptLength: 16, maxHits: 8, label: { en, de } (default "Full-text
	     search"), order: 900 } — needs 'wasm-unsafe-eval' in the CSP (npm run serve -- --wasm).
	   maxPerGroup: rows per group (1–50).
	   shortcut: a key combination such as 'Mod+K' (Mod = ⌘ or Ctrl), null = none; a search module's own
	     shortcut with the id 'search' replaces the built-in one. */
	search: { pagefind: null, maxPerGroup: 6, shortcut: 'Mod+K' },

	/* Notifications from a JSON Feed per language (https://www.jsonfeed.org/) */
	notify: {
		feeds: { en: 'site/data/feed.en.json', de: 'site/data/feed.de.json' },
		app: 'changelog',              // page app that opens feed items (the example feed is the project changelog); null = the router decides (default 'about')
		hideMs: 9000,                  // banners hide after (ms)
		maxBanners: 3,
		pathPrefix: null               // only feed items whose URL starts with this path (relative to the desktop's folder, e.g. 'site/content/'), null = all
	},

	/* Public holidays in the calendar: a region id from src/modules/holidays/regions/ (e.g. 'de-by'), null = none */
	holidays: { region: null },

	/* Calendar: firstDay 'auto' (from the language) or 1–7 (1 = Monday); ISO week numbers */
	calendar: { firstDay: 'auto', weekNumbers: true },

	/* Weather (needs services.weather): provider 'open-meteo' (worldwide) or 'brightsky' (Germany only) */
	weather: {
		provider: 'open-meteo',
		units: 'metric',               // 'metric' | 'imperial'
		defaultPlace: 'berlin',
		places: [
			{ id: 'berlin', name: 'Berlin', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' },
			{ id: 'london', name: 'London', lat: 51.507, lon: -0.128, tz: 'Europe/London' },
			{ id: 'new-york', name: 'New York', lat: 40.713, lon: -74.006, tz: 'America/New_York' },
			{ id: 'tokyo', name: { en: 'Tokyo', de: 'Tokio' }, lat: 35.676, lon: 139.65, tz: 'Asia/Tokyo' },
			{ id: 'sydney', name: 'Sydney', lat: -33.869, lon: 151.209, tz: 'Australia/Sydney' }
		],
		freshMs: 900000,               // fetch again after 15 minutes
		maxAgeMs: 10800000,            // never show data older than 3 hours
		everyMs: 1800000               // refresh every 30 minutes while the page is visible
	},

	/* Fortune app: local sayings from <dir><lang>.json (site/data/fortunes/en.json, …; format in
	   docs/packages/p11-fortune-site.md).
	   langs: the languages that have such a file — only these are fetched (a language without one
	   falls back along its chain, e.g. to 'en', without a 404); null = try every language.
	   remote: an online source, which needs services.fortune and its host in your CSP connect-src:
	     'jokeapi' (v2.jokeapi.dev), 'uselessfacts' (uselessfacts.jsph.pl) or the id of a provider your
	     own module adds (fortuneProviders in its descriptor); null = local only.
	   local: false = no local sayings at all, only the online source (needs remote; dir and langs
	     are then unused).
	   block: category ids that are never shown, locally or online, e.g. ['spooky']
	   texts: replaces texts that name the app, e.g. after renaming it in site/apps.js:
	     { next: { en: 'Next fact', de: 'Nächster Fakt' } } — keys in docs/packages/p11-fortune-site.md */
	fortune: { remote: null, local: true, dir: 'site/data/fortunes/', langs: ['de', 'en'], block: [], texts: {} },

	/* Audio and video players: maxItems = longest playlist (1–1000), seekStep = seconds the ←/→ keys
	   jump (1–60). Files stay on the device; nothing is stored. */
	media: { maxItems: 200, seekStep: 5 },

	/* Editor: tabs at most (1–100), largest file that opens in bytes (1 KB–50 MB), word wrap and
	   invisible characters until the user chooses */
	editor: { maxTabs: 20, maxFileBytes: 5242880, wrap: false, invisibles: true },

	/* Calculator: calculations kept in the history (0–500; 0 keeps none) */
	calc: { historySize: 50 },

	/* Terminal.
	   user: prompt user of a guest ([A-Za-z0-9._-], 1–32 characters). eggs: hidden fun commands.
	   historySize: stored command lines (0–1000).
	   doh: DNS-over-HTTPS resolver for dig/host/nslookup (needs services.dns) — null or
	     { url: 'https://dns.google/resolve', name: 'dns.google' }   (a JSON API: Accept: application/dns-json;
	   https only). Its host must also be allowed in your server's Content-Security-Policy connect-src.
	   manUrl: null, or a Markdown path template for `man <entry>` with {slug} or {id} (also {collection},
	     {lang}) — or { en: '…', de: '…' } — used for items of the site's collections whose collection sets
	     no man (see site/apps.js; never for the vault's bookmarks); e.g. 'site/docs/{lang}/{slug}.md'. Items and collections name their own manual with
	     man; an item's docs that is a .md/.txt on this site is still printed while it has no man. */
	terminal: { user: 'guest', doh: null, eggs: true, historySize: 100, manUrl: null },

	trash: { days: 30, max: 200 },     // deleted notes and tasks stay this long / at most this many
	/* Backup files: format id (checked on import), file name prefix, largest accepted file (bytes) */
	backup: { format: 'jpkcom-desktop-backup', filePrefix: 'jpkcom-desktop', maxBytes: 5242880 },
	/* Private bookmarks (module 'vault' — add 'vault' to modules).
	   salt: a random value of your own per deployment (node tools/seal-vault.mjs --new-salt); empty = the
	     public default salt, warned about in the console and by the tool. Changing salt or iterations
	     renames every sealed file (seal again).
	   iterations: PBKDF2 rounds, 10000–10000000 (600000 recommended).
	   dir: where the sealed .bin files lie (serve it without directory listing, Cache-Control: no-cache).
	   collection: the collection (site/apps.js) the unlocked bookmarks join — created by the vault while
	     unlocked if the site has none.
	   maxBytes: largest sealed file accepted. Icons used only inside sealed data go into site/icons.json.
	   How to seal: site/vault/README.md (npm run seal). */
	vault: { salt: '', iterations: 600000, dir: 'site/vault/', collection: 'bookmarks', maxBytes: 1048576 },
	/* Installable as an app and offline copies (sw.js at the installation root, registered only in a
	   secure context and when index.html has <link rel="manifest">). false hides the Install row and the
	   "Offline copies" reset group and removes a worker visitors still have (it deletes its caches and
	   unregisters itself). */
	pwa: { enabled: true },
	/* Offline copy (sw.js): maxPages = Reader pages kept offline (0 = none, max 1000); timeoutMs = how long
	   the network may take before a cached copy answers (500–60000 ms); fastStart = start from the offline
	   copy and look for a new version in the background (visitors are offered a reload) — feeds, fortunes,
	   site/data/ and site/content/ are always fetched fresh first and never count as a new version — false:
	   every start asks the server first (network first, each update visible at once, a slower start).
	   legacyCaches = cache names of a service worker your site used BEFORE this desktop, deleted for every
	   visitor: exact names or a prefix ending in '*' (at least 4 characters before it), e.g.
	   ['oldsite-shell-*', 'oldsite-pages']. Never needed for this desktop's own caches, which it never
	   deletes this way. The old worker must be replaced for this to work: see docs/deploy.md §11. */
	offline: { maxPages: 80, timeoutMs: 4000, fastStart: true, legacyCaches: [] }
};
