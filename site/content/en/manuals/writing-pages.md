# Writing pages

Plain HTML files, one folder per language. The Reader shows them in a window — no iframe, no scripts.

## The markup

The content is the first `main article`, `article` or `main` of the file, the title its `h1`, the lead a paragraph with the class `lead` (the rules in `config.reader.rules`).

```
<main><article>
  <h1>Page title</h1>
  <p class="lead">One or two sentences about the page.</p>
  <h2 id="part">A section</h2>
</article></main>
```

## What to keep in mind

- **Title**: the window shows the part of `<title>` before " | ", else the `h1`.
- **Languages**: `<html lang>` sets the language; `<link rel="alternate" hreflang>` names the page to show after a language switch.
- **Links**: relative links open in the same window, other sites in a new tab.
- **Removed**: scripts, styles, forms, iframes and event handlers.

## This manual

This text is the item's `man` in `site/apps.js` — a Markdown file per language that the terminal prints with `man writing-pages`. The full page opens from the Catalog or with `open writing-pages`.
