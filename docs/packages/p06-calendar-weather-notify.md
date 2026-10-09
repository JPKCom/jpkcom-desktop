# P6 — Calendar, holidays, weather, feed notifications

> JPKCom Desktop — package documentation — © Jean Pierre Kolb — MIT License

Four optional modules that meet in one popover: the **calendar** under the clock, the **public holidays**
of one region, the **weather** (menu bar temperature + details) and **feed notifications** (banners for new
articles + the news list). Ported from the original's Holidays (desktop.js 5062–5133), Calendar (5135–5299),
Notify (5301–5471) and Weather (5473–5798), settings rows 3760 and 3794–3808, CSS desktop.css 3829–3991,
4262–4476, 511–524, compact 5301–5316. They know each other only through services, bus events and the
`calendar` extension point — each can be left out.

| Module | Files | Service | Default in `config.modules` |
|---|---|---|---|
| `calendar` | `src/modules/calendar/{index,core}.js`, `calendar.css` | `calendar` | yes |
| `holidays` | `src/modules/holidays/{index,core}.js`, `regions/de-by.js`, `holidays.css` | `holidays` | no |
| `weather` | `src/modules/weather/{index,core}.js`, `providers/{open-meteo,brightsky}.js`, `weather.css` | `weather` | no |
| `notify` | `src/modules/notify/{index,core}.js`, `notify.css` | `notify` | yes |

`core.js` files are pure (no DOM, no desktop imports) and covered by `tests/p06-*.test.mjs`.

## Calendar (`calendar`)

