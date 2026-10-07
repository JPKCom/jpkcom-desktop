# P3 — Panels

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

The core part `panels` (`src/panels/index.js`, kind `core`, loaded after `wm` and `shell`): the
native windows Settings, Wallpaper, Backup, Trash, About this desktop and How it works, the
appearance preferences (theme, accent), the wallpaper layer with its motif generators
(`src/wallpapers/`), the trash store, the backup file and the PWA registration.

## Files

| File | Purpose |
|---|---|
| `src/panels/index.js` | descriptor: apps, storage keys, reset groups, services |
| `src/panels/settings.js` | theme/accent preferences, the settings window, section and row registry, reset section |
| `src/panels/wallpaper.js` | wallpaper layer, motif registry, wallpaper panel |
| `src/panels/backup.js` | backup download, import preview, restore |
| `src/panels/trash.js` | trash store and window |
| `src/panels/about.js` | About this desktop |
| `src/panels/help.js` | How it works (generated) |
| `src/panels/install.js` | service worker registration, install offer, offline reset |
| `src/panels/pure.js` | pure helpers (contrast, wallpaper values, trash items, summaries) — unit-tested |
| `src/panels/settings.css`, `wallpaper.css`, `panels.css` | `@layer panels` + `@layer compact` |
| `src/wallpapers/kit.js` | the motif contract (`checkMotif`) and SVG building blocks |
| `src/wallpapers/author.js` | author motifs: `author-monogram` (glyph `jpk`), `author-emblem` (`icons.logo('jpkcom')`), `author-blueprint` |
| `src/wallpapers/motifs.js` | `waves`, `dunes`, `aurora` (heavy), `orbit`, `horizon`, `graphite` |
| `src/wallpapers/index.js` | `BUILTIN_MOTIFS` |
| `tests/p03-panels.test.mjs` | unit tests of `pure.js` and the motif list |

## Apps (kind `native`)

| Id | Name | Icon | Notes |
|---|---|---|---|
| `about-desktop` | `@about.title` | `config.brand.glyph` (fallback `ti-info-circle`) | `fixed`, 360×500 |
| `settings` | `@settings.title` | `ti-settings` | hooks `mount(win, body, bar, { section })` (a native panel with `mount()` gets the open options, so `Desk.launch('settings', { section })` also picks the section of a new window), `relabel` (rebuilds in the new language), `reopen(win, { section })`, `serialize` → `{ section }`, `restore` |
| `wallpaper` | `@wallpaper.appName` | `ti-wallpaper` (teal) | |
| `backup` | `@backup.appName` | `ti-archive` | |
| `trash` | `@trash.title` | `ti-trash`, `iconFull: 'tif-trash'` | `nodock` (the dock places it itself and shows `iconFull` while `trash.count() > 0`) |
| `help` | `@help.appName` | `ti-help-circle` | |

## Services

**`settings`**

```ts
show(sectionId?)                 // opens the window at a section (Desk.showSettings)
sections() → [{ id, label, icon, tint, order }]   // sections that have rows now
redraw()                         // rebuilds open settings windows (focus kept via data-key)
row(label, hint, control)        | row({ label, hint, control })
toggle(key, label, hint, checked, onChange, plain)        | toggle({ key, label, hint, checked, onChange, plain, disabled })
segments(key, label, hint, options, value, onChange)      | segments({ … })   // options [[value, text, lang?]] or [{ value, label, lang }]
select(key, label, hint, options, value, onChange)        | select({ … })
button(key, label, run, disabled)                         | button({ key, label, run, disabled, primary, danger })
addSection({ id, label, icon, tint, order }) → remove()   // runtime (site scripts); modules use the descriptor
addRow({ id, section, order, render(ctx) }) → remove()
get() → { theme, accent, resolved }      set('theme' | 'accent', value) → boolean
```

Labels and hints may be text (`'@ns.key'`, `{ lang: text }`, plain strings) or nodes. Prefer `'@ns.key'`
over `t('ns.key')`: a key or map entry that falls back to another language than the page's is then
rendered as `<span lang>` (`Desk.dom.langText`), option labels get `lang` the same way (WCAG 3.1.2). `data-key`
identifies a control across redraws; radios additionally by value.

