# Locales

JPKCom Desktop ships German (`de`) and English (`en`). Any further language is a copy of a folder —
no code assumes a fixed number of languages.

```
locales/
  en/                 reference locale — every key exists here
    _meta.js          name, Intl tag, direction, "yes" pattern
    core.js           namespace 'core'
    wm.js, shell.js, settings.js, …   one file per namespace (added by the packages that use them)
  de/                 same files, translated
```

Each file is an ES module with a plain object as default export:

```js
/* locales/fr/core.js */
export default {
	close: 'Fermer',
	newTab: '{name} (s’ouvre dans un nouvel onglet)',
	items: { one: '{n} élément', other: '{n} éléments' }
};
```

- **Keys** are flat strings. Code calls them namespace-qualified: `t('core.close')`, `t('notes.title')`
  (an unqualified key belongs to `core`).
- **Placeholders** are named: `{name}`, `{n}`. Keep every placeholder of the English text; numbers
  passed in are formatted for the language automatically.
- **Plurals** are objects with the forms your language needs according to
  [Intl.PluralRules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html):
  `zero`, `one`, `two`, `few`, `many`, `other` (`other` is required). Exact forms such as `'=0'`
  win over the categories: `{ '=0': 'No notes', one: 'One note', other: '{n} notes' }`.
- **Missing keys** are not an error at runtime: a key falls back to the base language (`pt-BR` → `pt`),
  then to `config.defaultLang`, then to English. With `debug: true` in `site/config.js` the console
  lists every key that fell through.

## Adding a language

1. Copy the reference folder: `cp -r locales/en locales/fr`.
2. Edit `locales/fr/_meta.js`:
   ```js
   export default { name: 'Français', intl: 'fr-FR', dir: 'ltr', yes: '^(o|oui|y|yes)$' };
   ```
   `name` is the language's own name (language menu), `intl` the BCP 47 tag for dates, numbers,
   lists and plurals, `dir` `'ltr'` or `'rtl'`, `yes` a case-insensitive pattern for "yes" answers
   in terminal prompts.
3. Translate the values in every namespace file. Keep the keys and the `{placeholders}`.
4. Add the code to `languages` in `site/config.js`: `languages: ['de', 'en', 'fr']`. With three or
   more languages the menu bar shows a language menu instead of a toggle.
5. Check it: `npm run i18n:check -- fr` (or `node tools/i18n-check.mjs fr`) reports missing keys,
   placeholder mismatches and plural/string mix-ups against English.
   Site modules that keep their texts in their own folder (`site/modules/*/locales/`, e.g. Hello)
   need their `fr/<ns>.js` there too — the check reports each one that lacks it.
6. Optional content in the new language:
   - `site/content/fr/…` pages and `{ fr: 'site/content/fr/…' }` entries in `site/apps.js`
   - `site/data/fortunes/fr.json` for the Fortune app — and add `'fr'` to `fortune.langs` in
     `site/config.js` (only listed languages are fetched; without a file the app uses the next
     language of the fallback chain, without a failed request)
   - `site/data/feed.fr.json` and `notify.feeds.fr` in `site/config.js`
   - `fr` values in the `{ en, de }` text maps of `site/config.js` and `site/apps.js`
     (anything left out falls back as described above)
   - a `<p lang="fr">…</p>` line in the `<noscript>` block at the end of `index.html` (the message
     shown without JavaScript; it is static, so it is not translated at runtime). Delete the lines
     for languages your site does not offer.

Right-to-left languages (`dir: 'rtl'`) set `<html dir="rtl">`; the stylesheets use logical
properties where layout depends on the direction.

## Keys that shape more than words

A few values are formats or settings rather than sentences — translate them by what your language
does, not word for word:

| Key | Meaning |
|---|---|
| `_meta.js` `yes` | pattern for "yes" answers in the terminal (`[y/N]` questions) |
| `core.keyCtrl`, `keyAlt`, `keyShift`, … `keyJoin` | key names in shortcut hints (`Strg+K` in German) and the joiner between them |
| `shell.clockDate` | order of the clock's date parts: `{weekday} {day} {month}` (German `{weekday} {day}. {month}`) |
| `shell.langSwitchTo` | "Switch to {name}" — read from the **target** language's own file by the two-language toggle |
| `weather.hourFormat` | `'hour'` (14 Uhr) or `'hour-minute'` (14:00) for the forecast hours |
| `settings.accent.<id>` | names of accent colours; a site that adds an accent in `config.theme.accents` names it here |
| `wallpaper.motif.<name>` | names of the generated wallpapers |
| `holidays.<key>`, `holidays.note-<note>`, `holidays.region-<id>` | public holiday names, notes and region names; a new holiday region adds its keys in every language |

Site texts (names in `site/apps.js`, `site/config.js`) are maps such as `{ en: 'Tools', de: 'Werkzeuge' }`;
`npm run validate` reports every map that lacks one of the configured languages.
