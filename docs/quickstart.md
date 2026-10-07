# Your own site in 10 minutes

> From the template to your own desktop on the web: copy, rename, fill in, check, publish.
> © Jean Pierre Kolb — MIT License.

**English** | [Deutsch](quickstart.de.md)

JPKCom Desktop is a set of static files with no build step. Everything you change for your own site is
in `site/`, plus a few static lines in `index.html`, `manifest.webmanifest` and `assets/icons/` for your
own look. You need Git and Node.js 22 or newer for the tools. The desktop itself needs neither.

Live demo of the unchanged example site: <https://jpkcom.github.io/jpkcom-desktop/>

1. [Get a copy](#1-get-a-copy)
2. [Name, author and your own logo](#2-name-author-and-your-own-logo)
3. [Your content](#3-your-content)
4. [Check it locally](#4-check-it-locally)
5. [Publish](#5-publish)

---

## 1. Get a copy

**Use this template** (recommended): open <https://github.com/JPKCom/jpkcom-desktop>, click
**Use this template → Create a new repository**, choose a name and clone the new repository. Replace
`<user>` and `<repo>` with your GitHub user name and the repository name:

```sh
git clone https://github.com/<user>/<repo>.git
cd <repo>
```

**Or clone** the project directly:

```sh
git clone https://github.com/JPKCom/jpkcom-desktop.git my-desktop
cd my-desktop
```

**Or download** it without Git:

```sh
curl -fsSL -o jpkcom-desktop.zip https://github.com/JPKCom/jpkcom-desktop/archive/refs/heads/main.zip
unzip jpkcom-desktop.zip
cd jpkcom-desktop-main
```

All commands below run in this folder.

## 2. Name, author and your own logo

Name and author are set in `site/config.js`, where every key has a comment. Replace the `brand` object
with your own:

```js
	brand: {
		name: 'My Desktop',            // document title, About, terminal
		shortName: 'My Desktop',       // home-screen title, keep equal to short_name in manifest.webmanifest
		menuLabel: 'My Site',          // accessible name of the brand menu
		glyph: 'ti-device-desktop',    // a Tabler icon instead of the JPK monogram
		logo: null,                    // no detailed logo: About shows the glyph
		asciiLogo: ['My Site'],        // terminal art (neofetch), one string per line
		host: null,
		themeColor: '#1c2935'
	},
```

- **Your name** goes into `about.copyright`: `copyright: { holder: 'Jane Doe', since: 2026 }` (About this
  desktop).
- **`author` and `credit`** are the credit line "JPKCom Desktop by Jean Pierre Kolb" (About, boot screen,
  terminal). Leave `author.name`, `author.brand` and `author.url` as they are, and please keep
  `credit: true`. `author.links` become apps in the Help menu and the Dock. You can keep them, replace
  them with your own profiles or set `links: []`. If you change them, `npm run validate` lists the
  example bookmarks that still point to them (`author-github`, `author-mastodon`).

**Brand assets.** The JPK monogram and the JPKCom logo are not MIT
([CREDITS.md](../CREDITS.md#brand-assets-not-mit)). You may show them unchanged as the default brand, but
you may not use them as your own logo. For your own identity, replace them everywhere:

1. `brand.glyph`, `brand.logo` and `brand.asciiLogo` (above).
2. `wallpaper.motifs` in `site/config.js`: remove `'author-monogram'` and `'author-emblem'`:

   ```js
   		motifs: ['author-blueprint', 'waves', 'dunes', 'aurora', 'orbit', 'horizon', 'graphite'],
   ```

3. The app icons in `assets/icons/`: your own `favicon.svg` and `maskable.svg`, both with
   `viewBox="0 0 512 512"`. `maskable.svg` fills the whole square without rounded corners (a
   `<rect width="512" height="512" fill="url(#g)"/>` as its background, as `npm test` checks) and keeps the
   picture inside the central 80 %. A simple placeholder to start from:

   ```sh
   cat > assets/icons/favicon.svg <<'EOF'
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6e0"/><stop offset="1" stop-color="#0f6b8f"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><circle cx="256" cy="256" r="120" fill="#fff"/></svg>
   EOF
   cat > assets/icons/maskable.svg <<'EOF'
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6e0"/><stop offset="1" stop-color="#0f6b8f"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="256" r="96" fill="#fff"/></svg>
   EOF
   ```

   Then render the PNG icons (`icon-*.png`, `maskable-*.png`, `apple-touch-icon.png`) in a headless browser:

   ```sh
   npm ci                                                # once: the development tools
   npx playwright-core install chromium-headless-shell   # once: the browser that renders the icons
   npm run icons:pwa
   ```

4. The static lines in `manifest.webmanifest` (`name`, `short_name`, `description`, `theme_color`,
   `background_color`) and in `index.html` (`<title>`, `<h1 id="desk-title">`, description, theme-color,
   apple-mobile-web-app-title, `<noscript>`). [deploy.md §11](deploy.md#11-offline-use-and-installation-pwa)
   lists every line. Please keep the `author` and `generator` meta tags.

Colours, corners, glass and shadows: `site/theme.css` (see [theming.md](theming.md)).

## 3. Your content

The shipped `site/` is an example site: About, Docs, Changelog, Imprint, Privacy, Bookmarks and a
Showcase. Replace it bit by bit.

- **Apps, collections, menus: `site/apps.js`.** The comment at the top of the file explains every field.
  A page of your own is a `page` app. Add it to the `apps` list (the file defines the `page()` helper
  at the top, which builds the path for each language):

  ```js
  		{
  			id: 'services', kind: 'page', icon: 'ti-file-text', tint: 'blue', desktop: true, dock: true,
  			name: { en: 'Services', de: 'Leistungen' },
  			url: page('services.html', 'leistungen.html')
  		},
  ```

  Other kinds: `web` (a page in an iframe window), `link` (an external page in a new tab), collections
  (a Catalog window with groups, for example bookmarks) and `menus`. Details are in the README section
  [`site/apps.js`](../README.md#siteappsjs-apps-collections-menus-files). An icon the desktop does not
  use yet (any Tabler `'ti-…'` name) needs `npm run icons` afterwards (after `npm ci`). `npm run validate`
  warns about it.
- **Pages: `site/content/<lang>/`**, one plain HTML file per language. The Reader shows the first
  `main article`, its `h1` as the title and the `.lead` paragraph below it. No scripts, styles or
  `style` attributes:

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
  cp site/content/en/services.html site/content/de/leistungen.html   # then translate it (see below)
  ```

  In the German copy, translate the text, set `<html lang="de">` and point the alternate link back to
  the English page: `<link rel="alternate" hreflang="en" href="../en/services.html">`. The Reader
  follows these links when someone switches the language.

- **Imprint and privacy** (`site/content/<lang>/imprint.html`, `privacy.html`) are templates. Fill them
  in before you publish, or remove them from `site.legal` in `site/config.js` and from `site/apps.js`.
- **Notifications**: the example feed (`site/data/feed.<lang>.json`) is the project's changelog. Replace
  it, or remove `'notify'` from `modules` in `site/config.js`. **Fortunes**: `site/data/fortunes/<lang>.json`.
- **Wallpapers**: put pictures in `site/wallpapers/` and list them in `wallpaper.images`. Set the default
  with `wallpaper.default`. See [site/wallpapers/README.md](../site/wallpapers/README.md).
- **An app of your own**: copy `site/modules/hello/` (the example app "Hello") to `site/modules/<id>/`,
  rename it as the comment at the top of its `index.js` explains, and list it in `apps` in
  `site/config.js`. Its texts live in its own `locales/<lang>/` folder; `npm run i18n:check` checks them.
  Don't want the example? Remove `{ id: 'hello', … }` from `apps` and delete the folder.

## 4. Check it locally

```sh
npm run serve
```

Open <http://127.0.0.1:8080/>. There is no build step, so edit a file and reload the page. `npm run serve`
sends the production security headers and needs no packages. On another port:
`npm run serve -- --port 3000`. In a sub-folder, as on GitHub Pages:
`npm run serve -- --base /my-desktop/` (<http://127.0.0.1:8080/my-desktop/>).

Then run the checks:

```sh
npm run validate      # site/apps.js and the app references in site/config.js
npm ci                # once: the development tools (Tabler icon sources, browser driver)
npm run icons:check   # the icon subset is up to date (otherwise: npm run icons)
npm test              # the project's unit tests
```

`npm run validate` is the check for your content. `npm test` mainly tests the desktop itself, but some of
its tests check the shipped example site and fail as soon as you replace it with your own. Adapt them to
your site or delete them from your copy:

- The block "The example site" at the end of `tests/p11-site.test.mjs`:
  - "manifest: no content or URLs of the private original": at least five apps with a `kind` (`>= 5`).
  - "fortunes: …": at least 38 sayings per language (`d.items.length >= 38`), and every saying's link
    points to an existing page (the example sayings link to the pages in `site/content/<lang>/docs/`).
  - "feeds: …": every entry in `site/data/feed.<lang>.json` points to an existing page.
  - "content pages: …": at least 16 pages (`pages.length >= 16`), titles ending in "| JPKCom Desktop"
    (the line `assert.match(html, /<title>[^<]+ \| JPKCom Desktop<\/title>/, rel);`), imprint and privacy
    still marked as templates (the `template-note` check below it).
- "validator CLI: the example site has no errors and no warnings" in the same file runs the validator with
  `--strict`: every warning of `npm run validate` fails it. Fix the warnings rather than the test.
- "manifest: … brand defaults" in `tests/p12-deploy.test.mjs`: `name`, `short_name` and `theme_color` in
  `manifest.webmanifest` equal the defaults in `src/core/config.js`. Change the three
  `assert.equal(manifest.…, DEFAULTS.brand.…)` lines to compare with your own values.

Until then, `npm test` fails, and so does the CI workflow of your copy (`.github/workflows/ci.yml`),
which runs the same checks on every push to `main`. Added a language? Also run `npm run i18n:check`.

## 5. Publish

### On GitHub Pages

Commit and push your changes to your own repository. Both workflows (CI and Pages) react to pushes
to the branch `main` only. From a template copy:

```sh
git add -A
git commit -m "Make the desktop my own"
git push
```

After a direct clone, create an empty repository on GitHub first (no README, no license) and point
`origin` to it:

```sh
git remote set-url origin https://github.com/<user>/<repo>.git
git add -A
git commit -m "Make the desktop my own"
git push -u origin main
```

After a download (no Git repository yet), likewise with an empty repository on GitHub:

```sh
git init -b main
git add -A
git commit -m "Make the desktop my own"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Once in your repository on GitHub:

1. **Settings → Pages → Build and deployment → Source:** "GitHub Actions".
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:** name `PAGES`,
   value `true`. Without this variable the Pages workflow is skipped in copies of the template.
3. **Actions → Pages → Run workflow**, or push to `main` again.

The desktop then runs at `https://<user>.github.io/<repo>/`. GitHub Pages cannot send the
Content-Security-Policy header, so the workflow (`.github/workflows/pages.yml`) adds the base policy to the
published `index.html` as a `<meta>` tag. That tag cannot set `frame-ancestors`, and Pages sends no
`Permissions-Policy` or other security headers. If you switch on online services, add their hosts to the
policy in the workflow file too. All Pages sites of one account share the origin
`https://<user>.github.io`, so each can read the others' stored data: host only code you trust there
([deploy.md §3](deploy.md#3-at-the-web-root-or-in-a-sub-folder)). Give each desktop its own `namespace`
in `site/config.js` so that their settings and caches do not collide. Details: [deploy.md → GitHub Pages](deploy.md#github-pages).

### On your own server

Upload `index.html`, `manifest.webmanifest`, `sw.js`, `assets/`, `locales/`, `site/`, `src/`, `LICENSE`
and `CREDITS.md`, at the web root or in a sub-folder ([deploy.md §2](deploy.md#2-what-to-upload)). Copy
the configuration for your server (Apache, nginx, Caddy, Ferron, static-web-server): see the README
section [Server setup](../README.md#server-setup) and the files in [docs/server/](server/). Serve it
over HTTPS. [docs/deploy.md](deploy.md) explains the headers, caching and how to check a deployment.

---

Next: the README ([configuration](../README.md#configuration-and-content),
[look and feel](../README.md#look-and-feel)), the "Docs" app in the desktop, and
[docs/ARCHITECTURE.md](ARCHITECTURE.md) when you want to write your own modules.
