/* JPKCom Desktop — wallpaper motifs: the motif contract and SVG building blocks — © Jean Pierre Kolb — MIT License

   A MOTIF is a generated SVG wallpaper. One builder serves the desktop and the
   previews in the wallpaper panel:

     {
       id: 'waves',                       // [a-z0-9-], listed in config.wallpaper.motifs to be offered
       name: '@wallpaper.motif.waves',    // text: string, '@ns.key' or { lang: text }
       bg: 'linear-gradient(…)',          // CSS background behind the SVG (also the preview's)
       tone: 'dark',                      // optional: 'light' | 'dark' — how light it is under the white
                                          //   menu titles and icon labels; without it the brightest
                                          //   #hex colour of bg decides (panels/pure.js wallpaperTone)
       heavy: false,                      // true: expensive effects (blur) — built with { reduced: true }
                                          //   when config.wallpaper.reducedEffects asks for it
       available: () => true,             // optional: false hides the motif (e.g. a logo that is missing)
       build(uid, { reduced }) → SVGElement   // uid: a unique prefix for every id inside (gradients,
                                          //   filters, clip paths) — the desktop and the previews
                                          //   show copies side by side
     }

   Built-in motifs: src/wallpapers/author.js (the JPK monogram, emblem and
   blueprint of the author) and src/wallpapers/motifs.js. Modules add their own
   with Desk.wallpaper.register(motif) and the site lists the id in
   config.wallpaper.motifs.

   The builders only use s() (createElementNS + setAttribute): no markup
   strings, no style attributes — the strict CSP holds. */

import { s } from '../core/dom.js';

/** A 16:10 canvas that fills the screen (slice) */
export const root = (...kids) => s('svg', {
	viewBox: '0 0 1600 1000', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false'
}, ...kids);

/** A square canvas that fits (meet) instead of fills: a centred logo keeps its share
    of the shorter screen side, on a phone as on a wide monitor */
export const centred = (...kids) => s('svg', {
	viewBox: '0 0 1000 1000', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false'
}, ...kids);

/** A gradient stop */
export const stop = (offset, color, opacity = 1) => s('stop', { offset, 'stop-color': color, 'stop-opacity': opacity });

/** A soft drop shadow filter */
export const shadow = (id, dy, blur, opacity) => s('filter', { id, x: '-40%', y: '-40%', width: '180%', height: '180%' },
	s('feDropShadow', { dx: 0, dy, stdDeviation: blur, 'flood-color': '#000', 'flood-opacity': opacity }));

/** The default page background (base.css) — also the background of the author motifs */
export const BRAND_BG = 'radial-gradient(120% 90% at 50% 0%, #3c4955 0%, #1c2935 55%, #0c1925 100%)';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Checks a motif definition; returns a frozen copy or null (with the reason through warn). */
export function checkMotif(m, warn = () => {}) {
	if (!m || typeof m !== 'object') {
		warn('a motif must be an object');
		return null;
	}
	if (typeof m.id !== 'string' || !ID.test(m.id)) {
		warn(`motif id ${JSON.stringify(m.id)} must match [a-z0-9-]`);
		return null;
	}
	if (typeof m.build !== 'function') {
		warn(`motif '${m.id}' needs build(uid) → SVGElement`);
		return null;
	}
	const textOk = v => (typeof v === 'string' && v) || (v && typeof v === 'object' && Object.values(v).every(x => typeof x === 'string'));
	return Object.freeze({
		id: m.id,
		name: textOk(m.name) ? m.name : m.id,
		bg: typeof m.bg === 'string' ? m.bg : '#000',
		tone: m.tone === 'light' || m.tone === 'dark' ? m.tone : null,
		heavy: m.heavy === true,
		available: typeof m.available === 'function' ? m.available : () => true,
		build: m.build
	});
}