**`wallpaper`**: `register(motif, { module }?) → boolean` (with a module id — or `motif.module` — the
motif goes again on `'module:failed'` of that module; an active one falls back to the default while the
stored choice is kept), `unregister(id) → boolean` (module motifs only), `set(value) → boolean`, `get()`, `menuItems()` (radio
items for a context menu), `motifs() → [{ id, name }]`, `keyOf(value)`, `open()`.

**`backup`**: `download()`, `snapshot()`, `open()`. **`trash`**: `add(type, title, data) → boolean`,
`count()`, `list()`, `putBack(id) → Promise<boolean>`, `purge(id)`, `empty()`, `askEmpty()` (opens the
window and asks), `open()`. **`about`**, **`help`**: `open()`. **`install`**: `state`
(`'installed' | 'offer' | 'share' | 'menu' | 'off'`), `enabled`, `run()`.

## Contributions consumed

- `settingsSections: [{ id, label, icon, tint, order }]` — extra sections (shown only when they have rows).
- `settings: [{ id, section, order, render(ctx) → Node | Node[] | null }]` — rows. `ctx` = `{ section, row,
  toggle, segments, select, button, redraw, h, t, L }`. **A contribution with the id of a built-in row
  replaces it.** Read live on every redraw (failed modules are withdrawn by the loader).
- `storage`/`resetGroups` of every module (through the storage registry) — backup summary and reset section.
- `trash` types of every module (`storage.trashType(type)`) — put back; `app` decides the tile.
- `consent` services (`consent.list()`) — one switch per offered service in "Online services".
- `shortcuts.list()` — the help panel shows each entry's ready `display` (every combination, or the
  layout hint such as Ctrl + ^ / Ctrl + \`), and the window overview row names the keys of the `overview`
  and `next-window` shortcuts (falls back to a text without keys when they are missing).

## Contributions offered

- `contextMenu: [{ selector: '#dock .dock-item[data-app="trash"]' }]` — the trash tile's menu in the dock:
  Open, a separator, "Empty Trash …" (disabled while empty; opens the bin and asks there), as in the
  original. It wins over the shell's generic dock menu (contributions resolve first).

Built-in sections and rows (`order`):

| Section | Rows |
|---|---|
| `general` (10) | `lang` 10 (segments for ≤ 3 languages, a select for more; names from `displayName()`), `restore` 20 (needs `session.setKeeping`), `seconds` 40 (needs `clock.setSeconds`/`seconds`), `install` 60 (PWA ready) |
| `look` (20) | `theme` 10, `accent` 20 (config accents + custom colour picker with contrast hint), `wallpaper` 30 |
| `dock` (30) | `icons` 10 (`desktop.setHidden/hidden/enabled`), `docksize` 20 (`dock.size/setSize/sizes`), `magnify` 30 (`dock.magnify/setMagnify`), `dockreset` 40 (`dock.reset`, `dock.isCustom`) |
| `online` (40) | `consent` 10 — one switch per `consent.list()` service; intro text only when the section has rows; hidden when empty |
| `data` (50) | `storage` 10 (`store.usage()` + `fmtBytes`), `backup` 20, `trash` 30 |
| `reset` (90) | `reset` 10 — every `storage.resetGroups()` group with its state; "Reset everything" also removes every key of the namespace and calls `vault.forget?.()` |

Rows whose service is missing are left out, so the section list follows what is loaded.

## Events

| Event | Payload | When |
|---|---|---|
| `theme:change` | `{ theme, resolved, accent }` | theme or accent changed, or the system scheme changed while `auto` |
| `wallpaper:change` | `{ value }` | `wallpaper.set()` |
| `trash:change` | `{ count }` | any change of the trash (also from another tab) |
| `install:change` | `{ state }` | **new**: install offer arrived/used, app installed, display mode changed |

Listened to: `store:change`, `storage:reset`, `consent:change`, `consent:register`, `service:provide`,
`module:loaded`, `module:failed`, `dock:change`, `vault:change`, `install:change`, `env:motion`.

## Config keys

`theme.default`, `theme.accent`, `theme.accents`, `theme.allowCustomAccent`; `wallpaper.default`,
`.motifs` (ids offered, in order), `.colors` `[{ id, color, name }]`, `.gradients`
`[{ id, from, to, dir, name }]`, `.images` `[{ id, src, name, credit, tone }]` (src: a path on this site;
tone: `'light'` for a light picture — see "Wallpaper tone" below; default `'dark'`),
`.reducedEffects` (`'auto' | 'on' | 'off'`); `trash.days`, `trash.max`; `backup.format`,
`.filePrefix`, `.maxBytes` (`trash.*` and `backup.*` are validated by the core's `validateConfig()`; the
panels read them as they are); `about.rows` (array of `{ label, value }` or a language map of such arrays —
**replaces** the automatic rows system/apps/languages/licence; a value is a text or an array of parts,
texts and `{ text, lang?, abbr? }` — `[{ text: 'HTML', abbr: 'Hypertext Markup Language' }, ', ',
{ text: 'Vanilla JavaScript', lang: 'en' }]` renders `<abbr title>` and `<span lang>`; `pure.js` `rowParts()`), `about.moreInfo` (app id or URL),
`about.copyright` `{ holder, since }` (holder: a name, or its parts with their languages
`[{ text: 'Jean Pierre', lang: 'fr' }, { text: 'Kolb', lang: 'de' }]` — joined with spaces, each part with a
`lang` gets a `<span lang>`; a holder equal to the project author gets the author's parts automatically); `credit`; `brand.name`, `brand.logo`, `brand.glyph`;
`site.description` (help intro); `search.shortcut` (help text); `pwa.enabled`. Every entry is checked;
invalid ones are warned about and skipped.

## Storage keys

| Key | Type | Reset group | Notes |
|---|---|---|---|
| `theme` | text | `settings` | `dark` / `light` / `auto` |
| `accent` | text | `settings` | config accent id or `#rrggbb` (with `allowCustomAccent`) |
| `wallpaper` | json | `wallpaper` (20) | validated value; a listed motif not registered yet is kept and applied when it registers; the original's motif ids `monogram`, `emblem`, `blueprint` map to `author-…` (stored values, old backups, `set()`) and a migrated stored value is re-saved |
| `trash` | json | `trash` (80) | `{ items: [{ id, type, title, data, deleted }] }`; expired items dropped on load; unknown types kept |

