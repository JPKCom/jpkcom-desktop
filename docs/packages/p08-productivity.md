# P8 — Productivity apps (`src/apps/editor`, `notes`, `todo`, `calc` + `src/apps/kit.js`)

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Four offline apps ported from the original's `productivity.js` (shared helpers 15–133, Editor 135–1117,
Notes 1119–1372, Tasks 1374–1633, drop handler 1635–1639, trash handlers 1641–1665, Calculator 1667–1991)
and their CSS (desktop.css 2643–3642 + compact 5511–5572). Every feature, key binding and ARIA detail of
the original is kept; the changes are the ones the contract asks for (descriptors instead of
`register()`, storage/trash/reset/drop declared by the apps, N-language i18n, Tabler icons, tokens).

## Files

| File | Purpose |
|---|---|
| `src/apps/kit.js` | shared helpers: `sheet`/`confirm`/`alert` (re-exported from `Desk.dialog`), `hasSheet(win)`, `mod(e)`, `newId()`, `isId(v)`, `isNum(v)`, `labels()` (bind/apply texts for the language switch), `winButton(win, lb, icon, key, onClick, cls?)`, `copyWithFeedback(btn, text, { key, doneKey, ms })` (`key`/`doneKey`: `'ns.key'` or a function returning the text, like `labels().bind`) |
| `src/apps/editor/index.js` · `window.js` · `model.js` · `editor.css` | Editor (descriptor: draft storage, drop handler, config section · the window, loaded when it first opens (app field `load`) · pure draft/find/count helpers · `@layer apps` + `@layer compact`, a `windowStyles` sheet) |
| `src/apps/notes/index.js` · `model.js` · `notes.css` | Notes |
| `src/apps/todo/index.js` · `window.js` · `model.js` · `todo.css` | Tasks (descriptor: storage, reset group, trash type · the window, loaded when it first opens (app field `load`) · pure list helpers · a `windowStyles` sheet) |
| `src/apps/calc/index.js` · `window.js` · `engine.js` · `history.js` · `calc.css` | Calculator (descriptor: storage, reset group, config section · the window (keypad, display, history, keyboard), loaded when it first opens (app field `load`) · pure engine: input state, precedence, percent, formatting — loaded with the window · pure history checks `HISTORY`/`keepLast`/`cleanCalc` the descriptor needs at boot (re-exported by `engine.js`) · a `windowStyles` sheet) |
| `locales/{en,de}/{editor,notes,todo,calc,kit}.js` | namespaces `editor`, `notes`, `todo`, `calc`, `kit` |
| `tests/p08-calc.test.mjs`, `tests/p08-models.test.mjs` | unit tests of `engine.js`, the three `model.js` files and the pure kit helpers |

## Apps (manifest part of the descriptors)

| id | icon | tint | size | other | name / desc |
|---|---|---|---|---|---|
| `editor` | `ti-file-text` | blue | 820×560 | | `@editor.appName` / `@editor.appDesc` |
| `notes` | `ti-note` | orange | 780×520 | | `@notes.appName` / `@notes.appDesc` |
| `todo` | `ti-list-check` | green | 460×560 | | `@todo.appName` / `@todo.appDesc` |
| `calc` | `ti-calculator` | black | 300×470 | `fixed: true` | `@calc.appName` / `@calc.appDesc` |

A site changes them with override records (`{ id: 'notes', dock: true }` in `site/apps.js`).

## Storage, reset groups, trash, drop

| Key | Shape | Backup | Reset group (order) | `count()` |
|---|---|---|---|---|
| `editor` | `{ tabs: [{ id, text, name, dirty, pos }], current, wrap, ws }` (an old single-document draft `{ text, … }` becomes the first tab) | yes | `editor` (50) | "1,234 characters" (ready text) or 0 |
| `notes` | `{ notes: [{ id, text, created, modified }], current }` | yes | `notes` (40) | number of notes |
| `todos` | `{ items: [{ id, text ≤ 500, done, created }], filter: all\|open\|done }` | yes | `todos` (45) | "12 tasks (3 open)" (ready text) or 0 |
| `calc` | `{ history: [{ e: '2 + 3', r: 5 }] }` (newest last, at most `historySize`) | yes | `calc` (55) | number of calculations |

Every value is validated on load and for backups (`model.js`/`history.js`): ids `[a-z0-9-]{1,40}`
(unsafe ids from old data get a new one in the editor and are dropped in notes/tasks), duplicate ids
dropped, types checked, the editor cursor clamped, history expressions limited to `[-+*/0-9.e ]`.

Trash types: `note` (icon `ti-note`, app `notes`) and `todo` (icon `ti-list-check`, app `todo`).
`restore()` validates the item, flushes the open window's pending save, appends the item (a new id
when its old one is taken again), writes the key and reloads the open window — as the original did
through its `live` object, now through the window's handle `Desk.wm.get(app)?.state.<app>` (`flush`,
`reload`, set by `mount()` in `window.js`). Without an open window — or while its code still loads —
only the key is written; the window reads it when it mounts.