- Opens from the clock (the shell's `clock.js` calls `Desk.calendar.toggle(button)`) or the weather button
  (`toggle(button, { section: 'weather' })` scrolls to the weather). Pressing the same opener again closes it;
  another opener moves it over. The opener gets `aria-expanded` and `aria-controls`.
- `div.calendar[role=dialog][aria-label][tabindex=-1]` appended to `body`: today's long date with its ISO week,
  month title (no live region — `render()` rebuilds the popover; a month change by the user, buttons,
  PageUp/PageDown or Today, is announced through `Desk.announce()`), previous / Today (disabled on the current month) / next, a table of **always
  six rows** (`aria-labelledby` the title) with an ISO week column (`th scope=row`, label "Calendar week N"),
  weekday heads as `abbr` (short name, long name as title; a trailing abbreviation dot is dropped), weekend
  columns, other-month days dimmed, today `aria-current=date`, holidays ringed with their names as tooltip and
  in a visually hidden mark ("today, public holiday: …"); then the contributed sections.
- First weekday: `config.calendar.firstDay` (1–7, 1 = Monday) or `'auto'` = `i18n.weekInfo().firstDay` of the
  language; weekend days from `weekInfo().weekend`; week numbers are ISO 8601 (the week of the row's Monday),
  hidden with `config.calendar.weekNumbers: false`.
- Keys: Esc closes and returns the focus to the opener; PageUp/PageDown page through the months. A redraw
  (language switch, fresh weather, a new feed) keeps the focus on the control with the same `data-key`; a control
  that is disabled at that moment (refresh while loading) gets it back on the next redraw.
- Closes on a pointer press outside (except on its opener), window `blur` (click into an iframe), Esc, and any
  `'popovers:close'` that is not its own; opening emits `'popovers:close'` `{ except: 'calendar' }`.
- Service `calendar`: `toggle(opener, { section }?)`, `open(opener, opts?)`, `close(returnFocus = false)`,
  `isOpen()`, `opener()`, `redraw()`.
- Re-renders on `lang:change`, `holidays:change`, `module:loaded`, `module:failed`.

### Extension point `calendar`

```js
calendar: [{ id: 'weather', order: 10, render(ctx) { return node | null; } }]
// ctx: { view: { y, m },  // the month shown (m 0-based)
//        today: Date, close(returnFocus), redraw() }
```

Sections are read on every render (withdrawn modules drop out), sorted by `order`; the returned element gets
`data-section="<id>"`; a section that throws is logged and skipped. Shipped: holidays 0, weather 10, notify 20.
Sections reuse `.cal-head`, `.cal-btn`, `.cal-sub` from `calendar.css`.

## Public holidays (`holidays`)

- Computed, never fetched: fixed dates, dates relative to Easter Sunday (Meeus/Jones/Butcher) and — new —
  weekday rules (`[month, weekday, nth, key, { from, to }]`: "4th Thursday of November", "last Monday of May",
  "Wednesday before 23 November"). Rule options: `since`, `until`, `note`, `name`. Months count from 1.
- `config.holidays.region` (default `null` = none). Region files in `src/modules/holidays/regions/` (listed in
  `REGION_FILES`, loaded on demand with a computed `import()`, and in the descriptor's `precache: [...]` so the
  service worker keeps them offline — ARCHITECTURE §8; `tests/p06-holidays.test.mjs` keeps both lists equal to
  the folder; a new region file goes into both); `de-by` (Bavaria, with the Augsburg Peace Festival note "Augsburg only" and
  the Catholic-municipalities note on Assumption Day) ships as the example. A site region: a site module calls
  `desk.holidays.addRegion({ id, name, fixed, easter, weekday })` (list it after `holidays`); an unknown region
  is reported once at `'modules:ready'`.
- Names: i18n keys `holidays.<key>` (or the rule's own `name` text), notes `holidays.note-<note>`, region names
  `holidays.region-<id>`; a label with note is `holidays.withNote` "{name} ({note})". Two holidays on one day
  are both kept (1 May 2008 = Labour Day and Ascension).
- Service `holidays`: `year(y) → [{ date, name, title, note, key }]` (`name` = label with note, as the original
  public API; `title` = the plain name), `on(date) → [...]`, `addRegion(def) → boolean`, `region() → { id, name } | null`,
  `regions()`, `heading()`, `label(x)`. Event `'holidays:change'` `{ region }` when the active region arrives.
- Calendar section (order 0): `section.cal-hols` "Public holidays in {region}" with the month's holidays
  (`time` + name + note), today's highlighted.

## Weather (`weather`)

- **Two gates, nothing before both:** `config.services.weather === true` and the user's consent `weather`
  (the switch "Weather in the menu bar" that Settings → Online services renders from the consent registration,
  with the provider's host). `net.getJson` is called with `service: 'weather'` — providers get only that bound
  `getJson`. Revoking the consent deletes the cached data and hides everything.
- Providers: `{ id, name, hosts, coverage?, attribution(ctx) → Node, async load({ lat, lon, tz, now }, { getJson }) }`
  returning metric values (°C, km/h, %) and provider-neutral condition keys (`clear-day`, `clear-night`,
  `partly-cloudy-day/-night`, `cloudy`, `fog`, `wind`, `rain`, `sleet`, `snow`, `hail`, `thunderstorm`).
  - `open-meteo` (default): `api.open-meteo.com/v1/forecast`, worldwide, no key; one request (current, hourly,
    daily); WMO codes → conditions; attribution "Weather data: Open-Meteo.com" (link, CC BY 4.0).
  - `brightsky`: `api.brightsky.dev` (`current_weather` + `weather`, either is enough), Germany only (DWD);
    attribution "Data: DWD via Bright Sky".
  - more via `Desk.weather.addProvider(def)`; when it is the configured one, the consent is re-registered with its
    hosts. An unknown provider falls back to `open-meteo` at `'modules:ready'`.
- Config `weather`: `provider`, `units` (`metric` | `imperial`: °F and mph, converted for display), `defaultPlace`,
  `places: [{ id, name (text), lat, lon, tz }]` (invalid entries warned and dropped), `freshMs` (15 min),
  `maxAgeMs` (3 h), and `everyMs` (refresh interval, 30 min). All keys are in `DEFAULTS` (ARCHITECTURE §6).
- Menu bar: `button#mb-weather.mb-item.mb-weather` through `menubar.addStatus(el, 85)` (between language 80 and
  clock 90, as in the original: both calendar openers side by side; ARCHITECTURE §18), icon +
  temperature, label "Weather: 15 °C, Partly cloudy, Berlin"; hidden without fresh data; a calendar it opened
  closes when it goes. `aria-haspopup="dialog"` + `aria-expanded` only while a `calendar` service exists (without
  one the button just refreshes the weather).
- Calendar section (order 10): place + refresh button (`data-key=wx-refresh`, disabled while loading), loading /
  error note with retry, current icon/temperature/condition, ↑ high ↓ low, wind, humidity (all with long forms for
  screen readers through `Intl` units), every second hour of the next twelve with chance of rain from 30 %,
  "As of …" and the attribution. Hours and "as of" are shown in the place's time zone; the hour style comes from the
  locale (`weather.hourFormat`: `'hour'` → "14 Uhr", `'hour-minute'` → "14:00").
- Settings → Online services (contributions, order 30/31, through the settings `ctx` helpers): the place select
  (with "My location" once known; hint = the provider's coverage) and "Use my location" (only with
  `config.services.geolocation`; pressing it records the consent `geolocation`, the browser asks, only the
  position rounded to ~1 km is stored; on failure the consent is taken back). Withdrawing the `geolocation`
  consent deletes the coordinates and returns to the default place.
- Timing as the original: starts 2.4 s after `'desk:ready'`, refreshes every `everyMs` (when visible), on
  `visibilitychange` and `online`; one request at a time (a forced refresh while busy runs afterwards).
- Service `weather`: `addProvider(def)`, `providers()`, `provider()`, `refresh(force)`, `current()`, `place()`,
  `setPlace(id)`, `locate()`.

## Feed notifications (`notify`)

- Reads the JSON Feed (1.1) of the language: `config.notify.feeds[lang]`, else the next language of the fallback
  chain that has one (same origin only). Items need a title, a past `date_published` and a same-origin `url`
  (`config.site.hosts` count as this origin), optionally below `config.notify.pathPrefix` (relative to the root);
  newest first, at most 50, duplicates dropped.
- 1.8 s after `'desk:ready'`: first visit → the latest item; later → every item newer than the last one announced
  (stored per feed language). Banners through `Desk.notifyBanner({ title, body, app, url, meta, date, timeout, run })`
  (shell `notifications`), 300 ms apart; more than `maxBanners` → `maxBanners − 1` banners + "And N more new
  articles". Items open in `config.notify.app` (`launch(app, { url })`) when that app can open now, else through
  the router. `'notify:new'` `{ items }` is emitted for unannounced items.
- **Which app a banner shows** (`appFor()` + `routedAppOf()` in `core.js`): the app its article opens in —
  `config.notify.app` when it can open now, else the app the router sends the URL to, step by step as
  `router.openUrl()` does (`route()` → a routed app that can open; a page → `pageApp()`, the page app with the
  longest URL prefix or `site.defaultPageApp`). A file, a tab route or an app that cannot open → no app: the
  shell's bell. The banner then has that app's tile and name.
- **Summary banner** (`commonApp()`): when every new article — the shown and the folded ones — opens in the
  same app, it shows that app; otherwise the bell. It opens that app (`launch(id)`, the app's start page, e.g.
  the list of articles) when the app is the articles' home (`homeFor()`): `config.notify.app`, a routed app
  that is not a page app (site route, collection item), or a page app — reached through a site route or by
  its URL — one of whose URLs is a prefix of every article (`holdsAll()`). A page app that only shows them as
  `site.defaultPageApp` is no home; then — and with the bell — the summary opens the newest article through
  the router.
- **Meta line**: the app name (shell default); with `config.notify.label` (a text or `{ lang: text }` map,
  at most 60 characters, resolved with `Desk.L`) `t('notify.meta', { site, app })` — `<label> · <app name>` —
  or the label alone when the banner has no app (`metaFor()`/`metaOf()`). A label equal to the app name is
  shown once.
- Opening the calendar dismisses the banners (`'calendar:open'`); a language switch dismisses them and loads the
  new language's feed without banners.
- Calendar section (order 20): "New articles", the latest three, new ones with a dot and "(new)" for screen
  readers, relative dates (Today / Yesterday / date).
- Settings → General (order 30, between "reopen windows" and "seconds" as in the original): the switch
  "Notifications for new articles" (`data-key=notify`), shown only when feeds are configured.
- Service `notify`: `check(banners = true)`, `clear()`, `enabled()`, `setEnabled(on)`, `items()`.

## Storage keys

| Key | Module | Type | Backup | Reset group | Content |
|---|---|---|---|---|---|
| `weather` | weather | json | yes | settings | `{ place, lat?, lon? }` (coordinates rounded to 2 decimals) |
| `weather-data` | weather | json | no | session | last result `{ key, at, time, temp, icon, humidity, wind, hi, lo, station, hours }` |
| `notify` | notify | text | yes | settings | `'on'` / `'off'` (banners) |
| `feed` | notify | json | no | session | `{ <feed lang>: ms of the newest item announced }` |
| `consent-weather`, `consent-geolocation` | core consent | — | — | settings | via `Desk.consent` |

Every value is validated on read (`core.js` cleaners); the stored weather place `'here'` counts only with valid
coordinates and the `geolocation` consent. Time stamps must fit a `Date` (|ms| ≤ 8.64e15); a `weather-data.at`
more than 5 minutes in the future is dropped (it would count as fresh for good), as is a `feed` value more than a
day ahead (it would hide all news).

## Events

Emitted: `calendar:open` `{ section }`, `calendar:close` `{}`, `holidays:change` `{ region }`, `notify:new` `{ items }`,
`popovers:close` `{ except: 'calendar' }`. Consumed: `popovers:close`, `lang:change`, `module:loaded`,
`module:failed`, `consent:change`, `storage:reset`, `storage:restore`, `store:change`, `service:provide`,
`desk:ready`, `modules:ready`.

## i18n namespaces

`calendar`, `holidays`, `weather`, `notify` (`locales/{en,de}/…`); `core.today`, `core.yesterday`, `core.newMark`.
Numbers, units (°C/°F, km/h/mph, %), dates and lists only through the i18n formatters; no language branches.

## CSS

`calendar.css` (`.calendar`, `.cal-now`, `.cal-head`, `.cal-title`, `.cal-btn`, `.cal-today`, `.cal-sub`,
`.cal-grid` + compact sheet), `holidays.css` (`.cal-hols`, `.cal-hols-name`), `weather.css` (`.mb-weather`, `.cal-weather`,
`.cal-wx-*`), `notify.css` (`.cal-news`, `.cal-news-item`, `.cal-news-dot`, `.cal-news-name`) — all `@layer modules`, compact rules in
`@layer compact` (finger-sized previous/next 36 px and Today ≥ 32 px). Days of the neighbouring months are
muted by colour (`--text-3`; weekends and holidays a mix of `--cal-weekend` and `--text-3`), not by opacity,
so they keep 4.5:1. A focused news item keeps a transparent outline that forced colours turn visible.
In forced colours (`@media (forced-colors: active)`) today keeps its filled circle in `Highlight` /
`HighlightText`, a holiday of the month its ring as a `CanvasText` outline, and the dot of a new article a
`CanvasText` fill (`forced-color-adjust: none`) — otherwise all three would vanish. The popover uses `--z-popover`; text on the accent uses `--on-accent`; previous/next chevrons
are mirrored for right-to-left languages.

## Icons

`ti-chevron-left`, `ti-chevron-right`, `ti-rotate-clockwise` (refresh); conditions: `ti-sun`, `ti-moon-stars`,
`ti-haze` / `ti-haze-moon` (partly cloudy — Tabler has no cloud-with-sun glyph), `ti-cloud`, `ti-cloud-fog`,
`ti-wind`, `ti-cloud-rain`, `ti-cloud-snow` (sleet, hail), `ti-snowflake`, `ti-cloud-storm`, fallback `ti-temperature`.

## CSP

Sites that offer the weather add the provider host to `connect-src` (`api.open-meteo.com` or
`api.brightsky.dev`; `serve.mjs --connect https://api.open-meteo.com`) and, for "My location",
`Permissions-Policy: geolocation=(self)`.

## Deviations from the original and why

- **Holidays are data, not code**: region files / `addRegion()` with i18n keys instead of de/en tuples and a fixed
  Bavarian list; no region by default; weekday rules added so other regions (US, Saxony …) can be written.
  `on()` returns all holidays of a day (the original kept only the last one of a shared day).
- **Calendar sections are contributions** instead of hard-coded `Weather.section()` / `Notify.section()`; the
  holiday list moved into the holidays module.
- **First weekday and weekend from the language** (`weekInfo`) or config instead of Monday-first and Sat/Sun; the
  `de-DE`/`en-GB` locale ternaries became i18n formatter calls; a trailing abbreviation dot of the short weekday
  name is still removed, for every language alike (the narrow column has no room for it).
- **Weather**: provider interface; Open-Meteo is the default (Bright Sky covers Germany only); places, default place,
  units, intervals from config; the on/off switch is the core consent (`consent-weather`) instead of
  `{ on }` in the stored weather settings (that field is ignored); coordinates are dropped when the
  `geolocation` consent goes. Hours/"as of" use the place's time zone (the original used the browser's with
  German places only). Attribution strings no longer crash a language without them (`UI[lang].wxSource`).
- **Notify**: feeds per language from config with fallback chain and optional `pathPrefix` (was one fixed
  feed, path prefix, app and section label); banners come from the shell's notifications service; `maxBanners` replaces the
  fixed three; neutral texts ("New articles").
- **Calendar focus**: a redraw also restores the focus to a control that was disabled for a moment because it was
  busy (the weather refresh while loading; the original left it on the popover). The claim ends with the next
  paging, with "Today" (which disables itself; the focus stays on the popover as in the original), and when the
  control is gone (Retry after a successful load).
