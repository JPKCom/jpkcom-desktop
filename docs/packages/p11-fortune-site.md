# P11 — Fortune app, example site, manifest validator

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Three things: the **Fortune** app (port of the original joke app, rebuilt around local data), the
complete neutral **example site** in `site/` (pages, bookmarks, a showcase, menus, fortunes, feeds),
and **`tools/validate-manifest.mjs`**, a zero-dependency check of `site/apps.js`.

| Part | Files |
|---|---|
| Fortune app | `src/apps/fortune/index.js` (descriptor, window), `model.js` (pure: data cleaning, deck, languages), `providers.js` (pure: online sources), `fortune.css`; `locales/{en,de}/fortune.js` |
| Example site | `site/apps.js`, `site/content/**` (pages, Markdown twin, demo, image, `content.css`), `site/data/fortunes/{en,de}.json`, `site/data/feed.{en,de}.json`, `site/wallpapers/README.md` |
| Validator | `tools/validate-manifest.mjs` (`npm run validate`) |
| Tests | `tests/p11-fortune.test.mjs`, `tests/p11-site.test.mjs` |

---

## Fortune (`fortune`, EN "Fortune", DE "Glückskeks")

App `fortune` (`ti-cookie`, tint orange, 540 × 460), i18n namespace `fortune`, CSS `fortune.css`
(`@layer apps` + `@layer compact`).

### Sources

- **Built-in sayings** (default, no consent, same origin): `<config.fortune.dir><lang>.json`, for the
  first language of the fallback chain (`i18n.chain()`: language → base → `defaultLang` → `en`) that has a
  file. Only codes listed in `config.fortune.langs` (default `['de', 'en']`, the shipped files; `null` = try
  every code) are requested, so a language added without a file falls back without an HTTP 404 and its
  console error (`model.js` `cleanLangs()`, `fetchCodes()`). Fetched once per language through `Desk.net.getJson` (8 s timeout) and cached; a failed load is
  retried on the next draw.
- **An online source** (optional): only when the site names one (`config.fortune.remote`), offers the
  service (`config.services.fortune: true`) and the user agrees (consent `fortune`, key
  `consent-fortune`). Then a **Source** select (built-in / provider) appears; without a stored choice the
  online source comes first (as in the original, which had nothing else). Before anything is fetched the
  window shows the question (title, who receives what, where to take it back, a language note when the
  texts come in another language, "Agree and load", "No, use the built-in sayings", "Open settings").
  Requests: `Desk.net.getJson(url, { service: 'fortune', timeout: 8000 })` — no cookies, no referrer;
  the URL a provider builds must go to one of its own hosts over https (`checkRequestUrl`).
  Withdrawing consent (Settings → Online services, another tab) brings the question back at once
  (`'consent:change'`).

Built-in providers (`providers.js`) — **the host must be added to the CSP `connect-src`**
(`serve.mjs --connect https://…`, server snippets):

