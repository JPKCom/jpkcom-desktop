# Changelog

© Jean Pierre Kolb — MIT License

All notable changes to JPKCom Desktop are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version lives in
`package.json`, `src/core/env.js` and `sw.js` and is the same in all three.

## [Unreleased]

## [1.2.0] — 2026-10-08

Fresh feeds and data with the fast start, site icon sets, manual pages per item, web windows anywhere on
the site, a web overview app for collections, a Fortune app that a site can rename and run online only,
and the clean removal of an earlier service worker's caches. Updating a site: see the upgrade notes
below.

### Upgrade notes

- Upload the new `sw.js` with the rest: the shell cache gets a new name once (version, `iconSets` and
  `offline.fastStart` are part of it), visitors are offered one reload.
- Run `npm run preload` once if you keep your own `src/boot/preload.js` (the boot graph gains
  `src/core/man.js` and `src/core/icon-sets.js`); CI's `preload:check` needs it.
- `site/config.js` gains `offline.legacyCaches: []`, `iconSets` (commented), `fortune.local` and
  `fortune.texts` with their comments — copy them if you keep your own file; without them the defaults
  apply and nothing changes.
- Sites that set `offline.fastStart: false` only because of their feeds can remove it: feeds, the fortune
  files and everything under `site/data/` and `site/content/` are fetched fresh first again.
- Data is always the server's current version, code changes only as a whole: after a deploy a visitor may
  run the previous code against the new data for one session. Change a data format compatibly (add
  fields, do not rename or remove them; a new file name for an incompatible format), and deploy code that
  knows a new icon before data that names it.
- Data your own modules fetch at run time belongs under `site/data/` (a file in a module's folder is
  code); scripts your modules import do not belong under `site/data/` or `site/content/`. Keep a Pagefind
  bundle outside `site/` (e.g. `pagefind/` at the root).
- A site that replaced another service worker lists that worker's caches in `offline.legacyCaches`
  (`docs/deploy.md` §11, "Replacing another service worker"); only such a site needs it.
- `config.terminal.manUrl` (a string) keeps working for the collections of `site/apps.js`; the vault's
  bookmarks no longer use it (they have no manual page). Items with a `.md`/`.txt` `docs` keep printing
  it while they have no `man` of their own; recommended: move the text twin to `man` and let `docs` be
  the page (the Catalog opens `docs`).
- A `webUrl` that equals the collection's `basePath` used to only refocus the Catalog; it now opens in a
  new tab. To open the overview in a window, add a hidden web app
  (`{ id: 'tools-web', kind: 'web', hidden: true, url: 'tools/' }`) and set `webApp: 'tools-web'` on the
  collection. A private `site/` that uses `webApp` still loads on 1.1.0 (the field is ignored there).
- `scope` values starting with `/` on web apps were ignored before and take effect now (folders outside
  the desktop's). Links with `#app=<id>&path=…` open nothing in a browser that still runs a cached 1.1
  desktop until the offered update is applied; open the link again after the update.
- Sites that run `npm run validate:strict` in CI may see new warnings: `webUrl` equal to `basePath`,
  invalid `webUrl`/`allLabel`/`webLabel` on a Catalog app or override record, missing manual files,
  large site icon sets. Fix the value (or add `webApp`).
- Visitors who agreed to the Fortune app's online source are asked once more (the agreement is now bound
  to the provider).
- A site module that wrote `<use href="#ti-x">` itself must switch to `Desk.icons.icon()` or
  `Desk.icons.symbolHref()` (sprite symbols now have the DOM id `i-<icon id>`).
- `npm run seal` reads `config.iconSets` below the web root of `--out` (the project by default): when you
  seal into a deployment (`--out <web>/site/vault/`), the set must be in `<web>/site/icon-sets/` as well.
- A private site repository that vendors the project's `.gitignore` and wants to track its icon set
  deletes the `site/icon-sets/*` line or adds `!site/icon-sets/<name>.json`.
- The terminal's `isRelPath` is now `isSitePath` of `src/core/url.js` (also refuses control characters).

### Added

- **Site icon sets** — a site can bring its own icons next to Tabler: JSON files listed in `iconSets` of
  `site/config.js` (e.g. `site/icon-sets/duotone.json`), ids `'<prefix>-<name>'`. They load before the
  modules (preload hint, kept offline by the service worker as part of the version), so tiles, dock,
  menus, search, the Catalog, the vault and `brand.glyph` use them like Tabler ids. Two-tone icons
  (`k: 'd'`) paint their secondary layer with the new tokens `--icon-duo-opacity` (0.4) and
  `--icon-duo-color`. `npm run validate` checks set ids and files, `npm run seal` accepts set icons in
  vault data. The project ships no set, and `site/icon-sets/*` is git-ignored; a set's licence is the
  site's business (`docs/ARCHITECTURE.md` §13).
