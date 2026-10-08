# P9 — Terminal (`src/apps/terminal`)

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

A small shell ("jsh") over the desktop, ported from the original's `terminal.js` (1558 lines,
CSS desktop.css 4652–4811 + compact 5422–5425). Everything the original could do is still there;
what was tied to one site now comes from the catalogue, the config and a command registry that other
modules and site scripts extend.

## Files

| File | Purpose |
|---|---|
| `src/apps/terminal/index.js` | descriptor (loaded at boot): the command registry with the reserved built-in names, the `terminal` contributions (also of modules loaded later), service `terminal`, storage, consent, config; the `io` contract |
| `src/apps/terminal/config.js` | what the descriptor needs at boot (pure): `cleanConfig` (`manUrl` checked with `cleanMan` of `src/core/man.js`), `cleanDoh`, `cleanState`, `isRelPath` (now `isSitePath` of `src/core/url.js`, re-exported under the old name), `NAME`, `MAX_LINE`, `HISTORY_DEFAULT`, `HISTORY_MAX` |
| `src/apps/terminal/registry.js` | the command registry (pure, boot): `createCommands()` (with `reserve()`), `cleanDef()`, `textOf()` |
| `src/apps/terminal/window.js` | **loaded with the first window** (app field `load`): the window (output log, prompt, keys, completion, `readLine`), the `io` given to commands; registers the built-in commands when imported |
| `src/apps/terminal/lib.js` | pure helpers (loaded with the window; re-exports `config.js`): `parse`, `fold` (the shared rule of `src/core/text.js`, ß → ss), `distance`, `nearest`, `resolve`, `completeLine`, `pushHistory`, `historyLine`, `cleanFiles`, `fillTemplate`, `isSafeHref`, `markdownRows`, `human`; manual pages of entries: `expandMan`, `manPlan`, `hasManual`, `manLookup`, `manOutcome`, `manMiss`, `isHtmlType`, `isTextPath`, `MAN_VARS`, `MAX_MAN_SOURCES` |
| `src/apps/terminal/catalog.js` | directories, `open` targets and counts from the app registry; the validated `files` of `site/apps.js` |
| `src/apps/terminal/commands/core.js` | `help`, `history`, `clear`, `echo`, `search`, `exit` |
| `src/apps/terminal/commands/fs.js` | `ls`, `cd`, `pwd`, `open`, `cat`, `man` |
| `src/apps/terminal/commands/sys.js` | `date`, `cal`, `whoami`, `uname`, `neofetch`, `lang`, `theme`, `accent`, `credits` |
| `src/apps/terminal/commands/browser.js` | `browser` (all facts read locally) |
| `src/apps/terminal/commands/storage.js` | `df`, `du` |
| `src/apps/terminal/commands/net.js` | `dig`, `host`, `nslookup` over DNS-over-HTTPS (only when configured) |
| `src/apps/terminal/commands/eggs.js` | hidden easter eggs |
| `src/apps/terminal/terminal.css` | `@layer apps` + `@layer compact` — `windowStyles` (injected with the first window; every rule is inside the terminal window) |
| `locales/{en,de}/terminal.js` | namespace `terminal` |
| `tests/p09-terminal.test.mjs` | unit tests of the pure parts and the descriptor |

## App

`terminal`, kind `app`, icon `ti-terminal-2`, tint `black`, 760 × 480, name `@terminal.appName`.
**Window code on demand** (ARCHITECTURE §8 `load`): `app.load: () => import('./window.js')`, `windowStyles:
['terminal.css']`. The boot loads only `index.js`, `config.js` and `registry.js` (≈ 16 KB); `window.js`,
`lib.js`, `catalog.js`, `commands/*.js` and `terminal.css` (≈ 88 KB) come with the first window. Hooks
(all in `window.js`): `mount`, `focus` (an open question field first, else the prompt), `relabel` (accessible names —
old output stays in the language it was printed in, as in the original), `menu` (Clear output, Clear
history), `unmount` (saves, cancels a running command, answers open questions with `null`).
No `serialize`: a restored terminal starts with a fresh screen, as before.

## Commands

Visible in `help` (in this order, only those available right now):
`help ls cd pwd open man cat search dig host history clear date cal whoami uname neofetch browser df du
lang theme accent credits echo exit`. Hidden: `nslookup` (= `host`) and the eggs.

