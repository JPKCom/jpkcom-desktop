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
  content/<lang>/*.html     Reader pages            (P11; pages cache, §14)
  content/…                 images, Markdown, demos (data files, network first, §14)
  data/fortunes/<lang>.json, data/feed.<lang>.json  (P11; data files, network first, §14)
  vault/                    sealed .bin files (none shipped, .gitignored)
  wallpapers/               image wallpapers
  icon-sets/<name>.json     site icon sets (optional, config.iconSets; §13) — none shipped, git-ignored
locales/<lang>/_meta.js     { name, intl, dir, yes }
locales/<lang>/<ns>.js      export default { key: 'text' | { one, other, … } }
src/boot/theme.js           classic pre-paint script
src/boot/main.js            ES module entry
src/core/                   config env store bus i18n dom icons icon-sets a11y registry router net consent
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
                            icon-set-files.mjs (reads config.iconSets for validate and seal; not a CLI)
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
  <script src="src/boot/preload.js">   GENERATED (tools/build-preload.mjs): <link rel=modulepreload> for the static
                                        import graph of main.js, the core parts and the configured modules/apps,
                                        <link rel=preload as=style> for their styles, the locale files of the likely
                                        start language, <link rel=preload as=fetch crossorigin> for config.iconSets
                                        — all requested at once instead of one import level at a time
  <script src="src/boot/theme.js">     data-theme, data-wc, --accent/--on-accent, config accents/tints,
                                        --wallpaper-from/to + data-wp-dir (glow|down|diag|radial), --anim,
                                        data-boot="pending" (boot cover), meta theme-color — before the first paint
  <script type="module" src="src/boot/main.js">
main.js
  1. initEnv()           body.compact (config.ui.compactQuery), body.standalone; scroll lock
                         (main.js then re-sets --anim from the validated config.ui.animMs)
  2. initI18n()          start language (?lang → stored → navigator → default); _meta of all languages and
                         the 'core' namespace for the whole fallback chain side by side → <html lang dir>
  3. site data           import(config.site.data) → registry.load(); registry.authorLinks(config.author.links)
     icon sets           fetch every config.iconSets file (JSON) → cleanIconSet() → icons.addIconSet();
                         a set that fails in any way is warned about and left out — never fails the boot
                         (2 and 3 run at the same time; nothing of 5 is imported before they are done)
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

- **Icon sets are complete before the first module is imported**: a module may call `hasIcon()` /
  `icon()` at import time or in `setup()` and sees every set icon. Icons added later with
  `Desk.icons.add()` are not (§13).
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
- **Icon data is data.** Site icon sets are JSON (no code runs from them). Every icon definition — of a set,
  of the shipped subsets or added with `Desk.icons.add()` — is built into its `<symbol>` through one
  allowlist (§13): element tags, element attributes, the symbol's own attributes (`a`) and the viewBox.
  Anything else is dropped with a warning. No `url()`, `var()`, CSS escape, `href`, `style`, `id` or `on*`
  reaches the sprite.
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
- **Framed pages of this origin** (`web` apps without `sandbox`, or with `allow-same-origin`) run with the
  desktop's origin *and* inside its window: they can reach `parent.JPKDesk` and in-memory state (e.g. the
  apps of an unlocked vault), more than the same page opened in a tab. Give web apps that show content you do
  not control a `sandbox` without `allow-same-origin` (`app.sandbox`, `config.wm.iframe.sandbox`; their
  location is then not restored), and keep `linkPaths` off for them: a deep link must not choose which page
  of such a folder loads in the frame.
- **Stored values are untrusted.** Read with `store.getJson(name, validate, fallback)` and the `V`
  validators. Ids from storage are re-validated (`V.id`) before they reach selectors.
- **URLs from data**: only relative paths or absolute `http(s)`; `link` apps only `https`
  (`allowHttp` per collection or per item is opt-in). The registry rejects `javascript:`, `data:`, `//host`.
  A `web` app's `scope` is a folder path, never the installation root or a parent of it; the folder rule
  (`router.acceptPath`, §15) is the boundary for locations of web windows — its filter for dot segments and
  encoded slashes is best effort (servers differ: double encoding, path parameters, PATH_INFO).
- **External requests** only through `net.getJson/getText` with a `service` id when they go to a
  third party: no cookies, no referrer, timeout, consent checked (§16).
- **Links to other origins** open with `noopener`.

## 6. Configuration

`site/config.js` documents every key inline; `src/core/config.js` (`DEFAULTS`) holds the defaults
and validates. `Desk.config` is the merged, deep-frozen result.

Merge: plain objects merge recursively; arrays and scalars replace; language maps at
`site.description`, `site.home`, `notify.feeds`, `about.moreInfo`, `about.rows`, `terminal.manUrl`
replace as a whole;
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
| `iconSets` | `[]` | site icon sets (§13): paths of JSON files relative to the installation root (`'site/icon-sets/duotone.json'`; letters, digits, `. _ - /` only, no segment starting with `.`), at most 8, loaded before the modules; entries that are not such a path, duplicates and a set below `vault.dir` are warned about and dropped |
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
| `fortune` | `{ remote: null, local: true, dir: 'site/data/fortunes/', langs: ['de', 'en'], block: [], texts: {} }` | `remote`: an online source — `'jokeapi'`, `'uselessfacts'` or one a module adds (contribution `fortuneProviders`, §8, or `Desk.fortune.addProvider()` in its `setup()`); it needs `services.fortune` and its hosts in `connect-src`; an id no module provides is reported once at `'modules:ready'`; `local`: `false` = no built-in sayings (online only: nothing is fetched from `dir`, the service worker precaches nothing for it, the terminal command `fortune` is hidden; needs `remote`, else a warning and `true`); `dir`: folder of the local `<lang>.json` files (relative to the root); `langs`: the languages that have such a file — only these are fetched (`null`: try every language of the chain); `block`: category ids never shown (local and remote); `texts`: `{ <key>: text }` replaces texts of the app that name it (keys in P11 "App texts"), e.g. after renaming it with an override record |
| `media` | `{ maxItems: 200, seekStep: 5 }` | audio/video players: longest playlist (1–1000), seconds for ←/→ (1–60) |
| `editor` | `{ maxTabs: 20, maxFileBytes: 5242880, wrap: false, invisibles: true }` | tabs at most (1–100), largest file that opens, word wrap / invisible characters before the user chose |
| `calc` | `{ historySize: 50 }` | calculations kept (0–500) |
| `terminal` | `{ user: 'guest', doh: null, eggs: true, historySize: 100, manUrl: null }` | `doh`: `null` or `{ url: 'https://…/resolve', name: 'dns.google' }` — a DNS-over-HTTPS JSON resolver (`Accept: application/dns-json`, https only, needs `services.dns`; its host must be in `connect-src`); `manUrl`: the site-wide fallback of `man` for items of the site's own collections without a `man` of their own or of their collection (§7 "Manual pages") — `null`, a path template or a `{ lang: template }` map, every value with `{slug}` or `{id}` |
| `trash` | `{ days: 30, max: 200 }` | |
| `backup` | `{ format: 'jpkcom-desktop-backup', filePrefix: 'jpkcom-desktop', maxBytes: 5242880 }` | |
| `vault` | `{ salt: '', iterations: 600000, dir: 'site/vault/', collection: 'bookmarks', maxBytes: 1048576 }` | `collection`: the collection (`site/apps.js`) unlocked bookmarks join; `maxBytes`: largest sealed file accepted |
| `pwa`, `offline` | `{ enabled: true }`, `{ maxPages: 80, timeoutMs: 4000, fastStart: true, legacyCaches: [] }` — `fastStart`: the service worker answers the desktop's code (§14) from the offline copy and looks for a new version in the background (the open pages get `{ type: 'desk:update' }`, the `install` service offers a reload); data files (feeds, fortunes, `site/data/`, `site/content/`, §14) are always network first and never count as a new version; `false` = network first for everything. `legacyCaches`: cache names of a service worker the site used **before** this desktop — exact names, or a prefix ending in `*` (at least 4 characters before it), at most 32; deleted on activation, again shortly after the hand-over, at every start and by the `offline` reset group (§14). A name of this project's cache scheme (any folder, any namespace) is never deleted this way | P12 |

The Fortune descriptor's `validateConfig()` cleans `fortune.local` and `fortune.texts` like its other keys
(except `dir`); warnings are prefixed by the loader with `[desktop] config.fortune: `:

| Input | Result | Warning |
|---|---|---|
| `local` missing | `true` | — |
| `local` `true` / `false` | as given | — |
| `local` anything else | `true` | `local must be true or false — built-in sayings used` |
| `local: false` while `remote` is `null` after cleaning (missing, `null`, or not a valid id) | `true` | `local: false needs an online source (remote) — built-in sayings used` |
| `texts` missing / `null` | `{}` | — |
| `texts` not a plain object | `{}` | `texts must be an object { key: text } — ignored` |
| `texts.<key>` with a key not in `TEXT_KEYS` | skipped | `texts.<key> cannot be replaced (keys: <list>) — skipped` |
| `texts.<key>` not a text (non-empty string, `'@ns.key'` or a non-empty `{ lang: text }` map of non-empty strings) | skipped | `texts.<key> must be a text, '@ns.key' or { lang: text } — skipped` |

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
| `icon` | icon id | `'ti-…'`, `'tif-…'`, a custom glyph or an icon of a site icon set (`'<prefix>-<name>'`, §13) |
| `iconFull` | icon id | optional: the icon while the app holds something (the trash; the dock reads it) |
| `tint` | `'name'` or `['#top', '#bottom']` | tile gradient |
| `logo` | `true` or logo id | tile shows the logo instead of the icon |
| `mark` | ≤ 4 chars | text tile instead of the icon |
| `url` | path/URL or `{ lang: url }` | for `page`, `web`, `link`, `image` |
| `scope` | folder path | `web`: where a stored or linked location of the window may lie (session restore, deep links, `launch(id, { url })`) — root-relative (`'demos/clock/'`) or, for a folder **outside** the installation root, root-absolute (`'/wiki/'`). Default: inside the root the start page's first folder below it, outside the root the start page's own folder (§15 `acceptPath`). Never the root or a parent of it, never root-absolute inside the root; no `..`, `?`, `#`, `;`, `%2f`/`%5c`/`%2e`, scheme or `//host` — an invalid value is warned about and ignored |
| `linkPaths` | boolean | `web`: a deep link may open the window at a location of its own (`#app=<id>&path=/…`, §15). Default `false`: such a link opens the start page. Leave it off for apps that show content you do not control (uploads, user pages) and sandbox those (§5) |
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
  webApp: 'tools-web',                                          // the app the Catalog's web button launches (wins over webUrl)
  webUrl: 'tools/' | { en: 'en/tools/', de: 'tools/' },       // the collection on the classic website (Catalog button)
  allLabel: { en: 'All tools', de: 'Alle Werkzeuge' },        // Catalog wording for "All" …
  webLabel: { en: 'Tools on the website', de: 'Werkzeuge auf der Website' },   // … and "Overview on the web"
  man: 'manuals/{lang}/{slug}.md' | { en: 'help/en/tools/{slug}.md', de: 'help/tools/{slug}.md' } | false,
                                                              // terminal `man` for every item (template, see below)
  groups: [{ id, name, desc, icon, tint }],
  items: [{ slug, group, name, desc, url | app, icon, tint, mark, kind, size,
            docs, guide,            // URL or { lang: url }: Catalog status-bar actions ("Documentation" should be a page)
            man,                    // path or { lang: path } or false: terminal `man` (text manual; wins over docs)
            fileName, download,     // download name / offer a download (image items always do)
            nodock, hidden,         // never pinnable / not in lists (as on an AppEntry)
            allowHttp,              // this item may be an http:// link (an intranet bookmark)
            scope, linkPaths }] }   // web items: as on an AppEntry
```

**The web button** ("Overview on the web", `webLabel`) appears when the collection or its Catalog app
has a `webApp` that is registered and openable (`Desk.apps.available`) or a `webUrl`.

`webApp` is an app id; the button launches that app (`Desk.launch`). Use it for an overview page that
lives at the collection's `basePath` and should open in a window: a hidden **`web`** app
(`{ id: 'tools-web', kind: 'web', hidden: true, url: 'tools/' }`). A `page` app is not suited for a
page at `basePath`: its deep link would be that path, which opens the Catalog. For a Reader overview
no `webApp` is needed — set `webUrl: 'tools/index.html'` and, unless the site's `defaultPageApp`
shows it, a hidden page app with that URL (`<basePath>index.html` is not routed to the Catalog).
A `webApp` that is a Catalog of the same collection (directly or through an alias) is ignored. When
the app is missing or not openable (its module is not loaded), `webUrl` is used instead.

`webUrl` is a path/URL or a `{ lang: url }` map opened through `Desk.openUrl`; a `webUrl` that routes
back to a Catalog of this collection (it equals `basePath`, and no `config.site.routes` rule sends it
elsewhere) opens in a new tab. `webApp`, `webUrl`, `allLabel` and `webLabel` may also sit on the
collection's Catalog app (an override record `{ id: 'tools', webApp: 'tools-web' }`); the
collection's value is tried first. `allLabel`/`webLabel` are text, `'@ns.key'` or `{ lang: text }`.

Items: unknown group, missing slug/name/url, bad protocol → warned and skipped; icon/tint fall back
item → group → collection (`defaultIcon` → `icon`).

No AppEntry row: `man` is a field of collection items and collections only. (Do not confuse it with the
`man` text of a terminal **command** definition, p09 "Command registry" — a different object.)

**Manual pages (`man`)** — the terminal's `man <entry>` prints a text manual: a `.md`, `.markdown` or
`.txt` file **on this site** (relative to the root or `/…`, no whitespace, ≤ 500 characters; no other
origin). Sources for a collection item, most specific first: the item's own `man`, else the collection's
`man`, else `config.terminal.manUrl` (§6). The first level that is set decides; `false` there means "no
manual page" and stops the search. The collection's `man` applies only to items of the collection's own
source, `manUrl` only to items of the site's own collections (source `'site'`) — the vault's bookmarks
(in a site collection or in the collection the vault creates) never use a template and carry no `man`,
so they have no manual page and their slugs never reach the server. An alias item uses
its own `man`, never its target's. An item's `docs` that is a text file is still printed when the item
has no `man` of its own (as before); otherwise `docs` is the "Full documentation" link after the
manual. Each value is a path or a `{ lang: path }` map. Placeholders: `{slug}` `{id}` `{collection}`
`{lang}` (URL-encoded); a collection's `man` and `manUrl` must contain `{slug}` or `{id}`; any other
`{name}` makes the value invalid. Languages: a plain string with `{lang}` is tried for each language of
the fallback chain (§12); a map in the order of the chain (exact tag, then the same base language), then
its first value — so `{ de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' }` expresses layouts
`{lang}` cannot. At most six files are tried per entry; a missing file (404/410, or an HTML answer) is
no error: the terminal says the entry has no manual page and offers its documentation or the entry
itself. Invalid values → `console.warn`, the value is ignored (the item stays). `~/apps` entries have
no `man` field; their `docs` works as before. The rules live in one pure file, `src/core/man.js`
(`cleanMan`, `MAN_VARS`, `isTextPath`), used by the registry, the terminal and
`tools/validate-manifest.mjs`; the path predicate is `isSitePath` in `src/core/url.js`.

Registry API for collections: `addCollection(def, { source })`, `extendCollection(id, { groups, items,
prepend }, { source })`, `removeSource(source)`, **`removeCollection(id)`** (a collection another source
added — the vault's own one after a lock — with its items and its registry-made Catalog app; the site's
collections cannot be removed → `false`), `collection(id)`, `collections()`, `items(id)`.
Item records carry `man` (`false`, a path or a map, as given; absent when not set or invalid — an alias
view carries only the alias's own `man`, never its target's); `collection(id).man` is `null` (not set or
invalid), `false`, a template or a `{ lang: template }` map.

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
	locales: 'locales/',               // optional: the i18n namespaces come from <this folder>/<locales>/<lang>/<ns>.js
	                                   //   (a relative folder inside the module's folder, ending in '/'; §12) —
	                                   //   for site modules ({ id, src }) that keep their texts next to their code
	styles: ['notes.css'],             // relative to this file; injected as <link>, awaited before setup()
	windowStyles: ['window.css'],      // relative to this file; loaded with the first window of one of its apps or of a
	                                   //   window kind it defined with load() (awaited before mount) — CSS only windows use

	/* Apps: one (app + top-level hooks) or several (apps: [...], hooks inside each) */
	app: { icon: 'ti-notes', tint: 'orange', size: [780, 520], fixed: false, name: '@notes.appName',
	       load: () => import('./window.js') },   // optional: the window hooks, loaded when the first window opens
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
	fortuneProviders: [{ id: 'example', name: 'Example', hosts: ['api.example.org'], url(q) {}, parse(json, ctx) {} }], // P11

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
	acceptUrl(app, path, from) { return path | null },   // the ONLY hook that gets the app, not a window: may a
	                                   //   stored/linked path open this app? from: 'session' (restore: written by
	                                   //   the visitor's own navigation), 'launch' (code: launch(id, { url })),
	                                   //   'link' (a deep link: anyone can write it — be strict)
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

