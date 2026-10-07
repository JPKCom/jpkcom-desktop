# P1 — Window manager extras: snap, tile menu, overview, session

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Four optional features of the window manager. They live in `src/wm/` and start in the `setup()` of the
core part `wm` (`src/wm/index.js`), after `initWM()`. They attach only through the hook points of
`src/wm/wm.js` (docs/ARCHITECTURE.md §19.5), never through its internals. An extra that throws on start is
reported (`console.error`) and left out; windows keep working.

| File | Feature | Service |
|---|---|---|
| `src/wm/snap.js` | Drag a title bar to the left/right edge (half) or the top edge (zoom), with a preview | `snap` |
| `src/wm/tilemenu.js` | Arrange menu under the zoom window control (hover with the mouse, long press with touch/pen) | — |
| `src/wm/overview.js` | Window overview: every visible window scaled side by side, keyboard and pointer picking | `overview` |
| `src/wm/session.js` | Session restore: the windows come back on the next visit | `session` |
| `src/wm/extras.css` | Styles of all four (`@layer wm`) | — |

## Snap (`snap.js`)

- A drag handler (`wm.addDragHandler`): `move()` computes the zone from the pointer position relative to
  `wm.workspace` — at or above the top edge → `'max'`, within the edge width of the left/right side →
  `'left'`/`'right'` — and shows `.snap-preview` at `wm.layoutRect(zone)`; `end()` returns the zone when the
  window was really dragged, and the WM applies it animated. Fixed windows get no preview and no zone.
- The preview is the first child of the window layer (`wm.layer`) with `z-index = wm.topZ()`, so the
  dragged window (topmost, later in the DOM) stays above it.
- Edge width: `config.wm.snapEdge` `[mouse, touch/pen]` (default `[8, 18]`); `config.wm.snap: false` switches
  snapping off (the service still exists with `enabled: false`).
- Service `snap`: `{ enabled, zone, zoneAt(pointerEvent), cancel() }`.

## Tile menu (`tilemenu.js`)

- A window decorator (`wm.addDecorator`): `wire()` binds `win.controls.querySelector('.wc-max')`, `unwire()`
  removes the listeners (AbortController) and hides the menu if it belongs to that window, `beforeZoom()`
  returns `false` once after a long press, so the click that ends the press does not zoom as well.
