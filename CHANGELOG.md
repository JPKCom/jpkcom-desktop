# Changelog

© Jean Pierre Kolb — MIT License

All notable changes to JPKCom Desktop are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version lives in
`package.json`, `src/core/env.js` and `sw.js` and is the same in all three.

## [Unreleased]

## [1.4.0] — 2026-10-09

Fixes for the service worker and for several desktops on one origin: an update check that stops as soon
as a newer worker installs, legacy caches deleted only by the worker in charge, the holidays region file
in the offline copy, an announcement for every update that keeps the cache name, an offline copy that
repairs itself, and stored keys that stay apart when one namespace is another one's plus `-…`. For
module authors: the descriptor field `precache` and `store.owns()`/`store.claim()`. Updating a site: see
the upgrade notes below.

### Upgrade notes

- Upload the new `sw.js` with the rest: the shell cache gets a new name once (new version), visitors are
  offered one reload. Nothing else is needed for the fixes; `src/boot/preload.js` is unchanged.
- `site/config.js`: the comment of `namespace` changed (a recommendation) — copy it if you keep your own
  file.
- Several desktops on one origin whose namespaces overlap (`jpkdesk` and `jpkdesk-next`): update every
  one of them to 1.4.0 — a desktop on 1.3.0 or earlier still counts the longer namespace's keys as its
  own and deletes them with "Reset everything". For new installations pick namespaces where neither is
  the other plus `-…` (`desk-a`, `desk-b`); a changed namespace starts with empty settings.
- Site modules that import a file with a computed name (`` import(`./parts/${name}.js`) ``) can list
  those files in the new descriptor field `precache: [...]` (`docs/ARCHITECTURE.md` §8) so that they are
  part of the offline copy; without it they are kept the first time they load online, as before.
- Own code that read every `localStorage` key starting with `<namespace>-` should use `Desk.store.names()`
  or `Desk.store.owns(key)`; modules that keep keys outside their `storage` declaration can declare them
  with `Desk.store.claim()` (`docs/ARCHITECTURE.md` §14 "Whose keys").

### Added

- Module descriptor: new field `precache: [...]` (ARCHITECTURE §8) — files a module imports with a
  computed name, kept in the offline copy by the service worker. The loader ignores it.
- `store.owns(key)` and `store.claim(name | test)` (ARCHITECTURE §14 "Whose keys"): the storage registry
  and consent declare their names, and `store.names()`/`usage()` follow the rule. When in doubt a key is
  kept: a leftover of a removed module named like `reader-lang` can make "Reset everything" keep that
  module's leftovers.
- New pure exports `ownKeys(keys, ns, known)` (`src/core/store.js`, the rule behind `owns()`/`names()`)
  and `stripComments(text)` (`tools/build-preload.mjs`, the same function as in `sw.js`).

### Changed

- The shell cache holds two entries of the worker's own: `sw.js?files` (the list of the last complete
  copy) and, between installation and activation only, `sw.js?changed`.
- `install.js` no longer deletes legacy caches itself while a worker at the installation's `sw.js` URL
  controls the page: it asks that worker (`{ type: 'desk:legacy-sweep' }`), which sweeps only while it is
  in charge; an earlier worker at the same URL ignores the message. An uncontrolled page still sweeps
  itself.
- The docs recommend namespaces where neither is the other plus `-…` (`desk-a`, `desk-b`).

### Fixed

