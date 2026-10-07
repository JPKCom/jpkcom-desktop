/* JPKCom Desktop — hand-drawn glyphs and the author logo — © Jean Pierre Kolb — MIT License

   Glyphs that are not Tabler icons:
     jpk          the JPK monogram (the author's logo; default brand glyph, boot screen, menu bar)
     wc-close …   window control glyphs (close, minimise, zoom) — tiny 10×10 drawings
     tile-*       the window arrangement glyphs of the tile menu (left, right, max, both)

   Format per symbol: { vb: viewBox, a: attributes of the <symbol>, e: elements }
   with an element being a path d-string or [tag, attrs] — the same as tabler.js.

   The detailed logo (logos.jpkcom) is a function: every call builds a fresh
   <svg> with its own gradient ids, because a url(#id) that points into a copy
   which is hidden (display: none) would not paint.

   Brand assets, NOT MIT: the artwork of the JPK monogram (the path data of
   symbols.jpk) and of the JPKCom logo (JPKCOM_LOGO: shapes, paths, gradients)
   — © 1996–2026 Jean Pierre Kolb, all rights reserved; see CREDITS.md. The
   rest of this file (wc-*, tile-*, build(), logos and the symbol format) is
   MIT like the project. */

import { SVGNS } from '../core/env.js';

export const symbols = {
	/* The JPK monogram — brand asset, not MIT (CREDITS.md) */
	jpk: {
		vb: '0 0 410 410',
		a: { fill: 'currentColor' },
		e: [['path', {
			'fill-rule': 'nonzero',
			d: 'm360.244 74.133c-3.59 3.495-14.139 14.107-14.139 14.107-68.384-78.565-189.976-83.593-261.595-13.362-72.761 70.39-74.65 182.702-4.324 255.59 67.483 75.375 198.584 69.235 261.889-5.091l14.128 14.212c-77.192 86.985-213.058 85.694-290.155 5.028-76.352-79.154-74.557-207.621 4.534-284.088 87.143-82.754 218.286-68.647 289.662 13.604zm-103.821 29.117c0-6.581-1.102-12.365-3.39-17.246-2.288-4.891-5.721-8.88-10.35-11.966-4.03-2.696-8.712-4.533-14.086-5.689-5.374-1.091-12.039-1.637-20.006-1.637h-22.095v76.614h17.361c10.307 0 19.618-.85 25.937-2.54 6.371-1.648 11.64-4.64 15.828-8.922 3.779-3.895 6.519-8.083 8.261-12.617 1.69-4.587 2.54-9.867 2.54-15.997zm-69.728 183.542c0 17.456-5.332 30.86-15.976 40.286-10.654 9.415-24.887 14.159-42.804 14.159-4.283 0-10.403.042-17.573-.703-7.168-.745-6.318-.85-11.095-1.889l15.073-20.447c5.176 1.102 4.536 1.196 10.162 1.196 8.156 0 14.527-2.036 19.356-3.936 4.881-1.847 8.46-4.534 10.748-7.977 2.446-3.538 3.936-7.925 4.629-13.058.651-5.133.997-11.116.997-17.844l.2-233.306 48.672.053c11.399 0 21.056.944 29.065 2.897 8.019 1.889 15.083 4.985 21.203 9.216 7.169 4.933 12.743 11.168 16.826 18.746 4.03 7.579 6.067 16.753 6.067 27.47 0 8.418-1.492 16.353-4.472 23.827-2.991 7.526-7.074 13.908-12.291 19.187-6.624 6.582-14.443 11.567-23.397 14.905-8.912 3.391-20.258 5.091-33.893 5.091h-21.497zm125.612 48.211h-27.018l-56.986-72.783-9.111 10.223v62.56h-20.856v-156.577h20.856v72.332l64.302-72.332h24.939l-64.658 69.938z'
		}]]
	},

	/* Window controls: drawn for a 10×10 box, shown at 8 px inside the coloured dot */
	'wc-close': {
		vb: '0 0 10 10',
		a: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' },
		e: ['M2.6 2.6l4.8 4.8M7.4 2.6L2.6 7.4']
	},
	'wc-min': {
		vb: '0 0 10 10',
		a: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' },
		e: ['M2 5h6']
	},
	'wc-max': {
		vb: '0 0 10 10',
		a: { fill: 'currentColor', stroke: 'none' },
		e: ['M2.2 2.2h4.3L2.2 6.5zM7.8 7.8H3.5l4.3-4.3z']
	},

	/* Tile menu: the screen with the half (or whole) the window will take */
	'tile-left': {
		vb: '0 0 24 24',
		a: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' },
		e: [['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2.5' }], ['path', { d: 'M5.5 7.5h5v9h-5z', fill: 'currentColor', stroke: 'none' }]]
	},
	'tile-right': {
		vb: '0 0 24 24',
		a: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' },
		e: [['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2.5' }], ['path', { d: 'M13.5 7.5h5v9h-5z', fill: 'currentColor', stroke: 'none' }]]
	},
	'tile-max': {
		vb: '0 0 24 24',
		a: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' },
		e: [['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2.5' }], ['path', { d: 'M5.5 7.5h13v9h-13z', fill: 'currentColor', stroke: 'none' }]]
	},
	'tile-both': {
		vb: '0 0 24 24',
		a: { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' },
		e: [['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2.5' }], ['path', { d: 'M5.5 7.5h5v9h-5zM13.5 7.5h5v9h-5z', fill: 'currentColor', stroke: 'none', opacity: '.75' }]]
	}
};