- Opens after `config.wm.tileMenu.delay` ms (default 450) of mouse hover, or a touch/pen long press of the
  same length (the browser's context menu on the button is suppressed). Hides `hideDelay` ms (default 250)
  after the pointer left the button and the menu, on a click elsewhere, Esc (focus returns to the zoom
  button when it was inside the menu), window `blur`, `'popovers:close'`, `'env:compact'`, a language
  switch, and when its window closes or is minimised. Emits `'popovers:close'` `{ except: 'tilemenu' }`
  before opening. Not for fixed windows, minimised windows or compact mode.
- `.tilemenu[role=group]` (name `wm.tileMenu`) with four `button.tilemenu-btn` (glyphs `tile-max`,
  `tile-left`, `tile-right`, `tile-both`; `aria-label` + `title`): Zoom (`wm.toggleMax`), left half and right
  half (`wm.snapTo`, the same side again frees the window), side by side (`wm.focus(owner)` + `wm.tileBoth()`,
  disabled with fewer than two arrangeable windows). The current layout is `aria-pressed="true"`
  (an accent fill with `--on-accent` glyph plus the `--pressed-edge` edge — like a pressed `.win-btn` — so
  the shape keeps 3:1 against the glass in the dark theme).
- `config.wm.tileMenu: false` switches the menu off.

## Overview (`overview.js`)

- `open()`: the visible windows (not minimised), sorted top → bottom, left → right by `wm.rectOf()`, are laid
  out by `overviewGrid()` — the column count whose smallest scale is largest, short rows centred, scale ≤ 1.
  Each window gets `--xs` (its scale, for the ring width) and a `transform` through `wm.animate()`. A dim
  layer `.overview-dim` is prepended to `wm.layer` (below every window), the titles go into
  `body > .overview-labels > .overview-label` (`aria-hidden`; `z-index: var(--z-overview)`), `body.is-overview`
  is set. The active window is preselected (`.is-picked`, DOM focus) and `wm.overviewHint` is announced
  with `{ n }` (plural).
- Keyboard while open (window capture phase, before any shortcut): arrows move through the grid (clamped),
  Tab/Shift+Tab cycle, Enter/Space bring the selection to the front, Esc closes and returns to the previous
  window. Every key with Ctrl/Alt/Meta (Ctrl+Enter, Alt+Space, …) passes through untouched, so the shell's
  toggle shortcuts (F3, Ctrl+↑) and other modified shortcuts keep working.
- Pointer: a click on a window picks it, a click on the empty space (dim) or anywhere outside the window
  layer closes it.
- Closes on `'popovers:close'` (unless `except: 'overview'`), window `blur` (handled one task later and
  only for the same opening: the WM's own `focusFrame()` into a window's iframe also blurs the page, e.g.
  while a new window opens, and must not undo that window's focus), `resize`, `'env:compact'`, a
  window that opens, and a window of the grid that closes or is minimised. A language switch updates the
  labels. Closing without a pick returns to the previous active window, unless it was closed or minimised
  meanwhile; a window that opened while the overview was open counts as the pick (it stays in front).
- Config: `config.overview` `{ labelHeight: 30, padding: [compact, normal] = [12, 40] }`.
- Service `overview`: `{ toggle(), open(), close(), active (getter), isOpen() }`. Events `'overview:open'`,
  `'overview:close'` (`{}`). The Window menu item comes from `wm.menu.window()` (it calls
  `overview.toggle()` when the service exists).

## Session (`session.js`)

- Listens to `window:open`, `window:close`, `window:focus`, `window:change`, `window:minimize` and writes once
  per `config.session.debounceMs` (default 400); `pagehide` and a hidden tab write at once (that also catches
  state a kind did not announce, such as a scroll position).
- Stored value (key `session`):

  ```js
  { v: 1, active: 'appId' | null,
    wins: [{ id, rect: { x, y, w, h }, layout: 'max'|'left'|'right'|null, min, url, state }] }   // wm.stack(): bottom → top
  ```

  `url` = `wm.locationOf(win)`, `state` = `wm.serialize(win)` (dropped when its JSON exceeds 32 KB —
  `MAX_STATE`). Transient apps are never stored.
- Restore runs **synchronously** in the session's `'desk:ready'` listener, which is registered during the
  WM's `setup()` and therefore runs before the shell's (deep links open on top, docs §3). Bottom-up:
  `wm.open(app, { url, state, restore: true })`, `wm.rect()` (size capped to `wm.area()`, fixed windows keep
  their size), `wm.setLayout(win, layout, { quiet: true })`, for minimised entries `wm.focus(null)` +
  `wm.minimize(win, { animate: false })` (no window is active then, so `minimize()` does not call
  `focusTop()` and the stored z-order stays as it was — as in the original, which only set the flag), then
  `wm.relayout()` and `wm.show(active)` or `wm.focusTop()`, then one write.
- Validation (`readSession`, pure): format `v: 1`; at most `config.session.maxWindows` entries (the
  topmost kept; `0` keeps none — saving is capped the same way); ids through `V.id`, once each; only apps the registry knows **and** `registry.available()`;
  no `launcher`, `link` or `transient` apps; rectangles with finite coordinates (|v| ≤ 100 000), grown to
  `config.wm.minSize`; layouts from the list, none for fixed apps; `min` only when `true`; `url` must be a
  same-origin path (`V.path`) **and** accepted by the app's kind (`wm.acceptUrl`); oversized state dropped;
  a throwing lookup/accept never breaks reading.
- Nothing is written before the restore ran (a `pagehide` during the boot cannot wipe the stored session).
  After a reset of the group `session` (`'storage:reset'`), nothing is written until the windows change
  again, so a pending timer or the following `pagehide` cannot put the forgotten windows back.
- User switch (key `restore`, `'on'`/`'off'`, default `config.session.restore`): `setKeeping(false)` removes
  the stored session and stops writing; `setKeeping(true)` writes at once.
- Service `session`: `{ save(), restore(), persist(), keeping(), setKeeping(on), read() }` (`read()` = the
  validated stored session, what `restore()` would open).
- Config `config.session` `{ restore: true, debounceMs: 400, maxWindows: 20 }`, cleaned by `cleanSession()`
  (pure): `restore` must be a boolean, `debounceMs` a finite number ≥ 0, `maxWindows` an integer ≥ 0 (same
  rule as core's `posInt`); every invalid value falls back to its default with a `console.warn`.

## Storage keys (declared in the `wm` descriptor)

| Key | Type | Backup | Reset group | Validation |
|---|---|---|---|---|
| `session` | json | no (device-bound) | `session` | `validSession` (shape; entries are validated on restore) — `count` = number of windows |
| `restore` | text | yes | `settings` | `'on'` / `'off'` |

## i18n (namespace `wm`, en + de)

Used: `zoom`, `tileLeft`, `tileRight`, `tileBoth`, `tileMenu`, `overviewHint` (plural, `{n}`).
Added: `overview` (feature name for menus/shortcut lists), `restoreWins` (storage label of the `restore`
key), `sessionLabel` (storage label of the `session` key). The settings switch (P3) uses its own
`settings.restore` and `settings.restoreHint`.

## CSS (`src/wm/extras.css`, `@layer wm`)

`.snap-preview`, `.tilemenu`, `.tilemenu-btn`, `.overview-dim`, `.overview-labels`, `.overview-label`,
`body.is-overview` (iframes, title bars, bodies and resize handles ignore the pointer; `.win:hover` and
`.win.is-picked` get an accent ring whose width is divided by `--xs`). Tokens: `--snap-bg --ink --radius-win
--ease --dur --glass-strong --line-strong --shade --accent --on-accent --overlay --text --text-2
--z-tilemenu --z-overview`. No compact overrides are needed (snap and tile menu are off in compact mode; the
overview uses the compact padding).

## Tests

`tests/p01-wm-extras.test.mjs`: snap zones and edge config, tile menu config, overview config, grid
(single window, 2 × 2, centred short row, tiny areas), keyboard moves, session shape, filtering, limits,
field validation, throwing callbacks, `maxWindows: 0`, `cleanSession` fallbacks with warnings, entry
rounding and round trip.

## Deviations from the original and why

- **Neutral naming**: the original's window overview identifiers are renamed to `.overview-*`,
  `body.is-overview`, `wm.overviewHint`, service `overview` (naming glossary, ARCHITECTURE §4).
- **Popovers close through the bus** (`'popovers:close'`) instead of direct calls to the menus, calendar,
  launcher and search — they are optional modules now.
- **Session entries carry `state`** (the kind's `serialize()`) instead of the Reader's scroll position read
  from its internals; the url check goes through the kind (`wm.acceptUrl`) instead of the original's
  page/web special cases.
- **Storage keys** are `<namespace>-session` / `<namespace>-restore` (the original's `jpkdesk-` prefix is the
  default namespace, so existing values keep working).
- **Configurable** edge widths, tile menu timings (or off), snapping on/off, overview label height and
  padding, save delay, window limit, restore default.
- **Tile menu**: a fourth button "Tile side by side" (the glyph existed but was not offered), `aria-pressed`
  on the current layout, Esc closes it; it also hides when its window closes, minimises or on a language
  switch; it is not offered for minimised windows.
- **Overview**: closes on window blur (popover rule of the contract), when a window opens, or when a window of
  the grid closes/minimises (the grid is a snapshot); labels follow a language switch; keys with modifiers
  pass through; the scale never drops below 0.02 (a tiny area no longer yields a negative scale).
- **Session**: nothing is written before the restore ran; after a session reset no pending write puts the
  windows back; a single window state larger than 32 KB is not stored.
- **Snap preview** is created on the first drag (prepended to the layer) instead of at load time, and there is
  no preview for fixed windows.
