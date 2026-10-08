# P2 — Shell

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

The shell is the core part `shell` (`src/shell/index.js`). It owns everything around the windows:
the menu bar (model, status area, clock, language switch, fitting), the dock, the desktop icons,
"All apps", keyboard shortcuts, context menus, title-bar fitting, notification banners, deep links,
file drops and the power screens (boot, restart, shut down). It is a port of the original
`desktop.js` (Menus model, Dock, Icons, Launcher, Shortcuts, Links, Drop, context menus, Chrome,
clock + language, MenubarFit/TitleFit, Power, the banner half of Notify).

Every part starts on its own (`part()` in `index.js`): one that throws is reported and left out,
the rest keeps working. The shell has no `requires`; it reaches the window manager and every
other service at the moment of use (`service('wm')?.…`), so it also boots without them.

## Files

| File | Provides |
|---|---|
| `index.js` | descriptor: i18n `shell` + `wm`, styles, the `launcher` app, storage keys, reset group `dock`, setup |
| `menus.js`, `menus.css` | the menu engine (foundation; service `menus`) |
| `menubar.js`, `menubar.css` | menu bar model (brand, app, site, Window, Help), status area — service `menubar` |
| `clock.js` | clock button `#mb-clock` — service `clock` |
| `lang.js` | language button `#mb-lang` — service `langmenu` |
| `menubar-fit.js` | `body.mb-tight` and the app-name tooltip |
| `title-fit.js` | WM decorator: `--title-side`, `.is-folded`, "More actions" |
| `dock.js`, `dock.css` | the dock — service `dock` |
| `desktop-icons.js`, `desktop-icons.css` | desktop icons — service `desktop` |
| `launcher.js`, `launcher.css` | "All apps" — service `launcher`; `launcherEntries(apps)` (pure): never the launcher, dropped files or collection items — alias items (`item: true`, a bookmark pointing at an app) included; the Catalog apps themselves (kind `collection`, e.g. Bookmarks, Showcase) are listed. About this desktop counts the same set |
| `shortcuts.js` | shortcut registry — service `shortcuts` |
| `context-menu.js` | context menus — service `contextmenu` |
| `notifications.js`, `notifications.css` | banners — service `notifications` (`Desk.notifyBanner`) |
| `deeplinks.js` | `#/path`, `#app=`, `#app=<id>&path=`, `#search=`, history — service `deeplinks` |
| `drop.js`, `drop.css` | dropped files — service `drop` |
| `power.js`, `power.css` | boot screen, restart, shut down — service `power` |
| `contrib.js` | helper: follow a contribution point (`module:loaded` / `module:failed`) |

## Services

| Service | API |
|---|---|
| `menubar` | `render()`, `addStatus(el, order) → remove()`, `update(id)` |
| `dock` | `render(force?)`, `bounce(id)`, `tileFor(appId) → .tile`, `pins()`, `isPinned(id)`, `canPin(id)`, `pin(id)`, `unpin(id)`, `canMove(id, ±1)`, `move(id, ±1)`, `reset()`, `isCustom` (getter), `size()`, `setSize('small'\|'medium'\|'large')`, `sizes()`, `magnify()`, `setMagnify(on)` |
| `launcher` | `open(q?)`, `close(returnFocus?)`, `toggle()`, `isOpen()`, `relabel()` |
| `desktop` | `render(force?)`, `select(btn)`, `enabled()` (config), `hidden()`, `setHidden(hidden)` |
| `shortcuts` | `add({ id, keys, run, label, hint, scope, app, inEditable, when }) → remove()` (or `add(fn)` — `fn(e) → true` when handled), `list()`, `watch(frame)`, `parse(spec)`, `matches(parsed, e)` |
| `contextmenu` | `add(selector, items(el, ctx), { label, select }) → remove()`, `resolve(el)`, `open(el, x, y, keyboard)`, building blocks `appItems(app, extra)`, `windowItems(win)`, `pinItems(app)`, `linkItems(app)`, `group(...lists)`, `addressOf(app)` |
| `notifications` | `show({ title, body, icon, tint, app, url, meta, date, timeout, run }) → { close() } \| null`, `clear()`, `when(ms)`, `stamp(ms)` |
| `deeplinks` | `linkFor(win)`, `hashFor(win)`, `hashOf(info)` (pure: the hash for what `hashFor` collected), `open(hash)`, `parse(hash)`, `start()` |
| `drop` | `handlers() → [{ id, module, label }]`, `handle(id, def) → remove()`, `open(files, target?)`, `kindOf(file)` |
| `power` | `boot()`, `restart()`, `shutdown()`, `isOff()` |
| `clock` | `tick()`, `seconds()`, `setSeconds(on)`, `button` |
| `langmenu` | `render()`, `set(code)`, `items()`, `button` |