| id | Host | Languages | Notes |
|---|---|---|---|
| `jokeapi` | `v2.jokeapi.dev` (JokeAPI v2, <https://jokeapi.dev/>) | cs, de, en, es, fr, pt | categories programming, misc, pun, spooky, christmas — each offered only in the languages it has safe jokes in (checked 2026-10: programming en/de/es, misc en/de/cs/fr/pt, pun en/de, spooky en, christmas en/de; like the original, which only listed categories the API serves); "No matching joke found" (HTTP 400 / error code 106) shows "Nothing in this category yet", not an outage; requests name the allowed categories (never `Any`, which includes dark humour), `safe-mode`, `blacklistFlags=nsfw,religious,political,racist,sexist,explicit`; answers with a flag, `safe: false` or another category are skipped (up to 5 tries, as the original's blocked list); two-part jokes become two lines |
| `uselessfacts` | `uselessfacts.jsph.pl` (Useless Facts, <https://uselessfacts.jsph.pl/>) | de, en | no categories; "Learn more" opens the fact's origin (`source_url`, only when it is `https://`), its `source` is the signature; the API permalink is not used (it is raw JSON, not a page) |

The language asked for is the first of the fallback chain the provider serves (`pickLang`), else its
first language; the quote carries the answer's `lang`.

### Data format (`site/data/fortunes/<lang>.json`)

```json
{
  "lang": "en",
  "by": "JPKCom",
  "categories": { "keys": "Keyboard", "fun": "Just for fun" },
  "items": [
    "A plain string is a saying without category.",
    { "text": "…", "cat": "keys", "by": "Someone", "url": "site/content/en/docs/keyboard.html" }
  ]
}
```

- **Plain text only** (no markup, no entities): local texts are not HTML-parsed, so `<main>` in a tip
  stays visible text. Spaces are collapsed per line; line breaks are kept; at most 1000 characters.
- `categories`: id (`[a-z][a-z0-9-]`) → label in the file's language; use the **same ids in every
  language** (the selected category survives a language switch). Only categories with entries are shown,
  sorted by name in the current language.
- `by`: file-wide signature ("— JPKCom"), per entry overridable, `null` = none.
- `url` (optional): a path relative to the root, `/path` or `https://` — "Learn more" opens it through
  `Desk.openUrl` (Reader, app window or new tab).
- Invalid entries are reported (`console.warn`) and skipped; duplicates are dropped.

### Behaviour (ported)

- History of 20 with forward and back; Next goes forward through the history first (like a browser);
  a new entry after going back drops the forward part. Entries keep their own language.
- A shuffled deck per category: every saying once per round, never the same twice in a row.
- Category select ("All categories" + the categories); changing it draws a fresh one.
- Title-bar buttons (`win.button` via the kit): Previous (`ti-chevron-left`, mirrored in RTL), Copy
  (`ti-copy`, feedback through `copyWithFeedback`), Learn more (`ti-external-link`, disabled without a
  link); hidden while the question is shown.
- Keyboard (window): Space, N or → next; ← previous (mirrored in RTL); Ctrl/⌘+C without a text
  selection copies; keys inside selects/fields/the title bar and Enter/Space on buttons stay with them.
- The card is a `figure[aria-live=polite]` with the quote (`blockquote[lang][dir=auto]`, `white-space:
  pre-line`) and the signature (`figcaption`); status line `role=status` ("Cracking the cookie …",
  errors in `--warn`); the Next button uses `aria-disabled` while loading (keeps focus); the button says
  "Try again" after an error.
- App menu: Next, Previous, Copy, and — with an online source — "Privacy and settings …"
  (`Desk.showSettings('online')`).
- Language switch (`relabel`): labels, selects and the key hint; the built-in sayings of the new
  language are loaded in the background (the shown saying stays).

### Contract

| Item | Value |
|---|---|
| Descriptor | `kind: 'app'`, `i18n: ['fortune']`, `styles: ['fortune.css']`, hooks `mount focus relabel menu unmount` |
| Service `fortune` | `random({ cat }) → Promise<{ text, lang, cat, by, url } \| null>` (a built-in saying), `addProvider(def) → boolean` (a site module adds an online source; definition in `providers.js`: `id`, `name`, `hosts`, `langs`, `categories` with optional per-category `langs`, `emptyStatus` — HTTP statuses that mean "nothing found", `url()`, `parse()`, which may throw an error with `code: 'empty'`), `providers() → ids`, `source() → 'local' \| 'remote'` |
| Terminal | contribution `terminal: { fortune }` — `fortune` prints a built-in saying (`service.random()`) and, when it has one, its signature (`@fortune.by`, dimmed); never the online source (the terminal asks no consent). Strings `fortune.cmd` (help line), `fortune.cmdMan` (`man fortune`), error `fortune.localError`. The command exists only while the module is loaded |
| Consent | `{ id: 'fortune', hosts: <provider hosts>, label: '@fortune.service', hint: '@fortune.serviceHint' }` — registered in `setup()` (module `fortune`) only when `config.fortune.remote` names a known provider (or later through `addProvider`) |
| Storage | `fortune` (json, backup, reset group `settings`): `{ source: 'local' \| 'remote' }`, validated by `cleanState` |
| Config | `configKey: 'fortune'`, `validateConfig` → `{ remote: id \| null, dir, langs: [codes] \| null, block: [ids] }` — `langs`: the languages with a `<dir><lang>.json` (only these are fetched); — `block` is new: category ids left out locally **and** remotely (the original's `BLOCKED` list) |
| Events consumed | `consent:change`, `store:change` (`fortune`, external), `storage:restore` |
| CSS | `.fortune`, `.fortune-ask`, `.fortune-tile`, `.fortune-btns`, `.fortune-textbtn`, `.fortune-main`, `.fortune-top`, `.fortune-field`, `.fortune-label`, `.fortune-select`, `.fortune-card`, `.fortune-mark` (`--fortune-mark`), `.fortune-quote`, `.fortune-by`, `.fortune-foot`, `.fortune-status`, `.fortune-next`, `.fortune-keys`, `.fortune-prev` |

### Deviations from the original and why

- **Local data first** instead of a single third-party joke API only: no third-party name, no external request by
  default, content per language, authorship visible ("— JPKCom").
- **"No" switches to the built-in sayings** instead of closing the window (there is something else to show now).
- **Consent through the core** (`Desk.consent`, key `consent-fortune`, Settings → Online services) instead
  of the original's own storage key and a hard-coded settings row; the in-window question stays (more
  explicit than the core sheet: who receives what, the language of the texts, a link to the settings).
- **Providers** instead of one hard-coded API; the fixed category list and the blocked list became
  provider categories + `config.fortune.block`; the URL check per provider replaces `JOKE_URL`.
- **Content language** from the data (file or answer) instead of a fixed `lang="en"`; `dir="auto"`.
- **Two-part jokes** keep their line break (`pre-line`); `<br>` in foreign text becomes a line break.
- **Signature line** (`figcaption`), **category labels from the data file** (any language without code
  changes), **shuffled deck** (the API was random by itself).
- Previous/Copy disabled in the app menu when they do nothing; Previous is mirrored for RTL.

---

## Example site (`site/`)

Everything of jpkc.com is gone; no private URL of the original manifest is used. The author stays as
attribution (About page, Author group, the website link `https://www.jpkc.com/`, the author links from
`config.author.links`).

### `site/apps.js`

| App | Kind | Notes |
|---|---|---|
| `website` | link | only when `config.site.home` is set (read from the raw `window.DESKTOP_CONFIG`; relative values resolved against the page; `allowHttp` only for an http home, e.g. local tests); `logo: true` (brand logo; the neutral `ti-world` icon when `brand.logo` is null), desktop |
| `about` | page | the project and its author; desktop, dock |
| `docs` | page | **a folder as start page** (`site/content/<lang>/docs/`), so every page below it opens in this window (`router.pageApp` longest prefix); desktop, dock |
| `changelog` | page | the target of the feed entries |
| `imprint`, `privacy` | page | **templates**, clearly marked (placeholders in `[…]`, German legal note: § 5 DDG, § 18 MStV; DSGVO/TDDDG) |
| override records | — | `bookmarks` (desktop, dock), `showcase` (desktop), `notes`, `terminal` (dock), `fortune` (desktop) |

Collections:

- **`bookmarks`** (prefix `link`, alpha, itemKind link): groups *Web servers* (Apache HTTP Server, nginx,
  Caddy, Ferron, static-web-server), *Reference* (MDN — a `{ en, de }` URL map, WCAG, Content Security
  Policy, JSON Feed, Tabler Icons) and *Author* (aliases `author-github`, `author-mastodon` + the website).
- **`showcase`** (prefix `show`, manual order, `basePath`/`urlTemplate` `site/content/demos/{slug}/`):
  one item per kind — **web** demo `contrast` (`site/content/demos/contrast/`, a WCAG contrast checker:
  `index.html` + `index.de.html`, external `demo.js`/`demo.css` only, CSSOM for colours), **image**
  `sketch` (`site/content/images/desk-sketch.svg`, original drawing, `fileName` for downloads), **page**
  `writing-pages`, **alias** `system` → `about-desktop`, **link** `repository` (the project on GitHub).

Menus: **Pages/Seiten** (About, Docs, Configuration, Keyboard, Writing pages as `{ label, url }` maps,
Changelog, Imprint, Privacy) and **Explore/Entdecken** (`{ collection: 'showcase' }`, `{ collection:
'bookmarks' }` — the bookmark groups become submenus). Files for the terminal `cat`: `about`
(`site/content/<lang>/about.md`), `license` (`LICENSE`), `credits` (`CREDITS.md`).

### Pages (`site/content/<lang>/…`) — the documented minimal markup

Matches the default rule `config.reader.rules = [{ match: 'site/content/', content: 'main article, article,
main', title: 'h1', lead: '.lead' }]`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Page title | JPKCom Desktop</title>              <!-- window title: the part before " | " -->
<link rel="alternate" hreflang="de" href="../de/x.html"> <!-- the page after a language switch -->
<link rel="stylesheet" href="../content.css">           <!-- only outside the desktop -->
</head>
<body><main><article>
<h1>Page title</h1>
<p class="lead">One or two sentences.</p>
…
</article></main></body>
</html>
```

No inline scripts/styles/handlers (the Reader removes them anyway, and the CSP would report them while
parsing). `content.css` styles the pages when opened on their own (light/dark). The page "Writing pages"
(`docs/pages.html`) explains the rules to site owners.

Pages: `about`, `docs/index` (Getting started), `docs/configuration`, `docs/keyboard`, `docs/pages`,
`changelog`, `imprint`, `privacy` — in `en` and `de`, each with `hreflang` alternates.

### Data

- `site/data/fortunes/{en,de}.json`: 44 original sayings each (desktop tips, keyboard shortcuts, web
  development, accessibility, a few light jokes), signature JPKCom, some with "Learn more" links into the
  docs or the contrast demo.
- `site/data/feed.{en,de}.json`: JSON Feed 1.1 — the project changelog ("JPKCom Desktop 1.0.0 released",
  "An example site to start from"). Item URLs are relative to the feed and carry a distinct query
  (`changelog.html?release=1.0.0`), because the notify module de-duplicates by path + query.
- `site/wallpapers/README.md`: how to add picture wallpapers (`config.wallpaper.images`); none shipped.

---

## Manifest validator (`tools/validate-manifest.mjs`)

```
node tools/validate-manifest.mjs [--manifest site/apps.js] [--config site/config.js] [--strict] [--quiet] [--json]
```

Loads `site/config.js` in a VM sandbox, builds the effective config with `buildConfig()`, imports the
manifest (with `globalThis.DESKTOP_CONFIG` set), collects the app ids the configured core parts, modules
and apps bring (imports their descriptors; a fixed list when one cannot be imported or is a stub) and the
author links, then checks:

- ids (`[a-z0-9-]`), duplicates (site, author links, collection items), kinds and the module each kind
  needs (`page` → reader, `image`/`viewer` → viewer, `collection` → catalog);
- references: aliases (app and item), override records, menu app ids and collections, submenu depth,
  `config.site.legal`, `site.defaultPageApp`, `notify.app` (page apps), `vault.collection`, `about.moreInfo`;
- collections: prefix, sort, itemKind, urlTemplate (`{slug}`), basePath (a folder), groups (unknown,
  duplicate, empty), slugs (unique), item urls/kinds (auto rule as the registry);
- urls: no `javascript:`/`data:`/`//host`; link apps https (http only with `allowHttp`); relative paths
  must exist (a folder URL needs its `index.html`); `docs`/`guide`; `files` paths;
- icons: in `src/icons/tabler.js` or `src/icons/custom.js`; a Tabler id that exists in `@tabler/icons` but
  is not built yet → warning "run npm run icons"; unknown → error;
- tints (config names or a hex pair), sizes, marks, boolean flags;
- texts: every language map has a value for each of `config.languages`; `'@ns.key'` exists in the locales;
- site data: `fortunes/<lang>.json` per language (cleaned with the app's own `cleanFortunes`), the notify
  feeds (exist, JSON Feed version).

Node has no `location`: the validator sets a stand-in origin (`https://example.invalid/`) while it imports
`site/apps.js`, so apps built from a relative address (the `website` app) are checked too.

Output: `✖`/`⚠` lines with the location, a summary line; exit 0 (fine), 1 (errors, or warnings with
`--strict`), 2 (manifest/config not loadable). The pure functions `validateManifest(manifest, ctx)` and
`validateSiteData(cfg, opts)` are exported for tests.

---

## Tests

- `tests/p11-fortune.test.mjs`: text normalisation, link safety, block list, data cleaning, the deck
  (full rounds, no repeats), language choice, state, history, the providers (URLs, safe mode, blocked
  answers, "nothing found" as an empty result, per-language categories, the Useless Facts origin link
  and signature) and the host check.
- `tests/p11-site.test.mjs`: the validator (clean and broken manifests, site data, the CLI on the example
  site with `--strict`, a relative `site.home` still checks the `website` app), the manifest (no private content), the fortunes (clean, same categories in every
  language, links exist), the feeds (parse with the notify module's `parseFeed`, targets exist), the
  content pages (Reader markup, alternates and links exist, no inline code, templates marked).

Browser check (`tools/browser-check.mjs`): local sayings, keyboard, categories, language switch, the
Reader pages, docs folder navigation, Catalog, the web demo, the image item, menus; the online source
with a faked JokeAPI answer (question first, nothing fetched before consent, blocked answer skipped,
withdrawal, "No" → built-in, settings row); compact layout.
