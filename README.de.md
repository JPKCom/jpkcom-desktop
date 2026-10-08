# JPKCom Desktop

[English](README.md) | **Deutsch**

**Eine Weboberfläche im Stil eines klassischen Desktops, in reinem JavaScript: Fenster, Menüleiste, Dock und Apps im Browser.**

**[Live-Demo](https://jpkcom.github.io/jpkcom-desktop/)** ·
**[Deine eigene Website in 10 Minuten](docs/quickstart.de.md)** ·
**Use this template** (die Schaltfläche oben auf der
[Repository-Seite](https://github.com/JPKCom/jpkcom-desktop)) legt deine eigene Kopie an.

JPKCom Desktop macht aus einer Website einen Desktop nach dem klassischen Schreibtisch-Vorbild. Seiten
öffnen sich in Fenstern, die du verschieben, an einen Rand andocken und beim nächsten Besuch
wiederherstellen kannst. Menüleiste, Dock, Symbole auf dem Schreibtisch, „Alle Apps“ und eine
Schnellsuche führen zu den Inhalten. Dazu gehören ein Editor, Notizen, Aufgaben, ein Rechner, ein
Terminal, Mediaplayer und mehr. Alles sind statische Dateien: native ES-Module, kein Build-Schritt,
keine Laufzeit-Abhängigkeiten und eine strenge Content Security Policy. Du kannst den Desktop auf jeden
Webserver legen, in die Wurzel oder in einen Unterordner.

![JPKCom Desktop im dunklen Modus: Menüleiste, Fenster, Dock und Symbole auf dem Schreibtisch](docs/screenshots/desktop-dark.png)

**JPKCom Desktop by Jean Pierre Kolb** · [JPKCom](https://www.jpkc.com/) · [MIT-Lizenz](LICENSE)
(ausgenommen das JPK-Monogramm und das JPKCom-Logo, siehe [Brand-Assets](CREDITS.md#brand-assets-not-mit))

## Inhalt

- [Funktionen](#funktionen)
- [Schnellstart](#schnellstart)
- [Projektaufbau](#projektaufbau)
- [Konfiguration und Inhalte](#konfiguration-und-inhalte)
- [Sprachen](#sprachen)
- [Erscheinungsbild](#erscheinungsbild)
- [Erweitern](#erweitern)
- [Deployment](#deployment)
- [Private Lesezeichen (Tresor)](#private-lesezeichen-tresor)
- [Entwicklung](#entwicklung)
- [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
- [Credits, Lizenz und Autor](#credits-lizenz-und-autor)

---

## Funktionen

**Fenster**
- Fenster verschieben, in der Größe ändern, im Dock ablegen und zoomen; ein Doppelklick oder Doppeltipp
  auf die Titelleiste zoomt.
- Ziehst du ein Fenster an den linken oder rechten Rand, füllt es diese Hälfte, am oberen Rand zoomt es.
  Eine Vorschau zeigt, wo es landet. Ruht der Zeiger auf dem Zoom-Knopf, öffnet sich das Menü „Fenster
  anordnen“ (links, rechts, volle Größe, zwei Fenster nebeneinander).
- Die **Fensterübersicht** (F3 oder Strg+↑) zeigt alle Fenster verkleinert nebeneinander. Strg+\`
  wechselt zum nächsten Fenster.
- **Fenster wiederherstellen**: Offene Fenster kommen beim nächsten Besuch wieder, mit Position und
  Inhalt. Besucherinnen und Besucher können das abschalten.
- Deep Links: `#app=<id>`, `#search=<wörter>` und `#/pfad` öffnen eine App, die Suche oder eine Seite direkt.
- Fensterknöpfe links oder rechts, als farbige Punkte oder als schlichte einfarbige Symbole.

**Rund um die Fenster**
- **Menüleiste** mit Markenmenü, den Menüs deiner Website, dem Menü der aktiven App, der Suche, der
  Sprachwahl, dem Wetter und einer Uhr, die den Kalender öffnet.
- **Dock** mit angehefteten Apps, laufenden Apps und dem Papierkorb. Besucherinnen und Besucher können
  Apps anheften und umsortieren, die Größe ändern und die Vergrößerung einschalten. Dazu **Symbole auf dem
  Schreibtisch** und **Alle Apps** (ein Raster aller Apps über den ganzen Bildschirm).
- **Suche** (Strg/⌘+K oder `/`) über alle Apps, Sammlungen und jede Suchquelle, die ein Modul mitbringt.
  Für die Seiten deiner Website lässt sich optional ein [Pagefind](https://pagefind.app/)-Volltextindex
  ergänzen.
- Kontextmenüs überall: Rechtsklick, langer Druck auf Touchscreens, Umschalt+F10 oder die Kontextmenütaste.
- Dateien auf den Desktop ziehen: Text öffnet sich im Editor, Bilder im Bildbetrachter, Musik und Videos
  in den Playern. Nichts wird hochgeladen.
- Ein Startbild sowie Bildschirme für Neustart und Ausschalten. Ausschalten kann zu einer URL deiner Wahl
  führen.

**Apps** (jede ist optional; ein- und ausschalten in `site/config.js`)

| App | Was sie kann |
|---|---|
| Editor | Texteditor mit Tabs, Suchen und Ersetzen, Zeilenumbruch und Anzeige unsichtbarer Zeichen. Öffnet und speichert lokale Dateien und hält einen Entwurf im Browser. |
| Notizen | Notizen mit Suche. Gelöschte Notizen kommen in den Papierkorb. |
| Aufgaben | Eine Aufgabenliste mit Filtern und Umsortieren. Gelöschte Aufgaben kommen in den Papierkorb. |
| Rechner | Punkt vor Strich, Prozent, ein Verlauf und vollständige Bedienung per Tastatur. |
| Terminal | `ls`, `cd`, `open`, `cat`, `man`, `search`, `cal`, `neofetch`, `browser`, `df`, `du`, `lang`, `theme` und mehr, mit Tab-Vervollständigung und Verlauf. `dig`/`host` gibt es auf Wunsch der Website. |
| Audioplayer, Videoplayer | Spielen Dateien vom Gerät der Besucherin oder des Besuchers, mit Wiedergabeliste und Tags (MP3 ID3, FLAC). Nichts verlässt das Gerät. |
| Bildbetrachter | Bilder der Website und vom Gerät, mit einer Infoleiste (Format, Größe, Abmessungen). |
| Glückskeks | Ein Spruch, Tipp oder Witz aus lokalen Dateien. Eine Online-Quelle gibt es auf Wunsch der Website. |
| Katalog | Blättert durch eine Sammlung (Lesezeichen, Werkzeuge, ein Portfolio …) nach Gruppen, mit Suchfeld. |
| Reader | Zeigt die HTML-Seiten deiner Website direkt im Fenster, bereinigt, ohne iframe und ohne Skripte. |

Einstellungen, Hintergrund, Sicherung, Papierkorb, „Über diesen Desktop“ und „Bedienung“ gehören zum Kern.

**Module**: ein Kalender mit Kalenderwochen; Feiertage, die berechnet und nie geladen werden (als
Beispiel liegt die Region `de-by` bei); Wetter von Open-Meteo oder Bright Sky (auf Wunsch der Website);
Mitteilungen aus einem JSON Feed je Sprache; und der **Tresor**: verschlüsselte private Lesezeichen,
die sich mit `login` im Terminal öffnen.

**Deine Daten, dein Aussehen**
- **Sicherung und Papierkorb**: Besucherinnen und Besucher können alles, was sie angelegt haben, als eine
  Datei herunterladen und mit Vorschau wiederherstellen. Gelöschte Notizen und Aufgaben bleiben 30 Tage
  im Papierkorb.
- **Modi**: dunkel, hell oder automatisch; Akzentfarben (oder eine beliebige Farbe mit Kontrastprüfung);
  Kachelfarben; Hintergründe aus Farben, Verläufen, Bildern und erzeugten Motiven.
- **Beliebig viele Sprachen**: Deutsch und Englisch liegen bei. Eine weitere Sprache ist ein Ordner mit
  Übersetzungen.
- **Installierbar und offline nutzbar** (Service Worker und Web App Manifest).
- **Barrierefrei**: Die Menüleiste geht mit den Pfeiltasten, Fenster sind benannte Dialoge, der Fokus
  wird geführt und zurückgegeben, Änderungen werden über eine Live-Region angesagt, und reduzierte
  Bewegung wird respektiert. Alles funktioniert mit der Tastatur.
- **Strenge CSP**, kein `eval`, kein `innerHTML`, keine Inline-Styles, kein Code von Dritten, **keine
  Laufzeit-Abhängigkeiten**. Kein anderer Server wird angesprochen, solange die Website einen Dienst nicht
  einschaltet *und* die Besucherin oder der Besucher zustimmt.

| Heller Modus | Fensterübersicht | Alle Apps |
|---|---|---|
| ![Heller Modus](docs/screenshots/desktop-light.png) | ![Fensterübersicht](docs/screenshots/overview.png) | ![Alle Apps](docs/screenshots/launcher.png) |

| Einstellungen | Auf dem Smartphone |
|---|---|
| ![Einstellungen](docs/screenshots/settings.png) | ![Auf dem Smartphone](docs/screenshots/mobile.png) |

## Schnellstart

**Für deine eigene Website fängst du mit „Use this template“ an** — auf der
[Repository-Seite](https://github.com/JPKCom/jpkcom-desktop). GitHub legt dir ein eigenes Repository mit
allen Dateien an, bereit zum Ändern und zum Veröffentlichen auf GitHub Pages. Klone dann dieses
Repository statt des Originals. [Deine eigene Website in 10 Minuten](docs/quickstart.de.md) führt von
dort in fünf Schritten weiter.

Du brauchst Node.js 24 oder neuer, allerdings nur für die Werkzeuge. Der Desktop selbst besteht aus
statischen Dateien.

```sh
git clone https://github.com/JPKCom/jpkcom-desktop.git
cd jpkcom-desktop
sfw npm ci         # nur Entwicklungswerkzeuge: Quellen der Tabler-Icons, Browser-Checks ohne Fenster
npm run serve      # http://127.0.0.1:8080/ mit den Sicherheits-Headern der Produktion
```

Öffne <http://127.0.0.1:8080/>. Einen Build-Schritt gibt es nicht: Datei ändern, Seite neu laden.
`npm run serve` selbst braucht keine Pakete (`node tools/serve.mjs` läuft auch ohne `npm ci`).
`sfw` ist [Socket Firewall Free](https://github.com/SocketDev/sfw-free) und blockiert bösartige Pakete
schon bei der Installation; ein einfaches `npm ci` funktioniert auch. Install-Skripte von Paketen sind
abgeschaltet (`.npmrc`) — warum und wie man die Werkzeuge aktualisiert:
[CONTRIBUTING.md → Supply chain](CONTRIBUTING.md#supply-chain).

- `npm run serve -- --base /desktop/` liefert den Desktop in einem Unterordner aus (<http://127.0.0.1:8080/desktop/>).
- `npm run serve -- --port 3000 --host 0.0.0.0` nimmt einen anderen Port und macht den Server im LAN erreichbar.
- `--connect`, `--frame`, `--wasm` und `--geolocation` öffnen die Richtlinie so, wie du es auf deinem
  Server tun würdest (siehe [Deployment](#online-dienste-freischalten)).

**Warum nicht einfach `index.html` öffnen?** Unter `file://` laden Browser keine ES-Module, und `fetch()`,
der Service Worker und die gespeicherten Einstellungen brauchen einen echten Ursprung. Jeder statische
Webserver genügt; `npm run serve` sendet außerdem dieselben Sicherheits-Header wie die Produktion. Was
lokal läuft, läuft also auch hinter der echten Richtlinie.

## Projektaufbau

```
index.html, manifest.webmanifest, sw.js   die Seite, das Web App Manifest, der Service Worker
site/          ALLES, was du als Betreiberin oder Betreiber änderst
  config.js      window.DESKTOP_CONFIG — jede Option, in der Datei kommentiert, alle optional
  apps.js        das Manifest der Website: Apps, Sammlungen, Menüs, Dateien fürs Terminal
  content/       Seiten für den Reader, ein Ordner je Sprache (+ Demos und Bilder)
  data/          Glückskeks-Sprüche und Mitteilungs-Feeds je Sprache
  vault/         versiegelte private Lesezeichen (nichts mitgeliefert)
  wallpapers/    Hintergrundbilder (nichts mitgeliefert)
src/           der Desktop selbst — Kern, Fensterverwaltung, Shell, Panels, Module, Apps, CSS, Icons
locales/       die Texte, ein Ordner je Sprache (en ist die Referenz)
assets/        Favicon und App-Icons
tools/         Entwicklungswerkzeuge (Server, Icons, Prüfungen, Versiegeln) — werden nicht hochgeladen
tests/         Unit-Tests (node --test) — werden nicht hochgeladen
docs/          Architektur, Paketdokumentation, Deployment-Anleitung, Server-Konfigurationen
```

Die Regel: **`site/` gehört dir, `src/` ist das Projekt.** Mit Änderungen in `site/` (und in `locales/`
für eine neue Sprache) passt du den Desktop an. Lässt du `src/` unverändert, aktualisierst du, indem du
den Ordner ersetzt. `index.html` verlinkt `site/theme.css`: Kopiere die Datei beim Update einer bestehenden
Website in dein `site/` (eine leere Datei genügt) und lösche sie nicht.

## Konfiguration und Inhalte

### `site/config.js`

Ein klassisches Skript, das `window.DESKTOP_CONFIG` setzt. Jeder Schlüssel ist optional; was fehlt, kommt
aus den Standardwerten in `src/core/config.js`. Einen ungültigen Wert meldet die Browser-Konsole, und er
wird durch seinen Standard ersetzt; die Seite geht daran nie kaputt. Objekte werden Schlüssel für
Schlüssel mit den Standards zusammengeführt; Listen und einfache Werte ersetzen sie. Texte, die je
Sprache verschieden sind, sind Objekte wie `{ en: 'Tools', de: 'Werkzeuge' }`. Die Kommentare in der Datei
beschreiben jeden Schlüssel; die wichtigsten:

```js
window.DESKTOP_CONFIG = {
	brand: { name: 'My Desktop', shortName: 'My Desktop', menuLabel: 'My Site', themeColor: '#1c2935',
		glyph: 'ti-device-desktop', logo: null, asciiLogo: ['My Site'] }, // ersetzt die JPK-Standards (Brand-Assets, siehe CREDITS.md)
	author: { name: 'Jean Pierre Kolb', brand: 'JPKCom', url: 'https://www.jpkc.com/', links: [/* … */] },
	credit: true,                       // „JPKCom Desktop by Jean Pierre Kolb“ in Über diesen Desktop, Startbild, Terminal — bitte stehen lassen

	languages: ['de', 'en'],            // Ordner in locales/, in Menü-Reihenfolge
	defaultLang: 'en',

	theme: { default: 'auto', accent: 'teal', windowControls: { side: 'right', style: 'minimal' } },
	wallpaper: { default: { type: 'gradient', from: '#2b6cb0', to: '#0b1a33', dir: 'diag' } },

	modules: ['reader', 'viewer', 'catalog', 'search', 'calendar', 'holidays', 'weather', 'notify'],
	apps: ['editor', 'notes', 'todo', 'calc', 'terminal', 'media', 'fortune'],

	services: { weather: true },        // Online-Dienste: aus, solange sie hier nicht stehen, und jede Person stimmt trotzdem zu
	weather: { provider: 'open-meteo', defaultPlace: 'berlin' },
	holidays: { region: 'de-by' }
};
```

| Bereich | Schlüssel |
|---|---|
| Marke und Credit | `brand` (Name, Kurzname, Name des Markenmenüs, Symbol, Logo, Terminal-Bild, Farbe der Browserleiste), `author` (Name, Website, Profil-Links, die zu Apps werden), `credit` |
| Website | `site.home` (ein Eintrag „Klassische Website“), `site.legal` (Impressum/Datenschutz im Markenmenü), `site.hosts`, `site.routes`, `site.description`, `about` |
| Sprachen | `languages`, `defaultLang` |
| Aussehen | `theme` (Standardmodus, Akzent, `accents`, `tints`, `windowControls`), `wallpaper` (`default`, `motifs`, `colors`, `gradients`, `images`) |
| Desktop | `wm` (Andocken, Größen, iframe-Rechte), `session`, `dock`, `desktop.icons`, `boot`, `power.shutdownUrl`, `ui` |
| Module und Apps | `modules` (`reader`, `viewer`, `catalog`, `search`, `calendar`, `holidays`, `weather`, `notify`, `vault` oder eigene als `{ id, src }`), `apps` (`editor`, `notes`, `todo`, `calc`, `terminal`, `media`, `fortune`). Was du weglässt, wird gar nicht geladen. |
| Online-Dienste | `services: { weather, geolocation, fortune, dns }` (standardmäßig alle `false`) |
| Je Modul | `reader.rules`, `search` (`pagefind`, `shortcut`), `notify.feeds`, `holidays.region`, `calendar`, `weather` (`provider`, `units`, `places`), `fortune`, `media`, `editor`, `calc`, `terminal` (`doh`, `manUrl`), `trash`, `backup`, `vault`, `pwa`, `offline` |

Wetterorte sind Einträge `{ id, name, lat, lon, tz }` in `weather.places`. Mitteilungs-Feeds sind
`notify.feeds: { en: 'site/data/feed.en.json', de: 'site/data/feed.de.json' }`. Mehrere Desktops auf
einem Ursprung brauchen verschiedene `namespace`-Werte.

### `site/apps.js`: Apps, Sammlungen, Menüs, Dateien

Das Manifest der Website ist ein ES-Modul. Das mitgelieferte ist eine Beispiel-Website, die du durch
deine eigene ersetzt:

```js
export default {
	apps: [
		{ id: 'about', kind: 'page', icon: 'ti-user-circle', tint: 'slate', desktop: true, dock: true,
			name: { en: 'About', de: 'Über' },
			url: { en: 'site/content/en/about.html', de: 'site/content/de/about.html' } },
		{ id: 'status', kind: 'web', icon: 'ti-activity', tint: 'green', url: 'status/', name: 'Status' },
		{ id: 'repo', kind: 'link', icon: 'ti-brand-github', tint: 'black', url: 'https://github.com/JPKCom/jpkcom-desktop', name: 'Source' },
		{ id: 'notes', dock: true }               // ein Override-Eintrag: ändert eine App, die ein Modul mitbringt
	],
	collections: [{
		id: 'bookmarks', prefix: 'link', icon: 'ti-bookmarks', tint: 'indigo', sort: 'alpha',
		name: { en: 'Bookmarks', de: 'Lesezeichen' },
		groups: [{ id: 'reference', name: { en: 'Reference', de: 'Nachschlagen' }, icon: 'ti-book-2' }],
		items: [{ slug: 'mdn', group: 'reference', name: 'MDN Web Docs', url: 'https://developer.mozilla.org/' }]
	}],
	menus: [{ id: 'pages', label: { en: 'Pages', de: 'Seiten' }, items: ['about', '-', { collection: 'bookmarks' }] }],
	files: { about: { en: 'site/content/en/about.md', de: 'site/content/de/about.md' }, license: 'LICENSE' }
};
```

- **App-Arten**: `page` (eine Seite deiner Website im Reader), `web` (eine Seite in einem iframe-Fenster),
  `link` (eine externe Seite in einem neuen Tab, nur https), `collection` (ein Katalog-Fenster) und
  `alias: '<id>'` (zeigt und startet eine andere App). `desktop`, `dock`, `hidden`, `size` und `tint`
  platzieren und gestalten eine App.
- **Override-Einträge**: eine `id` ohne `kind`, etwa `{ id: 'notes', dock: true }`. Sie ändern die App
  eines Moduls; die Felder der Website gewinnen.
- **Sammlungen**: Jeder Eintrag wird zur App `<prefix>-<slug>`. Eine Sammlung bekommt ohne jeden Code ein
  Katalog-Fenster, eine Gruppe in der Suche und Menüeinträge (`{ collection: id }`). Ob ein Eintrag als
  Link, Webfenster, Seite oder Bild aufgeht, ergibt sich aus der URL (`itemKind: 'auto'`).
- **Menüs** nehmen App-Ids, `'-'` (ein Trenner), `{ collection }`, `{ label, url }` und Untermenüs `{ label, items }`.
- **Dateien**: was das Terminal mit `cat` zeigen kann. `.md`-Dateien werden als Markdown dargestellt.
- Pfade sind relativ zum Ordner des Desktops und funktionieren deshalb auch im Unterordner.

Das vollständige Format steht in [docs/ARCHITECTURE.md §7](docs/ARCHITECTURE.md#7-site-manifest-siteappsjs).
Prüfe dein Manifest, bevor du es veröffentlichst:

```sh
npm run validate          # Ids, Arten, Verweise, URLs (existieren lokale Dateien?), Icons, ein Text für jede Sprache
```

### Deine eigene App

Eine eigene App liegt in `site/`, neben deinen Inhalten — in `src/` ändert sich nichts, Updates des
Desktops lassen sie also in Ruhe. Starte mit der Beispiel-App **Hallo** in `site/modules/hello/`: ein
Fenster mit eigenen Texten in jeder Sprache (`locales/<sprache>/hello.js`), eigenem CSS, einem gespeicherten
Wert mit Sicherung und Zurücksetzen und einem Terminal-Befehl. Kopiere den Ordner, benenne ihn um, wie es
der Kommentar oben in seiner `index.js` beschreibt, und trag ihn in `site/config.js` ein:

```js
apps: [ …, { id: 'meine-app', src: 'site/modules/meine-app/index.js' } ],
```

`npm run i18n:check` prüft ihre Texte wie die des Desktops. Die vollständige Referenz steht in
[docs/ARCHITECTURE.md §8](docs/ARCHITECTURE.md#8-module-descriptor) und
[§21](docs/ARCHITECTURE.md#21-how-to-add-).

### Seiten für den Reader

Schlichte HTML-Dateien in `site/content/<sprache>/`. Die Standardregel (`config.reader.rules`) nimmt das
erste `main article`, `article` oder `main` als Inhalt, dessen `h1` als Titel und einen Absatz mit der
Klasse `lead` als Vorspann:

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Seitentitel | Meine Website</title>                 <!-- Fenstertitel: der Teil vor " | " -->
<link rel="alternate" hreflang="en" href="../en/seite.html"> <!-- die Seite nach einem Sprachwechsel -->
<link rel="stylesheet" href="../content.css">              <!-- wirkt nur außerhalb des Desktops -->
</head>
<body><main><article>
<h1>Seitentitel</h1>
<p class="lead">Ein, zwei Sätze zur Seite.</p>
<p>Text, <a href="andere.html">Links</a>, Listen, Tabellen, Abbildungen …</p>
</article></main></body>
</html>
```

Der Reader liest Seiten, ohne sie auszuführen, und behält nur erlaubte Elemente. Skripte, Styles,
`style`-Attribute, Formulare, iframes und Event-Handler werden entfernt. Schreib Seiten ohne sie, denn
die CSP würde sie beim Einlesen ebenfalls melden. Klassen bekommen das Präfix `c-`, damit eine Seite
nicht die Styles des Desktops übernimmt. Relative Links öffnen sich im selben Fenster, Links auf andere
Websites in einem neuen Tab. Die Beispielseite „Writing pages“ (`site/content/en/docs/pages.html`)
erklärt die Einzelheiten.

### Glückskeks-Sprüche und Feeds

- **Sprüche**: `site/data/fortunes/<sprache>.json`, nur reiner Text (höchstens 1000 Zeichen je Spruch).
  Die Sprachen, die eine Datei haben, trägst du in `fortune.langs` ein.

  ```json
  { "lang": "de", "by": "Meine Website",
    "categories": { "tipps": "Tipps" },
    "items": ["Ein einfacher Spruch.", { "text": "F3 zeigt alle Fenster.", "cat": "tipps" }] }
  ```

- **Mitteilungen**: ein [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/) je Sprache, auf demselben
  Ursprung (`notify.feeds`). Neue Einträge erscheinen als Banner und im Kalender. Einträge brauchen einen
  `title`, ein vergangenes `date_published` und eine `url` auf demselben Ursprung.

## Sprachen

Deutsch (`de`) und Englisch (`en`) liegen bei. Kein Code nimmt eine feste Zahl von Sprachen an. Bei zwei
Sprachen zeigt die Menüleiste einen Umschalter, ab drei ein Menü. So kommt eine dazu, zum Beispiel
Französisch:

1. Den Referenzordner kopieren: `cp -r locales/en locales/fr`.
2. `locales/fr/_meta.js` anpassen:
   ```js
   export default { name: 'Français', intl: 'fr-FR', dir: 'ltr', yes: '^(o|oui|y|yes)$' };
   ```
   `name` ist der Eigenname der Sprache, `intl` das BCP-47-Tag für Datum, Zahlen und Pluralformen, `dir`
   ist `'ltr'` oder `'rtl'`, und `yes` erkennt Ja-Antworten im Terminal.
3. Die Werte in jeder Datei übersetzen. Schlüssel und `{platzhalter}` bleiben, wie sie sind.
   Pluralformen sind Objekte mit den Kategorien, die deine Sprache braucht (`one`, `few`, `many`,
   `other`, …).
4. Den Code in `site/config.js` eintragen: `languages: ['de', 'en', 'fr']`.
5. Prüfen:
   ```sh
   npm run i18n:check -- fr   # fehlende Schlüssel, abweichende Platzhalter, Pluralkategorien
   npm run validate           # jeder Text in site/ hat einen Wert für jede Sprache
   ```
6. Optional: Seiten in `site/content/fr/`, `site/data/fortunes/fr.json` (und `'fr'` in `fortune.langs`),
   `site/data/feed.fr.json` (und `notify.feeds.fr`) sowie eine Zeile `<p lang="fr">` im
   `<noscript>`-Block von `index.html`.

Ein fehlender Schlüssel macht nichts kaputt. Er fällt auf die Grundsprache zurück (`pt-BR` → `pt`), dann
auf `defaultLang` und dann auf Englisch. Mit `debug: true` listet die Konsole jeden Schlüssel auf, der
zurückgefallen ist. Die Einzelheiten, auch zu den Schlüsseln, die Formate statt Sätze sind, stehen in
[locales/README.md](locales/README.md).

## Erscheinungsbild

Alles hier wird in `site/config.js` festgelegt. In Einstellungen und Hintergrund kann danach jede
Besucherin und jeder Besucher selbst wählen.

```js
theme: {
	default: 'dark',                                  // 'dark' | 'light' | 'auto' (folgt dem System)
	accent: 'blue',
	allowCustomAccent: true,                          // eine Farbauswahl; Text darauf wird schwarz oder weiß
	accents: { brand: '#0f6b8f', pink: null },        // eigene ergänzen (weiße Schrift braucht ≥ 4,5:1), null entfernt eine
	tints: { brand: ['#3fb6e0', '#0f6b8f'] },         // Kachelverläufe [oben, unten]; Apps nehmen tint: 'brand'
	windowControls: { side: 'left', style: 'classic' } // 'left' | 'right', 'classic' (Punkte) | 'minimal' (Symbole)
},
wallpaper: {
	default: { type: 'svg', id: 'waves' },            // oder { type: 'gradient' | 'color' | 'image', … }
	motifs: ['waves', 'dunes', 'aurora', 'orbit', 'horizon', 'graphite'],
	colors: [{ id: 'petrol', color: '#0f4c52', name: { en: 'Petrol', de: 'Petrol' } }],
	gradients: [{ id: 'ocean', from: '#2b6cb0', to: '#0b1a33', dir: 'diag', name: { en: 'Ocean', de: 'Ozean' } }],
	images: [{ id: 'harbour', src: 'site/wallpapers/harbour.webp', name: { en: 'Harbour', de: 'Hafen' },
		credit: 'Photo: Jane Doe, CC BY 4.0', tone: 'dark' }]
}
```

- **Verläufe** haben eine Richtung: `glow` (Licht von oben), `down`, `diag` oder `radial`.
- **Erzeugte Motive** sind SVG-Bilder, die der Browser zeichnet. `author-monogram` und `author-emblem`
  zeigen das JPK-Monogramm und das JPKCom-Logo (Brand-Assets, nicht MIT — siehe
  [CREDITS.md](CREDITS.md#brand-assets-not-mit)), `author-blueprint` ihre Konstruktionslinien; `waves`,
  `dunes`, `aurora`, `orbit`, `horizon` und `graphite` sind neutral.
- **Bilder** kommen nach `site/wallpapers/` (WebP oder AVIF, etwa 2560 × 1600). Setze bei einem hellen
  Bild `tone: 'light'`, damit Menüleiste und Symbolbeschriftungen lesbar bleiben. Siehe
  [site/wallpapers/README.md](site/wallpapers/README.md).
- **Namen der Akzentfarben**: Eine neue Akzentfarbe benennst du im Namensraum `settings` jeder Sprache als
  `accent.<id>`. Sonst wird ihre Id angezeigt.

**CSS-Tokens.** Jede Farbe, jeder Radius, jede Schrift und jede Größe ist eine Custom Property in
`src/css/tokens.css` (die Gruppen stehen in [ARCHITECTURE §17](docs/ARCHITECTURE.md#17-css-conventions-and-tokens)).

**Eigenes Theme.** Trage Token-Überschreibungen in `site/theme.css` innerhalb von `@layer themes` ein. Die Datei
wird vor dem ersten Paint geladen und offline vorgehalten, und die Ebene `themes` gewinnt gegen jede andere
Ebene. Familien wie `--radius-control` oder `--glass-backdrop` ändern alle zugehörigen Teile auf einmal. Alle
Tokens und die Regeln (hell und dunkel, dunkle Inseln, Handy) stehen in [docs/theming.md](docs/theming.md)
(auf Englisch).

```css
/* site/theme.css */
@layer themes {
	:root { --radius-control: 2px; --radius-panel: 4px; --radius-win: 4px; }
	body.compact { --radius-win: 4px; }
}
```

**Eigene Marke**: `brand` in `site/config.js` (mit `glyph`, `logo` und `asciiLogo`); `name`, `short_name`
und `theme_color` in `manifest.webmanifest`; die statischen Zeilen von `index.html` (Titel, Beschreibung,
`<noscript>`); eigene `assets/icons/favicon.svg` und `maskable.svg`, danach `npm run icons:pwa`;
`wallpaper.motifs` ohne `author-monogram` und `author-emblem`. Das JPK-Monogramm und das JPKCom-Logo
stehen nicht unter der MIT-Lizenz: Du darfst sie unverändert als Standard-Brand zeigen, aber nicht als
dein eigenes Logo verwenden ([Brand-Assets](CREDITS.md#brand-assets-not-mit)). Bitte lass `credit: true`
und die Meta-Tags `author`/`generator` stehen. [docs/deploy.md §11](docs/deploy.md#11-offline-use-and-installation-pwa)
listet jede Zeile auf.

## Erweitern

Alles Optionale ist ein Modul: ein Deskriptor-Objekt, das Apps, gespeicherte Daten, Übersetzungen,
Styles und **Beiträge** zu Erweiterungspunkten angibt. Module importieren sich nie gegenseitig; sie
nutzen die öffentliche API (`window.JPKDesk` oder `import Desk from 'src/core/api.js'`), Services und
Ereignisse. Ein Website-Modul liegt in `site/` und wird als `{ id, src }` eingetragen:

```js
/* site/modules/hello/index.js
   site/config.js: modules: [ …, { id: 'hello', src: 'site/modules/hello/index.js' } ] */
import Desk from '../../../src/core/api.js';

const { h, L } = Desk;

export default {
	id: 'hello',
	kind: 'module',

	/* Die App, die dieses Modul mitbringt (ihre Id ist die Modul-Id) */
	app: {
		name: { en: 'Hello', de: 'Hallo' },
		desc: { en: 'A tiny example app', de: 'Eine winzige Beispiel-App' },
		icon: 'ti-mood-smile',
		tint: 'green',
		size: [420, 240]
	},

	/* Fenster-Hook: baut den Inhalt in den Fensterkörper (kein innerHTML: h() und Text) */
	mount(win, body) {
		body.append(h('p', { class: 'hello-text', text: L({ en: 'Hello from a site module.', de: 'Hallo aus einem Site-Modul.' }) }));
	},

	/* Ein Beitrag zum Terminal: der Befehl `hello` */
	terminal: {
		hello: {
			help: { en: 'say hello', de: 'Hallo sagen' },
			run(args, io) {
				io.say(L({ en: 'Hello, world!', de: 'Hallo, Welt!' }));
			}
		}
	}
};
```

Ein neues Icon? Führe `npm run icons` aus (siehe unten).

| Erweiterungspunkt | Feld im Deskriptor | Beispiel |
|---|---|---|
| Apps und Fenster-Hooks | `app` / `apps`, `mount`, `serialize`, `restore`, `menu`, `beforeClose`, … | oben |
| Terminal-Befehle | `terminal: { name: { run(args, io, ctx), help, usage, man, complete } }` | oben; zur Laufzeit `Desk.terminal.register()` |
| Suchquellen | `search: [{ id, label, order, async search(q, ctx) → [{ title, sub, app, url, run }] }]` | zur Laufzeit `Desk.search.addProvider()` |
| Einstellungen | `settingsSections: [{ id, label, icon, order }]`, `settings: [{ id, section, order, render(ctx) }]` | eine Zeile mit einer eingebauten Id ersetzt diese |
| Tastenkürzel | `shortcuts: [{ id, keys: 'Alt+N', scope, run(e) }]` | |
| Kontextmenüs | `contextMenu: [{ selector, items(el, ctx) }]` | |
| Datei-Drops | `files: { kind: { accept: ['.ext'], label, open(file, ctx) } }` | |
| Abschnitte im Kalender | `calendar: [{ id, order, render(ctx) }]` | |
| Gespeicherte Daten | `storage`, `resetGroups`, `trash` (Sicherung, Zurücksetzen und Papierkorb gehen automatisch) | |
| Online-Dienste | `consent: [{ id, hosts, label, hint }]` + `Desk.net.getJson(url, { service: id })` | |
| Hintergrundmotive, Wetteranbieter, Feiertagsregionen | `Desk.wallpaper.register()`, `Desk.weather.addProvider()`, `Desk.holidays.addRegion()` | |

**Icons** kommen von [Tabler Icons](https://tabler.io/icons): Umriss `ti-<name>`, gefüllt `tif-<name>`.
Ausgeliefert werden nur die Icons, die tatsächlich benutzt werden. `npm run icons` durchsucht `src/`,
`site/` und `index.html` und schreibt dann `src/icons/tabler.js`. Icons, die in keiner Quelldatei stehen
(etwa nur in versiegelten Tresor-Daten), kommen als JSON-Liste in `site/icons.json` (`["ti-briefcase"]`).
`npm run icons:check` prüft, ob die Datei aktuell ist.

Der vollständige Vertrag steht in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Modul-Deskriptor (§8),
öffentliche API (§9), Services (§10), Ereignisse (§11), i18n (§12), Speicher (§14), CSS (§17),
„How to add …“ (§21). Jedes Paket ist in [docs/packages/](docs/packages/) dokumentiert.

## Deployment

### Voraussetzungen

- **Ein beliebiger statischer Webserver**, der ein paar Header senden kann. Es gibt keinen Server-Code und
  keinen Build-Schritt.
- **HTTPS.** Service Worker (Offline-Betrieb, Installation), Tresor (Web Crypto) und „Mein Standort“ fürs
  Wetter laufen nur in einem sicheren Kontext. Über reines HTTP läuft der Desktop trotzdem, nur ohne diese
  Funktionen. (`http://localhost` gilt beim Entwickeln als sicher.)
- **Die Wurzel oder ein beliebiger Unterordner.** Jeder Pfad ist relativ zum Ordner, in dem `index.html`
  liegt. `https://example.org/desktop` muss auf `https://example.org/desktop/` weiterleiten; jede
  Konfiguration unten tut das.
- **Caching:** `Cache-Control: no-cache` für HTML, JS, CSS, JSON, das Manifest und `sw.js`, weil die
  Dateinamen keine Version tragen. Browser fragen bei ihrer Kopie nach (`304`), ein Update erscheint also
  beim nächsten Neuladen (mit dem Schnellstart des Service Workers ein Neuladen später, nachdem der Desktop
  es angeboten hat). Bilder, Schriften und Medien bekommen einen Tag.
- **Keine Verzeichnislisten**, nirgends, und **keine Dotfiles** (`.git`, `.env`).
- **Die Sicherheits-Header** unten, bei jeder Antwort, auch bei Fehlern.

**Was hochgeladen wird**: `index.html`, `manifest.webmanifest`, `sw.js`, `assets/`, `locales/`, `site/`,
`src/`, `LICENSE` und `CREDITS.md`. **Nicht** hochladen: `node_modules/`, `tools/`, `tests/`, `docs/`,
`.git/`, `package.json` und `package-lock.json`. Die Konfigurationen verweigern nur Dotfiles; diese
Ordner verstecken sie nicht für dich.

**Gleicher Ursprung = volles Vertrauen.** Jede Seite auf dem Ursprung des Desktops kann seine
gespeicherten Daten lesen. Liefere dort nur deinen eigenen Code aus. Demos von Dritten gehören auf einen
anderen Ursprung oder in eine `web`-App mit `sandbox: 'allow-scripts'` (nie zusammen mit
`allow-same-origin`). [docs/deploy.md §3](docs/deploy.md#3-at-the-web-root-or-in-a-sub-folder) erklärt,
warum.

**GitHub Pages.** Der Workflow `.github/workflows/pages.yml` veröffentlicht die Website so, wie sie ist,
ohne Build-Schritt: die [Live-Demo](https://jpkcom.github.io/jpkcom-desktop/) und deine Kopie der Vorlage
unter `https://<user>.github.io/<repo>/`, sobald du als Pages-Quelle „GitHub Actions“ wählst und die
Repository-Variable `PAGES` auf `true` setzt. Anders als die Upload-Liste oben veröffentlicht er auch
`docs/` sowie die Paket- und Hauptverzeichnisdateien, was unbedenklich ist. Pages kann keine Header senden, deshalb fügt der Workflow
die Richtlinie als `<meta>`-Tag ein. Dieses Tag kann kein `frame-ancestors` tragen, und
`Permissions-Policy` und die übrigen Header fehlen. Den vollständigen Satz bekommst du nur mit einem
eigenen Server. Details stehen in [docs/deploy.md](docs/deploy.md#github-pages).

### Die Content Security Policy

Jede Konfiguration sendet diese Richtlinie. Unter HTTPS kommen `upgrade-insecure-requests` und HSTS dazu.
Apache fügt beides nur hinzu, wenn die Anfrage über HTTPS kam; `npm run serve` sendet beides nicht, weil
es reines HTTP spricht.

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:;
font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

Dazu kommen `Permissions-Policy` (alles aus, Geolocation nur, wenn du „Mein Standort“ anbietest),
`X-Frame-Options: SAMEORIGIN` (Fenster zeigen Seiten desselben Ursprungs im iframe, `DENY` würde sie
blockieren), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Cross-Origin-Opener-Policy: same-origin` und `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
Lass `blob:` in `img-src`, `media-src` und `connect-src` stehen: Bilder, Musik und Videos vom Gerät der
Besucherin oder des Besuchers spielen von `blob:`-URLs und verlassen das Gerät nie.

### Online-Dienste freischalten

Jeder Online-Dienst ist standardmäßig **aus** (`services` in `site/config.js`), und jede Besucherin und
jeder Besucher wird vor der ersten Anfrage gefragt. Schaltest du einen ein, erlaube seinen Host auch in
der Richtlinie deines Servers. Sonst blockiert der Browser die Anfrage.

| Funktion | `site/config.js` | Ergänzung in der Richtlinie |
|---|---|---|
| Wetter, weltweit | `'weather'` in `modules`, `services.weather: true`, `weather.provider: 'open-meteo'` | `connect-src https://api.open-meteo.com` |
| Wetter, Deutschland | wie oben, `weather.provider: 'brightsky'` | `connect-src https://api.brightsky.dev` |
| „Mein Standort“ fürs Wetter | `services.geolocation: true` | `Permissions-Policy: … geolocation=(self) …` |
| `dig`, `host`, `nslookup` im Terminal (DNS-over-HTTPS) | `services.dns: true`, `terminal.doh: { url: 'https://dns.google/resolve', name: 'dns.google' }` | `connect-src https://dns.google` (der Host von `terminal.doh.url`) |
| Glückskeks, Witze online | `services.fortune: true`, `fortune.remote: 'jokeapi'` | `connect-src https://v2.jokeapi.dev` |
| Glückskeks, Fakten online | `services.fortune: true`, `fortune.remote: 'uselessfacts'` | `connect-src https://uselessfacts.jsph.pl` |
| Volltextsuche (Pagefind) | `search.pagefind: { path: 'pagefind/pagefind.js' }` | `script-src 'wasm-unsafe-eval'` (WebAssembly; sonst braucht das nichts) |
| `web`-Apps von einem anderen Ursprung (fremde iframes) | eine App mit `kind: 'web'` und fremder `url` | `frame-src https://apps.example.org` |

**So änderst du die Konfiguration.** Neben ihrer aktiven `Content-Security-Policy`-Zeile hat jede Datei
unten einen Kommentar, der diese Hosts auflistet, und zwei auskommentierte Beispielzeilen (Wetter +
DNS-over-HTTPS; Pagefind + eine App von einem anderen Ursprung). Kopiere die aktive Zeile, ergänze nur
das, was du einschaltest, und setze die Kopie an die Stelle der aktiven Zeile. Lass
`upgrade-insecure-requests` stehen, wo die aktive Zeile es hat. Für „Mein Standort“ tauschst du die aktive
`Permissions-Policy`-Zeile gegen die auskommentierte darunter, die `geolocation=(self)` enthält. Beispiel
mit Wetter und den DNS-Befehlen:

```
connect-src 'self' blob: https://api.open-meteo.com https://dns.google;
```

Probier dieselben Ergänzungen zuerst lokal aus:

```sh
npm run serve -- --connect https://api.open-meteo.com,https://dns.google --frame https://apps.example.org --wasm --geolocation
```

### Server einrichten

Jede Konfiguration ist für sich vollständig und funktioniert ohne Änderung in der Wurzel und in einem
Unterordner. Jede wurde getestet: Server gestartet, Desktop unter `/` und unter `/desktop/` abgerufen,
Weiterleitung, Header, Richtlinie, MIME-Typen, Caching, `304`, Verzeichnislisten und Dotfiles geprüft.
Ersetze in jeder Datei `example.org` durch deinen Hostnamen und `/var/www/example.org` durch den Ordner,
in dem deine Dateien liegen (der Desktop kann in einem Unterordner davon liegen). Wo vorhanden, ersetzt
du auch die Zertifikatspfade `/etc/ssl/example.org/…`. Die Kommentare in den Dateien sind englisch. Die
Dateien liegen auch in [docs/server/](docs/server/), und [docs/deploy.md](docs/deploy.md) erklärt die
Hintergründe.

#### Apache 2.4

1. **Wohin:** Kopiere [`docs/server/apache.htaccess`](docs/server/apache.htaccess) als **`.htaccess`** in
   den Ordner, in dem `index.html` liegt. In der Datei gibt es nichts zu ersetzen.
2. **Module:** Apache 2.4.10+ mit `mod_headers`, `mod_mime` und `mod_alias`. `mod_dir`, `mod_deflate` und
   `mod_brotli` werden genutzt, wenn sie da sind. Unter Debian/Ubuntu: `a2enmod headers mime alias`.
3. **AllowOverride:** Der VirtualHost muss die Direktiven für diesen Ordner erlauben, sonst antwortet
   Apache mit `500`:
   ```apache
   <Directory "/var/www/example.org">
       AllowOverride FileInfo Indexes Options=Indexes
   </Directory>
   ```
   (`AllowOverride All` geht auch.)
4. **HTTPS** kommt aus deinem VirtualHost (das Zertifikat liegt dort). `upgrade-insecure-requests` und
   HSTS werden nur hinzugefügt, wenn `%{HTTPS}` an ist. **Hinter einem Proxy, der TLS beendet**, änderst du
   beide Bedingungen von `"expr=%{HTTPS} == 'on'"` in `"expr=%{HTTP:X-Forwarded-Proto} == 'https'"`.
5. **Online-Dienste:** Ändere die Zeile `Header always set Content-Security-Policy` und für „Mein Standort“
   die Zeile `Header always set Permissions-Policy`. Die Apache-Zeilen tragen kein
   `upgrade-insecure-requests`; das wird unter HTTPS angehängt.
6. **Prüfen und neu laden:** `apachectl configtest && apachectl graceful` (Debian: `apache2ctl`).
   `configtest` liest keine `.htaccess`; Fehler darin zeigen sich erst als `500` beim Abruf (siehe Fehlerlog).

<details>
<summary><code>.htaccess</code> (vollständig)</summary>

<!-- server-config: docs/server/apache.htaccess -->
```apache
# ============================================================================
# JPKCom Desktop — Apache configuration (.htaccess) — © Jean Pierre Kolb — MIT License
# ============================================================================
#
# Copy this file as ".htaccess" into the folder that holds index.html — the web
# root or a sub-folder such as /desktop/; nothing in it depends on the folder.
# Apache 2.4.10 or newer with mod_headers, mod_mime and mod_alias (mod_dir,
# mod_deflate, mod_brotli are used when present). The host must allow it:
#   AllowOverride FileInfo Indexes Options=Indexes
# (or "AllowOverride All"). Nothing here inherits from a parent .htaccess on
# purpose: the header set is complete on its own and replaces security headers
# a parent .htaccess or the server config may send.
#
# Service worker, installation, the vault and "My location" need a secure
# context: serve the desktop over HTTPS (localhost is the only exception).
#
# Check after a deploy:
#   curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-)'

# ---------- Files and folders ------------------------------------------------

# No directory listings anywhere (the vault's file names must stay secret)
Options -Indexes

# /desktop → /desktop/ (manifest, service worker and data are resolved relative to the page)
<IfModule mod_dir.c>
	DirectorySlash On
	DirectoryIndex index.html
</IfModule>

# Dotfiles (.git, .env, this file, …) are never served — /.well-known/ stays reachable.
# mod_alias is part of every standard Apache; deliberately without <IfModule>: should it
# be missing, Apache answers 500 instead of handing out .git/ or .env
RedirectMatch 404 "/\.(?!well-known/)"

# ---------- MIME types ---------------------------------------------------------

<IfModule mod_mime.c>
	AddType text/javascript .js .mjs
	AddType application/manifest+json .webmanifest
	AddType application/json .json
	AddType image/svg+xml .svg
	AddType application/octet-stream .bin
	AddCharset utf-8 .html .js .mjs .css .json .webmanifest .svg .md .txt
</IfModule>

# ---------- Compression ------------------------------------------------------

<IfModule mod_brotli.c>
	AddOutputFilterByType BROTLI_COMPRESS text/html text/css text/javascript application/json application/manifest+json image/svg+xml
</IfModule>
<IfModule mod_deflate.c>
	AddOutputFilterByType DEFLATE text/html text/css text/javascript application/json application/manifest+json image/svg+xml
</IfModule>

<IfModule mod_headers.c>
# Inside <Files>: Apache applies <Files>/<FilesMatch> sections after all directory and .htaccess
# directives, parents first — so only here do these headers win over a parent's <FilesMatch>.
<Files "*">

	# ---------- Security headers -----------------------------------------------

	# A parent .htaccess or the server config may set these with plain "Header set" (another
	# table than "always"): remove those copies, or browsers would get two policies and apply both
	Header unset Content-Security-Policy
	Header unset Permissions-Policy
	Header unset X-Frame-Options
	Header unset X-Content-Type-Options
	Header unset Referrer-Policy
	Header unset Cross-Origin-Opener-Policy
	Header unset Strict-Transport-Security

	# Content-Security-Policy. Opt-in extensions — switch on ONLY what the site offers:
	#
	#   connect-src  add the hosts of the online services set to true in site/config.js → services:
	#                  weather, provider 'open-meteo':  https://api.open-meteo.com
	#                    a place search by name, if you add one: https://geocoding-api.open-meteo.com (the shipped providers never call it)
	#                  weather, provider 'brightsky':   https://api.brightsky.dev
	#                  terminal dig/host (DoH):         https://dns.google   (the host of terminal.doh.url)
	#                  fortune, remote 'jokeapi':       https://v2.jokeapi.dev
	#                  fortune, remote 'uselessfacts':  https://uselessfacts.jsph.pl
	#   frame-src    add the origins of 'web' apps whose url lives on another origin
	#   script-src   add 'wasm-unsafe-eval' only for the optional Pagefind search (WebAssembly)
	#
	# Then replace the line below with your extended copy, e.g. weather + DoH:
	#   Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
	# or with Pagefind and a framed app from another origin:
	#   Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self' https://apps.example.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
	Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
	# On HTTPS: upgrade-insecure-requests and HSTS. Behind a proxy that terminates TLS, use
	# "expr=%{HTTP:X-Forwarded-Proto} == 'https'" instead of "expr=%{HTTPS} == 'on'".
	Header always edit Content-Security-Policy "$" "; upgrade-insecure-requests" "expr=%{HTTPS} == 'on'"
	Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" "expr=%{HTTPS} == 'on'"

	# Geolocation stays off unless the site offers "My location" for the weather
	# (services.geolocation: true) — then use the second line instead
	Header always set Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
	# Header always set Permissions-Policy "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

	# SAMEORIGIN, not DENY: windows show same-origin pages in iframes
	Header always set X-Frame-Options "SAMEORIGIN"
	Header always set X-Content-Type-Options "nosniff"
	Header always set Referrer-Policy "strict-origin-when-cross-origin"
	Header always set Cross-Origin-Opener-Policy "same-origin"

	# ---------- Caching --------------------------------------------------------

	# The files carry no version in their names: browsers revalidate them on every use (ETag /
	# Last-Modified → 304), the service worker does the same. Images, fonts and media: one day.
	Header set Cache-Control "no-cache"
	Header set Cache-Control "public, max-age=86400" "expr=%{REQUEST_URI} =~ m#\.(png|jpe?g|gif|webp|avif|ico|woff2?|mp3|ogg|oga|m4a|wav|mp4|webm)$#i"
	Header unset Expires

	# ---------- Sealed vault files (site/vault/) -------------------------------

	# The file name is derived from the credentials: never listed (see Options above),
	# always revalidated (a re-sealed file must not come from a cache), not for search engines
	Header always set X-Robots-Tag "noindex, nofollow, noarchive" "expr=%{REQUEST_URI} =~ m#/site/vault/#"

</Files>
</IfModule>
```
<!-- /server-config -->

</details>

#### nginx

1. **Wohin:** Kopiere [`docs/server/nginx.conf`](docs/server/nginx.conf) nach `/etc/nginx/conf.d/desktop.conf`
   (oder nach `sites-available/` mit einem Link in `sites-enabled/`). Sie wird innerhalb von `http { }`
   gelesen und enthält zwei `map`-Blöcke, eine Weiterleitung von HTTP auf HTTPS und den HTTPS-Server.
2. **Ersetzen:** `server_name` (zweimal), `root`, `ssl_certificate` und `ssl_certificate_key`. Nötig ist
   nginx 1.19+; `http2 on;` braucht 1.25.1+ (auf älteren Versionen schreibst du stattdessen
   `listen 443 ssl http2;`).
3. **Nie `add_header` in einen `location`-Block setzen**, auch nicht in einen eigenen: In nginx schaltet das
   für diese Location alle Header der Server-Ebene ab. Deshalb kommen die pfadabhängigen Werte aus den
   beiden Maps.
4. **Online-Dienste:** Ändere die Zeile `add_header Content-Security-Policy … always;` und für „Mein
   Standort“ die Zeile `add_header Permissions-Policy`.
5. **Prüfen und neu laden:** `nginx -t && nginx -s reload` (oder `systemctl reload nginx`).

<details>
<summary><code>nginx.conf</code> (vollständig)</summary>

<!-- server-config: docs/server/nginx.conf -->
```nginx
# ============================================================================
# JPKCom Desktop — nginx configuration — © Jean Pierre Kolb — MIT License
# ============================================================================
#
# A complete site file for /etc/nginx/conf.d/ (or sites-available/): it is read
# inside the http { } block, which is why the map blocks may stand at the top.
# Replace example.org, the certificate paths and the root folder. nginx 1.19+.
#
# Root or sub-folder: copy the desktop's files into the root folder itself
# (https://example.org/) or into a folder below it (https://example.org/desktop/).
# Nothing else changes — the rules below match the desktop's paths wherever they
# are. A request for /desktop (without the slash) is answered with a redirect to
# /desktop/ by nginx itself (a directory; no try_files with $uri/ here, which would
# serve the page without the slash and break its relative paths).
#
# Why the maps: an add_header inside a location removes every add_header of the
# server block for that location. All headers are therefore set once, at server
# level, with values that depend on the path (an empty value sends no header).
#
# Service worker, installation, the vault and "My location" need a secure
# context: serve the desktop over HTTPS (localhost is the only exception).
#
# Check after a deploy:
#   curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-)'

# ---------- Path-dependent header values ------------------------------------

# Images, fonts and media: one day. Everything else (HTML, JS, CSS, JSON, manifest, sw.js,
# sealed vault files): revalidated on every use (ETag / Last-Modified → 304).
map $uri $desk_cache_control {
	default "no-cache";
	~*\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|mp3|ogg|oga|m4a|wav|mp4|webm)$ "public, max-age=86400";
}

# Sealed vault files: not for search engines
map $uri $desk_robots {
	default "";
	~/site/vault/ "noindex, nofollow, noarchive";
}

# ---------- HTTP → HTTPS -----------------------------------------------------

server {
	listen 80;
	listen [::]:80;
	server_name example.org;
	server_tokens off;   # no version number in the Server header, here as in the HTTPS server
	return 301 https://$host$request_uri;
}

# ---------- The site -----------------------------------------------------------

server {
	listen 443 ssl;
	listen [::]:443 ssl;
	http2 on;
	server_name example.org;

	ssl_certificate     /etc/ssl/example.org/fullchain.pem;
	ssl_certificate_key /etc/ssl/example.org/privkey.pem;

	root /var/www/example.org;
	index index.html;

	# No directory listings (the vault's file names must stay secret); relative redirects
	autoindex off;
	absolute_redirect off;
	server_tokens off;
	charset utf-8;
	charset_types text/css text/javascript application/json application/manifest+json image/svg+xml text/plain text/markdown;

	gzip on;
	gzip_vary on;
	gzip_types text/css text/javascript application/json application/manifest+json image/svg+xml text/plain text/markdown;

	# ---------- Security headers ---------------------------------------------

	# Content-Security-Policy. Opt-in extensions — switch on ONLY what the site offers:
	#
	#   connect-src  add the hosts of the online services set to true in site/config.js → services:
	#                  weather, provider 'open-meteo':  https://api.open-meteo.com
	#                    a place search by name, if you add one: https://geocoding-api.open-meteo.com (the shipped providers never call it)
	#                  weather, provider 'brightsky':   https://api.brightsky.dev
	#                  terminal dig/host (DoH):         https://dns.google   (the host of terminal.doh.url)
	#                  fortune, remote 'jokeapi':       https://v2.jokeapi.dev
	#                  fortune, remote 'uselessfacts':  https://uselessfacts.jsph.pl
	#   frame-src    add the origins of 'web' apps whose url lives on another origin
	#   script-src   add 'wasm-unsafe-eval' only for the optional Pagefind search (WebAssembly)
	#
	# Then replace the line below with your extended copy, e.g. weather + DoH:
	#   add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" always;
	# or with Pagefind and a framed app from another origin:
	#   add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self' https://apps.example.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" always;
	add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" always;

	# Geolocation stays off unless the site offers "My location" for the weather
	# (services.geolocation: true) — then use the second line instead
	add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
	# add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;

	# SAMEORIGIN, not DENY: windows show same-origin pages in iframes
	add_header X-Frame-Options "SAMEORIGIN" always;
	add_header X-Content-Type-Options "nosniff" always;
	add_header Referrer-Policy "strict-origin-when-cross-origin" always;
	add_header Cross-Origin-Opener-Policy "same-origin" always;
	add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

	# Caching and the vault (values from the maps above)
	add_header Cache-Control $desk_cache_control;
	add_header X-Robots-Tag $desk_robots always;

	# ---------- Locations (no add_header in here — see above) -------------------

	# Dotfiles (.git, .env, …) are never served
	location ~ /\.(?!well-known/) {
		return 404;
	}

	# MIME types that the stock mime.types lacks or names differently (.js is still
	# application/javascript there; RFC 9239 says text/javascript). A types { } block here
	# would replace the whole list of the http block, so each one gets its own small location.
	location ~* \.webmanifest$ {
		types { }
		default_type application/manifest+json;
	}
	location ~* \.m?js$ {
		types { }
		default_type text/javascript;
	}
	location ~* \.bin$ {
		types { }
		default_type application/octet-stream;
	}

	location / {
	}
}
```
<!-- /server-config -->

</details>

#### Caddy 2

1. **Wohin:** Kopiere [`docs/server/Caddyfile`](docs/server/Caddyfile) nach `/etc/caddy/Caddyfile` oder
   binde sie mit `import` in deine ein. Nötig ist Caddy 2.7+.
2. **Ersetzen:** die Site-Adresse `example.org` und `root * /var/www/example.org`. HTTPS geht automatisch:
   Caddy holt das Zertifikat und leitet HTTP auf HTTPS weiter.
3. **Halte die Header-Zeilen mit `-` und `?` aus dem großen `header { … }`-Block heraus**, sonst verlieren
   Fehlerantworten ihre Sicherheits-Header (der Kommentar in der Datei erklärt, warum).
4. **Online-Dienste:** Ändere die Zeile `Content-Security-Policy` in `header { … }` und für „Mein Standort“
   die Zeile `Permissions-Policy`.
5. **Prüfen und neu laden:** `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`.

<details>
<summary><code>Caddyfile</code> (vollständig)</summary>

<!-- server-config: docs/server/Caddyfile -->
```caddyfile
# ============================================================================
# JPKCom Desktop — Caddy configuration (Caddyfile) — © Jean Pierre Kolb — MIT License
# ============================================================================
#
# Caddy 2.7+. Replace example.org and the root folder. Caddy fetches the TLS
# certificate itself and redirects http to https (automatic HTTPS) — the secure
# context that the service worker, installation, the vault and "My location" need.
#
# Root or sub-folder: copy the desktop's files into the root folder itself
# (https://example.org/) or into a folder below it (https://example.org/desktop/).
# Nothing else changes — the matchers below find the desktop's paths wherever they
# are. file_server answers /desktop (a directory without the slash) with a redirect
# to /desktop/ by itself, and it lists no directories (no "browse").
#
# Check after a deploy:
#   curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-)'

example.org {
	root * /var/www/example.org

	encode zstd gzip

	# ---------- Security headers -----------------------------------------------

	header {
		# Content-Security-Policy. Opt-in extensions — switch on ONLY what the site offers:
		#
		#   connect-src  add the hosts of the online services set to true in site/config.js → services:
		#                  weather, provider 'open-meteo':  https://api.open-meteo.com
		#                    a place search by name, if you add one: https://geocoding-api.open-meteo.com (the shipped providers never call it)
		#                  weather, provider 'brightsky':   https://api.brightsky.dev
		#                  terminal dig/host (DoH):         https://dns.google   (the host of terminal.doh.url)
		#                  fortune, remote 'jokeapi':       https://v2.jokeapi.dev
		#                  fortune, remote 'uselessfacts':  https://uselessfacts.jsph.pl
		#   frame-src    add the origins of 'web' apps whose url lives on another origin
		#   script-src   add 'wasm-unsafe-eval' only for the optional Pagefind search (WebAssembly)
		#
		# Then replace the line below with your extended copy, e.g. weather + DoH:
		#   Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
		# or with Pagefind and a framed app from another origin:
		#   Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self' https://apps.example.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"

		# Geolocation stays off unless the site offers "My location" for the weather
		# (services.geolocation: true) — then use the second line instead
		Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
		# Permissions-Policy "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

		# SAMEORIGIN, not DENY: windows show same-origin pages in iframes
		X-Frame-Options "SAMEORIGIN"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Cross-Origin-Opener-Policy "same-origin"
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
	}

	# A header block that deletes (-) or defaults (?) a field is deferred until the response
	# is written — and file_server's own error answers (a missing file: 404) never pass
	# through it. Keep these two apart, so the security headers above are set at once and
	# reach 404 answers too; never add a "-" or "?" line to the block above.
	header -Server
	# Default, revalidated on every use (ETag / Last-Modified → 304): HTML, JS, CSS, JSON,
	# the manifest, sw.js and the sealed vault files carry no version in their names.
	# The "?" sets it only where the rule for images below did not.
	header ?Cache-Control "no-cache"

	# ---------- Caching, MIME types, the vault -------------------------------------

	# Images, fonts and media: one day
	@static path_regexp static (?i)\.(png|jpe?g|gif|webp|avif|ico|woff2?|mp3|ogg|oga|m4a|wav|mp4|webm)$
	header @static Cache-Control "public, max-age=86400"

	@manifest path *.webmanifest
	header @manifest Content-Type "application/manifest+json; charset=utf-8"
	@modules path *.mjs
	header @modules Content-Type "text/javascript; charset=utf-8"
	# Caddy sends JSON (feeds, fortunes) without a charset; browsers decode it as UTF-8
	# anyway, but say it, like every other text type
	@json path *.json
	header @json Content-Type "application/json; charset=utf-8"

	# Sealed vault files: not for search engines
	@vault path */site/vault/*
	header @vault X-Robots-Tag "noindex, nofollow, noarchive"

	# ---------- Files ----------------------------------------------------------

	# Dotfiles (.git, .env, …) are never served
	@hidden {
		path */.*
		not path /.well-known/*
	}
	respond @hidden 404

	file_server {
		index index.html
	}

	# Error answers (a missing file): the security headers set above stay on the response;
	# answering here lets the deferred "-Server" run as well. The Content-Type line replaces
	# the type that a matcher above set for the missing path (a missing .json is plain text)
	handle_errors {
		header -Server
		header Content-Type "text/plain; charset=utf-8"
		respond "{err.status_code} {err.status_text}" {err.status_code}
	}
}
```
<!-- /server-config -->

</details>

#### Ferron 3 und Ferron 2

Beide Dateien tun dasselbe. Ferron 3 hat ein eigenes Format; Ferron 2, die stabile Reihe, nutzt KDL.

1. **Wohin:** Ferron 3: [`docs/server/ferron.conf`](docs/server/ferron.conf) → `/etc/ferron/ferron.conf`.
   Ferron 2: [`docs/server/ferron.kdl`](docs/server/ferron.kdl) → `/etc/ferron.kdl`.
2. **Ersetzen:** den Host-Block `example.org` und `root`. Zertifikate (automatisches TLS) und die
   Weiterleitung von HTTP auf HTTPS erledigt Ferron selbst.
3. **Nur Ferron 2:** Ein Block, der eine Direktive setzt, ersetzt alle geerbten Einträge dieser Direktive.
   Der Tresor-Block wiederholt deshalb `use "DESK_HEADERS"`; behalte die Zeile, wenn du den Block änderst.
4. **Online-Dienste:** Ändere die Zeile `header Content-Security-Policy` (Ferron 3) bzw. die Zeile
   `header "Content-Security-Policy"` im Snippet `DESK_HEADERS` (Ferron 2) und die Zeile
   `Permissions-Policy` darunter.
5. **Prüfen und neu starten:** Ferron 3: `ferron validate -c /etc/ferron/ferron.conf`. Danach den Dienst
   neu starten (etwa `systemctl restart ferron`).

<details>
<summary><code>ferron.conf</code> — Ferron 3 (vollständig)</summary>

<!-- server-config: docs/server/ferron.conf -->
```text
# ============================================================================
# JPKCom Desktop — Ferron 3 configuration (ferron.conf) — © Jean Pierre Kolb — MIT License
# ============================================================================
#
# Ferron 3 (https://ferron.sh; validated with 3.0.0-rc.9), usually
# /etc/ferron/ferron.conf:   ferron validate -c /etc/ferron/ferron.conf
# For Ferron 2 (KDL) use ferron.kdl next to this file instead.
#
# Replace example.org and the root folder. Ferron obtains the TLS certificate
# for a host name itself and redirects http to https — the secure context that
# the service worker, installation, the vault and "My location" need.
#
# Root or sub-folder: copy the desktop's files into the root folder itself
# (https://example.org/) or into a folder below it (https://example.org/desktop/).
# Nothing else changes — the matchers below find the desktop's paths wherever
# they are, and /desktop (a directory without the slash) is redirected to
# /desktop/ (trailing_slash_redirect).
#
# Check after a deploy:
#   curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-)'

# Images, fonts and media (cached for a day; everything else is revalidated)
match desk_static {
    request.uri.path ~ r"(?i)\.(png|jpe?g|gif|webp|avif|ico|woff2?|mp3|ogg|oga|m4a|wav|mp4|webm)$"
}

# Sealed vault files (not for search engines)
match desk_vault {
    request.uri.path ~ "/site/vault/"
}

# Dotfiles (.git, .env, …), except /.well-known/
match desk_hidden {
    request.uri.path ~ r"/\."
    request.uri.path !~ r"^/\.well-known/"
}

example.org {
    root /var/www/example.org
    index index.html
    trailing_slash_redirect true
    # No directory listings: the vault's file names must stay secret
    directory_listing false
    compressed true
    etag true

    mime_type .html "text/html; charset=utf-8"
    mime_type .css "text/css; charset=utf-8"
    mime_type .json "application/json; charset=utf-8"
    mime_type .webmanifest "application/manifest+json; charset=utf-8"
    mime_type .mjs "text/javascript; charset=utf-8"
    mime_type .js "text/javascript; charset=utf-8"
    mime_type .bin "application/octet-stream"

    # ---------- Security headers ---------------------------------------------

    # Content-Security-Policy. Opt-in extensions — switch on ONLY what the site offers:
    #
    #   connect-src  add the hosts of the online services set to true in site/config.js → services:
    #                  weather, provider 'open-meteo':  https://api.open-meteo.com
    #                    a place search by name, if you add one: https://geocoding-api.open-meteo.com (the shipped providers never call it)
    #                  weather, provider 'brightsky':   https://api.brightsky.dev
    #                  terminal dig/host (DoH):         https://dns.google   (the host of terminal.doh.url)
    #                  fortune, remote 'jokeapi':       https://v2.jokeapi.dev
    #                  fortune, remote 'uselessfacts':  https://uselessfacts.jsph.pl
    #   frame-src    add the origins of 'web' apps whose url lives on another origin
    #   script-src   add 'wasm-unsafe-eval' only for the optional Pagefind search (WebAssembly)
    #
    # Then replace the line below with your extended copy, e.g. weather + DoH:
    #   header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
    # or with Pagefind and a framed app from another origin:
    #   header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self' https://apps.example.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
    header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"

    # Geolocation stays off unless the site offers "My location" for the weather
    # (services.geolocation: true) — then use the second line instead
    header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
    # header Permissions-Policy "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

    # SAMEORIGIN, not DENY: windows show same-origin pages in iframes
    header X-Frame-Options "SAMEORIGIN"
    header X-Content-Type-Options "nosniff"
    header Referrer-Policy "strict-origin-when-cross-origin"
    header Cross-Origin-Opener-Policy "same-origin"
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"

    # ---------- Caching, the vault, dotfiles -----------------------------------

    # Revalidated on every use (ETag → 304): HTML, JS, CSS, JSON, the manifest, sw.js and
    # the sealed vault files carry no version in their names
    file_cache_control "no-cache"
    if desk_static {
        file_cache_control "public, max-age=86400"
    }

    if desk_vault {
        header X-Robots-Tag "noindex, nofollow, noarchive"
    }

    if desk_hidden {
        status 404
    }
}
```
<!-- /server-config -->

</details>

<details>
<summary><code>ferron.kdl</code> — Ferron 2 (vollständig)</summary>

<!-- server-config: docs/server/ferron.kdl -->
```kdl
// ============================================================================
// JPKCom Desktop — Ferron 2 configuration (ferron.kdl) — © Jean Pierre Kolb — MIT License
// ============================================================================
//
// Ferron 2.x, KDL format (https://ferron.sh/docs/v2; validated with 2.8.1), usually
// /etc/ferron.kdl. Ferron 3 uses another format: see ferron.conf next to this file.
//
// Replace example.org and the root folder. Ferron obtains the TLS certificate for
// a host name itself (auto_tls) and redirects http to https — the secure context
// that the service worker, installation, the vault and "My location" need.
//
// Root or sub-folder: copy the desktop's files into the root folder itself
// (https://example.org/) or into a folder below it (https://example.org/desktop/).
// Nothing else changes — the conditions below match the desktop's paths wherever
// they are, and /desktop (a directory without the slash) is redirected to /desktop/.
//
// Inheritance: a block that sets a directive replaces ALL inherited entries of that
// directive. Every conditional block that adds a header therefore uses the snippet
// with the whole header set again.
//
// Check after a deploy:
//   curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-)'

snippet "DESK_HEADERS" {
  // Content-Security-Policy. Opt-in extensions — switch on ONLY what the site offers:
  //
  //   connect-src  add the hosts of the online services set to true in site/config.js → services:
  //                  weather, provider 'open-meteo':  https://api.open-meteo.com
  //                    a place search by name, if you add one: https://geocoding-api.open-meteo.com (the shipped providers never call it)
  //                  weather, provider 'brightsky':   https://api.brightsky.dev
  //                  terminal dig/host (DoH):         https://dns.google   (the host of terminal.doh.url)
  //                  fortune, remote 'jokeapi':       https://v2.jokeapi.dev
  //                  fortune, remote 'uselessfacts':  https://uselessfacts.jsph.pl
  //   frame-src    add the origins of 'web' apps whose url lives on another origin
  //   script-src   add 'wasm-unsafe-eval' only for the optional Pagefind search (WebAssembly)
  //
  // Then replace the line below with your extended copy, e.g. weather + DoH:
  //   header "Content-Security-Policy" "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
  // or with Pagefind and a framed app from another origin:
  //   header "Content-Security-Policy" "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self' https://apps.example.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
  header "Content-Security-Policy" "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"

  // Geolocation stays off unless the site offers "My location" for the weather
  // (services.geolocation: true) — then use the second line instead
  header "Permissions-Policy" "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  // header "Permissions-Policy" "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"

  // SAMEORIGIN, not DENY: windows show same-origin pages in iframes
  header "X-Frame-Options" "SAMEORIGIN"
  header "X-Content-Type-Options" "nosniff"
  header "Referrer-Policy" "strict-origin-when-cross-origin"
  header "Cross-Origin-Opener-Policy" "same-origin"
  header "Strict-Transport-Security" "max-age=31536000; includeSubDomains"
}

example.org {
  root "/var/www/example.org"
  index "index.html"
  // No directory listings: the vault's file names must stay secret
  directory_listing #false
  no_trailing_redirect #false
  compressed
  etag

  mime_type ".html" "text/html; charset=utf-8"
  mime_type ".css" "text/css; charset=utf-8"
  mime_type ".json" "application/json; charset=utf-8"
  mime_type ".webmanifest" "application/manifest+json; charset=utf-8"
  mime_type ".mjs" "text/javascript; charset=utf-8"
  mime_type ".js" "text/javascript; charset=utf-8"
  mime_type ".bin" "application/octet-stream"

  use "DESK_HEADERS"

  // Revalidated on every use (ETag → 304): HTML, JS, CSS, JSON, the manifest, sw.js and
  // the sealed vault files carry no version in their names
  file_cache_control "no-cache"

  // Images, fonts and media: one day
  condition "DESK_STATIC" {
    is_regex "{path}" "\\.(png|jpe?g|gif|webp|avif|ico|woff2?|mp3|ogg|oga|m4a|wav|mp4|webm)$" case_insensitive=#true
  }
  if "DESK_STATIC" {
    file_cache_control "public, max-age=86400"
  }

  // Sealed vault files: not for search engines
  condition "DESK_VAULT" {
    is_regex "{path}" "/site/vault/"
  }
  if "DESK_VAULT" {
    use "DESK_HEADERS"
    header "X-Robots-Tag" "noindex, nofollow, noarchive"
  }

  // Dotfiles (.git, .env, …) are never served, except /.well-known/
  condition "DESK_HIDDEN" {
    is_regex "{path}" "/\\."
    is_not_regex "{path}" "^/\\.well-known/"
  }
  if "DESK_HIDDEN" {
    status 404
  }
}
```
<!-- /server-config -->

</details>

#### static-web-server 2

1. **Wohin:** Kopiere [`docs/server/static-web-server.toml`](docs/server/static-web-server.toml) nach
   `/etc/static-web-server/config.toml`.
2. **Ersetzen:** `root`, `http2-tls-cert`, `http2-tls-key`, `https-redirect-host` und
   `https-redirect-from-hosts`. **Hinter einem Proxy, der TLS beendet**, setzt du stattdessen `port = 8080`
   und `http2 = false` und entfernst die Zeilen `http2-tls-*` und `https-redirect*`.
3. **Zertifikate:** `ignore-hidden-files = true` verweigert jedes Dotfile, auch `/.well-known/`. Zertifikate
   holst du deshalb per DNS-Challenge oder über den vorgeschalteten TLS-Proxy.
4. **Online-Dienste:** Ändere die Zeile `Content-Security-Policy = …` im ersten `[[advanced.headers]]`-Block
   und für „Mein Standort“ die Zeile `Permissions-Policy = …`.
5. **Starten:** `static-web-server --config-file /etc/static-web-server/config.toml`.

<details>
<summary><code>static-web-server.toml</code> (vollständig)</summary>

<!-- server-config: docs/server/static-web-server.toml -->
```toml
# ============================================================================
# JPKCom Desktop — static-web-server configuration (TOML) — © Jean Pierre Kolb — MIT License
# ============================================================================
#
# static-web-server 2.x (https://static-web-server.net), started with
#   static-web-server --config-file /etc/static-web-server/config.toml
# Replace the root folder; for TLS either give it a certificate (http2 settings
# below) or put it behind a proxy that terminates HTTPS. The service worker,
# installation, the vault and "My location" need a secure context (HTTPS;
# localhost is the only exception).
#
# Root or sub-folder: copy the desktop's files into the root folder itself
# (https://example.org/) or into a folder below it (https://example.org/desktop/).
# Nothing else changes — the header globs below match the desktop's paths
# wherever they are, and /desktop (without the slash) is redirected to /desktop/
# (redirect-trailing-slash).
#
# Header rules: every [[advanced.headers]] entry whose glob matches the request
# path adds its headers; a later matching entry overrides the same header name
# of an earlier one (as for Cache-Control on images below).
#
# Check after a deploy:
#   curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-)'

[general]

host = "::"
port = 443
root = "/var/www/example.org"

#### HTTPS (certificate files) — or port = 8080, http2 = false behind a TLS proxy
http2 = true
http2-tls-cert = "/etc/ssl/example.org/fullchain.pem"
http2-tls-key = "/etc/ssl/example.org/privkey.pem"
https-redirect = true
https-redirect-host = "example.org"
https-redirect-from-port = 80
https-redirect-from-hosts = "example.org"

#### Files: no directory listings (the vault's file names must stay secret), no dotfiles.
#### ignore-hidden-files has no exception: /.well-known/ is refused too (404) — get certificates with a
#### DNS challenge or through the TLS proxy, or set it to false if the root holds no other dotfiles.
directory-listing = false
ignore-hidden-files = true
redirect-trailing-slash = true
index-files = "index.html"
compression = true

#### The headers below replace the built-in sets (their CSP and caching do not fit)
security-headers = false
cache-control-headers = false

[advanced]

#### Security headers and the default caching — every path
[[advanced.headers]]
source = "**"
[advanced.headers.headers]
# Content-Security-Policy. Opt-in extensions — switch on ONLY what the site offers:
#
#   connect-src  add the hosts of the online services set to true in site/config.js → services:
#                  weather, provider 'open-meteo':  https://api.open-meteo.com
#                    a place search by name, if you add one: https://geocoding-api.open-meteo.com (the shipped providers never call it)
#                  weather, provider 'brightsky':   https://api.brightsky.dev
#                  terminal dig/host (DoH):         https://dns.google   (the host of terminal.doh.url)
#                  fortune, remote 'jokeapi':       https://v2.jokeapi.dev
#                  fortune, remote 'uselessfacts':  https://uselessfacts.jsph.pl
#   frame-src    add the origins of 'web' apps whose url lives on another origin
#   script-src   add 'wasm-unsafe-eval' only for the optional Pagefind search (WebAssembly)
#
# Then replace the line below with your extended copy, e.g. weather + DoH:
#   Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: https://api.open-meteo.com https://dns.google; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
# or with Pagefind and a framed app from another origin:
#   Content-Security-Policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self' https://apps.example.org; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests"
# Geolocation stays off unless the site offers "My location" for the weather
# (services.geolocation: true) — then use the second line instead
Permissions-Policy = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
# Permissions-Policy = "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
# SAMEORIGIN, not DENY: windows show same-origin pages in iframes
X-Frame-Options = "SAMEORIGIN"
X-Content-Type-Options = "nosniff"
Referrer-Policy = "strict-origin-when-cross-origin"
Cross-Origin-Opener-Policy = "same-origin"
Strict-Transport-Security = "max-age=31536000; includeSubDomains"
# Revalidated on every use (ETag / Last-Modified → 304): HTML, JS, CSS, JSON, the manifest,
# sw.js and the sealed vault files carry no version in their names
Cache-Control = "no-cache"

#### Images, fonts and media: one day
[[advanced.headers]]
source = "**/*.{png,jpg,jpeg,gif,webp,avif,ico,woff,woff2,mp3,ogg,oga,m4a,wav,mp4,webm}"
headers = { Cache-Control = "public, max-age=86400" }

#### Text types with their charset (the built-in table sends text/javascript, text/css, application/json without one)
[[advanced.headers]]
source = "**/*.{js,mjs}"
headers = { Content-Type = "text/javascript; charset=utf-8" }

[[advanced.headers]]
source = "**/*.css"
headers = { Content-Type = "text/css; charset=utf-8" }

[[advanced.headers]]
source = "**/*.json"
headers = { Content-Type = "application/json; charset=utf-8" }

#### The web app manifest (older MIME tables do not know .webmanifest)
[[advanced.headers]]
source = "**/*.webmanifest"
headers = { Content-Type = "application/manifest+json; charset=utf-8" }

#### Sealed vault files: not for search engines
[[advanced.headers]]
source = "**/site/vault/**"
headers = { X-Robots-Tag = "noindex, nofollow, noarchive" }
```
<!-- /server-config -->

</details>

#### Andere Server

Jeder Server eignet sich, der (1) statische Dateien mit den richtigen MIME-Typen ausliefert (`.js` als
`text/javascript`, `.webmanifest` als `application/manifest+json`), (2) die Header oben bei jeder Antwort
sendet, auch bei Fehlern, (3) einen Ordner ohne abschließenden Schrägstrich weiterleitet, (4) keine
Verzeichnisse auflistet, (5) `Cache-Control` wie beschrieben setzt und (6) Dotfiles verweigert.

### Nach dem Deployment prüfen

```sh
# Sicherheits-Header und Caching der Seite
curl -sI https://example.org/desktop/ | grep -iE '^(content-security|permissions|cache-control|x-|strict)'

# Die Weiterleitung auf den Schrägstrich: 301 oder 308 mit location: /desktop/
curl -sI https://example.org/desktop | grep -iE '^(HTTP|location)'

# MIME-Typen eines Moduls (text/javascript) und des Manifests (application/manifest+json)
curl -sI https://example.org/desktop/src/boot/main.js | grep -i '^content-type'
curl -sI https://example.org/desktop/manifest.webmanifest | grep -i '^content-type'

# Dotfiles und der Tresor-Ordner werden verweigert: 404, und 403 oder 404
curl -s -o /dev/null -w '%{http_code}\n' https://example.org/desktop/.git/config
curl -s -o /dev/null -w '%{http_code}\n' https://example.org/desktop/site/vault/
```

Liegt der Desktop in der Wurzel, lässt du `/desktop` weg. Im Browser öffnest du die Entwicklerwerkzeuge
und lädst neu. Eine blockierte Anfrage erscheint in der Konsole als CSP-Verstoß mit der betroffenen
Direktive. Weitere Prüfungen und eine Tabelle zur Fehlersuche stehen in
[docs/deploy.md §12–13](docs/deploy.md#12-checking-a-deployment).

## Private Lesezeichen (Tresor)

Das optionale Modul `vault` hält Lesezeichen, die nur du siehst. Sie sind in eine Datei auf dem Server
verschlüsselt, und `login` im Terminal entschlüsselt sie im Browser. PBKDF2-HMAC-SHA-256 macht aus
Benutzername und Passwort einen AES-256-GCM-Schlüssel und den Dateinamen. Falsche Zugangsdaten fragen
eine Datei an, die es nicht gibt.

```sh
# 1. Ein eigenes Salz, einmal je Deployment
node tools/seal-vault.mjs --new-salt
#    → site/config.js: vault: { salt: '<das Salz>', iterations: 600000 }, dazu 'vault' in modules

# 2. Die Lesezeichen als JSON AUSSERHALB des Projekts und außerhalb jedes Web-Ordners schreiben, etwa ~/private/bookmarks.json
#    { "groups": [{ "id": "work", "name": { "en": "Work", "de": "Arbeit" }, "icon": "ti-briefcase" }],
#      "items":  [{ "slug": "wiki", "group": "work", "name": "Team-Wiki", "url": "https://wiki.example.org/" }] }

# 3. Versiegeln: fragt Benutzername und Passwort, prüft den Rückweg, schreibt site/vault/<32 hex>.bin
npm run seal -- --in ~/private/bookmarks.json

# Die versiegelten Dateien zeigen und ob sie zu Salz und Iterationen passen
node tools/seal-vault.mjs --list
```

Lade die `.bin`-Datei nach `site/vault/` hoch und tippe `login` im Terminal des Desktops. `logout` blendet
die Lesezeichen wieder aus. Versiegle einmal je Benutzer. Liegen schon andere `.bin`-Dateien im Ordner,
fragt das Werkzeug, ob sie bleiben sollen; `--keep` behält und `--prune` entfernt sie ohne Nachfrage.

Sicherheitshinweise:
- **HTTPS ist Pflicht** (Web Crypto läuft nur in einem sicheren Kontext).
- **Keine Verzeichnisliste.** Die Dateinamen sind aus den Zugangsdaten abgeleitet. Die mitgelieferten
  Konfigurationen senden für diese Dateien außerdem `Cache-Control: no-cache` und `X-Robots-Tag: noindex`,
  und der Service Worker speichert sie nie zwischen.
- **Nimm ein eigenes Salz und ein langes Passwort.** Jeder kann eine versiegelte Datei laden, deren Namen
  er kennt, und offline Passwörter raten. Der Schutz ist die Stärke des Passworts und der Aufwand von
  PBKDF2. Gedacht ist das für private Links, nicht für Geheimnisse.
- **Committe nie `.bin`-Dateien** und leg den Klartext nie dorthin, wo ein Webserver ihn veröffentlicht.
  Das Werkzeug verweigert eine Eingabedatei unter `site/` oder im Web-Ordner.
- „Angemeldet bleiben“ speichert nur einen nicht exportierbaren Schlüssel in IndexedDB, nie das Passwort
  oder den Klartext. Jede Seite auf demselben Ursprung könnte diesen Schlüssel nutzen
  ([gleicher Ursprung = volles Vertrauen](#deployment)).

Schritt für Schritt: [site/vault/README.md](site/vault/README.md).

## Entwicklung

| Skript | Was es tut |
|---|---|
| `npm run serve` | lokaler statischer Server mit den Produktions-Headern (`--port`, `--host`, `--base`, `--root`, `--connect`, `--frame`, `--wasm`, `--geolocation`) |
| `npm test` | Unit-Tests (`node --test "tests/*.test.mjs"`) |
| `npm run validate` / `validate:strict` | prüft `site/apps.js` gegen die Konfiguration (strict scheitert auch an Warnungen) |
| `npm run i18n:check [-- <sprache>]` | vergleicht jede Sprache mit Englisch: fehlende Schlüssel, Platzhalter, Pluralformen |
| `npm run icons` / `icons:check` | baut oder prüft `src/icons/tabler.js` aus den Tabler-Icons, die die Quellen benutzen |
| `npm run preload` / `preload:check` | baut oder prüft `src/boot/preload.js`, die Vorlade-Hinweise, mit denen der Start alle seine Dateien auf einmal anfordert — nach jedem neuen oder geänderten Modul, jeder App und jedem Site-Modul ausführen |
| `npm run browsers` | lädt das Headless-Chromium für die Browser-Checks und `icons:pwa` |
| `npm run icons:pwa` | rendert die PNG-App-Icons aus `assets/icons/favicon.svg` und `maskable.svg` (Chromium ohne Fenster) |
| `npm run seal` | versiegelt private Lesezeichen für den Tresor |
| `npm run check:browser` | Browser-Check ohne Fenster unter den Produktions-Headern |

**Browser-Check.** `tools/browser-check.mjs` startet `serve.mjs`, öffnet den Desktop in Chromium ohne
Fenster (headless) und schlägt fehl bei Konsolenfehlern, Seitenfehlern, CSP-Verstößen und
fehlgeschlagenen Anfragen. Er kann ein Szenario-Modul abfahren, die Sprache wechseln, eine
Smartphone-Ansicht, einen Unterordner oder eine andere Website-Konfiguration nutzen und einen Screenshot
machen. Den Browser installierst du einmal:

```sh
npm run browsers
npm run check:browser -- --lang de-DE --mobile --screenshot /tmp/desk.png
```

Auf Rechnern mit wenig Arbeitsspeicher laufen Browser-Checks besser nacheinander:
`flock /tmp/jpkcom-desktop-browser.lock node tools/browser-check.mjs …` (alle Optionen stehen im Kopf der
Datei).

**Regeln für den Code** (durch Review und teilweise durch Tests geprüft):
- Kein `innerHTML`/`outerHTML`/`insertAdjacentHTML`, kein `eval`, keine Inline-Skripte, keine
  `style`-Attribute. DOM baust du mit `h()` und `textContent`, Styles setzt du über das CSSOM.
- Jeder Text läuft über `t()` mit benannten Platzhaltern oder über ein Sprachobjekt. Setz nie Sätze
  zusammen und verzweige nie nach einem Sprachcode.
- CSS liegt in Cascade-Ebenen (`@layer modules { … }`), nutzt Tokens statt Farbwerten und logische
  Properties, und `body.compact` für Smartphones.
- Nur Tabler-Icons (`npm run icons`, nachdem du ein neues benutzt hast). Ids bestehen aus `[a-z0-9-]`.
- Jede Quelldatei beginnt mit der Kopfzeile `JPKCom Desktop — <Zweck> — © Jean Pierre Kolb — MIT License`.
- Alles validieren, was aus dem Speicher, dem Manifest oder dem Netz kommt. Schlechte Eingaben werden
  gemeldet und übersprungen, nie fatal.

Mitarbeiten: [CONTRIBUTING.md](CONTRIBUTING.md). Änderungen je Version: [CHANGELOG.md](CHANGELOG.md).

## Datenschutz und Sicherheit

- **Kein Tracking, keine Analyse, keine Cookies, kein Code von Dritten.**
- **Die Daten der Besucherinnen und Besucher bleiben in ihrem Browser**: Einstellungen, Notizen,
  Aufgaben, der Entwurf des Editors und der Terminal-Verlauf liegen in `localStorage` und IndexedDB auf
  ihrem Gerät. Eine Sicherung ist eine Datei, die sie selbst herunterladen. Dateien, die sie öffnen oder
  hineinziehen, werden lokal gelesen und nie hochgeladen.
- **Online-Dienste sind standardmäßig aus.** Eine Website muss jeden einzeln einschalten, und jede Person
  muss vor der ersten Anfrage zustimmen. Die Zustimmung lässt sich jederzeit in Einstellungen →
  Online-Dienste zurücknehmen. Anfragen gehen ohne Cookies und ohne Referrer hinaus. „Mein Standort“
  speichert nur eine auf etwa 1 km gerundete Position.
- **Strenge CSP**, standardmäßig ohne Ausnahmen. Inhalte im Reader werden bereinigt; Dateien vom Gerät
  öffnen sich nie als Dokument.
- Die Beispiel-Website bringt **Vorlagen** für Impressum und Datenschutzerklärung mit
  (`site/content/<sprache>/imprint.html`, `privacy.html`). Füll sie aus, bevor du veröffentlichst.

Eine Sicherheitslücke meldest du wie in [SECURITY.md](SECURITY.md) beschrieben.

## Credits, Lizenz und Autor

- **Lizenz:** [MIT](LICENSE) © 2026 Jean Pierre Kolb — ausgenommen die Brand-Assets.
- **Icons:** eine erzeugte Teilmenge von [Tabler Icons](https://tabler.io/icons) (MIT, © Paweł Kuna).
- **Brand-Assets (nicht MIT):** Das JPK-Monogramm und das JPKCom-Logo sind das persönliche Logo des
  Autors, in Gebrauch seit 1996 — © 1996–2026 Jean Pierre Kolb, alle Rechte vorbehalten; keine
  eingetragene Marke. Du darfst sie unverändert als Teil von JPKCom Desktop oder eines Forks davon
  kopieren, weitergeben und als Standard-Brand zeigen (auch in deiner Installation oder in einem Fork,
  der noch kein eigenes Erscheinungsbild hat) und im Credit; die Darstellung durch den Desktop selbst
  (Größe, Färbung durch Thema oder Akzentfarbe, PNG-Renderings, Hintergrundmotive) gilt als unverändert.
  Du darfst sie nicht als dein eigenes Logo oder deine Marke verwenden, nicht für andere Projekte oder
  Produkte und nicht verändert. Für ein eigenes Erscheinungsbild ersetzt du sie über `brand.glyph`,
  `brand.logo`, `brand.asciiLogo`, die Icon-Dateien und die Motive `author-monogram` und
  `author-emblem`. Bitte lass die Credit-Zeile stehen. Details: [CREDITS.md](CREDITS.md#brand-assets-not-mit).
- Hinweise zu Dritten: [CREDITS.md](CREDITS.md).

**Autor:** Jean Pierre Kolb — JPKCom ·
Website <https://www.jpkc.com/> ·
GitHub [@JPKCom](https://github.com/JPKCom) ·
Mastodon [@JPKCom@mastodon.social](https://mastodon.social/@JPKCom)