**Window code on demand** (`load`). The boot imports every configured module; what only a window needs
(its DOM, its CSS, the libraries behind it) does not have to come along. An app definition with
`load: () => import('./window.js')` keeps it in a file of its own:

- `load()` resolves to the window hooks — a module whose **default export** is the hooks object, or the
  object itself (`() => import('./player.js').then(m => m.player('audio'))`). Only `HOOKS` functions are
  taken; without `mount()` or `render()` the window shows "not available". The import must be a literal
  `import('./…')` (the service worker and `tools/build-preload.mjs` read the source).
- **Hooks given directly in the definition are there from the start** and win over a loaded hook of the
  same name. `acceptUrl(app, path, from)` belongs here when the app has one: the WM asks it before any window
  exists (session restore, deep links).
- The first `wm.open()` of the app loads it (`registry.loadImpl(app)`, once; a failed load is tried again on
  the next open) together with the descriptor's `windowStyles`. `wm.open()` still returns the window at
  once — with a spinner (`.win-loading`, `aria-busy`) until the code is there; `win.ready` → `Promise<boolean>`
  resolves after `mount()` (and `restore(opts.state)`), `'window:ready'` follows (§19). A window closed
  before its code arrived is never mounted — and gets no `unmount()` either: whatever a module registers
  for a window before it is mounted, it drops on `'window:close'`.
