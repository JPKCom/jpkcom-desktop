# P04 — Content kinds: Reader, image viewer, Catalog

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Three optional modules that put content into windows. Each one defines its window kinds with
`desk.wm.defineKind()` in `setup()` (`requires: ['wm']`); without the module, apps of that kind are
not available (they leave All apps, the dock, menus and search instead of failing on click).

| Module | Window kinds | Service | Files |
|---|---|---|---|
| `reader` | `page` | `reader` | `src/modules/reader/index.js`, `kind.js`, `extract.js`, `sanitize.js`, `parse.js`, `styles.js`, `util.js`, `reader.css` |
| `viewer` | `image`, `viewer` (+ app `viewer`) | `viewer` | `src/modules/viewer/index.js`, `kind.js`, `util.js`, `viewer.css` |
| `catalog` | `collection` | `catalog` | `src/modules/catalog/index.js`, `kind.js`, `util.js`, `catalog.css` |

**Window code on demand** (ARCHITECTURE §8, §19.3 `load`): each `index.js` is the descriptor — the
configuration, the service, contributions (drop handler, context menu) and the kind definitions as
`defineKind(kind, { load: () => import('./kind.js'), … })`. The window hooks live in `kind.js` and come
with the first window of the kind (`wm.open()` shows a spinner until then; `win.ready`). The Reader keeps
`acceptUrl` in the descriptor (session restore and deep links ask it before any window exists);
`extract.js` and `sanitize.js` are imported by `kind.js` only, and `parse.js` (the inert parser) and
`styles.js` (the code-colour allowlist) by those two — window code, never the descriptor (`util.js`, which
the descriptor imports, keeps only the config defaults of the code colours). The descriptors never import `kind.js`
statically (`tests/p04-catalog.test.mjs` checks it); `kind.js` imports what it shares from `index.js`
(Reader: `shared` rules/separator/cache; Catalog: labels and `actions`). The stylesheets are
`windowStyles` (`reader.css`, `viewer.css`, `catalog.css`): every rule applies inside these windows only
(the Catalog's context menu and the drop overlay are the shell's), so they come with the first window of
a kind the module defined (wm `loadKind`). From outside, a window is reached through `wm.get(id)?.state.<reader |
viewer | catalog>` once it is mounted; the viewer service hands a picture over as `wm.open('viewer',
{ file })` (`mount`/`reopen` read `opts.file`, also while the code still loads), and a dropped picture's
app leaves the registry on `'window:close'` (also when it was closed before its code arrived).

i18n namespaces: `reader`, `viewer`, `catalog` (`locales/{en,de}/…`). Common words (Back, Forward,
Reload, Open in new tab, Loading, Download, Search, No results, the item count, Open) come from `core`.
Storage keys: none (state lives in the session through `serialize`/`restore`).
Tests: `tests/p04-reader.test.mjs`, `tests/p04-viewer.test.mjs`, `tests/p04-catalog.test.mjs`.

---

## Reader (`reader`, kind `page`)

A page app (`{ id, kind: 'page', url: 'site/content/en/x.html' | { lang: url } }`) shows same-origin HTML
pages natively, without an iframe:

1. **fetch** through `Desk.net.request(url, { accept: 'text/html', timeout: 15 s })`; only `text/html` /
   `application/xhtml+xml` responses up to 5 MB — the body is read by `readText()` (util.js) under the rest
   of the same 15 s and stops past 5 MB (bytes; `Content-Length` checked first), since `request()` hands
   the response over at the headers (the Reader needs its type and final URL before reading); same origin only (other origins show the error notice
   with "Open in new tab"). A shared LRU cache keeps `config.reader.cacheSize` pages (0 = no cache);
   Reload bypasses it.
2. **parse inert** with `DOMParser` (scripts never run, images never load) — `parseInert()` (`parse.js`)
   takes the parser of a same-origin `about:blank` iframe that is removed before the first parse (created
   once, lazily). Chromium checks the window's CSP while it parses; a detached window's document is not
   checked, so a page's `style=""`, `<style>` and `<base>` raise no console report (measured: 0 instead
   of two lines per attribute). Fallback: the window's own `DOMParser` (reports again, nothing applied).
   The document's URL is `about:blank` — every URL is resolved against the page URL, as before.