/* ---------- The detailed JPKCom logo (1024 × 1024) — brand asset, not MIT (CREDITS.md) ---------- */

const JPKCOM_LOGO = [
	['path', { fill: 'url(#a)', d: 'M0 0h1024v1024H0z' }],
	['path', { class: 'logo-grid', fill: 'none', stroke: '#fff', 'stroke-opacity': '.1', 'stroke-width': '1.96', d: 'M50 768h924M50 256h924M768 974V50M256 974V50' }],
	['path', { class: 'logo-grid', fill: 'none', stroke: '#fff', 'stroke-opacity': '.2', 'stroke-width': '2.5', d: 'M50 512h924M512 974V50' }],
	['path', { fill: 'none', stroke: '#fff', 'stroke-dasharray': '12.5,16.67,0,0', 'stroke-opacity': '.24', 'stroke-width': '4.17', d: 'M112.416 927.319V96.681M97.097 912h830.638m-15.319 15.319V96.681M97.097 112h830.638' }],
	['circle', { cx: '512', cy: '512', r: '360', fill: 'none', stroke: '#fff', 'stroke-dasharray': '12.5,20.83,0,0', 'stroke-linejoin': 'round', 'stroke-miterlimit': '1.5', 'stroke-opacity': '.24', 'stroke-width': '4.17' }],
	['circle', { cx: '512', cy: '512', r: '400', fill: 'none', stroke: '#fff', 'stroke-dasharray': '12.5,20.83,0,0', 'stroke-linejoin': 'round', 'stroke-miterlimit': '1.5', 'stroke-opacity': '.24', 'stroke-width': '4.17' }],
	['path', {
		class: 'logo-mark', fill: 'url(#b)', 'fill-rule': 'nonzero', stroke: '#fff', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round', 'stroke-miterlimit': '2', 'stroke-width': '4.17',
		d: 'M813.28 250.244c-7.18 6.986-28.279 28.214-28.279 28.214-136.786-157.15-379.986-167.199-523.242-26.721-145.536 140.786-149.314 365.436-8.65 511.22 134.984 150.772 397.213 138.487 523.826-10.177l28.265 28.428c-154.4 173.986-426.164 171.399-580.37 10.057C72.108 632.938 75.701 375.98 233.893 223.03 408.201 57.502 670.514 85.723 813.28 250.244ZM605.615 308.48c0-13.157-2.199-24.728-6.778-34.493-4.579-9.785-11.443-17.765-20.707-23.936-8.057-5.392-17.416-9.071-28.164-11.378-10.759-2.179-24.088-3.28-40.022-3.28h-44.192v153.251h34.721c20.621 0 39.241-1.708 51.884-5.078 12.744-3.3 23.287-9.286 31.658-17.851 7.557-7.793 13.035-16.164 16.521-25.243 3.387-9.171 5.079-19.728 5.079-31.992ZM466.144 675.601c0 34.915-10.657 61.721-31.951 80.578-21.306 18.828-49.777 28.329-85.621 28.329-8.565 0-20.8.079-35.15-1.415-14.335-1.493-12.629-1.692-22.193-3.778l30.151-40.892c10.356 2.199 9.079 2.386 20.335 2.386 16.308 0 29.05-4.065 38.715-7.872 9.756-3.693 16.92-9.065 21.492-15.95 4.899-7.08 7.879-15.857 9.257-26.122 1.3-10.263 1.994-22.236 1.994-35.693l.406-466.656 97.351.107c22.807 0 42.122 1.885 58.135 5.792 16.035 3.78 30.171 9.972 42.408 18.437 14.348 9.864 25.491 22.336 33.656 37.492 8.064 15.157 12.142 33.507 12.142 54.943 0 16.842-2.984 32.715-8.95 47.665-5.978 15.05-14.15 27.814-24.584 38.378-13.25 13.164-28.886 23.136-46.793 29.808-17.836 6.785-40.53 10.184-67.794 10.184h-43.006v244.279ZM717.4 772.029h-54.043L549.373 626.451 531.15 646.9v125.129h-41.714V458.85h41.714v144.672l128.614-144.67h49.879L580.316 598.738 717.4 772.029Z'
	}],
	['path', { fill: 'none', stroke: '#fff', 'stroke-linejoin': 'round', 'stroke-miterlimit': '1.5', 'stroke-width': '4.17', d: 'M974 230c0-99.345-80.655-180-180-180H230c-99.345 0-180 80.655-180 180v564c0 99.345 80.655 180 180 180h564c99.345 0 180-80.655 180-180V230Z' }],
	['defs', {}, [
		['linearGradient', { id: 'a', x1: '0', x2: '1', y1: '0', y2: '0', gradientTransform: 'matrix(0 1019.82 -944.408 0 542.443 0)', gradientUnits: 'userSpaceOnUse' }, [
			['stop', { offset: '0', 'stop-color': '#596c7e' }],
			['stop', { offset: '1', 'stop-color': '#3c4955' }]
		]],
		['linearGradient', { id: 'b', x1: '0', x2: '1', y1: '0', y2: '0', gradientTransform: 'rotate(90 197.506 309.593) scale(794.292)', gradientUnits: 'userSpaceOnUse' }, [
			['stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.8' }],
			['stop', { offset: '1', 'stop-color': '#b3b3b3', 'stop-opacity': '.5' }]
		]]
	]]
];

/* Builds [tag, attrs, kids] trees; local ids and url(#…) references get the prefix */
function build(node, prefix) {
	const [tag, attrs, kids] = node;
	const el = document.createElementNS(SVGNS, tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'id') el.setAttribute('id', prefix + v);
		else el.setAttribute(k, v.replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`));
	}
	if (kids) for (const kid of kids) el.append(build(kid, prefix));
	return el;
}

let logoUid = 0;

/* Logos by id: (opts) → <svg>. Sites can add their own through icons.addLogo(). */
export const logos = {
	jpkcom() {
		const prefix = `jl${++logoUid}-`;
		const svg = build(['svg', {
			viewBox: '0 0 1024 1024', 'fill-rule': 'evenodd', 'clip-rule': 'evenodd',
			'stroke-linecap': 'round', 'stroke-miterlimit': '20', 'aria-hidden': 'true', focusable: 'false'
		}, JPKCOM_LOGO], prefix);
		svg.classList.add('logo', 'logo-jpkcom');
		return svg;
	}
};