Drop: contribution `files: { text: { label: '@editor.dropLabel', icon, order: 50, open(file) } }`
— no `accept`/`mime`, so the shell's built-in `text` kind decides (the original's TEXT_TYPE/TEXT_EXT
rules, names without an extension count as text). `open()` launches the editor, waits for
`win.ready` (the window code may still be loading) and reads the file through `win.state.editor.openFile`
into an empty unnamed tab or a new one → `Promise<boolean>` (false: no window, the window closed while
loading, or the file was refused); binary files (a NUL character) and files over `maxFileBytes` get an
alert sheet.

## Events used

- `store:change` `{ name, external: true }` — another tab changed `notes`, `todos` or `calc`: the
  window reloads (tasks: not while a task is being edited; notes: the text field is only replaced
  when it is not focused). Replaces the original's own `storage` listeners.
- `storage:restore` `{ names }` / `storage:reset` `{ groups }` — an open Notes, Tasks or Calculator
  window drops its pending save (notes, tasks) and reloads (new; the original restarted the desktop
  instead). Notes and Tasks listen to all three events, the Calculator to `store:change`,
  `storage:restore` and `storage:reset` (group `calc`).
- The **editor** listens to none of them: its draft is written by the open window itself, and the
  settings and backup panels close every window before a reset or restore, so the reopened editor
  reads the new draft.
- The WM hooks: `mount`, `focus`, `relabel`, `menu` (editor, notes), `beforeClose` (editor), `unmount`.

## Configuration (optional sections — work without them)

| Key | Default | Meaning |
|---|---|---|
| `editor.maxTabs` | `20` | tabs at most (1–100) |
| `editor.maxFileBytes` | `5242880` | largest file that opens (1 KB–50 MB) |
| `editor.wrap` | `false` | word wrap before the user chose |
| `editor.invisibles` | `true` | invisible characters shown before the user chose |
| `calc.historySize` | `50` | calculations kept (0–500; 0 keeps no history) |

The keys are in the core `DEFAULTS` (ARCHITECTURE §6), so `Desk.config` shows them; each section is
cleaned by its descriptor's `configKey` + `validateConfig` (invalid values are warned and dropped); the
apps fall back to the defaults in `editor/model.js` (`DEFAULTS`) and `calc/history.js` (`HISTORY`).

## Keyboard

- **Editor** (only while its window has focus): Ctrl/⌘+S save, Shift+Ctrl/⌘+S save as, Ctrl/⌘+O open,
  Ctrl/⌘+F find, Ctrl/⌘+G / Shift+G next/previous match; Alt+T new tab, Alt+W close tab, Alt+PageDown /
  PageUp next/previous tab (the menu shows them through `i18n.keys()`: "Alt+Page Down" / "Alt+Bild↓"), Alt+Z word wrap, Alt+I invisible characters (Alt keys by `e.code`, so
  layouts where Alt+Z types a character still work). Tab inserts a tab — after Esc it moves the focus
  (no keyboard trap). Find field: Enter / Shift+Enter next/previous, Esc closes; replace field: Enter
  replaces one, Ctrl/⌘+Enter all. Tab bar: ←/→ (mirrored in RTL), Home, End select, Delete closes
  (`aria-keyshortcuts="Delete"` on each tab). The `role=tablist` (`.ed-tablist`) holds only the tabs; "+"
  sits beside it in `.ed-tabs`, and each tab's close button is a pointer shortcut (`tabindex=-1`,
  `aria-hidden`) — Delete and Close tab (Alt+W, window menu) close from the keyboard.
- **Notes**: ↑/↓ walk the list, Delete/Backspace moves the selected note to the trash, Ctrl/⌘+F search.
- **Tasks** (on a checkbox): Enter edits, Delete/Backspace removes, ↑/↓ move the focus, Alt+↑/↓ move the
  task (filter "All" only); double-click edits; in the edit field Enter keeps, Esc cancels.
