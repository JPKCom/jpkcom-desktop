/* JPKCom Desktop — built-in wallpaper motifs — © Jean Pierre Kolb — MIT License

   Every motif the desktop ships (contract: src/wallpapers/kit.js). The
   wallpaper panel (src/panels/wallpaper.js) offers the ones listed in
   config.wallpaper.motifs, in that order; modules add more through
   Desk.wallpaper.register(motif). */

import author from './author.js';
import motifs from './motifs.js';

export { checkMotif, root, centred, stop, shadow, BRAND_BG } from './kit.js';

export const BUILTIN_MOTIFS = Object.freeze([...author, ...motifs]);