| Command | Notes |
|---|---|
| `ls [dir …]`, `cd [dir\|..\|~]`, `pwd` | directories are `apps` (every launchable app except the launcher and collection items) and **one per collection** of `site/apps.js` (groups as sub-headings, sorted as the collection says). `cd` is real now: the prompt shows `~/<dir>`, `ls` without argument lists it, `open`/`man` look there first. `cd /` keeps the original's joke. |
| `open <name\|dir/name\|address>` | exact key or name → unique prefix → unique part of the name (accent- and case-insensitive); keys are app ids and item slugs; `https://…`, `/path`, `./`, `../` open through `Desk.openUrl`. |
| `cat <file>` | the `files` section of `site/apps.js`: `{ name: 'path' \| { lang: 'path' } \| { url, aliases: [] } }`, paths relative to the root, **same origin only** (`net.getText`). `.md` is rendered (front matter dropped, headings, fences, `**bold**`, `` `code` ``, links: https or site paths, relative ones resolved against the file), anything else printed as is. `.md`/`.txt` suffixes may be omitted. |
| `man <command\|entry>` | built-in and plugin commands: NAME (help line), SYNOPSIS (`usage`), DESCRIPTION (`man`) — texts from i18n (`terminal.usage.*`, `terminal.man.*`) or the plugin's definition. Entries: collection items read a text manual (`.md`/`.markdown`/`.txt` on this site) from their own `man`, else the collection's `man`, else `config.terminal.manUrl`; an item's `docs` text file is still printed when it has no `man`; `~/apps` entries only use `docs` (see "Manual pages of entries"). After a printed manual the "Full documentation" line links the page (`docs` when not printed, else a non-text `man` path), or — as the original did — the entry itself (its `url` when https or on this site, else a button that launches it). An exact name always means that entry: one without a manual, or whose files are all missing (404/410, HTML answer), gets a dim "<name> has no manual page." with that link — not an error; only a failed request (offline, timeout, server error) prints the error row; a manual longer than `MAX_FETCH` characters is cut short, as with `cat`. A name that matches nothing answers "No manual entry". A hidden command has a page only when it is documented (`help`/`usage`/`man`) and asked for by its exact name — eggs answer "No manual entry", as in the original. |
| `search <words>` | `Desk.searchFor()`; only while a `search` service exists. |
| `dig`, `host`, `nslookup` | only with `config.terminal.doh` **and** `config.services.dns === true`; `Desk.consent.ask('dns', { within: win })` before the first query; `Desk.net.getJson(url, { service: 'dns', accept: 'application/dns-json', timeout: 6000, signal })`. Output layout as in the original; the resolver's name comes from `doh.name`. |
| `cal` | month grid starting on `config.calendar.firstDay` (1–7) or the language's own week start (`i18n.weekInfo()`); today and holidays highlighted; holiday list under `Desk.holidays.heading()` when the `holidays` service has a region. |
| `neofetch` | `config.brand.asciiLogo` (≤ 16 lines × 40 chars) or the JPK monogram; user@host, OS (`brand.name` + version), kernel, shell, uptime, resolution, language, app and per-collection counts, windows, theme (accent + mode from the settings service), **credit** "JPKCom Desktop by <config.author.name>" (unless `config.credit === false`), the configured tints as swatches. |
| `uname [-a]`, `whoami`, `date` | host = `config.brand.host` or `location.hostname`; user = vault user or `config.terminal.user`. |
| `browser [section …]` | as the original (agent, system, screen, hardware, network, locale, prefs, privacy, page, features); labels from i18n; ✓/✗ cells also carry a visually hidden yes/no. |
| `df`, `du [-s] [word …]` | own keys = `Desk.store.key('')` (config.namespace); the original's "tools and DB" bucket is now "other". |
| `history [-c]`, `clear`, `echo`, `exit` | `history -c` is new (the menu item did it before). |
| `lang [code\|name]`, `theme [dark\|light\|auto]`, `accent [id]` | new (blueprint §9): `i18n.setLang()` (`lang` lists each language under its own name and takes the code, that name or the name in the current language — `lang englisch`), `settings.set('theme' \| 'accent', v)`; only offered while possible (2+ languages / settings service). |
| `credits` | product, author (link `config.author.url`), source repository, licence, Tabler Icons. |

