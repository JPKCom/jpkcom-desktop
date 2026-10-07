# JPKCom Desktop — Architecture

> The contract every part of the desktop codes against. © Jean Pierre Kolb — MIT License.
>
> Status: **all packages ported and integrated** — the core foundation (config, env, store, bus, i18n,
> dom, icons, a11y, registry, router, net, consent, storage registry, module loader, public API, CSS
> tokens and components), the window manager (§19) with its extras (P1), the shell and menu bar (§20,
> P2), the panels (P3) and every optional module and app (P4–P11), the PWA and deployment files (P12).
> This file is the contract; the detailed reference of each package is `docs/packages/p<NN>-<name>.md`.

Contents

1. [Principles](#1-principles)
2. [Layout](#2-layout)
3. [Boot sequence](#3-boot-sequence)
4. [Naming glossary](#4-naming-glossary)
5. [Security rules](#5-security-rules)
6. [Configuration](#6-configuration)
7. [Site manifest](#7-site-manifest-siteappsjs)
8. [Module descriptor](#8-module-descriptor)
9. [Public Desk API](#9-public-desk-api)
10. [Services](#10-services)
11. [Bus events](#11-bus-events)
12. [i18n](#12-i18n)
13. [Icons](#13-icons)
14. [Storage](#14-storage)
15. [URLs, routing, launching](#15-urls-routing-launching)
16. [Network and online services](#16-network-and-online-services)
17. [CSS conventions and tokens](#17-css-conventions-and-tokens)
18. [Shell DOM contract](#18-shell-dom-contract)
19. [WM API](#19-wm-api)
20. [Menus API](#20-menus-api)
21. [How to add …](#21-how-to-add-)
22. [Tools and tests](#22-tools-and-tests)
23. [Deviations and decisions](#23-deviations-and-decisions)

---

## 1. Principles

- **No build step, no runtime dependencies, no CDN.** Native ES modules, served as they are.
  A local static server is required (`npm run serve`); `file://` is not supported.
- **Strict CSP** (see §5). No inline script, no inline style, no `eval`, no `innerHTML`.
- **Everything optional is a module.** The core knows no concrete app, site, region, provider or
  language. Modules talk through the bus, registries and services — never by importing each other's
  internals. A missing optional module never throws.
- **Robust data handling.** Every manifest entry, config value and stored value is validated;
  invalid input is reported with `console.warn` and skipped/replaced, never fatal.
- **Any number of languages.** No code may assume two languages (no `'de-DE' : 'en-GB'` ternaries,
  no `{de, en}`-only lookups, no concatenated sentences). Use `t()` with named placeholders,
  `Intl` through the i18n formatters, plural objects.
- **Accessibility as in the original.** Menu bar `role="menubar"` with arrow keys, windows as named
  dialogs, focus handling and restoration, one shared live region (`announce()`),
  `prefers-reduced-motion` respected in CSS and JS (`reduceMotion()`, `later()`).
- **Author attribution stays.** "JPKCom Desktop by Jean Pierre Kolb" in About, boot screen, terminal
  neofetch, README and `<meta name="author">`; the JPK monogram and logo are the default brand glyph.
  They are **brand assets, not MIT** (the author's personal logo since 1996, © 1996–2026 Jean Pierre
  Kolb, all rights reserved; not a registered trademark): the artwork of `jpk` and `logos.jpkcom` in
  `src/icons/custom.js`, `assets/icons/*`, the default `brand.asciiLogo` and the pictures of the motifs
  `author-monogram`/`author-emblem`. Shown unchanged as the default brand and in the credit they need no
  permission; as someone's own logo, in other projects or altered they do. A site with its own identity
  replaces them (`brand.glyph`, `brand.logo`, `brand.asciiLogo`, icon files, `wallpaper.motifs`). The
  code that draws them stays MIT. Authoritative text: `CREDITS.md` ("Brand assets (not MIT)").
- **File header** in every source file: `JPKCom Desktop — <purpose> — © Jean Pierre Kolb — MIT License`.
  Pure brand artwork (`assets/icons/favicon.svg`, `maskable.svg`) says instead
  `© 1996–2026 Jean Pierre Kolb — all rights reserved, not MIT (brand asset, see CREDITS.md)`; files
  that mix code and brand artwork keep the MIT header and name the excepted part.

## 2. Layout

```
index.html                  shell markup; core CSS <link>s; site/config.js → src/boot/theme.js → src/boot/main.js
manifest.webmanifest, sw.js (P12, at the root for the scope)
site/                       EVERYTHING a site owner customises
  config.js                 window.DESKTOP_CONFIG (classic script, all keys optional)
  apps.js                   export default { apps, collections, menus, files }
  content/<lang>/*.html     Reader pages            (P11)
  data/fortunes/<lang>.json, data/feed.<lang>.json  (P11)
  vault/                    sealed .bin files (none shipped, .gitignored)
  wallpapers/               image wallpapers
locales/<lang>/_meta.js     { name, intl, dir, yes }
locales/<lang>/<ns>.js      export default { key: 'text' | { one, other, … } }
src/boot/theme.js           classic pre-paint script
src/boot/main.js            ES module entry
src/core/                   config env store bus i18n dom icons a11y registry router net consent
                            storage-registry modules services api
src/wm/index.js             core part 'wm':    wm.js (core + kinds web/app/native) wm.css; P1 adds snap.js tilemenu.js
                                                overview.js session.js
src/shell/index.js          core part 'shell': menus.js menus.css (engine); P2 adds menubar dock launcher desktop-icons shortcuts
                                                context-menu menubar-fit title-fit clock lang power deeplinks
                                                drop notifications + css)
src/panels/index.js         core part 'panels' (P3: settings wallpaper backup trash about help install + css)
src/modules/<id>/index.js   optional modules: reader viewer catalog search calendar holidays weather notify vault
src/apps/<id>/index.js      apps: editor notes todo calc terminal media fortune (+ src/apps/kit.js)
src/wallpapers/             SVG motif generators (P3)
src/css/                    layers.css tokens.css base.css components.css
src/icons/tabler.js         GENERATED Tabler subset (committed)
src/icons/custom.js         hand-drawn glyphs (jpk, wc-*, tile-*) and the JPKCom logo builder
assets/icons/               favicon (JPK monogram); PWA icons (P12) — brand assets, not MIT
tools/                      build-icons.mjs serve.mjs i18n-check.mjs browser-check.mjs
                            validate-manifest.mjs (P11: checks site/apps.js against the config)
                            seal-vault.mjs (P7: seals private bookmarks for the vault)
                            build-pwa-icons.mjs (P12: renders the PNG app icons from the SVGs)
docs/ARCHITECTURE.md        this contract
docs/packages/*.md          the detailed documentation of each package (P1–P12)
docs/deploy.md              the deployment guide (P12)
docs/server/                server configurations (P12): apache.htaccess nginx.conf Caddyfile ferron.conf (Ferron 3)
                            ferron.kdl (Ferron 2) static-web-server.toml
tests/*.test.mjs            node --test unit tests for pure functions
README.md, CREDITS.md, LICENSE
```

During the port, every `index.js` not yet written was a **stub descriptor** (`{ id, kind, stub: true }`)
so the desktop booted cleanly at every stage. All of them are replaced now; the loader still honours
`stub: true` (§8).

## 3. Boot sequence

```
<head>
  <link> src/css/layers.css, tokens.css, base.css, components.css
  <script src="site/config.js">        window.DESKTOP_CONFIG
  <script src="src/boot/theme.js">     data-theme, data-wc, --accent/--on-accent, config accents/tints,
                                        --wallpaper-from/to + data-wp-dir (glow|down|diag|radial), --anim,
                                        data-boot="pending" (boot cover), meta theme-color — before the first paint
  <script type="module" src="src/boot/main.js">
main.js
  1. initEnv()           body.compact (config.ui.compactQuery), body.standalone; scroll lock
                         (main.js then re-sets --anim from the validated config.ui.animMs)
  2. initI18n()          _meta of all languages → start language (?lang → stored → navigator → default)
                         → 'core' namespace for the whole fallback chain → <html lang dir>
  3. site data           import(config.site.data) → registry.load(); registry.authorLinks(config.author.links)
  4. expose()            window.JPKDesk = the frozen Desk API
  5. modules.loadAll()   [core: wm, shell, panels] → config.modules → config.apps
                         imported in parallel; ordered by `requires`; all i18n namespaces + styles loaded;
                         then per module: register parts → await setup(Desk) → 'module:loaded'
                         (a failing setup → everything its descriptor declared is withdrawn → 'module:failed')
                         finally: warn about site override records no app picked up → 'modules:ready'
  6. body.is-ready; emit 'desk:ready'   ← session restore, deep links, boot screen end, feed check, …
     no 'power' service → main.js removes html[data-boot] itself (also when the boot fails; at the
     latest after max(10 s, 4 × boot.ms))
```

Rules:

- A core part must not rely on another core part's `setup()` having run unless it declares
  `requires: ['wm']`. Late work ("after everything is loaded") listens to `'desk:ready'`.
- **`'desk:ready'` listeners run in module setup order**: wm → shell → panels → config.modules →
  config.apps (a listener registered in `setup()` joins in that order; the bus calls listeners in
  registration order). This is the original's order restoreSession → deep links → vault resume, and it
  is part of the contract:
  - **session restore** (wm, P1) must open its windows **synchronously** inside its listener; kinds that
    load asynchronously (Reader, viewer) restore their content on their own after `mount()`;
  - **deep links** (shell, P2) therefore open on top of the restored windows;
  - modules (vault resume, feed check) come after both.
- **Boot cover**: `theme.js` sets `html[data-boot=pending]` when `config.boot.enabled !== false`, reduced
  motion is off and sessionStorage `<ns>-booted` is unset; `base.css` paints a full-page `--boot-bg`
  cover (`body::after`, `--z-boot`) from the first paint. The `power` service (P2) replaces it with the
  real boot screen on `'desk:ready'` and removes the attribute; without that service `main.js` removes it.

## 4. Naming glossary

No third-party product names or trademarks in code, UI or docs; describe the desktop as
"desktop-style" or "classic desktop metaphor". `Dock` stays (generic term). The rule targets **naming
the desktop's own features after third-party products** (or imitating their look by name). Nominative,
factual use is allowed: browser and operating-system names the terminal's `browser` command detects and
prints, link targets in example bookmarks, the data providers a module talks to (Open-Meteo, Bright Sky,
JokeAPI, Useless Facts, Pagefind) and server names in the deployment guide and its snippets. The author
brand (JPKCom, Jean Pierre Kolb) stays. When porting, map the private source's identifiers to these
names (the port blueprint lists them):

| Concept | Name (EN / DE) | Code |
|---|---|---|
| global quick search | Search / Suche | module `search`, service `search`, CSS `.search-*`, `Desk.searchFor(q)` |
| all windows scaled side by side | Overview / Fensterübersicht | `src/wm/overview.js`, service `overview`, `.overview-*`, `body.is-overview` |
| icon browser over a collection | Catalog / Katalog | module `catalog`, window kind `'collection'`, `.catalog-*` |
| full-screen app grid | All apps / Alle Apps | service `launcher`, app kind `'launcher'` |
| system information panel | About this desktop / Über diesen Desktop | panel app id `about-desktop` |
| close/minimise/zoom buttons | window controls / Fensterknöpfe | glyphs `wc-close` `wc-min` `wc-max` (source: `tl-*`), tokens `--wc-*`, class `.wc` |
| joke/fact app | Fortune / Glückskeks | app `fortune` |
| tools/games/links/portfolio lists | collections | `site/apps.js` `collections[]`, items → apps `<prefix>-<slug>` |
| `jpkdesk-` key prefix | `config.namespace` | `store.key(name)` |

Ids everywhere (apps, modules, collections, groups, keys, services): `[a-z0-9-]`, starting with a
letter for module/service ids — safe in CSS selectors, DOM ids, URLs and storage keys.

Core panel app ids (registered by P3): `about-desktop`, `settings`, `wallpaper`, `backup`, `trash`,
`help`; launcher app `launcher` (P2). Site page app conventionally `about`.

## 5. Security rules

- **CSP** (production and `tools/serve.mjs`):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:;
  font-src 'self'; connect-src 'self' blob: <opt-in service hosts>; frame-src 'self'; worker-src 'self';
  manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`
  (+ `upgrade-insecure-requests` and HSTS on https). **Opt-in extensions** — only what a site switches on:
  - `connect-src` + the hosts of the online services the site offers (`consent.hosts()`;
    `serve.mjs --connect https://api.open-meteo.com,…`);
  - `frame-src` + the origins of `web` apps whose url lives on another origin (`serve.mjs --frame https://…`);
  - `script-src` + `'wasm-unsafe-eval'` only for WebAssembly — the optional Pagefind search provider (P5)
    needs it (`serve.mjs --wasm`); nothing else in the desktop does.

  The server snippets (P12) list the same three extensions as commented-out lines.
  Further headers: `Permissions-Policy`
  (geolocation only if the weather location is offered), `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`** anywhere. Build with `h()`/`s()`
  + `textContent`. `h()` throws on `innerHTML`, `outerHTML`, `html`, `srcdoc`, `insertAdjacentHTML`,
  `setHTMLUnsafe` — as props and inside `props: {}` — and on string `on*` handlers. `onClick` works like
  `onclick` (event names are lower-cased unless they contain `:` or `-`).
- **No inline styles as attributes.** `style=""` is blocked by the CSP; set styles through CSSOM:
  `h('span', { style: { '--tint': v } })` → `style.setProperty`. No `<style>` elements.
- **Foreign HTML** (Reader) is fetched, parsed inert with `DOMParser`, sanitised with an **allowlist**
  of elements/attributes (no `style`, no `on*`, no `<base>`, no SVG animation), URLs re-resolved and
  checked, then imported node by node. Browsers apply the page CSP to inert documents too: a fetched
  page with `<base>`, `<style>` or `style=""` yields blocked `base-uri`/`style-src` reports while it is
  parsed (nothing is applied — the sanitiser removes them). Content written for the Reader should avoid
  inline styles.
- **Files from the device** (drops, "Open …" pickers: image viewer, media players) live in `blob:` URLs
  of the desktop's origin and are **never opened as a document** — an SVG or HTML file there would run
  with access to the desktop's storage. So:
  - no "Open in new tab" / popOut for them: the window kind's `canPopOut(win)` hook answers `false`,
    `wm.canPopOut(win)`, the title bar and every menu respect it; the media players have no
    `popOut`/`locationOf` and say `canPopOut: () => false` as well; `window.open` never gets a
    `blob:` or `data:` URL;
  - no "Copy link to this window" while a window shows one: the hook `canLink(win)` answers `false`
    (viewer: the current picture is a device file; players: any item in the list), `wm.canLink(win)`
    asks it and the title-bar and app menus leave the item out — `#app=<id>` would only reopen an
    empty app;
  - a blob URL carries a **validated type only** (`file.slice(0, file.size, type)`): a raster image type
    (viewer), the audio/video type of an accepted extension (players), anything else
    `application/octet-stream`. These types render only as a picture or a player when navigated to, so
    even the browser's own "Open … in new tab" on a `<video>` cannot turn one into a page; embedded
    cover art is limited to raster image types;
  - **an SVG is a document type** (navigated to as a page, its `<script>` runs — and the page CSP does
    not follow a blob URL), so a device SVG **never gets a `blob:` URL**: the viewer shows it from a
    `data:` URL (`viewer/util.js` `deviceSource()`), which a page cannot navigate to and which never
    has the desktop's origin;
  - images only through `<img>` (scripts never run there), not draggable (`draggable="false"`), and no
    browser context menu on them (`data-contextmenu="none"`, §20);
  - downloads only through `<a download>` (`Desk.download`, `dom.saveFile`); `dom.saveFile(blob)`
    retypes a Blob `application/octet-stream`, and the viewer saves a device picture from its `File`.

  Text files (editor) are read as text and never get a URL.
- **Stored values are untrusted.** Read with `store.getJson(name, validate, fallback)` and the `V`
  validators. Ids from storage are re-validated (`V.id`) before they reach selectors.
- **URLs from data**: only relative paths or absolute `http(s)`; `link` apps only `https`
  (`allowHttp` per collection or per item is opt-in). The registry rejects `javascript:`, `data:`, `//host`.
- **External requests** only through `net.getJson/getText` with a `service` id when they go to a
  third party: no cookies, no referrer, timeout, consent checked (§16).
- **Links to other origins** open with `noopener`.

## 6. Configuration

`site/config.js` documents every key inline; `src/core/config.js` (`DEFAULTS`) holds the defaults
and validates. `Desk.config` is the merged, deep-frozen result.

Merge: plain objects merge recursively; arrays and scalars replace; language maps at
`site.description`, `site.home`, `notify.feeds`, `about.moreInfo`, `about.rows` replace as a whole;
in `theme.accents`, `theme.tints`, `services` a `null` removes a default (a removed service counts as
not offered). Invalid values → `console.warn` + default.

| Key | Default | Meaning |
|---|---|---|
| `namespace` | `'jpkdesk'` | prefix of storage keys, IndexedDB/Cache names, DOM events |
| `debug` | `false` | extra console output (missing i18n keys, stub modules) |
| `brand` | `{ name: 'JPKCom Desktop', shortName: 'JPK Desktop', menuLabel: 'JPKCom', glyph: 'jpk', logo: 'jpkcom', asciiLogo: null, host: null, themeColor: '#1c2935' }` | product naming, brand glyph/logo |
| `author` | `{ name: 'Jean Pierre Kolb', brand: 'JPKCom', url: 'https://www.jpkc.com/', links: [github, mastodon] }` | credit; each link → app `author-<id>` (kind `link`) |
| `credit` | `true` | show "… by Jean Pierre Kolb" |
| `languages` | `['de', 'en']` | offered languages (folders in `locales/`), menu order |
| `defaultLang` | `'en'` | start language fallback and 2nd text fallback |
| `site` | `{ data: 'site/apps.js', origin: null, hosts: [], home: null, legal: [], description: {…}, routes: [], defaultPageApp: 'about' }` | manifest path, own hosts, routing rules |
| `about` | `{ rows: null, moreInfo: null, copyright: { holder, since: 2026 } }` | About panel |
| `theme` | `{ default: 'dark', accent: 'blue', allowCustomAccent: true, accents: {7}, tints: {10}, windowControls: { side: 'left', style: 'classic' } }` | appearance |
| `wallpaper` | `{ default: { type: 'gradient', from: '#3c4955', to: '#0c1925', dir: 'glow' }, motifs: [9], colors: [8], gradients: [7], images: [], reducedEffects: 'auto' }` | wallpaper panel data |
| `ui` | `{ animMs: 240, compactQuery: '(max-width: 760px), (max-height: 520px) and (pointer: coarse)' }` | motion, phone breakpoint |
| `wm` | `{ gap: 6, minSize: [280,180], defaultSize: [1040,720], cascade: 26, snap: true, snapEdge: [8,18], tileMenu: { delay: 450, hideDelay: 250 }, doubleTapMs: 350, iframe: { allow, sandbox: null } }` | window manager; `tileMenu: false` switches the tile menu off |
| `overview` | `{ labelHeight: 30, padding: [12, 40] }` | overview layout |
| `session` | `{ restore: true, debounceMs: 400, maxWindows: 20 }` | session restore |
| `dock` | `{ size: 'medium', magnify: false, pins: null, max: 60 }` | dock |
| `desktop` | `{ icons: true }` | desktop icons |
| `boot`, `power` | `{ enabled: true, ms: 1100 }`, `{ shutdownUrl: null }` | boot/off screens; `shutdownUrl`: an http(s) URL or a `{ lang: url }` map (null = an off screen with a power button) |
| `modules` | `['reader','viewer','catalog','search','calendar','notify']` | optional modules (`'id'` or `{ id, src }`) |
| `apps` | `['editor','notes','todo','calc','terminal','media','fortune']` | apps |
| `services` | `{ weather: false, geolocation: false, fortune: false, dns: false }` | site-level switch per online service |
| `reader` | `{ rules: [{ match: 'site/content/', content, title, lead }], titleSeparator, cacheSize: 24 }` | content extraction; `match`: a path prefix **relative to the installation root** (resolved against `ROOT` like `site.routes[].prefix`, so it works in a sub-folder) or a regular expression starting with `^` (tested against the absolute path) |
| `search` | `{ pagefind: null, maxPerGroup: 6, shortcut: 'Mod+K' }` | `pagefind`: `null`, a path string, or `{ path, excerptLength: 16, maxHits: 8, label: null (→ "Full-text search"), order: 900 }` (needs `'wasm-unsafe-eval'`, §5); `maxPerGroup` 1–50; `shortcut` a key spec or `null` (none) |
| `notify` | `{ feeds: { de, en }, app: 'about', hideMs: 9000, maxBanners: 3, pathPrefix: null }` | JSON Feed per language (same origin); `app`: the page app items open in (`null` = through the router); `pathPrefix`: only items below this path (relative to the root) |
| `holidays` | `{ region: null }` | region id, e.g. `'de-by'` |
| `calendar` | `{ firstDay: 'auto', weekNumbers: true }` | |
| `weather` | `{ provider: 'open-meteo', units: 'metric', defaultPlace: 'berlin', places: [5], freshMs: 900000, maxAgeMs: 10800000, everyMs: 1800000 }` | `provider`: `'open-meteo'` \| `'brightsky'` \| one added with `Desk.weather.addProvider()`; `units` `metric` \| `imperial`; `everyMs`: refresh interval |
| `fortune` | `{ remote: null, dir: 'site/data/fortunes/', langs: ['de', 'en'], block: [] }` | `remote`: an online source — `'jokeapi'`, `'uselessfacts'` or one added with `Desk.fortune.addProvider()` (needs `services.fortune` and its host in `connect-src`); `dir`: folder of the local `<lang>.json` files (relative to the root); `langs`: the languages that have such a file — only these are fetched (`null`: try every language of the chain); `block`: category ids never shown (local and remote) |
| `media` | `{ maxItems: 200, seekStep: 5 }` | audio/video players: longest playlist (1–1000), seconds for ←/→ (1–60) |
| `editor` | `{ maxTabs: 20, maxFileBytes: 5242880, wrap: false, invisibles: true }` | tabs at most (1–100), largest file that opens, word wrap / invisible characters before the user chose |
| `calc` | `{ historySize: 50 }` | calculations kept (0–500) |
| `terminal` | `{ user: 'guest', doh: null, eggs: true, historySize: 100, manUrl: null }` | `doh`: `null` or `{ url: 'https://…/resolve', name: 'dns.google' }` — a DNS-over-HTTPS JSON resolver (`Accept: application/dns-json`, https only, needs `services.dns`; its host must be in `connect-src`) |
| `trash` | `{ days: 30, max: 200 }` | |
| `backup` | `{ format: 'jpkcom-desktop-backup', filePrefix: 'jpkcom-desktop', maxBytes: 5242880 }` | |
| `vault` | `{ salt: '', iterations: 600000, dir: 'site/vault/', collection: 'bookmarks', maxBytes: 1048576 }` | `collection`: the collection (`site/apps.js`) unlocked bookmarks join; `maxBytes`: largest sealed file accepted |
| `pwa`, `offline` | `{ enabled: true }`, `{ maxPages: 80, timeoutMs: 4000 }` | P12 |

`DEFAULTS` is the single source of defaults and holds **every key any shipped part reads** (so
`Desk.config` shows the full shape and `sw.js`/the tools see the same defaults). Modules still clean their
own section: a module validates it before `setup()` with the descriptor fields `configKey` +
`validateConfig(section, warn) → cleaned` (§8); the loader runs it once (on a writable copy) and keeps
the frozen result in `Desk.modules.config(id)`. Without `validateConfig`, `Desk.modules.config(id)` is
the merged section as it is. A new module adds its keys to `DEFAULTS` and the cleaning to its own
descriptor — and every new key gets a comment in `site/config.js`.

## 7. Site manifest (`site/apps.js`)

```js
export default {
	apps: [AppEntry],
	collections: [Collection],
	menus: [Menu],          // consumed by the menus (P2)
	files: { name: 'path' | { lang: 'path' } | { url: 'path' | { lang: 'path' }, aliases: ['name'] } }   // terminal `cat` (P9)
	/* any other key is kept and readable via Desk.apps.data(key) */
};
```

**AppEntry** (also the manifest part of a module app):

| Field | Type | Meaning |
|---|---|---|
| `id` | `[a-z0-9-]` | unique |
| `kind` | string | `page` (Reader), `web` (iframe), `link` (new tab, https), `app` (module impl), `native` (panel impl), `launcher`, `collection` (Catalog, + `collection: id`), `image` (viewer, from collections/drops), `viewer`; further kinds via `wm.defineKind()` |
| `name` | text | string, `'@ns.key'` or `{ lang: text }` — required |
| `desc` | text | tooltip/search/Catalog |
| `icon` | icon id | `'ti-…'`, `'tif-…'` or a custom glyph |
| `iconFull` | icon id | optional: the icon while the app holds something (the trash; the dock reads it) |
| `tint` | `'name'` or `['#top', '#bottom']` | tile gradient |
| `logo` | `true` or logo id | tile shows the logo instead of the icon |
| `mark` | ≤ 4 chars | text tile instead of the icon |
| `url` | path/URL or `{ lang: url }` | for `page`, `web`, `link`, `image` |
| `size` | `[w, h]` | default window size |
| `fixed`, `desktop`, `dock`, `hidden`, `nodock`, `transient`, `download` | boolean | as in the original (`desktop`/`dock`: default placement; `hidden`: not in "All apps"; `nodock`: never pinnable; `transient`: never in session/deep links) |
| `alias` | app id | shows and launches the target |
| custom fields | any | kept as they are |

**Override records**: a site entry with an id but **no `kind` and no `alias`** — `{ id: 'notes', dock: true }`
— is not an app of its own: its fields go onto the app of that id that a module, a collection or the
author links bring (before or after; again when it comes back, e.g. after a vault unlock). The site's
fields win. An override that no app picked up is reported once at `'modules:ready'`
(`registry.pendingOverrides()`).

Registry adds: `source` (`site`/`module`/`author`/…), `module`, and for collection items
`collection`, `group`, `slug`, `item: true`; for links `host`.

**Collection**:

```js
{ id: 'bookmarks', prefix: 'link', app: 'bookmarks',          // app: Catalog window id (default = id; null = none)
  name: { en: 'Bookmarks', de: 'Lesezeichen' }, desc, icon, tint,
  sort: 'alpha' | 'manual',                                     // alpha: group order, then name (Intl.Collator)
  itemKind: 'auto' | 'link' | 'web' | 'page' | 'image',         // auto: https → link, image ext → image, else web
  basePath: 'demos/',          // routing: <base> → collection app, <base><slug>/ → item app (relative to the root)
  urlTemplate: 'demos/{slug}/', // item url when an item has none
  size, defaultIcon, initials: false, allowHttp: false, search: true, appSize,
  webUrl: 'tools/' | { en: 'en/tools/', de: 'tools/' },       // the collection on the classic website (Catalog button)
  allLabel: { en: 'All tools', de: 'Alle Werkzeuge' },        // Catalog wording for "All" …
  webLabel: { en: 'Tools on the website', de: 'Werkzeuge auf der Website' },   // … and "Overview on the web"
  groups: [{ id, name, desc, icon, tint }],
  items: [{ slug, group, name, desc, url | app, icon, tint, mark, kind, size,
            docs, guide,            // URL or { lang: url }: Catalog status-bar actions, terminal `man`
            fileName, download,     // download name / offer a download (image items always do)
            nodock, hidden,         // never pinnable / not in lists (as on an AppEntry)
            allowHttp }] }          // this item may be an http:// link (an intranet bookmark)
```

`webUrl` is a path/URL or a `{ lang: url }` map; `allLabel`/`webLabel` are text, `'@ns.key'` or
`{ lang: text }` and may also sit on the collection's Catalog app. Unknown group, missing slug/name/url,
bad protocol → warned and skipped. Item icon/tint fall back item → group → collection
(`defaultIcon` → `icon`).

Registry API for collections: `addCollection(def, { source })`, `extendCollection(id, { groups, items,
prepend }, { source })`, `removeSource(source)`, **`removeCollection(id)`** (a collection another source
added — the vault's own one after a lock — with its items and its registry-made Catalog app; the site's
collections cannot be removed → `false`), `collection(id)`, `collections()`, `items(id)`.

## 8. Module descriptor

A module is `src/modules/<id>/index.js`, `src/apps/<id>/index.js`, `src/<part>/index.js` (core) or a
site module `{ id, src }`. Its default export:

```js
import Desk from '../../core/api.js';     // or use the `desk` argument of setup()

export default {
	id: 'notes',                       // = the configured id
	kind: 'app',                       // 'core' | 'module' | 'app'
	requires: [],                      // module ids that must be set up first (missing → this one is skipped)
	i18n: ['notes'],                   // locale namespaces: locales/<lang>/notes.js (loaded for the whole chain)
	styles: ['notes.css'],             // relative to this file; injected as <link>, awaited before setup()

	/* Apps: one (app + top-level hooks) or several (apps: [...], hooks inside each) */
	app: { icon: 'ti-notes', tint: 'orange', size: [780, 520], fixed: false, name: '@notes.appName' },
	// apps: [{ id: 'audio', kind: 'app', icon, tint, size, name, mount, focus, … }, { id: 'video', … }],

	storage: {                         // keys (without namespace prefix) → backup/reset registries
		notes: { type: 'json', backup: true, reset: 'notes', label: '@notes.title',
			validate: v => cleanNotes(v),     // returns the cleaned value or null
			count: v => v.notes.length }      // for backup/reset summaries
	},
	resetGroups: [{ id: 'notes', label: '@notes.title', hint: '@notes.resetHint', order: 40, onReset() {} }],   // §14
	trash: { note: { restore: (data, item) => true, icon: 'ti-note', label: '@notes.trashType' } },
	consent: [{ id: 'weather', hosts: ['api.open-meteo.com'], label: '@weather.service', hint: '@weather.serviceHint' }],

	/* Contributions (consumed by the parts that own the extension point) */
	files: { text: { accept: ['.txt', '.md'], mime: /^text\//, label: '@editor.dropLabel', order: 50,
	                 multiple: false, max: 10, open(file | files, ctx) {} } },                            // drop (P2)
	settingsSections: [{ id: 'notes', label: '@notes.title', icon: 'ti-notes', order: 50 }],   // settings (P3)
	settings: [{ id: 'notes-sort', section: 'general', order: 50, render(ctx) { return node; } }],
	shortcuts: [{ id: 'notes-new', keys: 'Alt+N', label: '@notes.new', scope: 'global' | 'window', run(e) { return true; } }],
	terminal: { notes: { run(args, io, ctx) {}, help: '@notes.cmdHelp', usage, man, complete(word, ctx) {},
	                     hidden: false, when() { return true; } } },                                     // P9
	search: [{ id: 'notes', label: '@notes.title', order: 40, max: 6, async search(q, ctx) { return results; } }], // P5
	calendar: [{ id: 'weather', order: 10, render(ctx) { return node | null; } }],                         // P6
	contextMenu: [{ selector: '.notes-item', label(el) { return text; }, select(el) {},
	                items(el, ctx) { return menuItems; } }],                                               // P2

	configKey: 'notes',                // optional: its config section (§6) …
	validateConfig(section, warn) { return section },   // … cleaned once before setup() → Desk.modules.config(id)

	async setup(desk) {},              // once, after registration; may provide services

	/* Window hooks of the app (the WM calls them; all optional except mount) */
	mount(win, body, bar, opts) {},    // build content into body, buttons into bar (.win-actions; aria-label each)
	render(win) { return node },       // kind 'native' (panels) instead of mount: rebuilt on a language switch
	focus(win) {},                     // after open and when shown again
	relabel(win) {},                   // language changed: swap labels only, keep content/cursor/state
	reopen(win, opts) {},              // open() of the already open window with new opts
	                                   //   (Desk.launch('settings', { section }) switches the section)
	menu(win) { return [] },           // items for the app menu (menus engine format)
	unmount(win) {},                   // closing: flush pending saves, remove listeners
	serialize(win) { return state },   // JSON-safe state for session restore / deep links
	restore(win, state) {},            // apply serialized state after mount (validate it!)
	locationOf(win) { return url },    // current same-origin location (address bar / "copy link")
	acceptUrl(app, path) { return path | null },   // the ONLY hook that gets the app, not a window: may a
	                                   //   stored/linked path open this app? (session restore, deep links)
	reload(win) {},                    // title-bar/menu "Reload"
	popOut(win) {},                    // "Open in new tab" (default: locationOf → new tab)
	canPopOut(win) { return true },    // false: no "Open in new tab" for this window now (a file from the device, §5)
	canLink(win) { return true },      // false: no "Copy link to this window" now (it shows a file from the device, §5)
	beforeClose(win) { return true }   // false (or Promise<false>) cancels closing (unsaved changes question)
};
```

The hook names are `HOOKS` in `src/core/modules.js` (`mount render focus relabel menu unmount reopen
serialize restore locationOf acceptUrl reload popOut canPopOut canLink beforeClose`): in an app definition they go
to the implementation (`registry.impl(app)`, `win.impl`), every other field is manifest.

### Contribution shapes

The extension points in detail (the owning package's doc in `docs/packages/` has the rest):

- **`files`** (drop, P2) — `{ <kind>: { accept?: ['.ext'], mime?: RegExp | 'type/', label, icon, order = 50,
  multiple?, max = 10, open(file | files, ctx) } }`. A file goes to the first handler (by `order`) whose
  `mime` matches its type or whose `accept` lists its extension; **without `accept`/`mime` the key**
  (`'text'`, `'audio'`, `'video'`, `'image'`) **selects the shell's built-in detection** of that kind.
  With `multiple: true` the handler gets all its files of a drop at once (playlists, the viewer), otherwise
  one after the other; at most `max` per drop. `label` must be a phrase that fits the drop overlay's "Opens {list}" (e.g.
  `'@editor.dropLabel'` = "text in the editor"). `ctx = { target, files }` (`target`: the element dropped on).
- **`settings`** (P3) — `[{ id, section, order, render(ctx) → Node | Node[] | null }]`, `ctx = { section,
  row, toggle, segments, select, button, redraw, h, t, L }` (the row helpers of the `settings` service).
  **A contribution with the id of a built-in row replaces it** (the built-in row ids per section are listed
  in `docs/packages/p03-panels.md`). `settingsSections: [{ id, label, icon, tint, order }]` adds sections
  (shown only while they have rows).
- **`shortcuts`** (P2) — `[{ id, keys, run(e) → true when handled, label, hint, scope: 'global' | 'window',
  app, inEditable, when }]`; a module shortcut with a built-in id replaces it.
- **`contextMenu`** (P2) — `[{ selector, items(el, ctx) → Item[], label?: '@ns.key' | text | (el) → text,
  select?(el) }]`. The matching element closest to the target wins; `select(el)` runs before the menu
  opens (e.g. select a Catalog item); `ctx = { target, keyboard, appItems(app, extra), windowItems,
  pinItems, linkItems, group, addressOf }` — the shell's building blocks. Contributions resolve before the shell's
  built-in branches (§20).
- **`search`** (P5) — `[{ id, label, order = 100, max, minLength = 1, delay = 160, warm?(), available?(),
  search(q, ctx) }]`; `ctx = { query, words (folded), fold(text), signal (AbortSignal), lang, max }`;
  result rows `[{ title, sub?, app?, icon?, tint?, url?, run?(), external?, key? }]` — **a row must open
  through `run`, `url` or an app** (id or entry with `id`), else it is dropped. Runtime providers:
  `Desk.search.addProvider(def) → remove()`. The search opens on "/" in the bubble phase: an app that
  uses "/" as a key itself must call `preventDefault()`.
- **`calendar`** (P6) — `[{ id, order, render(ctx) → Node | null }]`, `ctx = { view: { y, m } (m 0-based),
  today: Date, close(returnFocus), redraw() }`; shipped: holidays 0, weather 10, notify 20.
- **`terminal`** (P9) — `{ <name>: { run(args, io, ctx), help, usage, man, complete(word, ctx) → string[],
  hidden, when() → boolean } }`; `help`/`usage`/`man` are `'@ns.key'`, `{ lang: text }`, a string or a
  function. `io`: `say(text | nodes, cls?)`, `err(text)`, `dim(text)`, `table(rows)`, `heading`, `blank`,
  `link`, `markdown`, `progress(text) → done()`, `readLine(label, { secret }?) → Promise<string | null>`
  (`null` once `io.signal` aborted: Ctrl+C or the window closed), `clear()`, `cols()`, `win`, `signal`.
  The full `io`/`ctx` reference is `docs/packages/p09-terminal.md`. Runtime: `Desk.terminal.register()`.

Loader behaviour:

- Field keys not in the reserved list that hold an array or object are **contributions**:
  `Desk.modules.contributions(point)` → `[{ module, ...item }]` (keyed objects get `id` = key).
  A consumer reads the list in its `setup()` (it runs after modules it `requires`) and listens to
  `'module:loaded'` for modules that come later.
- `storage`, `resetGroups`, `trash`, `consent` are registered by the core (§14, §16).
- An app gets `kind: 'app'` unless it says otherwise; a site entry with the same id wins field by
  field, the module adds its implementation (impl).
- `setup()` throwing → the module is reported. First, **what `setup()` registered through the shared
  parts before it threw is withdrawn**, newest first (`core/undo.js`): services from `Desk.provide()`
  (`'service:remove'`, the name is free again), bus listeners added with `on`/`once`, and window kinds
  from `wm.defineKind()` (`'wm:kind'` `{ kind, removed: true }`). Then **everything its descriptor
  declared is withdrawn**: its apps (site apps of the same id lose the impl), contributions
  (`dropContributions(id)`), consent services (`consent.removeModule(id)`), storage keys, reset groups
  and trash types (`storage.removeModule(id)`) and its config section; then `'module:failed'` `{ id, reason }` —
  consumers that cached contributions drop that module's items. The rest continues.
  **Not undone by the loader**: DOM listeners and timers the module creates itself — so write `setup()`
  to add them **last**, after every step that can throw. Services that keep per-module registrations
  (wallpaper motifs, terminal commands, …) drop them themselves on `'module:failed'`.
- `stub: true` → placeholder, nothing registered.

## 9. Public Desk API

`import Desk from 'src/core/api.js'` (frozen) — also `window.JPKDesk`.

```ts
Desk.version: string                          // '1.0.0'
Desk.project: { name, author, url, repo, license }
Desk.config                                   // deep-frozen effective config

// Events (§11)
Desk.on(name, fn) → off()     Desk.off(name, fn)     Desk.once(name, fn) → off()     Desk.emit(name, payload)
Desk.bus                                       // { on, off, once, emit }

// Environment
Desk.isCompact() → boolean     Desk.reduceMotion() → boolean
Desk.env: { root, asset(path) → url, isCompact(), reduceMotion(), isStandalone(), isSecure, later(fn, ms), clamp(v, min, max) }

// Language (§12)
Desk.t(key, params?) → string     Desk.L(text) → string     Desk.lang() → code     Desk.i18n

// DOM, icons, a11y
Desk.h(tag, props?, ...kids) → HTMLElement
Desk.s(tag, props?, ...kids) → SVGElement
Desk.dom: { h, s, $, $$, clear, abbr(text, title), editable(node), focusable(root) → el[], trapFocus(container) → release(),
            markLang(el, lang) → el, foreignLang(lang) → lang | null, langText(text, params?) → string | <span lang>,
            cssEscape(v), debounce(fn, ms) (+ .flush() .cancel()), saveFile(data, name, type),
            copyText(text, { announce = true }) → Promise<boolean> }   // Clipboard API, else a hidden textarea +
                                                                       // execCommand('copy'); announces core.copied
Desk.dialog: {                                 // question sheets (src/core/dialog.js; .sheet in components.css)
  sheet(within, { title, text?, buttons?: [{ id, label, primary?, danger? }], focus?, cancel? }) → Promise<id | null>,
  confirm(within, { title, text?, ok?, cancel?, danger? }) → Promise<boolean>,
  alert(within, { title, text?, ok? }) → Promise<void>
}   // within: a window, an element (the sheet covers it) or null (the whole page, .sheet-global)
    // role=alertdialog + aria-modal, aria-labelledby/-describedby; Tab trapped; Esc = cancel (null);
    // keys never reach window shortcuts; focus returns to the opener; questions for the same
    // container queue; closing the window answers null. kit.js (P8) re-exports these.
Desk.icon(id, cls = 'i') → SVGSVGElement
Desk.tile(app, cls?) → HTMLSpanElement
Desk.icons: { icon, has(id), add(pack, { override }), logo(id?) → SVG|null, addLogo(id, build), brandGlyph(cls?), tile, tintValue(tint) }
Desk.announce(text, { assertive = false })

// Storage (§14)
Desk.store     Desk.V     Desk.storage

// Apps, collections, URLs (§15)
Desk.apps                                      // registry: get has list available impl register … items collection data
Desk.launch(id, opts?) → boolean
Desk.openUrl(url, base?) → boolean
Desk.router: { resolveUrl, isExternal, relPath, route, pageApp, pageAllowed, openUrl, acceptPath }
Desk.download(url, fileName?)
Desk.IMAGE_EXT: RegExp     Desk.initials(name) → string

// Network, consent (§16)
Desk.net: { request, getJson, getText, NetError }
Desk.consent: { register, unregister, removeModule, enabled, granted, set, get, list, hosts, revokeAll,
                ask(id, { within }) → Promise<boolean> }
                // revokeAll() emits one 'consent:change' { id: null, granted: false }

// Modules and services (§8, §10)
Desk.modules: { loadAll, get(id), isLoaded(id), list(), failed(), contributions(point), config(id) → section | null }
Desk.services: { provide, get, has, names, when(name) → Promise }
Desk.provide(name, impl) → boolean     Desk.service(name) → impl | null
Desk.wm, Desk.menus, Desk.dock, Desk.search, …   // live getters for every name in SERVICE_NAMES (null when absent)

// Shortcuts into services (null-safe)
Desk.windows() → string[]                      // names of open windows, bottom → top (wm.stack())
Desk.close(win)
Desk.searchFor(q)                              // opens the search with a query
Desk.showSettings(sectionId)                   // ex JPKDesk.settings(id)
Desk.toTrash(type, title, data) → boolean      // ex JPKDesk.trash(type, title, data)
Desk.notifyBanner({ title, body, icon, tint, app, url, meta, date, timeout, run }) → { close() } | null
Desk.refreshMenus()                            // emits 'menus:refresh'
```

Original API mapping: `register(id, impl)` → descriptor `app` + hooks; `trashHandler(type, fn)` →
descriptor `trash`; `fileHandler(kind, fn)` → descriptor `files`; `holidays(year)` →
`Desk.holidays?.year(y)`; `vault.*` → `Desk.vault?.…`.

## 10. Services

A part publishes its API with `Desk.provide(name, impl)` in `setup()`; consumers use
`Desk.<name>?.method()` or `await Desk.services.when(name)`. One provider per name. The table lists what
each service offers; arguments, return values and behaviour in detail are in the owning package's doc
(`docs/packages/p01-wm-extras.md` … `p11-fortune-site.md`).

| Name | Owner | Offers |
|---|---|---|
| `wm` | core part `wm` | §19 (incl. `wm.canPopOut(win)`, §19.1) |
| `snap` | P1 | `{ enabled, zone }` (getters), `zoneAt(pointerEvent) → 'max'\|'left'\|'right'\|null`, `cancel()` |
| `overview` | P1 | `toggle()`, `open()`, `close()`, `active` (getter), `isOpen()` |
| `session` | P1 | `save()`, `restore()`, `keeping()`, `setKeeping(on)`, `persist()`, `read()` (the validated stored session) |
| `menus` | core part `shell` | §20 (engine + `register()`); P2 registers the menus |
| `menubar` | P2 | `render()`, `addStatus(el, order) → remove()` (items in `#mb-status`, §18), `update(id)` |
| `dock` | P2 | `render(force?)`, `bounce(id)`, `tileFor(appId) → el`, `pins()`, `isPinned(id)`, `canPin(id)`, `pin(id)`, `unpin(id)`, `canMove(id, ±1)`, `move(id, ±1)`, `reset()`, `isCustom` (getter), `size()`, `setSize('small'\|'medium'\|'large')`, `sizes()`, `magnify()`, `setMagnify(on)` |
| `launcher` | P2 | `open(q?)`, `close(returnFocus?)`, `toggle()`, `isOpen()`, `relabel()` |
| `desktop` | P2 | desktop icons: `render(force?)`, `select(btn)`, `enabled()`, `hidden()`, `setHidden(hidden)` |
| `shortcuts` | P2 | `add(def \| fn) → remove()`, `list() → [{ id, keys, combos, display, label, scope, module }]`, `watch(frame)`, `parse(spec)`, `matches(parsed, event)` |
| `contextmenu` | P2 | `add(selector, items(el, ctx), { label, select }?) → remove()`, `resolve(el)`, `open(el, x, y, keyboard)`, building blocks `appItems(app, extra)`, `windowItems(win)`, `pinItems(app)`, `linkItems(app)`, `group(...lists)`, `addressOf(app)` |
| `notifications` | P2 | `show({ title, body, icon, tint, app, url, meta, date, timeout, run }) → { close() } \| null`, `clear()`, `when(ms)`, `stamp(ms)` |
| `deeplinks` | P2 | `linkFor(win)`, `hashFor(win)`, `open(hash)`, `parse(hash)`, `start()` |
| `drop` | P2 | `handlers() → [{ id, module, label }]`, `handle(id, def) → remove()`, `open(files, target?)`, `kindOf(file)` |
| `power` | P2 | `boot()`, `restart()`, `shutdown()`, `isOff()` (true from the moment restart/shut down darkens the screen: no shortcut and no other keydown/keyup listener reaches the desktop any more) |
| `clock` | P2 | `tick()`, `seconds()`, `setSeconds(on)`, `button` |
| `langmenu` | P2 | `render()`, `set(code)`, `items()`, `button` |
| `settings` | P3 | `show(section?)`, `sections()`, `redraw()`; row helpers `row()`, `toggle()`, `segments()`, `select()`, `button()` (positional arguments or one options object); `addSection(def) → remove()`, `addRow(def) → remove()`; `get() → { theme, accent, resolved }`, `set('theme' \| 'accent', value) → boolean` |
| `wallpaper` | P3 | `register(motif, { module }?) → boolean` (withdrawn on that module's `'module:failed'`), `unregister(id)`, `set(value)`, `get()`, `menuItems()`, `motifs() → [{ id, name }]`, `keyOf(value)`, `open()` |
| `trash` | P3 | `add(type, title, data) → boolean`, `count()`, `list()`, `putBack(id) → Promise<boolean>`, `purge(id)`, `empty()`, `askEmpty()`, `open()` |
| `install` | P3 | `state` (getter: `'installed' \| 'offer' \| 'share' \| 'menu' \| 'off'`), `enabled` (getter), `run()` |
| `backup`, `about`, `help` | P3 | `backup.download()`, `.snapshot()`, `.open()`; `about.open()`; `help.open()` |
| `reader` | P4 | `open(url) → boolean` |
| `viewer` | P4 | `openFile(file) → boolean`, `openImage(file) → boolean`, `open(files, { target }) → boolean`, `formats()` |
| `catalog` | P4 | `open(collectionId) → boolean`, `actions(app) → [{ id, label, icon, run }]` |
| `search` | P5 | `open(q?)`, `close(returnFocus = false)`, `toggle()`, `isOpen()`, `addProvider(def) → remove()` |
| `calendar` | P6 | `toggle(opener, { section }?)`, `open(opener, opts?)`, `close(returnFocus = false)`, `isOpen()`, `opener()`, `redraw()` |
| `holidays` | P6 | `year(y) → [{ date, name, title, note, key }]`, `on(date) → [...]`, `addRegion(def) → boolean`, `region() → { id, name } \| null`, `regions()`, `heading()`, `label(x)` |
| `weather` | P6 | `addProvider(def)`, `providers()`, `provider()`, `refresh(force)`, `current()`, `place()`, `setPlace(id)`, `locate()` |
| `notify` | P6 | `check(banners = true)`, `clear()`, `enabled()`, `setEnabled(on)`, `items()` |
| `vault` | P7 | `available()`, `unlock(user, pass) → 'ok' \| 'denied' \| 'offline' \| 'unsupported'`, `keep()`, `lock()`, `forget()`, `resume()`, `user()`, `unlocked()`, `summary() → [{ id, name, count }]` |
| `terminal` | P9 | `register(name, def) → remove() \| null`, `list() → [{ name, hidden, source }]`, `has(name)` |
| `media` | P10 | `open(files) → number`, `add('audio' \| 'video', files) → number`, `kindOf(file)`, `types()` |
| `fortune` | P11 | `random({ cat }?) → Promise<{ text, lang, cat, by, url } \| null>`, `addProvider(def) → boolean` (`{ id, name, hosts, langs, categories (each with optional own langs), emptyStatus, url(), parse() }` — `parse()` may throw an error with `code: 'empty'` for "nothing found"), `providers()`, `source() → 'local' \| 'remote'` |

Popovers/overlays (menus, calendar, launcher, search, overview, tile menu) close each other via the
bus: before opening, emit `'popovers:close'` with `{ except: '<own name>' }`; listen to it and close
unless you are the exception. Also close on window `blur` (click into an iframe). Note that
`wm.show()`/`wm.open()` move the focus into a window's iframe, which fires window `blur` as well: a
popover whose own close path calls `wm.show()` (the overview picking a window) handles `blur` deferred —
one task later and only for the same opening, as the overview does — so it does not close itself in the
middle of its own action. A real tab switch or a click into an iframe still closes it.

## 11. Bus events

Every event is also dispatched on `document` as `CustomEvent('<namespace>:<name>', { detail })`.

| Event | Payload | Emitted by |
|---|---|---|
| `env:compact` | `{ compact }` | core env |
| `env:motion` | `{ reduce }` | core env |
| `lang:change` | `{ lang, prev }` | core i18n `setLang()` — every part relabels itself |
| `store:change` | `{ name, external }` | core store (`external: true` = another tab) |
| `storage:restore` | `{ names }` | storage registry (backup applied) |
| `storage:reset` | `{ groups }` | storage registry |
| `apps:change` | `{}` | registry (batched) |
| `consent:register` / `consent:change` | `{ id, removed? }` / `{ id, granted }` | consent (`removed: true` on unregister; `id: null` = `revokeAll()`: every consent withdrawn — handle it like your own id) |
| `service:provide` | `{ name }` | services |
| `service:remove` | `{ name }` | services (a failed setup()'s service is withdrawn, §8) |
| `module:loaded` | `{ id, kind }` | module loader |
| `module:failed` | `{ id, reason }` | module loader (setup threw; everything its descriptor declared is withdrawn, §8) |
| `modules:ready` | `{ loaded, failed }` | module loader |
| `desk:ready` | `{}` | boot |
| `theme:change` | `{ theme, resolved, accent }` | settings (P3) |
| `wallpaper:change` | `{ value }` | wallpaper (P3) |
| `popovers:close` | `{ except }` | anyone opening a popover |
| `menus:refresh` | `{}` | anyone (app name, window list changed) |
| `window:open` / `window:focus` / `window:change` / `window:minimize` / `window:close` | `{ win, restore }` / `{ win }` / `{ win, reason }` / `{ win, min }` / `{ win }` | wm (§19.4) |
| `wm:kind` | `{ kind, removed? }` | wm (`defineKind`; `removed: true` when a failed setup's kind is withdrawn) |
| `overview:open` / `overview:close` | `{}` | overview (P1) |
| `dock:change` | `{ pins }` | dock (P2) |
| `trash:change` | `{ count }` | trash (P3) |
| `install:change` | `{ state }` | install (P3): install offer arrived/used, app installed, display mode changed |
| `vault:change` | `{ unlocked, user }` | vault (P7): after every unlock, lock and `resume()` |
| `calendar:open` | `{ section }` | calendar (P6) |
| `calendar:close` | `{}` | calendar (P6) |
| `holidays:change` | `{ region }` | holidays (P6): the active region became available |
| `notify:new` | `{ items }` | notify (P6) |

New events: `area:verb`, documented here by the package that adds them.

## 12. i18n

Files: `locales/<lang>/_meta.js` (`{ name, intl, dir, yes }`) and `locales/<lang>/<ns>.js`
(`export default { key: 'text' | { zero?, one, two?, few?, many?, other, '=N'? } }`). Namespaces:
`core` (core), `wm` (P1), `shell` (P2), `settings`, `wallpaper`, `backup`, `trash`, `about`, `help` (P3),
`reader`, `viewer`, `catalog` (P4), `search` (P5), `calendar`, `holidays`, `weather`, `notify` (P6),
`vault` (P7), `editor`, `notes`, `todo`, `calc`, `kit` (P8), `terminal` (P9), `media` (P10), `fortune`
(P11). A module lists its namespaces in `i18n: [...]`. Adding a language: `locales/README.md`.
A module can bring its namespaces in its own folder instead (descriptor field `locales`, §8): its
`i18n` namespaces are then read from `<locales>/<lang>/<ns>.js` next to its `index.js` — same file
format, same fallback chain (a missing language falls back like any other file). A namespace that the
core or another module already uses is not redirected (warning; the existing source stays). The module
loader registers these folders through `addSource(i18n, ns, dirUrl)` from `src/core/i18n.js` before it
loads the namespaces; this is not part of `Desk.i18n`. `npm run i18n:check` checks
`site/modules/*/locales/` against the languages in `locales/`.

```ts
Desk.t('ns.key', params?) → string     // unqualified key → 'core'
  // chain: lang → base(lang) → config.defaultLang → 'en' → key (debug: warned once)
  // {name} placeholders; numbers formatted with the language's Intl tag, grouped only from 10 000 up
  //   (CLDR "min2": 2026 → '2026', 12345 → '12.345' in German) — pass years and ids as strings anyway
  // plural object: params.n (or params.count) → '=N' form → PluralRules category → other
Desk.L(text) → string                   // string | '@ns.key' | { lang: text } — chain, then first value
i18n.resolve(text, params?) → { text, lang }   // the same lookup plus the language the text was found in
  // (null: plain string or missing key). Text in another language than the page's gets lang/dir:
  // Desk.dom.markLang(el, lang), Desk.dom.langText(text) (a <span lang> when foreign),
  // Desk.apps.nameLang(app) for app names. Shell, menus, window titles and settings rows do this.
i18n.lang() → code     i18n.locale(code?) → Intl tag (meta.intl)     i18n.dir(code?) → 'ltr'|'rtl'
i18n.available() → codes (config.languages)     i18n.meta(code?)     i18n.displayName(code, inLang?)
i18n.setLang(code) → Promise<boolean>   // loads every namespace in use, stores 'lang', sets <html lang dir>, emits 'lang:change'
i18n.use(ns | ns[], code?) → Promise    // load namespaces (modules: use descriptor.i18n instead)
i18n.has(key) → boolean     i18n.chain(code?) → codes     i18n.isYes(answer) → boolean
i18n.fmtNumber(n, opts?)     i18n.fmtDate(d, opts = { dateStyle: 'medium' })     i18n.fmtTime(d, opts = { hour, minute })
i18n.dateParts(d, opts) → { weekday, day, month, … }     i18n.fmtBytes(n, { digits = 1 })
   // 1024 steps; below 1024 core.bytes ('161 B'), above that Intl unit names ('1.5 kB')
i18n.list(items, opts?)     i18n.relTime(value, unit, opts?)     i18n.collator(opts?)     i18n.compare(a, b)
i18n.pluralCategory(n)     i18n.decimalSep()     i18n.weekInfo() → { firstDay 1–7 (1 = Mon), weekend, minimalDays }
i18n.keys(combo, { symbols = keyboard with a ⌘ key }) → text
   // shortcut hints: 'Mod+K' → 'Ctrl+K' (en) / 'Strg+K' (de) / '⌘K' (symbols); key names from core
   // keyCtrl keyAlt keyShift keyMeta keyEnter keyEsc keySpace keyTab keyBackspace keyDelete keyPageUp
   // keyPageDown keyHome keyEnd, joiner keyJoin;
   // Mod = ⌘ on keyboards that have it, else Ctrl. Menus, help and the launcher hint use it.
```

`npm run i18n:check` warns when a plural object lacks a category the language needs
(`Intl.PluralRules(meta.intl).resolvedOptions().pluralCategories`: pl/ru `few`, `many`; ar also `zero`, `two`).

Rules: never concatenate translated fragments into sentences; never branch on a language code;
manifest/config texts go through `L()` (or `resolve()` + `markLang` where they are rendered: a text
that fell back to another language must carry its `lang`, WCAG 3.1.2); settings rows take `'@ns.key'`
labels so their fallback language can be marked; dates/numbers only through the formatters. Language
switching UI: toggle for 2 languages, menu for 3+ (P2), names from `displayName()`.

## 13. Icons

- Ids: `'ti-<name>'` (Tabler outline), `'tif-<name>'` (Tabler filled), custom: `jpk`, `wc-close`,
  `wc-min`, `wc-max`, `tile-left`, `tile-right`, `tile-max`, `tile-both`. **Verify a Tabler name exists**
  (`node_modules/@tabler/icons/icons/{outline,filled}/<name>.svg`) and always write ids out in full
  (the scanner only sees quoted literals).
- `npm run icons` (`tools/build-icons.mjs`) scans `src/`, `site/`, `index.html` and writes
  `src/icons/tabler.js` with only the used icons; unknown names fail. `npm run icons:check` for CI.
  **`site/icons.json`** (optional, committed): a JSON array of extra ids (`["ti-brand-github", "tif-star"]`)
  for icons no source names — above all those used only inside sealed vault data; `tools/seal-vault.mjs`
  (P7) warns about vault icon ids missing from `src/icons/tabler.js` and suggests adding them there.
  Data format `{ k: 'o'|'f', e: ['d…' | [tag, attrs]] }`, viewBox `0 0 24 24`.
- Runtime: `icon(id)` adds the `<symbol>` to the inline sprite on first use and returns
  `<svg class="i" aria-hidden="true"><use href="#id"></svg>`. Outline symbols carry
  `fill="none" stroke="currentColor"` (round caps/joins); stroke width = `--icon-stroke`.
  Unknown ids warn once and render empty.
- Logos: `icons.logo(id)` builds a fresh `<svg>` with unique gradient ids (`logos.jpkcom`);
  `icons.addLogo(id, build)` for site logos. `config.brand.logo`/`glyph` choose the brand.
- Packs: `icons.add(pack)` with the same data format (e.g. a site icon set).
- Accessibility: icons are decorative; the control carries the accessible name.

## 14. Storage

```ts
store.key(name) → '<ns>-<name>'
store.get(name) → string|null           store.set(name, value) → boolean (false: unavailable/full)
store.remove(name)
store.getJson(name, validate?, fallback = null)     // validate(v) → cleaned | null
store.setJson(name, value) → boolean
store.choice(name, allowed[], fallback)  store.flag(name, fallback) → boolean   store.setFlag(name, on)
store.names() → own names               store.usage() → { own, all } (bytes, UTF-16)
store.sget/sset/sremove(name)           // sessionStorage, same prefix
V.isObj V.str(v, max) V.int(v, min, max) V.num V.bool V.oneOf(v, list) V.hex V.id V.list(v, fn, max) V.path(v, max)

storage.registerKey(name, { type, backup, reset, validate, count, label }, module)
storage.registerGroup({ id, label, hint, order, onReset }, module)
storage.registerTrash(type, { restore, icon, label, app }, module)
storage.key(name)  storage.listKeys()  storage.resetGroups() → [{ …group, keys }]
storage.trashType(type)  storage.listTrashTypes()
storage.read(name) → validated value     storage.snapshot() → backup document
storage.inspect(doc) → { ok, created, entries, unknown }     storage.restore(entries) → boolean
storage.reset(groupIds) → Promise<doneIds>
```

Backup document: `{ format: config.backup.format, version, created: ISO, data: { name: value } }`.
Device-bound keys (`session`, feed state, cached weather) declare `backup: false` and reset group
`session`. Core declares key `lang` (group `settings`) and the groups `settings` (order 10, also
revokes all consents) and `session` (order 90). Consent keys: `consent-<id>` (group `settings`).

**Key ownership** (localStorage, `<namespace>-<name>`; declared in the descriptors' `storage`, so backup
and reset follow them without a hand-kept list — the original's key names are kept):

| Owner | Key | Type | Backup | Reset group |
|---|---|---|---|---|
| core | `lang` | text | yes | `settings` |
| wm (P1) | `session` | json | no (device-bound) | `session` |
| wm (P1) | `restore` (`'on'`/`'off'`) | text | yes | `settings` |
| shell (P2) | `dock` (own pin list) | json | yes | `dock` |
| shell (P2) | `docksize`, `magnify`, `icons`, `seconds` | text | yes | `settings` |
| panels (P3) | `theme`, `accent` | text | yes | `settings` |
| panels (P3) | `wallpaper` | json | yes | `wallpaper` |
| panels (P3) | `trash` | json | yes | `trash` |
| notify (P6) | `notify` (`'on'`/`'off'`) | text | yes | `settings` |
| notify (P6) | `feed` | json | no | `session` |
| weather (P6) | `weather` (place, rounded coordinates) | json | yes | `settings` |
| weather (P6) | `weather-data` (last result) | json | no | `session` |
| notes / todo / editor / calc (P8) | `notes` / `todos` / `editor` / `calc` | json | yes | `notes` / `todos` / `editor` / `calc` |
| terminal (P9) | `term` (history) | json | yes | `terminal` |
| fortune (P11) | `fortune` (source choice) | json | yes | `settings` |

**Reset groups** (Settings → Reset, by `order`): `settings` 10 (core; also revokes every consent),
`wallpaper` 20, `dock` 30 ("Dock layout"), `notes` 40, `todos` 45, `editor` 50, `calc` 55, `terminal` 58,
`trash` 80, `vault` 85 (no keys; `onReset` locks and forgets a kept login), `session` 90 (core),
`offline` 95 (panels; no keys, registered only where service workers exist: unregisters this
installation's worker and deletes its caches).

Other storage:

- **sessionStorage** `<namespace>-booted` — the boot screen once per session (`theme.js` reads it).
- **IndexedDB** `<namespace>-vault` (`store.key('vault')`), object store `login`, one record
  `{ key: CryptoKey (non-extractable), file, user }` — only after "stay logged in" (P7).
- **Cache Storage** (`sw.js`, P12): `<namespace>:<base>:<version>-<hash>` (the shell; `<base>` = the
  installation path, `<hash>` over the precache-relevant config) and `<namespace>:<base>:pages` (Reader
  pages). Activation and the `offline` reset delete **every cache of this naming scheme for their own
  base**, whatever the namespace; other installations and other apps of the origin keep theirs. Answers
  with `Cache-Control: no-store` or `private` are never stored; `config.vault.dir` is never cached.

## 15. URLs, routing, launching

```ts
router.resolveUrl(raw, base = root) → URL | null      // config.site.hosts → this origin
router.isExternal(url)     router.relPath(url) → path relative to the root | null
router.route(url) → { app } | { tab: true } | { page: true }
   // order: config.site.routes ({ match: regex | prefix: path, app | tab | page })
   //        → collection basePath (<base> → collection app; <base><slug>/ → item app)
   //        → non-.html file extension → tab → page
router.pageApp(path) → page app with the longest URL prefix | config.site.defaultPageApp | null
   // only page apps that can open now (registry.available — no Reader loaded → null); null when !pageAllowed(path)
router.pageAllowed(path) → boolean
   // may this path open as a page? Never the desktop itself (the installation root, index.html) nor a reserved
   // folder (createRouter({ reserved }): config.vault.dir). Deep links '#/<path>' there (a page or a file — not an
   // app route) are ignored silently; the Reader's acceptUrl refuses them (session values); openUrl() sends a link there to a new tab
router.openUrl(raw, base?) → boolean       // external → tab; app → launch; page → launch(pageApp, { url }); else tab
   // a route or page app whose launch() fails (module missing) falls back to a new tab — a link never goes nowhere
router.acceptPath(start, path, scope?) → path | null
   // may a same-origin path open in a window whose start page is start? Judged RELATIVE TO THE ROOT: inside
   // scope (a root-relative folder) or the start page's first folder below the root; the root itself and
   // index.html never qualify (a sub-folder install /desk/ must not accept /desk/ or /desk/site/vault/…).
   // The 'web' kind's acceptUrl uses it (app.scope optional).
launch(id, opts?) → boolean                // alias → target; launcher → toggle; link → tab; else wm.open(app, opts)
```

**Availability**: `registry.available(app)` is true only when the app can open now — its kind passes the
registry's kind check (set by the WM: `'link'`, `'launcher'` while a launcher service exists, or a kind
defined with `wm.defineKind`), module-backed kinds (`app`, `native`) have their implementation, aliases
their target. Unavailable apps leave All apps, the dock, menus and search (`registry.list()` skips
them); `'wm:kind'` and a new launcher re-announce `'apps:change'`. Tests and other hosts set the check
with `registry.setKindCheck(fn)` (`createRegistry({ kindCheck })`).

Paths in the manifest/config are relative to the installation root (works in a sub-folder);
absolute `/…` paths are allowed for same-origin content outside it.

## 16. Network and online services

```ts
net.request(url, { timeout = 8000, signal, service, headers, cache, accept }) → Response   // headers only
net.request(url, { …, read: 'json'|'text'|'blob'|'bytes', maxBytes?, onHeaders?(headers) }) → body
  // timeout, signal and maxBytes cover the whole transfer; onHeaders sees the headers first (prefer read)
net.getJson(url, opts) → any          net.getText(url, opts) → string
NetError.code: 'timeout' | 'http' | 'network' | 'parse' | 'consent' | 'aborted' | 'size'   (.status for http)
```

Cross-origin: `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`. With `service: id` the request
is refused unless `consent.granted(id)`.

Two gates per service: `config.services[id] === true` (site offers it; default all `false`) and the
user's consent (`consent.set(id, true)`, stored `consent-<id>`). Services are declared in
descriptors (`consent: [{ id, hosts, label, hint }]`); the settings section "Online services" lists
`consent.list()`; `consent.hosts()` gives the hosts for the CSP `connect-src`. A module asks before
the first request with **`consent.ask(id, { within })` → Promise<boolean>**: true at once when granted,
false at once when the site does not offer the service, otherwise a question sheet (`Desk.dialog`,
texts `core.consentTitle`/`consentText`/`consentAllow`/`consentDeny` with `{host}`) — "Allow" stores the
consent, "Not now"/Esc stores nothing. Concurrent asks for the same id share one question.

The shipped online services (all off by default) and what a site adds to its server's policy when it
switches one on (`docs/deploy.md`, the commented lines in `docs/server/*`):

| Service | Declared by | Hosts (`connect-src`) | Also |
|---|---|---|---|
| `weather` | weather (P6) | `https://api.open-meteo.com` (provider `open-meteo`) or `https://api.brightsky.dev` (`brightsky`) — the configured provider's hosts | — |
| `geolocation` | weather (P6) | none (the browser's location) | `Permissions-Policy: geolocation=(self)` for "Use my location" |
| `fortune` | fortune (P11) | `https://v2.jokeapi.dev` (`jokeapi`) or `https://uselessfacts.jsph.pl` (`uselessfacts`) — registered only when `config.fortune.remote` names a known provider | — |
| `dns` | terminal (P9) | the host of `config.terminal.doh.url` — declared **only when `config.terminal.doh` is valid** | — |

A provider added at runtime (`Desk.weather.addProvider()`, `Desk.fortune.addProvider()`) brings its own
hosts; the consent registration follows it.

## 17. CSS conventions and tokens

- **Layers** (declared once in `src/css/layers.css`):
  `reset, tokens, base, components, wm, shell, panels, modules, apps, compact, themes`.
  Every file wraps all rules in its layer: core parts their own (`@layer wm { … }`), optional modules
  `@layer modules`, apps `@layer apps`.
- **Compact (phones)**: `body.compact` only (set from `config.ui.compactQuery`; never an own media
  query for the same purpose). Put the overrides in the same file inside `@layer compact { body.compact … }`.
- **Nesting** native, at most 3 levels. **Logical properties** where direction matters
  (`inset-inline-start`, `margin-inline`, `text-align: start`); no `direction: rtl` tricks.
- **Prefixes**: `.win-*`/`.wc` (wm), `.mb-*` `.menu*` `.dock-*` `.launcher-*` `.icon*` `.notif*` (shell),
  `.set-*` `.wp-*` `.bk-*` `.trash-*` `.about-*` `.help` (panels), `.reader-*` `.viewer-*` `.catalog-*`
  `.search-*` `.cal-*` `.wx-*` `.vault-*`, apps by id (`.ed-*`, `.notes-*`, `.todo-*`, `.calc-*`, `.term-*`,
  `.media-*`, `.fortune-*`). Each core part, panel, module or app may also use **one bare root class**
  for its own UI — its id or its prefix stem (`.calendar`, `.settings`, `.help`, `.reader`, `.viewer`,
  `.catalog`, `.notes`, `.todo`, `.calc`, `.term`, `.fortune`); everything inside it uses the prefix.
  Shared components (`src/css/components.css`): `.tile`, `.btn` (`-primary`,
  `-danger`), `.seg`, `.swatches` (colour via `--c`), `.switch`, `.check`, `.field` + `.field-input`,
  `.sheet` `.sheet-box` `.sheet-btns` (+ `.sheet-global` over the page; built by `Desk.dialog`), `.panel`, `.notice`, `.set-row` `.set-label` `.set-value`
  `.set-intro` `.set-actions` `.set-confirm`, `kbd`. Utilities: `.visually-hidden`, `[hidden]`,
  `svg.i`, `.sprite`.
- **Dark islands**: `data-island="dark"` on an element keeps it dark in the light theme
  (menu bar, desktop icons, terminal, calculator, code blocks, boot screen).
- **Colours**: never literals in module CSS — use tokens. Surfaces/lines `rgb(var(--ink) / a)`,
  shadows `rgb(0 0 0 / calc(a * var(--shade)))`, text `--text`/`--text-2`/`--text-3`
  (`--text-3` only for counts, placeholders, disabled), on accent/danger `--on-accent`.
- **Tints**: `tile()` sets `--tint` (`var(--t-<name>)` or a colour pair) via CSSOM — no `.tint-*` classes.

Tokens (`src/css/tokens.css`):

| Group | Tokens |
|---|---|
| Brand | `--brand --brand-light --brand-dark --brand-darker --brand-darkest`, `--wallpaper-from --wallpaper-to`, `--logo-glow --logo-glow-off` |
| Accent | `--accent-{blue,violet,pink,orange,green,teal,graphite}` (+ config ids), `--accent`, `--on-accent`, `--accent-ring` (focus rings and selection marks on window surfaces: the accent darkened/lightened to ≥ 3:1 against `--win-bg`, set by the settings panel), `--danger` |
| Window controls | `--wc-close --wc-min --wc-max --wc-glyph --wc-off`; `html[data-wc=left|right]`, `html[data-wc-style=classic|minimal]` |
| Tiles | `--t-<tint>` (pairs), `--tile --tile-fg --tile-highlight --tile-edge --tile-shadow --tile-shadow-sm` |
| Theme (dark/light) | `--ink --shade --glass --glass-strong --win-bg --win-bar --win-bar-inactive --frame-bg --line --line-strong --overlay --dock-bg --snap-bg --check-a --check-b --warn --done --gutter-bg --gutter-current --calc-fn --calc-num --text --text-2 --text-3 --focus --scroll-thumb --scroll-thumb-hover --cal-weekend --cal-week --reader-text --reader-link --highlight` |
| Fixed surfaces | `--menubar-bg --calc-bg --calc-op --media-stage --boot-bg --boot-fg --reader-code-bg --scroll-code-thumb --term-user --term-error` |
| Details | `--switch-knob --swatch-edge --icon-label-outline --match --match-current --mark-on-accent --fortune-mark` |
| Type | `--font --font-mono --icon-stroke` |
| Layout | `--mb-h --mb-total --bar-h --radius-win --radius-menu`, window controls `--wc-box-w --wc-box-h --wc-dot --wc-glyph-size` (compact: larger `--mb-h --bar-h --tile --radius-win --wc-*`, `--bounce`, `--dock-space` — the height the Dock takes at the bottom, for sheets that must end above it); per window `--title-side` (title fitting) |
| Stacking | `--z-overview 790 --z-launcher 800 --z-dock 900 --z-menubar 1000 --z-notification 1050 --z-tilemenu 1060 --z-menu 1100 --z-popover 1150 --z-boot 5000` (windows stack inside `#workspace`, an isolated context below all of them) |
| Motion | `--ease`, `--anim` (= `config.ui.animMs`, set by `theme.js` before the first paint), `--dur: var(--anim)` (window transitions — JS timers and CSS use the same duration) |
| WM | `--win-min-w --win-min-h` (from `config.wm.minSize`, set by `initWM()`) |

`html[data-theme]` is always `dark` or `light` (resolved). Site theme presets override tokens in
`@layer themes`. Pre-paint attributes from `theme.js`: `html[data-wp-dir=glow|down|diag|radial]` (the
default gradient's direction; `base.css` paints the same gradient as the wallpaper renderer, P3) and
`html[data-boot=pending]` (boot cover, §3).

## 18. Shell DOM contract

`index.html` provides (no other static markup):

| Selector | Role |
|---|---|
| `#wallpaper.wallpaper` | wallpaper layer (`aria-hidden`) — P3 paints into it |
| `header#menubar.menubar[data-island=dark]` | menu bar; P2 sets `aria-label` (`core.menubar`) |
| `#mb-menus.mb-left[role=menubar]` | brand menu + app/site menus (P2) |
| `#mb-status.mb-right` | status items in order: search 10, language 80, weather 85, clock 90 (each part adds its button via `menubar.addStatus(el, order)`; weather and clock — both calendar openers — sit side by side) |
| `main#workspace.workspace` | window area; `#desk-title` (visually hidden h1 = brand name) |
| `ul#desktop-icons.icons[data-island=dark]` | desktop icons (P2) |
| `#windows.windows` | window layer (P1) |
| `nav#dock.dock > ul#dock-list.dock-list` | dock (P2; `aria-label` `core.dock`) |
| `svg.sprite` | created by `icons.js` on first use |
| `noscript > div.noscript` | static no-JS message: one `<p lang>` per offered language, kept in step with `config.languages` by hand (it cannot be translated at runtime) |

Body classes: `compact`, `standalone`, `is-ready`; P1/P2 add e.g. `is-overview`, `dock-small`,
`dock-large`, `dock-magnify`, `icons-hidden`, `mb-tight`.

## 19. WM API

Service `wm` (`Desk.wm`), provided by the core part `wm` (`src/wm/index.js` → `src/wm/wm.js`). ES modules
may also import the named functions from `src/wm/wm.js` directly — it imports core modules only, never
an optional module, so there is no cycle. One window per app id.

### 19.1 Windows

```ts
wm.open(app | appId, opts?) → Win | null
   // opts: { url?: string, scroll?: number, state?: any, restore?: boolean }
   // An open window is shown instead; the kind's reopen(win, opts) receives the options (Reader: a new URL).
   // null: unknown app, missing implementation (registry.available), or no kind registered for app.kind.
   // An alias opens its target. restore: true = session restore (no open animation; 'window:open' carries restore).
wm.close(win, { force = false }?) → boolean      // the kind's beforeClose(win) may veto (false) or answer later (Promise<boolean>)
wm.closeAll()                                     // every window; each beforeClose still asks
wm.show(win)                                      // from the dock if minimised, to the front, focus inside, kind focus()
wm.focus(win | null)                              // z-order + .is-active only (no DOM focus); 'window:focus' when it changed
wm.focusTop() → Win | null                        // the topmost visible window becomes active
wm.minimize(win, { animate = true }?)  wm.unminimize(win)
   // the window shrinks towards dock.tileFor(appId) when a dock offers it; { animate: false } (and reduced
   // motion) hides it at once (.is-min) — 'window:minimize' is emitted all the same; focusTop() only when it was active
wm.toggleMax(win)                                  // zoom ↔ free (not for fixed windows, not in compact mode)
wm.snapTo(win, 'left' | 'right')                   // half of the screen; the same side again frees it
wm.tileBoth()                                      // active window left, the next visible one right
wm.layout(win, 'max' | 'left' | 'right' | null)    // animated layout change (the general form)
wm.cycle(dir = 1)                                  // front window to the back (1) / back to the front (-1)
wm.relayout()                                      // keep windows reachable (runs on resize and 'env:compact')
wm.relabel()                                       // language switch (runs on 'lang:change')
wm.setTitle(win, text | null, lang?)               // null → the app's name (marked with its fallback language);
                                                   // lang: the title's language (a page's lang) → markLang; emits 'window:change' { reason: 'title' }
wm.reload(win)     wm.popOut(win)                  // through the kind (popOut falls back to locationOf + new tab)
wm.canPopOut(win) → boolean                       // may it open in a new tab? false without popOut and location, or when
                                                  //   the kind's canPopOut(win) says false (or throws); popOut() is then a no-op.
                                                  //   'app'/'native' windows: only with the implementation's own popOut()
                                                  //   or a locationOf(win) (Notes, the players … → false)
wm.canLink(win) → boolean                         // does a link (#app=<id> / #/path) lead back to what it shows? true unless
                                                  //   the kind's canLink(win) says false (or throws); "Copy link" follows it
wm.locationOf(win) → '/path?query' | null          // same-origin location of the content (kind locationOf), normalised
wm.serialize(win) → JSON | null                    // the kind's serialize(win), checked to be JSON-safe
wm.acceptUrl(app, '/path') → '/path' | null        // may this stored/linked path open in this app? (kind acceptUrl)
wm.list() → Win[]                                 // OPEN order (oldest first)
wm.stack() → Win[]                                // STACKING order, bottom → top (z-index); minimised ones included
wm.zOf(win) → number                              // a window's stacking position (higher = in front)
wm.active() → Win | null   wm.get(appId) → Win | null   wm.has(appId)   wm.isMin(win | appId)
```

### 19.2 The window object (`Win`)

| Field / method | Meaning |
|---|---|
| `id` | DOM id of the window element (`win-<n>`) |
| `app` | the frozen registry entry (`app.id` is the key in `wm.get()`) |
| `kind` | `app.kind` |
| `def` | the kind definition (§19.3) |
| `impl` | the module implementation for kinds `app`/`native` (`registry.impl(app)`), else `null` (was `win.ext`) |
| `el` | `section.win.win-<kind>[role=dialog][aria-labelledby][tabindex=-1][data-app]` |
| `bar` | `header.win-bar` (controls, title, optional `.win-nav`, `.win-actions`) — passed to `mount()` as `bar` |
| `body` | `div.win-body` — passed to `mount()` as `body`; `.has-frame` for iframes |
| `controls` | `div.win-controls` > `button.wc.wc-close`, `.wc-min`, `.wc-max` (glyphs `wc-*`, `aria-label` from `wm.*`); decorators may add nodes — always find the buttons by class |
| `titleEl` | `h2.win-title` (the dialog's name: app tile + text) |
| `titleText` | `span.win-title-text` — kept for apps from the original; prefer `setTitle()` / `title` |
| `title` | getter: the shown title text |
| `setTitle(text \| null, lang?)` | as `wm.setTitle(win, …)` |
| `actions()` | the `.win-actions` container at the end of the bar (created on first use) |
| `addActions(...nodes)` | appends buttons to it, returns the container |
| `button({ icon, label, onClick, pressed?, cls?, disabled? })` | a `.win-btn` with `aria-label` + `title` = label (`aria-pressed` when `pressed` is given) |
| `rect` | free geometry `{ x, y, w, h }` in workspace pixels (read; write through `wm.rect(win, r)`) |
| `layout` | `null` \| `'max'` \| `'left'` \| `'right'`; getters `max` (boolean) and `tile` (`'left'`/`'right'`/`null`) |
| `min` | minimised to the dock |
| `isActive` | getter |
| `url` | `web` kind: the iframe's current URL (null when unknown) |
| `frame` | `web` kind: the `<iframe>` |
| `state` | free object for the kind (Reader history, viewer data, …) — kinds keep their data here |
| `close(opts?)`, `show()`, `minimize()`, `toggleMax()` | shortcuts to the wm functions |
| `changed(reason = 'state')` | tells listeners (session, deep links) that serializable state changed → `'window:change'` |

Window markup (CSS classes in `src/wm/wm.css`): `.win` + `.is-active .is-max .is-tiled .is-fixed .is-min
.is-anim .is-opening .is-closing`, `[data-layout]`; `.win-bar` (+ `.is-folded`), `.win-controls`, `.wc`,
`.win-title`, `.win-title-text`, `.win-nav`, `.win-actions`, `.win-btn`, `.win-more`, `.win-body`, `.win-loading`
(+ `.is-done`), `.rz[data-dir]` (8 resize handles, not for `fixed` apps); `body.wm-busy` while dragging/resizing
(`--wm-cursor`).

### 19.3 Window kinds

```ts
wm.defineKind(kind, def) → boolean     wm.hasKind(kind) → boolean     wm.kinds() → string[]
// module export only (tests): kindDef(kind) → the frozen definition | null
def = {
  mount(win, body, bar, opts),        // required: build the content (throwing → a "not available" notice)
  focus?(win),                         // after open and every show()
  relabel?(win),                       // language switch; without it the WM resets the title to the app name
  unmount?(win),                       // closing: flush, release blob URLs, remove listeners
  reopen?(win, opts),                  // open() of an already open window with new opts
  serialize?(win) → JSON,  restore?(win, state),       // state round trip (restore runs right after mount when opts.state is set)
  locationOf?(win) → href | path | null,                 // current same-origin location
  acceptUrl?(app, path) → path | null,                   // validate a stored/linked path for this app
  reload?(win),  popOut?(win),                           // title-bar / menu actions
  canPopOut?(win) → boolean,                              // per window: false hides "Open in new tab" (device files, §5);
                                                          //   wm.canPopOut(win) asks it, menus and title bars follow
  canLink?(win) → boolean,                                // per window: false hides "Copy link to this window" (device files, §5)
  menu?(win) → Item[],                                    // app menu entries (menus format, §20)
  beforeClose?(win) → boolean | Promise<boolean>         // false keeps the window open
}
```

Built-in kinds (`src/wm/wm.js`):

- **`web`** — `<iframe>` of `registry.url(app)` resolved against the root (`opts.url` when `acceptUrl` allows
  it). `allow`/`sandbox` from `config.wm.iframe`, overridable per app (`app.allow`, `app.sandbox`). Spinner
  until `load`; then `shortcuts.watch(frame)` (if a shortcuts service exists), the title follows the page
  (`"Title | Site"` → `"Title"`, the app name on the start page), `win.url` is set. Buttons Reload and
  Open in new tab. Language switch: an app with a `{ lang: url }` map moves to the new language while it
  still shows its start page. `acceptUrl`: `router.acceptPath()` — paths inside the start page's first
  folder **below the installation root** (or `app.scope`); never the root or `index.html`. A shield
  (`.has-frame::after`) lets the first click into an inactive iframe focus the window.
- **`app`** — every hook goes to the module implementation (`impl.mount/focus/relabel/unmount/reopen/menu/
  serialize/restore/locationOf/acceptUrl/reload/popOut/canPopOut/canLink/beforeClose`); `relabel` resets the title first, then
  calls `impl.relabel`; `acceptUrl(app, path)` → `registry.impl(app)?.acceptUrl?.(app, path) ?? null` (no
  window yet); `popOut` without `impl.popOut` opens `locationOf(win)` in a new tab.
- **`native`** — panels: `impl.render(win) → Node` is appended on open and rebuilt on a language switch;
  a panel with `mount()` instead behaves like `app`. All other hooks as `app` (`reopen` → e.g. the settings
  switch to `opts.section`). The "panels registry" is the app registry's impl map:
  P3 declares its panels as apps of kind `native` in its descriptor.

Registered later by their modules: `page` (Reader, P4), `image` and `viewer` (P4), `collection` (Catalog,
P4). A module that defines a kind either `requires: ['wm']` and calls `desk.wm.defineKind()` in `setup()`,
or imports `defineKind` from `src/wm/wm.js`.

### 19.4 Events

| Event | Payload | When |
|---|---|---|
| `window:open` | `{ win, restore }` | a new window is in the DOM (after its first `window:focus`) |
| `window:focus` | `{ win \| null }` | the active window changed (also to none) |
| `window:change` | `{ win, reason }` | `reason`: `'geometry'` (drag/resize end, `rect()`), `'layout'`, `'min'`, `'title'`, `'location'` (iframe loaded), `'state'` (`win.changed()`) |
| `window:minimize` | `{ win, min }` | minimised (`min: true`) or back (`false`) |
| `window:close` | `{ win }` | removed from the list (the element fades out afterwards) |
| `wm:kind` | `{ kind, removed? }` | a kind was defined, or (`removed: true`) withdrawn because the setup() that defined it threw (§8) |

The WM also sets `document.title` (`wm.docTitle`: "App — Brand", the brand name without active window).

### 19.5 Hook points for P1/P2/P3

```ts
wm.addDecorator({ wire(win), unwire?(win), relabel?(win), beforeZoom?(win) → false }) → remove()
   // joins every window (already open ones at once). Title fitting (P2 title-fit.js: "More actions" button
   // in .win-actions, --title-side on .win-bar, .is-folded) and the tile menu (P1 tilemenu.js: hover/long
   // press on win.controls's .wc-max; beforeZoom returns false to swallow the click after a long press).
wm.addDragHandler({ start?(win, ev), move?(win, ev), end?(win, ev, dragged) → 'left'|'right'|'max'|null }) → remove()
   // follows title-bar drags (pointer events in viewport coordinates). A layout returned by end() is
   // applied animated — P1 snap.js shows its preview in move() and returns the zone in end().
wm.area() → { w, h }                 // usable workspace above the dock
wm.layoutRect('max'|'left'|'right') → { x, y, w, h }      // e.g. the snap preview
wm.rectOf(win) → { x, y, w, h }      // what is shown now (compact card, layout or free rect)
wm.rect(win, r?) → { x, y, w, h }    // free rect; with r: set it (min size config.wm.minSize) — session restore
wm.setLayout(win, layout, { quiet })  // without animation (session restore); wm.animate(win, fn) wraps transitions
wm.minimize(win, { animate: false })  // minimise without the dock effect (session restore)
wm.stack() → Win[]   wm.zOf(win)      // z-order, bottom → top (session save, terminal ps, window list)
wm.topZ() → number                    // the topmost z-index (previews at the level of the dragged window)
wm.workspace, wm.layer                // #workspace and #windows (overview: pointer handling on the layer)
wm.menu.window() → Item[]             // the Window menu (layout items, tile both, close, close all, Overview if
                                      // the overview service exists, next window, window list as radios)
wm.menu.app(win) → Item[]             // the kind's menu(win) items + "Quit <app>" — P2 prepends "Copy link" etc.
wm.menu.layout(win) → Item[]          // minimise, zoom, left half, right half (title-bar context menu)
```

How P1/P2/P3 attach:

- **snap** (P1): `addDragHandler`, `layoutRect`, `topZ`, `layer`; `config.wm.snap`, `config.wm.snapEdge`.
- **tilemenu** (P1): `addDecorator` (`wire` on `win.controls.querySelector('.wc-max')`, `beforeZoom`),
  `layout()`, `toggleMax()`, `snapTo()`, `tileBoth()`; four buttons — zoom, left half, right half and
  tile-both (`wm.focus(owner)` + `tileBoth()`, disabled with fewer than two arrangeable windows); glyphs
  `tile-max/left/right/both`; `config.wm.tileMenu` (`false` switches it off); Esc closes it (focus back to
  the zoom button); closes on `'popovers:close'`.
- **overview** (P1, service `overview`): `list()`, `rectOf()`, `area()`, `animate()`, `show()`, `active()`,
  `layer`; sets `--xs` and `transform` on `win.el`; announces `wm.overviewHint` (plural); emits
  `'popovers:close'` before opening; handles window `blur` deferred (§10); `config.overview`.
- **session** (P1, service `session`): listens to `window:open/close/focus/change/minimize`, saves
  `{ id, rect, layout, min, url: locationOf, state: serialize }` **in `wm.stack()` order** (bottom → top; not
  for `app.transient`); restores bottom-up, synchronously on `'desk:ready'` (§3), with
  `open(app, { url: acceptUrl(app, url), state, restore: true })`, `rect()`, `setLayout(…, { quiet: true })`,
  `minimize(win, { animate: false })`, `relayout()`, `show()`/`focusTop()`; `config.session`.
- **dock** (P2): `tileFor(appId)` (minimise target), running indicators from `window:open/close/minimize`,
  bounce on `window:open` without `restore`, `show()`/`minimize()` on click.
- **menu bar** (P2): app menu name via `menus.update('app')` on `window:focus` and `window:change`
  (`reason: 'title'` is not the app name — the menu shows `registry.name(win.app)`), `wm.menu.*` models.
- **title-fit**, **context menu**, **deep links**, **shortcuts** (P2): decorator; `wm.menu.layout(win)`;
  `window:open` (pushState) / `window:focus` + `window:change` (replaceState) + `locationOf`; `cycle()`,
  `service('overview')?.toggle()`; `shortcuts.watch(frame)` is called by the `web` kind.
- **panels** (P3): apps of kind `native` with `render(win)` (Settings uses `mount()` to get the open
  options); the "Reopen windows" row reads `session.keeping()` and calls `session.setKeeping(on)`.

## 20. Menus API

Service `menus` (`Desk.menus`), provided by the core part `shell` (`src/shell/index.js` → `src/shell/menus.js`,
CSS `src/shell/menus.css`). The engine owns `#mb-menus` (`role=menubar`); WHICH menus exist is registered by
the parts (P2 registers brand, app, site, Window and Help menus).

```ts
menus.register({
  id,                         // [a-z][a-z0-9-]*, unique
  order?: number,             // position in the bar, low first (default 100)
  label: string | Node | () => string | Node,
  aria?: string | () => string,                 // accessible name when the label is not text (brand glyph)
  cls?: string,                                 // extra class on the bar button: 'mb-logo', 'mb-app', …
  items: () => Item[],                          // built every time the menu opens
  compact?: 'keep' | 'fold' | 'hide',           // phones: stay, fold into the host menu (default), drop
  host?: boolean,                               // receives the folded menus as submenus (+ separator) in compact mode
  when?: () => boolean                          // shown only while true
}) → unregister()
menus.registered() → defs (sorted)
menus.render()                       // rebuild the bar (automatic on register, 'lang:change', 'env:compact', 'menus:refresh', 'apps:change')
menus.update(id)                     // refresh one bar button's label/model in place (app name on window focus)
menus.dropdown(button, items, label, focusFirst = false) → menu element | null
   // a menu under a button (title-bar "More actions"); pressing the button again closes it; Esc returns
   // focus to the button; focusFirst when opened by keyboard (event.detail === 0)
menus.openAt(items, x, y, label, focusFirst = false, opener = null) → menu element
menus.openAt(items, x, y, { label, focusFirst, opener })
   // context menu at viewport coordinates; opener gets aria-expanded and the focus back
menus.close(returnFocus = false)     menus.isOpen() → boolean     menus.contains(node) → boolean
```

**Item** (labels are text, never HTML):

```ts
'-'                                                   // separator (no separators at the ends or twice in a row)
{ label, run }                                        // menuitem; the menu closes before run()
{ label, disabled: true }                             // aria-disabled, skipped by arrow keys
{ label, checkbox: true, checked, run }               // menuitemcheckbox (check glyph)
{ label, radio: true, checked, run }                  // menuitemradio
{ label, submenu: Item[] | () => Item[] }             // flies out (desktop) / unfolds inline (compact)
{ app: appId | app | { icon, tint, logo, mark } }     // leading app tile; an app id alone fills label + run (launch);
                                                      // link apps get the "(opens in new tab)" accessible name
{ glyph: SVGElement | 'icon-id' }                     // leading glyph (folded title-bar buttons)
{ url }                                               // run = router.openUrl(url)
{ shortcut: 'Mod+K' }                                 // shown at the end; aria-keyshortcuts (Mod = ⌘ / Ctrl)
{ label, lang: 'de' }                                 // the label's language (BCP 47): lang on the label, plus dir when
                                                      // it runs the other way than the page (language menu entries)
```

Behaviour (ported from the original): roving tabindex on the bar; ←/→ move between menus (mirrored for
`dir=rtl`) and reopen when one is open; ↓/Enter/Space open on the first, ↑ on the last item; Home/End;
→ on a submenu item opens it, ← closes it; Esc closes one level and returns the focus; Tab closes; hovering
the bar switches while a menu is open; submenus open after 120 ms hover; a click outside, a window `blur`
(click into an iframe) or a width change closes. Opening emits `'popovers:close'` `{ except: 'menus' }`;
the engine closes on any other `'popovers:close'`. Compact: `.menu-sheet` under the menu bar (dropdowns:
under their button), submenus as `.menu-inline`. Markup: `ul.menu[role=menu]` (`.menu-sub`, `.menu-sheet`,
`.menu-inline`) > `li[role=separator].menu-sep` | `li[role=none] > button.menu-item` (`.menu-check`,
`.tile.mini`, `.menu-glyph`, `.menu-label`, `.menu-key`, `.menu-arrow`). The bar buttons are
`button.mb-item[role=menuitem][data-menu=<id>]` — their look belongs to the menu bar CSS (P2).

**Menu bar model** (P2, `src/shell/menubar.js`; declarative, registered through `menus.register`; labels
via `L()`/`t()`; entries for apps that cannot open now are left out):

| Menu | Order, compact | Items |
|---|---|---|
| brand | 0, `keep`, `host: true` | glyph `config.brand.glyph`, aria `shell.brandMenu`: on phones the folded menus first (site menus, Window, Help — as submenus, then a separator, as in the original), then About this desktop, Settings, — Wallpaper, Backup, — `config.site.home`, `config.site.legal` (on phones without the entries a folded site menu already offers), — Restart, Shut down |
| app | 10, `keep`, `cls: 'mb-app'` | label = the active app's name (else `config.brand.menuLabel`); "Copy link" + `wm.menu.app(win)`; a kind without its own menu (only Quit) gets About this desktop and How it works before Quit; without a window: About this desktop, How it works |
| `site-<id>` | 20+, `fold` | one per `site/apps.js` `menus[]` entry: `items: appId \| '-' \| { collection: id } \| { label, url } \| { label, items }` |
| window | 80, `fold` | `wm.menu.window()` |
| help | 90, `fold` | How it works, — the author's profiles (`config.author.links` → `author-<id>` apps) |

`{ collection: id }` expands to "Open <collection>" plus its groups as submenus (the items directly when
it has no groups); **inside a submenu** (`{ label, items }`) a grouped collection is listed flat (its
groups' items separated by `-`), so a menu never nests deeper than one submenu. Details: `docs/packages/p02-shell.md`.

**Context menus** (service `contextmenu`, P2): resolution order — `data-contextmenu` on an ancestor
(`"none"`: no menu, `"native"`: the browser's, `"click"`: a right-click clicks that element) → menus and
popovers (none) → **registered menus** (`contextMenu` contributions and `contextmenu.add()`; they resolve
before the built-in dock branch — the trash tile's menu relies on it) → the menu bar (only menu titles,
`#mb-clock` and `#mb-weather` react to a right-click; the other status buttons do nothing) → dock item /
bare dock → All apps item → zoom button (none: the tile menu's long press) → title bar or the focused
window (the window menu: `wm.menu.layout(win)`, its page, the dock, the other windows) → window content
(the browser's menu) → desktop icon → desktop. Long press (550 ms) for touch and pen; the ContextMenu key and Shift+F10 open at the element.

## 21. How to add …

**An app** — `src/apps/<id>/index.js` with a descriptor (`kind: 'app'`, `app: {…}`, hooks,
`i18n: ['<id>']`, `styles: ['<id>.css']`), strings in `locales/<lang>/<id>.js` for every language,
CSS in `@layer apps` (+ `@layer compact`), add `'<id>'` to `apps` in `site/config.js`, run
`npm run icons`. Stored data: declare `storage` (validate!) and a `resetGroups` entry; deletions:
`Desk.toTrash(type, …)` + `trash: { type: { restore } }`.

**A module** — same under `src/modules/<id>/`, `kind: 'module'`, CSS in `@layer modules`, listed in
`modules`. Provide a service if others use it; contribute through extension points. A site-only
module lives in `site/modules/<id>/index.js` and is listed as `{ id, src }`.

**A language** — see `locales/README.md` (copy `locales/en`, edit `_meta.js`, translate, add the code
to `languages`, `npm run i18n:check -- <code>`).

**A wallpaper** — colour/gradient/image: entries in `config.wallpaper.colors|gradients|images`
(images in `site/wallpapers/`). Generated motif: `Desk.wallpaper?.register({ id, name, bg, heavy?,
build(uid, { reduced }) → SVGElement }, { module: '<module id>' })` from a module's `setup()` (P3 defines the
motif contract in `src/wallpapers/kit.js`), and its id in `wallpaper.motifs`. With the module id the motif
is withdrawn again on that module's `'module:failed'` (an active one falls back to the default while the
stored choice is kept).

**A collection** — an entry in `collections` of `site/apps.js` (§7); it gets a Catalog window, search
group, menu entry (`{ collection: id }` in a menu) and routes from `basePath` without code.

**An accent or tint** — `theme.accents.<id>: '#rrggbb'` / `theme.tints.<id>: ['#top', '#bottom']` in
`site/config.js`; label `settings` locale key `accent.<id>` (falls back to the id).

**An online service** — declare `consent: [{ id, hosts, label, hint }]`, fetch with
`Desk.net.getJson(url, { service: id })`, add `services.<id>: false` to the config docs, list the host
for the CSP in §16, the README, `docs/deploy.md` and the server snippets (`docs/server/*`, commented out).

## 22. Tools and tests

| Command | Does |
|---|---|
| `npm run serve` (`node tools/serve.mjs --port 8080 --base / --connect https://… --frame https://… --wasm`) | static server with the production headers; directory → `index.html`; dotfiles, `node_modules`, `tools`, `tests` are 404; `--connect`/`--frame` add https origins to `connect-src`/`frame-src`, `--wasm` adds `'wasm-unsafe-eval'` (Pagefind) — §5 |
| `npm run icons` / `npm run icons:check` | build / verify `src/icons/tabler.js` (sources + `site/icons.json`) |
| `npm run icons:pwa` (`node tools/build-pwa-icons.mjs`) | renders the PNG app icons (`assets/icons/icon-*.png`, `maskable-*.png`, `apple-touch-icon.png`) from `favicon.svg` / `maskable.svg` in headless Chromium; run after changing either SVG and commit the PNGs |
| `npm run i18n:check [-- <lang>…]` | compare locales with `en`; warns about plural categories a language lacks |
| `npm run validate` / `npm run validate:strict` (`node tools/validate-manifest.mjs [--manifest …] [--config …] [--strict] [--quiet] [--json]`) | checks `site/apps.js` against the config before it goes online: ids, kinds and the modules they need, references (aliases, overrides, menus, `site.legal`, `notify.app`, `vault.collection`, …), collections, urls (local files exist), icons, tints, language maps for every configured language, the fortunes and feeds; exit 0 / 1 (errors, or warnings with `--strict`) / 2 (not loadable) |
| `npm run seal` (`node tools/seal-vault.mjs --in <json> [--out <dir>] [--keep \| --prune]`, `--list`, `--new-salt`) | seals private bookmarks for the vault (P7). **The plain-text JSON must lie outside the project and the web root** (the tool refuses it below `site/`, in the output folder and below the web root that folder belongs to); see `site/vault/README.md` |
| `npm run check:browser` (`node tools/browser-check.mjs [--path p] [--lang de-DE] [--base /desk/] [--mobile] [--scenario f.mjs] [--site-config c.js [--keep-sw]] [--no-sw] [--screenshot s.png] [--size WxH] [--wait ms] [--serve-args=value]`) | headless Chromium (playwright-core, devDependency) against `tools/serve.mjs` with the production headers: fails on console errors, page errors, CSP violations and failed requests; a scenario module (`export default async ({ page, desk, log, assert }) => …`; `desk(fn, …args)` runs `fn(window.JPKDesk, …args)` in the page) drives the desktop and declares the failures it provokes on purpose with **`export const expect = { http: [RegExp \| { status, url: RegExp }], console: [RegExp] }`** — matching events are listed as expected instead of failing the run. `--site-config` swaps `site/config.js` through `page.route()`, which a service worker bypasses, so it blocks service workers (`--keep-sw` keeps them and warns when one controls the page; `--no-sw` blocks them without a config). Every option also takes `--name=value`; `--serve-args` passes options to `serve.mjs` even when they start with `--` (`--serve-args="--connect https://… --wasm"`). Run checks one at a time on small machines (`flock <lock> node tools/browser-check.mjs …`) |
| `npm test` | `node --test "tests/*.test.mjs"` (Node ≥ 22, `engines`): i18n (chain, plurals, placeholders, number grouping, keys, L, detection, formatters), store (prefix, failure modes, validators), registry + router (overrides, kind check, tab fallback, acceptPath in a sub-folder), config merge/validation, module loader (hooks, withdrawal after a failed setup), dom guards, version sync (package.json = `VERSION`), token sync, the source hygiene test (`tests/hygiene.test.mjs`: no bidirectional-control or zero-width characters in `src/`, `locales/`, `tests/`, `site/`, `tools/`, `index.html`, `sw.js` — write them as `\u` escapes), and one test file per package (`tests/p<NN>-*.test.mjs`: pure functions, the service worker in `node:vm`, the server snippets against §5) |

Tests import the pure factories (`createI18n`, `createStore`, `createRegistry`, `createRouter`,
`buildConfig`, `orderByRequires`); every core module is importable in Node (browser access guarded).
Module loader tests load descriptors from `data:` URLs (`{ id, src: 'data:text/javascript,…' }`).
The version lives in `package.json` and `src/core/env.js` (`VERSION`); `tests/version.test.mjs` keeps them equal.

## 23. Deviations and decisions

- **`src/wm/index.js`, `src/shell/index.js`, `src/panels/index.js`**: core parts load through the same
  descriptor mechanism as modules (not static imports), so they can be built package by package and
  the desktop always boots. Their other files (`wm.js`, `snap.js`, …) are imported by these index files.
- **`src/core/services.js`** (not in the original layout): the service registry; keeps router/api free
  of import cycles.
- **Window control glyphs are `wc-*`** (renamed from the source's `tl-*` ids).
- **Stub descriptors** (`stub: true`) stood in for every planned module/app during the port and were
  replaced by their packages; none are left, the loader still honours the flag (§8).
- **Tints** are applied as `--tint` custom property, not `.tint-<name>` classes, so config tints need no CSS.
- **Accent/tint values live in two places by necessity** (`tokens.css` for the first paint without JS
  config, `config.js` DEFAULTS for the settings UI); `tests/config.test.mjs` keeps them in sync with
  each other and with the id list in `theme.js`.
- **`--mb-total` is re-declared in compact mode** (the original computed it from the desktop
  `--mb-h` only).
- **`site/apps.js` holds the example site** (P11): pages, bookmarks, a showcase of every app kind, menus,
  fortunes and feeds — neutral content a site owner replaces.
- **Window kinds instead of a kind switch**: `wm.defineKind()`; `web`, `app`, `native` are built in, the
  rest comes from modules. App hooks are the descriptor hooks (§8), reached through `win.impl` (was `win.ext`).
- **`.workspace` and `.windows` are styled in `src/wm/wm.css`** (the window manager cannot work without
  them); the menu bar, dock and desktop icons keep their CSS in the shell (P2).
- **The dock is optional for the WM**: the usable area subtracts the dock only when `#dock` has a size; the
  minimise animation targets `service('dock')?.tileFor(appId)`; the bounce on open is the dock's own
  reaction to `window:open` — the WM never calls the dock.
- **Window menu, app menu and layout items are models of the WM** (`wm.menu.*`), so the menu bar, context
  menus and the title fitting share them.
- **Menu item classes are prefixed** (`.menu-check`, `.menu-label`, `.menu-arrow`, `.menu-glyph`, `.menu-key`)
  — the original's `.check`/`.label` collided with the shared components; check mark and submenu arrow are
  Tabler glyphs (`ti-check`, `ti-chevron-right`, mirrored for RTL) instead of text characters.
- **Menu bar folding on phones is declarative** (`compact: 'keep' | 'fold' | 'hide'`, `host: true`) instead
  of a hard-coded list inside the brand menu.
- **`window:open` follows the first `window:focus`** of a new window, as `'change'` preceded `'open'` in the
  original.
- **No `file://` notice in web windows** — a server is required (§1).
- **Question sheets live in core** (`src/core/dialog.js`, `Desk.dialog`, `consent.ask`) instead of only in
  the apps' kit, so panels and modules (trash, backup, reset, weather, vault, fortune) share one
  accessible implementation without importing app code.
- **Site override records** (`{ id, dock: true }` without kind) replace the original's habit of editing a
  module's app entry; they survive the app going and coming back.
- **Boot cover before the first paint** (`html[data-boot=pending]`): the original showed the boot screen at the
  end of its synchronous script; with ES modules the shell runs later, so a plain cover bridges the gap.
- **Placeholder numbers group from 10 000 up** (min2), so years in sentences never read "2.026".
- **New window features**: `html[data-wc=right]` (controls at the end) and `html[data-wc-style=minimal]`
  (plain glyph buttons) from `config.theme.windowControls`; per-app `allow`/`sandbox` for iframes;
  `beforeClose` may veto; focus moves to the next window when the focused one closes.
- **Weather sits at status order 85**, between the language (80) and the clock (90), as in the original:
  both calendar openers side by side.
- **The overview handles window `blur` deferred** (kept after review): `wm.show()` moving the focus into an
  iframe also blurs the page, and must not close the overview in the middle of its own pick; a real tab
  switch still closes it (§10).
- **Files from the device never open as documents** (§5): no popOut, no browser menu, no dragging for
  `blob:` content; the kind hook `canPopOut(win)` and `wm.canPopOut(win)` were added for it, later
  `canLink(win)` / `wm.canLink(win)` (no "Copy link" that would only reopen an empty viewer or player).
- **`DEFAULTS` holds every key a shipped part reads** (§6) — the planned "modules add nothing to
  `DEFAULTS`" rule gave way to one complete shape; modules still clean their own section.