### Menu bar model

Registered through `menus.register()` (ARCHITECTURE §20):

| id | order | compact | Content |
|---|---|---|---|
| `brand` | 0 | keep, `host` | glyph `config.brand.glyph`, aria `shell.brandMenu` (`config.brand.menuLabel`): About this desktop, Settings, — Wallpaper, Backup, — `config.site.home` ("Classic website"), `config.site.legal` (on phones without the entries a folded site menu already offers), — Restart, Shut down |
| `app` | 10 | keep | label: active app name (else `config.brand.menuLabel`); items: "Copy link to this window" (not while `wm.canLink(win)` is false — a file from the device) + `wm.menu.app(win)`; a window kind without its own menu (only Quit) gets About this desktop, How it works before Quit; without a window: About this desktop, How it works |
| `site-<id>` | 20+ | fold | one per `site/apps.js` `menus[]` entry |
| `window` | 80 | fold | `wm.menu.window()` |
| `help` | 90 | fold | How it works, — the author's profiles (`config.author.links` → `author-<id>` apps) |

Entries for apps that cannot open now (panel or module missing) are left out. Site menus:

```js
menus: [{ id: 'pages', label: { en: 'Pages', de: 'Seiten' },
          items: ['about', '-', { collection: 'bookmarks' }, { label: { en: 'Docs' }, url: 'docs/' },
                  { label: 'More', items: ['imprint', 'privacy'] }] }]
```

`{ collection: id }` expands to "Open <collection>" (its Catalog app) and the groups as submenus
(or the items directly when the collection has no groups). `{ label, items }` is one level of
submenu; a grouped collection inside it is listed flat (its groups' items separated by `-`), because
the engine opens one submenu level (`siteEntries(list, depth)`). Invalid entries are warned and skipped (`cleanSiteMenus`).

**Status area** (`#mb-status`): `menubar.addStatus(el, order)` — search 10, language 80,
weather 85, clock 90 (weather and clock, both calendar openers, side by side as in the original). Hovered status buttons get the shared highlight (`.mb-right .mb-item:hover`).

### Shortcuts

Built in: `config.search.shortcut` (Mod+K) toggles the search (only while a `search` service
exists; a module shortcut with the id `search` replaces it; `null` — also `false` or `''` — switches it
off: no key, no row in `list()`), F3 and Ctrl+↑ the overview (Ctrl+↑ not
while typing), Ctrl+Backquote / Ctrl+IntlBackslash the next window, with Shift the previous one.

Key specs: `Mod` (Ctrl or ⌘ — either is accepted, as in the original), `Ctrl`, `Alt`, `Shift`,
`Meta`, then a `KeyboardEvent.key` name (`K`, `F3`, `ArrowUp`, `/`, `Space`) or a physical code
(`Backquote`, `IntlBackslash`, `KeyK`, `Digit1`). `inEditable` (true/false/`(e) → boolean`, default:
combinations with Ctrl/⌘/Alt and function keys) decides whether a shortcut fires while typing in
a field. `scope: 'window'` fires only while a window of the contributing module (or `app`) is active.
`list()` returns `[{ id, keys (first spec), combos, display, label, scope, module }]` — `display` is
ready to show (the `hint`, else every combination through `i18n.keys()`).

### Text in another language

Names and labels that fall back to another language than the page's (an app name `{ en, de }` while the
page is in a third language, a site menu label, a locale key the language lacks) carry their `lang`
(and `dir`, `Desk.dom.markLang`): dock labels (the button too while its accessible name is the bare
name), desktop icon and launcher labels, menu items filled from an app (`item.lang`), site menus and
their items, the app menu title and window titles (`registry.nameLang(app)`). Folded site menus keep it
in the host menu on phones.

