# P12 — PWA and deployment

> Service worker, web app manifest, app icons, server configurations. © Jean Pierre Kolb — MIT License.

## What it provides

| File | Purpose |
|---|---|
| `sw.js` | service worker (classic script at the installation root): offline copy of the desktop and of Reader pages |
| `site/theme.css` | the site's own theme (token overrides in `@layer themes`, `docs/theming.md`): linked in `index.html` after the core CSS and a shell file of the worker, so it is cached for offline use |
| `manifest.webmanifest` | web app manifest: relative `start_url`/`scope`, neutral English name, icons |
| `assets/icons/` | `favicon.svg` (any), `maskable.svg`, `icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`, `apple-touch-icon.png` (180 px) — all from the JPK monogram (brand assets, not MIT: `CREDITS.md`) |
| `tools/build-pwa-icons.mjs` | renders the PNG icons from `favicon.svg` / `maskable.svg` (`npm run icons:pwa`, playwright-core) |
| `docs/deploy.md` | the deployment guide (what to upload, root/sub-folder, HTTPS, headers, opt-in policy extensions, MIME types, caching, special folders, server notes, PWA, checks, troubleshooting) |
| `docs/server/apache.htaccess` | Apache 2.4 (`.htaccess`) |
| `docs/server/nginx.conf` | nginx site file (`conf.d/`) |
| `docs/server/Caddyfile` | Caddy 2 |
| `docs/server/ferron.conf` | Ferron 3 (its own format; currently release candidates) |
| `docs/server/ferron.kdl` | Ferron 2 (KDL; the stable line) |
| `docs/server/static-web-server.toml` | static-web-server 2.x |
| `tests/p12-sw.test.mjs` | the service worker in a `node:vm` context with fake Cache/fetch: config, routing, crawl, strategies, lifecycle, a crawl of this project |
| `tests/p12-deploy.test.mjs` | manifest + icons (sizes from the PNG headers), every server snippet against the §5 header set, `tools/serve.mjs` and `docs/deploy.md` in sync |

No module descriptor, no services, no bus events, no i18n namespace, no CSS, no Tabler icons: the
service worker runs outside the page; the page side (registration, the "Install as an app" row, the
"Offline copies" reset group) belongs to `src/panels/install.js` (P3).

## Config keys read

`sw.js` reads `site/config.js` itself (`importScripts`, with a temporary `self.window = self` because the
file writes `window.DESKTOP_CONFIG`) and validates what it uses; invalid values fall back to defaults that
mirror `DEFAULTS` (a test keeps them equal):

| Key | Use |
|---|---|
| `namespace` | cache name prefix |
| `languages`, `defaultLang` | which `locales/<lang>/` files to precache (plus base languages and `en`) |
| `modules`, `apps` | crawl roots `src/modules/<id>/index.js`, `src/apps/<id>/index.js`, `{ id, src }` (its folder joins the shell — unless that folder is the installation root or one of its parents, then only the file itself) |
| `site.data` | crawl root (the site manifest) |
| `vault.dir` | never cached; checked with the same folder rule as `src/core/config.js` (`relDir`: ends with `/`, no `..`, no scheme/`//host`, no whitespace/`?`/`#`/backslash), so the worker excludes exactly the folder the page uses |
| `wallpaper.images[].src` | precached code (first paint; part of the version, also inside a data folder) |
| `fortune.dir` (with app `fortune`; same folder rule), `notify.feeds` (with module `notify`) | precached data files (network first, never compared — see *Code and data*); fortunes for the whole language chain (offered languages, their base languages, `defaultLang`, `en`) like the app's own fallback |
| `iconSets` | precached code (the path rule `SET_PATH` of `src/core/icon-sets.js`, inline copy; a set below `vault.dir` is left out; part of the version, also inside a data folder — the config and the manifest name its ids); a set outside `site/` joins the shell as an exact file |
| `pwa.enabled` | `false` → no precache; a still registered worker deletes its caches and unregisters itself |
| `offline.maxPages` (0–1000), `offline.timeoutMs` (500–60000) | Reader page cache size; network timeout before a cached copy answers |
| `offline.fastStart` (default `true`) | answer the desktop's files from the shell cache and check for updates in the background; `false` → network first |
| `offline.legacyCaches` (≤ 32 entries: exact name or `prefix*`, ≥ 4 characters before `*`) | caches of an earlier service worker, deleted on activation, ~30 s later and at every start (also with `pwa.enabled: false`, before it unregisters); never a name of this project's scheme; not part of the precache hash |

## Storage