- **Calculator**: digits (ASCII and the language's own digits), `+ - * /` (also `x` and `:`), Enter or `=`, `,` and `.` for the decimal
  separator, `%`, Backspace, Esc/Del/C clear, F9 change sign; Ctrl/⌘+C without a selection copies the
  result; Esc closes the history. Enter and Space on a focused control (keypad keys, the title-bar
  buttons Close, Copy, History …) activate that control; only other keys reach the calculator.

## i18n

Namespaces `editor`, `notes`, `todo`, `calc`, `kit` (shared: `kit.moveToTrash`, `kit.notSaved`), plus
`core.cancel`, `core.characters`, `core.storageFull`, `core.copied`. Counts use plural objects
(`editor.lines`, `editor.words`, `editor.replaced`, `editor.tooManyTabs`, `editor.askClose`,
`todo.tasks`, `todo.statusOpen`, `todo.statusDone`), sentences named placeholders (`{name}`, `{line}`,
`{col}`, `{current}`/`{total}`, `{date}`, `{value}`, `{size}`). Texts with two counts (`editor.counts`,
`todo.status`, `todo.countOpen`) are templates that join counts already translated with their own
plural forms, so languages whose words agree with each number can translate them. Shortcut hints come from `i18n.keys('Alt+Z')`. Dates
through `i18n.fmtDate/fmtTime`, numbers through `i18n.fmtNumber`, the calculator's decimal separator
from `i18n.decimalSep()` (key label and display) and its digits from `i18n.fmtNumber` (digit key
labels and every digit of the display, fraction included — e.g. Arabic-Indic digits), file sizes through `i18n.fmtBytes`.

## Deviations from the original and why

- **Question sheets** come from `Desk.dialog` (core) instead of a private `ask()`; `kit.js` re-exports
  them. Same look and keys, plus `aria-describedby` and closing with the window.
- **Editor `beforeClose`**: closing the window asks only when the draft could not be stored (storage
  full or blocked) and a tab has unsaved changes — Discard / Cancel / Save (saves each changed tab in
  turn). The original never asked because the draft keeps every tab; that stays true whenever the
  draft can be stored. Closing a single changed tab asks as before.
- **Menu items** "Word wrap" and "Invisible characters" are checkboxes (`menuitemcheckbox`) instead of
  radio items, and the editor/notes menu items show their shortcuts (`shortcut:`).
- **The editor text area is always left-to-right** (`.ed-main { direction: ltr }`): the gutter, match and
  invisible-character layers follow the textarea's scroll offsets. Tab bar and status bar follow the
  page direction; tab arrow keys are mirrored in RTL.
- **Dirty tabs** expose "name — edited" as the tab's accessible name (`aria-label`) instead of a
  visually hidden text fragment (no concatenated translations).
- **Status bar counts** use plural forms ("1 line", "2 lines") and named placeholders; the find counter
  "{current} of {total}" replaces the de/en ternary. `countWords`/`countChars` count without building
  arrays; above 200,000 characters words and characters are recounted after a 300 ms pause in typing
  (lines and the cursor position every frame).
- **Invisible-character classes** carry the editor prefix: `.ed-ws-s` (space), `.ed-ws-t` (tab), `.ed-ws-u`
  (non-breaking/other spaces), `.ed-ws-z` (zero-width), `.ed-ws-n` (line end) — `WS_CLASS` in model.js.
- **Forced colours**: pressed toggles (`.ed-toggle`, `.ed-wsbtn`, `.ed-wrapbtn`) use `Highlight` /
  `HighlightText`; compact mode enlarges the tab close button (36 px), "+" (40 px) and the status toggles
  (≥ 36 × 32 px).
- **Calculator engine** is a pure module with a state object (`createCalc()`); behaviour unchanged.
  `calc.historySize` makes the 50 configurable. The copy button uses `Desk.dom.copyText` (with a
  fallback and an announcement) through `kit.copyWithFeedback`.
- **After "Clear history"** the focus moves to the history heading (the focused button became disabled).
- **Removing the last task / note by keyboard** moves the focus to the task input / the next note or the
  search field (the original left it on a removed element).
- **New:** app descriptions (`desc`) for search and the Catalog; `storage:restore` / `storage:reset`
  reload open windows; the original's platform-specific wording is gone (shortcut hints come from
  `i18n.keys()`).
- **Calculator digits** follow the language (key labels and display); `data-key` values and the
  stored history stay ASCII.
- **Source hygiene:** the invisible-character pattern (`WS_RE`) is written with `\u` escapes as in the
  original, so no bidirectional or zero-width characters sit in source files.
- Icons (original icon set → Tabler): file-alt → `ti-file-text`, sticky-note → `ti-note`, tasks →
  `ti-list-check`, calculator → `ti-calculator`, search → `ti-search`, chevrons → `ti-chevron-*`,
  times → `ti-x`, exchange → `ti-arrows-exchange`, plus → `ti-plus`, file → `ti-file-plus`,
  folder-open → `ti-folder-open`, save → `ti-device-floppy`, edit → `ti-edit`, trash-alt → `ti-trash`,
  grip-lines → `ti-grip-horizontal`, history → `ti-history`, copy → `ti-copy`.
- CSS: colour literals replaced by tokens (`--on-accent`, `--match`, `--match-current`, `--calc-bg`),
  logical properties where direction matters, the calculator is a dark island through
  `data-island="dark"` on its root, the notes search uses the shared `.field` component (was the
  original catalog window's CSS), the copy button's success colour is scoped to `.calc-copy`.
- **Notes in a narrow window** (new, integration): `.notes` is an inline-size container; below 460px
  the list and the text take turns as on phones (`.is-detail`, back button), so a window at the
  minimum size stays usable. `focus(win)` focuses the current list item or the search field when the
  text is hidden.
