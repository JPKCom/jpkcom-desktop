# Deine eigene Website in 10 Minuten

> Von der Vorlage zu deinem eigenen Desktop im Web: kopieren, umbenennen, füllen, prüfen, veröffentlichen.
> © Jean Pierre Kolb — MIT License.

[English](quickstart.md) | **Deutsch**

JPKCom Desktop besteht aus statischen Dateien, ohne Build-Schritt. Alles, was du für deine eigene
Website änderst, liegt in `site/`. Für dein eigenes Erscheinungsbild kommen ein paar feste Zeilen in
`index.html`, `manifest.webmanifest` und `assets/icons/` dazu. Für die Werkzeuge brauchst du Git und
Node.js 22 oder neuer. Der Desktop selbst braucht beides nicht.

Live-Demo der unveränderten Beispiel-Website: <https://jpkcom.github.io/jpkcom-desktop/>

1. [Eine Kopie holen](#1-eine-kopie-holen)
2. [Name, Autor und dein eigenes Logo](#2-name-autor-und-dein-eigenes-logo)
3. [Deine Inhalte](#3-deine-inhalte)
4. [Lokal prüfen](#4-lokal-prüfen)
5. [Veröffentlichen](#5-veröffentlichen)

---

## 1. Eine Kopie holen

**Mit der Vorlage** (empfohlen): Öffne <https://github.com/JPKCom/jpkcom-desktop>, klicke auf
**Use this template → Create a new repository**, wähle einen Namen und klone das neue Repository.
Ersetze `<user>` und `<repo>` durch deinen GitHub-Benutzernamen und den Namen des Repositorys:

```sh
git clone https://github.com/<user>/<repo>.git
cd <repo>
```

**Oder klone** das Projekt direkt:

```sh
git clone https://github.com/JPKCom/jpkcom-desktop.git my-desktop
cd my-desktop
```

**Oder lade es herunter**, ohne Git:

```sh
curl -fsSL -o jpkcom-desktop.zip https://github.com/JPKCom/jpkcom-desktop/archive/refs/heads/main.zip
unzip jpkcom-desktop.zip
cd jpkcom-desktop-main
```

Alle folgenden Befehle laufen in diesem Ordner.

## 2. Name, Autor und dein eigenes Logo

Name und Autor stehen in `site/config.js`, wo jeder Schlüssel kommentiert ist. Ersetze das Objekt
`brand` durch dein eigenes:

```js
	brand: {
		name: 'My Desktop',            // Dokumenttitel, „Über diesen Desktop“, Terminal
		shortName: 'My Desktop',       // Titel auf dem Home-Bildschirm, gleich short_name in manifest.webmanifest
		menuLabel: 'My Site',          // zugänglicher Name des Markenmenüs
		glyph: 'ti-device-desktop',    // ein Tabler-Icon statt des JPK-Monogramms
		logo: null,                    // kein ausführliches Logo: „Über diesen Desktop“ zeigt die Glyphe
		asciiLogo: ['My Site'],        // Terminal-Bild (neofetch), ein String pro Zeile
		host: null,
		themeColor: '#1c2935'
	},
```

- **Dein Name** kommt in `about.copyright`: `copyright: { holder: 'Erika Mustermann', since: 2026 }`
  („Über diesen Desktop“).
- **`author` und `credit`** sind die Credit-Zeile „JPKCom Desktop by Jean Pierre Kolb“ („Über diesen
  Desktop“, Startbildschirm, Terminal). Lass `author.name`, `author.brand` und `author.url`, wie sie
  sind, und behalte bitte `credit: true`. Aus `author.links` werden Apps im Hilfe-Menü und im Dock. Du
  kannst sie behalten, durch deine eigenen Profile ersetzen oder `links: []` setzen. Wenn du sie änderst,
  nennt dir `npm run validate` die Beispiel-Lesezeichen, die noch auf sie zeigen (`author-github`,
  `author-mastodon`).

**Brand-Assets.** Das JPK-Monogramm und das JPKCom-Logo stehen nicht unter MIT
([CREDITS.md](../CREDITS.md#brand-assets-not-mit)). Du darfst sie unverändert als Standard-Marke zeigen,
aber nicht als dein eigenes Logo verwenden. Für deinen eigenen Auftritt ersetzt du sie überall:

1. `brand.glyph`, `brand.logo` und `brand.asciiLogo` (oben).
2. `wallpaper.motifs` in `site/config.js`: Entferne `'author-monogram'` und `'author-emblem'`:

   ```js
   		motifs: ['author-blueprint', 'waves', 'dunes', 'aurora', 'orbit', 'horizon', 'graphite'],
   ```

3. Die App-Icons in `assets/icons/`: deine eigenen `favicon.svg` und `maskable.svg`, beide mit
   `viewBox="0 0 512 512"`. `maskable.svg` füllt das ganze Quadrat ohne abgerundete Ecken (ein
   `<rect width="512" height="512" fill="url(#g)"/>` als Hintergrund, so prüft es `npm test`) und hält
   das Bild in den mittleren 80 %. Ein einfacher Platzhalter für den Anfang:

   ```sh
   cat > assets/icons/favicon.svg <<'EOF'
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6e0"/><stop offset="1" stop-color="#0f6b8f"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><circle cx="256" cy="256" r="120" fill="#fff"/></svg>
   EOF
   cat > assets/icons/maskable.svg <<'EOF'
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6e0"/><stop offset="1" stop-color="#0f6b8f"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="256" r="96" fill="#fff"/></svg>
   EOF
   ```

   Danach erzeugst du die PNG-Icons (`icon-*.png`, `maskable-*.png`, `apple-touch-icon.png`) in einem
   Browser ohne Fenster:

   ```sh
   npm ci                                                # einmal: die Entwicklungswerkzeuge
   npx playwright-core install chromium-headless-shell   # einmal: der Browser, der die Icons zeichnet
   npm run icons:pwa
   ```

4. Die festen Zeilen in `manifest.webmanifest` (`name`, `short_name`, `description`, `theme_color`,
   `background_color`) und in `index.html` (`<title>`, `<h1 id="desk-title">`, Beschreibung,
   theme-color, apple-mobile-web-app-title, `<noscript>`).
   [deploy.md §11](deploy.md#11-offline-use-and-installation-pwa) listet jede Zeile auf. Behalte bitte
   die Meta-Tags `author` und `generator`.

## 3. Deine Inhalte

Das mitgelieferte `site/` ist eine Beispiel-Website: Über das Projekt, Handbuch, Versionshinweise,
Impressum, Datenschutz, Lesezeichen und ein Schaufenster. Ersetze sie nach und nach.

- **Apps, Sammlungen, Menüs: `site/apps.js`.** Der Kommentar am Anfang der Datei erklärt jedes Feld.
  Eine eigene Seite ist eine `page`-App. Trag sie in die Liste `apps` ein (die Datei definiert oben die
  Hilfsfunktion `page()`, die den Pfad für jede Sprache baut):

  ```js
  		{
  			id: 'services', kind: 'page', icon: 'ti-file-text', tint: 'blue', desktop: true, dock: true,
  			name: { en: 'Services', de: 'Leistungen' },
  			url: page('services.html', 'leistungen.html')
  		},
  ```

  Weitere Arten: `web` (eine Seite in einem iframe-Fenster), `link` (eine externe Seite in einem neuen
  Tab), Sammlungen (ein Katalog-Fenster mit Gruppen, zum Beispiel Lesezeichen) und `menus`. Details
  stehen im README-Abschnitt
  [`site/apps.js`](../README.de.md#siteappsjs-apps-sammlungen-menüs-dateien). Ein Icon, das der Desktop
  noch nicht verwendet (jeder Tabler-Name `'ti-…'`), braucht danach `npm run icons` (nach `npm ci`).
  `npm run validate` weist darauf hin.
- **Seiten: `site/content/<lang>/`**, eine schlichte HTML-Datei je Sprache. Der Reader zeigt das erste
  `main article`, dessen `h1` als Titel und den Absatz `.lead` darunter. Keine Skripte, keine Styles,
  keine `style`-Attribute:

  ```sh
  cat > site/content/en/services.html <<'EOF'
  <!doctype html>
  <html lang="en">
  <head>
  <meta charset="utf-8">
  <title>Services | My Site</title>
  <link rel="alternate" hreflang="de" href="../de/leistungen.html">
  <link rel="stylesheet" href="../content.css">
  </head>
  <body><main><article>
  <h1>Services</h1>
  <p class="lead">What I offer, in one or two sentences.</p>
  <p>Text, links, lists, tables …</p>
  </article></main></body>
  </html>
  EOF
  cp site/content/en/services.html site/content/de/leistungen.html   # dann übersetzen (siehe unten)
  ```

  In der deutschen Kopie übersetzt du den Text, setzt `<html lang="de">` und lässt den Alternate-Link
  auf die englische Seite zeigen: `<link rel="alternate" hreflang="en" href="../en/services.html">`.
  Diesen Links folgt der Reader, wenn jemand die Sprache wechselt.

- **Impressum und Datenschutz** (`site/content/<lang>/imprint.html`, `privacy.html`) sind Vorlagen.
  Füll sie vor dem Veröffentlichen aus, oder entferne sie aus `site.legal` in `site/config.js` und aus
  `site/apps.js`.
- **Mitteilungen**: Der Beispiel-Feed (`site/data/feed.<lang>.json`) ist das Changelog des Projekts.
  Ersetze ihn, oder entferne `'notify'` aus `modules` in `site/config.js`. **Glückskeks-Sprüche**:
  `site/data/fortunes/<lang>.json`.
- **Hintergrundbilder**: Leg Bilder in `site/wallpapers/` und trag sie in `wallpaper.images` ein. Den
  Standard setzt du mit `wallpaper.default`. Siehe [site/wallpapers/README.md](../site/wallpapers/README.md).

## 4. Lokal prüfen

```sh
npm run serve
```

Öffne <http://127.0.0.1:8080/>. Einen Build-Schritt gibt es nicht: Datei ändern, Seite neu laden.
`npm run serve` sendet die Sicherheits-Header der Produktion und braucht keine Pakete. Auf einem
anderen Port: `npm run serve -- --port 3000`. In einem Unterordner, wie auf GitHub Pages:
`npm run serve -- --base /my-desktop/` (<http://127.0.0.1:8080/my-desktop/>).

Danach die Prüfungen:

```sh
npm run validate      # site/apps.js und die App-Verweise in site/config.js
npm ci                # einmal: die Entwicklungswerkzeuge (Quellen der Tabler-Icons, Browser-Treiber)
npm run icons:check   # die Icon-Auswahl ist aktuell (sonst: npm run icons)
npm test              # die Unit-Tests des Projekts
```

`npm run validate` ist die Prüfung für deine Inhalte. `npm test` testet vor allem den Desktop selbst,
aber einige seiner Tests prüfen die mitgelieferte Beispiel-Website und schlagen fehl, sobald du sie durch
deine eigene ersetzt. Pass sie an deine Website an oder lösche sie aus deiner Kopie:

- Der Block „The example site“ am Ende von `tests/p11-site.test.mjs`:
  - „manifest: no content or URLs of the private original“: mindestens fünf Apps mit `kind` (`>= 5`).
  - „fortunes: …“: mindestens 38 Sprüche pro Sprache (`d.items.length >= 38`), und der Link jedes
    Spruchs zeigt auf eine vorhandene Seite (die Beispiel-Sprüche verlinken die Seiten in
    `site/content/<lang>/docs/`).
  - „feeds: …“: jeder Eintrag in `site/data/feed.<lang>.json` zeigt auf eine vorhandene Seite.
  - „content pages: …“: mindestens 16 Seiten (`pages.length >= 16`), Seitentitel, die auf
    „| JPKCom Desktop“ enden (die Zeile `assert.match(html, /<title>[^<]+ \| JPKCom Desktop<\/title>/, rel);`),
    Impressum und Datenschutz noch als Vorlage markiert (die `template-note`-Prüfung darunter).
- „validator CLI: the example site has no errors and no warnings“ in derselben Datei ruft den Validator mit
  `--strict` auf: Jede Warnung von `npm run validate` lässt ihn scheitern. Behebe die Warnungen, nicht den
  Test.
- „manifest: … brand defaults“ in `tests/p12-deploy.test.mjs`: `name`, `short_name` und `theme_color` in
  `manifest.webmanifest` gleich den Standardwerten in `src/core/config.js`. Ändere die drei Zeilen
  `assert.equal(manifest.…, DEFAULTS.brand.…)` so, dass sie mit deinen eigenen Werten vergleichen.

Bis dahin schlägt `npm test` fehl und ebenso der CI-Workflow deiner Kopie (`.github/workflows/ci.yml`),
der bei jedem Push auf `main` dieselben Prüfungen ausführt.
Eine Sprache hinzugefügt? Dann auch `npm run i18n:check`.

## 5. Veröffentlichen

### Auf GitHub Pages

Committe deine Änderungen und pushe sie in dein eigenes Repository. Beide Workflows (CI und Pages)
reagieren nur auf Pushes auf den Branch `main`. Aus einer Kopie der Vorlage:

```sh
git add -A
git commit -m "Make the desktop my own"
git push
```

Nach einem direkten Klon legst du vorher auf GitHub ein leeres Repository an (ohne README, ohne Lizenz)
und lässt `origin` darauf zeigen:

```sh
git remote set-url origin https://github.com/<user>/<repo>.git
git add -A
git commit -m "Make the desktop my own"
git push -u origin main
```

Nach einem Download (noch kein Git-Repository), ebenfalls mit einem leeren Repository auf GitHub:

```sh
git init -b main
git add -A
git commit -m "Make the desktop my own"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Einmal in deinem Repository auf GitHub:

1. **Settings → Pages → Build and deployment → Source:** „GitHub Actions“.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:** Name `PAGES`,
   Wert `true`. Ohne diese Variable wird der Pages-Workflow in Kopien der Vorlage übersprungen.
3. **Actions → Pages → Run workflow**, oder noch einmal auf `main` pushen.

Der Desktop läuft dann unter `https://<user>.github.io/<repo>/`. GitHub Pages kann den Header
Content-Security-Policy nicht senden, deshalb setzt der Workflow (`.github/workflows/pages.yml`) die
Basis-Policy als `<meta>`-Tag in die veröffentlichte `index.html`. Dieses Tag kann kein
`frame-ancestors` setzen, und Pages sendet weder `Permissions-Policy` noch andere Sicherheits-Header.
Schaltest du Online-Dienste ein, trag ihre Hosts auch in die Policy in der Workflow-Datei ein. Alle
Pages-Websites eines Kontos teilen sich den Origin `https://<user>.github.io` und können deshalb die
gespeicherten Daten der anderen lesen: Leg dort nur Code ab, dem du vertraust
([deploy.md §3](deploy.md#3-at-the-web-root-or-in-a-sub-folder)). Gib jedem Desktop einen eigenen
`namespace` in `site/config.js`, damit sich ihre Einstellungen und Caches nicht in die Quere kommen.
Details: [deploy.md → GitHub Pages](deploy.md#github-pages) (englisch).

### Auf deinem eigenen Server

Lade `index.html`, `manifest.webmanifest`, `sw.js`, `assets/`, `locales/`, `site/`, `src/`, `LICENSE`
und `CREDITS.md` hoch, ins Wurzelverzeichnis oder in einen Unterordner
([deploy.md §2](deploy.md#2-what-to-upload)). Übernimm die Konfiguration für deinen Server (Apache,
nginx, Caddy, Ferron, static-web-server): siehe den README-Abschnitt
[Server einrichten](../README.de.md#server-einrichten) und die Dateien in [docs/server/](server/). Liefere
den Desktop über HTTPS aus. [docs/deploy.md](deploy.md) (englisch) erklärt Header, Caching und wie du
ein Deployment prüfst.

---

Weiter: das README ([Konfiguration](../README.de.md#konfiguration-und-inhalte),
[Erscheinungsbild](../README.de.md#erscheinungsbild)), die App „Handbuch“ im Desktop und
[docs/ARCHITECTURE.md](ARCHITECTURE.md) (englisch), wenn du eigene Module schreiben willst.