Reset group `offline` (95, no keys; registered only when service workers exist): unregisters the service
worker whose scope is exactly this installation's root (a desktop at `/` leaves the one in `/desk/` alone)
and deletes the caches of `sw.js`'s naming scheme for this root, whatever the namespace
(`install.js` `ownCaches(root)`: `<namespace>:<base>:<version>-<hash>` and `<namespace>:<base>:pages`, the
pattern `sw.js` uses on activation; ARCHITECTURE §14).
`docksize`, `magnify`, `icons`, `seconds` belong to the shell (P2); the rows here go through its services.

## i18n namespaces

`settings`, `wallpaper`, `backup`, `trash`, `about`, `help` (en + de). Accent names: `settings.accent.<id>`
(fallback: the id). Motif names: `wallpaper.motif.<name>`. Also offered for other parts:
`wallpaper.menu`, `trash.empty`. (Keys no source refers to are removed, so translators never
translate dead strings — `npm run i18n:check` warns about them.)

## Motif contract

```js
{ id, name, bg, tone?, heavy?, available?() → boolean, build(uid, { reduced }) → SVGElement }
```

`tone` (`'light' | 'dark'`, optional): how light the motif is under the white menu titles and icon
labels; without it the brightest `#hex` colour in `bg` decides.

**Wallpaper tone**: `apply()` sets `html[data-wp-tone=light|dark]` for every wallpaper (`pure.js`
`wallpaperTone()`): a colour by its luminance, a gradient by its brighter end, a motif by `tone` or its
`bg`, a picture by its config `tone` (default dark). Light means a luminance above 0.18, where white text
falls below 4.5:1. On a light wallpaper the menu bar lays a darker layer over `--menubar-bg` and the
icon labels get a backplate (shell CSS) — Sunset, Lagoon, Lavender and Forest count as light at their
bright end, the default JPKCom gradient stays dark.

