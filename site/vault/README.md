# Private bookmarks (vault)

> JPKCom Desktop — sealed vault files — © Jean Pierre Kolb — MIT License

This folder holds the **sealed** (encrypted) bookmark files of the optional `vault` module. Nothing in
it is shipped: `*.bin` and `*.json` here are git-ignored. **Never commit a `.bin` file, and never put the
plain text anywhere the web server publishes** — not below `site/`, not in the project (the desktop is
served from it) and not below any other web root you seal into; the tool refuses such an `--in` file.

## How it works

`login` in the desktop's terminal asks for a user name and a password. PBKDF2-HMAC-SHA-256
(`config.vault.iterations`, default 600 000, with `config.vault.salt`) turns them into 512 bits: the
first 256 are an AES-256-GCM key, the next 128 name the file (`<32 hex>.bin` in `config.vault.dir`).
Wrong credentials ask for a file that does not exist (404 → "Login incorrect."). The right ones fetch
and decrypt it; its groups and bookmarks join the collection `config.vault.collection` until `logout`
(the desktop creates that collection while unlocked if the site has none). "Stay logged in" keeps only
the non-extractable key in IndexedDB, never the password or the plain text.

## 1. Choose a salt of your own (once per deployment)

```sh
node tools/seal-vault.mjs --new-salt
```

Put the result into `site/config.js`:

```js
vault: { salt: 'paste-it-here', iterations: 600000, dir: 'site/vault/', collection: 'bookmarks' }
```

and add `'vault'` to `modules`. **An empty salt works but is warned about loudly** (console and tool):
every deployment without a salt of its own shares the public default, so precomputed guesses work
against all of them. Changing the salt or the iterations renames every file — seal again afterwards.

## 2. Write the plain text — outside the repository

```json
{
  "groups": [
    { "id": "work", "name": { "en": "Work", "de": "Arbeit" }, "icon": "ti-briefcase", "tint": "blue" },
    { "id": "lab", "name": "Home lab", "tint": ["#52d879", "#1b9245"] }
  ],
  "items": [
    { "slug": "wiki", "group": "work", "name": "Team wiki", "url": "https://wiki.example.org/",
      "desc": { "en": "Our wiki", "de": "Unser Wiki" }, "icon": "ti-book" },
    { "slug": "nas", "group": "lab", "name": "NAS", "url": "http://192.168.1.10:5000/" }
  ]
}
```

- `id` / `slug`: `a-z`, `0-9`, `-`; they must not clash with the site's groups or `<prefix>-<slug>` app ids.
- Texts: a string or a map of any number of languages. `url`: `https://` or `http://` (intranets), no
  user/password in it. `icon`: a Tabler id (`ti-…`, `tif-…`), falls back to the group's, then `ti-bookmark`.
  `tint`: a tint name of `config.theme.tints` or a pair of colours.
- Limits: 20 groups, 500 items. Groups without items stay in the plain text but are not shown.
- The original desktop's `{ "linkCategories": [...], "links": [{ "cat": … }] }` is read as well.

## 3. Seal

```sh
node tools/seal-vault.mjs --in ~/private/bookmarks.json
```

The tool reads salt, iterations, folder, collection and tints from `site/config.js` (`--config` for
another file) and the taken ids from the site manifest (`--manifest`), checks everything (it refuses
to seal while there are problems), asks for the user name and the password (hidden, twice), checks a
round trip and writes `site/vault/<32 hex>.bin` (`--out` for another folder).

- **Several users**: seal once per user. Other `.bin` files are never removed unless you say so —
  you are asked on a terminal; `--keep` keeps them without asking, `--prune` removes them.
- **Icons used only in the vault**: the tool warns when a Tabler icon is not in `src/icons/tabler.js`
  yet. Add those ids to `site/icons.json` (a JSON array) and run `npm run icons` — the file names
  icons only, nothing private. Until then the desktop shows the group's icon (or `ti-bookmark`) instead.
- **Where the plain text may lie**: the tool refuses an `--in` file below `site/`, inside the `--out`
  folder, or below the web root that folder belongs to — `--out` minus `config.vault.dir` (by default
  the project itself), or, for an `--out` that does not end in `config.vault.dir`, the folder above it.
  Keep it somewhere private such as `~/private/bookmarks.json`.
- **Scripts/CI**: `DESKTOP_VAULT_USER` and `DESKTOP_VAULT_PASS` replace the questions (a password in
  the environment can end up in the shell history), or pipe three lines (user, password, password).
- `--list` shows the sealed files and whether they match the current salt and iterations.

## 4. Deploy

Upload the `.bin` file into `config.vault.dir` on the server. The server must

- **not list the directory** (the file name is derived from the credentials — a listing hands out
  password verifiers),
- send `Cache-Control: no-cache` for it (a changed vault must arrive) and preferably
  `X-Robots-Tag: noindex`,
- serve the desktop over **https** (WebCrypto needs a secure context; `localhost` counts).

Then type `login` in the terminal of the desktop. `logout` hides the bookmarks again and forgets a kept
login; Settings → Reset → "Private bookmarks" does the same.
