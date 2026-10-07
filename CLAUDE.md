# CLAUDE.md — JPKCom Desktop

© Jean Pierre Kolb — MIT License

Entwicklerleitfaden für Claude-Code-Sitzungen in diesem Repository. Kurz gehalten; der verbindliche
Vertrag ist [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Was das ist

Desktop-artige Web-Oberfläche (Fenster, Menüleiste, Dock, Apps) in Vanilla-JS. Open Source (MIT),
Autor Jean Pierre Kolb, Repo <https://github.com/JPKCom/jpkcom-desktop>. Ziel: jeder kann es
deployen, anpassen und wiederverwenden — alles, was ein Site-Betreiber ändert, liegt in `site/`.

## Grundsätze

- **Kein Build-Schritt, keine Laufzeit-Abhängigkeiten, kein CDN.** Native ES-Module, so ausgeliefert
  wie sie im Repo liegen. Braucht einen Webserver (`npm run serve`), kein `file://`.
- **Strikte CSP.** Kein `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`setHTMLUnsafe`/
  `srcdoc`, kein `style=""`, keine `<style>`-Elemente, kein Inline-Script, kein `eval`/`new Function`.
  DOM nur mit `h()`/`s()` aus `src/core/dom.js` + `textContent`; Styles über CSSOM
  (`h('span', { style: { '--tint': v } })`).
- **Alles Optionale ist ein Modul.** Der Core kennt keine konkrete App, Region, Provider oder Sprache.
  Module reden über Bus, Registries und Services — nie über Imports fremder Interna. Fehlt ein
  optionales Modul, wirft nichts.
- **Beliebig viele Sprachen.** Keine Zwei-Sprachen-Annahmen (`lang === 'de' ? … : …`, `{ de, en }`-only),
  keine zusammengesetzten Sätze, Zahlen/Daten nur über die i18n-Formatter, Plural-Objekte.
- **Robuste Daten.** Config, Manifest und gespeicherte Werte validieren; bei Fehlern `console.warn`
  + Default, nie Absturz.
- **Barrierefreiheit** wie im Vertrag (§1): Tastatur, benannte Dialoge, Fokus, `announce()`,
  `prefers-reduced-motion`.
- **Autor-Credit bleibt** („JPKCom Desktop by Jean Pierre Kolb“, JPK-Monogramm/Logo als Default-Brand).
  Monogramm und Logo sind das persönliche Logo des Autors seit 1996 — **nicht MIT** (Brand-Assets,
  © 1996–2026, alle Rechte vorbehalten, keine eingetragene Marke: kein ™/®). Was dazugehört und was
  erlaubt ist, steht in `CREDITS.md`; der Code, der sie zeichnet, bleibt MIT. `LICENSE` bleibt reiner
  MIT-Text.

## Layout

```
index.html, manifest.webmanifest, sw.js   Shell-Markup, PWA (Root wegen Scope)
site/            ALLES, was ein Betreiber anpasst: config.js (window.DESKTOP_CONFIG), apps.js (Manifest),
                 content/<lang>/, data/, vault/, wallpapers/, modules/ (Site-Apps, Beispiel hello/) — neutral
locales/<lang>/  _meta.js + ein Namespace pro Datei; en = Referenz, de mitgeliefert
src/boot/        theme.js (klassisch, vor dem ersten Paint), main.js (Einstieg)
src/core/        config env store bus i18n dom icons a11y registry router net consent storage-registry
                 modules services api dialog …
src/wm/ src/shell/ src/panels/   Core-Parts (wm, shell, panels) — laden als Deskriptoren
src/modules/<id>/  optionale Module (reader viewer catalog search calendar holidays weather notify vault)
src/apps/<id>/     Apps (editor notes todo calc terminal media fortune; Helfer src/apps/kit.js)
src/css/         layers.css tokens.css base.css components.css
src/icons/       tabler.js (GENERIERT, committed), custom.js (jpk, wc-*, tile-*, Logo)
tools/           serve, build-icons, i18n-check, validate-manifest, seal-vault, build-pwa-icons, browser-check
tests/           node --test, ein File pro Paket (p01–p12) + Core-Tests
docs/            ARCHITECTURE.md (Vertrag), packages/p01–p12, deploy.md, server/* (Apache, nginx, Caddy,
                 Ferron 2/3, static-web-server)
```

## Modul-Deskriptor (Kurzfassung, Details §8)

Default-Export von `src/modules/<id>/index.js` bzw. `src/apps/<id>/index.js`:

- `id`, `kind` (`'core' | 'module' | 'app'`), `requires: []`, `i18n: ['<ns>']`, `locales: 'locales/'`
  (gedacht für Site-Module: Texte im eigenen Ordner), `styles: ['<id>.css']`
- `app: {…}` oder `apps: [...]` (Manifest-Felder: `icon`, `tint`, `size`, `name: '@ns.key'` …)
- `storage` (Keys mit `validate`), `resetGroups`, `trash`, `consent: [{ id, hosts, label, hint }]`
- Beiträge: `files`, `settingsSections`, `settings`, `shortcuts`, `terminal`, `search`, `calendar`, `contextMenu`
- `configKey` + `validateConfig(section, warn)` → `Desk.modules.config(id)`
- `async setup(desk)`; Fenster-Hooks: `mount`, `render`, `focus`, `relabel`, `reopen`, `menu`, `unmount`,
  `serialize`, `restore`, `locationOf`, `acceptUrl`, `reload`, `popOut`, `canPopOut`, `canLink`,
  `beforeClose` (Liste: `HOOKS` in `src/core/modules.js`)

Neue Config-Keys → `DEFAULTS` in `src/core/config.js` **und** kommentiert in `site/config.js`.

## Regeln für Änderungen

1. **Vertrag zuerst.** Jede Schnittstellenänderung (Deskriptorfeld, Service, Event, Config-/Storage-Key,
   CSS-Token) erst in `docs/ARCHITECTURE.md`, dann im Code; Paketdetails in `docs/packages/p<NN>-*.md`.
2. **Strings in en + de** (und jeder weiteren Sprache in `locales/`). `npm run i18n:check` muss sauber sein.
3. **Icons nur Tabler** (`'ti-…'`/`'tif-…'`, als vollständiges String-Literal), Existenz prüfen in
   `node_modules/@tabler/icons/icons/{outline,filled}/<name>.svg`, danach `npm run icons`.
4. **Dateikopf** in jeder Quelldatei: `JPKCom Desktop — <Zweck> — © Jean Pierre Kolb — MIT License`.
   Ausnahme reine Brand-Grafik (`assets/icons/favicon.svg`, `maskable.svg`): `© 1996–2026 Jean Pierre
   Kolb — all rights reserved, not MIT (brand asset, see CREDITS.md)`.
5. **CSS-Layer**: alles in den eigenen Layer (`@layer modules`/`apps`/…), Phone-Overrides in
   `@layer compact { body.compact … }`, Präfixe aus §17, Tokens statt Farbliteralen, logische Properties.
6. **Markennamen-Glossar** (§4): keine fremden Produkt-/Markennamen für eigene Features
   (Search, Overview, Catalog, All apps, window controls `wc-*` …). Nominative Nennung von
   Datenprovidern/Servern ist erlaubt.
7. **Keine Inhalte des privaten Originals.** Nichts von jpkc.com (Texte, URLs, Seiten, Bookmarks) außer
   den Autor-Links (`config.author`, Credits). `tests/p11-site.test.mjs` und `tests/p12-deploy.test.mjs`
   prüfen das teilweise.
8. **Version** synchron in `package.json`, `src/core/env.js` (`VERSION`) und `sw.js` (`VERSION`).
9. **Unsichtbare Zeichen** (Bidi, Zero-Width) nur als `\u`-Escape — `tests/hygiene.test.mjs`.

## Prüfen

```sh
npm test                           # node --test "tests/*.test.mjs"
npm run i18n:check                 # alle Sprachen gegen en
npm run icons:check                # src/icons/tabler.js aktuell
node tools/validate-manifest.mjs   # site/apps.js gegen site/config.js (= npm run validate)
```

CI (`.github/workflows/ci.yml`) führt genau diese vier nach `npm ci` auf Node 22 aus.

**Browser-Check** (headless Chromium, Produktions-Header, scheitert an Console-/Page-Errors,
CSP-Verletzungen, fehlgeschlagenen Requests) — **immer serialisiert über `flock`**, nie mehrere parallel
(RAM):

```sh
flock /tmp/jpkcom-desktop-browser.lock node tools/browser-check.mjs --lang de-DE --mobile
flock /tmp/jpkcom-desktop-browser.lock node tools/browser-check.mjs --scenario <datei.mjs> --screenshot <out.png>
```

Szenario: `export default async ({ page, desk, log, assert }) => { … }`, `desk(fn, …args)` führt
`fn(window.JPKDesk, …args)` im Browser aus; absichtliche Fehler mit `export const expect = { http, console }`.
Alle Optionen im Kopf von `tools/browser-check.mjs`. Szenarien, Screenshots und Test-Configs gehören
**nicht** in den Projektbaum (vor dem Abschluss `git status` prüfen).

## Arbeitsweise

- **Keine Co-Authored-By-Trailer** und keine sonstige Claude-/Anthropic-Attribution in Commit-Messages.
- Commits nur auf Anweisung. Betreff englisch, imperativ, mit Bereichspräfix (`wm: …`, `i18n: …`);
  siehe [`CONTRIBUTING.md`](CONTRIBUTING.md).
- `node_modules/` nicht anfassen; `pkill -f` nicht benutzen (trifft die eigene Shell).
- Suchen: `git grep` oder das Grep-Tool; `node_modules` ausschließen.

## Weiterlesen

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Vertrag: §5 Sicherheit, §6 Config, §7 Manifest,
  §8 Deskriptor, §9 Desk-API, §12 i18n, §13 Icons, §14 Storage, §17 CSS, §21 „How to add …“, §22 Tools
- [`docs/packages/`](docs/packages/) — Referenz je Paket (P1 WM-Extras … P12 PWA/Deploy)
- [`docs/deploy.md`](docs/deploy.md), [`docs/server/`](docs/server/) — Deployment und Serverkonfigurationen
- [`locales/README.md`](locales/README.md) — Sprache hinzufügen
- [`site/vault/README.md`](site/vault/README.md) — Vault versiegeln
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`CHANGELOG.md`](CHANGELOG.md)
