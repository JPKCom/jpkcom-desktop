# P5 — Search (`src/modules/search`)

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

One quick search over every app, every collection and any number of providers, as a palette
under the menu bar. Ported from the original's global search (desktop.js 4133–4541, CSS
desktop.css 4933–5121 + compact 5475–5509) under the neutral name **Search** (§4).

## Files

| File | Purpose |
|---|---|
| `src/modules/search/index.js` | descriptor, palette UI, service `search`, menu bar button, shortcuts |
| `src/modules/search/engine.js` | pure functions (Node-testable): `fold`, `entry`, `score`, `rank`, `matchCombo`, `ariaKeys`, `cleanConfig`, `cleanProvider`, `cleanResults`, `excerptParts` |
| `src/modules/search/pagefind.js` | optional full-text provider for a Pagefind index (`createPagefind(desk, cfg)`) |
| `src/modules/search/search.css` | `@layer modules` (+ `@layer compact`) |
| `locales/{en,de}/search.js` | namespace `search` |
| `tests/p05-search.test.mjs` | unit tests of `engine.js` |

## Opening

- **Mod+K** (configurable, `config.search.shortcut`; `null` switches it off): registered with the
  `shortcuts` service (P2) as soon as it exists (`shortcuts.add({ id: 'search', keys, label: '@search.open',
  scope: 'global', run })`, so it also works inside same-origin iframes). While there is no shortcuts
  service, the module listens itself (capture phase). `Mod` accepts ⌘ or Ctrl, as the original did.
  Pressing it again closes the search. With `shortcut: null` there is no search shortcut at all: the
  shell skips its built-in 'search' entry too (`searchShortcut()` in `src/shell/shortcuts.js`), so Mod+K
  does nothing and the help lists no search key.