Eggs (hidden, `config.terminal.eggs`, registered as **weak** — a real command of the same name replaces
them): `sudo`, `rm` (`rm -rf /` shakes the window unless reduced motion), `vim vi nano emacs` (opens
`editor`), `coffee brew tea tee` (ASCII teapot + "418 — I'm a teapot"), `update` ("up to date"),
`hello hi hallo moin servus`. An egg whose name is already taken steps aside silently (no warning).

Unknown command → "command not found" + "Did you mean …?" (edit distance ≤ 2, visible commands only).

## Manual pages of entries

Not to be confused with the `man` text of a command definition (Command registry): that one is the
DESCRIPTION of `man <command>`; this one names a file for `man <entry>`.

**Manual value** (`ManValue`):

```
false                         no manual page (blocks every fallback below it)
'path'                        a path or template on this site
{ <lang>: 'path', … }         one path/template per language (keys: language tags, 1–20 entries)
```

**Path rule** (`isSitePath`, `src/core/url.js`, the one predicate for all callers): a string that passes
`isSafeUrl()` (no control character, DEL or backslash; no space at either end; no `//host`), **has no
scheme**, **contains no whitespace at all** (write `%20`), and is at most **500** characters. It is
relative to the installation root or root-absolute (`/…`). A value that ends in `.md`, `.markdown` or
`.txt` (before `?`/`#`) is **printed**; any other path is shown as the **"Full documentation:" link**.

**Language keys**: `/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/` (the rule of `files`, `cleanFiles()`).

**Placeholders** (`MAN_VARS = ['slug', 'id', 'collection', 'lang']`, filled with `encodeURIComponent` by
`fillTemplate()`):

| Placeholder | Value |
|---|---|
| `{slug}` | the item's slug (alias items: the alias's own slug) |
| `{id}` | the item's app id (`<prefix>-<slug>`) |
| `{collection}` | the collection id |
| `{lang}` | in a plain string: each language of the chain; in a map: the map key |

**Unknown placeholder** (any other `{name}`): the **registry and the terminal config warn and ignore the
whole value** (as if it were not set); **the validator reports an error**. This is the only behaviour; no
runtime skipping of unfilled sources exists (every known placeholder is always fillable for an item).

**Templates** — a collection's `man` and `config.terminal.manUrl` apply to many items, so every value
(every map value) must contain `{slug}` or `{id}`. Item values need not.

**Who a template applies to**: a collection's `man` applies only to items whose registry record has the
**same source as the collection** (`app.source === collection.source`, normally `'site'`);
`config.terminal.manUrl` only to items of the **site's own collections** (that source is `'site'`). Items
another source adds to a site collection at runtime — the vault's private bookmarks
(`config.vault.collection`, source `'vault'`) — use only their own `man`; when the site has no collection
of that id the vault creates it itself (source `'vault'`, no `man`), and `manUrl` does not apply there
either. Vault items carry no `man` (`toCollectionItems()` maps a fixed field list), so they never have a
manual page. Otherwise `man <private bookmark>` would request `…/<private slug>.md` in plain text and the
slug would land in server access logs; Tab completion would also list those items as having a manual.

**Alias items**: the manual of an alias item is its **own** `man`, never its target's. `Desk.apps.get()`
builds the alias view without the target's `man` (the other fields as before, including `docs`). An alias
item without `man` therefore uses its collection's template with the alias's own `{slug}`/`{id}` like
every other item of that collection.

**Language expansion** of one `ManValue` (`expandMan`, in this order, each path once):

- string with `{lang}` → one path per language of `Desk.i18n.chain()` (current, base, default, `en`);
- string without `{lang}` → the one path;
- map → for each language of the chain: the key equal to it, else the first key with the same base
  language (`de-AT` ↔ `de`, the rule of `i18n.resolve()`), filled with `lang` = that key; then the map's
  first value if it was not used yet (the same last resort as `Desk.L()`).

**Resolution** for a collection item (`manPlan`):

