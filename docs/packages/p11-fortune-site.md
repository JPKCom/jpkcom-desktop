# P11 — Fortune app, example site, manifest validator

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Three things: the **Fortune** app (port of the original joke app, rebuilt around local data), the
complete neutral **example site** in `site/` (pages, bookmarks, a showcase, menus, fortunes, feeds),
and **`tools/validate-manifest.mjs`**, a zero-dependency check of `site/apps.js`.

| Part | Files |
|---|---|
| Fortune app | `src/apps/fortune/index.js` (descriptor: config, sources, built-in sayings, consent, service, terminal), `window.js` (the window, loaded on demand), `model.js` (pure: data cleaning, deck, languages), `providers.js` (pure: online sources), `fortune.css`; `locales/{en,de}/fortune.js` |
| Example site | `site/apps.js`, `site/content/**` (pages, Markdown twin, demo, image, `content.css`), `site/data/fortunes/{en,de}.json`, `site/data/feed.{en,de}.json`, `site/wallpapers/README.md` |
| Validator | `tools/validate-manifest.mjs` (`npm run validate`) |
| Tests | `tests/p11-fortune.test.mjs`, `tests/p11-site.test.mjs` |

---

## Fortune (`fortune`, EN "Fortune", DE "Glückskeks")

App `fortune` (`ti-cookie`, tint orange, 540 × 460), i18n namespace `fortune`, CSS `fortune.css`
(`@layer apps` + `@layer compact`). The card's glyph is the app's (`Desk.icons.appGlyph(win.app, { fallback: 'ti-cookie' })`: logo, mark or icon after site overrides).

### Sources

- **Built-in sayings** (default, no consent, same origin): `<config.fortune.dir><lang>.json`, for the
  first language of the fallback chain (`i18n.chain()`: language → base → `defaultLang` → `en`) that has a
  file. Only codes listed in `config.fortune.langs` (default `['de', 'en']`, the shipped files; `null` = try
  every code) are requested, so a language added without a file falls back without an HTTP 404 and its
  console error (`model.js` `cleanLangs()`, `fetchCodes()`). Fetched once per language through `Desk.net.getJson` (8 s timeout) and cached; a failed load is
  retried on the next draw. With `config.fortune.local: false` there are no built-in sayings: nothing is
  fetched from `dir`, the service worker precaches nothing for it, the source select and the terminal
  command `fortune` are gone (see "Online only").
- **An online source** (optional): only when the site names one (`config.fortune.remote`: built in, or
  added by a module — see "Providers from modules"), offers the service (`config.services.fortune: true`)
  and the user agrees (consent `fortune`, key `consent-fortune`, bound to the provider — see "Consent"). Then a **Source** select (built-in / provider) appears; without a stored choice the
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

### Providers from modules

A module adds an online source declaratively:

    export default {
      id: 'my-source', kind: 'module',
      fortuneProviders: [{
        id: 'example', name: 'Example facts', hosts: ['api.example.org'], home: 'https://example.org/',
        langs: ['en'], categories: [{ id: 'science', label: { en: 'Science', de: 'Wissenschaft' } }],
        url: ({ cat }) => `https://api.example.org/random${cat ? `?category=${encodeURIComponent(cat)}` : ''}`,
        parse: (j, { plain }) => {
          if (typeof j?.text !== 'string') throw new Error('example: no text');
          return { text: plain(j.text), lang: 'en' };
        }
      }]
    };

- `parse()` returns `null` only for a text that must not be shown (blocked: the app asks again, up to 5
  times per click); on an unusable answer it throws (one request, the window shows an error), and with
  an error with `code: 'empty'` when nothing was found for the request (an empty category).
- `hosts`: 1 to 8 host names (duplicates count once). They make up the consent and the agreement
  (`<id>@<sorted hosts>`, see "Consent"); a provider with more is rejected with a warning.
- Write the definition as a **plain object literal**. The loader copies the item's own enumerable
  properties, so `url`/`parse` on a class prototype are lost (the provider is then rejected with
  "needs url() and parse()"). In the keyed form `{ example: { … } }` the key is the id unless the item
  has its own `id`, which wins.
- The app adopts `Desk.modules.contributions('fortuneProviders')` in its `setup()` (modules set up before
  it) and on `'module:loaded'` (modules after it). No `requires: ['fortune']`: without the app the module
  loads and its contribution is unused. A module whose `setup()` throws contributes nothing.
