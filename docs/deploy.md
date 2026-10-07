# Deploying JPKCom Desktop

> How to put the desktop on a web server: which files, which headers, which server settings.
> © Jean Pierre Kolb — MIT License.

JPKCom Desktop is a set of static files. There is no build step and no server-side code: any web
server that can send a few headers will do. This page explains what the server has to do and ships
complete, tested configurations for five servers.

Contents

1. [Quick start](#1-quick-start)
2. [What to upload](#2-what-to-upload)
3. [At the web root or in a sub-folder](#3-at-the-web-root-or-in-a-sub-folder)
4. [HTTPS](#4-https)
5. [Security headers](#5-security-headers)
6. [Online services: opening the policy step by step](#6-online-services-opening-the-policy-step-by-step)
7. [MIME types](#7-mime-types)
8. [Caching](#8-caching)
9. [Folders that need special care](#9-folders-that-need-special-care)
10. [Server configurations](#10-server-configurations) — including [GitHub Pages](#github-pages)
11. [Offline use and installation (PWA)](#11-offline-use-and-installation-pwa)
12. [Checking a deployment](#12-checking-a-deployment)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Quick start

1. Edit `site/config.js` and `site/apps.js` (see the comments in both files) and check them with
   `npm run validate` (`tools/validate-manifest.mjs`: ids, references, urls, icons, texts per language).
2. Upload the runtime files ([§2](#2-what-to-upload)) to a folder on your server, either the web root
   or a sub-folder such as `/desktop/`.
3. Copy the configuration for your server from [`docs/server/`](server/) and replace `example.org`,
   the root folder and (where needed) the certificate paths:

   | Server | File |
   |---|---|
   | Apache 2.4 | [`server/apache.htaccess`](server/apache.htaccess) → `.htaccess` in the desktop's folder |
   | nginx | [`server/nginx.conf`](server/nginx.conf) → `/etc/nginx/conf.d/` |
   | Caddy 2 | [`server/Caddyfile`](server/Caddyfile) |
   | Ferron 3 | [`server/ferron.conf`](server/ferron.conf) → `/etc/ferron/ferron.conf` |
   | Ferron 2 | [`server/ferron.kdl`](server/ferron.kdl) → `/etc/ferron.kdl` |
   | static-web-server 2 | [`server/static-web-server.toml`](server/static-web-server.toml) |

4. If your site switches on online services (weather, DNS lookups, remote fortunes), add their hosts to
   the Content-Security-Policy ([§6](#6-online-services-opening-the-policy-step-by-step)).
5. Serve it over HTTPS and check the headers ([§12](#12-checking-a-deployment)).

To try the desktop locally first, `npm run serve` starts a server with the same headers
(`tools/serve.mjs`, see `--help` in its header for `--base`, `--connect`, `--frame`, `--wasm`,
`--geolocation`). It speaks plain HTTP and therefore sends the policy without `upgrade-insecure-requests`.

## 2. What to upload

Upload these files and folders, keeping their layout:

```
index.html
manifest.webmanifest
sw.js
assets/        the favicon and the app icons
locales/       the texts of every language
site/          your configuration, manifest, theme (site/theme.css) and content
src/           the desktop itself
LICENSE        (please keep it with the files)
CREDITS.md
```

Do **not** upload `node_modules/`, `tools/`, `tests/`, `docs/`, `.git/`, `package.json` or
`package-lock.json` — the desktop does not need them, and the configurations below do not hide them
for you (only dotfiles are refused everywhere). `site/vault/` holds sealed bookmark files only when you
use the vault module (they are created with `tools/seal-vault.mjs`; never upload its source JSON).

## 3. At the web root or in a sub-folder

Both work without changes to the files: every path inside the desktop is relative to the folder that
holds `index.html` (`https://example.org/` or `https://example.org/desktop/`).

- **The trailing slash matters.** `https://example.org/desktop` must redirect to
  `https://example.org/desktop/` — otherwise the browser resolves `site/…`, `sw.js` and the manifest
  against `/` and nothing loads. Every configuration below does this (most servers do it for directories
  on their own; the snippets keep it switched on).
- **The service worker's scope is the installation folder.** At the web root it sees the requests of
  the whole site, but it only keeps the desktop's own files (`index.html`, `manifest.webmanifest`,
  `assets/icons/`, `src/`, `locales/`, `site/`) and the pages the Reader opened; every other page of the
  site passes through untouched ([§11](#11-offline-use-and-installation-pwa)).
- **Several desktops on one origin** (for example `/desktop/` and `/demo/`) need different
  `namespace` values in their `site/config.js`, so that their stored settings, caches and events do not
  collide. Cache names already include the folder.
- Paths in `site/config.js` and `site/apps.js` are relative to the installation folder; absolute paths
  (`/docs/…`) point to other content of the same site.

**Same origin = full trust.** Every page served from the desktop's origin (scheme, host and port) —
framed in a `web` window or opened directly in a tab — can read and change the desktop's stored data:
settings, notes, todos, the editor draft, the terminal history. It can also use a vault key that a
visitor chose to keep (IndexedDB) to decrypt the vault, and when framed it can drive the desktop
through its parent window. A sub-folder does not separate anything. So serve only fully trusted code on
that origin. Third-party games, demos and other foreign HTML belong on another origin (a subdomain such
as `apps.example.org`, added to `frame-src`, [§6](#6-online-services-opening-the-policy-step-by-step)),
or the app gets `sandbox: 'allow-scripts'` in `site/apps.js` (per app, or for every `web` window with
`wm.iframe.sandbox` in `site/config.js`) — **never** together with `allow-same-origin`, which lets
the framed page lift its own sandbox. The sandbox route has a cost: the framed page gets an opaque
origin, so its own storage does not persist, the desktop can no longer read its address and title (the
address bar and window title keep the app's defaults), and the desktop's keyboard shortcuts do not reach
into it.

## 4. HTTPS

The service worker (offline use, installation), the vault (Web Crypto) and "My location" for the
weather (geolocation) only work in a **secure context**: HTTPS, or `http://localhost` /
`http://127.0.0.1` during development. Over plain HTTP the desktop still runs, without those features.

The configurations send `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no `preload`
— that is a decision for the owner of the domain) and add `upgrade-insecure-requests` to the policy.
Caddy and Ferron obtain certificates themselves; for nginx, Apache and static-web-server point them at
your certificate files or put them behind a proxy that terminates TLS.

## 5. Security headers

The desktop runs under a strict policy: no inline scripts, no inline styles, no `eval`, no third-party
code. These headers are the contract (`docs/ARCHITECTURE.md` §5); every configuration sends all of them:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Why each part is there:

| Directive / header | Reason |
|---|---|
| `script-src 'self'`, `style-src 'self'` | everything is a file of the desktop; styles are set through the CSSOM, never as attributes |
| `img-src … data: blob:` | generated wallpapers and icons, images dropped from the visitor's device |
| `media-src 'self' blob:` | the audio and video players play the visitor's own files through blob URLs (nothing is uploaded) |
| `connect-src 'self' blob:` | the viewer reads dropped files through blob URLs; online services are added per site ([§6](#6-online-services-opening-the-policy-step-by-step)) |
| `frame-src 'self'`, `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN` | windows show pages of the same site in iframes — `DENY` would break them |
| `worker-src 'self'`, `manifest-src 'self'` | the service worker and the web app manifest |
| `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | standard hardening |
| `Permissions-Policy` | nothing the desktop does not use; geolocation only when the site offers it ([§6](#6-online-services-opening-the-policy-step-by-step)) |
| `Cross-Origin-Opener-Policy: same-origin` | windows opened by the desktop cannot reach back into it (links open with `noopener` anyway) |

Pages that the desktop shows in its windows (the Reader's content, same-origin `web` apps) are fetched
or framed under the policy of **their** responses. If you serve your other site content with a stricter
policy (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), it cannot open inside a window — the desktop
then opens it in a new tab. A framed page of the same origin is fully trusted: it reaches the desktop's
data and its parent window ([§3, "Same origin = full trust"](#3-at-the-web-root-or-in-a-sub-folder)).

## 6. Online services: opening the policy step by step

Everything that talks to another server is **off** by default (`services` in `site/config.js`), and each
visitor still has to agree before the first request. When you switch a service on, its host must also be
allowed in `connect-src` — otherwise the browser blocks the request. Each configuration lists these
extensions as commented lines next to the active policy; copy the policy line, add what you need, and
replace the active one.

| Feature | `site/config.js` | Add to the policy |
|---|---|---|
| Weather, provider `open-meteo` (worldwide) | `services.weather: true`, `weather.provider: 'open-meteo'` | `connect-src https://api.open-meteo.com` |
| Weather, provider `brightsky` (Germany) | `services.weather: true`, `weather.provider: 'brightsky'` | `connect-src https://api.brightsky.dev` |
| "My location" for the weather | `services.geolocation: true` | `Permissions-Policy: … geolocation=(self) …` |
| `dig`, `host`, `nslookup` in the terminal | `services.dns: true`, `terminal.doh: { url: 'https://dns.google/resolve', name: 'dns.google' }` | `connect-src https://dns.google` (the host of `terminal.doh.url`) |
| Fortune app, remote `jokeapi` | `services.fortune: true`, `fortune.remote: 'jokeapi'` | `connect-src https://v2.jokeapi.dev` |
| Fortune app, remote `uselessfacts` | `services.fortune: true`, `fortune.remote: 'uselessfacts'` | `connect-src https://uselessfacts.jsph.pl` |
| Full-text search with Pagefind | `search.pagefind: { path: … }` | `script-src 'wasm-unsafe-eval'` (WebAssembly; nothing else needs it) |
| `web` apps from another origin | an app with `kind: 'web'` and a foreign `url` | `frame-src https://apps.example.org` |

Example — weather (Open-Meteo) and the DNS commands switched on:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests
```

Add only what you switch on: an allowed host that nobody uses is an open door for nothing. (The
configurations also name `https://geocoding-api.open-meteo.com` in a separate comment: only a place
search by name would need it — the shipped weather providers never call it.) The
settings section "Online services" of the desktop lists the services your site offers and their hosts.
For a local test the same extensions exist as `npm run serve -- --connect https://api.open-meteo.com,https://dns.google --frame https://apps.example.org --wasm --geolocation`.

## 7. MIME types

| Extension | Content-Type | Why it matters |
|---|---|---|
| `.js`, `.mjs` | `text/javascript` | ES modules refuse to load with a wrong type (`nosniff`) |
| `.webmanifest` | `application/manifest+json` | many default MIME tables do not know it |
| `.css` | `text/css` | |
| `.json` | `application/json` | feeds, fortunes |
| `.svg` | `image/svg+xml` | icons |
| `.bin` | `application/octet-stream` | sealed vault files |

Text types (HTML, JS, CSS, JSON, the manifest) are sent with `charset=utf-8` by every configuration
and by `npm run serve`. The configurations also set the types that servers commonly get wrong (nginx still says `application/javascript` for `.js`, which browsers accept, but `text/javascript`
is the registered type).

## 8. Caching

The files carry no version in their names, so the configurations send `Cache-Control: no-cache` for
everything except images, fonts and media: browsers keep their copies but revalidate them on every use
(`ETag` / `Last-Modified` → `304 Not Modified`, a few hundred bytes). An update is therefore visible on the
next reload, and the service worker never holds on to an old file. Images, fonts and media get
`public, max-age=86400` (one day) — after replacing a wallpaper or icon under the same name, visitors may
see the old one for up to a day.

Do not put long `Expires`/`max-age` values on `.js`, `.css`, `.json`, `.html`, `manifest.webmanifest` or
`sw.js`: the ES modules import each other by name, so a stale copy of one file next to fresh copies of
the others can break the desktop. The Apache snippet removes an `Expires` header that a host-wide
`mod_expires` rule may add.

## 9. Folders that need special care

- **No directory listings anywhere.** The sealed vault files are named after a hash of the credentials:
  a listing would hand out the list of valid file names. All configurations switch listings off (Caddy:
  no `browse`; static-web-server: `directory-listing = false`; nginx: `autoindex off`; Apache:
  `Options -Indexes`; Ferron: `directory_listing` off).
- **`site/vault/`**: always revalidated (a re-sealed file must not come from a cache) and
  `X-Robots-Tag: noindex, nofollow, noarchive`. The service worker never caches these files.
- **`site/data/`**: feeds and fortunes, served like the rest (no listing, revalidated).
- **Dotfiles** (`.git`, `.env`, `.htaccess`, …) are answered with 404 everywhere. Apache, nginx, Caddy
  and Ferron keep `/.well-known/` reachable (certificate challenges and similar); static-web-server has
  no such exception — `ignore-hidden-files` refuses `/.well-known/` as well (see its section in [§10](#10-server-configurations)).

## 10. Server configurations

All files live in [`docs/server/`](server/). Each one is complete on its own (no inherited headers) and
works for an installation at the web root and in a sub-folder without changes: the rules match the
desktop's paths wherever they are. Replace `example.org`, the root folder and certificate paths.

They were validated with the server's own checker where it has one, and by running each server in a
container and requesting the desktop at `/` and at `/desktop/`: redirect of `/desktop`, all headers and
the exact policy, MIME types, `Cache-Control` per file type, `304` on a conditional request, no listing of
`site/vault/`, `site/data/`, `src/`, `404` for dotfiles, `X-Robots-Tag` on vault files.

| File | Server | Validated with |
|---|---|---|
| [`server/apache.htaccess`](server/apache.htaccess) | Apache httpd 2.4.10+ | Apache 2.4.69 (`httpd -t`; requests over HTTP and HTTPS) |
| [`server/nginx.conf`](server/nginx.conf) | nginx 1.19+ (1.25.1+ for `http2 on`) | nginx 1.31.6 (`nginx -t`; requests) |
| [`server/Caddyfile`](server/Caddyfile) | Caddy 2.7+ | Caddy 2.11.7 (`caddy validate`, `caddy fmt`; requests) |
| [`server/ferron.conf`](server/ferron.conf) | Ferron 3 | Ferron 3.0.0-rc.9 (`ferron validate`, `ferron doctor`; requests) |
| [`server/ferron.kdl`](server/ferron.kdl) | Ferron 2 | Ferron 2.8.1 (requests) |
| [`server/static-web-server.toml`](server/static-web-server.toml) | static-web-server 2.x | static-web-server 2.44.0 (start with TLS + HTTP redirect; requests) |

### Apache (`apache.htaccess`)

- Copy it as `.htaccess` into the folder that holds `index.html`. It needs `mod_headers`, `mod_mime` and
  `mod_alias` (Apache 2.4.10+ for `expr=` in `Header`); `mod_dir`, `mod_deflate`, `mod_brotli` are used
  when present. Dotfiles are refused with `RedirectMatch 404` (`mod_alias`, part of every standard
  Apache) on purpose without `<IfModule>`: should the module be missing, Apache answers `500` instead of
  serving `.git/` or `.env`.
- The host must allow the directives: `AllowOverride FileInfo Indexes Options=Indexes` (or `All`) for
  that folder. Without it Apache answers `500` — check the error log.
- `upgrade-insecure-requests` and HSTS are added only when `%{HTTPS}` is on. Behind a proxy that
  terminates TLS, change both conditions to `"expr=%{HTTP:X-Forwarded-Proto} == 'https'"`.
- Security headers that a parent `.htaccess` or the server config sets are replaced, not merged — two
  policies would both apply (`Header unset` removes the copies of plain `Header set`, `Header always set`
  writes the desktop's).
- In a `<VirtualHost>` or `<Directory>` block the same directives work as they are.

### nginx (`nginx.conf`)

- A complete site file for `/etc/nginx/conf.d/`: two `map` blocks (read inside `http { }`), an HTTP →
  HTTPS redirect and the HTTPS server.
- **Every header is set once at server level.** In nginx an `add_header` inside a `location` removes all
  `add_header` lines of the server block for that location; the values that depend on the path
  (`Cache-Control`, `X-Robots-Tag`) therefore come from the maps. When you add locations of your own,
  do not put `add_header` into them (or repeat the whole set there).
- No `try_files $uri $uri/` for the desktop's folder: it would serve `/desktop` without redirecting to
  `/desktop/`, and every relative path of the page would break. nginx redirects directories itself;
  `absolute_redirect off` keeps that redirect relative (correct behind proxies).

### Caddy (`Caddyfile`)

- Automatic HTTPS: Caddy fetches the certificate and redirects HTTP to HTTPS.
- `file_server` without `browse` lists no directories and redirects `/desktop` to `/desktop/` itself.
- `?Cache-Control "no-cache"` sets the default only where the rule for images did not set a value,
  whichever order Caddy runs the `header` handlers in.
- **Keep deleting (`-`) and default (`?`) fields out of the main `header { … }` block.** A block that
  contains one is deferred as a whole until a handler writes the response — and `file_server`'s own error
  answers (any missing file, a wrong vault password) never pass through it, so they would go out without
  the security headers. That is why `header -Server` and `header ?Cache-Control` stand on their own, and
  `handle_errors` answers errors itself (the security headers set before stay, the `Server` header goes,
  and the answer is `text/plain` even for a missing `.json`, `.mjs` or `.webmanifest`).
- Caddy's own MIME table sends `.json` without a charset and does not know `.webmanifest`; the
  `@json`, `@manifest` and `@modules` lines set those types with `charset=utf-8`.

### Ferron 3 (`ferron.conf`) and Ferron 2 (`ferron.kdl`)

- Ferron 3 (currently released as release candidates) uses its own configuration format
  (`/etc/ferron/ferron.conf`, `ferron validate -c …`); Ferron 2, the stable line, uses KDL
  (`/etc/ferron.kdl`). Both files do the same.
- Both obtain the certificate for a host name automatically and redirect HTTP to HTTPS.
- Ferron 2: a block that sets a directive replaces every inherited entry of that directive — the
  conditional block for the vault therefore repeats the header snippet (`use "DESK_HEADERS"`).

### static-web-server (`static-web-server.toml`)

- Start with `static-web-server --config-file /etc/static-web-server/config.toml`.
- The built-in `security-headers` and `cache-control-headers` are switched off: their policy and caching
  do not fit; the `[[advanced.headers]]` entries set everything. Every entry whose glob matches adds its
  headers, a later match overrides the same header of an earlier one.
- TLS with your certificate files (`http2 = true`, plus the HTTP → HTTPS redirect), or `http2 = false` and
  another port behind a proxy that terminates TLS.
- `ignore-hidden-files = true` refuses **every** dotfile and dot-folder, `/.well-known/` included (checked
  with 2.44.0: 404). Obtain certificates with a DNS challenge or through the TLS proxy in front of it; if a
  file under `/.well-known/` must be served, set `ignore-hidden-files = false` and make sure the document
  root holds no other dotfiles (no `.git`, no `.env`).

### GitHub Pages

No server configuration here: the workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
publishes the repository on every push to `main` (and when started by hand under *Actions*). It copies
the checked-out files into a folder without `.git`, `.github`, `node_modules`, `tests` and `tools`, adds
the policy to that copy of `index.html` and deploys the folder. There is no build step: the result is
exactly what the repository holds — for this repository the live demo at
<https://jpkcom.github.io/jpkcom-desktop/> with the shipped example site and every online service off.
Unlike [§2](#2-what-to-upload), the demo therefore also publishes `docs/`, `package.json`,
`package-lock.json` and the top-level files (README, CHANGELOG …). They hold nothing secret, and the demo
stays a complete copy of the repository.

**Setting it up (once):**

1. *Settings → Pages → Build and deployment → Source:* "GitHub Actions".
2. In a copy made from the template, also *Settings → Secrets and variables → Actions → Variables:*
   a repository variable `PAGES` with the value `true`. Without it the job is skipped (no failing runs),
   so copies publish nothing until their owner opts in.
3. Push to `main` or start the workflow by hand. The site appears at `https://<user>.github.io/<repo>/`
   — a sub-folder installation, which works without changes ([§3](#3-at-the-web-root-or-in-a-sub-folder)).

**The policy as a `<meta>` tag.** GitHub Pages cannot send response headers of your choice. The workflow
therefore writes the policy of [§5](#5-security-headers) into the published `index.html` as
`<meta http-equiv="Content-Security-Policy">`, directly after `<meta charset>` and before every
stylesheet and script (a `<meta>` policy only applies to what comes after it); the job fails if it cannot
place the tag there. The repository's `index.html`
stays unchanged. The tag carries the policy **without** `frame-ancestors`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

Its limits, compared with a server of your own:

- **No `frame-ancestors`** — browsers ignore it in a `<meta>` policy and log an error, so the workflow
  leaves it out. Together with the missing `X-Frame-Options`, any other site can show the desktop in a
  frame.
- **No `Permissions-Policy`**, and none of the other headers of §5 (`X-Content-Type-Options`,
  `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`): the browser's defaults
  apply.
- **Only the desktop page is covered.** The service worker and other pages of the site (for example a
  same-origin `web` app) are delivered without a policy.
- **One origin for all Pages sites of an account.** Every site under `https://<user>.github.io` shares
  that origin and can read the others' stored data, including a kept vault key
  ([§3](#3-at-the-web-root-or-in-a-sub-folder): same origin = full trust). Host only code you trust
  there; a separate `namespace` per desktop only keeps their settings, caches and events from colliding.
- **Caching is GitHub's**, not the `no-cache` of [§8](#8-caching): right after a deployment a browser may
  still use an older copy for a few minutes.

For a public site with the full set of headers, use one of the configurations above. If your copy
switches on online services, add their hosts ([§6](#6-online-services-opening-the-policy-step-by-step))
to the policy in the workflow file as well.

### Other servers

Any server works that can (1) serve static files with the MIME types of [§7](#7-mime-types), (2) send the
headers of [§5](#5-security-headers) with every response, (3) redirect a directory without the trailing
slash, (4) list no directories, (5) send `Cache-Control` as in [§8](#8-caching) and (6) refuse dotfiles.

## 11. Offline use and installation (PWA)

With `pwa.enabled: true` (the default), HTTPS and `<link rel="manifest" href="manifest.webmanifest">` in
`index.html` (shipped; remove it only if you do not upload the PWA files), the desktop registers `sw.js` once the page has loaded and can be installed as an app
(Settings → General → "Install as an app", or the browser's own menu).

**The web app manifest** (`manifest.webmanifest`) is a static file: edit it when you rebrand the desktop.

| Field | Default | Notes |
|---|---|---|
| `name`, `short_name` | `JPKCom Desktop`, `JPK Desktop` | keep them in line with `brand.name` / `brand.shortName` |
| `description`, `lang` | English | one manifest serves every language |
| `start_url`, `scope` | `./` | relative to the manifest: works at the root and in a sub-folder |
| `theme_color` | `#1c2935` | keep it equal to `brand.themeColor` (`<meta name="theme-color">`) |
| `background_color` | `#0c1925` | the splash screen while the installed app starts |
| `icons` | `assets/icons/` | 192/512 px PNG and SVG, each as `any` and `maskable`; to use your own, replace `favicon.svg` and `maskable.svg` and run `npm run icons:pwa` (`tools/build-pwa-icons.mjs` renders the PNGs, including `apple-touch-icon.png`) |

**`index.html`** is static as well: its site-specific lines are what crawlers, link previews and
visitors without JavaScript see — the desktop overwrites only some of them at runtime. Edit them when
you rebrand or change the languages:

| Line | Default | Notes |
|---|---|---|
| `<html lang="en" dir="ltr">` | `en`, `ltr` | `defaultLang` and its direction (runtime sets the visitor's language) |
| `<title>`, `<h1 id="desk-title">` | `JPKCom Desktop` | `brand.name` (runtime overwrites both) |
| `<meta name="description">` | English | no-JS and crawler text, in the default language |
| `<meta name="apple-mobile-web-app-title">` | `JPK Desktop` | keep equal to `brand.shortName` (runtime overwrites it from there) and the manifest's `short_name` |
| `<meta name="theme-color">` | `#1c2935` | equal to `brand.themeColor` (see the manifest table) |
| `<noscript>` | one `<p lang="en">`, one `<p lang="de">` | one `<p lang="xx">` per offered language; drop the ones you do not ship |

`<meta name="author">` and `generator` are the project credit — please leave them.

The shipped icons, the `jpk` glyph, the `jpkcom` logo, the default terminal art and the wallpaper
motifs `author-monogram`/`author-emblem` show the JPK monogram and the JPKCom logo. They are not MIT:
you may show them unchanged as the default brand, but not as your own logo
([CREDITS.md](../CREDITS.md#brand-assets-not-mit)). For your own identity, replace them through
`brand.glyph`, `brand.logo`, `brand.asciiLogo`, your own icon files and `wallpaper.motifs`.

There is deliberately no `id`: browsers resolve it against the origin, so two installations on one
origin would share an identity. Without it the identity is the `start_url`, which includes the folder.
Some mobile browsers take the home-screen icon not from the manifest but from
`<link rel="apple-touch-icon">` in `index.html`: `assets/icons/apple-touch-icon.png` (180 × 180).

**The service worker** (`sw.js`, a classic script at the installation root):

- *Network first, always.* Online you get the deployed files; offline — or when the network takes longer
  than `offline.timeoutMs` (default 4000 ms) while a copy exists — the last good copy answers. A late
  network answer still refreshes the copy.
- *What it keeps:* the desktop itself (one copy of `index.html` whatever the query string, the manifest,
  `assets/icons/`, `src/`, `locales/`, `site/` without the vault folder) and up to `offline.maxPages`
  (default 80) pages the Reader opened; the oldest go first.
- *What it never touches:* requests to other origins (online services), anything but `GET`, range
  requests (media seeking), answers sent with `Cache-Control: no-store` or `private` (mark personal or
  logged-in pages of your site that way — at a root install the worker sees every page), vault files, and navigations other than the desktop's own index — pages of
  the rest of the site and iframes of web apps go to the network as usual (they only reuse the
  navigation preload request, so there is no extra request).
- *Precache:* at installation it reads `site/config.js` (`importScripts`), starts at `index.html`, the
  boot scripts and the `index.js` of every core part, module and app in the configuration, and follows
  their imports, `styles: [...]`, `i18n: [...]`, stylesheet `url()`s, plus the strings of every offered
  language. Each file is fetched on its own; a missing file never breaks the installation. Whatever this
  misses (for example files a module loads with a computed name) is kept the first time the page loads it.
- *Updates:* browsers check `sw.js` **and** `site/config.js` for changes on every visit. A changed module
  list, language list or namespace installs a new service worker, which builds a fresh copy and deletes
  this installation's older caches — and only those (`<namespace>:<folder>:<version>`, `<namespace>:<folder>:pages`;
  for its own folder under any namespace, so changing `namespace` leaves no orphaned copies behind).
- *Switching it off:* set `pwa: { enabled: false }`. The desktop stops registering the worker, and a
  worker that visitors still have from before deletes its caches and unregisters itself on their next
  visit. Visitors can also remove the offline copies themselves: Settings → Reset → "Offline copies".

`offline: { maxPages, timeoutMs }` in `site/config.js` tunes the page cache (0 switches it off) and the
network timeout (500–60000 ms).

## 12. Checking a deployment

```sh
# Headers of the desktop page
curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-|strict|referrer|cross-origin)'

# The trailing slash redirect (expect 301/308 with Location: /desktop/)
curl -sI https://example.org/desktop | grep -iE '^(HTTP|location)'

# MIME types of a module, the manifest and the service worker
curl -sI https://example.org/desktop/src/boot/main.js | grep -i '^content-type'      # text/javascript
curl -sI https://example.org/desktop/manifest.webmanifest | grep -i '^content-type'  # application/manifest+json
curl -sI https://example.org/desktop/sw.js | grep -iE '^(content-type|cache-control)'

# No listing of the vault folder (expect 403 or 404)
curl -s -o /dev/null -w '%{http_code}\n' https://example.org/desktop/site/vault/

# Error answers carry the headers too (expect 404 with content-security-policy and nosniff)
curl -sI https://example.org/desktop/does-not-exist.js | grep -iE '^(HTTP|content-security|x-content)'

# Dotfiles are refused (expect 404)
curl -s -o /dev/null -w '%{http_code}\n' https://example.org/desktop/.git/config
```

In the browser: open the developer tools, reload, and look at the console — a blocked request shows up
as a CSP violation that names the directive. *Application → Manifest* shows the parsed manifest and its
icons; *Application → Service workers* the worker and its scope; *Application → Cache storage* the copies.

## 13. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Blank desktop, console: "Failed to load module script … MIME type" | `.js` served as `text/plain` or `application/octet-stream`: set the MIME types of [§7](#7-mime-types) |
| Blank desktop at `/desktop`, works at `/desktop/` | the server does not redirect to the trailing slash ([§3](#3-at-the-web-root-or-in-a-sub-folder)) |
| Console: "Refused to connect to https://api…" | the service is on in `site/config.js` but its host is missing in `connect-src` ([§6](#6-online-services-opening-the-policy-step-by-step)) |
| "My location" does nothing | `Permissions-Policy` still says `geolocation=()`, or the page is not on HTTPS |
| A same-origin page will not open in a window | that page is sent with `X-Frame-Options: DENY` or `frame-ancestors 'none'` |
| Pagefind search fails with a WebAssembly error | add `'wasm-unsafe-eval'` to `script-src` |
| No "Install" offer, no offline mode | not HTTPS; the `<link rel="manifest">` is missing in `index.html`; `pwa.enabled` is `false` |
| An update does not show up | a long `Cache-Control`/`Expires` on `.js`/`.css` somewhere in front of the desktop (host defaults, a CDN): send `no-cache` ([§8](#8-caching)) |
| Apache answers 500 | `AllowOverride` does not allow the directives of the `.htaccess`, or `mod_headers` / `mod_alias` is not loaded ([§10](#apache-apachehtaccess)) |
| nginx: headers missing on some files | an `add_header` inside a `location` hides the server-level ones ([§10](#nginx-nginxconf)) |