- Service worker: an update check that is already fetching the new copy now stops as soon as a newer
  worker installs, also in the middle of the crawl — the requests in flight are aborted (also answers whose
  body is still arriving, and the wait for the browser's preloaded answer for `index.html`), the
  half-written copy is deleted and never marked complete, and the pages hear nothing. In 1.3.0 a newer
  worker (an update, or a rollback to an earlier worker at the same URL) waited for the whole crawl — up to
  a minute on a slow server. When the check finds changed files it also lets the browser look at `sw.js`
  first (and again before the copy is marked complete), so a new worker installs at once instead of after
  a crawl it would throw away.
- Service worker: the caches named in `offline.legacyCaches` are deleted only by the worker that is in
  charge of its registration — never while a newer worker is installing or waiting, never after another
  one took over, and checked again right before each delete. In 1.3.0, after a rollback to the earlier
  worker, the desktop deleted that worker's caches again: at a start of the desktop while the earlier
  worker was waiting, and from a desktop page still open in another tab about 30 s after the earlier
  worker took over (it has the same script URL).
- Service worker: the region file of the public holidays (`config.holidays.region`) is now part of the
  offline copy — offline the calendar showed no holidays and the console reported "region file could not
  be loaded". Its import is computed, so the crawl never saw it; the holidays descriptor now lists its
  region files in the new descriptor field `precache: [...]`.
- Service worker: a new `sw.js` or `site/config.js` that keeps the cache name (a comment,
  `offline.timeoutMs`, `offline.legacyCaches`) now tells the open desktop "a new version is ready"
  whenever its installation changed code the desktop runs — also when the installation was interrupted and
  retried. In 1.3.0 the message only came when the old worker's update check happened to prepare the copy
  first.
- Service worker: a start of the desktop while a new worker with the same cache name installs no longer
  moves an update the old worker had prepared over the newer files (a mix of old and new code).
- Service worker: the crawl ignores comments, so it no longer asks for `src/core/window.js` (a 404 on
  every install and update) because of an example in a comment of `src/core/modules.js`.
  `tools/build-preload.mjs` reads sources by the same rule.
- Service worker: an offline copy that lost files — when another service worker of the site deletes every
  cache it does not know, the starts refill only what the pages ask for — is completed by the next update
  check (fast start, `offline.fastStart`, the default), and so is an installation that could not reach
  every file. While the server still has the same code the missing files simply join the copy (no "new
  version" message).
- Service worker: a file the server marks `no-store` or `private` no longer counts as a network failure in
  the crawl (an update that met one was dropped every time).
- Service worker: a server error or rate limit (5xx, 408, 429) while fetching the copy now counts like a
  network failure: no update is marked complete with an old copy of a changed file, and an installation
  that met one is completed by the next check.
- Storage: a desktop whose namespace is another one's plus `-…` on the same origin (`jpkdesk-next` next to
  `jpkdesk`) no longer counts as part of the other one. In 1.3.0 "Reset everything" in the desktop
  `jpkdesk` also deleted every setting and every note of `jpkdesk-next`, its storage figure (Settings and
  the terminal's `df`) counted them as its own, and their changes in another tab reached it as changes of
  its own keys. A desktop whose namespace is another one's plus `-consent` (`jpkdesk-consent`) even lost
  all its data to a reset of only the settings of `jpkdesk`. A key now belongs to a desktop when it is one
  of the desktop's own names, or when no other desktop shows behind it. A desktop shows when it has stored
  a name that this desktop knows, such as a setting or a consent. Withdrawing all consents removes consent
  keys only. Backups were not affected.

## [1.3.0] — 2026-10-08

Fixes and options from moving a real site onto 1.2: dock pins and desktop icons that follow renamed apps,
a start language that follows the browser's order, a vault that stays hidden in Settings → Reset, every
Fortune text replaceable, notification banners that show the app an article opens in, the desktop's own
glyphs from a site icon set, code colours in the Reader without a flood of CSP reports, and a service
worker that no longer holds back an update for 30 s. Updating a site: see the upgrade notes below.

### Upgrade notes

- Upload the new `sw.js` with the rest: the shell cache gets a new name once (new version), visitors are
  offered one reload.
- Run `npm run preload` once if you keep your own `src/boot/preload.js`: it is generated, and its
  start-language prediction changed (it now copies `matchLanguage()` of `src/core/i18n.js`).
- `site/config.js` gains commented entries for `iconReplace`, `notify.label` and the new `reader` keys
  (`keepStyles`, `styleScope`, `styleVars`), and updated comments for `search.pagefind` and
  `fortune.texts` — copy them if you keep your own file; without them the defaults apply.
- nginx: add `expires off;` next to `add_header Cache-Control $desk_cache_control;` in the server block.
- Apache (optional): the 1.2.0 `.htaccess` already sends `no-cache` and removes `Expires`; the new
  `<IfModule mod_expires.c>` block (`ExpiresActive Off`) of `docs/server/apache.htaccess` is extra
  hardening. `ExpiresActive` needs `AllowOverride Indexes`; the documented
  `AllowOverride FileInfo Indexes Options=Indexes` already includes it.
- Pagefind: keep `'wasm-unsafe-eval'` in the desktop's policy whenever `search.pagefind` is set, even if
  your bundle is served without a policy — Pagefind falls back to the page whenever its worker starts
  slowly. It only allows compiling WebAssembly and does not allow `eval`.
- Visitors whose browser lists a regional variant of an offered language before another offered language
  (e.g. `de-AT, en` on a de/en site) now start in that first language. A stored choice and `?lang=` are
  unaffected.
- Code calling `i18n.displayName(code, inLang)` with an `inLang` other than `code` now gets the name in
  `inLang`; call `displayName(code)` (or `displayName(code, code)`) for the endonym.
- Sites that worked around duplicate desktop icons of aliases with override records such as
  `{ id: '<alias item id>', desktop: false }` can remove them; they do no harm. `desktop: true` /
  `dock: true` on an alias has no effect (as `dock: true` already had none): put the flag on the app
  itself or on an override record of it.
- An alias id in `config.dock.pins` now pins its target, and the dock shows the target's name, icon and
  tint, not the alias's own. Exception: a visible alias of an app that cannot be pinned (e.g. of a hidden
  `web` window) stays pinned as the alias. Stored dock lists that hold alias ids are rewritten once on the
  first start (only when something changed); nothing to do.
- A site that hid the vault's reset row with its own CSS (e.g.
  `.set-row:has(> input[data-key="rs-vault"]) { display: none }`) should remove that rule — it would now
  also hide the row while the vault is unlocked. Own code that called `storage.resetGroups()` gets only
  the groups shown now; pass `{ all: true }` for every group.
