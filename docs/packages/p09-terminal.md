# P9 — Terminal (`src/apps/terminal`)

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

A small shell ("jsh") over the desktop, ported from the original's `terminal.js` (1558 lines,
CSS desktop.css 4652–4811 + compact 5422–5425). Everything the original could do is still there;
what was tied to one site now comes from the catalogue, the config and a command registry that other
modules and site scripts extend.

## Files

| File | Purpose |
|---|---|
| `src/apps/terminal/index.js` | descriptor, the window (output log, prompt, keys, completion, `readLine`), the `io` given to commands, the registry wiring, service `terminal` |
| `src/apps/terminal/registry.js` | the command registry (pure): `createCommands()`, `cleanDef()`, `textOf()` |
| `src/apps/terminal/lib.js` | pure helpers: `parse`, `fold` (the shared rule of `src/core/text.js`, ß → ss), `distance`, `nearest`, `resolve`, `completeLine`, `cleanState`, `pushHistory`, `historyLine`, `cleanConfig`, `cleanDoh`, `cleanFiles`, `fillTemplate`, `isSafeHref`, `markdownRows`, `human` |
| `src/apps/terminal/catalog.js` | directories, `open` targets and counts from the app registry; the validated `files` of `site/apps.js` |
| `src/apps/terminal/commands/core.js` | `help`, `history`, `clear`, `echo`, `search`, `exit` |
| `src/apps/terminal/commands/fs.js` | `ls`, `cd`, `pwd`, `open`, `cat`, `man` |
| `src/apps/terminal/commands/sys.js` | `date`, `cal`, `whoami`, `uname`, `neofetch`, `lang`, `theme`, `accent`, `credits` |
| `src/apps/terminal/commands/browser.js` | `browser` (all facts read locally) |
| `src/apps/terminal/commands/storage.js` | `df`, `du` |
| `src/apps/terminal/commands/net.js` | `dig`, `host`, `nslookup` over DNS-over-HTTPS (only when configured) |
| `src/apps/terminal/commands/eggs.js` | hidden easter eggs |
| `src/apps/terminal/terminal.css` | `@layer apps` + `@layer compact` |
| `locales/{en,de}/terminal.js` | namespace `terminal` |
| `tests/p09-terminal.test.mjs` | unit tests of the pure parts and the descriptor |

## App

`terminal`, kind `app`, icon `ti-terminal-2`, tint `black`, 760 × 480, name `@terminal.appName`.
Hooks: `mount`, `focus` (an open question field first, else the prompt), `relabel` (accessible names —
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
| `man <command\|entry>` | built-in and plugin commands: NAME (help line), SYNOPSIS (`usage`), DESCRIPTION (`man`) — texts from i18n (`terminal.usage.*`, `terminal.man.*`) or the plugin's definition. Entries: their `docs` field (a `.md`/`.txt` on this site is printed; any other URL becomes the "Full documentation" link) and/or `config.terminal.manUrl` (template with `{slug}` `{id}` `{collection}` `{lang}`, tried for each language of the fallback chain). After a printed text manual the "Full documentation" line links the page source, or — as the original did — the entry itself (its `url` when https or on this site, else a button that launches it). A hidden command has a page only when it is documented (`help`/`usage`/`man`) and asked for by its exact name — eggs answer "No manual entry", as in the original. |
| `search <words>` | `Desk.searchFor()`; only while a `search` service exists. |
| `dig`, `host`, `nslookup` | only with `config.terminal.doh` **and** `config.services.dns === true`; `Desk.consent.ask('dns', { within: win })` before the first query; `Desk.net.getJson(url, { service: 'dns', accept: 'application/dns-json', timeout: 6000, signal })`. Output layout as in the original; the resolver's name comes from `doh.name`. |
| `cal` | month grid starting on `config.calendar.firstDay` (1–7) or the language's own week start (`i18n.weekInfo()`); today and holidays highlighted; holiday list under `Desk.holidays.heading()` when the `holidays` service has a region. |
| `neofetch` | `config.brand.asciiLogo` (≤ 16 lines × 40 chars) or the JPK monogram; user@host, OS (`brand.name` + version), kernel, shell, uptime, resolution, language, app and per-collection counts, windows, theme (accent + mode from the settings service), **credit** "JPKCom Desktop by <config.author.name>" (unless `config.credit === false`), the configured tints as swatches. |
| `uname [-a]`, `whoami`, `date` | host = `config.brand.host` or `location.hostname`; user = vault user or `config.terminal.user`. |
| `browser [section …]` | as the original (agent, system, screen, hardware, network, locale, prefs, privacy, page, features); labels from i18n; ✓/✗ cells also carry a visually hidden yes/no. |
| `df`, `du [-s] [word …]` | own keys = `Desk.store.key('')` (config.namespace); the original's "tools and DB" bucket is now "other". |
| `history [-c]`, `clear`, `echo`, `exit` | `history -c` is new (the menu item did it before). |
| `lang [code\|name]`, `theme [dark\|light\|auto]`, `accent [id]` | new (blueprint §9): `i18n.setLang()`, `settings.set('theme' \| 'accent', v)`; only offered while possible (2+ languages / settings service). |
| `credits` | product, author (link `config.author.url`), source repository, licence, Tabler Icons. |

Eggs (hidden, `config.terminal.eggs`, registered as **weak** — a real command of the same name replaces
them): `sudo`, `rm` (`rm -rf /` shakes the window unless reduced motion), `vim vi nano emacs` (opens
`editor`), `coffee brew tea tee` (ASCII teapot + "418 — I'm a teapot"), `update` ("up to date"),
`hello hi hallo moin servus`. An egg whose name is already taken steps aside silently (no warning).

Unknown command → "command not found" + "Did you mean …?" (edit distance ≤ 2, visible commands only).

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
| `manUrl` | `null` | relative template with `{slug}` or `{id}` (+ `{collection}`, `{lang}`) |

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
- Namespace **`terminal`** (en, de): `cmd.*`, `usage.*`, `man.*`, `bs.*`/`bk.*`/`bv.*` (browser), plurals
  for `uptime`, `windows`, `dfKeys`. Yes/no answers via `i18n.isYes()` (`_meta.yes`). Dates through
  `i18n.fmtDate`, numbers through `i18n.fmtNumber`.
- CSS `terminal.css`: `.term*` classes from the original; `.win.term-shake` (was the generic
  `.win.is-shaking`), `.term-art-col` (neofetch art column), `.term-indent` (man). Tokens only:
  `--reader-code-bg --reader-text --scroll-code-thumb --term-user --term-error --reader-link --cal-weekend
  --text --text-2 --text-3 --line --focus --ease`. Compact: 16 px prompt font (no zoom on phones).

## Deviations from the original

- **No jpkc.com content**: `cat` reads the site's `files` instead of fixed Markdown twins; `man` uses
  `docs`/`manUrl` instead of `/db/tools/`; `coffee` prints a teapot instead of opening a portfolio page;
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