- Imperative alternative: `Desk.fortune.addProvider(def, { module: '<own id>' })` in `setup()`; then the
  module needs `requires: ['fortune']`. With `module` the provider goes again on that module's
  `'module:failed'` (as with `Desk.wallpaper.register(motif, { module })`); pass your own id.
  Providers cannot be removed otherwise.
- Duplicate ids: the first one stays, the next is reported (`provider '<id>' exists already — kept the
  first`) and skipped. The same contribution seen twice is adopted once, silently.
- `config.fortune.remote` naming an id nobody provides is reported **once, at `'modules:ready'`**
  (`[fortune] unknown online source '<id>' …`), never at setup. Add providers during `setup()`; one added
  later is not used for the consent and the check.
- After adding or changing a site module run `npm run preload`; for local tests start the server with
  `node tools/serve.mjs --connect https://<provider host>`.
- The lifecycle is the pure factory `createSources()` in `providers.js` (built-ins, adoption, a failed
  module's providers, the consent registration of the configured provider, the deferred check);
  `index.js` only wires the bus events to it.

### Consent

- The service `fortune` is registered when the provider `config.fortune.remote` names is adopted
  (built in: at `setup()`), with its hosts and with `texts.service` / `texts.serviceHint` (else
  `@fortune.service` / `@fortune.serviceHint`) as label and hint; it is withdrawn when the providing
  module fails.
- The agreement is bound to the provider: on `'consent:change'` to granted (the question in the window
  or Settings → Online services) the app stores `agreed: '<id>@<sorted hosts>'` in its key `fortune`.
  At `'modules:ready'` a granted consent whose `agreed` differs from the configured provider (another
  id, other hosts, or no record — e.g. an agreement from before this version) is withdrawn, so the
  question comes again. Without a configured provider nothing is checked (nothing can be requested).

### Online only (`config.fortune.local: false`)

- Needs `remote` (else a config warning and `local: true`).
- No source select, no "Built-in sayings"; the stored `source` is ignored and not written.
- The question's "no" button is `fortune.denyOnline` ("No, thanks"): it closes the window; the question
  comes again the next time the app opens.
- No usable online source (the provider is unknown, or `services.fortune` is not `true`): the window shows
  the empty card with `fortune.noSource`; Next is `aria-disabled`; Previous, Copy and Learn more are
  disabled. Reported once at `'modules:ready'`.
- Offline: the existing `fortune.offline` status, Next says "Try again".
- `Desk.fortune.random()` returns `null` without a request; the terminal command `fortune` is hidden
  (`when()`), so `help` does not list it.

### App texts and glyph of a renamed app

- A site override `{ id: 'fortune', name: { de: '…', en: '…' }, icon: 'ti-…' }` (or `mark`, `logo`) in
  `site/apps.js` changes the dock, the title, the question tile **and** the card (same precedence as
  `Desk.tile()`: logo, mark, icon; `ti-cookie` when the icon is not built). Colour: `--fortune-mark`.
- `config.fortune.texts` replaces the texts that name or describe the app or its source (keys in
  `model.js` `TEXT_KEYS`: next, prev, copy, copied, loading, empty, localError, noSource, sourceLocal,
  askTitle, askText, askText2, askLang, allow, deny, denyOnline, keys, web, error, service, serviceHint,
  storageLabel, cmd, cmdMan), for every source. Give a `{ lang: text }` map for every configured language
  (`npm run validate` checks it; `i18n:check` cannot see config texts). Not replaceable: `by` (the
  signature dash) and the texts that do not name the app (`source`, `category`, `any`, `retry`,
  `privacy`, `toSettings`, `offline`).

| Key | Shipped en | Used |
|---|---|---|
| `next` | Next fortune | Next button, app menu |
| `prev` | Previous fortune | Previous title-bar button, app menu |
| `copy` | Copy fortune | Copy title-bar button (also after the copy feedback), app menu |
| `copied` | Copied | copy feedback (button title) |
| `loading` | Cracking the cookie … | status while fetching |
| `empty` | Nothing in this category yet. | status for "nothing found" |
| `localError` | The sayings could not be loaded. | status when the built-in sayings fail; terminal error |
| `noSource` | No source is available for this app right now. | status in online-only mode without a usable source |
| `sourceLocal` | Built-in sayings | source select option |
| `askTitle` | Before anything is fetched | question title |
| `askText` | The texts of {provider} come from {host}, a service outside this site. … | question, who receives what — placeholders `{provider}` (the provider's name), `{host}` (its host names) |
| `askText2` | Your choice applies to this browser — you can take it back at any time … | question, where to take it back |
| `askLang` | The texts are in {language}. | question, shown when the provider's texts come in another language — placeholder `{language}` |
| `allow` | Agree and load | question, agree button |
| `deny` | No, use the built-in sayings | question, "no" button with `local: true` (switches to the built-in sayings) |
| `denyOnline` | No, thanks | question, "no" button with `local: false` (closes the window) |
| `keys` | {space} or N: next · {back}: previous | key hint under the card — placeholders `{space}` (the key name), `{back}`, `{next}` (arrows, mirrored right-to-left) |
| `web` | Learn more | title-bar button of an entry with a link |
| `error` | {host} is not answering right now. … | status when the online source fails — placeholder `{host}` |
| `service` | Fortune: jokes and facts from the web | consent label (Settings → Online services) |
| `serviceHint` | The app asks by itself before the first request | consent hint |
| `storageLabel` | Fortune source | label of the storage key `fortune` in Backup and Reset |
| `cmd` | a saying from the fortune cookie | terminal `help` line |
| `cmdMan` | Prints one of the built-in sayings … | terminal `man fortune` |

Values are manifest texts (ARCHITECTURE §12): `'@ns.key'` (a namespace some loaded module brings, e.g. a
site module's `locales/`), `{ lang: text }` or a plain string, resolved with `Desk.L()` at the moment of
use (so a language switch applies; `storageLabel` is read once, when the storage key is registered —
after `validateConfig()`, an order the loader promises (ARCHITECTURE §8 "Loader behaviour") — and
resolved whenever Backup/Reset is drawn). The keys that have an action
(`deny`, `denyOnline`) keep it: the text never changes what the button does.

**Placeholders** (`model.js` `TEXT_PARAMS`): `askText` `{provider}` `{host}`, `askLang` `{language}`,
`keys` `{space}` `{back}` `{next}`, `error` `{host}`; every other key has none. A site text in any form
(plain, `{ lang: text }`, `'@ns.key'`) may use them; the app fills them like `t()` does (`fillText()`), and
an unknown `{name}` stays as written. `validateConfig()` and `npm run validate` warn when a plain or
language-map text uses a placeholder its key does not fill (a typo such as `{hots}`); the text is kept
(one rule and wording for both: `model.js` `placeholderWarning()`).
A placeholder may be left out — but a replaced `askText` must keep naming who receives the request
(`{host}`, or one of the provider's hosts written out): the question is the consent. A plain or
language-map `askText` that names neither is kept but reported (`model.js` `hostWarning()`): by the page
at `'modules:ready'` when the online source is offered (`[fortune] config.fortune.texts.askText … does not
name the host the request goes to …`, every provider), and by `npm run validate` when `fortune.remote` is
a built-in provider (the validator does not load module providers). `'@ns.key'` texts are not checked.

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
| Descriptor | `kind: 'app'`, `i18n: ['fortune']`, `windowStyles: ['fortune.css']`, `app.load: () => import('./window.js')` — the window hooks `mount focus relabel menu unmount` (and the online requests) come with the first window (ARCHITECTURE §8 `load`); `win.state.fortune` is the open window's handle |
| Service `fortune` | `random({ cat }) → Promise<{ text, lang, cat, by, url } \| null>` (a built-in saying; `null` with `local: false`), `addProvider(def, { module }?) → boolean` (a module adds an online source; definition in `providers.js`: `id`, `name`, `hosts` (1 to 8), `home`, `langs`, `categories` with optional per-category `langs`, `emptyStatus`, `url()`, `parse()`, which may throw an error with `code: 'empty'`; `module`: own id, dropped on its `'module:failed'`), `providers() → ids`, `source() → 'local' \| 'remote' \| null` |
| Contribution point | `fortuneProviders: [def] \| { id: def }` — adopted in `setup()` and on `'module:loaded'` (ARCHITECTURE §8) |
| Terminal | contribution `terminal: { fortune }` — `fortune` prints a built-in saying (`service.random()`) and, when it has one, its signature (`@fortune.by`, dimmed); never the online source (the terminal asks no consent); hidden (`when()`) with `fortune.local: false`. Help and man page are app texts (`cmd`, `cmdMan`), error `localError`. The command exists only while the module is loaded |
| Consent | `{ id: 'fortune', hosts: <provider hosts>, label: texts.service \| '@fortune.service', hint: texts.serviceHint \| '@fortune.serviceHint' }` — registered when the provider `config.fortune.remote` names is adopted (built in at `setup()`, a module's `fortuneProviders` or `addProvider`), unregistered when its module fails; agreement bound to `<id>@<hosts>` (storage `agreed`), withdrawn at `'modules:ready'` on mismatch |
| Storage | `fortune` (json, backup, reset group `settings`): `{ source?: 'local' \| 'remote', agreed?: '<id>@<hosts>' }`, validated by `cleanState`; label `texts.storageLabel` \| `'@fortune.storageLabel'` (a getter, read at registration) |
| Config | `configKey: 'fortune'`, `validateConfig` → `{ remote: id \| null, local: boolean, dir, langs: [codes] \| null, block: [ids], texts: { key: text } }` — `local: false`: online only (needs `remote`); `langs`: the languages with a `<dir><lang>.json` (only these are fetched); `block`: category ids left out locally **and** remotely (the original's `BLOCKED` list); `texts`: keys of `TEXT_KEYS`, placeholders per key `TEXT_PARAMS` |
| Events consumed | `consent:change`, `store:change` (`fortune`, external), `storage:restore`, `module:loaded`, `module:failed`, `modules:ready` |
| CSS | `.fortune`, `.fortune-ask`, `.fortune-tile`, `.fortune-btns`, `.fortune-textbtn`, `.fortune-main`, `.fortune-top`, `.fortune-field`, `.fortune-label`, `.fortune-select`, `.fortune-card`, `.fortune-mark` (`--fortune-mark`), `.fortune-quote`, `.fortune-by`, `.fortune-foot`, `.fortune-status`, `.fortune-next`, `.fortune-keys`, `.fortune-prev` |

### Deviations from the original and why

- **Local data first** instead of a single third-party joke API only: no third-party name, no external request by
  default, content per language, authorship visible ("— JPKCom").
- **"No" switches to the built-in sayings** instead of closing the window (there is something else to
  show now); with `fortune.local: false` it closes the window, since there is nothing else.
- **The card's glyph is the app's** (logo, mark or icon), so a renamed app shows its own glyph.
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
`config.author.links`). The example site uses no icon set (`iconSets: []`).

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
  `writing-pages` (with a terminal manual for `man`: `site/content/<lang>/manuals/writing-pages.md`),
  **alias** `system` → `about-desktop`, **link** `repository` (the project on GitHub).

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
`changelog`, `imprint`, `privacy` — in `en` and `de`, each with `hreflang` alternates. Manuals (Markdown
the terminal's `man` prints, data files under `site/content/`): `manuals/writing-pages.md` in `en` and `de`.

### Data

- `site/data/fortunes/{en,de}.json`: 44 original sayings each (desktop tips, keyboard shortcuts, web
  development, accessibility, a few light jokes), signature JPKCom, some with "Learn more" links into the
  docs or the contrast demo.
- `site/data/feed.{en,de}.json`: JSON Feed 1.1 — the project changelog ("JPKCom Desktop 1.4.0 released",
  "JPKCom Desktop 1.3.0 released", "JPKCom Desktop 1.2.0 released", "JPKCom Desktop 1.1.0 released",
  "JPKCom Desktop 1.0.0 released", "An example site to start from"). Item URLs are relative to the feed and
  carry a distinct query (`changelog.html?release=1.4.0`), because the notify module de-duplicates by
  path + query.
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
- references: aliases (app and item; an alias that points at itself or whose chain comes back to it —
  a cycle, since 1.3 — is an error), override records, menu app ids and collections, submenu depth,
  `config.site.legal`, `site.defaultPageApp`, `notify.app` (page apps), `vault.collection`, `about.moreInfo`;
- collections: prefix, sort, itemKind, urlTemplate (`{slug}`), basePath (a folder), groups (unknown,
  duplicate, empty), slugs (unique), item urls/kinds (auto rule as the registry);
- the Catalog's web button: `webUrl`/`allLabel`/`webLabel` on a collection (errors); `webApp` on a
  collection, a Catalog app or its override record (errors: no app id, unknown app, a Catalog of the
  same collection; warnings: the app's kind needs a module that is not loaded, a `page` app at
  `basePath`, no Catalog window shows the collection — `webApp` unused); a `webUrl` equal to `basePath`
  without `webApp` when the collection's app is a Catalog of it and no `config.site.routes` rule sends
  the path elsewhere (warning: the button opens it in a new tab); `webUrl`/`allLabel`/`webLabel` on a
  Catalog app or its override record are warnings only (1.1.0 did not check them);
- urls: no `javascript:`/`data:`/`//host`; link apps https (http only with `allowHttp`); relative paths
  must exist (a folder URL needs its `index.html`); `docs`/`guide`; `files` paths;
- manual pages (`man` on items — alias items too — and collections, `config.terminal.manUrl`): the rules
  of `src/core/man.js` (`cleanMan`): a bad path, scheme, `//host`, whitespace, an unknown placeholder, a bad
  language key or a template without `{slug}`/`{id}` → error; a path that is not `.md`/`.markdown`/`.txt`,
  a map without one of `config.languages`, `manUrl` without any collection → warning. Relative paths are
  then looked up per language: a missing file of an item's own `man` is one warning, the files a template
  misses are counted per collection and language (one warning each) — never an error (`man` then says "no
  manual page");
- icons: in `src/icons/tabler.js`, `src/icons/custom.js` or a site icon set of `config.iconSets`; a Tabler
  id that exists in `@tabler/icons` but is not built yet → warning "run npm run icons"; an id with the
  prefix of a configured set that the set does not contain → error naming the set; unknown → error;
  `config.brand.glyph` the same way (warning);
- `config.iconReplace` (§13): every key must be a known project icon (Tabler subset or custom glyph; an
  existing Tabler id not built yet → warning "run npm run icons"; unknown → error, "does not exist in Tabler
  Icons" for a `ti-`/`tif-` typo), every target a known icon the same way (set prefix but not in the set →
  error naming the set); a target that is itself the key of a pair without an error → warning (one step, not
  chained); shape problems (a key that is not `ti-`/`tif-`/`wc-`/`tile-`, `jpk`, a
  value equal to its key) come as config warnings;
- site icon sets: each file exists below the root and not below `vault.dir`, is JSON in format
  `jpkcom-desktop-icons/1`, ids and prefixes (reserved, duplicates across sets), definitions (`k`, `vb`,
  `a`, elements and attributes of the allowlist — every dropped item is an error), at most 2 MiB / 5000
  icons (error); above 256 KiB a warning; a `k: 'o'` icon whose viewBox is not 24 × 24 and that has no
  `stroke-width` in `a` → warning;
- tints (config names or a hex pair), sizes, marks, boolean flags;
- texts: every language map has a value for each of `config.languages`; `'@ns.key'` exists in the locales;
  `fortune.texts`: known keys (`TEXT_KEYS`, else a warning), placeholders the key fills (`TEXT_PARAMS`, else a
  warning — plain and language-map texts, `model.js` `placeholderWarning()`), a replaced `askText` names the
  host of a built-in `fortune.remote` (`{host}` or the host written out, else a warning — `hostWarning()`,
  hosts from `providers.js` `BUILT_IN`);
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
  and signature) and the host check; the source lifecycle `createSources()` (providers from modules set
  up before and after the app, the same contribution twice, duplicate ids, a failed module, invalid and
  class-instance definitions, the unknown `remote` reported once at ready, consent register/unregister),
  the consent binding (`consentTag`, `staleConsent`), `cleanState` with `agreed`, `cleanTexts` (placeholders),
  `fillText`, `placeholderWarning`/`strayPlaceholders`, `hostWarning`, the storage label from `texts.storageLabel`,
  `sourceFor`, `validateConfig` (`local`, `texts`), the descriptor's wiring and the terminal command's
  `when()`.
- `tests/p11-site.test.mjs`: the validator (clean and broken manifests, site data, the CLI on the example
  site with `--strict`, a relative `site.home` still checks the `website` app), the manifest (no private content), the fortunes (clean, same categories in every
  language, links exist), the feeds (parse with the notify module's `parseFeed`, targets exist), the
  content pages (Reader markup, alternates and links exist, no inline code, templates marked); online
  only (no fortunes check, needs `remote` and `services.fortune`) and the app texts (every configured
  language).

Browser check (`tools/browser-check.mjs`): local sayings, keyboard, categories, language switch, the
Reader pages, docs folder navigation, Catalog, the web demo, the image item, menus; the online source
with a faked JokeAPI answer (question first, nothing fetched before consent, blocked answer skipped,
withdrawal, "No" → built-in, settings row); compact layout. Online only with a provider from a site
module (`--route` for the module and `site/apps.js`): no warning at start, the consent row uses the app
texts, question first, "No, thanks" closes, one request after agreeing, the agreement bound to the
provider and withdrawn for another one, the card glyph follows icon/mark/unknown icon, no local files
requested, the terminal command hidden; an unknown `remote` (one warning, `noSource`, Next disabled);
the shipped site unchanged (cookie glyph, "Next fortune", no warning).
