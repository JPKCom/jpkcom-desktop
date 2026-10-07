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
| `fortune.dir` (with app `fortune`; same folder rule), `notify.feeds` (with module `notify`), `wallpaper.images[].src` | precached data files; fortunes for the whole language chain (offered languages, their base languages, `defaultLang`, `en`) like the app's own fallback |
| `pwa.enabled` | `false` → no precache; a still registered worker deletes its caches and unregisters itself |
| `offline.maxPages` (0–1000), `offline.timeoutMs` (500–60000) | Reader page cache size; network timeout before a cached copy answers |

## Storage

Cache Storage only (no localStorage keys):

- `<namespace>:<base>:<VERSION>-<hash>` — the shell; `<base>` is the installation path (`/`, `/desktop/`),
  `<hash>` an FNV-1a hash of the precache-relevant config (modules, apps, languages, paths), so a new module
  list builds a fresh cache and the old one is deleted on activation.
- `<namespace>:<base>:pages` — Reader pages (kept across versions).

On activation (and when `pwa.enabled` is `false`) the worker deletes every cache of its own naming scheme
for its own folder, whatever the namespace — `^[a-z][a-z0-9-]{0,23}:<base>:(<version>-<8 hex>|pages)$`.
One folder holds one installation, so these are all its own, including the caches of an earlier namespace
after `config.namespace` changed. Other installations (other `<base>`) and other apps on the same origin
keep their caches.

## Service worker behaviour

- **Precache** (install): a crawl, not a hand-kept list. Roots: `index.html` (`<script src>`, `<link href>`),
  a small safety list (boot scripts, core CSS, manifest, icons), `src/<core part>/index.js`, every configured
  module/app, `site.data`, data files. It follows static/dynamic imports with literal specifiers,
  descriptor `styles: [...]` and `i18n: [...]`, CSS `@import`/`url()`, then adds `_meta`, `core` and every
  found namespace for the language chain — from `locales/<lang>/<ns>.js`, or, for a file whose descriptor
  declares `locales: '<folder>/'` (same rule as `src/core/modules.js`: relative, ends in `/`, stays inside
  the module's folder; anything else is ignored), from `<folder><lang>/<ns>.js` next to it instead (a site
  app like Hello keeps its texts offline; no request for a core `locales/<lang>/<ns>.js` that does not
  exist). Each file is fetched once with `cache: 'no-cache'`, put under its
  path (query dropped) and scanned from a clone; `Promise.allSettled` per level, 20 s per file, at most 800
  files. Against this project with the shipped config: 199 files (exactly the configured modules; the
  disabled holidays/weather/vault are left out); no misses. The crawl does not skip comments, so a
  descriptor example in a comment must not quote file names (that is why the one in `modules.js` writes
  `styles: [<own .css files>]`).
- **Routing** (`classify`): only same-origin `GET` without `Range`; `pwa.enabled` false → nothing.
  - top-level navigation to `<base>` or `<base>index.html` → shell, one copy under `<base>` (any query);
  - any other navigation in scope (iframes of web apps, other pages of the site at a root install) → the
    navigation preload response, or `fetch`; offline a Reader copy of the same URL if there is one; when the
    browser has no navigation preload the request is not intercepted at all;
  - non-navigation `Accept: text/html` fetches (the Reader; also outside `<base>`) → pages cache, query kept;
  - files under `index.html`, `manifest.webmanifest`, `assets/icons/`, `src/`, `locales/`, `site/` (and site
    module folders) → shell cache, revalidated (`cache: 'no-cache'`);
  - never: other origins, `sw.js`, `vault.dir`, everything else (e.g. `/tools/` of the surrounding site).
  - A site module whose file sits at the installation root (`src: 'demo.js'`) or above it (`'../demo.js'`)
    adds only that file to the shell, not its folder — otherwise the whole site would be cached. The same
    holds for a fortune folder at or above the root (only `<dir><lang>.json` of the language chain).
- **Strategy**: network first with `offline.timeoutMs`; the network answer is stored inside `waitUntil`
  (only `200`, `type: 'basic'`, and never an answer with `Cache-Control: no-store` or `private` — at a root
  install other scripts of the site may fetch personal HTML fragments; the precache skips such files too;
  redirected responses are re-wrapped so they may answer a navigation); after
  the timeout a cached copy answers while the late network answer still refreshes it; without a copy the
  request waits for the network. Pages: re-inserted on refresh, trimmed oldest-first to `maxPages`.
- **Lifecycle**: `skipWaiting()` after the precache; activation deletes own older caches, enables navigation
  preload, `clients.claim()`.

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
- `docs/ARCHITECTURE.md` §14 documents the cache names; `site/config.js` comments the `offline` keys;
  the README's Deployment section has short per-server instructions (where each file goes, what to
  replace, modules / `AllowOverride`, how to switch on the commented lines for online services, a
  start/check command each) plus the policy and checks, and links `docs/deploy.md` for the details.
- `tools/build-pwa-icons.mjs` (`npm run icons:pwa`) renders the PNG icons from the SVG sources with
  playwright-core: `favicon.svg` → `icon-192/512.png`, `maskable.svg` → `maskable-192/512.png` and
  `apple-touch-icon.png` (180 px). Run it after a change to either SVG and commit the PNGs.
