# P10 — Media: Audio Player and Video Player

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

One app module (`media`, `src/apps/media/`) with two apps, `audio` and `video`, built from one
implementation. Files come from the device — the Open button, Mod+O, or dropped on the desktop or on the
window — and play from `blob:` URLs. **Nothing is uploaded and nothing is stored**: the playlist lives as
long as the window. MP3 (ID3v2) and FLAC tags give title, artist, album, year, track, genre and the
cover; they are read locally in the browser.

| File | Content |
|---|---|
| `src/apps/media/index.js` | descriptor (`apps: [audio, video]`, `files` contributions, `configKey`, service `media`) |
| `src/apps/media/player.js` | `player(kind)` → the window hooks (`mount focus relabel menu unmount`) |
| `src/apps/media/types.js` | **the shared list** of audio/video extensions and MIME patterns, `kindOf()`, accept strings, format names |
| `src/apps/media/tags.js` | ID3v2.2/2.3/2.4 and FLAC tag reader (pure; `readTags(blob)`, `parseTags(bytes)`) |
| `src/apps/media/util.js` | pure helpers: `clock()`, `ratioParts()`, `bitRate()`, `nextIndex()`, `repeatAfter()`, `cleanMediaConfig()` |
| `src/apps/media/media.css` | `@layer apps` + `@layer compact` |
| `locales/{en,de}/media.js` | namespace `media` |
| `tests/p10-media-tags.test.mjs`, `tests/p10-media-util.test.mjs` | tag parser with synthetic buffers; types, helpers, config |

## Apps

| Id | Icon | Tint | Size | Name |
|---|---|---|---|---|
| `audio` | `ti-music` | `pink` | 720 × 520 | `@media.audioName` (Audio Player / Audioplayer) |
| `video` | `ti-movie` | `indigo` | 860 × 560 | `@media.videoName` (Video Player / Videoplayer) |

Both are kind `app`; a site may override fields with override records (`{ id: 'audio', dock: true }`).

## Behaviour (ported 1:1 from the original)

- **Audio**: cover (from the tags, else the app tile) and title/artist — album in the middle; own
  transport below: seek bar with elapsed and remaining time (`aria-valuetext` "1:02 of 3:25"), the two repeat
  switches on the left, previous / play-pause (round accent button) / next in the middle, mute and volume
  (`aria-valuetext` as a percentage) on the right. Low windows (container height ≤ 340 px) drop the cover;
  narrow ones (container width ≤ 400 px, e.g. playlist and info bar open, phones) put the transport on a
  row of its own.
- **Video**: the browser's own controls (`controls`, `playsinline`) on the `--media-stage` background; the
  repeat switches sit in the title bar.
- **Title bar**: Open, (video: Repeat track, Repeat playlist,) Playlist, Info — each with `aria-label` +
  `title`; Playlist and Info are `aria-pressed` toggles with `aria-controls`.
- **Empty window**: app tile, "No music open" / "No video open", the "Open files …" button and the hint that
  files stay on the device; a message about refused files shows inside it.
- **Playlist** (at most `config.media.maxItems`, default 200): opens by itself from the second file on unless
  it was toggled by hand; the current entry shows a speaker (playing) or pause glyph, `aria-current`; a
  remove button per entry (hidden until hover with a mouse, always visible for touch and keyboard; focus
  moves to the next entry or the Open button). New files start at once unless something is playing — then
  they queue up. Tags and lengths are read one file after the other in the background (a hidden, muted
  probe element with a 5 s timeout).
- **Repeat**: two switches that exclude each other. "Repeat track" always; "Repeat playlist" only from two
  files on (it hides and switches itself off below that). The app menu offers the three modes as radio
  items. On: `aria-pressed="true"` with the pressed look every `.win-btn` has (wm.css) — no style of its own.
- **Previous**: more than 3 s into a track (or on the first) it restarts the track, else it goes back.
- **Info bar** (Mod+I, like the image viewer): name, format (+ MIME type), duration, (video: resolution,
  aspect ratio,) the tags, average bit rate, size (+ exact bytes), modification date, source "From this device".
- **Messages** (`role=status`; announced through `Desk.announce` only while the playlist is empty, where the message sits in the non-live empty view — so each message is spoken once): the browser cannot play a file (the entry turns `--warn`),
  a file does not belong in this player, the playlist is full. They are kept as key + parameters, so a
  language switch translates them too.
- **Keys** inside the window (not in fields, sliders, the video's own controls, the title bar or a sheet;
  Space/Enter on buttons stay with the button): Space / K play-pause, ← / → seek by
  `config.media.seekStep` seconds (default 5), M mute, N next, P previous, F full screen (video),
  Mod+O open, Mod+I info.
- **App menu**: Open … (Mod+O), Play/Pause, Previous, Next, (video: Full screen,) the repeat radios,
  Playlist and Info (checkboxes), Clear playlist.