3. **extract** by `config.reader.rules` (first matching rule wins, else the default rule
   `content: 'main article, article, main, [role="main"]', title: 'h1'`, then `<body>`):

   | Rule field | Meaning |
   |---|---|
   | `match` | path prefix relative to the installation root (`'site/content/'`, works in a sub-folder install), `'/…'` absolute on this host, or a regular expression starting with `^` tested against the absolute path |
   | `content` | selector list, **tried in list order** (not document order) — the region shown |
   | `title` | the page heading. Outside the content region it becomes the hero heading (`.reader-hero .reader-h1`: links unwrapped, icons dropped, line breaks as spaces); inside it stays where it is |
   | `lead` | a subtitle: outside the content it goes under the hero heading (under the heading inside the content when that is where the heading is; a hero of its own when there is no heading); inside the content it gets the class `.reader-lead` |

   Window title: the document `<title>` before `config.reader.titleSeparator` (regex source, default
   `\s[|—–]\s`), else the heading's text, else the app name. `lang`/`dir` of the page's `<html>` go onto
   `.reader-page`.
4. **sanitise** with an **allowlist** (`sanitize.js`):
   - elements: text-level and structural HTML, tables, lists, figures, `details`, `picture`/`img`/`source`,
     `video`/`audio`/`track` (always with controls), drawing SVG elements. Removed with their content:
     `script style noscript template iframe frame(set) object embed applet link meta base title head form`
     and all form controls, `dialog canvas portal slot map area`, SVG `animate`/`set`/`animate*`/`discard`/
     `foreignObject`/`image`/`script`/`style`, anything `[hidden]` or `role=menu` (as in the original).
     Unknown wrappers (`font`, `center`, custom elements, MathML) are unwrapped — their text stays.
   - attributes: per-element allowlist; never `style`, `on*`, `data-*`, `target`; `tabindex` only on
     `<pre>`; `lang`, `dir`, `title` (abbr!), `role` and `aria-*` stay.
   - **code colours** (`config.reader.keepStyles`, default on): on an HTML element that matches
     `config.reader.styleScope` (default `pre, code`, tested against the page's own markup) or lies inside
     one, the `style` text is parsed (`parseStyle()`, `styles.js`) — never applied. Kept: `color`,
     `background-color` (`background` when it is one plain colour), `font-style`
     (`normal|italic|oblique`), `font-weight` (`normal|bold|bolder|lighter|1–1000`), `text-decoration-line`
     (`text-decoration` with `none|underline|overline|line-through` only), custom properties with the
     prefix `config.reader.styleVars`. Colour values: hex (3/4/6/8 digits), `rgb[a]()`, `hsl[a]()` (comma
     or space syntax, `/ alpha`), CSS named colours. A `\`, `/*`, quote, `<`, `>`, `{`, `}`, `@` or
     `!important` anywhere refuses the whole attribute; everything else that does not fit is dropped
     declaration by declaration. The element gets a transient `data-reader-style` index; after the import
     (step 5) the canonical values (`#rrggbb`, `rgb(r g b / a)`, keywords) go on with
     `style.setProperty()` and the marker goes. **Contrast guard** (`guardPair()`): a kept text/background
     pair must reach 2:1 (`MIN_CONTRAST`, alpha blended over what lies below); inside a `<pre>` the surface
     is the code block's (probed once per page: `background-color`/`color` of a hidden `.reader-page pre`,
     fallback `#11171e`/`#dde5ec`), outside a `<pre>` both colours must come from the page (own or from the
     nearest styled ancestor) — else that element's `color` and `background-color` go (its font and
     decoration stay). The tints `reader.css` lays on `mark` and `kbd` (probed with the surface) are
     blended in between (`tintPair()`). An element that keeps a colour gets the checked text colour
     written — also when the page gave only a background, so a desktop rule (link, heading) cannot colour
     its text — and `data-reader-kept` (also set for kept custom properties; a page's own `data-*` never
     survives): `reader.css` lets everything inside it inherit the text colour (`[data-reader-kept] *
     { color: inherit }`, links there underlined), so no link or heading colour of the desktop lands on a
     background the guard never compared it with.
   - ids get a per-window prefix (`r<n>-`); idrefs (`aria-labelledby`, `aria-describedby`, `aria-controls`,
     `aria-owns`, …, `for`, `headers`), `#fragment` links and SVG `url(#…)`/`href="#…"` follow it.
   - classes get a `c-` prefix, so no page class picks up a desktop style (style site classes with
     `.reader-page .c-<class>` in a site stylesheet). The Reader's own `reader-…` classes (`reader-lead`,
     `reader-hero`) stay as they are, as in the original — except `reader-page`, the window's container.
     `visually-hidden` / `sr-only` text of the page stays screen-reader-only (`.c-visually-hidden`,
     `.c-sr-only`).
   - URLs are re-resolved against the page through `router.resolveUrl` (`config.site.hosts` count as this
     origin) and checked: links `http(s)`/`mailto`/`tel`, media `http(s)` (images also `data:image/…`
     raster), `cite` `http(s)`, SVG references only inside the page. Links to other origins get
     `target=_blank rel="noopener noreferrer"`; images `loading=lazy decoding=async`; `<pre>` becomes a
     dark island (`data-island="dark"`).
5. **import** node by node (`document.importNode`), then the kept code colours (step 4). Before that, every heading moves **two levels down**
   (`demotedLevel()`: h1 → h3, h2 → h4, h3 → h5, h4–h6 → h6) — the window title is an h2 and names the
   page, so the page's own outline nests under it; the class `reader-h<n>` keeps the look of the level the
   page wrote (`.reader-page .reader-h1` …).

Window: title-bar navigation `.win-nav` (Back `ti-chevron-left`, Forward `ti-chevron-right`, mirrored for
RTL; phones hide Forward) and actions Reload (`ti-refresh`), Open in new tab (`ti-external-link`); a
focusable scroll area `.reader` (named by the window title; in the Tab order, with an inset focus ring) and
the `.win-loading` spinner.

- **History** per window with scroll positions; back/forward restore the position.
- **Links**: `#x` scrolls the reader only (never the page behind the desktop; smooth unless reduced
  motion); a same-page link with a hash scrolls; same-origin pages that route to the Reader
  (`router.route(url).page`) load in this window (focus moves into the content); apps, files and other
  origins go through `Desk.openUrl` (app window or new tab). Modifier clicks and `mailto:`/`tel:` stay
  with the browser.
- **Language switch** (`relabel`): the page's `<link rel="alternate" hreflang>` for the new language
  (exact code, then the same base language; same origin only); else, while the app's start page is shown
  and the app has a `{ lang: url }` map, the start page of the new language. Button labels relabel;
  a window without a page title (none found, still loading, an error) shows the app name in the new
  language.
- Hooks: `serialize → { scroll }` (the target position while loading), `restore({ scroll })` (validated,
  applied with the first load), `locationOf` (current history entry), `acceptUrl(app, path)` (same-origin
  paths that route to the Reader; never the root or `index.html`, nor a reserved folder — `router.pageAllowed`), `reopen({ url })` (loads the URL),
  `reload`, `popOut`, `menu` (Back, Forward, Reload, Open in new tab).

Service `reader`: `open(url) → boolean` — opens a same-origin page in the page app with the longest
matching URL prefix (`router.pageApp`, else `config.site.defaultPageApp`; nothing for the desktop itself or
`config.vault.dir`, `router.pageAllowed`).

Config `reader` (descriptor `configKey` + `validateConfig`, read via `Desk.modules.config('reader')`):
`rules` (invalid regexes/selectors are reported and skipped), `titleSeparator`, `cacheSize` (0–200),
`keepStyles` (boolean, default `true`), `styleScope` (selector list, default `'pre, code'`), `styleVars`
(`null` or a prefix like `'--shiki-'`: `--`, lower-case letters/digits/hyphens, ending in `-`, max 32;
refused with a warning when its first word is one of the desktop tokens `reader.css` reads — `accent`,
`focus`, `font`, `highlight`, `ink`, `line`, `radius`, `reader`, `scroll`, `text`, `win` (`RESERVED_VARS`,
`util.js`) — or a page could set `--reader-link` or `--text` on its own elements).
A Shiki dual theme (`style="color:#…;--shiki-dark:#…"`) keeps its light colours on the element and, with
`styleVars: '--shiki-'`, the dark ones as custom properties a site stylesheet can use. The kept colours are
inline declarations (CSSOM), so a stylesheet rule only wins with `!important`, and it has to switch text
and background together — otherwise dark-theme token colours land on the kept light background:

```css
:root[data-theme="dark"] .reader-page pre.c-shiki,
:root[data-theme="dark"] .reader-page pre.c-shiki span {
	color: var(--shiki-dark) !important;
	background-color: var(--shiki-dark-bg) !important;
}
```

Colours a site stylesheet applies this way are the site's own choice: the contrast guard only checks the
values the Reader keeps from the page.

## Image viewer (`viewer`, kinds `image` and `viewer`)

- Kind **`image`**: one fixed picture — image items of collections (`url`, `fileName` for downloads) and
  pictures dropped on the desktop (transient apps `viewer-drop-<n>` with a `File`; `transient`, `hidden`,
  `nodock`; they leave the registry with their window).
- Kind **`viewer`**: the app `viewer` ("Image Viewer", `ti-photo`, blue, 820 × 580) — opens pictures from
  the device: title-bar button (`ti-folder-open`), Mod+O, the open button of the empty state, a picture
  dropped on its window. PNG, JPEG, GIF, WebP, AVIF, SVG, BMP, ICO; at most 50 MB.
- Info bar (`ti-info-circle`, Mod+I, `aria-pressed`, `aria-controls`): name, format (+ MIME type; "· vector
  graphic" for SVG), dimensions (SVG: the file's own `width`/`height` in px or its `viewBox`, not the
  browser's 150/300 px fallback; raster: decoded pixels), aspect ratio (`16:9`, else `n:1`), megapixels (two significant digits below 1 MP: `0.0031 MP`, `util.js` `megapixelFormat()`),
  file size (+ exact bytes), modified (File date or `Last-Modified`), source (path or "File from this device").
  Facts come from the `File`, else from one same-origin fetch (`Desk.net.request(url, { read: 'blob',
  maxBytes: 50 MB, onHeaders })`: timeout and size limit cover the body; the date comes from `onHeaders`).
- Download (`ti-download`, `Desk.download`), Open in new tab (`ti-external-link`, site pictures only — see
  below); `menu` lists them with their shortcuts. Errors (not an image, too large, failed to load) show in the empty state (`role=alert`)
  or are announced; they are re-translated on a language switch.
- Blob URLs are revoked when the picture changes and when the window closes; a device file still being read
  when another one is opened (or the window closes) is dropped.
- **Files from the device never open as a document** (ARCHITECTURE §5): an SVG in a `blob:` URL of the
  desktop's origin would run its scripts with access to the desktop's storage if it were opened as a page.
  So a raster device picture gets a blob URL whose type is the checked image type (`util.js` `blobType()`: a
  known image MIME type from the file's type or extension, anything else `application/octet-stream`); a
  device **SVG never gets a blob URL** — it is a document type, and a page opened from a blob URL does not
  inherit the desktop's CSP — but a `data:` URL (`util.js` `deviceSource()`, read with `FileReader`): no page
  can navigate to it and it never has the desktop's origin. The picture is
  shown only in an `<img>` (scripts never run there) that is not draggable (`draggable="false"` — a drop on
  the browser's tab strip would open it); the stage carries `data-contextmenu="none"` (no browser menu with
  "Open image in new tab"); the title-bar button and the menu item "Open in new tab" are hidden, and the
  kind's `canPopOut(win)` answers `false`, so the shell's window menus and `wm.popOut()` leave it out too.
  Its `canLink(win)` answers `false` as well: "Copy link to this window" would only hand out
  `#app=viewer` (an empty viewer), so the title-bar and app menus leave it out.
  Download saves a device picture from its `File` through `Desk.dom.saveFile` (retyped
  `application/octet-stream`), a site picture through `Desk.download`. Pictures of the site (collection items) keep
  "Open in new tab".
- `locationOf`: same-origin pictures only (a device file has no address). No `reload` (a picture is no
  page, as in the original). Pictures of the manifest take their name (title, `alt`) in the current
  language on every language switch.

Contribution `files.image` (drop handler for the shell, P2): `{ label: '@viewer.dropLabel' ("images in the
image viewer", for the overlay's "Opens {list}"), icon, accept, mime, multiple: true, max: 9, open(files, ctx) }` — `multiple` makes the shell hand over all pictures of a drop at once. `open`
takes a `File`, a list or an array; the first picture dropped on a `.win-viewer` window (`ctx.target`)
opens there, every other one (at most 8) in a window of its own; it returns whether at least one opened.
Pictures over 50 MB are refused with an announced message. Without a `drop` service the viewer window
accepts dropped files itself.

Service `viewer`: `openFile(file) → boolean` (the viewer app shows it), `openImage(file) → boolean` (a
window of its own), `open(files, { target }) → boolean` (the drop logic), `formats()`.

## Catalog (`catalog`, kind `collection`)

The icon browser over a collection (`site/apps.js` `collections[]`; the registry creates the Catalog app,
kind `collection`, `app.collection = id`).

- **Sidebar** `nav.catalog-side` (`aria-label` "Categories"): "All" (collection icon/tint) and the groups
  in manifest order with counts; `aria-current="true"` on the shown one; hidden when the collection has no
  groups; chips in a row on phones.
- **Toolbar**: search field (`ti-search`; matches name, description and host; case- and
  diacritic-insensitive, every word must occur; the first Esc clears it) and "Overview on the web"
  (`ti-world`) when the collection or its Catalog app has a `webApp` that is registered and openable
  (launched with `Desk.launch`; the collection's value first, then the Catalog app's; never a Catalog of
  the same collection) or a `webUrl` (opened through `Desk.openUrl`; a `webUrl` whose route is a Catalog
  of this collection — it equals `basePath` — opens in a new tab). `webApp` wins; `webUrl` is used when
  no `webApp` is available. Recommended `webApp` target: a hidden `web` app (a `page` app at `basePath`
  would get a deep link to the Catalog); a Reader overview only needs `webUrl: '<basePath>index.html'`.
  The button and its menu entry follow `'apps:change'` (an app that registers later shows the button).
- **Per-collection wording**: optional `allLabel` (the "All" entry, e.g. "All tools") and `webLabel` (the
  web button, e.g. "Arcade hall") — text, `'@ns.key'` or `{ lang: text }` — on the collection or its
  Catalog app; otherwise "All" / "Overview on the web".
- **Grid** `ul.catalog-grid` (`aria-label` = section or "Search"): `button.catalog-item[data-app]` with
  tile and label, `title` = description, link items named `<name> (opens in new tab)`. Order from the
  registry (`sort: 'alpha'` → group order, then name in the current language; `'manual'` → manifest
  order). Only items that can open now are listed.
- **Interaction** (as in the original): mouse click selects, double click opens; keyboard (Enter/Space)
  and touch/pen open on click. New: one tab stop (roving `tabindex`), arrow keys/Home/End/PageUp/PageDown
  move focus and selection (mirrored for RTL), ArrowDown in the search field enters the grid, ArrowUp in
  the first row returns to it.
- **Status bar**: `<name> — <description> · <host>` of the selection and its actions; otherwise the item
  count. Actions (`catalog.actions(app)`): Documentation (`item.docs`, `ti-book`), Guide (`item.guide`,
  `ti-compass`) — URLs or `{ lang: url }` maps, relative to the root or http(s), opened through
  `Desk.openUrl`; checked with the shared rule of `src/core/url.js` (`isSafeUrl`: no control characters,
  no backslash), by the registry when the item is loaded (a bad link is dropped with a warning) and again here; Download for `image` items and items with `download: true`; Open in new tab for links.
  `docs` should be a page (the Catalog opens it); the text twin for the terminal is `man` (ARCHITECTURE §7).
- Redraws on `'apps:change'` (vault unlock, modules) once per batch, keeping selection and focus; on a
  language switch (`relabel`).
- Hooks: `serialize → { section }` (when not "All"), `restore` (validated id), `menu` (Open — "Open in
  new tab" for links, whose 'tab' action is then not listed again —, the actions, the web button),
  `unmount` (removes the listener).

Contribution `contextMenu: [{ selector: '.catalog-item', label(el), select(el), items(el, ctx) }]` →
`ctx.appItems(app, actions)`: the shell's app menu (Open / Open in new tab, Copy link, Add to / Keep in
Dock) with the item's actions in between (an action labelled like a base entry is not listed twice); the
menu is named `<name>: actions` and `select` selects the item first, as in the original.

Service `catalog`: `open(collectionId) → boolean`, `actions(app) → [{ id, label, icon, run }]`.

## CSS

Loaded as `windowStyles` with the first window of the kind (see above). Layer `modules` (+ `compact` for `body.compact`), tokens only, logical properties, nesting ≤ 3:
`.reader*` (typography, hero, lead, code blocks with `--reader-code-bg` and `--scroll-code-thumb`,
tables, details, abbr), `.viewer*` (checkerboard `--check-a/--check-b`, empty state, info bar),
`.catalog*` (sidebar, toolbar, grid, items, status bar). Compact: Reader without Forward and with
larger text, viewer info bar below the picture, Catalog groups as chips, 16 px search field.
The Catalog items carry their own look (no dependency on the shell's `.icon` styles).

## Deviations from the original and why

- **Extraction by `config.reader.rules`** instead of the hard-coded `#content` / `#main-content` /
  `header h1 > a > small` structure of the private site. The original's "small inside the heading is the
  lead" rule is replaced by the `lead` selector.
- **Allowlist sanitiser** instead of the original's denylist (which let `<base>`, `style` and SVG
  animation through). Classes still get the `c-` prefix and `reader-*` classes pass through (not
  `reader-page`); the site-specific `.c-*` styles are not ported (the generic `.c-visually-hidden` is).
- **Same-origin only** for Reader fetches; responses are size-limited and time out (15 s).
- **Language switch** also follows a page app's `{ lang: url }` map while the start page is shown (the
  web kind does the same); alternates match by base language (`de-DE` for `de`).
- **Reader app menu** (Back, Forward, Reload, Open in new tab) and an accessible name for the scroll area.
- **Viewer**: numbers, sizes and dates through the i18n formatters (no `de-DE`/`en-GB` ternary, "Bytes"
  translated); facts fetched only for same-origin pictures (no remote fallback to the author's site);
  errors re-translate on a language switch; the 50 MB limit is a placeholder in the message.
- **Catalog**: data-driven from collections (no fixed tools/games/links/portfolio sources, no site app
  ids; per-collection labels through `allLabel`/`webLabel`; the web button launches an app named by the
  collection (`webApp`, as the original's hidden sub-windows) or opens `webUrl`); several status-bar actions instead of one; locale-aware, diacritic-insensitive search; keyboard
  grid navigation with one tab stop; the sidebar hides without groups; the shown section survives a
  session restore.
- **CSP reports while parsing** (1.3.0): Chromium checks the window's CSP while `DOMParser` builds an
  inert document, so a page with `<base>`, `<style>` or `style=""` produced (blocked) `base-uri`/
  `style-src` reports — hundreds for a page of highlighted code. Measured in headless Chromium: every parse
  mode bound to the window reports (`DOMParser`, `Document.parseHTML[Unsafe]` even with a sanitizer
  config, `XMLHttpRequest` documents, `<template>` content, `createContextualFragment`), stripping on the
  inert document is too late, `importNode` and the sanitiser add none; a parser from a detached
  `about:blank` window reports none. Rejected: a string pre-filter (a regex or tokenizer rewrite can merge
  tokens — `<<style>…</style>script>` becomes `<script>` — and would also change code samples in the
  text), `style-src-attr 'unsafe-inline'` (weakens the whole desktop), a helper page with a laxer CSP
  (server changes), letting `importNode` carry the page's `style` (clones are not checked in Chromium —
  the page text would apply unfiltered).
- **Code colours** (1.3.0): the original dropped every inline style, so highlighted code lost its colours;
  the allowlist above keeps colour, weight, style and decoration only, re-serialised and set through
  CSSOM, with a contrast guard against hidden text.