Every id inside a motif carries the `uid` prefix. `heavy` motifs (aurora's full-screen blur) get
`{ reduced: true }` when `config.wallpaper.reducedEffects` is `'off'`, or `'auto'` with reduced motion
(they re-render on `env:motion`). Modules register with `Desk.wallpaper.register(motif)`; the site lists
the id in `config.wallpaper.motifs`.

## Deviations from the original and why

- **Lists from registries**: backup keys, reset groups and trash types come from the descriptors
  (storage registry) instead of the hand-kept `KEYS`, `RESET` and `TYPES`; a new module needs no edit here.
  Backup summaries are built per reset group (counts from `count()`, otherwise the key labels).
- **Old backups**: files of the original (keys `jpkdesk-…`) are imported — the prefix is stripped when the
  stripped name is a known key. Keys this desktop does not know are left out and mentioned in the preview.
- **Trash emptying asks with a core sheet** (`Desk.dialog.confirm`, ARCHITECTURE §23) instead of an inline
  box; focus after put back/delete moves to the neighbouring item. Items of types no module declares
  right now stay (put back disabled) instead of being dropped; the bin redraws on `module:loaded` and
  `module:failed`, so put back follows the types that exist. The panel is not rebuilt while the question
  opens, so cancelling returns the focus to "Empty Trash …"; after emptying it lands on the heading. The full/empty icon is `iconFull` on the
  app (the dock reads it) instead of mutating the app.
- **Settings sections and rows are a registry**; weather, notifications and fortune rows of the original
  are contributions of their modules; online services are generic consent switches. Language: segments
  for up to three languages, a select for more. Accent: config accents plus an optional custom colour;
  `--on-accent` is computed for every accent (black or white, whichever has more contrast), and
  `--accent-ring` (`pure.js` `accentRing()`): the accent for focus rings and selection marks, mixed towards
  black (light theme) or white (dark theme) until it reaches 3:1 against `--win-bg` (WCAG 1.4.11) — a
  custom `#ffd400` is 1.4:1 on the light theme's windows. Recomputed on every theme or accent change.
- **Dock size, magnification, desktop icons, clock seconds** are owned by the shell (P2); the settings
  rows call its services instead of writing the keys and body classes themselves.
- **About**: rows from `config.about.rows` (values may carry `lang`/`abbr` parts, see Config keys) or
  automatic (system — "Vanilla JavaScript" in a `<span lang="en">` as in the original, through the
  `{stack}` placeholder of `about.systemValue` —, apps count — the same set All apps lists, Catalog apps included, collection items not —, languages, licence), the
  credit "JPKCom Desktop by Jean Pierre Kolb" (link to `config.author.url`) and the copyright from
  `config.about.copyright` — no personal rows of the original. The author's name keeps the original's
  language spans (`fr` "Jean Pierre", `de` "Kolb"): the translated sentence is built with a sentinel in
  place of the name and split there, so no translated fragments are put together.
- **Help**: rows appear only for parts that are loaded; neutral wording (window controls, Search);
  the keyboard list is generated from `shortcuts.list()` (its `display`); the overview row names its
  keys ("F3 or Ctrl+↑ …, Ctrl+^ switches to the next window") from the same list. Two rows (new) say how
  Tab leaves the apps that take it over: the editor (Esc, then Tab) and the terminal (Tab on an empty
  line) — shown while that app is available.
- **Accent contrast hint**: two whole sentences (`accentContrastWhite` / `accentContrastBlack`) instead of
  a colour word put into a sentence. While the custom accent picker is dragged the pane is not rebuilt
  (own keys redraw on `store:change` only when another tab wrote them).
- **Wallpaper motif ids**: the author motifs are `author-monogram`, `author-emblem`, `author-blueprint`
  (neutral names in the registry); the original ids are accepted as aliases.
- **Install**: the service worker is registered only when a `<link rel="manifest">` exists (`index.html`
  ships it; a site that deploys without the PWA files removes it), with the installation root as scope;
  the share-sheet hint names no browser.
- **Wallpaper**: picture wallpapers (`config.wallpaper.images`), a reduced-effects aurora, and the author
  emblem drawn as a group (not a nested `<svg>`, which the wallpaper layer's CSS would stretch).
