/* JPKCom Desktop — site manifest: apps, collections, menus, files — © Jean Pierre Kolb — MIT License

   The example site: the project's own pages, a few bookmarks and a showcase
   with one example of every kind of item. Replace it with your content — the
   format is documented in docs/ARCHITECTURE.md ("Site manifest"), and
   `npm run validate` checks this file (ids, kinds, references, groups, https,
   icons, a text for every configured language).

   Apps that modules bring (editor, notes, settings, …) register themselves.
   To change one, list its id with only the fields to change and no kind —
   an override record: { id: 'notes', dock: true }. The site's fields win.

   apps: [{ id, kind, name, desc, icon, tint, url, size, desktop, dock, hidden, nodock, fixed, logo, mark, allowHttp,
            allow, sandbox }]
     kind 'page'        a content page in the Reader          url: 'site/content/en/x.html' or { en, de, … }
     kind 'web'         a page in an iframe window            url (same origin, or allowed by frame-src)
                        a same-origin page has full access to the desktop's data: only trusted code,
                        else sandbox: 'allow-scripts' (without 'allow-same-origin') or another origin;
                        allow / sandbox override config.wm.iframe for this app (docs/deploy.md §3)
     kind 'link'        an external page in a new tab         url: 'https://…'
     kind 'collection'  a Catalog window                      collection: '<collection id>'
     alias: '<app id>'  shows and launches another app

   collections: [{ id, prefix, app, name, desc, icon, tint, sort: 'alpha' | 'manual',
                   itemKind: 'auto' | 'link' | 'web' | 'page' | 'image', basePath, urlTemplate, size, allowHttp,
                   webUrl, allLabel, webLabel,
                   groups: [{ id, name, desc, icon, tint }],
                   items: [{ slug, group, name, desc, url | app, icon, tint, mark, kind, size,
                             nodock, hidden, allowHttp, docs, guide, fileName, download }] }]
     every item becomes an app '<prefix>-<slug>'
     webUrl    the collection's page on the web — a path, an https:// address or { en, de } —
               the Catalog's "Overview on the web" button
     allLabel  the Catalog's "All" entry, webLabel its "… on the web" button (texts)
     docs, guide  the Catalog's "Documentation" / "Guide" buttons: a path, an https:// address or { en, de }
     fileName  the name the item is saved under; download: true offers "Download" (image items always do)

   menus: [{ id, label: { en, de }, items: [appId | '-' | { collection: id } | { label, url } | { label, items: [...] }] }]
   files: { name: 'path' | { en, de } | { url: 'path' | { en, de }, aliases: ['other-name'] } }
     files the terminal can `cat`: relative same-origin paths; .md is shown as Markdown, the
     rest as text; the .md/.txt suffix may be left out (`cat about`); aliases are other names

   Paths are relative to the desktop's folder (they work in a sub-folder install too).
   Texts are a string, '@namespace.key' or a language map { en: '…', de: '…' } —
   add a value for every language in config.languages. */

/* The site's own home page (config.site.home): a desktop icon that opens it in a new tab.
   Read from the raw site config — this file is loaded before the desktop starts. */
function websiteApp() {
	const home = globalThis.DESKTOP_CONFIG?.site?.home;
	if (home == null) return [];
	const base = globalThis.location?.href;
	const abs = u => {
		try {
			return new URL(u, base).href;
		} catch {
			return null;
		}
	};
	const url = typeof home === 'string' ? abs(home)
		: home && typeof home === 'object' ? Object.fromEntries(Object.entries(home).map(([k, u]) => [k, abs(u)])) : null;
	const urls = typeof url === 'string' ? [url] : Object.values(url ?? {});
	if (!urls.length || urls.some(u => !u || !/^https?:/.test(u))) return [];
	return [{
		id: 'website', kind: 'link', logo: true, icon: 'ti-world', tint: 'slate', desktop: true,
		/* a site still served over http (local tests) may open its own home page too */
		allowHttp: urls.some(u => u.startsWith('http:')),
		name: { en: 'Website', de: 'Website' },
		desc: { en: 'The classic website', de: 'Die klassische Website' },
		url
	}];
}

const page = (en, de) => ({ en: `site/content/en/${en}`, de: `site/content/de/${de ?? en}` });

