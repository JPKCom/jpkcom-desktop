# P7 — Vault (`src/modules/vault`)

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Private, encrypted bookmarks. Ported from the original's `vault.js` (crypto, content check), the
`Vault` block of `desktop.js` (6041–6185: unlock, keep, lock, resume, forget), the terminal commands
`login`/`logout` (`terminal.js` 1247–1302, 1378–1386) and the sealing script
(`scripts/seal-desktop-links.mjs` → `tools/seal-vault.mjs`). How to seal and deploy:
[`site/vault/README.md`](../../site/vault/README.md).

## Files

| File | Purpose |
|---|---|
| `src/modules/vault/vault-core.js` | pure (browser + Node): `derive`, `seal`, `open`, `header`, `readHeader`, `sameParams`, `clean`, `cleanText`, `cleanConfig`, `toCollectionItems`, `collectionDef`, `takenIds`, constants |
| `src/modules/vault/index.js` | descriptor: service `vault`, IndexedDB, collection merge, terminal contributions, reset group |
| `tools/seal-vault.mjs` | sealing CLI (imports `vault-core.js` and `src/core/config.js` as they are) |
| `locales/{en,de}/vault.js` | namespace `vault` |
| `tests/p07-vault.test.mjs` | derivation (incl. the original scheme against `node:crypto`), v1/v2 round trips, tampering, `clean`, `cleanConfig`, registry merge, the module service and the terminal commands with a fake desk |
| `site/vault/README.md` | sealing and deployment guide (the folder holds no `.bin`; they are git-ignored) |

No CSS: the vault has no UI of its own (the terminal shows it; the Catalog shows the bookmarks).

## Crypto and file format

- **KDF**: PBKDF2-HMAC-SHA-256 over `JSON.stringify([user, pass])` (user name NFC, trimmed, lower-case;
  password NFC), salt `config.vault.salt` (UTF-8; empty → the original's public default
  `'jpkcom-desktop-vault/v1'`), `config.vault.iterations` (default 600 000). 512 bits: 0–255 → AES-256-GCM key
  (imported **non-extractable**), 256–383 → file name (32 hex). Identical to the original, so the
  original's files open with the default salt.
- **Version 2** (written now): `"JPKV"` · `2` · KDF id `1` · iterations (uint32 BE) · salt length · salt ·
  IV (12) · ciphertext + tag. The whole header is the GCM additional data, so the file states the
  parameters it was sealed with and they cannot be changed unnoticed. `open(key, data, expect)` refuses a
  file whose header does not match the deployment's parameters; `tools/seal-vault.mjs --list` reports it.
- **Version 1** (the original: `"JPKV"` · `1` · IV · ciphertext) is still read.
- Plain-text buffers (`material`, derived bits, decrypted bytes) are zeroed after use.

## Service `vault`

```ts
Desk.vault.available() → boolean               // WebCrypto present (secure context)
Desk.vault.unlock(user, pass) → 'ok' | 'denied' | 'offline' | 'unsupported'
Desk.vault.keep() → Promise<boolean>           // keep the login on this device (IndexedDB)
Desk.vault.lock() → Promise                    // hide the bookmarks + forget a kept login
Desk.vault.forget() → Promise                  // forget a kept login only
Desk.vault.resume() → Promise                  // reopen a kept login (runs on 'desk:ready')
Desk.vault.user() → string | null              Desk.vault.unlocked() → boolean
Desk.vault.summary() → [{ id, name, count }]   // unlocked groups, name in the current language,
                                               // count = items that really entered the collection
```

- `unlock`: derive → fetch `<config.vault.dir><file>.bin` through `Desk.net.request` (same origin, `cache:
  'no-cache'`, 15 s timeout, `read: 'bytes'` with `maxBytes: config.vault.maxBytes` — timeout and limit
  cover the body, the transfer stops past the limit) → 404/410 = `'denied'`, any other failure or a file larger than
  `config.vault.maxBytes` = `'offline'` → decrypt (failure, including a foreign file such as an SPA fallback
  page = `'denied'`) → merge.
- `resume` (on `'desk:ready'`, i.e. after session restore and deep links, §3): an invalid record, a gone file
  (changed credentials) or a file that no longer decrypts → forget; offline → stay locked. A login made in
  the meantime wins.

## Event

`'vault:change'` `{ unlocked, user }` after every unlock, resume and lock (also as the document event
`<namespace>:vault:change`). The terminal (P9) updates its prompt (`user@host`) from it.

## Collection merge

While unlocked, the vault's groups and items are added to the collection `config.vault.collection` with
`registry.extendCollection(id, { groups, items, prepend: true }, { source: 'vault' })` — first, as the own
bookmarks are the ones used most (the original `unshift`ed its categories). Before that, the content is
checked again in the browser against the manifest as it is now (`clean()` with `takenIds()`): the vault never
replaces a public group or app id, unknown icons fall back item → group → `ti-bookmark`, unknown tints → `slate`.
Items are `kind: 'link'`, `nodock: true` (never pinnable to the dock), `allowHttp` for `http://` URLs
(intranets, as in the original) — per-item fields the registry keeps (ARCHITECTURE §7).
`lock` removes everything with `registry.removeSource('vault')`; Catalog, Search, menus and the terminal
follow `'apps:change'`.