- Everything outside the window — storage, trash, settings rows, search, terminal commands, drop handlers,
  services, `setup()` — stays in the descriptor file and **must not import the window file statically**
  (that would put it back into the boot). It reaches an open window through `wm.get(id)?.state.<x>`
  (set by `mount()`), hands data over through `wm.open(id, opts)` (`mount`/`reopen` read `opts`), or waits
  for `await win.ready`. The window file may import the descriptor file (it is loaded already).

`locales` is checked when the module is imported: only a relative path that ends in `/` and stays inside
the module's own folder (no scheme, no leading `/`, no `\` or control character, no `..` out of the
folder). Anything else is reported with `console.warn` and ignored; the module still loads and its
namespaces are then read from `locales/` as usual.

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
- **`fortuneProviders`** (P11) — `[def]` or `{ <id>: def }`: online sources for the Fortune app. `def` is
  the provider definition of `src/apps/fortune/providers.js` (`id`, `name`, `hosts` — 1 to 8 host names,
  `home`, `langs`, `categories`, `emptyStatus`, `url()`, `parse()`; reference in
  `docs/packages/p11-fortune-site.md`). Write
  it as a plain object literal: the loader copies own properties only, so `url`/`parse` on a class
  prototype are lost and the provider is rejected. The app adopts the contributions of every module set
  up before it and listens to `'module:loaded'` for later ones, so the contributing module needs no
  `requires: ['fortune']` and loads fine without the app. A provider is used only when
  `config.fortune.remote` names its id; an id that exists already (built in or adopted first) is reported
  and skipped. The check for an unknown `remote` runs at `'modules:ready'`.

Loader behaviour:

- Field keys not in the reserved list that hold an array or object are **contributions**:
  `Desk.modules.contributions(point)` → `[{ module, ...item }]` — a frozen shallow copy of each item's own
  enumerable properties (keyed objects get `id` = key unless the item has its own `id`, which wins).
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
Desk.version: string                          // '1.2.0'
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
Desk.icons: { icon, has(id), add(pack, { override }), symbolHref(id) → '#i-<id>'|null, logo(id?) → SVG|null, addLogo(id, build),
              brandGlyph(cls?), tile, appGlyph(app, { cls = 'i', fallback = 'ti-app-window' }?) → SVGElement | HTMLSpanElement,
              tintValue(tint) }
            // has()/icon() include the site icon sets (§13) from the start
            // appGlyph: an app's glyph without the tile, same precedence as tile(): app.logo (true → brand logo)
            // → app.mark (text, <span aria-hidden>) → app.icon (when known) → fallback; cls goes on the element
Desk.announce(text, { assertive = false })

// Storage (§14)
Desk.store     Desk.V     Desk.storage

