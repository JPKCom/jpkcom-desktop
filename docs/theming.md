# Theming JPKCom Desktop

> JPKCom Desktop — theming guide — © Jean Pierre Kolb — MIT License

Every colour, corner radius, glass blur and shadow of the desktop is a CSS custom property (a "token") in
[`src/css/tokens.css`](../src/css/tokens.css). You change the look of your site by overriding tokens in one
file, `site/theme.css`. There is no build step: save the file and reload the page.

Contents

1. [Your own theme in five minutes](#1-your-own-theme-in-five-minutes)
2. [Rules](#2-rules)
3. [Families](#3-families)
4. [Token reference](#4-token-reference)
5. [What a theme cannot change](#5-what-a-theme-cannot-change)
6. [Checking a theme](#6-checking-a-theme)

---

## 1. Your own theme in five minutes

1. Open [`site/theme.css`](../site/theme.css). As shipped it contains only comments and changes nothing.
   `index.html` links it right after the desktop's own CSS and before the first paint, and the service
   worker keeps it offline with the other shell files.
2. Put your overrides inside `@layer themes`. That layer is declared last
   ([`src/css/layers.css`](../src/css/layers.css)), so it wins over every other layer, whatever the
   specificity of the rule it replaces.
3. Reload the page.

The file ships with a complete example, "square and flat", in a comment block of its own below the header.
To try it, delete exactly the two comment markers of that block (the opening one in front of `@layer`, the
closing one after its last brace), then reload:

```css
@layer themes {
	:root {
		--radius-panel: 4px;
		--radius-item: 3px;
		--radius-field: 3px;
		--radius-control: 2px;
		--radius-control-sm: 2px;
		--radius-small: 2px;
		--radius-win: 4px;
		--radius-menu: 3px;
		--radius-dock: 6px;
		--glass-backdrop: blur(12px) saturate(1.2);
		--chrome-backdrop: blur(10px) saturate(1.1);
	}
	:root, [data-island="dark"] {
		--shadow-popup: 0 0 0 1px rgb(0 0 0 / calc(0.5 * var(--shade))), 0 4px 10px rgb(0 0 0 / calc(0.3 * var(--shade)));
		--shadow-popover: var(--shadow-popup);
		--shadow-win: 0 0 0 1px rgb(0 0 0 / calc(0.6 * var(--shade))), 0 4px 12px rgb(0 0 0 / calc(0.25 * var(--shade)));
		--shadow-win-active: 0 0 0 1px rgb(0 0 0 / calc(0.7 * var(--shade))), 0 8px 20px rgb(0 0 0 / calc(0.35 * var(--shade)));
	}
	body.compact {
		--radius-win: 4px;
		--radius-dock: 6px;
	}
}
```

A smaller theme sets families only. Every part that follows a family changes with it:

```css
@layer themes {
	:root {
		--radius-control: 2px;   /* buttons, tool buttons, rows, navigation entries … */
		--radius-panel: 4px;     /* sheets, popovers, notifications … */
		--radius-win: 4px;
	}
	body.compact {
		--radius-win: 4px;       /* phones have their own window radius */
	}
}
```

Colours work the same way, separately for light and dark:

```css
@layer themes {
	:root[data-theme="light"] { --win-bg: #fbfaf7; }
	:root[data-theme="dark"], [data-island="dark"] { --win-bg: #1b2430; }
}
```

## 2. Rules

1. **Light and dark separately.** Theme-dependent tokens are declared once for the dark theme
   (`:root, [data-island="dark"]`) and once for the light theme (`:root[data-theme="light"]`). Override them
   the same way: `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Always add
   `[data-island="dark"]` to the dark selector. A dark island is an element that stays dark in both modes
   and reads its tokens from its own subtree: the menu bar, the desktop icons, the terminal, the
   calculator, code blocks and the boot screen. Shadows and rings use `--shade`, `--ink` and
   other theme tokens, and the islands re-declare them with their own values: a shadow or ring you
   override on `:root` alone does not reach the islands, so put it on `:root, [data-island="dark"]`.
2. **Families change every part at once.** `--radius-control` changes buttons, tool buttons, rows and
   navigation entries together. Part tokens (`--radius-btn`, `--shadow-menu` …) fine-tune one role; most of
   them are aliases of a family, a few carry their own value. **Set families on `:root`** (with or without `[data-theme=…]`). The part
   tokens are declared on `:root` as `var(--family)`, so they resolve there and everything below inherits
   the finished value: a family set on `body.compact` or on `[data-island="dark"]` does not reach the
   parts. On `body.compact` or on an island override the part tokens instead. Radius and glass tokens
   set on `:root` already reach the islands; only shadow and ring tokens need
   `:root, [data-island="dark"]` (rule 1).
3. **Phones.** `--radius-win` and `--radius-dock` have their own values on `body.compact`, as have the
   bar, tile and window-control sizes ([Layout and phones](#layout-and-phones),
   [Window controls](#window-controls)). To change the window radius on phones, override it on
   `body.compact`.
4. **Inline values win.** The active accent, the accents and tints of `site/config.js` and the wallpaper
   gradient are set inline by the desktop and win over every layer. Change accents and tints in
   `site/config.js` ([section 5](#5-what-a-theme-cannot-change)). Focus and selection rings are tokens:
   override `--ring-focus` and `--ring-selected`.
5. **High contrast.** In forced-colours mode browsers drop `box-shadow` and `text-shadow`; that is
   intended and no theme can bring them back. `filter: drop-shadow()` tokens (`--tile-glyph-filter`,
   `--about-logo-filter*`) stay.
6. **Keep focus and edges visible.** A theme can remove focus indicators and the 3:1 contrast of control
   edges (WCAG 1.4.11) by setting `--ring-focus`, `--ring-selected`, `--shadow-control-edge` or
   `--shadow-pressed` to `none` or to a low-contrast value. Keep them visible.

## 3. Families

Families are the knobs of a theme. The defaults are the values the desktop has always used.

| Family | Default | Changes | Parts that follow it |
|---|---|---|---|
| `--radius-panel` | `12px` | Large surfaces: sheets, popovers, notifications, the drop zone, cards | `--radius-sheet`, `--radius-dropzone`, `--radius-popover`, `--radius-notif`, `--radius-fortune-card`, `--radius-media-cover` |
| `--radius-item` | `8px` | Insets, list rows, previews, reader blocks | `--radius-inset`, `--radius-item-row`, `--radius-wp-preview`, `--radius-reader-block` |
| `--radius-field` | `7px` | Text fields, large buttons, segmented controls | `--radius-btn-lg`, `--radius-input`, `--radius-seg` |
| `--radius-control` | `6px` | Buttons, tool buttons, navigation entries, rows, window-control hit boxes | `--radius-wc`, `--radius-tool-btn`, `--radius-btn`, `--radius-field-sm`, `--radius-todo-filter`, `--radius-dock-label`, `--radius-row`, `--radius-nav-item`, `--radius-reader-media` |
| `--radius-control-sm` | `5px` | Menu items, segments, small status buttons | `--radius-tile-mini`, `--radius-ed-status-btn`, `--radius-seg-item`, `--radius-menu-item` |
| `--radius-small` | `4px` | Key caps, labels, inline code, small buttons | `--radius-tile-title`, `--radius-btn-xs`, `--radius-kbd`, `--radius-label`, `--radius-reader-code`, `--radius-search-mark` |
| `--radius-mark` | `3px` | Marks, swatches in the terminal, inline highlights | `--radius-term-swatch`, `--radius-reader-mark`, `--radius-term-code` |
| `--radius-hair` | `2px` | Hairline marks: the boot bar, editor marks, terminal links | `--radius-boot-bar`, `--radius-ed-mark`, `--radius-term-link` |
| `--radius-pill` | `999px` | Fully rounded: switches, chips, calculator keys, overview labels | `--radius-calc-key`, `--radius-switch`, `--radius-overview-label`, `--radius-catalog-chip` |
| `--radius-round` | `50%` | Circles: window-control dots, round buttons, swatches, calendar days | `--radius-wc-dot`, `--radius-btn-round`, `--radius-switch-knob`, `--radius-swatch`, `--radius-cal-day` |
| `--radius-win` | `12px` | Windows (own value on phones) | used directly in `wm/extras.css`, `wm/wm.css` |
| `--radius-menu` | `8px` | Dropdown menus and context menus | used directly in `shell/menus.css` |
| `--glass-backdrop` | `blur(30px) saturate(1.8)` | Blur and saturation behind menus, notifications, the drop zone, the tile menu, the calendar and the search palette | used directly in `modules/calendar/calendar.css`, `modules/search/search.css`, `shell/drop.css`, `shell/menus.css` and 2 more |
| `--chrome-backdrop` | `blur(24px) saturate(1.6)` | Blur and saturation behind the menu bar and the Dock | `--menubar-backdrop`, `--dock-backdrop` |
| `--shadow-hairline` | `inset 0 0 0 0.5px var(--line-strong)` | Half-pixel inner edge of panels, rows and previews | used directly in `apps/fortune/fortune.css`, `css/components.css`, `modules/search/search.css`, `panels/panels.css` and 2 more |
| `--shadow-control-edge` | `inset 0 0 0 1px var(--control-edge)` | One-pixel edge of switches and text fields (3:1 contrast) | used directly in `css/components.css` |
| `--shadow-pressed` | `inset 0 0 0 1px var(--pressed-edge)` | Edge of a pressed title-bar button | used directly in `apps/editor/editor.css`, `wm/extras.css`, `wm/wm.css` |
| `--ring-focus` | `0 0 0 2px var(--accent-ring)` | Keyboard focus ring of fields and controls | used directly in `apps/editor/editor.css`, `apps/todo/todo.css`, `css/components.css`, `modules/catalog/catalog.css` and 1 more |
| `--ring-selected` | `0 0 0 2px var(--win-bg), 0 0 0 4px var(--accent-ring)` | Ring around a selected wallpaper preview or swatch | used directly in `panels/wallpaper.css` |
| `--shadow-popup` | `0 0 0 0.5px rgb(0 0 0 / calc(0.6 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 12px 32px rgb(0 0 0 / calc(0.45 * var(--shade)))` | Menus and notifications | `--shadow-menu`, `--shadow-notif` |
| `--shadow-popover` | `0 0 0 0.5px rgb(0 0 0 / calc(0.6 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 14px 36px rgb(0 0 0 / calc(0.5 * var(--shade)))` | Calendar, drop zone and similar popovers | `--shadow-calendar`, `--shadow-dropzone` |

## 4. Token reference

Every token that `src/css/tokens.css` declares, grouped by purpose. "Default" is the value on plain `:root`
or, for theme tokens, the dark value; "Light" is the value of `:root[data-theme="light"]`, and "same"
means the light theme keeps the default (shadows still follow `--shade`, which is lower in the light
theme). "Phones" is the value on `body.compact`. "alias of" marks a part token that follows a family.
"Used in" lists the files that read the token (paths relative to `src/`, or starting with `site/`);
"other tokens only" means only other tokens read it, and "—" means no shipped file reads it (it is free
for your theme or set from JavaScript).

One more override: `--menubar-bg` becomes `rgb(14 22 31 / 0.72)` under `html[data-wp-tone="light"]` (a light wallpaper
under the menu bar, set by the `tone` option of a wallpaper).

Groups: [Brand and wallpaper](#brand-and-wallpaper) · [Accents and actions](#accents-and-actions) · [Tints of the app tiles](#tints-of-the-app-tiles) · [Shadows and rings](#shadows-and-rings) · [Window controls](#window-controls) · [App tiles](#app-tiles) · [Fixed-colour surfaces](#fixed-colour-surfaces) · [Details](#details) · [Fonts and icons](#fonts-and-icons) · [Layout and phones](#layout-and-phones) · [Radius: families](#radius-families) · [Radius: parts](#radius-parts) · [Backdrops (glass)](#backdrops-glass) · [Stacking order](#stacking-order) · [Motion](#motion) · [Theme: overlays and surfaces](#theme-overlays-and-surfaces) · [Theme: hints](#theme-hints) · [Theme: text](#theme-text) · [Theme: apps](#theme-apps)

Patterns: the seven built-in accents are `--accent-<id>` (the `id` is `blue`, `violet`, `pink`, `orange`,
`green`, `teal`, `graphite`); a site adds its own in `site/config.js` and they are set inline. App tile
tints are `--t-<id>`; `tile()` sets `--tint: var(--t-<id>)` on the tile.


### Brand and wallpaper

| Token | Default | Used in |
|---|---|---|
| `--brand` | `#3c4955` | other tokens only |
| `--brand-light` | `#596c7e` | — |
| `--brand-dark` | `#2c3945` | — |
| `--brand-darker` | `#1c2935` | — |
| `--brand-darkest` | `#0c1925` | other tokens only |
| `--wallpaper-from` | `var(--brand)` | `css/base.css` |
| `--wallpaper-to` | `var(--brand-darkest)` | `css/base.css` |

### Accents and actions

| Token | Default | Used in |
|---|---|---|
| `--danger` | `#c93434` | `css/components.css`, `wm/wm.css` |
| `--accent-blue` | `#3571c0` | other tokens only |
| `--accent-violet` | `#7853d8` | — |
| `--accent-pink` | `#c5306f` | — |
| `--accent-orange` | `#b35412` | other tokens only |
| `--accent-green` | `#23813f` | — |
| `--accent-teal` | `#0f7d78` | — |
| `--accent-graphite` | `#626e79` | — |
| `--accent` | `var(--accent-blue)` | `apps/editor/editor.css`, `apps/media/media.css`, `apps/todo/todo.css`, `css/components.css` and 10 more |
| `--on-accent` | `#fff` | `apps/calc/calc.css`, `apps/editor/editor.css`, `apps/media/media.css`, `apps/todo/todo.css` and 10 more |
| `--accent-ring` | `var(--accent)` | `site/modules/hello/hello.css` |

### Tints of the app tiles

| Token | Default | Used in |
|---|---|---|
| `--t-slate` | `#8497a9, #3c4955` | `css/components.css`, `panels/panels.css` |
| `--t-blue` | `#56adff, #1c62d6` | `core/icons.js`, `panels/settings.css` |
| `--t-orange` | `#ffb547, #ef6420` | `panels/settings.css` |
| `--t-teal` | `#45d8c4, #0e8783` | `panels/settings.css` |
| `--t-pink` | `#ff78aa, #d0266a` | `panels/settings.css` |
| `--t-violet` | `#a476ff, #5a2dd4` | `panels/settings.css` |
| `--t-black` | `#454552, #0a0a10` | — |
| `--t-indigo` | `#7a7bff, #563acc` | — |
| `--t-graphite` | `#a2acb6, #58626c` | — |
| `--t-green` | `#52d879, #1b9245` | `panels/settings.css` |

### Shadows and rings

| Token | Dark (default) | Light | Used in |
|---|---|---|---|
| `--tile-box-shadow` | `inset 0 1px 0 var(--tile-highlight), inset 0 -1px 0 var(--tile-edge), 0 3px 8px var(--tile-shadow)` | same | `css/components.css` |
| `--tile-glyph-filter` | `drop-shadow(0 1px 1.5px var(--tile-glyph-shadow))` | same | `css/components.css` |
| `--tile-mark-shadow` | `0 1px 2px var(--tile-shadow)` | same | `css/components.css` |
| `--shadow-swatch` | `inset 0 0 0 0.5px var(--swatch-edge)` | same | `css/components.css` |
| `--ring-focus` | `0 0 0 2px var(--accent-ring)` | same | `apps/editor/editor.css`, `apps/todo/todo.css`, `css/components.css`, `modules/catalog/catalog.css` and 1 more |
| `--ring-focus-halo` | `0 0 0 4px rgb(0 0 0 / 0.6)` | same | `shell/desktop-icons.css` |
| `--about-logo-filter` | `drop-shadow(0 2rem 1rem var(--logo-glow-off))` | same | `panels/panels.css` |
| `--about-logo-filter-hover` | `drop-shadow(0 2rem 1rem var(--logo-glow))` | same | `panels/panels.css` |
| `--shadow-wp-swatch-edge` | `inset 0 0 0 1px var(--swatch-edge)` | same | `panels/wallpaper.css` |
| `--shadow-ed-tab-current` | `inset 0 2px 0 var(--accent-ring)` | same | `apps/editor/editor.css` |
| `--shadow-popup` | `0 0 0 0.5px rgb(0 0 0 / calc(0.6 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 12px 32px rgb(0 0 0 / calc(0.45 * var(--shade)))` | same | other tokens only |
| `--shadow-popover` | `0 0 0 0.5px rgb(0 0 0 / calc(0.6 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 14px 36px rgb(0 0 0 / calc(0.5 * var(--shade)))` | same | other tokens only |
| `--shadow-win` | `0 0 0 0.5px rgb(0 0 0 / calc(0.7 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 10px 24px rgb(0 0 0 / calc(0.3 * var(--shade)))` | same | `wm/wm.css` |
| `--shadow-win-active` | `0 0 0 0.5px rgb(0 0 0 / calc(0.8 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 24px 64px rgb(0 0 0 / calc(0.55 * var(--shade)))` | same | `wm/wm.css` |
| `--shadow-win-bar` | `inset 0 -1px 0 rgb(0 0 0 / calc(0.35 * var(--shade)))` | same | `wm/wm.css` |
| `--shadow-pressed` | `inset 0 0 0 1px var(--pressed-edge)` | same | `apps/editor/editor.css`, `wm/extras.css`, `wm/wm.css` |
| `--shadow-snap-preview` | `inset 0 0 0 1px rgb(var(--ink) / 0.35)` | same | `wm/extras.css` |
| `--shadow-tilemenu` | `0 0 0 0.5px rgb(0 0 0 / calc(0.6 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 10px 26px rgb(0 0 0 / calc(0.45 * var(--shade)))` | same | `wm/extras.css` |
| `--shadow-hairline` | `inset 0 0 0 0.5px var(--line-strong)` | same | `apps/fortune/fortune.css`, `css/components.css`, `modules/search/search.css`, `panels/panels.css` and 2 more |
| `--shadow-btn` | `inset 0 0.5px 0 rgb(var(--ink) / 0.25)` | same | `css/components.css` |
| `--shadow-switch-knob` | `0 1px 3px rgb(0 0 0 / calc(0.4 * var(--shade)))` | same | `css/components.css` |
| `--shadow-switch-knob-off` | `0 0 0 1px var(--control-edge), var(--shadow-switch-knob)` | same | `css/components.css` |
| `--shadow-control-edge` | `inset 0 0 0 1px var(--control-edge)` | same | `css/components.css` |
| `--ring-selected` | `0 0 0 2px var(--win-bg), 0 0 0 4px var(--accent-ring)` | same | `panels/wallpaper.css` |
| `--shadow-sheet` | `inset 0 0 0 0.5px var(--line-strong), 0 16px 40px rgb(0 0 0 / calc(0.5 * var(--shade)))` | same | `css/components.css` |
| `--shadow-calendar` | `var(--shadow-popover)` | same | `modules/calendar/calendar.css` |
| `--shadow-cal-holiday` | `inset 0 0 0 1px color-mix(in srgb, var(--cal-weekend) 60%, transparent)` | same | `modules/calendar/calendar.css` |
| `--shadow-cal-today` | `0 0 0 2px rgb(var(--ink) / 0.25)` | same | `modules/calendar/calendar.css` |
| `--shadow-search-palette` | `0 0 0 0.5px rgb(0 0 0 / calc(0.6 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 18px 48px rgb(0 0 0 / calc(0.55 * var(--shade)))` | same | `modules/search/search.css` |
| `--shadow-about-logo` | `0 1px 0 rgb(var(--ink) / 0.1), 0 8px 18px rgb(0 0 0 / calc(0.35 * var(--shade)))` | same | `panels/panels.css` |
| `--shadow-wp-preview` | `0 0 0 1px var(--line-strong), 0 4px 10px rgb(0 0 0 / calc(0.3 * var(--shade)))` | same | `panels/wallpaper.css` |
| `--shadow-wp-swatch` | `var(--shadow-wp-swatch-edge), 0 2px 6px rgb(0 0 0 / calc(0.3 * var(--shade)))` | same | `panels/wallpaper.css` |
| `--icon-label-shadow` | `0 1px 3px rgb(0 0 0 / calc(0.8 * var(--shade)))` | same | `shell/desktop-icons.css` |
| `--shadow-dock` | `0 0 0 0.5px rgb(0 0 0 / calc(0.4 * var(--shade))), inset 0 0 0 0.5px var(--line-strong), 0 10px 30px rgb(0 0 0 / calc(0.3 * var(--shade)))` | same | `shell/dock.css` |
| `--shadow-dock-label` | `inset 0 0 0 0.5px var(--line-strong), 0 4px 12px rgb(0 0 0 / calc(0.35 * var(--shade)))` | same | `shell/dock.css` |
| `--shadow-dropzone` | `var(--shadow-popover)` | same | `shell/drop.css` |
| `--shadow-menubar` | `0 1px 0 rgb(var(--ink) / 0.06)` | same | `shell/menubar.css` |
| `--shadow-menu` | `var(--shadow-popup)` | same | `shell/menus.css` |
| `--shadow-notif` | `var(--shadow-popup)` | same | `shell/notifications.css` |
| `--shadow-notif-close` | `0 0 0 0.5px var(--line-strong), 0 2px 6px rgb(0 0 0 / calc(0.4 * var(--shade)))` | same | `shell/notifications.css` |
| `--shadow-power-on` | `inset 0 0 0 1px rgb(var(--ink) / 0.25)` | same | `shell/power.css` |
| `--shadow-ed-match-current` | `0 0 0 1.5px var(--warn)` | same | `apps/editor/editor.css` |
| `--shadow-media-cover` | `0 8px 24px rgb(0 0 0 / calc(0.45 * var(--shade)))` | same | `apps/media/media.css` |
| `--shadow-todo-drag` | `0 6px 16px rgb(0 0 0 / calc(0.4 * var(--shade)))` | same | `apps/todo/todo.css` |
| `--wc-ring` | `rgb(var(--ink) / 0.5)` | same | `wm/wm.css` |

### Window controls

| Token | Dark (default) | Light | Phones | Used in |
|---|---|---|---|---|
| `--wc-close` | `#ff5f57` | same | same | `wm/wm.css` |
| `--wc-min` | `#febc2e` | same | same | `wm/wm.css` |
| `--wc-max` | `#28c840` | same | same | `wm/wm.css` |
| `--wc-glyph` | `rgb(0 0 0 / 0.6)` | same | same | `wm/wm.css` |
| `--wc-box-w` | `20px` | same | `34px` | `wm/wm.css` |
| `--wc-box-h` | `24px` | same | `42px` | `wm/wm.css` |
| `--wc-dot` | `12px` | same | `15px` | `wm/wm.css` |
| `--wc-glyph-size` | `8px` | same | `9px` | `wm/wm.css` |
| `--wc-off` | `rgb(255 255 255 / 0.2)` | `rgb(0 0 0 / 0.18)` | same | `wm/wm.css` |

### App tiles

| Token | Default | Used in |
|---|---|---|
| `--tile-fg` | `#fff` | `css/components.css`, `panels/panels.css` |
| `--tile-highlight` | `rgb(255 255 255 / 0.35)` | other tokens only |
| `--tile-edge` | `rgb(0 0 0 / 0.25)` | other tokens only |
| `--tile-shadow` | `rgb(0 0 0 / 0.35)` | other tokens only |
| `--tile-shadow-sm` | `inset 0 1px 0 rgb(255 255 255 / 0.3), 0 1px 3px rgb(0 0 0 / 0.3)` | `modules/search/search.css`, `panels/panels.css`, `shell/notifications.css` |
| `--tile-glyph-shadow` | `rgb(0 0 0 / 0.45)` | other tokens only |

### Fixed-colour surfaces

| Token | Default | Used in |
|---|---|---|
| `--menubar-bg` | `rgb(14 22 31 / 0.42)` | `shell/menubar.css` |
| `--calc-bg` | `#10161c` | `apps/calc/calc.css` |
| `--calc-op` | `#d4561a` | `apps/calc/calc.css` |
| `--media-stage` | `#000` | `apps/media/media.css` |
| `--boot-bg` | `#000` | `css/base.css`, `shell/power.css` |
| `--boot-fg` | `#fff` | `shell/power.css` |
| `--reader-code-bg` | `#11171e` | `apps/terminal/terminal.css`, `modules/reader/reader.css` |
| `--scroll-code-thumb` | `#6272a4` | `apps/terminal/terminal.css`, `modules/reader/reader.css` |
| `--term-user` | `#52d879` | `apps/terminal/terminal.css` |
| `--term-error` | `#ff8a80` | `apps/terminal/terminal.css` |
| `--menubar-dim` | `rgb(0 0 0 / 0.35)` | `shell/menubar.css` |
| `--icon-label-plate` | `rgb(0 0 0 / 0.55)` | `shell/desktop-icons.css` |

### Details

| Token | Default | Used in |
|---|---|---|
| `--switch-knob` | `#fff` | `css/components.css` |
| `--swatch-edge` | `rgb(255 255 255 / 0.3)` | other tokens only |
| `--icon-label-outline` | `rgb(255 255 255 / 0.28)` | `shell/desktop-icons.css` |
| `--logo-glow` | `rgb(60 73 85 / 0.8)` | other tokens only |
| `--logo-glow-off` | `rgb(60 73 85 / 0)` | other tokens only |
| `--match` | `rgb(243 179 90 / 0.28)` | `apps/editor/editor.css` |
| `--match-current` | `rgb(243 179 90 / 0.42)` | `apps/editor/editor.css` |
| `--mark-on-accent` | `rgb(255 255 255 / 0.25)` | `modules/search/search.css` |
| `--fortune-mark` | `var(--accent-orange)` | `apps/fortune/fortune.css` |

### Fonts and icons

| Token | Default | Used in |
|---|---|---|
| `--font` | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, "Helvetica Neue", Arial, sans-serif` | `apps/calc/calc.css`, `apps/fortune/fortune.css`, `apps/notes/notes.css`, `apps/todo/todo.css` and 6 more |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace` | `apps/editor/editor.css`, `apps/terminal/terminal.css`, `css/components.css`, `modules/reader/reader.css` and 1 more |
| `--icon-stroke` | `1.75` | `css/base.css` |
| `--icon-duo-opacity` | `0.4` | `css/base.css` |
| `--icon-duo-color` | `currentColor` | `css/base.css` |

### Layout and phones

| Token | Default | Phones | Used in |
|---|---|---|---|
| `--mb-h` | `28px` | `34px` | `shell/menubar.css` |
| `--mb-total` | `calc(var(--mb-h) + env(safe-area-inset-top))` | `calc(var(--mb-h) + env(safe-area-inset-top))` | `css/components.css`, `modules/calendar/calendar.css`, `modules/search/search.css`, `shell/drop.css` and 5 more |
| `--bar-h` | `38px` | `44px` | `wm/wm.css` |
| `--tile` | `52px` | `clamp(40px, min(12.5vw, 11vh), 54px)` | `css/components.css`, `shell/dock.css` |
| `--dock-space` | not set | `calc(var(--tile) + 10px + 6px + env(safe-area-inset-bottom) + 4px)` | `modules/calendar/calendar.css` |
| `--bounce` | not set | `-4px` | `shell/dock.css` |

### Radius: families

| Token | Default | Phones | Used in |
|---|---|---|---|
| `--radius-win` | `12px` | `14px` | `wm/extras.css`, `wm/wm.css` |
| `--radius-menu` | `8px` | same | `shell/menus.css` |
| `--radius-panel` | `12px` | same | other tokens only |
| `--radius-item` | `8px` | same | other tokens only |
| `--radius-field` | `7px` | same | other tokens only |
| `--radius-control` | `6px` | same | other tokens only |
| `--radius-control-sm` | `5px` | same | other tokens only |
| `--radius-small` | `4px` | same | other tokens only |
| `--radius-mark` | `3px` | same | other tokens only |
| `--radius-hair` | `2px` | same | other tokens only |
| `--radius-pill` | `999px` | same | other tokens only |
| `--radius-round` | `50%` | same | other tokens only |

### Radius: parts

| Token | Default | Phones | Used in |
|---|---|---|---|
| `--radius-tile` | `23%` | same | `css/components.css` |
| `--radius-tile-title` | alias of `--radius-small` | same | `wm/wm.css` |
| `--radius-tile-mini` | alias of `--radius-control-sm` | same | `modules/catalog/catalog.css`, `shell/menus.css` |
| `--radius-term-swatch` | alias of `--radius-mark` | same | `apps/terminal/terminal.css` |
| `--radius-wc-dot` | alias of `--radius-round` | same | `wm/wm.css` |
| `--radius-wc` | alias of `--radius-control` | same | `wm/wm.css` |
| `--radius-tool-btn` | alias of `--radius-control` | same | `apps/editor/editor.css`, `apps/todo/todo.css`, `modules/calendar/calendar.css`, `wm/extras.css` and 1 more |
| `--radius-notes-back` | `8px` | same | `apps/notes/notes.css` |
| `--radius-btn` | alias of `--radius-control` | same | `css/components.css`, `modules/calendar/calendar.css`, `modules/catalog/catalog.css` |
| `--radius-btn-lg` | alias of `--radius-field` | same | `apps/todo/todo.css`, `panels/wallpaper.css`, `shell/launcher.css` |
| `--radius-btn-xs` | alias of `--radius-small` | same | `apps/editor/editor.css`, `apps/fortune/fortune.css` |
| `--radius-ed-status-btn` | alias of `--radius-control-sm` | same | `apps/editor/editor.css` |
| `--radius-btn-round` | alias of `--radius-round` | same | `apps/media/media.css`, `shell/notifications.css`, `shell/power.css` |
| `--radius-calc-key` | alias of `--radius-pill` | same | `apps/calc/calc.css` |
| `--radius-input` | alias of `--radius-field` | same | `apps/fortune/fortune.css`, `apps/todo/todo.css`, `css/components.css`, `modules/catalog/catalog.css` and 2 more |
| `--radius-field-sm` | alias of `--radius-control` | same | `site/modules/hello/hello.css`, `apps/editor/editor.css` |
| `--radius-seg` | alias of `--radius-field` | same | `css/components.css` |
| `--radius-seg-item` | alias of `--radius-control-sm` | same | `css/components.css` |
| `--radius-todo-filters` | `8px` | same | `apps/todo/todo.css` |
| `--radius-todo-filter` | alias of `--radius-control` | same | `apps/todo/todo.css` |
| `--radius-switch` | alias of `--radius-pill` | same | `css/components.css` |
| `--radius-switch-knob` | alias of `--radius-round` | same | `css/components.css` |
| `--radius-swatch` | alias of `--radius-round` | same | `css/components.css`, `panels/wallpaper.css` |
| `--radius-sheet` | alias of `--radius-panel` | same | `css/components.css` |
| `--radius-kbd` | alias of `--radius-small` | same | `css/components.css`, `modules/search/search.css` |
| `--radius-inset` | alias of `--radius-item` | same | `css/components.css`, `modules/weather/weather.css`, `panels/panels.css` |
| `--radius-scroll-thumb` | `12px` | same | `css/base.css` |
| `--radius-menu-item` | alias of `--radius-control-sm` | same | `shell/menubar.css`, `shell/menus.css` |
| `--radius-menu-sheet` | `14px` | same | `shell/menus.css` |
| `--radius-menu-sheet-item` | `9px` | same | `shell/menus.css` |
| `--radius-menu-sheet-tile` | `7px` | same | `shell/menus.css` |
| `--radius-tilemenu` | `10px` | same | `wm/extras.css` |
| `--radius-overview-label` | alias of `--radius-pill` | same | `wm/extras.css` |
| `--radius-dock` | `20px` | `18px` | `shell/dock.css` |
| `--radius-dock-label` | alias of `--radius-control` | same | `shell/dock.css` |
| `--radius-label` | alias of `--radius-small` | same | `modules/catalog/catalog.css`, `shell/desktop-icons.css` |
| `--radius-dropzone` | alias of `--radius-panel` | same | `shell/drop.css` |
| `--radius-popover` | alias of `--radius-panel` | same | `modules/calendar/calendar.css`, `modules/search/search.css`, `shell/drop.css` |
| `--radius-notif` | alias of `--radius-panel` | same | `shell/notifications.css` |
| `--radius-boot-bar` | alias of `--radius-hair` | same | `shell/power.css` |
| `--radius-item-row` | alias of `--radius-item` | same | `apps/notes/notes.css`, `apps/todo/todo.css`, `modules/search/search.css`, `panels/panels.css` |
| `--radius-row` | alias of `--radius-control` | same | `apps/calc/calc.css`, `apps/media/media.css`, `modules/holidays/holidays.css`, `modules/notify/notify.css` |
| `--radius-nav-item` | alias of `--radius-control` | same | `modules/catalog/catalog.css`, `panels/settings.css` |
| `--radius-catalog-chip` | alias of `--radius-pill` | same | `modules/catalog/catalog.css` |
| `--radius-wp-preview` | alias of `--radius-item` | same | `panels/wallpaper.css` |
| `--radius-cal-day` | alias of `--radius-round` | same | `modules/calendar/calendar.css` |
| `--radius-reader-code` | alias of `--radius-small` | same | `modules/reader/reader.css` |
| `--radius-reader-block` | alias of `--radius-item` | same | `modules/reader/reader.css` |
| `--radius-reader-media` | alias of `--radius-control` | same | `modules/reader/reader.css` |
| `--radius-reader-mark` | alias of `--radius-mark` | same | `modules/reader/reader.css` |
| `--radius-search-mark` | alias of `--radius-small` | same | `modules/search/search.css` |
| `--radius-ed-mark` | alias of `--radius-hair` | same | `apps/editor/editor.css` |
| `--radius-term-link` | alias of `--radius-hair` | same | `apps/terminal/terminal.css` |
| `--radius-term-code` | alias of `--radius-mark` | same | `apps/terminal/terminal.css` |
| `--radius-fortune-card` | alias of `--radius-panel` | same | `apps/fortune/fortune.css` |
| `--radius-media-cover` | alias of `--radius-panel` | same | `apps/media/media.css` |

### Backdrops (glass)

| Token | Default | Used in |
|---|---|---|
| `--chrome-backdrop` | `blur(24px) saturate(1.6)` | other tokens only |
| `--glass-backdrop` | `blur(30px) saturate(1.8)` | `modules/calendar/calendar.css`, `modules/search/search.css`, `shell/drop.css`, `shell/menus.css` and 2 more |
| `--menubar-backdrop` | alias of `--chrome-backdrop` | `shell/menubar.css` |
| `--dock-backdrop` | alias of `--chrome-backdrop` | `shell/dock.css` |
| `--sheet-backdrop` | `blur(24px) saturate(1.4)` | `css/components.css` |
| `--overlay-backdrop` | `blur(30px) saturate(1.4)` | `shell/launcher.css` |
| `--snap-backdrop` | `blur(6px)` | `wm/extras.css` |
| `--calc-hist-backdrop` | `blur(20px)` | `apps/calc/calc.css` |

### Stacking order

| Token | Default | Used in |
|---|---|---|
| `--z-overview` | `790` | `wm/extras.css` |
| `--z-launcher` | `800` | `shell/launcher.css` |
| `--z-dock` | `900` | `shell/dock.css` |
| `--z-menubar` | `1000` | `shell/menubar.css` |
| `--z-notification` | `1050` | `shell/notifications.css` |
| `--z-tilemenu` | `1060` | `wm/extras.css` |
| `--z-dropzone` | `1060` | `shell/drop.css` |
| `--z-menu` | `1100` | `shell/menus.css` |
| `--z-popover` | `1150` | `css/components.css`, `modules/calendar/calendar.css`, `modules/search/search.css` |
| `--z-boot` | `5000` | `css/base.css`, `shell/power.css` |

### Motion

| Token | Default | Used in |
|---|---|---|
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | `apps/terminal/terminal.css`, `css/components.css`, `modules/search/search.css`, `shell/dock.css` and 5 more |
| `--anim` | `240ms` | other tokens only |
| `--dur` | `var(--anim)` | `css/components.css`, `modules/search/search.css`, `shell/drop.css`, `shell/launcher.css` and 3 more |

### Theme: overlays and surfaces

| Token | Dark (default) | Light | Used in |
|---|---|---|---|
| `--ink` | `255 255 255` | `0 0 0` | `site/modules/hello/hello.css`, `apps/calc/calc.css`, `apps/editor/editor.css`, `apps/fortune/fortune.css` and 19 more |
| `--shade` | `1` | `0.45` | `apps/editor/editor.css`, `apps/media/media.css`, `apps/notes/notes.css`, `apps/todo/todo.css` and 4 more |
| `--glass` | `rgb(18 28 38 / 0.5)` | `rgb(246 247 249 / 0.62)` | — |
| `--glass-strong` | `rgb(26 36 47 / 0.86)` | `rgb(246 247 249 / 0.92)` | `apps/calc/calc.css`, `css/components.css`, `modules/calendar/calendar.css`, `modules/search/search.css` and 5 more |
| `--win-bg` | `#18212a` | `#fbfbfc` | `apps/editor/editor.css`, `apps/media/media.css`, `css/components.css`, `modules/reader/reader.css` and 2 more |
| `--win-bar` | `#243039` | `#e9ecef` | `apps/fortune/fortune.css`, `panels/settings.css`, `panels/wallpaper.css`, `shell/notifications.css` and 1 more |
| `--win-bar-inactive` | `#1e2831` | `#f1f3f5` | `wm/wm.css` |
| `--frame-bg` | `var(--win-bg)` | same | `wm/wm.css` |
| `--line` | `rgb(255 255 255 / 0.1)` | `rgb(0 0 0 / 0.1)` | `apps/editor/editor.css`, `apps/media/media.css`, `apps/terminal/terminal.css`, `css/components.css` and 8 more |
| `--line-strong` | `rgb(255 255 255 / 0.18)` | `rgb(0 0 0 / 0.16)` | `apps/fortune/fortune.css`, `css/components.css`, `modules/reader/reader.css`, `modules/weather/weather.css` and 5 more |
| `--control-edge` | `rgb(var(--ink) / 0.45)` | same | other tokens only |
| `--pressed-edge` | `rgb(var(--ink) / 0.6)` | `transparent` | other tokens only |
| `--overlay` | `rgb(12 20 28 / 0.55)` | `rgb(236 239 242 / 0.72)` | `shell/drop.css`, `shell/launcher.css`, `wm/extras.css` |
| `--dock-bg` | `rgb(24 34 45 / 0.42)` | `rgb(246 247 249 / 0.55)` | `shell/dock.css` |
| `--snap-bg` | `rgb(120 160 210 / 0.16)` | `rgb(53 113 192 / 0.14)` | `wm/extras.css` |
| `--check-a` | `#222b34` | `#e7eaed` | `modules/viewer/viewer.css` |
| `--check-b` | `#1a232c` | `#f3f4f6` | `modules/viewer/viewer.css` |

### Theme: hints

| Token | Dark (default) | Light | Used in |
|---|---|---|---|
| `--warn` | `#f3b35a` | `#8a5100` | `apps/editor/editor.css`, `apps/fortune/fortune.css`, `apps/media/media.css`, `apps/notes/notes.css` and 3 more |
| `--done` | `#7ee2a0` | `#166b34` | `apps/calc/calc.css` |

### Theme: text

| Token | Dark (default) | Light | Used in |
|---|---|---|---|
| `--text` | `#fff` | `#1f2328` | `site/modules/hello/hello.css`, `apps/calc/calc.css`, `apps/editor/editor.css`, `apps/fortune/fortune.css` and 23 more |
| `--text-2` | `rgb(255 255 255 / 0.72)` | `rgb(0 0 0 / 0.68)` | `site/modules/hello/hello.css`, `apps/calc/calc.css`, `apps/editor/editor.css`, `apps/fortune/fortune.css` and 21 more |
| `--text-3` | `rgb(255 255 255 / 0.5)` | `rgb(0 0 0 / 0.56)` | `apps/calc/calc.css`, `apps/editor/editor.css`, `apps/media/media.css`, `apps/notes/notes.css` and 11 more |
| `--focus` | `rgb(255 255 255 / 0.85)` | `rgb(0 0 0 / 0.75)` | `apps/editor/editor.css`, `apps/fortune/fortune.css`, `apps/media/media.css`, `apps/terminal/terminal.css` and 13 more |

### Theme: apps

| Token | Dark (default) | Light | Used in |
|---|---|---|---|
| `--gutter-bg` | `#131b23` | `#f1f3f5` | `apps/editor/editor.css` |
| `--gutter-current` | `rgb(255 255 255 / 0.08)` | `rgb(0 0 0 / 0.06)` | `apps/editor/editor.css` |
| `--calc-fn` | `rgb(255 255 255 / 0.22)` | same | `apps/calc/calc.css` |
| `--calc-num` | `rgb(255 255 255 / 0.1)` | same | `apps/calc/calc.css` |
| `--scroll-thumb` | `#6b7a88` | `#7b848d` | `apps/calc/calc.css`, `apps/editor/editor.css`, `apps/notes/notes.css`, `apps/todo/todo.css` and 4 more |
| `--scroll-thumb-hover` | `#8e9cab` | `#5f6870` | `css/base.css` |
| `--cal-weekend` | `#f3a6a6` | `#b3261e` | `apps/terminal/terminal.css`, `modules/calendar/calendar.css`, `modules/holidays/holidays.css` |
| `--cal-week` | `#8fc0ff` | `#1f5fae` | `modules/calendar/calendar.css`, `modules/notify/notify.css`, `modules/weather/weather.css` |
| `--reader-text` | `#dde5ec` | `#2b3036` | `apps/editor/editor.css`, `apps/notes/notes.css`, `apps/terminal/terminal.css`, `modules/reader/reader.css` |
| `--reader-link` | `#8fc0ff` | `#1f5fae` | `apps/fortune/fortune.css`, `apps/terminal/terminal.css`, `css/components.css`, `modules/reader/reader.css` and 1 more |
| `--highlight` | `rgb(143 192 255 / 0.24)` | `rgb(31 95 174 / 0.16)` | `modules/reader/reader.css`, `modules/search/search.css` |

## 5. What a theme cannot change

- **Inline values.** The desktop sets these on `<html>` or on single elements from JavaScript, and an inline
  value beats every layer: `--accent`, `--on-accent`, `--accent-ring` (the active accent, darkened or
  lightened until it reaches 3:1), `--wallpaper-from` and `--wallpaper-to` (the wallpaper gradient), `--anim`
  (the animation duration, `config.ui.animMs`), `--c` and `--tint` (colours of single elements).
- **Accents and tints** come from `site/config.js` (`theme.accents`, `theme.tints`), not from CSS.
  The built-in `--accent-<id>` and `--t-<id>` defaults can be overridden here, but a value from the
  config overrides them again.
- **The accent swatch ring in Settings** (`src/css/components.css`, `0 0 0 2px var(--win-bg), 0 0 0 4px var(--c)`)
  does not follow `--ring-selected`: its colour is the per-element `--c`.
- **Structure.** A few corners and shadows are structural and stay literal in the CSS
  (`tests/theming.test.mjs` lists them). Layout and behaviour are not tokens.

## 6. Checking a theme

1. Run `npm run serve` and open the desktop; reload after every change.
2. Switch light and dark in Settings, and check a dark island (the menu bar, a desktop icon, the terminal).
3. Check the phone layout: narrow the window or use the browser's device mode (`body.compact`).
4. Check high contrast (forced colours): shadows disappear, but borders and focus must stay visible.
5. Run `npm test`. It checks that the shipped CSS uses tokens for radii, shadows and glass. Once you write
   rules into `site/theme.css`, the test "site/theme.css … ships without rules" fails, and the literal
   guards also scan `site/theme.css` and `site/modules/`: adapt or delete those assertions in
   `tests/theming.test.mjs` in your copy (see [quickstart](quickstart.md)).