- **Manual pages per item, collection and language** — `man` on collection items and collections
  (`site/apps.js`) names the text manual the terminal's `man <entry>` prints: a path, a `{ lang: path }`
  map (for layouts `{lang}` cannot express) or `false`. Placeholders `{slug}` `{id}` `{collection}`
  `{lang}`; order: the item's own `man`, its collection's, then `config.terminal.manUrl`, which now also
  takes a `{ lang: template }` map (`docs/ARCHITECTURE.md` §7 "Manual pages"). The example site's
  "Writing pages" item ships a manual in English and German (`man writing-pages`).
- **Collections: `webApp`** — a collection (or its Catalog app) can name the app that its Catalog's
  "Overview on the web" button launches, e.g. a hidden `web` app showing the collection's overview page
  at its `basePath`. It wins over `webUrl` while it is available. `npm run validate` checks the reference
  (`docs/ARCHITECTURE.md` §7).
- **Web windows anywhere on the site** — web windows keep their in-frame location for start pages
  anywhere on the site, not only below the desktop's folder: an app at `/wiki/start/` reopens on the page
  it showed after a reload. `scope` on a web app may be root-absolute for folders outside the desktop
  (`scope: '/wiki/'`) and is now also read on collection items.
- `linkPaths: true` on a web app: "Copy link to this window" and the address bar keep its sub-page
  (`#app=<id>&path=/<path>`); the app's kind checks the path, a refused one opens the start page. Off by
  default.
- `Desk.launch(id, { url })` for an open web window loads that location while the window still shows (or
  is still loading) the page the desktop opened (otherwise the window is only shown, as before); a shared
  `#app=<id>&path=…` link therefore also wins over the location the visitor's saved session restores.
  This also applies to banner notifications and feed items that open a web app with a URL.
- The `acceptUrl(app, path, from)` hook learns where a path comes from: `'session'`, `'launch'` or
  `'link'`.
- **Removing an earlier service worker's caches**: `config.offline.legacyCaches` lists the cache names
  (exact or `prefix*`) of a service worker your site used before this desktop. They are deleted when the
  new worker takes over, again shortly after it, at every start and by Settings → Reset → "Offline
  copies". Names of this desktop's own scheme are never touched (`docs/deploy.md` §11).
- Fortune app: modules add online sources declaratively (`fortuneProviders` in the descriptor), without
  `requires: ['fortune']`; `Desk.fortune.addProvider(def, { module })` drops the provider when that
  module fails.
- Fortune app: `config.fortune.local: false` runs the app online only (no local sayings, nothing
  precached, terminal command hidden, a clear message when no online source is available).
- Fortune app: `config.fortune.texts` replaces the texts that name the app (buttons, status lines, the
  question, the label in Settings → Online services, the terminal help), so a renamed app reads
  consistently.
- `Desk.icons.appGlyph(app, { cls, fallback })`: an app's glyph without the tile (logo, mark or icon).
- `Desk.icons.symbolHref(id)`: the `<use>` reference of an icon for site code that builds its own SVG.
- `kit.copyWithFeedback()` accepts functions for `key` and `doneKey`.
- `tools/browser-check.mjs --route path=file` serves a local file (e.g. a site module) for a check;
  `tools/serve.mjs --extra <url-path>=<file>` serves single files from outside the tree (tests, trials).
- Service `deeplinks`: `hashOf(info)`, the pure hash builder behind `hashFor(win)`.
- `Desk.router.acceptPath()` takes an array of start pages (one per language); the path qualifies when it
  qualifies for any of them.

### Changed

- Sprite symbols have the DOM id `i-<icon id>` (was: the icon id), and `icon()` returns
  `<use href="#i-<id>">`. Code that wrote `href="#<icon id>"` by hand uses `Desk.icons.symbolHref(id)`
  instead. Element ids starting with `i-` are reserved for the sprite.
- Every icon definition is built through an allowlist (§5, §13): tags `path circle ellipse rect line
  polyline polygon`, presentation attributes (including dash patterns, `vector-effect`, `paint-order`)
  and plain classes — for elements, for a pack's symbol attributes `a` and its viewBox. A runtime pack
  (`Desk.icons.add`) loses other tags (e.g. `g`), `style`, `id`, `href`, `on*`, and every value with a
  backslash (CSS escape) or a CSS function other than the transform and colour functions — so no
  `url()`, `src()`, `var()` or `env()` — with a console warning; an invalid viewBox becomes `0 0 24 24`.