Cache Storage only (no localStorage keys):

- `<namespace>:<base>:<VERSION>-<hash>` — the shell; `<base>` is the installation path (`/`, `/desktop/`),
  `<hash>` an FNV-1a hash of the precache-relevant config (modules, apps, languages, paths) and of
  `offline.fastStart`, so a new module list builds a fresh cache and the old one is deleted on activation
  (and a switch of `fastStart` never keeps unmarked runtime files of network-first mode, see below).
- `<namespace>:<base>:pages` — Reader pages (kept across versions).

On activation (and when `pwa.enabled` is `false`) the worker deletes every cache of its own naming scheme
for its own folder, whatever the namespace — `^[a-z][a-z0-9-]{0,23}:<base>:(<version>-<8 hex>|pages)$`.
One folder holds one installation, so these are all its own, including the caches of an earlier namespace
after `config.namespace` changed. Other installations (other `<base>`) and other apps on the same origin
keep their caches.

Legacy caches (`config.offline.legacyCaches`): names a service worker the site used before this one.
The match rule (`legacyMatcher()`, the same in `sw.js` and `src/core/config.js`): not a name of this
project's scheme for any folder (`CACHE_SCHEME`, `cacheNames().own` with `.*` for the folder), and equal
to an exact entry or starting with a prefix entry. Deleting a legacy cache does not post `desk:update`
(the pages already run this desktop's files).

## Service worker behaviour

- **Precache** (install): a crawl, not a hand-kept list. Roots: `index.html` (`<script src>`, `<link href>`),
  a small safety list (boot scripts, core CSS, manifest, icons), `src/<core part>/index.js`, every configured
  module/app, `site.data`, data files, the files of `iconSets`. It follows static/dynamic imports with literal specifiers,
  descriptor `styles: [...]` and `i18n: [...]`, CSS `@import`/`url()`, then adds `_meta`, `core` and every
  found namespace for the language chain — from `locales/<lang>/<ns>.js`, or, for a file whose descriptor
  declares `locales: '<folder>/'` (same rule as `src/core/modules.js`: relative, ends in `/`, stays inside
  the module's folder; anything else is ignored), from `<folder><lang>/<ns>.js` next to it instead (a site
  app like Hello keeps its texts offline; no request for a core `locales/<lang>/<ns>.js` that does not
  exist). Each file is fetched once with `cache: 'no-cache'`, put under its
  path (query dropped) and scanned from a clone; `Promise.allSettled` per level, 20 s per file, at most 800
  files. Against this project with the shipped config: 219 files (exactly the configured modules; the
  disabled holidays/weather/vault are left out), 4 of them data files (the two feeds, two fortune files —
  a prepared update crawls the other 215); no misses. The crawl does not skip comments, so a
  descriptor example in a comment must not quote file names (that is why the one in `modules.js` writes
  `styles: [<own .css files>]`).
- **Routing** (`classify`): only same-origin `GET` without `Range`; `pwa.enabled` false → nothing.
  - top-level navigation to `<base>` or `<base>index.html` → shell, one copy under `<base>` (any query);
  - any other navigation in scope (iframes of web apps, other pages of the site at a root install) → the
    navigation preload response, or `fetch`; offline a Reader copy of the same URL if there is one; when the
    browser has no navigation preload the request is not intercepted at all;
  - non-navigation `Accept: text/html` fetches (the Reader; also outside `<base>`) → pages cache, query kept;
  - data files (`isDataUrl`: `notify.feeds` values, the fortune files, `site/data/`, `site/content/`, minus
    code — see *Code and data*) → `{ kind: 'data' }`: network first in the shell cache (query dropped),
    whatever `fastStart` says;
  - other files under `index.html`, `manifest.webmanifest`, `assets/icons/`, `src/`, `locales/`, `site/` (and site
    module folders) → shell cache: from the copy (fast start) or revalidated (`cache: 'no-cache'`);
  - never: other origins, `sw.js`, `vault.dir`, everything else (e.g. `/tools/` of the surrounding site).
  - A site module whose file sits at the installation root (`src: 'demo.js'`) or above it (`'../demo.js'`)
    adds only that file to the shell, not its folder — otherwise the whole site would be cached. The same
    holds for a fortune folder at or above the root (only `<dir><lang>.json` of the language chain).
- **Code and data**: the shell cache holds the desktop's **code** — `index.html`, the manifest,
  `assets/icons/`, `src/`, `locales/`, `site/config.js`, `site.data` (`site/apps.js`), `site/theme.css`, the
  files and folders of `{ id, src }` modules and apps, `wallpaper.images`, the site icon sets
  (`iconSets`, §13) — and its **data files**: every
  `notify.feeds` value (also outside the installation folder), the `fortune.dir` files `<lang>.json` of the
  language chain, and everything under `site/data/` and `site/content/` (Reader pages excepted — they use the
  pages cache). Data files are fetched network first (offline or after `offline.timeoutMs`: the last copy),
  also with `offline.fastStart`; the update check never compares them and a prepared update never contains
  them, so changing one never offers a new version. Code is answered from the copy (fast start) and changes
  only as a whole — **code never mixes; data is always the server's current version.** Older code may
  therefore read current data for one session (until the offered reload): a data file must stay readable by
  the previous code — add fields, do not rename or remove them; an incompatible format gets a new file name.
  Icon ids named in data must already be in the deployed `src/icons/tabler.js` or site icon set. Run-time data of a module
  belongs under `site/data/` (e.g. `site/data/<module id>/`) and is fetched (`Desk.net.getJson`), never
  imported. `cleanConfig()` derives two sets (absolute URLs, not part of the cache-name hash):

  | Set | Exact files | Folders |
  |---|---|---|
  | `code` | `SHELL_FILES`, `site.data`, every `wallpaper.images[].src`, every `iconSets` file, the entry file of every `{ id, src }` module and app | the folder of every `{ id, src }` module and app (none when it is the root or above — then only the entry file) |
  | `data` | `notify.feeds` values, the fortune files `<fortune.dir><lang>.json` of the language chain | `site/data/`, `site/content/` |

  Classification of a same-origin request, first match wins: `vault.dir` (never handled) → `Accept:
  text/html` fetch (`page`) → exact code file (`asset`) → exact data file (`data`) → inside a folder: the
  deepest matching code or data folder decides (`asset`/`data`; a code folder wins a tie) → any other shell
  URL (`asset`). The most specific rule wins: an explicitly configured fortune file in a module's folder stays
  data, a wallpaper in `site/content/images/` stays code, a module folder inside `site/data/` (also
  `site/data/` itself, when the entry file lies directly in it) stays code, and a module file directly in
  `site/` (folder `site/`) leaves `site/data/` and `site/content/` data. Steps 3-6 live in one helper `isDataUrl()` used by the
  routing, the crawl and the update check. `site/apps.js` is code: an ES module of the boot graph (`main.js`
  imports it, `preload.js` hints it), and `tools/build-icons.mjs` compiles its icon ids into
  `src/icons/tabler.js` — both must come from one deployment. Wallpapers are code as well (first paint). The
  worker does not know modules that code imports from a data folder — keep code out of `site/data/` and
  `site/content/` unless it is a module's own folder.
- **Fast start** (`offline.fastStart`, default `true`): `shell-nav` and `asset` (code) answer from the shell
  cache when it has the file (else network first, stored). The shell navigation first moves a complete
  prepared update in place (`applyUpdate`: `<shell>-next` with its marker `sw.js?complete` → copied into the
  shell cache, `-next` deleted; without the marker `-next` is only deleted), then schedules
  `checkForUpdate` (`CHECK_DELAY_MS` 3 s after the start, at most every `CHECK_GAP_MS` 60 s, inside
  `waitUntil`): every shell file except data files is fetched with `cache: 'no-cache'` (index.html from the navigation
  preload answer) in batches of `CHECK_BATCH` and compared byte for byte with the copy (or the prepared
  one). A difference → the install crawl into `-next` (without data files: neither roots nor URLs met on the
  way); a crawl with network failures (not HTTP errors) is
  dropped, else the marker is written last and every window client gets `{ type: 'desk:update' }`. A new
  worker generation that deleted older shell caches on activation posts the same message.
  Files the crawl does not produce but the desktop reads at runtime and that are no data files (`man`/`cat`
  text outside `site/data/` and `site/content/`, images) answer from the copy as well; `cacheFirst` stores
  them with `X-Desk-Copy: runtime` — except code: the page's request `destination` is `script`, `style`,
  `worker`, `sharedworker`, `json` or a worklet, or the key is an exact file of the `code` set (`site.data`,
  a wallpaper, a site icon set). Such code stays unmarked, so a change of it goes through the crawl and the
  atomic swap on the next start, never into a running page. `checkForUpdate` refreshes the marked copies in
  place (`no-cache` fetch: changed bytes → new marked copy; 404/410 or not to be kept → deleted; network
  failure → kept) and never sets `changed` for them, so editing or deleting such a file on the server
  neither re-crawls the desktop nor shows the update banner (a manual under `site/content/` is a data file
  and network first anyway). A marked key that a later crawl (`-next`) contains is overwritten by the
  crawled copy in `applyUpdate`.
- **Strategy** (`fastStart: false`; data files and Reader pages always): network first with `offline.timeoutMs`; the network answer is stored inside `waitUntil`
  (only `200`, `type: 'basic'`, and never an answer with `Cache-Control: no-store` or `private` — at a root
  install other scripts of the site may fetch personal HTML fragments; the precache skips such files too;
  redirected responses are re-wrapped so they may answer a navigation); after
  the timeout a cached copy answers while the late network answer still refreshes it; without a copy the
  request waits for the network. Pages: re-inserted on refresh, trimmed oldest-first to `maxPages`.
- **Lifecycle**: `skipWaiting()` after the precache; activation deletes own older caches and the legacy
  caches (`offline.legacyCaches`), enables navigation preload, `clients.claim()`.
- **Legacy caches** (only with a non-empty `offline.legacyCaches`): besides activation, the first fetch
  event after activation keeps the worker alive (`waitUntil`) for `LEGACY_FOLLOW_UP_MS` (30 s) and deletes
  them again. Requests the earlier worker received before the hand-over finish later and re-create its
  cache. Every top-level start (`shell-nav`) deletes them as well. The worker imports the current
  `site/config.js` when it installs, so it always has the current list, whereas the page may still run
  the previous config from the offline copy. The follow-up does not run inside the activate
  `waitUntil`, because fetch events wait until the worker is `activated` and a delay there would stall
  every request of the claimed pages. A worker stopped before the follow-up loses it; the next start
  covers that case.

## Server configurations

Complete, standalone header sets (ARCHITECTURE §5) for root and sub-folder installs without edits;
commented opt-in lines for `connect-src` (Open-Meteo, Bright Sky, the DoH host, JokeAPI, Useless Facts),
`frame-src`, `'wasm-unsafe-eval'` and `geolocation=(self)`. `https://geocoding-api.open-meteo.com` (named
in the task list) appears only in a separate comment for a place search by name: the shipped providers
never call it (the `open-meteo` provider declares `hosts: ['api.open-meteo.com']`), so it is not part of
the example policies. `no-cache` + ETag for everything except images/fonts/media
(`public, max-age=86400`), trailing-slash redirect, no listings, dotfiles 404, `X-Robots-Tag` for
`site/vault/`, `Cross-Origin-Opener-Policy` as in `tools/serve.mjs`, HSTS without `preload`. Apache,
nginx, Caddy and Ferron keep `/.well-known/` reachable; static-web-server's `ignore-hidden-files` has no
exception (checked in a 2.44.0 container: `/.well-known/acme-challenge/x` → 404) — documented in the
file and in `docs/deploy.md`.

Validated in Docker containers (one at a time, removed afterwards), each with the server's own checker
where it has one and with a request script against a docroot holding the desktop at `/` and at `/desktop/`
(redirect, exact CSP, all headers, MIME types, Cache-Control per type, 304, no listings, dotfiles, vault):

| Server | Version | Checker |
|---|---|---|
| Apache httpd | 2.4.69 | `httpd -t`; requests over HTTP and HTTPS (mod_ssl); also under a parent `.htaccess` with conflicting `<FilesMatch>` headers |
| nginx | 1.31.6 | `nginx -t` (original file with a test certificate); requests |
| Caddy | 2.11.7 | `caddy validate`, `caddy fmt` (no changes); requests |
| Ferron 3 | 3.0.0-rc.9 | `ferron validate`, `ferron doctor`; requests |
| Ferron 2 | 2.8.1 | requests (no validate command in 2.x) |
| static-web-server | 2.44.0 | original file started with TLS + HTTP redirect; requests |

Findings that shaped the files: Apache applies `<Files>` sections after all `.htaccess` directives
(parents first), so the header set lives in `<Files "*">` and first unsets plain `Header set` copies; nginx
needs per-extension `location`s for MIME types (a `types {}` in `server` would replace the whole table) and
maps instead of `add_header` in locations; nginx's stock table still says `application/javascript`; Caddy's
`?Cache-Control` keeps the image rule independent of handler order; Ferron 2 replaces all inherited
`header` entries in a block that sets one (snippet reused); SWS merges every matching `[[advanced.headers]]`
entry, later ones win.

## Browser check (tools/browser-check.mjs)

Scenarios used during development (not shipped):

- `scenario.mjs` at `/` (en, desktop) and at `/desktop/` (de-DE, phone): registration, scope = installation
  folder, navigation preload on, cache name, 190 precached files incl. module CSS and both languages,
  no vault/`sw.js` in the cache, manifest MIME/`start_url`/`scope`, every icon loads; then the server
  process is killed and the page reloaded: the desktop boots from the cache (16 modules, no failures), Notes
  opens, the other language loads.
- `scenario-install.mjs` with the `<link rel="manifest">` injected (before `index.html` shipped it):
  `src/panels/install.js` registers the worker with the right scope; Chromium's `Page.getAppManifest` reports
  no errors, `Page.getInstallabilityErrors` none; Reset → "Offline copies" unregistered the worker but left
  the caches then — fixed at integration (see below).

Option `--route path=file` (repeatable) serves a local file at `<base><path>` before the first navigation
(like `--site-config`, it blocks service workers unless `--keep-sw`):

```sh
node tools/browser-check.mjs --route site/modules/my/index.js=../my-module.js   # a site module outside the tree
```

## Deviations from the original and why

| Original | Port | Why |
|---|---|---|
| hard-coded `SHELL` list, `cache.addAll` | crawl from the module list, per-file fetch with `allSettled` | modules are optional; one missing file made the install fail |
| every navigation in scope served from the shell cache | only `<base>` / `<base>index.html`, top-level | at a root install every page and iframe of the site overwrote the cached desktop |
| every in-scope GET into the shell cache | only the desktop's own folders | unbounded cache at a root install |
| fixed names `jpkdesk-shell-v4`, `jpkdesk-pages`; activation deleted every other cache | `<namespace>:<base>:<version>-<hash>`, deletes only its own | several desktops/apps per origin |
| no timeout | `offline.timeoutMs` | a hanging network no longer blocks offline-capable start |
| `cache.put` awaited before answering | inside `waitUntil` | faster answers |
| — | navigation preload | no double request for navigations |
| — | `pwa.enabled: false` unregisters | a clean way out |
| manifest `id`/`start_url`/`scope` `/desktop/`, root-absolute icons, German site description | relative `./`, own icons, neutral English text, no `id` | any install path; `id` resolves against the origin and would collide |
| `.htaccess` edits of the inherited root policy (`Header edit`) | complete standalone header sets for five servers | portable |
| `data/` for sealed files | `site/vault/` (config `vault.dir`) | the port's layout |
| the hosts of the original's remote fortune API and DoH resolver always allowed | opt-in comments only | services are off by default |
| sealed vault files (`data/*.bin`) fell into the shell cache like any in-scope GET, so a kept vault login resumed offline | `vault.dir` is never cached | sealed, credential-derived files stay out of Cache Storage; matches the original's own intent ("offline (never cached) → just stay locked") and the vault module's offline behaviour |
| every answer `200`/`basic` stored | answers with `Cache-Control: no-store`/`private` are passed on, never stored | at a root install the worker controls every page of the site |

Not ported: the `.htaccess` comments about the original site's root policy and the original site's check URL.

## Integration

Applied at integration:

- `index.html` links `<link rel="manifest" href="manifest.webmanifest">` and
  `<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">` after the favicon, so
  `src/panels/install.js` registers the worker.
- `src/panels/install.js` (`forgetOffline`, reset group "Offline copies") deletes the caches of the worker's
  naming scheme for this folder — the pattern `sw.js` uses on activation, whatever the namespace
  (`ownCaches(root)`) — and unregisters only the registration whose scope is exactly `Desk.env.root`.
  It also deletes the legacy caches of `config.offline.legacyCaches`. `install.js` additionally sweeps
  them ~30 s after `controllerchange` and, when it does not register the worker (`pwa.enabled: false`),
  3 s after each start (`scheduleSweep()`; never while a worker at another script URL controls the page).
- `docs/ARCHITECTURE.md` §14 documents the cache names; `site/config.js` comments the `offline` keys;
  the README's Deployment section has short per-server instructions (where each file goes, what to
  replace, modules / `AllowOverride`, how to switch on the commented lines for online services, a
  start/check command each) plus the policy and checks, and links `docs/deploy.md` for the details.
- `tools/build-pwa-icons.mjs` (`npm run icons:pwa`) renders the PNG icons from the SVG sources with
  playwright-core: `favicon.svg` → `icon-192/512.png`, `maskable.svg` → `maskable-192/512.png` and
  `apple-touch-icon.png` (180 px). Run it after a change to either SVG and commit the PNGs.