- A site that renamed the Fortune app can now also set `fortune.texts.askText`, `askText2`, `askLang`,
  `keys`, `web`, `error` and `storageLabel` (list and placeholders: `docs/packages/p11-fortune-site.md`,
  "App texts"). A replaced `askText` must keep naming who receives the request (`{host}` or the host
  written out), or a warning is shown.
- Notifications: sites with a fixed `notify.app` look the same. Sites with `notify.app: null` get app
  tiles in the banners automatically; set `notify.label` for a "<label> · <app name>" meta line (a site
  that fixed `notify.app` only to name its news section there can now keep `app: null`).
- Reader: code blocks with highlighting written as `style="color:…"` now show their colours; set
  `reader.keepStyles: false` for the old look. A dual-theme highlighter's custom properties need
  `reader.styleVars` plus a rule in the site stylesheet; the kept colours are inline declarations, so the
  rule needs `!important` and must switch text and background together (page classes carry the `c-`
  prefix), e.g. `:root[data-theme="dark"] .reader-page pre.c-shiki, :root[data-theme="dark"] .reader-page
  pre.c-shiki span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg)
  !important }`. Colours set by the site stylesheet are not checked by the contrast guard. Content that
  relied on an inline colour outside `pre`/`code` (or outside the configured scope) still loses it;
  inline `code` keeps a colour only together with a background colour from the page.
- `iconReplace`: nothing to do without it. To use it, add the target icons to your site icon set, add the
  map to `site/config.js`, run `npm run icons` (the replaced Tabler ids stay in `src/icons/tabler.js` on
  purpose — they are the fallback when the set does not load) and `npm run validate`. A pair whose key or
  target the browser does not know is warned about at start and dropped; the original glyph stays. An id
  used for two meanings is replaced in both (weather `sleet` and `hail` share `ti-cloud-snow`).

### Added

- **Replace the desktop's own glyphs** (`iconReplace` in `site/config.js`): map the icon ids the desktop
  draws itself — menu bar, window controls, settings, dock, weather conditions … — to icons of a site
  icon set (`{ 'ti-settings': 'acme-cog', 'wc-close': 'acme-xmark' }`) for one icon style throughout.
  Keys are `ti-…`, `tif-…`, `wc-…` and `tile-…` ids (the author monogram `jpk` is not replaceable),
  values any known icon; one step, never chained. `icon()` and `symbolHref()` resolve the map in one
  place, so core, modules, apps and site modules follow it without a change (`docs/ARCHITECTURE.md` §6,
  §13). `npm run validate` checks every pair: an unknown key or target is an error, an id not built yet
  a warning ("run npm run icons"), a target missing from the set with its prefix an error naming the
  set, a `ti-`/`tif-` typo "does not exist in Tabler Icons"; a chain is a warning.
- **Reader: code colours survive.** Inside `reader.styleScope` (default `pre, code`) a small allowlist of
  a page's inline styles is kept — `color`, `background-color`, `font-style`, `font-weight`,
  `text-decoration-line` and, with `reader.styleVars` (e.g. `'--shiki-'`), custom properties of that
  prefix — with plain colours (hex, `rgb()`, `hsl()`, named) or fixed keywords only. The Reader
  re-serialises every value and sets it through CSSOM; the page's style text is never applied.
  `reader.keepStyles: false` drops every inline style as before. A contrast guard (2:1) drops kept
  colours that would hide text against their background (the tints of `mark` and `kbd` in between
  count). Inside an element that keeps a page's colours everything inherits the checked text colour, so
  no link or heading colour of the desktop lands on a background the page chose (links there are
  underlined); an element that keeps only a background gets the checked text colour written too. A
  `reader.styleVars` prefix that starts with a word of the desktop's own tokens (`--reader-`, `--text-`,
  `--accent-` …) is refused with a warning.