// Apps, collections, URLs (§15)
Desk.apps                                      // registry: get has list available impl implReady loadImpl register … items collection data
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
| `deeplinks` | P2 | `linkFor(win)`, `hashFor(win)`, `hashOf(info)`, `open(hash)`, `parse(hash)`, `start()` |
| `drop` | P2 | `handlers() → [{ id, module, label }]`, `handle(id, def) → remove()`, `open(files, target?)`, `kindOf(file)` |
| `power` | P2 | `boot()`, `restart()`, `shutdown()`, `isOff()` (true from the moment restart/shut down darkens the screen: no shortcut and no other keydown/keyup listener reaches the desktop any more) |
| `clock` | P2 | `tick()`, `seconds()`, `setSeconds(on)`, `button` |
| `langmenu` | P2 | `render()`, `set(code)`, `items()`, `button` |
| `settings` | P3 | `show(section?)`, `sections()`, `redraw()`; row helpers `row()`, `toggle()`, `segments()`, `select()`, `button()` (positional arguments or one options object); `addSection(def) → remove()`, `addRow(def) → remove()`; `get() → { theme, accent, resolved }`, `set('theme' \| 'accent', value) → boolean` |
| `wallpaper` | P3 | `register(motif, { module }?) → boolean` (withdrawn on that module's `'module:failed'`), `unregister(id)`, `set(value)`, `get()`, `menuItems()`, `motifs() → [{ id, name }]`, `keyOf(value)`, `open()` |
| `trash` | P3 | `add(type, title, data) → boolean`, `count()`, `list()`, `putBack(id) → Promise<boolean>`, `purge(id)`, `empty()`, `askEmpty() → Promise` (waits for the trash window's code), `open()` |
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
| `terminal` | P9 | `register(name, def) → remove() \| null`, `list() → [{ name, hidden, source }]`, `has(name)` — the built-in commands (and eggs) join `list()`/`has()` with the terminal's window code, i.e. once the first terminal window opened (their names are reserved from the start) |
| `media` | P10 | `open(files) → Promise<number>`, `add('audio' \| 'video', files) → Promise<number>` (the players' window code loads on demand; 0 when nothing was added), `kindOf(file)`, `types()` |
| `fortune` | P11 | `random({ cat }?) → Promise<{ text, lang, cat, by, url } \| null>` (a built-in saying; `null` with `fortune.local: false`), `addProvider(def, { module }?) → boolean` (the provider definition as in §8 `fortuneProviders`; `module`: the adding module's own id — the provider is dropped on its `'module:failed'`; add during `setup()`), `providers() → ids`, `source() → 'local' \| 'remote' \| null` (`null`: online only and no usable online source) |

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
| `install:update` | `{}` | install (P3): the service worker has a new version ready (`{ type: 'desk:update' }`, P12) — one reload away; the install service also shows a banner offering the reload |
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
  `wc-min`, `wc-max`, `tile-left`, `tile-right`, `tile-max`, `tile-both`, and the icons of the **site icon
  sets** (`'<prefix>-<name>'`, below). **Verify a Tabler name exists**
  (`node_modules/@tabler/icons/icons/{outline,filled}/<name>.svg`) and always write ids out in full
  (the scanner only sees quoted literals). The project's own icon ids use only the namespaces `ti-`, `tif-`,
  `wc-`, `tile-`, `jpk` and `jpk-` — now and in later releases; every other prefix belongs to sites.
- `npm run icons` (`tools/build-icons.mjs`) scans `src/`, `site/`, `index.html` and writes
  `src/icons/tabler.js` with only the used Tabler icons; unknown names fail. `npm run icons:check` for CI.
  **`site/icons.json`** (optional, committed): a JSON array of extra Tabler ids (`["ti-brand-github", "tif-star"]`)
  for icons no source names — above all those used only inside sealed vault data; `tools/seal-vault.mjs`
  (P7) warns about vault icon ids missing from `src/icons/tabler.js` and suggests adding them there.
  The tool builds Tabler only; it never reads or writes a site icon set and skips `site/icon-sets/`.
- **Definition format** (one per id — the same in `tabler.js`, `custom.js`, site icon sets and
  `icons.add()`):

  ```
  { k?: 'o' | 'f' | 'd', vb?: '0 0 24 24', a?: { attr: value }, e: [element], e2?: [element] }
  ```

  `k`: `'o'` outline (default; `fill="none" stroke="currentColor"`, round caps/joins; the stroke width is
  `--icon-stroke` **in viewBox units** — right for the 24-unit grid of Tabler, a hairline on a 512-unit
  grid), `'f'` filled (`fill="currentColor"`), `'d'` two-tone: filled, and `e2` is the **secondary layer** —
  drawn first, below `e`, every element with the class `i-duo` (one of `e`/`e2` may be empty, not both).
  `vb`: the viewBox, default `0 0 24 24`; four numbers, width and height > 0 — a glyph that is not square is
  centred in the 1em box. `a`: the `<symbol>` attributes **instead of** the ones `k` implies (custom
  glyphs; an outline icon on another grid gives its own `stroke-width` here, together with `fill`,
  `stroke`, caps and joins). An element is a string (`<path d>`) or `[tag, attrs]` (no children).
- **Allowlist** (applied when the symbol is built, to every pack): tags `path circle ellipse rect line
  polyline polygon`; attributes of elements and of `a`: `d cx cy r rx ry x y x1 y1 x2 y2 width height
  points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray
  stroke-dashoffset opacity fill-opacity stroke-opacity fill-rule clip-rule transform vector-effect
  paint-order class` — values strings (≤ 64 KiB) or finite numbers. A string never contains a backslash
  (the CSS tokenizer resolves escapes before it reads a name: `u\72l(` is `url(`) and calls no CSS function
  but the transform functions `matrix translate scale rotate skewX skewY` and the colour functions `rgb rgba
  hsl hsla hwb lab lch oklab oklch color` — so no `url(`, `src(`, `var(` or `env(` (presentation attributes
  resolve `var()`, and a custom property may hold a `url()`). `class` only as space-separated
  `[a-z][a-z0-9-]*` tokens. A `vb` that is not four numbers with a positive width and height makes a site
  icon set's icon invalid (skipped with a warning; `npm run validate` reports an error); in a runtime pack
  (`Desk.icons.add`) it falls back to `0 0 24 24`. Anything else is dropped (one `console.warn` per icon).
- Runtime: `icon(id)` adds the `<symbol id="i-<id>">` to the inline sprite on first use and returns
  `<svg class="i" aria-hidden="true"><use href="#i-<id>"></svg>`. The DOM id prefix `i-` belongs to the
  sprite: no part, module or app gives an element an id starting with `i-`. Code that needs the reference
  itself (a `<use>` in a drawing) asks `Desk.icons.symbolHref(id)` (`'#i-<id>'` or `null`; core code imports
  `symbolHref` of `src/core/icons.js`).
  Unknown ids warn once and render empty.
- **Two-tone rendering**: `base.css` styles `.i-duo { opacity: var(--icon-duo-opacity); fill:
  var(--icon-duo-color) }` (tokens: `0.4`, `currentColor`). Every `<use>` copy takes the rule, and the tokens
  resolve where the icon is shown — so a theme or a part sets them on a container
  (`.tile { --icon-duo-opacity: 0.5 }` in `site/theme.css`). Selectors are matched inside the copy: a rule
  with an ancestor (`.tile .i-duo`, `.sprite .i-duo`) never reaches it — set the tokens instead.
- **Site icon sets** (`config.iconSets`, at most 8): JSON files below the installation root, by convention
  in `site/icon-sets/` (git-ignored in the public repository):

  ```json
  { "format": "jpkcom-desktop-icons/1",
    "name": "Acme duotone",
    "license": "Acme Icons 2.1 — commercial licence of Example Ltd.",
    "icons": {
      "acme-rocket": { "k": "d", "vb": "0 0 512 512", "e": ["M…"], "e2": ["M…"] },
      "acme-logo":   { "k": "f", "vb": "0 0 448 512", "e": ["M…"] } } }
  ```

  - `format` must be `"jpkcom-desktop-icons/1"` (else the whole file is refused); `name` and `license` are
    free texts (≤ 200 characters) for people and the tools — keep the set's licence notice in `license`.
  - Ids: `<prefix>-<name>`, `^[a-z][a-z0-9]{1,11}-[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 64 characters. The
    prefix must not be one of the project's icon namespaces `ti tif wc tile jpk`. Invalid ids and
    definitions are skipped with a warning; the rest of the set loads.
  - `k: 'o'` in a set assumes the 24-unit grid; on another grid give `a` with your own `stroke-width`
    (`npm run validate` warns otherwise). Two-tone (`k: 'd'`) and filled icons work on any grid.
  - The browser checks every definition when the set loads (the allowlist above); an icon left without a
    single element is dropped, so `has()` stays truthful and the usual fallbacks apply.
  - A file larger than 2 MiB or with more than 5000 icons, invalid JSON, a wrong `format`, a failed request
    (8 s timeout), a path below `vault.dir` → the set is left out with `console.warn`; the desktop starts
    without it (its icons then fall back like unknown ids: tiles `ti-app-window`, menus without glyph, the
    vault `ti-bookmark`).
  - Several sets: loaded in parallel, registered in config order; an id a set before it already brought is
    skipped (warned).
  - Loading: `main.js` loads the sets next to i18n and the site data (§3); `preload.js` hints them from
    `<head>`; the service worker keeps them offline like every file under `site/` (P12). Ship only the
    icons the site uses — the set's converter should write that subset, as `npm run icons` does for Tabler
    (about 0.7 KB per two-tone icon; `npm run validate` warns above 256 KiB).
  - The tools know the sets: `npm run validate` (manifest, `brand.glyph`, the files themselves), `npm run seal`
    (vault icons). Icons of a set used only inside sealed vault data must be in the set too — the set file
    is public, so it shows which icons the vault uses; prefer generic icons for entries that must not hint
    at a service.
  - **Licence**: a set is the site's own business. The project ships none and no vendor's data; check that
    the licence allows self-hosting the glyphs in a web page, keep its notice in `license`, and never commit
    a commercially licensed set to a public repository (the public `.gitignore` ignores `site/icon-sets/*`;
    a private site repository that tracks its set removes that line).
- Logos: `icons.logo(id)` builds a fresh `<svg>` with unique gradient ids (`logos.jpkcom`);
  `icons.addLogo(id, build)` for site logos. `config.brand.logo`/`glyph` choose the brand (`glyph` may be
  a set icon).
- Packs at runtime: `icons.add(pack, { override })` with the same definition format and allowlist (ids
  `[a-z][a-z0-9-]*`, `override` replaces existing ids). Icons added after the boot are unknown to everything
  that checked before (modules, the vault at unlock, the tools) — prefer a site icon set.
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
| fortune (P11) | `fortune` (source choice; the provider the user agreed to) | json | yes | `settings` |

**Reset groups** (Settings → Reset, by `order`): `settings` 10 (core; also revokes every consent),
`wallpaper` 20, `dock` 30 ("Dock layout"), `notes` 40, `todos` 45, `editor` 50, `calc` 55, `terminal` 58,
`trash` 80, `vault` 85 (no keys; `onReset` locks and forgets a kept login), `session` 90 (core),
`offline` 95 (panels; no keys, registered only where service workers exist: unregisters this
installation's worker and deletes its caches and the caches named in `config.offline.legacyCaches`).

Other storage:

- **sessionStorage** `<namespace>-booted` — the boot screen once per session (`theme.js` reads it).
- **IndexedDB** `<namespace>-vault` (`store.key('vault')`), object store `login`, one record
  `{ key: CryptoKey (non-extractable), file, user }` — only after "stay logged in" (P7).
- **Cache Storage** (`sw.js`, P12): `<namespace>:<base>:<version>-<hash>` (the shell; `<base>` = the
  installation path, `<hash>` over the precache-relevant config and `offline.fastStart`), `<namespace>:<base>:<version>-<hash>-next`
  (a prepared update, `config.offline.fastStart`: complete only with its marker entry `sw.js?complete`; the
  next start of the desktop moves it into the shell cache) and `<namespace>:<base>:pages` (Reader
  pages). Activation and the `offline` reset delete **every cache of this naming scheme for their own
  base**, whatever the namespace; other installations and other apps of the origin keep theirs. Answers
  with `Cache-Control: no-store` or `private` are never stored; `config.vault.dir` is never cached.
  **Code and data.** The shell cache holds the desktop's **code** — `index.html`, the manifest,
  `assets/icons/`, `src/`, `locales/`, `site/config.js`, `site.data` (`site/apps.js`), `site/theme.css`, the
  files and folders of `{ id, src }` modules and apps, `wallpaper.images`, the site icon sets
  (`iconSets`, §13 — JSON, but part of the version: the config and the manifest name their ids) — and its
  **data files**: every `notify.feeds` value (also outside the installation folder), the `fortune.dir`
  files `<lang>.json` of the language chain, and everything under `site/data/` and `site/content/` (Reader pages excepted — they use the
  pages cache). Precedence, first match wins: the vault (never cached), Reader pages, an exact code file, an
  exact data file (feed, fortune file), the deepest folder that holds the file — a module or app folder,
  `site/data/`, `site/content/`; a module or app folder wins a tie, so a module directly in `site/data/` makes
  it code, while a module file directly in `site/` leaves `site/data/` and `site/content/` data — the rest of
  the shell (code). Data files are fetched network first (offline or after `offline.timeoutMs`: the last
  copy), also with `offline.fastStart`; the update check never compares them and a prepared update never
  contains them, so changing one never offers a new version. Code is answered from the copy (fast start) and
  changes only as a whole — **code never mixes; data is always the server's current version.** Older code
  may therefore read current data for one session (until the offered reload): a data file must stay
  readable by the previous code — add fields, do not rename or remove them; an incompatible format gets a new
  file name. Icon ids named in data must already be in the deployed `src/icons/tabler.js` or site icon set. Run-time data of
  a module belongs under `site/data/` (e.g. `site/data/<module id>/`) and is fetched (`Desk.net.getJson`),
  never imported; code never lives under `site/data/` or `site/content/` except inside a module's or app's
  own folder (a generated bundle such as Pagefind's is code as well — keep it outside `site/`).
  **Legacy caches**: the names in `config.offline.legacyCaches` (exact, or `prefix*`) belong to a
  service worker the site used before. `sw.js` deletes them on activation, once more about 30 s later
  (the earlier worker may still finish requests and write again) and at every start of the desktop.
  `install.js` deletes them about 30 s after `controllerchange`, at every start when this page does not
  register the worker (`pwa.enabled: false`), and in the `offline` reset. A name of this project's
  scheme (`<namespace>:<any folder>:<version>-<hash>`, `-next`, `:pages`) is never matched, so no
  installation of this project loses a cache through this list.
  A file of the shell that the crawl did not fetch but the desktop read at runtime and that is no data
  file (a manual or `cat` file outside `site/data/` and `site/content/`, an image — not a script, style or
  worker, nor an exact code file such as `site.data`, a wallpaper or a site icon set: code stays on the
  crawl's compare path) is stored with the response header
  `X-Desk-Copy: runtime`. The fast-start update check refreshes such copies in place (deleted on 404/410 or
  when the server forbids keeping them) and never prepares or announces an update because of them; a copy
  from a later crawl replaces the marked one.

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
router.acceptPath(start | start[], path, scope?) → path | null
   // may a same-origin path open in a window whose start page is start (an absolute URL; an array = one per
   // language, the path qualifies when it qualifies for any of them)? Used by the 'web' kind's acceptUrl.
   // path: root-absolute ('/…'), ≤ 500 characters, no control character or backslash.
   // Boundary (judged on the path and on its "server view": escapes of unreserved characters decoded once
   //   ('%61' → 'a', '%2e' → '.'), %2f/%5c → '/', '//' → '/'):
   //   never the installation root, its index.html/.htm, a case variant of the root's own path, or a
   //   reserved folder (createRouter({ reserved }): config.vault.dir) — compared case-insensitively, for
   //   these two also with every segment's path parameters (';x', Tomcat/Jetty), stream suffix (':…',
   //   '::$INDEX_ALLOCATION') and trailing dots and spaces ('.', '%20', IIS/Windows) removed;
   //   the path must lie in the app's folder in both forms:
   //   scope   root-relative ('demos/clock/', against the installation root) or root-absolute ('/wiki/',
   //           against the origin, only outside the root). Ignored (→ default, one console warning per value)
   //           when it is not a safe folder (url.js isSafeScope), the root or a parent of it, or a
   //           root-absolute folder inside the root.
   //   default inside the root: the start page's first folder below it   /desk/demos/clock/ → /desk/demos/
   //           outside the root: the start page's own folder              /wiki/start/       → /wiki/start/
   //           a start page directly in the root, or whose own folder holds the root: only that page
   //           (any query): /desk/game.html, /status.html. A start page on another origin accepts nothing.
   // Best effort on top: dot segments ('.', '..', '%2e', '..;x') in the raw path or its server view → null.
   // Returns the parsed path + query + hash (as the URL parser writes them: dot segments are refused, never
   // resolved), or null.
launch(id, opts?) → boolean                // alias → target; launcher → toggle; link → tab; else wm.open(app, opts)

// Deep links (shell, P2 — src/shell/deeplinks.js; hash data is untrusted, §5)
//   #/<path>                   a same-origin page the desktop way (openUrl)
//   #app=<id>                  an app
//   #app=<id>&path=/<path>     an app at a location of its own: the kind's acceptUrl(app, path, 'link')
//                              decides (web: only with app.linkPaths); refused → the app opens as with
//                              #app=<id>. Written for windows whose location is not their start page and
//                              leads back to them only this way ('%' written as '%25': one decoding
//                              gives the exact path). path= comes last.
//   #app=<id>&<name>=<value>…  unknown parameters (before path=) are ignored (since 1.2) — future
//                              parameters degrade to opening the app
//   #search=<text>             the search
```

**Availability**: `registry.available(app)` is true only when the app can open now — its kind passes the
registry's kind check (set by the WM: `'link'`, `'launcher'` while a launcher service exists, or a kind
defined with `wm.defineKind`), module-backed kinds (`app`, `native`) have their implementation (or a
`load()` for it, §8), aliases their target. `registry.implReady(app)` → false while window code loaded on
demand is still missing; `registry.loadImpl(app)` → `Promise<impl | null>` loads it once. Unavailable apps leave All apps, the dock, menus and search (`registry.list()` skips
them); `'wm:kind'` and a new launcher re-announce `'apps:change'`. Tests and other hosts set the check
with `registry.setKindCheck(fn)` (`createRegistry({ kindCheck })`).

Paths in the manifest/config are relative to the installation root (works in a sub-folder);
absolute `/…` paths are allowed for same-origin content outside it — including a `web` app's `scope`, so a
web app at `/wiki/start/` keeps its in-frame location on restore (`acceptPath` above).

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
| `fortune` | fortune (P11) | the hosts of the provider `config.fortune.remote` names: built in `https://v2.jokeapi.dev` (`jokeapi`) or `https://uselessfacts.jsph.pl` (`uselessfacts`), or those of a provider a module adds — registered when that provider is adopted, withdrawn when its module fails; the agreement is bound to that provider (below) | — |
| `dns` | terminal (P9) | the host of `config.terminal.doh.url` — declared **only when `config.terminal.doh` is valid** | — |

A provider added by a module (`Desk.weather.addProvider()`, the `fortuneProviders` contribution or
`Desk.fortune.addProvider()`) brings its own hosts; the consent registration follows it. The core stores
the agreement per service id only. The Fortune app therefore binds it to the provider: when the user
agrees, it records `<provider id>@<sorted hosts>` in its storage key `fortune` (`agreed`). At
`'modules:ready'`, an agreement recorded for another provider or other hosts, or one without a record, is
withdrawn (`Desk.consent.set('fortune', false)`), so the question comes again. The label and hint of the
`fortune` row follow `config.fortune.texts.service` / `serviceHint` when the site sets them.

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
  `svg.i`, `.i-duo` (the secondary layer of a two-tone icon, §13), `.sprite` (its symbols have the DOM ids
  `i-<icon id>`; no other element id starts with `i-`).
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
| Type | `--font --font-mono --icon-stroke --icon-duo-opacity --icon-duo-color` |
| Layout | `--mb-h --mb-total --bar-h --radius-win --radius-menu`, window controls `--wc-box-w --wc-box-h --wc-dot --wc-glyph-size` (compact: larger `--mb-h --bar-h --tile --radius-win --wc-*`, `--bounce`, `--dock-space` — the height the Dock takes at the bottom, for sheets that must end above it); per window `--title-side` (title fitting) |
| Stacking | `--z-overview 790 --z-launcher 800 --z-dock 900 --z-menubar 1000 --z-notification 1050 --z-tilemenu 1060 --z-menu 1100 --z-popover 1150 --z-boot 5000` (windows stack inside `#workspace`, an isolated context below all of them) |
| Motion | `--ease`, `--anim` (= `config.ui.animMs`, set by `theme.js` before the first paint), `--dur: var(--anim)` (window transitions — JS timers and CSS use the same duration) |
| WM | `--win-min-w --win-min-h` (from `config.wm.minSize`, set by `initWM()`) |

**Radius, glass and shadow tokens (two levels).** Families are the knobs of a theme: `--radius-panel`
(12px), `--radius-item` (8px), `--radius-field` (7px), `--radius-control` (6px), `--radius-control-sm` (5px),
`--radius-small` (4px), `--radius-mark` (3px), `--radius-hair` (2px), `--radius-pill` (999px), `--radius-round` (50%),
next to the existing `--radius-win` and `--radius-menu`; `--glass-backdrop`, `--chrome-backdrop`; `--shadow-hairline`,
`--shadow-control-edge`, `--shadow-pressed`, `--ring-focus`, `--ring-selected`, `--shadow-popup`, `--shadow-popover`.
Part tokens name one role (`--radius-<role>`, `--shadow-<role>`, `--ring-<role>`, `<surface>-backdrop`, part prefixes of
this section for single-part roles) and either alias their family (`--radius-btn: var(--radius-control)`) or carry
their own value where today's value differs from every family. Defaults are today's values; differing values are never
merged. Rules and part tokens that use `--shade`, `--ink`, `--line-strong`, `--win-bg`, `--control-edge`,
`--pressed-edge`, `--warn` or `--cal-weekend` are declared on `:root, [data-island="dark"]` so dark islands recompute
them; all others on plain `:root`. Outside `tokens.css`, `border-radius`, `box-shadow`, `text-shadow`,
`filter: drop-shadow()` and `backdrop-filter` use these tokens — literals only for the documented structural
exceptions (`tests/theming.test.mjs`). The full list of every token is `docs/theming.md`. Families must be set on `:root` (with or without `[data-theme=…]`): part tokens resolve there, so on `body.compact` or on a dark island override the part tokens; radius and glass tokens set on `:root` reach islands, shadow and ring tokens need `:root, [data-island="dark"]` because islands re-declare them. A site's own theme is `site/theme.css` (linked in `index.html` after the core CSS, a shell file of the service worker); see `docs/theming.md`.

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
   // opts: { url?: string, scroll?: number, state?: any, restore?: boolean } — an app may read more options
   // An open window is shown instead; the kind's reopen(win, opts) receives the options (Reader: a new URL).
   // null: unknown app, missing implementation (registry.available), or no kind registered for app.kind.
   // An alias opens its target. restore: true = session restore (no open animation; 'window:open' carries restore).
   // Window code on demand (§8 load): the window opens at once with a spinner and mounts when the code is
   // there — win.ready (Promise<boolean>) resolves then. Until then serialize() answers with opts.state,
   // reopen() options wait for the mount, the other hooks of 'app'/'native' do nothing.
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
wm.acceptUrl(app, '/path', from = 'launch') → '/path' | null   // may this stored/linked path open in this app? (kind
                                                  //   acceptUrl; from: 'session' | 'launch' | 'link' — an unknown value counts as 'link')
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
| `impl` | the module implementation for kinds `app`/`native` (`registry.impl(app)`), else `null` (was `win.ext`); with `load` (§8) the loaded hooks once `ready` resolved |
| `ready` | `Promise<boolean>`: `true` once the content is mounted, `false` when it could not be built (also for windows that mount at once) |
| `pending` | while the window code loads: `{ state, reopen }` (what `open()`/`reopen()` asked for), else `null` |
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
  mount(win, body, bar, opts),        // required (or load): build the content (throwing → a "not available" notice)
  load?() → Promise<hooks>,            // window code on demand (§8): resolves to the hooks this definition leaves out
                                       //   (a module's default export or an object); loaded with the first window of
                                       //   the kind, the hooks given here win; keep acceptUrl here (asked without a window)
  focus?(win),                         // after open and every show()
  relabel?(win),                       // language switch; without it the WM resets the title to the app name
  unmount?(win),                       // closing: flush, release blob URLs, remove listeners
  reopen?(win, opts),                  // open() of an already open window with new opts
  serialize?(win) → JSON,  restore?(win, state),       // state round trip (restore runs right after mount when opts.state is set)
  locationOf?(win) → href | path | null,                 // current same-origin location
  acceptUrl?(app, path, from) → path | null,             // validate a stored/linked path for this app (from: §8)
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
  still shows its start page. `acceptUrl(app, path, from)`: `'link'` only with `app.linkPaths`; then
  `router.acceptPath(starts, path, app.scope)` with the start page of every language — inside `app.scope`
  (root-relative, or root-absolute outside the root) or, by default, the start page's first folder below the
  root (start page inside it) or its own folder (start page outside it). Never the root, `index.html` or a
  reserved folder (§15). `reopen(win, { url })` (a deep link or `launch(id, { url })` for an open window)
  loads an accepted location only while the frame still shows what the desktop loaded or is loading into it
  (its start page or the last location it was asked for, after redirects; a load the desktop started that has
  not finished — a window the session just restored — counts as untouched, so a link in the address wins);
  after the visitor navigated in the frame the window is only shown (unsaved input stays). Restored windows
  (`opts.restore`) are left alone. A shield (`.has-frame::after`) lets the first click into an inactive
  iframe focus the window.
- **`app`** — every hook goes to the module implementation (`impl.mount/focus/relabel/unmount/reopen/menu/
  serialize/restore/locationOf/acceptUrl/reload/popOut/canPopOut/canLink/beforeClose`); `relabel` resets the title first, then
  calls `impl.relabel`; `acceptUrl(app, path, from)` → `registry.impl(app)?.acceptUrl?.(app, path, from) ?? null` (no
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
| `window:ready` | `{ win, ok }` | its content is built (`ok`) or could not be — right after `window:open`, or when window code loaded on demand (§8) arrived; menus, session and deep links read the window again |
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
  `open(app, { url: acceptUrl(app, url, 'session'), state, restore: true })`, `rect()`, `setLayout(…, { quiet: true })`,
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
`modules`. Provide a service if others use it; contribute through extension points.
A site-only module or app lives in `site/modules/<id>/` and is listed as `{ id, src }` in `modules` or
`apps` of `site/config.js`. It imports the API with `import Desk from '../../../src/core/api.js'`, keeps
its texts next to its code (`locales: 'locales/'`, files `locales/<lang>/<ns>.js`, §12) and its CSS in its
folder (`styles`). The shipped example is `site/modules/hello/` (window, texts with placeholder and plural,
CSS, stored value with validation, backup and reset, a terminal command); the comment at the top of its
`index.js` explains how to turn a copy into your own app. `npm run i18n:check` checks its `locales/`.
Data the module reads at run time (JSON, Markdown) goes under `site/data/<id>/` and is fetched with
`Desk.net.getJson`/`getText`: the service worker treats it as data (always fresh, kept offline, never a
"new version", §14). Files in the module's own folder are code. Data may be newer than the code reading it
(one session after a deploy): change its format compatibly — add fields, do not rename or remove them, a
new file name for an incompatible format. Icon ids belong into the descriptor or `site/apps.js` (code);
an icon id named in data must already be in the deployed `src/icons/tabler.js` or a site icon set
(`config.iconSets`).

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
Text manuals for the terminal: `man` on the collection (a template) or on its items (§7).
A web overview page at the collection's `basePath` that should open in a window of its own is a
hidden `web` app named in `webApp` (§7); a Reader overview only needs `webUrl: '<basePath>index.html'`.

**An accent or tint** — `theme.accents.<id>: '#rrggbb'` / `theme.tints.<id>: ['#top', '#bottom']` in
`site/config.js`; label `settings` locale key `accent.<id>` (falls back to the id).

**A site icon set** — a JSON file in `site/icon-sets/` in the format of §13 (made by your own converter
from the set you hold a licence for; only the icons you use), its path in `iconSets` of `site/config.js`,
its ids (`'<prefix>-<name>'`) in `site/apps.js` like Tabler ids. `npm run validate` checks ids and file;
`npm run seal` accepts the set's icons in vault data. Tune the secondary layer with `--icon-duo-opacity` /
`--icon-duo-color` in `site/theme.css`. `npm run icons` is still needed for the Tabler icons of the
desktop itself. The public repository ignores `site/icon-sets/*`; in a private site repository remove that
line if the set should be tracked there.

**An online service** — declare `consent: [{ id, hosts, label, hint }]`, fetch with
`Desk.net.getJson(url, { service: id })`, add `services.<id>: false` to the config docs, list the host
for the CSP in §16, the README, `docs/deploy.md` and the server snippets (`docs/server/*`, commented out).

**An online source for the Fortune app** — a site module (`site/modules/<id>/index.js`, listed in
`modules` or `apps` as `{ id, src }`) with `fortuneProviders: [def]` in its descriptor (P11 has the
definition). The site sets `fortune.remote: '<provider id>'` and `services.fortune: true`, and adds the
provider's hosts to its CSP `connect-src` (locally: `node tools/serve.mjs --connect https://<host>`). Run
`npm run preload` after adding or changing the module (`tools/build-preload.mjs`). `fortune.local: false`
drops the built-in sayings (online only). A site that renames the app (`{ id: 'fortune', name, icon }` in
`site/apps.js`) sets `fortune.texts` for the texts that name it; the window's card follows the app's
logo, mark or icon.

## 22. Tools and tests

| Command | Does |
|---|---|
| `npm run serve` (`node tools/serve.mjs --port 8080 --base / --connect https://… --frame https://… --wasm`) | static server with the production headers; directory → `index.html`; dotfiles, `node_modules`, `tools`, `tests` are 404; `--connect`/`--frame` add https origins to `connect-src`/`frame-src`, `--wasm` adds `'wasm-unsafe-eval'` (Pagefind) — §5; `--extra <url-path>=<file>[,…]` serves single files from outside the project tree (test fixtures, a trial config — never in production) |
| `npm run icons` / `npm run icons:check` | build / verify `src/icons/tabler.js` (sources + `site/icons.json`; Tabler only — site icon sets are not built here) |
| `npm run preload` / `npm run preload:check` | build / verify `src/boot/preload.js` (§3): the static import graph of the boot, the core parts and every module and app in `src/`, their `styles` and `i18n` — run after changing an import, a descriptor's `styles`/`i18n` or adding a module or app (a stale file only costs speed); the generated script also hints the files of `config.iconSets` (it reads the list from the config at run time, so changing the list needs no rebuild; the path rule is generated from `src/core/icon-sets.js` `SET_PATH`) |
| `npm run browsers` | downloads the headless Chromium that `playwright-core` drives (`check:browser`, `icons:pwa`) — install scripts are off (`.npmrc`), so this is a separate step |
| `npm run icons:pwa` (`node tools/build-pwa-icons.mjs`) | renders the PNG app icons (`assets/icons/icon-*.png`, `maskable-*.png`, `apple-touch-icon.png`) from `favicon.svg` / `maskable.svg` in headless Chromium; run after changing either SVG and commit the PNGs |
| `npm run i18n:check [-- <lang>…]` | compare locales with `en`; warns about plural categories a language lacks |
| `npm run validate` / `npm run validate:strict` (`node tools/validate-manifest.mjs [--manifest …] [--config …] [--strict] [--quiet] [--json]`) | checks `site/apps.js` against the config before it goes online: ids, kinds and the modules they need, references (aliases, overrides, menus, `site.legal`, `notify.app`, `vault.collection`, …), collections, urls (local files exist), icons (Tabler subset, custom glyphs, the site icon sets of `config.iconSets` — the set files themselves are checked too: format, ids, reserved prefixes, definitions against the allowlist, size, location), tints, language maps for every configured language, the fortunes and feeds; exit 0 / 1 (errors, or warnings with `--strict`) / 2 (not loadable) |
| `npm run seal` (`node tools/seal-vault.mjs --in <json> [--out <dir>] [--keep \| --prune]`, `--list`, `--new-salt`) | seals private bookmarks for the vault (P7). **The plain-text JSON must lie outside the project and the web root** (the tool refuses it below `site/`, in the output folder and below the web root that folder belongs to); see `site/vault/README.md`. Vault icons may come from a site icon set (`config.iconSets`, read below the web root of the output folder — the project by default). |
| `npm run check:browser` (`node tools/browser-check.mjs [--path p] [--lang de-DE] [--base /desk/] [--mobile] [--scenario f.mjs] [--site-config c.js [--keep-sw]] [--route path=file …] [--no-sw] [--screenshot s.png] [--size WxH] [--wait ms] [--serve-args=value]`) | headless Chromium (playwright-core, devDependency) against `tools/serve.mjs` with the production headers: fails on console errors, page errors, CSP violations and failed requests; a scenario module (`export default async ({ page, desk, log, assert }) => …`; `desk(fn, …args)` runs `fn(window.JPKDesk, …args)` in the page) drives the desktop and declares the failures it provokes on purpose with **`export const expect = { http: [RegExp \| { status, url: RegExp }], console: [RegExp] }`** — matching events are listed as expected instead of failing the run. `--site-config` swaps `site/config.js` through `page.route()`, which a service worker bypasses, so it blocks service workers (`--keep-sw` keeps them and warns when one controls the page; `--no-sw` blocks them without a config). Every option also takes `--name=value`; `--serve-args` passes options to `serve.mjs` even when they start with `--` (`--serve-args="--connect https://… --wasm"`). `--route path=file` (repeatable) serves a local file at `<base><path>` through `page.route()` before the first navigation — e.g. a site module that is not in the tree; like `--site-config` it blocks service workers unless `--keep-sw`. Run checks one at a time on small machines (`flock <lock> node tools/browser-check.mjs …`) |
| `npm test` | `node --test "tests/*.test.mjs"` (Node ≥ 24, `engines`): i18n (chain, plurals, placeholders, number grouping, keys, L, detection, formatters), store (prefix, failure modes, validators), registry + router (overrides, kind check, tab fallback, acceptPath (sub-folder install, start pages outside the root, absolute scopes, reserved folders, case variants, dot/encoded segments)), config merge/validation, module loader (hooks, withdrawal after a failed setup), dom guards, version sync (package.json = `VERSION`), token sync, the source hygiene test (`tests/hygiene.test.mjs`: no bidirectional-control or zero-width characters in `src/`, `locales/`, `tests/`, `site/`, `tools/`, `index.html`, `sw.js` — write them as `\u` escapes), and one test file per package (`tests/p<NN>-*.test.mjs`: pure functions, the service worker in `node:vm`, the server snippets against §5) |

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
- **Site icon sets are JSON data, not modules** (§13). Considered and rejected: an ES-module set
  (`export default { … }`, imported in boot step 3 like `site/apps.js`), which would reuse modulepreload and
  the existing code path. Against it: a set is a distributable artifact made from third-party files, and
  sites may take one from elsewhere — as JSON it can never run code, whereas `site/config.js` and
  `site/apps.js` are the operator's own code; the 2 MiB / 5000-icon limits are enforced *before* parsing
  (`request(…, { maxBytes })`), which `import()` cannot do; a module stays in the page's module map for good;
  the tools read JSON without executing it; `JSON.parse` is faster than a script literal of the same size
  (about 1.6 ms against 2.9 ms for 200 KB in Node). The price is one new hint type,
  `<link rel=preload as=fetch crossorigin>`, whose reuse is checked in the browser scenario (one request).
- **Two-tone icons use a class and tokens**, not baked-in `opacity` attributes: the secondary layer of
  every copy follows `--icon-duo-opacity` / `--icon-duo-color` (themes, parts).
- **Sprite symbols have the DOM id `i-<icon id>`**, not the icon id: icon ids are a namespace of their own
  and can never shadow or be shadowed by an element id of the shell, a dialog, the Reader or a module.