- **Media Session**: metadata (title, artist, album, cover artwork with its type) and the action handlers
  play, pause, previous/next track, seek backward/forward (the system's offset, else 10 s), seek to. One
  module-wide owner: whichever player played last; closing that window clears the metadata and handlers.
- **Closing** stops playback and revokes every blob URL (files and covers).
- **Files from the device never open as a document** (ARCHITECTURE §5). The players have no `popOut` and
  no `locationOf` (no "Open in new tab", no address), on purpose — keep it that way; their implementation
  also says `canPopOut: () => false` (defence in depth: `wm.canPopOut(win)` is false for them), and
  `canLink(win)` is false while the list holds an item (no "Copy link to this window": `#app=audio`
  would only reopen an empty player). A file is accepted by
  its extension too, so it may bring an empty or a wrong type (`text/html`, `image/svg+xml`); its blob URL
  therefore carries a real audio/video type only (`util.js` `mediaBlob(file, kind)`: the file's own
  `audio/*`/`video/*` type, else a copy typed by its extension through `typeFor()`, else
  `application/octet-stream`), so even the browser's own "Open video in new tab" shows a media player,
  never a page. Embedded covers are raster images only (`tags.js` never accepts SVG) and show in `<img>`.
  File sizes go through `Desk.i18n.fmtBytes` ("161 B" below 1 KB).

## Contributions offered

```js
files: {
  audio: { label: '@media.dropAudio', icon: 'ti-music', accept: ['.mp3', '.m4a', …], mime: /^audio\//,
           multiple: true, max: 10000, order: 60, open(files) },
  video: { label: '@media.dropVideo', icon: 'ti-movie', accept: ['.mp4', '.m4v', …], mime: /^video\//,
           multiple: true, max: 10000, order: 61, open(files) }
}
```

- `label` is a phrase for the drop overlay's "Opens {list}" (`media.dropAudio` / `media.dropVideo`).
- `accept` **is the shared extension list** (`types.js` `EXTENSIONS`) — other code can read it from the
  contribution (`Desk.modules.contributions('files')`), import it from `src/apps/media/types.js`, or ask the
  service (`Desk.media.types()`).
- `open(files)` sorts the files again by kind — MIME type first, then extension, as the original — so a file
  the drop matched by extension (e.g. `x.ogg` sent as `video/ogg`) still lands in the right player.
- `max` is large on purpose: the player enforces `maxItems` itself and says so ("The playlist is full").
- Without the shell's drop service, the player window takes dropped files itself.

## Service `media`

```ts
Desk.media.open(files) → number          // sorts files into the players (opens/shows them); files added
Desk.media.add('audio' | 'video', files) → number
Desk.media.kindOf({ name, type }) → 'audio' | 'video' | null
Desk.media.types() → { extensions: { audio, video }, mime: { audio, video }, accept: { audio, video }, formats }
```

`win.state.media` of an open player additionally offers `add(files)`, `clear()`, `snapshot()` (count, index,
repeat, playing, panels, message, items — used by the browser checks).

## Config

Optional section `media` (cleaned by the descriptor's `validateConfig`, read through
`Desk.modules.config('media')`; without it the defaults apply):

| Key | Default | Meaning |
|---|---|---|
| `maxItems` | `200` | longest playlist (1–1000) |
| `seekStep` | `5` | seconds for ← / → (1–60) |

## Consumed

`Desk.wm` (`requires: ['wm']`; `win.addActions`, `win.setTitle`, `wm.open`), `Desk.tile`, `Desk.icon`,
`Desk.i18n` formatters (`fmtNumber` incl. percent, `fmtBytes`, `fmtDate`), `Desk.announce`,
`Desk.service('drop')` (only to know whether the window must take drops itself).

- Events: none emitted; none listened to (language switches arrive through the `relabel` hook).
- Storage keys: **none** (nothing is stored, by design).
- i18n namespace: `media` (en, de).
- Icons: `ti-music ti-movie ti-folder-open ti-playlist ti-info-circle ti-repeat ti-repeat-once
  tif-player-play tif-player-pause ti-player-pause ti-player-skip-back ti-player-skip-forward ti-volume
  ti-volume-3 ti-x`.
- CSP: needs `media-src 'self' blob:` and `img-src blob:` (covers) — both in the default policy (§5).

## Deviations from the original and why

| Original | Port | Why |
|---|---|---|
| `TX = { de, en }`, `'de-DE' : 'en-GB'` ternary, `%s` | `locales/<lang>/media.js`, `t()` with named placeholders, plural objects (`count`, `full`, `bytes`), i18n formatters | any number of languages |
| window title fallback `win.app.name.de/en` | `win.setTitle(null)` (the app's name through `L()`) | language-neutral |
| Font Awesome Pro (`fal-repeat-1`, `fal-list-music`, `fad-music`, `fad-film`, …) | Tabler (`ti-repeat-once`, `ti-playlist`, `ti-music`, `ti-movie`, …) | licence |
| extension lists duplicated in `desktop.js` (drop) and `media.js` | one list in `types.js`, carried by the `files` contributions and the service | single source; `tests/p10-media-util.test.mjs` also checks (by calling the shell's `kindOf`, not by parsing its source) that the shell's built-in list has not drifted |
| `D.fileHandler(kind, fn)` + module-level `live[kind]` | `files` contributions; `wm.open(kind)` + `win.state.media` | contract §8, §19 |
| borrowed `.viewer-info/.viewer-empty/.viewer-none/.viewer-hint` | own `.media-info/.media-empty/.media-none/.media-hint/.media-error` (same look) | the viewer module is optional |
| `.win[data-app="video"] .win-btn.is-on` | `.win-btn.media-repeat[aria-pressed="true"]` (the shared `.win-btn` pressed style) | no coupling to the app id; one pressed look with enough contrast |
| `#000`, `#fff` | `--media-stage`, `--on-accent` | tokens |
| messages stored as text; a refused file's message vanished when the new files started | key + params (relabelled on a language switch); the message stays and is announced; inside the empty view it is visible too (the original's empty cover hid it) | a11y, i18n |
| format names `'QuickTime'` (.mov), `'MPEG-4 Audio (AAC/ALAC)'` (.m4a) | `'MOV'`, `'MPEG-4 Audio'` (the MIME type stays in the `<small>` below) | trademark glossary (§4) |
| `MAX_ITEMS`, `SEEK` constants | `config.media.maxItems`, `config.media.seekStep` | configurability |
| transport could overflow into the playlist in narrow windows | `minmax(0, 1fr)` tracks + a container-width rule | polish |
| Media Session seek ±10 s fixed | the system's `seekOffset`, else 10 s | follows the platform |