- Notifications: `notify.label` — a text or `{ lang: text }` map (at most 60 characters) shown before
  the app name in the banners' meta line ("News · Blog"); `null` (default) keeps the app name alone.
- Fortune app: `config.fortune.texts` can now replace every text that names or describes the app or its
  source — also the consent question (`askText`, `askText2`), the language sentence (`askLang`), the key
  hint (`keys`), the "Learn more" label (`web`), the error status (`error`) and the Backup/Reset label
  (`storageLabel`). Site texts may use the placeholders the app fills for their key (`model.js`
  `TEXT_PARAMS`: `askText` `{provider}` `{host}`, `askLang` `{language}`, `keys` `{space}` `{back}`
  `{next}`, `error` `{host}`), in plain, `{ lang: text }` and `'@ns.key'` form.
- Reset groups can declare `visible()` (descriptor `resetGroups[]`, `storage.registerGroup`): a group is
  left out of Settings → Reset while it answers no and none of its keys holds data.
  `storage.resetGroups()` returns the shown groups, `storage.resetGroups({ all: true })` every group with
  `shown`. New bus event `'storage:groups'` `{ id }` tells Settings to redraw when the answer changes.
- i18n: new named export `matchLanguage(offer, preferred)` in `src/core/i18n.js` (the browser-language
  match of `detect()`); `tools/build-preload.mjs` copies its source into `src/boot/preload.js`.
- Dock and desktop icons: new pure exports `pinTarget(id, get, canPin?)` (`src/shell/dock.js`) and
  `desktopApps(list)` (`src/shell/desktop-icons.js`); `cleanPins(v, max, resolve?)` takes an optional
  resolver.

### Changed

- Server configurations: the Apache `.htaccess` also switches `mod_expires` off for the desktop
  (`ExpiresActive Off` in `<IfModule mod_expires.c><Files "*">`) — hardening against a host-wide
  `ExpiresActive On`; its header block already sent `no-cache` and removed `Expires`.
- i18n: `i18n.displayName(code, inLang)` returns the name of the language in `inLang` (Intl.DisplayNames
  when the browser has data for that language, else the endonym, then the code); without `inLang` it is
  still the language's own name (`meta.name`). Language pickers (menu, toggle, settings row, terminal
  `lang` list) keep showing endonyms.
- About: the Languages row names the offered languages in the current language ("Deutsch und Englisch"
  instead of "Deutsch und English").