export default {
	apps: [
		...websiteApp(),
		{
			id: 'about', kind: 'page', icon: 'ti-user-circle', tint: 'slate', desktop: true, dock: true, size: [760, 640],
			name: { en: 'About', de: 'Über das Projekt' },
			desc: { en: 'The project and its author', de: 'Das Projekt und sein Autor' },
			url: page('about.html')
		},
		{
			/* A folder as start page: every page below it opens in this window (router.pageApp) */
			id: 'docs', kind: 'page', icon: 'ti-book', tint: 'teal', desktop: true, dock: true, size: [800, 660],
			name: { en: 'Docs', de: 'Handbuch' },
			desc: { en: 'Getting started, configuration, keyboard, writing pages', de: 'Erste Schritte, Konfiguration, Tastatur, Seiten schreiben' },
			url: page('docs/')
		},
		{
			id: 'changelog', kind: 'page', icon: 'ti-history', tint: 'graphite', size: [720, 600],
			name: { en: 'Changelog', de: 'Versionshinweise' },
			desc: { en: 'What changed in which version', de: 'Was sich in welcher Version geändert hat' },
			url: page('changelog.html')
		},
		{
			id: 'imprint', kind: 'page', icon: 'ti-id', tint: 'graphite', size: [680, 600],
			name: { en: 'Imprint', de: 'Impressum' },
			desc: { en: 'Template — legal notice of the site operator', de: 'Vorlage — Anbieterkennzeichnung des Betreibers' },
			url: page('imprint.html')
		},
		{
			id: 'privacy', kind: 'page', icon: 'ti-shield-lock', tint: 'graphite', size: [720, 640],
			name: { en: 'Privacy', de: 'Datenschutz' },
			desc: { en: 'Template — privacy policy', de: 'Vorlage — Datenschutzerklärung' },
			url: page('privacy.html')
		},

		/* Override records: fields for apps that modules bring */
		{ id: 'bookmarks', desktop: true, dock: true },   // the Catalog apps the collections below bring
		{ id: 'showcase', desktop: true },
		{ id: 'notes', dock: true },
		{ id: 'terminal', dock: true },
		{ id: 'fortune', desktop: true }
	],

	collections: [
		{
			id: 'bookmarks', prefix: 'link', icon: 'ti-bookmarks', tint: 'indigo', sort: 'alpha', itemKind: 'link',
			name: { en: 'Bookmarks', de: 'Lesezeichen' },
			allLabel: { en: 'All bookmarks', de: 'Alle Lesezeichen' },
			desc: { en: 'Useful links for running and building websites', de: 'Nützliche Links rund um Betrieb und Bau von Websites' },
			groups: [
				{ id: 'servers', icon: 'ti-server', tint: 'teal',
					name: { en: 'Web servers', de: 'Webserver' },
					desc: { en: 'Documentation of the servers the desktop runs on', de: 'Dokumentation der Server, auf denen der Desktop läuft' } },
				{ id: 'reference', icon: 'ti-book-2', tint: 'blue',
					name: { en: 'Reference', de: 'Nachschlagen' },
					desc: { en: 'Standards and references for web development', de: 'Standards und Nachschlagewerke für die Webentwicklung' } },
				{ id: 'author', icon: 'ti-user', tint: 'slate',
					name: { en: 'Author', de: 'Autor' },
					desc: { en: 'Jean Pierre Kolb — JPKCom', de: 'Jean Pierre Kolb — JPKCom' } }
			],
			items: [
				{ slug: 'apache', group: 'servers', icon: 'ti-feather', name: 'Apache HTTP Server', url: 'https://httpd.apache.org/docs/current/',
					desc: { en: 'Documentation of the Apache web server', de: 'Dokumentation des Apache-Webservers' } },
				{ slug: 'nginx', group: 'servers', icon: 'ti-server', name: 'nginx', url: 'https://nginx.org/en/docs/',
					desc: { en: 'Documentation of nginx', de: 'Dokumentation von nginx' } },
				{ slug: 'caddy', group: 'servers', icon: 'ti-lock', name: 'Caddy', url: 'https://caddyserver.com/docs/',
					desc: { en: 'Web server with automatic HTTPS', de: 'Webserver mit automatischem HTTPS' } },
				{ slug: 'ferron', group: 'servers', icon: 'ti-bolt', name: 'Ferron', url: 'https://ferron.sh/docs',
					desc: { en: 'Fast, memory-safe web server written in Rust', de: 'Schneller, speichersicherer Webserver in Rust' } },
				{ slug: 'static-web-server', group: 'servers', icon: 'ti-server-2', name: 'static-web-server', url: 'https://static-web-server.net/',
					desc: { en: 'Small server for static files', de: 'Kleiner Server für statische Dateien' } },

				{ slug: 'mdn', group: 'reference', icon: 'ti-book-2', name: 'MDN Web Docs',
					url: { en: 'https://developer.mozilla.org/en-US/', de: 'https://developer.mozilla.org/de/' },
					desc: { en: 'HTML, CSS and JavaScript reference', de: 'Referenz für HTML, CSS und JavaScript' } },
				{ slug: 'wcag', group: 'reference', icon: 'ti-accessible', name: 'WCAG',
					url: 'https://www.w3.org/WAI/standards-guidelines/wcag/',
					desc: { en: 'Web Content Accessibility Guidelines', de: 'Richtlinien für barrierefreie Webinhalte' } },
				{ slug: 'csp', group: 'reference', icon: 'ti-shield-check', name: 'Content Security Policy',
					url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP',
					desc: { en: 'How a CSP keeps injected code out', de: 'Wie eine CSP eingeschleusten Code fernhält' } },
				{ slug: 'json-feed', group: 'reference', icon: 'ti-rss', name: 'JSON Feed', url: 'https://www.jsonfeed.org/version/1.1/',
					desc: { en: 'The feed format behind the notifications', de: 'Das Feed-Format hinter den Mitteilungen' } },
				{ slug: 'tabler-icons', group: 'reference', icon: 'ti-icons', name: 'Tabler Icons', url: 'https://tabler.io/icons',
					desc: { en: 'The free icon set of this desktop (MIT)', de: 'Das freie Icon-Set dieses Desktops (MIT)' } },

				/* Aliases of the author's profile links (config.author.links → apps author-<id>) */
				{ slug: 'jpkcom-github', group: 'author', app: 'author-github',
					desc: { en: 'Source code of JPKCom Desktop and more', de: 'Quellcode von JPKCom Desktop und mehr' } },
				{ slug: 'jpkcom-mastodon', group: 'author', app: 'author-mastodon',
					desc: { en: 'JPKCom in the Fediverse', de: 'JPKCom im Fediverse' } },
				{ slug: 'jpkcom-website', group: 'author', icon: 'jpk', tint: 'slate', name: 'jpkc.com', url: 'https://www.jpkc.com/',
					desc: { en: 'Website of Jean Pierre Kolb', de: 'Website von Jean Pierre Kolb' } }
			]
		},
		{
			/* One example of every kind of item; the demos live in site/content/demos/<slug>/ */
			id: 'showcase', prefix: 'show', icon: 'ti-sparkles', tint: 'violet', sort: 'manual',
			basePath: 'site/content/demos/', urlTemplate: 'site/content/demos/{slug}/', size: [720, 560],
			name: { en: 'Showcase', de: 'Schaufenster' },
			desc: { en: 'One example of every kind of item', de: 'Je ein Beispiel für jede Art von Eintrag' },
			items: [
				{ slug: 'contrast', icon: 'ti-contrast', tint: 'teal',
					/* kind 'web' from the url (same origin, no image) — an iframe window; one page per language */
					url: { en: 'site/content/demos/contrast/', de: 'site/content/demos/contrast/index.de.html' },
					name: { en: 'Contrast checker', de: 'Kontrastprüfer' },
					desc: { en: 'Web demo: the contrast ratio of two colours (WCAG)', de: 'Web-Demo: der Kontrast zweier Farben (WCAG)' } },
				{ slug: 'sketch', tint: 'blue', icon: 'ti-photo', url: 'site/content/images/desk-sketch.svg', fileName: 'jpkcom-desk-sketch.svg', size: [720, 520],
					name: { en: 'Desk sketch', de: 'Schreibtisch-Skizze' },
					desc: { en: 'Image: a picture shipped with the site (SVG)', de: 'Bild: eine mitgelieferte Grafik (SVG)' } },
				{ slug: 'writing-pages', kind: 'page', icon: 'ti-file-text', tint: 'orange', url: page('docs/pages.html'),
					name: { en: 'Writing pages', de: 'Seiten schreiben' },
					desc: { en: 'Page: a document in the Reader', de: 'Seite: ein Dokument im Reader' } },
				{ slug: 'system', app: 'about-desktop',
					desc: { en: 'Alias: shows and opens another app', de: 'Alias: zeigt und öffnet eine andere App' } },
				{ slug: 'repository', icon: 'ti-brand-github', tint: 'black', url: 'https://github.com/JPKCom/jpkcom-desktop',
					name: { en: 'Source code', de: 'Quellcode' },
					desc: { en: 'Link: the repository of JPKCom Desktop, in a new tab', de: 'Link: das Repository von JPKCom Desktop, in einem neuen Tab' } }
			]
		}
	],

	menus: [
		{
			id: 'pages', label: { en: 'Pages', de: 'Seiten' },
			items: [
				'about',
				'-',
				'docs',
				{ label: { en: 'Configuration', de: 'Konfiguration' }, url: page('docs/configuration.html') },
				{ label: { en: 'Keyboard', de: 'Tastatur' }, url: page('docs/keyboard.html') },
				{ label: { en: 'Writing pages', de: 'Seiten schreiben' }, url: page('docs/pages.html') },
				'changelog',
				'-',
				'imprint',
				'privacy'
			]
		},
		{
			id: 'explore', label: { en: 'Explore', de: 'Entdecken' },
			items: [
				/* a collection: "Open …", then its groups as submenus (or its items) */
				{ collection: 'showcase' },
				'-',
				{ collection: 'bookmarks' }
			]
		}
	],

	files: {
		about: { en: 'site/content/en/about.md', de: 'site/content/de/about.md' },
		license: 'LICENSE',
		credits: 'CREDITS.md'
	}
};
