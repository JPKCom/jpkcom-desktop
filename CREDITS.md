# Credits and third-party notices

**JPKCom Desktop** — © 2026 Jean Pierre Kolb — <https://www.jpkc.com/> — MIT License (see [LICENSE](LICENSE)),
except the brand assets described below.

## Brand assets (not MIT)

The JPK monogram and the JPKCom logo are the personal logo of the author, Jean Pierre Kolb, in use
since 1996. They are not a registered trademark. They are **not** covered by the MIT License:

**© 1996–2026 Jean Pierre Kolb — all rights reserved.**

"Brand assets" means the JPK monogram and the JPKCom logo (including the "JPKCom" gradient lettering)
in every form, in this repository:

- the artwork of the glyph `jpk` (its path data) and of the logo `logos.jpkcom` (the `JPKCOM_LOGO`
  shapes, paths and gradients) in `src/icons/custom.js`;
- `assets/icons/favicon.svg` and `assets/icons/maskable.svg`, and the PNG app icons rendered from them
  in `assets/icons/` (`icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`,
  `apple-touch-icon.png` — all of them show the JPK monogram);
- the JPK monogram in block letters (`JPK_LOGO`, the default of `brand.asciiLogo`) in
  `src/apps/terminal/commands/sys.js`;
- the pictures of the wallpaper motifs `author-monogram` and `author-emblem` (`src/wallpapers/author.js`),
  which draw the glyph and the logo above;
- the depictions of the monogram and the logo in the screenshots in `docs/screenshots/`.

**Permitted without asking:** copying and distributing them unchanged as part of JPKCom Desktop or
of a fork of it, and showing them as its default brand — including in deployments of it and in forks
that have not rebranded yet — and in the author credit and the credit line. How the desktop itself
renders them (scaling, colouring by theme or accent colour, the PNG renders, the wallpaper motifs)
counts as unchanged.

**Not permitted without the author's permission:** using them as your own logo or brand, using them
for other projects or products, or using them in altered form.

**Your own identity.** A fork or a deployment that wants its own identity replaces them: `brand.glyph`,
`brand.logo` and `brand.asciiLogo` in `site/config.js`, its own `assets/icons/favicon.svg` and
`maskable.svg` (then `npm run icons:pwa` renders the PNG icons), and `wallpaper.motifs` without
`author-monogram` and `author-emblem` (or with its own motifs). Please keep the credit line
(`credit: true`) and the `author`/`generator` meta tags.

**What stays MIT.** The exception covers the artwork only, not the code. MIT applies to everything
else, including the code that draws things: the symbol and logo builders in `src/icons/custom.js`
(`build()`, `logos`, the symbol format), the window control glyphs `wc-*` and the tile glyphs
`tile-*`, the motif code in `src/wallpapers/` with `author-blueprint` (construction lines, no monogram
or logo) and the neutral motifs `waves`, `dunes`, `aurora`, `orbit`, `horizon` and `graphite`, and
`tools/build-pwa-icons.mjs`.

## Tabler Icons

Site icon sets (`site/icon-sets/`) are the site operator's own material under their own licence; the
project ships none.

The icons in `src/icons/tabler.js` are a generated subset of
[Tabler Icons](https://tabler.io/icons) (`@tabler/icons`, outline and filled), used under the MIT License:

```
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Data and service providers

Optional online services (weather, remote fortunes, DNS lookups) are switched off by default and
only contact their provider after the user agreed. Their names appear in the modules that use
them, for attribution only.