**A site without that collection** gets one from the vault (`collectionDef()`: prefix `link`, name
`@vault.collection`, icon `ti-bookmarks`, tint `indigo`, `allowHttp: true`, source `'vault'`). On lock its
Catalog app, groups and items leave (an open Catalog window of it is closed) and the collection itself is
removed with `registry.removeCollection(id)` (ARCHITECTURE §7: only collections another source than the site
added; it takes the items and the registry-made Catalog app along), so after `logout` nothing — not even an
empty `bookmarks` directory in the terminal — shows that private bookmarks existed. The next unlock creates
it again. A new `login` while already unlocked (same or another user) only swaps the content: nothing is
closed, an open Catalog window redraws (as in the original, `eject()` + `refresh()`).

## Contributions

- `terminal: { login: { run, help: '@vault.cmdLogin', hidden: true, sensitive: true }, logout: { run, help: '@vault.cmdLogout', hidden: true } }`
  (P9). `run(args, io)` uses `io.readLine(label)` / `io.readLine(label, { secret: true })` (password field,
  never echoed or stored in the history). `login` takes no arguments: given some (`login alice secret`), it
  says so (`vault.noArgs`) and asks as usual; being `sensitive`, the terminal stores only `login` in its
  history (and so in backups) and echoes `login …`. `io.say(text, cls?)`, `io.err(text)`,
  `io.table(rows)` and `io.dim(text)` when present (else `io.say(text, 'term-dim')`). The keep question
  ("[y/N]") is answered through `i18n.isYes()` (the `yes` pattern of each `_meta.js`).
- `resetGroups: [{ id: 'vault', label: '@vault.resetLabel', hint: '@vault.resetHint', order: 85, onReset: lock }]`
  (Settings → Reset; the original forgot a kept login with "reset everything").

## Configuration (`config.vault`, cleaned by `validateConfig` → `Desk.modules.config('vault')`)

| Key | Default | Check |
|---|---|---|
| `salt` | `''` | string ≤ 255 UTF-8 bytes; empty → public default + **loud `console.warn` on every load** |
| `iterations` | `600000` | integer 10 000 – 10 000 000; below 600 000 warned |
| `dir` | `'site/vault/'` | same-origin folder ending in `/` (relative to the root or root-absolute) |
| `collection` | `'bookmarks'` | collection id |
| `maxBytes` | `1048576` | positive integer |

## Storage

- No localStorage keys (the plain text never leaves memory; nothing goes into backups).
- IndexedDB `<namespace>-vault` (`store.key('vault')`), object store `login`, one record
  `{ key: CryptoKey (non-extractable), file, user }` — only after "stay logged in".

## i18n

Namespace `vault`: `collection user pass check denied offline unsupported ok keep kept keepFail loggedOut
notLoggedIn cmdLogin cmdLogout resetLabel resetHint` (en + de; German texts from the original).

## `tools/seal-vault.mjs`

`--in <json>` (required; refused below `site/`, inside the `--out` folder or anywhere below the web root
that folder belongs to: `--out` minus `config.vault.dir` — by default the project itself —, else the folder
above `--out`), `--out <dir>` (default `config.vault.dir`), `--keep`/`--prune`
(other `.bin` files are never removed unless asked: a question on a terminal, kept in scripts),
`--config`, `--manifest`, `--list`, `--new-salt`, `--help`. Hidden password input in raw mode (no echo,
Backspace, Ctrl+U, Ctrl+C), asked twice; `DESKTOP_VAULT_USER`/`DESKTOP_VAULT_PASS` for CI; piped stdin lines
without a terminal. English output. Warns about passwords under 12 characters, an empty salt, and icons
that exist in Tabler but not in `src/icons/tabler.js` (→ `site/icons.json`, `npm run icons`; until then the
browser shows the group's icon or `ti-bookmark` in their place); icons of the site icon sets
(`config.iconSets`, read below the web root of `--out` — the project by default) count as known — a
vault-only icon must be in the set, and the set file is public: it shows which icons the vault uses, so
prefer generic icons for sensitive entries; unknown icons, tints, clashing ids, bad URLs refuse sealing. Round trip before writing; refuses files above `maxBytes`.

## Deviations from the original

- **Salt and iterations per deployment** (`config.vault`) instead of a fixed salt; file format **version 2**
  carries them in the authenticated header; version 1 stays readable.
- **Content format** = the collection format (`groups`/`items`/`group`) with language maps of any size
  (the original: `linkCategories`/`links`/`cat` with `{ de, en }` only — still accepted).
- **Tints** from `config.theme.tints` (or a colour pair) instead of a fixed list; default icon `ti-bookmark`
  (was a glyph of the original's commercial icon set).
- **Folder** `config.vault.dir` resolved against the installation root (the original's `data/` was relative
  to the document and broke without a trailing slash).
- **Sealing tool**: `--in/--out/--keep/--prune/--list/--new-salt`, English, raw-mode password input instead of
  the private `rl._writeToOutput`, env `DESKTOP_VAULT_*`, never deletes other users' files unless asked, reads
  config and manifest of the site instead of a fixed repository layout.
- **Event** `'vault:change'` through the bus (was the document event `jpkdesk-vault` without payload);
  `available` is a function (§10).
- **Reset**: an own reset group instead of a special case in "reset everything".
- **Collection created on demand** when the site has none (the original always had its bookmarks list).
- **Vault-made Catalog window closes on lock** (the original's bookmarks window was public and stayed).

## Integration

Applied at integration: the registry keeps the per-item `nodock`, `hidden` and `allowHttp` fields and offers
`removeCollection(id)`; the terminal (P9) consumes `terminal` contributions with the `io` described above;
Settings → Reset lists the key-less group `vault`.