- **/** anywhere outside a field (not inside an iframe). The listener runs in the bubble phase, so an
  app that uses the key itself (calculator, terminal) handles it first; its `preventDefault()` keeps
  the search shut.
- The **magnifier** in the menu bar (`button#mb-search.mb-item.mb-search`, `aria-haspopup="dialog"`,
  `aria-expanded`, `aria-keyshortcuts`, label "Search (Ctrl+K)"), handed to `menubar.addStatus(btn, 10)`
  once the `menubar` service is provided (`Desk.services.when('menubar')`). Without a menu bar there is
  no button; everything else works.
- `Desk.searchFor(q)` / `Desk.search.open(q)` (deep links `#search=`, the launcher's "search everywhere",
  the terminal). The query is capped at 200 characters.

## Service `search`

```ts
Desk.search.open(q?: string)          // opens (or focuses) the palette; q replaces the query
Desk.search.close(returnFocus = false)
Desk.search.toggle()                  // close(true) when open, else open()
Desk.search.isOpen() → boolean
Desk.search.addProvider(def) → remove()
```

## Groups and ranking

1. **Apps** — `registry.list()` (available, not hidden), without the launcher and without collection
   items (those belong to their collection; an item that only points to another app — an alias — is
   found as that app).
2. **One group per collection** (`site/apps.js` `collections[]`, in manifest order) unless the
   collection says `search: false`. Hidden and unavailable items are left out. The item's group name
   (`groups[].name`) is matched and shown under the name when the item has no description.
3. **Providers**, after the local groups, in their `order`.

The local index is rebuilt on every open, on `lang:change` and on `apps:change` while open (modules,
the vault and collections add apps late). Scoring (unchanged from the original): every word of the
query has to hit — name start 100, start of a name word 80, inside the name 60, id/slug 50, group
label 30, description 20 — summed over the words; case, accents and ß are folded (`fold` of
`src/core/text.js`, the rule Catalog and the terminal use too). Each group shows
at most `config.search.maxPerGroup` hits (the original used 6 for apps, 5 for the others); the group
holding the best hit comes first, ties keep the natural order; equal scores are ordered by name
(`i18n.compare`).

## Providers (extension point `search`)

A module contributes providers in its descriptor (`search: [{ … }]`, §8) or at runtime with
`Desk.search.addProvider(def)`:

```js
{
	id: 'notes',                 // [a-z][a-z0-9-]*, unique (contributions win over addProvider)
	label: '@notes.title',       // group heading (L() text)
	order: 40,                   // among the providers (default 100; Pagefind 900)
	max: 6,                      // rows (default config.search.maxPerGroup)
	minLength: 1,                // characters before it is asked (Pagefind: 2)
	delay: 160,                  // ms pause in typing before it is asked
	warm() {},                   // optional: the palette opened (start loading an index)
	available() { return true },  // optional: false = permanently unavailable (index failed to load)
	async search(q, ctx) {       // ctx: { query, words (folded), fold, signal (AbortSignal), lang, max }
		return [{
			title: 'My note',                     // required
			sub: 'first line' | [text | Node],    // optional second line (Nodes: e.g. <mark>)
			app: 'notes' | appEntry | { icon, tint, logo, mark },   // tile (an app id or an entry with id also opens it)
			icon: 'ti-note', tint: 'orange',      // tile when there is no app
			url: 'site/content/x.html',           // opened with Desk.openUrl when there is no run
			run() {},                             // what Enter/click does
			external: true,                       // shows the "opens in new tab" glyph + text
			key: 'note-17'                        // stable key (keeps the selection across updates)
		}];
	}
}
```

Rows without a title or without a way to open them are dropped: a row needs `run()`, a `url`, an app
id or an app entry with an `id` (a bare `{ icon, tint }` only draws the tile); rows whose app id is not
registered are left out when rendering. A provider that throws (or rejects) is shown as unavailable in
the status line ("3 results · Articles: currently unavailable"). A provider whose `available()` returns
`false` is not asked any more: its status turns to unavailable at once, without the loading phase and
without another console warning (the original's behaviour once its full-text index had failed). Earlier
hits stay visible while a provider is loading; answers for an outdated query are discarded
(sequence number + `AbortSignal`). Contributions of a module whose setup failed disappear with it
(the loader withdraws them; the search reads the list on every query).

## Full-text search (Pagefind)

Only when the site configures it:

```js
search: { pagefind: { path: 'pagefind/pagefind.js', excerptLength: 16, maxHits: 8, label: { en: 'Articles', de: 'Artikel' }, order: 900 } }
```

(`pagefind: 'path/pagefind.js'` is accepted as a shorthand.) The module is imported on first open
(`warm()`) from the same origin — `path` must be relative to the installation root or start with
`/`; other schemes and `//host` are refused. Pagefind needs `'wasm-unsafe-eval'` in `script-src`
(`npm run serve -- --wasm`, §5). Pagefind picks its index from `<html lang>` when it initialises, so a
language switch destroys and re-initialises it. An import or init failure is warned once and marks
the provider unavailable for the session (`available()` → `false`). Excerpts (HTML with `<mark>`) are parsed inertly with `DOMParser`;
only text and fresh `<mark>` elements survive. Hit URLs are resolved with `router.resolveUrl`
(`config.site.hosts` count as same origin); non-http(s) URLs are dropped. A hit opens with
`Desk.openUrl` (its route, the page app with the longest URL prefix, else a new tab); the tile shows
the routed app or page app, else a document glyph, and hits without an app window carry the
new-tab hint.

## Accessibility and keyboard

`div.search-palette[role=dialog]` (named "Search") → `input[type=search][role=combobox]`
(`aria-autocomplete=list`, `aria-controls`, `aria-expanded` = has options, `aria-activedescendant`)
→ `div[role=listbox]` with one `role=group` per section (`aria-labelledby` its heading) and
`div[role=option][aria-selected]` rows. Rows are never focused, so the field keeps the focus (and the
phone keyboard); `pointerdown` on a row is prevented. ↑/↓ move (wrapping), Enter opens, the first Esc
clears the query, the second closes and returns the focus (to the element that had it, else the
button). The mouse selects on hover (mouse pointers only). Tab out of the palette closes it; a phone
keyboard's "Done" (blur without a new target) does not. The selected row scrolls into view inside the
list only (never `scrollIntoView`, which would scroll the desktop); the first row of a group brings its
heading along. The status (result count, loading, unavailable) is announced through the shared live
region (`Desk.announce`) once typing pauses for 700 ms — not while a provider is loading. Link apps
carry a visually hidden "(opens in new tab)".

## Etiquette

Opening emits `'popovers:close'` `{ except: 'search' }`; any other `'popovers:close'`, a pointer down
outside the palette and the button, and a window `blur` (click into an iframe, another tab) close it.
Opening animates (`.is-open`, `--dur`); with reduced motion it appears and disappears at once.

## Configuration (`config.search`, cleaned by `validateConfig`)

| Key | Default | Meaning |
|---|---|---|
| `pagefind` | `null` | `{ path, excerptLength: 16 (4–60), maxHits: 8 (1–30), label: null (→ "Full-text search"), order: 900 }` or a path string |
| `maxPerGroup` | `6` | rows per group (1–50) |
| `shortcut` | `'Mod+K'` | key combination (`Mod`, `Ctrl`, `Alt`, `Shift`, `Meta` + one key); `null` = none |

Invalid values are warned (`[desktop] config.search: …`) and replaced by their defaults.

## Events, storage, i18n, CSS

- **Bus**: listens to `popovers:close`, `lang:change`, `apps:change`; emits `popovers:close`. No new events.
- **Storage**: none (the original kept no search history).
- **i18n**: namespace `search` (`title placeholder button open groupApps fullText scope hits loading off
  newTab keySelect keyOpen keyClose`) + `core.noResults`, `core.keyEsc`. Lists of group names go through
  `i18n.list()`, counts through plural objects, the shortcut through `i18n.keys()`.
- **Icons**: `ti-search` (was `fal-search`), `ti-external-link` (was `fal-external-link`), `ti-file-text`
  (full-text hits without an app).
- **CSS**: `.search-palette` and its children `.search-field .search-input .search-results .search-list
  .search-head .search-item .search-text .search-name .search-sub .search-ext .search-empty .search-foot
  .search-status .search-keys` — every child rule is scoped to `.search-palette`, so other parts may use
  `.search-*` names in their own windows. `.mb-search` (the menu bar button's padding/hover). Tokens only:
  `--glass-strong --line --line-strong --text* --accent --on-accent --mark-on-accent --highlight
  --tile-shadow-sm --scroll-thumb --z-popover --mb-total --dur --ease --shade --ink`.

## Deviations from the original

- **Name**: the original's quick-search palette is now **Search** (`.search-palette`/`.search-*`,
  keys `search.*`, input name `search`, `Desk.searchFor(q)`).
- **Groups are generic**: apps + every collection + providers instead of the fixed apps/tools/games/
  links/portfolio lists; the original's fixed full-text group of the author's site became the optional
  Pagefind provider (label from config or `search.fullText`, import path from
  `config.search.pagefind.path`).
- **Max per group**: one value (`maxPerGroup`, default 6) instead of 6 for apps and 5 for the rest.
- **Status texts** with placeholders and plurals instead of `spotHit`/`spotHits` and concatenation;
  the scope line lists the actual groups ("Apps, Tools and Articles") instead of a fixed text.
- **Live region**: the shared `Desk.announce()` instead of a private `role=status` element (same 700 ms
  pause).
- **Shortcut**: configurable; registered with the shortcuts service (P2) instead of a private list;
  the hint uses `i18n.keys()` (no `'de' ? 'Strg+K'` ternary).
- **"/"** is handled in the bubble phase instead of the capture phase and respects `preventDefault()`:
  in the original the capture listener opened the search before the calculator saw the key, so "/"
  divided and opened the search at once. Now an app that uses "/" itself keeps it; everywhere else
  "/" opens the search as before.
- **Provider availability** (`available()`) generalises the original's one-off "full-text index
  failed" flag to every provider.
- **Reopening during the close animation** removes the fading palette at once (the original briefly
  kept two palettes with the same ids, so `aria-activedescendant` could point at the old one).
- **Popovers** close each other through `'popovers:close'` instead of direct calls.
- Contributions/`addProvider` are new extension points (the original had none).
