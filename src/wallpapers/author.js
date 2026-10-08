/* JPKCom Desktop — wallpaper motifs of the author: JPK monogram, emblem, blueprint — © Jean Pierre Kolb — MIT License

   The author's logo as wallpapers (attribution, like the credit in About):
     author-monogram   the white JPK monogram of the menu bar (glyph 'jpk')
     author-emblem     the detailed JPKCom logo (icons.logo('jpkcom'))
     author-blueprint  the construction lines of that logo
   A site that removes the glyph or the logo loses the matching motif
   (available() → false); config.wallpaper.motifs decides what is offered.

   This code is MIT. The pictures of author-monogram and author-emblem show the
   JPK monogram and the JPKCom logo, brand assets that are not MIT (artwork in
   src/icons/custom.js, see CREDITS.md); author-blueprint draws construction
   lines only. A site with its own identity drops author-monogram and
   author-emblem from config.wallpaper.motifs. */

import { s } from '../core/dom.js';
import { symbolHref, hasIcon, logo } from '../core/icons.js';
import { root, centred, stop, shadow, BRAND_BG } from './kit.js';

/* The logo as a group (not a nested <svg>: the wallpaper layer's CSS sizes every svg to
   the screen). Its gradient ids are unique per copy already (icons.logo) */
function emblem(u, size) {
	const svg = logo('jpkcom');
	if (!svg) return null;
	const at = (1000 - size) / 2;
	const g = s('g', { transform: `translate(${at} ${at}) scale(${size / 1024})` });
	g.append(...svg.childNodes);
	return s('g', { filter: `url(#${u}s)` },
		s('defs', {},
			shadow(`${u}s`, 12, 16, 0.4),
			s('clipPath', { id: `${u}c` }, s('rect', { x: at, y: at, width: size, height: size, rx: size * 0.21 }))),
		s('g', { 'clip-path': `url(#${u}c)` }, g));
}

let hasLogo = null;

export default [
	{
		id: 'author-monogram',
		name: '@wallpaper.motif.monogram',
		bg: BRAND_BG,
		available: () => hasIcon('jpk'),
		build(u) {
			/* the glyph's <symbol> enters the sprite on first use; its DOM id is the sprite's ('#i-jpk') */
			const href = symbolHref('jpk');
			return centred(
				s('defs', {}, shadow(`${u}s`, 10, 14, 0.35)),
				s('use', { href, x: 390, y: 390, width: 220, height: 220, color: '#fff', opacity: 0.9, filter: `url(#${u}s)` }));
		}
	},
	{
		id: 'author-emblem',
		name: '@wallpaper.motif.emblem',
		bg: BRAND_BG,
		available: () => (hasLogo ??= logo('jpkcom') !== null),
		build: u => centred(emblem(u, 240))
	},
	{
		/* The construction lines of the JPK logo */
		id: 'author-blueprint',
		name: '@wallpaper.motif.blueprint',
		bg: BRAND_BG,
		build: u => root(
			s('defs', {}, s('radialGradient', { id: `${u}g`, cx: '50%', cy: '46%', r: '60%' },
				stop(0, '#6a7f93', 0.55), stop(0.55, '#3c4955', 0.25), stop(1, '#0c1925', 0))),
			s('rect', { width: 1600, height: 1000, fill: `url(#${u}g)` }),
			s('g', { fill: 'none', stroke: '#fff' },
				s('path', { 'stroke-opacity': 0.05, 'stroke-width': 1.5, d: 'M0 250h1600M0 750h1600M400 0v1000M1200 0v1000' }),
				s('path', { 'stroke-opacity': 0.08, 'stroke-width': 2, d: 'M0 500h1600M800 0v1000' }),
				s('circle', { cx: 800, cy: 500, r: 330, 'stroke-opacity': 0.1, 'stroke-width': 3, 'stroke-dasharray': '10 17' }),
				s('circle', { cx: 800, cy: 500, r: 366, 'stroke-opacity': 0.1, 'stroke-width': 3, 'stroke-dasharray': '10 17' }),
				s('rect', { x: 380, y: 80, width: 840, height: 840, rx: 165, 'stroke-opacity': 0.07, 'stroke-width': 3 }),
				s('path', { 'stroke-opacity': 0.07, 'stroke-width': 3, 'stroke-dasharray': '10 14', d: 'M435 856V144M421 130h758M1165 144v712M421 870h758' })))
	}
];