### Context menus

Resolution order: `data-contextmenu="none"|"native"|"click"` on an ancestor (`click`: a right-click
clicks that element) → menus/popovers
(`.menu .calendar .tilemenu .boot .power-off .dropzone`: none) → **registered menus** (the matching
element closest to the target wins; a string `label` goes through `L()`) → menu bar (a right-click
opens a menu title, the clock or the weather; other status buttons such as language and search do
nothing, as in the original) →
dock item / bare dock → All apps item → zoom button (none: the tile menu's long press) → title bar
or the focused window (window menu) → window content (browser menu) → desktop icon → desktop.
Long press (550 ms) for touch and pen; the ContextMenu key and Shift+F10 open at the element's centre
with the first item focused.

## Contributions consumed

| Point | Shape | Consumer |
|---|---|---|
| `shortcuts` | `[{ id, keys, run(e), label, hint, scope, inEditable, when }]` | `shortcuts.js` |
| `contextMenu` | `[{ selector, items(el, ctx), label?(el), select?(el) }]` | `context-menu.js` |
| `files` | `{ <kind>: { accept: ['.md'], mime: RegExp \| 'text/', label, multiple, max, order, open(file \| files, ctx) } }` | `drop.js` |

`files`: a file goes to the first handler (by `order`, default 50) whose `mime` matches its type
or whose `accept` lists its extension; a handler without both takes the files of the built-in kind
named by its key (`image`, `text`, `audio`, `video` — MIME type, else extension). `multiple: true`
gets all its files at once (playlists), otherwise one after the other (`max`, default 10).
`ctx = { target, files }` (`target`: the element dropped on — the viewer can take the first image
itself when it was dropped on its window). Images without a handler go to `viewer.openFile(file, ctx)`.
`label` (e.g. `'@editor.dropLabel'` = "text in the editor") feeds the overlay's hint "Opens {list}".

## Bus events

Emitted: `dock:change { pins }`, `popovers:close { except: 'launcher' }`.
Consumed: `window:open/close/focus/minimize/change`, `apps:change`, `lang:change`, `env:compact`,
`store:change`, `storage:reset`, `storage:restore`, `service:provide`, `trash:change`, `vault:change`,
`module:loaded`, `module:failed`, `popovers:close`, `desk:ready` (deep links start, then the boot screen).

## Config keys read

`brand.menuLabel`, `brand.glyph`, `credit`, `author.links`, `languages` (through i18n), `site.home`,
`site.legal`, `site.origin` (shared links), `dock.size`, `dock.magnify`, `dock.pins`, `dock.max`,
`desktop.icons`, `boot.enabled`, `boot.ms`, `power.shutdownUrl` (URL or `{ lang: url }`, http(s) only),
`search.shortcut`, `notify.hideMs`, `notify.maxBanners`, `ui.animMs`. All read defensively (invalid → default).

## Storage keys (declared in the descriptor)

| Key | Type | Reset group | Meaning |
|---|---|---|---|
| `dock` | json | `dock` (order 30) | own pin list (validated ids, at most `config.dock.max`) |
| `docksize` | text | `settings` | `small` / `medium` / `large` |
| `magnify` | text | `settings` | `on` / `off` |
| `icons` | text | `settings` | `shown` / `hidden` |
| `seconds` | text | `settings` | clock with seconds `on` / `off` |

sessionStorage `booted` (boot screen once per session; `theme.js` reads it before the first paint).

## i18n

Namespace `shell` (`locales/en/shell.js`, `locales/de/shell.js`); also uses `core` and `wm` keys.
`shell.clockDate` orders the clock's date parts per language (`{weekday} {day} {month}`;
German `{weekday} {day}. {month}`). The two-language toggle's accessible name ends with the action in
the TARGET language (`shell.langToggle` "Sprache: {current}.", then the other language's
`shell.langSwitchTo`, read from its own `locales/<code>/shell.js` along its lookup chain; until loaded,
the current language's phrase): German UI reads "Sprache: Deutsch. Switch to English", as in the
original. The name comes from the button's content — two visually hidden spans, the action's span with
`lang` (and `dir` when it runs the other way) of the target language — not from `aria-label`, which is
one string without a language: screen readers would speak the English action with the German voice.
`title` keeps the joined text. Dock items carry their state in the name: `shell.dockOpen` ("Notes,
open"), `shell.dockMinimised`, `shell.dockTrashFull` (plural, "Trash, 3 items"). Three or more
languages get a menu of radio items, each named in its own language and marked with it (menu item
`lang: code` → `lang`, and `dir` when it runs the other way than the page; `menus.js` `labelLang()`), so
screen readers pronounce each name correctly.

## Icons

`ti-layout-grid` (All apps), `ti-world` (language), `ti-dots` (More actions), `ti-search`
(launcher field), `ti-file-import` (drop), `ti-x` (banner close), `ti-bell` (banner default),
`ti-power` (off screen), the brand glyph (`config.brand.glyph`, default `jpk`).

## CSS

Layer `shell` (+ `compact` for `body.compact`): `menubar.css`, `dock.css`, `desktop-icons.css`,
`launcher.css`, `notifications.css`, `drop.css`, `power.css`. Tokens only (no colour literals);
z-indexes from `--z-*` (the drop zone sits at `--z-notification + 10`). Body classes set by the
shell: `dock-small`, `dock-large`, `dock-magnify`, `dock-dragging`, `icons-hidden`, `mb-tight`.

## Deviations from the original and why

- **Declarative menus** instead of `model()`: site menus come from `site/apps.js`, the brand menu's
  home/legal entries from the config; the hard-coded Pages/Tools/DB/Bookmarks menus, imprint/privacy
  ids and `/` vs `/en/` links are gone. Author links stay in the Help menu (as in the original).
- **Collections** replace the fixed tool/link categories: `{ collection: id }` in a site menu.
- **Desktop icon columns** use a wrapping flex column (`wrap-reverse`) instead of the
  `direction: rtl` grid trick — the same look, and mirrored correctly in right-to-left languages.
- **Dock**: "All apps" and the trash are optional (no crash without them); the trash tile shows the
  app's `iconFull` while `trash.count() > 0`; ids are escaped in selectors; Alt+arrows, drag and the
  "Move left/right" items follow the visual direction in RTL; `config.dock.pins`/`max` added.
  With magnification on, the grown tiles also make room (`dock.css`, "makes room"): the hovered item
  and its direct neighbours get the width they gained as `margin-inline` (half on each side, with a
  transition), so the neighbours and the separator move aside instead of being drawn over. The
  original only scaled the tiles with `transform`, so hover never changed the layout. Off while
  reordering (`dock-dragging`, dock.js measures the items then) and in the compact layout.
- **Launcher** lists `registry.list()` minus collection items and transient apps (the original listed
  the manifest's top-level apps); "Search everywhere" only when a search module is loaded.
- **Shortcuts** became a registry with key specs, labels (help panel), scopes and contributions;
  the original's function form `add(fn)` still works.
- **Context menus** consume `contextMenu` contributions (Catalog items, the trash's dock item, …)
  and offer their building blocks to them; `data-contextmenu` opt-outs added.
- **Drop** dispatches through `files` contributions instead of fixed image/text/audio/video handlers;
  images go to the viewer service instead of creating transient image apps here.
- **Deep links** reject paths with backslashes or control characters (browsers read `\` as `/` and
  drop tabs/newlines, so `#/\host` would be an open redirect — present in the original too), and
  `open()` refuses any path that resolves to another origin. A page path the router does not allow
  (`router.pageAllowed`: the desktop's own root or `index.html`, `config.vault.dir`) is ignored silently —
  it would otherwise land in the default page app (`#/index.html` → an empty "About" window).
  `parseHash` also drops paths that cannot be pages of the site: a scheme-like first segment
  (`#/blob:…`, `#/data:…`) and dot segments (`#/../../etc/passwd`, also `%2e`) — before, they opened
  the default page app with "Page unavailable" and a 404 request.
- **Deep links to a window's own location** (`#app=<id>&path=/…`): new. Written and read only for apps with
  `linkPaths: true`; the path is checked twice — by `parseHash` (the `#/…` rules) and by the app's kind
  (`wm.acceptUrl(app, path, 'link')`); a refused path opens the app at its start page. Unknown parameters
  after `app=<id>` are ignored, so later formats degrade to opening the app. A link for a web window the
  session has just restored wins over the restored location (its frame is still loading: untouched).
- **Legal entries on phones**: the original dropped imprint/privacy from the brand sheet because its
  folded Pages menu listed them. The port only drops the `site.legal` entries a site menu already
  offers, so they stay reachable when the site menus do not include them.
- **Clock date** comes from a locale template instead of a German/English branch.
- **Boot screen** shows the author credit ("JPKCom Desktop by Jean Pierre Kolb", `config.credit`) and
  replaces the pre-paint cover on `desk:ready`. **Shut down** goes to `config.power.shutdownUrl` or to
  an off screen with a power button (the original went to the classic website); the rest of the page
  is `inert` meanwhile — every body child but the off screen, also overlays added later. The keyboard
  is shut out too: from the moment the screen starts to darken `power.isOff()` is true, the shortcuts
  ignore every key and a guard in the window's capture phase stops every `keydown`/`keyup` before
  any other listener (menus, context menu, the search's "/"); the power button keeps its default
  Enter/Space/Tab behaviour. Back after a `shutdownUrl` can restore the page from the back/forward
  cache still dark and guarded: a persisted `pageshow` while off reloads it with the boot screen
  (`initPower()`).
  Restart and shut down save the session first. The brand menu's "Restart …" and "Shut down …" ask
  first with a sheet (`dialog.confirm`, Cancel / Restart or Shut down; new — the original acted at
  once although the labels end in an ellipsis); `power.restart()` / `power.shutdown()` themselves act
  at once (Backup and Reset call `restart()` after their own question).
- **Banners** are generic (`notifications.show`), the feed logic is the notify module's.
- **Banners never cover the desktop icons** (the original let them lie on the first icon and take its
  clicks): on wide screens the stack sits next to the first icon column; on phones the icon grid moves
  below the stack while one is shown (`body.has-notifs`, `--notifs-h` on `body`, kept by a
  `ResizeObserver` in `notifications.js`). Icon labels break at hyphenation points (`hyphens: auto`),
  on phones at most two lines.
- **Menu engine fix** (`menus.js`): Esc now also closes a menu that was opened by mouse while the focus
  stayed outside it (a context menu under a still pointer); before, only items with focus reacted.
- **Focus after a menu item** (`menus.js` `activate()`; the original dropped it to `<body>`): before
  the action runs, the focus goes back — from a menu of the bar to where the person was before entering
  the bar (a window, the desktop; WAI-ARIA menubar), else the bar button; from a context menu or
  dropdown to its opener. A sheet the action opens (Restart …, Shut down …) therefore returns there.
  Should the focus still end on `<body>` (the dock rebuilt its buttons), it goes to the same app's dock
  item, the active window or the bar. **Tab** in an open menu returns to the bar button (or the opener)
  first, so the browser's own Tab continues after the menu bar — not past the menu at the end of
  `<body>`.
- **Forced colours** (Windows High Contrast): menus get a frame, the focused item the system's
  `Highlight`; the selected desktop icon too (and no longer every tile with the forced outline).
- **Light wallpapers**: `html[data-wp-tone=light]` (panels, `wallpaper.js`) puts a darker layer over
  `--menubar-bg` and a backplate under the white icon labels; the icons' focus ring has a dark halo.
- **Notification close button**: a 44 px hit area around the drawn 20 px circle on touch screens and
  phones (WCAG 2.5.8).
- `document.title` follows the active window in the window manager (`wm.docTitle`), not in the shell.