```
own      = the item's own man (undefined when not set)
tpl      = item.source === collection.source
site     = tpl && collection.source === 'site'
level    = own !== undefined ? own
         : !tpl            ? null
         : coll !== null   ? coll          // the collection's man (false stops here; manUrl is not used)
         : site            ? manUrl        // config.terminal.manUrl (null = none) — the site's items only
         : null
off      = level === false
docs     = Desk.L(item.docs) or null
texts    = off ? []                                  // false: nothing is read
         : (own === undefined && docs is a text file ? [docs] : [])    // compatibility (1.1.0)
           + text paths of expand(level)            — each once, at most MAX_MAN_SOURCES = 6
page     = docs, when docs is not in texts           // a page, or a text file that is not printed
           (so with off a text-file docs becomes the link)
           else the first non-text path of expand(level), else null
has manual (completion, lookup) = texts non-empty or page !== null, and !off
```

For `~/apps` entries the plan is the 1.1.0 one: `texts` = `[docs]` when it is a text file, `page` = `docs`
when it is not, no levels.

**Fetching** (`fetchManual`, sequential, stops at the first success, aborts with `io.signal`):
`Desk.net.request(url, { read: 'text', accept: 'text/markdown, text/plain', signal, onHeaders })`; a longer
text is cut to its first `MAX_FETCH` characters and printed, as `cat` does (and as 1.1.0 did).

| Answer | Classified as | Next path |
|---|---|---|
| 200 with `Content-Type: text/html` (SPA fallback, captive portal, a "404 page" sent as 200) | missing | tried |
| 200 otherwise | loaded | stop |
| `NetError` code `http`, status 404 or 410 | missing | tried |
| `http` with another status, `size`, `parse` | failed | tried |
| `network`, `timeout` | failed | **stop** (the next request would fail the same way) |
| `aborted` | aborted | stop, nothing printed |

**Outcome** (`manOutcome({ texts, page, off, loaded, missing, failed, aborted })`, pure):

| Outcome | When | Output |
|---|---|---|
| `aborted` | aborted | nothing |
| `print` | a text loaded | `KEY(1)   <brand> Manual   KEY(1)`, the text, blank line, "Full documentation:" + `page`, else + the entry's own link (`entryLink()`) |
| `link` | no text paths, `page` set, not `off` | "Full documentation:" + `page` |
| `error` | nothing loaded, at least one path `failed` | **error** `fetchError` + dim "Full documentation:" + `page` when set |
| `none` | everything else: no manual, `off`, every path missing | **dim** `noManualPage` ("Snake has no manual page."), then dim "Full documentation:" + `page` when set, else dim `manOpen` ("Open it:") + `entryLink()` |

So `man: false` together with a `docs` page prints the dim note plus the documentation link (`false` is an
explicit statement), and `man: false` with a text-file `docs` shows that file as the link instead of
losing it.

**Lookup** (`man <name>`, `manLookup(query, list, has)` pure in `lib.js`):

1. commands (a hidden command only by exact name and when documented); a query that names a hidden
   command without a page (an egg) continues with step 2 only — steps 3 and 4 are skipped;
