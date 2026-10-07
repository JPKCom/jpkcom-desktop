/* JPKCom Desktop — wallpaper motifs: waves, dunes, aurora, orbit, horizon, graphite — © Jean Pierre Kolb — MIT License

   Generated SVG wallpapers (format: src/wallpapers/kit.js). Every id inside a
   motif carries the uid prefix, so the desktop and its previews never share
   a gradient or filter. */

import { s } from '../core/dom.js';
import { root, stop } from './kit.js';

/* Aurora's light spots: blurred circles, or — with reduced effects — radial
   gradients that fade out the same way without a full-screen blur filter */
const AURORA = [
	[420, 340, 300, '#3a7bd5'],
	[1160, 300, 280, '#7b3fe4'],
	[900, 760, 320, '#1fb5a8'],
	[240, 860, 220, '#e0457b']
];

export default [
	{
		id: 'waves',
		name: '@wallpaper.motif.waves',
		bg: 'linear-gradient(165deg, #22325a 0%, #111a38 55%, #070b1c 100%)',
		build: u => root(
			s('defs', {},
				s('linearGradient', { id: `${u}s`, x1: 0, x2: 1, y1: 0, y2: 0 }, stop(0, '#fff', 0), stop(0.5, '#c3d0ff', 0.9), stop(1, '#fff', 0)),
				s('radialGradient', { id: `${u}r` }, stop(0, '#7a5cff', 0.45), stop(1, '#7a5cff', 0))),
			s('ellipse', { cx: 1150, cy: 260, rx: 720, ry: 430, fill: `url(#${u}r)` }),
			Array.from({ length: 5 }, (_, i) => {
				const y = 430 + i * 75;
				return s('path', {
					fill: 'none', stroke: `url(#${u}s)`, 'stroke-width': 2.6 - i * 0.3, opacity: 0.6 - i * 0.08,
					d: `M-100 ${y} C 300 ${y - 170 + i * 25} 650 ${y + 190 - i * 20} 1000 ${y + 10} S 1450 ${y - 150 + i * 15} 1750 ${y - 40}`
				});
			}))
	},
	{
		id: 'dunes',
		name: '@wallpaper.motif.dunes',
		bg: 'linear-gradient(180deg, #f6c0a0 0%, #e08a7a 32%, #8e5c8e 60%, #3a3263 85%, #25234a 100%)',
		build: () => root(
			s('circle', { cx: 1130, cy: 470, r: 95, fill: '#ffe1bf', opacity: 0.6 }),
			s('path', { fill: '#b06f8c', opacity: 0.45, d: 'M0 620C300 540 520 600 800 560S1300 500 1600 580V1000H0Z' }),
			s('path', { fill: '#7a4f80', opacity: 0.65, d: 'M0 720C260 660 600 760 900 690S1400 640 1600 700V1000H0Z' }),
			s('path', { fill: '#4b3a6b', opacity: 0.85, d: 'M0 820C350 760 700 860 1050 800S1450 780 1600 820V1000H0Z' }),
			s('path', { fill: '#2a2548', d: 'M0 910C400 870 800 950 1200 900S1500 890 1600 910V1000H0Z' }))
	},
	{
		id: 'aurora',
		name: '@wallpaper.motif.aurora',
		bg: '#0a0f1f',
		heavy: true,
		build(u, { reduced = false } = {}) {
			if (reduced) {
				return root(
					s('defs', {}, AURORA.map(([, , , c], i) => s('radialGradient', { id: `${u}a${i}` },
						stop(0, c, 1), stop(0.45, c, 0.7), stop(1, c, 0)))),
					s('g', { opacity: 0.62 }, AURORA.map(([cx, cy, r], i) => s('circle', { cx, cy, r: r * 1.7, fill: `url(#${u}a${i})` }))));
			}
			return root(
				s('defs', {}, s('filter', { id: `${u}b`, x: '-50%', y: '-50%', width: '200%', height: '200%' },
					s('feGaussianBlur', { stdDeviation: 110 }))),
				s('g', { filter: `url(#${u}b)`, opacity: 0.62 },
					AURORA.map(([cx, cy, r, fill]) => s('circle', { cx, cy, r, fill }))));
		}
	},
	{
		id: 'orbit',
		name: '@wallpaper.motif.orbit',
		bg: 'radial-gradient(circle at 50% 45%, #1e2f45 0%, #0b111c 60%, #05080f 100%)',
		build: u => root(
			s('defs', {},
				s('linearGradient', { id: `${u}o`, x1: 0, y1: 0, x2: 1, y2: 1 }, stop(0, '#6fb1ff'), stop(1, '#a46bff')),
				s('radialGradient', { id: `${u}c` }, stop(0, '#9fc6ff', 0.55), stop(1, '#9fc6ff', 0))),
			s('circle', { cx: 800, cy: 450, r: 120, fill: `url(#${u}c)` }),
			Array.from({ length: 8 }, (_, i) => s('circle', {
				cx: 800, cy: 450, r: 90 + i * 70, fill: 'none', stroke: `url(#${u}o)`, 'stroke-width': 1.6, opacity: 0.6 - i * 0.06
			})),
			s('circle', { cx: 800, cy: 450, r: 300, fill: 'none', stroke: '#fff', 'stroke-width': 3, opacity: 0.35, 'stroke-linecap': 'round', 'stroke-dasharray': '470 2000', transform: 'rotate(-120 800 450)' }))
	},
	{
		/* Sky, sun and sea live in the SVG so the horizon stays aligned at any aspect ratio */
		id: 'horizon',
		name: '@wallpaper.motif.horizon',
		bg: '#120f2a',
		build: u => root(
			s('defs', {},
				s('linearGradient', { id: `${u}k`, x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#14123a'), stop(0.5, '#3d2466'), stop(0.82, '#b04f6b'), stop(1, '#f0a262')),
				s('linearGradient', { id: `${u}n`, x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#ffd27a'), stop(1, '#ff7a59')),
				s('clipPath', { id: `${u}c` }, s('rect', { width: 1600, height: 740 }))),
			s('rect', { width: 1600, height: 740, fill: `url(#${u}k)` }),
			s('circle', { cx: 800, cy: 740, r: 180, fill: `url(#${u}n)`, 'clip-path': `url(#${u}c)` }),
			s('rect', { y: 740, width: 1600, height: 260, fill: '#120f2a' }),
			Array.from({ length: 8 }, (_, i) => {
				const y = 752 + i * i * 5 + i * 8;
				const w = 190 - i * 18;
				return s('path', { d: `M${800 - w} ${y}h${w * 2}`, stroke: '#ff9a6a', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.55 - i * 0.06 });
			}))
	},
	{
		id: 'graphite',
		name: '@wallpaper.motif.graphite',
		bg: 'linear-gradient(160deg, #3a3f47 0%, #1d2025 60%, #121417 100%)',
		build: u => root(
			s('defs', {}, s('linearGradient', { id: `${u}h`, x1: 0, y1: 0, x2: 1, y2: 0 }, stop(0, '#fff', 0), stop(0.5, '#fff', 0.09), stop(1, '#fff', 0))),
			s('rect', { x: -200, y: 380, width: 2000, height: 260, fill: `url(#${u}h)`, transform: 'rotate(-18 800 500)' }),
			s('path', { d: 'M-100 760L1700 175', stroke: '#fff', 'stroke-width': 1.2, opacity: 0.12 }))
	}
];