- `man <entry>` without a manual — or whose manual file is missing (404/410, or an HTML page answered
  with 200) — says "<name> has no manual page." and offers the documentation or the entry itself,
  instead of an error. A failed request (offline, timeout, server error) is still reported as an
  error; a long manual is still cut short and printed, as `cat` does. An exact entry name always means that entry (no longer a prefix sibling's manual); `man <name>`
  matches a part of a name only among entries that have a manual.
- Collection and `manUrl` templates no longer apply to items the vault adds — also when the vault creates
  the collection itself; `manUrl` applies only to the site's own collections. An alias item no longer
  shows its target's manual. `terminal.manUrl` is merged as a whole like the other language maps of the
  config.
- Deep links `#app=<id>&<name>=<value>` with unknown parameters open the app instead of nothing.
- Locations of web windows are refused when their raw path or the way a server may read it (escapes of
  unreserved characters such as `%2e` or `%61` decoded once, `%2f`/`%5c` read as `/`, `//` collapsed)
  contains a dot segment (also `..;x`). Encoded slashes and empty segments that stay inside the app's
  folder are kept.
- Fortune app: the card shows the app's glyph (logo, mark or icon of a site override) instead of the
  fixed cookie.
- Fortune app: the agreement to the online source is bound to the provider (id and hosts); when the
  provider changes, visitors are asked again. `Desk.fortune.source()` returns `null` with
  `fortune.local: false` and no usable online source. A provider's `name` or a category `label` given as
  `{ lang: text }` must not contain empty strings (such providers are rejected, such categories dropped,
  with a warning); a provider names at most 8 hosts.
- `npm run validate` also checks `webUrl`, `allLabel` and `webLabel` on Catalog apps and their override
  records (as warnings), warns when a collection's `webUrl` equals its `basePath` and that address leads
  back to the collection's Catalog, checks `man` and `terminal.manUrl` and counts manual files missing for
  a collection's items (warnings), checks `scope`/`linkPaths`, the Fortune app's `local` and `texts`, and
  the site icon sets.
- Service worker: `offline.fastStart` is part of the shell cache name — switching it starts a fresh
  offline copy. Copies of files the desktop read at runtime that are neither code nor data files (a
  `man` or `cat` text outside `site/data/` and `site/content/`, an image) carry the response header
  `X-Desk-Copy: runtime`.

### Fixed

- **Service worker: feeds and other data are fresh again.** With `offline.fastStart` (1.1.0) the feeds
  (`notify.feeds`, also outside the desktop's folder), the fortune files and everything under
  `site/data/` and `site/content/` were answered from the offline copy, and every change of one — a new
  feed item — made the worker fetch the whole desktop again and offer "A new version is ready". These
  data files are network first again (offline: the last copy), the update check skips them and a
  prepared update never contains them. Code stays part of the version wherever it lies: `site/config.js`,
  `site/apps.js` (also when `site.data` points into `site/data/`), `site/theme.css`, site icon sets, site
  modules and wallpapers (`docs/ARCHITECTURE.md` §14).
- Service worker (fast start): any other file the desktop read at runtime that the install did not fetch
  (not a script, style or other code) is refreshed in place when it changes on the server and dropped
  when it is gone — instead of re-fetching the whole desktop and offering an update on every start.
- The Catalog's "Overview on the web" button no longer just refocuses the Catalog when `webUrl` is the
  collection's `basePath`. That address now opens in a new tab (or name a window in `webApp`).
- Fortune app: no "unknown online source" warning on every start when a module adds the configured
  provider; the check now runs once at `'modules:ready'`.
- Docs: `docs/deploy.md` §11 and `docs/packages/p12-pwa-deploy.md` list `offline.fastStart`.

### Security

- Locations of web windows never reach a reserved folder (`config.vault.dir`), also not written with
  percent escapes (`/site/v%61ult/`), even when the web app's folder or `scope` contains it (1.1 accepted
  `/desk/site/vault/…` for a start page or `scope` in `site/`), nor the desktop's own folder in another
  letter case, nor its `index.html`.
- Locations of web windows are also refused when a server could read them as a reserved folder or as the
  desktop through path parameters (`vault;x`), Windows stream suffixes (`vault::$INDEX_ALLOCATION`) or
  trailing dots and spaces (`vault.`, `vault%20`).
- A `scope` that is the installation root or a parent of it, a root-absolute `scope` inside it, or one
  that is not a plain folder path is ignored with a warning.
- Site icon sets and runtime icon packs pass an allowlist of SVG tags, attributes and values (see
  "Changed"); icon data never runs code.

## [1.1.0] — 2026-10-08

Faster start, a house theme for site owners, site apps with their own texts, a live demo and a
hardened supply chain. Updating a site: see the upgrade notes below.

### Upgrade notes

- `index.html` gained two lines: `<link rel="stylesheet" href="site/theme.css">` after the core CSS and
  `<script src="src/boot/preload.js"></script>` right after `site/config.js` — copy both into an adapted
  `index.html`, and copy `site/theme.css` into your `site/` (an empty file is fine).
- Your own modules and site apps: run `npm run preload` after adding or changing one (faster start; a
  stale file only costs speed). Code that calls `Desk.media.open()`/`add()` gets a `Promise<number>` now
  instead of a number.
- Visitors with the service worker get updates one reload later: the desktop offers the reload
  (`config.offline.fastStart: false` for the old behaviour).
- Development tools need Node.js 24 or newer; install them with `npm ci` (`sfw npm ci` recommended) and
  the headless browser with `npm run browsers`.

### Changed

- **Faster start: window code on demand** — an app definition can name its window code with
  `load: () => import('./window.js')` (a window kind with `defineKind(kind, { load })`), its window-only
  CSS with `windowStyles`. The boot no longer loads the editor, terminal, players, fortune, notes, todo,
  calculator, the panels' contents, Reader, viewer and Catalog windows; they come with the first window
  (spinner meanwhile). `wm.open()` still returns the window at once; `win.ready` and the event
  `'window:ready'` tell when its content is built (`docs/ARCHITECTURE.md` §8, §19).
  `Desk.media.open/add` now return `Promise<number>`; `Desk.terminal.list()/has()` know the built-in
  commands once the first terminal window opened.
- **Faster start: preload hints** — `src/boot/preload.js` (generated by `npm run preload`, checked in CI)
  requests every file of the boot at once instead of one import level after the other; language metadata,
  strings and site data load side by side. Upgrade note: `index.html` loads `src/boot/preload.js` right
  after `site/config.js` — copy that line into an adapted `index.html`.
- **Faster repeat visits: fast start from the offline copy** — the service worker answers the desktop's
  own files from its copy and checks for a new version in the background; a complete new copy is prepared
  and the open desktop offers a reload. `config.offline.fastStart: false` restores "network first".
- **Supply chain** — Node.js ≥ 24; `.npmrc` with `ignore-scripts`, `save-exact`, `engine-strict`; exact
  versions of the two development tools (playwright-core 1.64.0); `npm run browsers` instead of `npx`;
  GitHub Actions pinned to commit SHAs, CI on Node 24 with `npm ci --ignore-scripts` and
  `npm audit signatures`; Socket Firewall Free (`sfw npm …`) recommended ([`CONTRIBUTING.md`](CONTRIBUTING.md#supply-chain)).

### Added

- **House theme** — `site/theme.css` in `@layer themes`, loaded before the first paint and kept offline; radius, glass and shadow tokens (families and part tokens) with unchanged defaults; full token reference in `docs/theming.md`. Upgrade note: `index.html` links `site/theme.css` — when updating an existing site, copy it into your `site/` (an empty file is fine) and do not delete it.
- **Live demo on GitHub Pages** — `.github/workflows/pages.yml` publishes the shipped example site, as
  it is and without a build step, to <https://jpkcom.github.io/jpkcom-desktop/> on every push to `main`
  (or when started by hand). GitHub Pages cannot send response headers, so the workflow adds the
  production Content-Security-Policy as a `<meta>` tag to the published copy of `index.html` (without
  `frame-ancestors`, which a `<meta>` policy cannot carry). Copies made from the template publish only
  when they set the repository variable `PAGES` to `true`; otherwise the job is skipped
  ([`docs/deploy.md`](docs/deploy.md#github-pages)).
- **Quickstart "Your own site in 10 minutes"** — five steps from the template to a published site, in
  English ([`docs/quickstart.md`](docs/quickstart.md)) and German
  ([`docs/quickstart.de.md`](docs/quickstart.de.md)).
- **Template repository** — the repository is a GitHub template; the READMEs start with
  "Use this template" and link the live demo and the quickstart.
- **Site apps with their own texts**: a module or app in `site/modules/<id>/` can keep its translations
  next to its code (descriptor field `locales`); `npm run i18n:check` checks them like the desktop's own.
- **Example app "Hello"** (`site/modules/hello/`): a template for your own apps — window, texts with
  placeholder and plural, CSS, stored value with backup and reset, terminal command `hello`.

## [1.0.0] — 2026-10-06

Initial open-source release under the MIT License.

### Added

- **Foundation** — vanilla JavaScript with native ES modules, no build step, no runtime dependencies,
  no CDN. A strict Content Security Policy (no inline script or style, no `eval`, no `innerHTML`); DOM is
  built with `h()`/`s()` and `textContent`. Everything optional is a module described by a descriptor
  (apps, styles, i18n namespaces, storage keys, reset groups, trash types, online services, settings,
  shortcuts, terminal commands, search providers, file-drop handlers, context menus). A public, frozen
  `window.JPKDesk` API, a service registry and a bus with documented events
  ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)).
- **Site folder** — everything a site owner changes lives in `site/`: `config.js` (every key optional
  and documented inline, validated with warnings and defaults), `apps.js` (apps, collections, menus,
  terminal files), Reader pages, fortunes, feeds, wallpapers and sealed vault files. A neutral example
  site ships and is meant to be replaced.
- **Any number of languages** — German and English ship; a new language is a folder in `locales/`.
  Fallback chain, named placeholders, CLDR plural forms, `Intl` formatting, right-to-left support,
  language toggle for two languages and a menu for more.
- **Window manager** — window kinds (`web`, `app`, `native` built in, more from modules), drag, resize,
  minimise, zoom, keyboard operation, configurable window controls (left/right, classic/minimal); edge
  snapping and a tile menu, a window overview, session restore and deep links to windows.
- **Shell** — menu bar with arrow-key navigation, status area, clock and language switch, folding on
  phones; dock with pins, magnification and sizes; desktop icons; "All apps"; keyboard shortcuts;
  context menus; notification banners; file drops onto the desktop; boot, restart and shut-down screens.
- **Panels** — Settings (appearance, accent colours, online services, reset), Wallpaper (colours,
  gradients, pictures and generated SVG motifs), Backup and restore of the local data, Trash, About this
  desktop, How it works, and app installation.
- **Content modules** — Reader for HTML pages (fetched, sanitised against an allowlist and shown in a
  window), image viewer, Catalog for collections (bookmarks, tools, a portfolio …), quick search over apps
  and collections with optional Pagefind full-text search.
- **Calendar, holidays, weather, notifications** — a calendar popover under the clock, public holidays
  per region (Bavaria as an example), weather with two providers (Open-Meteo worldwide, Bright Sky for
  Germany), feed notifications from a JSON Feed per language.
- **Vault** — private bookmarks sealed with `tools/seal-vault.mjs` (PBKDF2-HMAC-SHA-256 and
  AES-256-GCM), unlocked in the terminal, optionally kept on the device.
- **Apps** — text editor with tabs, notes, tasks, calculator, a terminal with a command registry that
  modules extend, audio and video players for files from the device (tags and cover art read locally),
  and Fortune with local jokes and facts plus optional online sources.
- **Privacy** — every online service is off by default; the site has to switch it on *and* the visitor
  has to agree before the first request; consent can be withdrawn in Settings. No cookies, no referrer
  on third-party requests.
- **Accessibility** — menu bar as `menubar`, windows as named dialogs, focus handling and restoration,
  one shared live region, reduced motion respected in CSS and JavaScript.
- **Branding and theming** — JPK monogram and JPKCom logo as the default brand, replaceable through
  `site/config.js`; they are the author's personal logo and not MIT (brand assets, see
  [CREDITS.md](CREDITS.md#brand-assets-not-mit)); dark and light themes, accent colours, tile tints and wallpapers configurable.
- **PWA and offline** — service worker with an offline copy of the desktop and of Reader pages, web app
  manifest and app icons; works in the web root or any sub-folder.
- **Deployment** — a deployment guide ([`docs/deploy.md`](docs/deploy.md)) and tested server
  configurations for Apache (`.htaccess`), nginx, Caddy, Ferron 2 and 3 and static-web-server
  ([`docs/server/`](docs/server/)), all with the same security headers and commented opt-in lines.
- **Tools and tests** — local server with the production headers (`npm run serve`), icon subset
  builder and check, i18n check, site manifest validator, vault sealing tool, PWA icon renderer,
  headless browser check, and a `node --test` suite for the pure parts of every package.

[Unreleased]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/JPKCom/jpkcom-desktop/releases/tag/v1.0.0