2. an **exact** key or name match over **all** entries (the `dir/name` restriction and "current directory
   first" order as for `open`) → that entry; if it has no manual → outcome `none`;
3. `resolve()` (unique prefix, then unique part) over the entries **that have a manual** → hit / several;
4. a unique **prefix** over **all** entries → that hit gets outcome `none`; several → as in step 5 (no
   part match here: a stray substring — the egg `rm` is part of "Terminal" — must not name an unrelated
   entry);
5. nothing → error `noManual` ("No manual entry for X") + candidate table when several.

With `config.debug: true` an outcome `none` or `error` logs once:
`console.info('[terminal] man <key>: <outcome> — tried', urls)`.

Example:

```js
// site/apps.js — tools: files of the default language without, English files with a language folder
{ id: 'tools', prefix: 'tool', …,
  man: { de: 'help/tools/{slug}.md', en: 'help/en/tools/{slug}.md' },
  items: [
    { slug: 'json', …, docs: { de: 'help/tools/json/', en: 'help/en/tools/json/' } },  // page = "Full documentation"
    { slug: 'beta', …, man: false }                                                   // no manual yet
  ] },
{ id: 'games', … }   // no man: `man <game>` says "has no manual page" (unless config.terminal.manUrl is set)
```

Manual files never make the service worker offer a new version. Under `site/content/` or `site/data/`
they are data files: always fetched from the server first, the offline copy only answers without a
network (P12 "Code and data"). Elsewhere under `site/`, a manual the desktop read once stays current in
the offline copy: the worker refreshes it in place and drops it when it is gone (P12 "Fast start").

## Keys and accessibility

Enter runs; ↑/↓ history (draft kept); **Tab** completes commands, then arguments through each command's
`complete()` (one match → completed + space, common prefix, else the list) — **on an empty line Tab is
not taken**, so the keyboard never gets stuck; Ctrl/⌘+L clears (the help shows the shortcut through `i18n.keys('Mod+L')`); Ctrl/⌘+C without a selection cancels
the line (prints `^C`) — while a command runs (the focus rests on the output, `tabindex=-1`) it aborts it
(`io.signal`, late output is dropped, an open question is answered `null` and a later `io.readLine()` of the aborted command resolves `null` at once without opening a field); Ctrl/⌘+U empties the line. A click into the terminal focuses the
prompt (or an open question) unless text is being selected or a link was clicked.
Output `div.term-out[role=log][aria-live=polite]` with `aria-label` (`terminal.output`), input
`aria-label` (`terminal.input`); prompts are `aria-hidden`. Questions (`readLine`) get their own labelled
field; a password field is never echoed. The whole `.term` is a dark island (`data-island="dark"`).
The whole `.term` is always left to right (`dir="ltr"`, like the editor's text): in a right-to-left
language the prompt, the `cal` grid, ASCII art and columns keep their order; right-to-left words inside a
row still read right to left.

## Command registry and plugins

```js
// a definition (also the shape of a 'terminal' contribution item)
{ run(args, io, ctx),      // required, may be async
  help: text,              // '@ns.key' | { lang: text } | string | () => string
  usage: text, man: text,  // for `man <name>` (same forms)
  complete(word, ctx) → string[],
  hidden: false,           // not in help, completion or suggestions
  sensitive: false,        // arguments may hold secrets: history keeps only the name, echo "name …"
  when() → boolean }       // available right now
```

Sources, in this order: built-ins → `Desk.modules.contributions('terminal')` (plus modules loaded later,
`'module:loaded'`; a `'module:failed'` module's commands are withdrawn) → eggs (weak). The first
registration of a name wins; later ones are refused with `console.warn` — except over a weak one; a weak one over a taken name is dropped without a warning.

The built-ins load with the window code, so `setup()` **reserves** their names (`commands.reserve(names,
'builtin')`, `ORDER` in `index.js`; `dig`/`host`/`nslookup` only when DNS is on): a reserved name keeps its
place in the order (`help` lists the built-ins first, as before) and refuses every other source at once
(`register()` → `null` + the "exists already (builtin)" warning), but counts as a command (`get`, `has`,
`list`, completion) only once `window.js` registered it. The eggs are registered with the built-ins.
`tests/p09-terminal.test.mjs` checks that `ORDER` names every built-in.

`io`: `say(text | nodes[], cls?)`, `print(nodes, cls?)`, `err`, `dim`, `heading`, `blank`,
`table(rows, { gap, wrap })`, `link(text, href, base?)`, `markdown(text, baseUrl)`, `progress(text) → done()`,
`readLine(label, { secret })` → `string | null`, `clear()`, `cols()`, `win`, `signal`.
`ctx`: `{ name, rest, line, shell: { cwd(), cd(dir), user(), host(), history(), clearHistory(), commands, close(), shake() } }`.
Row classes for `say`: `term-pre` (no wrapping), `term-h`, `term-dim`, `term-err`, `term-kv`, `term-indent`.

### Service `terminal`

```ts
Desk.terminal.register(name, def) → remove() | null    // [a-z][a-z0-9-]{0,31}
Desk.terminal.list() → [{ name, hidden, source }]
Desk.terminal.has(name) → boolean
```

Until the first terminal window has opened (its code loaded), `list()` and `has()` know the contributed
and runtime commands only; the built-ins and eggs join when `window.js` is imported. `register()` behaves
as before: a built-in name is refused from the start (reserved).

Contributions consumed: `terminal` (e.g. the vault's `login`/`logout`, which use `io.readLine` with
`{ secret: true }` and `i18n.isYes()`; the Fortune app's `fortune`). Services used (all optional, null-safe): `vault`, `search`,
`settings`, `holidays`, `wm` (through `Desk.windows()`/`Desk.close()`). Events listened to: `vault:change`
(prompt), `storage:restore`, `storage:reset` (history), `module:loaded`, `module:failed`.

## Config (`config.terminal`, cleaned by `validateConfig`)

| Key | Default | |
|---|---|---|
| `user` | `'guest'` | prompt user of a guest, `[A-Za-z0-9._-]{1,32}` |
| `doh` | `null` | `{ url: 'https://…', name }` — https only; its host becomes the consent service's host |
| `eggs` | `true` | hidden fun commands |
| `historySize` | `100` | 0–1000 stored lines |
| `manUrl` | `null` | fallback for collection items without their own or their collection's `man`: a path template or `{ lang: template }` map with `{slug}` or `{id}` (+ `{collection}` `{lang}`) |

Also read: `brand.name`, `brand.host`, `brand.asciiLogo`, `brand.menuLabel`, `author.name/url`, `credit`,
`theme.tints`, `theme.accents`, `calendar.firstDay`, `services.dns`.

## Storage, consent, i18n, CSS

- Storage key **`term`** `{ history: string[], last: timestamp }` (validated: strings ≤ 500 chars without
  control characters, at most `historySize`; `last` a positive finite number); backup yes, reset group
  **`terminal`** (order 58, "Terminal history"). A line is looked up before it is stored: a `sensitive`
  command (the vault's `login`) goes in by its name only (`historyLine()`), so arguments typed by mistake
  (`login alice secret`) reach neither storage nor backups. An unknown name is kept as typed, as in any shell
  (`logn alice secret` lands in the history).
- Consent service **`dns`** (hosts: the resolver's host, label `@terminal.dnsService`) — declared only when
  `config.terminal.doh` is valid. The host must be in the server's CSP `connect-src`.
- Namespace **`terminal`** (en, de): `cmd.*`, `usage.*`, `man.*`, `noManualPage` and `manOpen` (an entry
  without a manual page), `bs.*`/`bk.*`/`bv.*` (browser), plurals
  for `uptime`, `windows`, `dfKeys`. Yes/no answers via `i18n.isYes()` (`_meta.yes`). Dates through
  `i18n.fmtDate`, numbers through `i18n.fmtNumber`.
- CSS `terminal.css`: `.term*` classes from the original; `.win.term-shake` (was the generic
  `.win.is-shaking`), `.term-art-col` (neofetch art column), `.term-indent` (man). Tokens only:
  `--reader-code-bg --reader-text --scroll-code-thumb --term-user --term-error --reader-link --cal-weekend
  --text --text-2 --text-3 --line --focus --ease`. Compact: 16 px prompt font (no zoom on phones).

## Deviations from the original

- **No jpkc.com content**: `cat` reads the site's `files` instead of fixed Markdown twins; `man` uses
  `man` (item, collection), `docs` or `manUrl` instead of fixed paths; `coffee` prints a teapot instead of opening a portfolio page;
  `update` reports the version instead of opening `/update/`; the prompt host comes from config.
- **Collections instead of tools/games/links/portfolio**: `ls`/`open`/completion/neofetch read every
  collection. `play` (games only) is gone — `open games/<name>` (or `cd games`) does the same for any
  collection.
- **`cd` is a real directory change** (the original only joked); the joke stays for `cd /`.
- **DNS**: resolver configurable, off by default, consent-gated, through `Desk.net` (was a hard-coded
  `fetch` to dns.google). `nslookup` moved from the eggs to the DNS commands.
- **`login`/`logout`** are the vault module's contribution (P7), no longer built in.
- **New**: `pwd` reflects `cd`; `history -c`; `lang`, `theme`, `accent`, `credits`; `man` for commands;
  Ctrl+C cancels a running command; ✓/✗ have text alternatives; `cal` follows the locale's week start.
- **Help texts are per command** (registry), not one fixed table; the order of the built-ins is kept.
- Browser and system names in `browser` stay: detected facts (nominative use), as decided in the blueprint
  and confirmed at integration (ARCHITECTURE §4: the glossary forbids naming the desktop's own features after
  third-party products, not stating facts).
