# Contributing to JPKCom Desktop

© Jean Pierre Kolb — MIT License

Thank you for helping. JPKCom Desktop is a desktop-style web interface in vanilla JavaScript — no build
step, no runtime dependencies, a strict Content Security Policy. Contributions are welcome as issues and
pull requests on <https://github.com/JPKCom/jpkcom-desktop>.

Before you write code, read the contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Every part of
the desktop codes against it, and every package has its detailed reference in
[`docs/packages/`](docs/packages/). A change to an interface (a descriptor field, a service, an event,
a config key, a storage key) **starts in the contract** and then goes into the code.

Security issues are not reported here — see [`SECURITY.md`](SECURITY.md).

## Setup

Node.js 24 or newer (`engines` in `package.json`; `.npmrc` refuses other versions). We recommend
[Socket Firewall Free](https://github.com/SocketDev/sfw-free) (`sfw`) in front of every npm command —
see [Supply chain](#supply-chain).

```sh
git clone https://github.com/JPKCom/jpkcom-desktop.git
cd jpkcom-desktop
sfw npm ci         # development tools only: @tabler/icons, playwright-core (exactly as in package-lock.json)
npm run serve      # http://127.0.0.1:8080/ with the production security headers
```

The desktop runs from the files as they are — edit, reload. It needs a web server (`file://` is not
supported); `tools/serve.mjs` sends the same headers as production, so what works there works behind the
real CSP. Useful options: `npm run serve -- --base /desktop/` (sub-folder install), `--port 9000`,
`--connect https://api.open-meteo.com` (an online service you switched on), `--frame https://…`,
`--wasm` (Pagefind), `--geolocation`. See the header of `tools/serve.mjs`.

Your own experiments with the configuration belong in `site/` — everything a site owner customises
lives there. Do not commit a changed example site unless the change is the point of the pull request.

## Rules

These are not style preferences; the CSP and the tests depend on them. The full list is
[`docs/ARCHITECTURE.md` §1, §5, §12, §13, §17](docs/ARCHITECTURE.md).

**No HTML strings.** No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
`setHTMLUnsafe`, `srcdoc` — anywhere. Build DOM with `h()` / `s()` from `src/core/dom.js` and
`textContent`; `h()` throws on those properties and on string `on*` handlers.

**Strict CSP.** No inline `<script>`, no `<style>` elements, no `style=""` attributes, no `eval`,
no `new Function`, no string timers. Set styles through CSSOM: `h('span', { style: { '--tint': v } })`.
External requests only through `Desk.net` (`getJson`/`getText`/`request`) with a `service` id, so the
site switch and the visitor's consent are checked.

**i18n for any number of languages.** Every user-visible string goes through `t('ns.key', params)` with
named placeholders, or through `L()` for manifest/config texts. Never assume two languages (no
`lang === 'de' ? … : …`, no `{ de, en }`-only lookups), never concatenate translated fragments into
sentences, format numbers and dates only with the i18n formatters, use plural objects for counts.
A new key goes into **every** shipped language (`locales/en/` is the reference; `locales/de/` too).

**Icons: Tabler only.** Use `'ti-<name>'` (outline) or `'tif-<name>'` (filled), written out in full as
a quoted literal (the icon scanner only sees literals). Check that the name exists in
`node_modules/@tabler/icons/icons/outline/` or `…/filled/`, then run `npm run icons` and commit the
regenerated `src/icons/tabler.js`. Icons are decorative; the control carries the accessible name.

**File header** in every source file (JS, CSS, tools, tests, locales; HTML as a comment after the doctype):

```js
/* JPKCom Desktop — <what this file does> — © Jean Pierre Kolb — MIT License */
```

The exception is pure brand artwork (`assets/icons/favicon.svg`, `maskable.svg`): its header says
`© 1996–2026 Jean Pierre Kolb — all rights reserved, not MIT (brand asset, see CREDITS.md)`.

**CSS layers.** Every stylesheet wraps all its rules in its layer — core parts their own
(`@layer wm { … }`, `shell`, `panels`), optional modules `@layer modules`, apps `@layer apps`. Phone
overrides go into the same file under `@layer compact { body.compact … }` (never an own media query for
that). Use the prefixes of §17, logical properties, nesting at most three levels deep, and tokens
instead of colour literals.

**Modules stay apart.** Optional parts talk through the bus, registries and services — never by
importing each other's internals. A missing optional module must never throw.

**Untrusted input.** Validate every config value, manifest entry and stored value (`store.getJson`
with a validator, the `V` helpers); warn and fall back, never crash.

**Neutral names.** No third-party product names for the desktop's own features — see the naming
glossary in [`docs/ARCHITECTURE.md` §4](docs/ARCHITECTURE.md#4-naming-glossary).

**Accessibility.** Keyboard operation, named controls, focus handling, `announce()` for live
messages, `prefers-reduced-motion` respected (`reduceMotion()`, `later()`).

**No invisible characters.** Bidi controls and zero-width characters are refused by
`tests/hygiene.test.mjs`; write them as `\u` escapes where they are meant.

## Checks to run

Run all of these before you open a pull request; CI runs the first four.

```sh
npm test                           # unit tests (node --test "tests/*.test.mjs")
npm run i18n:check                 # every language against English: keys, placeholders, plural forms
npm run icons:check                # src/icons/tabler.js matches the icons the sources use
node tools/validate-manifest.mjs   # site/apps.js against site/config.js (same as npm run validate)
npm run check:browser              # headless browser check under the production headers (below)
```

A quick self-check for the HTML-string rule (only comments and documentation text should match):

```sh
git grep -nE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|setHTMLUnsafe' -- src site index.html sw.js
```

New pure logic gets a unit test in `tests/` (every core module is importable in Node; tests use the
pure factories such as `createI18n`, `createStore`, `createRegistry`, `createRouter`, `buildConfig`).

## Supply chain

The desktop has no runtime dependencies; npm only brings two development tools. Their install is
hardened the way most npm supply-chain attacks are stopped:

- **`sfw npm …`** — [Socket Firewall Free](https://github.com/SocketDev/sfw-free) checks every package
  npm fetches and blocks known malware, typosquats and freshly published bad versions before they reach
  the disk. Run every npm command that installs or updates through it (`sfw npm ci`, `sfw npm install …`,
  `sfw npm audit`); `npm run …` and `npm test` fetch nothing and need no wrapper.
- **`.npmrc`** — `ignore-scripts=true` (no `preinstall`/`postinstall`/`prepare` script of a package ever
  runs; neither tool needs one — the headless browser comes from `npm run browsers`), `save-exact=true`
  (exact versions in `package.json`, no `^`/`~`: every update is a reviewed change) and
  `engine-strict=true` (Node.js as in `engines`).
- **`npm ci`, not `npm install`**, for a working copy: it installs exactly what `package-lock.json`
  records and never re-resolves.
- **No `npx`** in scripts and docs: package binaries run from `node_modules/.bin` through `npm run`
  (`npx` would fetch a missing or mistyped package on the fly).
- **`"private": true`** in `package.json` — nothing is ever published to the npm registry by accident.
- **CI** (`.github/workflows/`) pins every action to a full commit SHA (the tag in a comment), installs
  with `npm ci --ignore-scripts` and runs `npm audit signatures` (registry signatures and provenance).

Updating a tool:

```sh
sfw npm outdated                              # what is behind
sfw npm install --save-dev <package>@<version> # exact version (save-exact), lockfile updated
sfw npm audit && sfw npm audit signatures     # known advisories, signatures
npm test                                      # and the checks of this file
```

A new GitHub Action is pinned the same way: `uses: owner/action@<40-hex commit> # vX.Y.Z` (resolve the
tag with `git ls-remote https://github.com/owner/action.git refs/tags/vX.Y.Z`).

## Browser checks

`tools/browser-check.mjs` starts `tools/serve.mjs` on a free port, opens the desktop in headless
Chromium and fails on console errors, page errors, CSP violations and failed requests. Install the
browser once:

```sh
npm run browsers   # = playwright-core install chromium-headless-shell, from node_modules
```

Then:

```sh
npm run check:browser                                        # desktop, default language
node tools/browser-check.mjs --lang de-DE --mobile           # German, phone viewport
node tools/browser-check.mjs --base /desktop/ --screenshot /tmp/desk.png
node tools/browser-check.mjs --site-config /tmp/my-config.js # try a config without touching site/config.js
```

A scenario drives the desktop; `desk(fn, …args)` runs `fn(window.JPKDesk, …args)` in the page:

```js
/* /tmp/notes-scenario.mjs */
export default async ({ desk, assert }) => {
	assert(await desk(D => D.launch('notes')), 'Notes opens');
	assert((await desk(D => D.windows())).length > 0, 'a window is open');
};
```

```sh
node tools/browser-check.mjs --scenario /tmp/notes-scenario.mjs
```

A scenario that provokes an error on purpose declares it with `export const expect = { http: […],
console: […] }`. All options are listed in the header of `tools/browser-check.mjs` and in
[`docs/ARCHITECTURE.md` §22](docs/ARCHITECTURE.md#22-tools-and-tests).

**Run browser checks one at a time.** Each one starts a server and a Chromium; several in parallel
(for example from several terminals or tools) can exhaust the memory of a small machine. Serialise them
with a lock file:

```sh
flock /tmp/jpkcom-desktop-browser.lock node tools/browser-check.mjs --lang de-DE
```

Keep scratch files (scenarios, screenshots, test configs) outside the project folder.

## Adding things

The recipes are in [`docs/ARCHITECTURE.md` §21](docs/ARCHITECTURE.md#21-how-to-add-); in short:

### A language

1. `cp -r locales/en locales/<code>` and edit `locales/<code>/_meta.js` (`name`, `intl`, `dir`, `yes`).
2. Translate every namespace file; keep the keys and the `{placeholders}`; plural objects get the forms
   your language needs.
3. Add the code to `languages` in `site/config.js`.
4. `npm run i18n:check -- <code>`, then `npm run validate` (it reports site texts that lack the language).

Step by step, with optional content (pages, fortunes, feeds, the `<noscript>` line):
[`locales/README.md`](locales/README.md).

### An app

1. `src/apps/<id>/index.js` exporting a descriptor: `kind: 'app'`, `app: { icon, tint, size, name: '@<id>.appName' }`,
   the window hooks (`mount` at least), `i18n: ['<id>']`, `styles: ['<id>.css']`.
2. Strings in `locales/<lang>/<id>.js` for every language.
3. CSS in `src/apps/<id>/<id>.css` inside `@layer apps` (+ `@layer compact`), classes with the app's prefix.
4. Stored data: declare `storage` (with a validator) and a `resetGroups` entry; deletions go to the
   trash (`Desk.toTrash` + `trash: { <type>: { restore } }`).
5. Add `'<id>'` to `apps` in `site/config.js` (and its keys to `DEFAULTS` in `src/core/config.js` plus a
   commented entry in `site/config.js` if it has options).
6. `npm run icons`, tests, docs (`docs/packages/` and the contract where an interface changes).

### A module

The same under `src/modules/<id>/` with `kind: 'module'`, CSS in `@layer modules`, listed in `modules`.
Offer a service when others need it, contribute through the extension points (§8 "Contribution shapes"),
and declare an online service with `consent: [{ id, hosts, label, hint }]` — its host then also goes into
§16, the README, `docs/deploy.md` and the commented lines of `docs/server/*`. A site-only module lives in
`site/modules/<id>/index.js` and is listed as `{ id, src }`.

## Commits and pull requests

- One logical change per commit; keep unrelated formatting out.
- Subject line in English, imperative, at most about 72 characters, prefixed with the area it touches:
  `wm: keep focus when the last window closes`, `i18n: add French`, `docs: describe the vault salt`.
  A body explains *why* when that is not obvious.
- A pull request says what changed and why, how you checked it (the commands above, browser checks with
  their options), and links the issue. Screenshots help for visible changes — in both themes and on a
  phone viewport when layout changed.
- Update the documentation in the same pull request: `docs/ARCHITECTURE.md` for interface changes,
  `docs/packages/*.md` for package details, `CHANGELOG.md` under `[Unreleased]`.
- The version lives in three places that must agree: `package.json`, `VERSION` in `src/core/env.js` and
  `VERSION` in `sw.js` (the tests check it). Releases bump them together.

By contributing you agree that your contribution is licensed under the MIT License of this project.
The brand assets — the JPK monogram and the JPKCom logo in every form — are not MIT and stay
© Jean Pierre Kolb, all rights reserved (see [CREDITS.md](CREDITS.md#brand-assets-not-mit)).