- Notifications: with `notify.app: null` each banner now shows the tile and name of the app its article
  opens in (the app the router picks, e.g. the page app with the longest URL prefix) instead of a generic
  bell and only the date; the bell remains for articles that open in a new tab. The summary banner ("And
  N more new articles") shows the app all new articles open in and opens it when it is their home
  (`notify.app`, a routed app that is not a page app, or a page app whose URL holds every article);
  otherwise it opens the newest article as before. A `notify.app` that cannot open (its module is
  missing) no longer lends its tile to the banners; they show the app the router actually opens.
- Settings → Reset: "Reset everything" also resets the groups hidden at the moment; picks of a group that
  went hidden while Settings was open are dropped, and an open reset confirmation closes when the shown
  groups change, so a confirmed partial reset never runs as "everything". The backup window lists a
  hidden group only when the data holds it.
- Fortune app: `validateConfig()` and `npm run validate` warn when a plain or language-map text in
  `fortune.texts` uses a placeholder its key does not fill (e.g. `{hots}`). The text is kept as written.
- Module loader: the contract (`docs/ARCHITECTURE.md` §8) now states the load order. A module's config
  section is cleaned (`validateConfig`) before its declared parts are registered, so a declared value,
  such as a storage label getter, may read `Desk.modules.config(id)`.
- Manifest validator: an alias cycle (`a → b → a`) is an error; none of its ids opens an app.
- Documentation: the condition for `'wasm-unsafe-eval'` with the Pagefind search is now stated exactly.
  Pagefind compiles its WebAssembly in `pagefind-worker.js`, under the policy sent with that file. It
  falls back to the page, under the desktop's policy, when the worker fails or has not started within 5
  seconds, which can happen on a slow connection alone. The desktop's policy therefore needs it whenever
  `search.pagefind` is set, and so does the policy sent with `pagefind-worker.js` (the shipped server
  configurations send the desktop's policy with every file). Updated: README (en, de), `docs/deploy.md`
  §6 and §13, ARCHITECTURE §5/§6, the comments of all server configurations, `site/config.js`, and the
  `npm run serve` help.
- The README copies of the server configurations are now checked against `docs/server/` by the tests.

### Fixed

- Dock: a visitor's own dock list keeps pins of an app whose id became an alias (an old id kept for old
  links after a rename). Stored pins and `config.dock.pins` resolve aliases to their target, duplicates
  this creates are dropped (the first keeps its place), and the resolved list is written back by the tab
  that read it. An alias the registry learns later (vault, module) is resolved on `apps:change`. Before,
  such a pin vanished silently. A visible alias of an app that cannot be pinned stays pinned as the
  alias whatever kind its target has (the rule asks whether an app may take a dock place at all, not
  whether its kind can open yet while modules load), and a visible alias whose target is not registered
  yet keeps its id until it is.
- Desktop icons: an alias (e.g. a collection item that points at an app) no longer shows a second icon
  of its target — it inherited `desktop: true`. The default dock pins already skipped aliases.
- i18n: the start language follows the browser's language order (RFC 4647 lookup per entry): for each
  entry of `navigator.languages` the exact tag, then the tag shortened subtag by subtag, then another
  region of the same language, before the next entry — `de-AT, en` now starts in German, not English.
  `src/boot/preload.js` predicts the same start language as the boot, so the locale hints match the
  language actually loaded.
- Fortune app: "The texts are in {language}" names the language in the reader's language ("auf
  Englisch", not "auf English").
- Terminal: `lang <name>` also accepts the language's name in the current language (`lang englisch`);
  the confirmation names the language in the current language.
- Shell: until the target language's "Switch to …" phrase is loaded, the two-language toggle's fallback
  action names the target language in the current language instead of an unmarked endonym.
- Reader: no more CSP console reports while a page is parsed (`style=""`, `<style>`, `<base>` raised two
  report lines each — hundreds per page of highlighted code). Pages are parsed with the `DOMParser` of a
  removed same-origin `about:blank` iframe, whose document Chromium does not check; it is as inert as
  before and the sanitiser is unchanged. Other engines fall back to the window's `DOMParser`.
- Service worker: the second sweep of `offline.legacyCaches` (about 30 s after an activation) no longer
  keeps an event open. In 1.2.0 the first request after an activation extended its event for 30 s, so a
  newer worker (an update or a rollback) could not activate until it ended. The follow-up now runs on a
  plain timer or on the first request after that moment, whichever comes first; a worker that a newer
  one replaced drops it. Old caches are still deleted on activation, about 30 s later, and at every
  start.
- Service worker: the fast-start update check ends when a newer worker is installing or waiting, after
  its delay, before each batch of compares and before the crawl. It ran inside the start's event, so a
  newer worker had to wait for the whole compare and crawl.
- Server configurations: the nginx server block sets `expires off;`. Otherwise an `expires` in nginx's
  `http { }` block added `Expires` and a second `Cache-Control` with `max-age` to the code, so browsers
  could mix module versions after an update. Caddy, Ferron and static-web-server needed no change.

### Security

- The vault's "Private bookmarks" row in Settings → Reset appears only while the vault is unlocked or a
  login is kept on the device; visitors no longer learn that a vault exists, and no confirmation names it
  otherwise.
- Fortune app: a replaced consent question (`fortune.texts.askText`) that names neither `{host}` nor a
  host of the online source is reported. The page reports it at `'modules:ready'`; `npm run validate`
  reports it for the built-in providers. The text is kept.
- The Reader's style allowlist refuses a whole `style` attribute that contains escapes, comments, quotes,
  braces, `@` or `!important`, and never keeps `url()`, `var()`, `calc()`, image functions or any layout,
  position, size or display property (SECURITY.md, Reader section).

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

- Server configurations: the Apache `.htaccess` also switches `mod_expires` off for the desktop
  (`ExpiresActive Off` in `<IfModule mod_expires.c><Files "*">`) — hardening against a host-wide
  `ExpiresActive On`; its header block already sent `no-cache` and removed `Expires`.
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

- Server configurations: the Apache `.htaccess` also switches `mod_expires` off for the desktop
  (`ExpiresActive Off` in `<IfModule mod_expires.c><Files "*">`) — hardening against a host-wide
  `ExpiresActive On`; its header block already sent `no-cache` and removed `Expires`.
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

[Unreleased]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/JPKCom/jpkcom-desktop/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/JPKCom/jpkcom-desktop/releases/tag/v1.0.0
