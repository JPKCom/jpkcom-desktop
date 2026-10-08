/* JPKCom Desktop — wallpaper panel: motif previews, pictures, colour and gradient swatches — © Jean Pierre Kolb — MIT License

   Loaded when the wallpaper window first opens (app field load in
   src/panels/index.js). Every choice goes through set() of wallpaper.js,
   which paints the desktop and tells the open panels (views: redraw() after
   a motif came or went, sync() after a change). */

import Desk from '../core/api.js';
import { wallpaperKey, gradientCss, DIRS } from './pure.js';
import { FALLBACK, colors, gradients, images, offered, views, build, set, get } from './wallpaper.js';

const { h, t, L } = Desk;
let uid = 0;

function syncPanel(root) {
	const state = get();
	const key = wallpaperKey(state);
	for (const b of root.querySelectorAll('[data-wp]')) b.setAttribute('aria-pressed', String(b.dataset.wp === key));
	const c = root.querySelector('.wp-color');
	if (c && state.type === 'color') c.value = state.color;
	if (state.type === 'gradient') {
		const [from, to, dir] = ['.wp-from', '.wp-to', '.wp-dir'].map(s => root.querySelector(s));
		if (from) from.value = state.from;
		if (to) to.value = state.to;
		if (dir) dir.value = state.dir;
	}
}

const swatch = (key, label, bg, pick) => h('li', {},
	h('button', { type: 'button', class: 'wp-swatch', 'data-wp': key, 'aria-label': label, title: label, style: { background: bg }, onclick: pick }));

function thumb(key, label, bg, art, pick, extra = null) {
	return h('li', {},
		h('button', { type: 'button', class: 'wp-thumb', 'data-wp': key, onclick: pick, title: extra },
			h('span', { class: 'wp-preview', style: bg ? { background: bg } : null }, art),
			h('span', { class: 'wp-name', text: label })));
}

function content(root) {
	const state = get();
	const g = state.type === 'gradient' ? state : gradients[0] ?? FALLBACK;
	const custom = () => set({
		type: 'gradient',
		from: root.querySelector('.wp-from').value,
		to: root.querySelector('.wp-to').value,
		dir: root.querySelector('.wp-dir').value
	});
	const list = offered();

	return [
		h('h2', { text: t('wallpaper.title') }),

		list.length ? [
			h('h3', { text: t('wallpaper.motifs') }),
			h('ul', { class: 'wp-grid' }, list.map(m => thumb(`svg:${m.id}`, L(m.name), m.bg, build(m, `wpp${++uid}-`),
				() => set({ type: 'svg', id: m.id }))))
		] : null,

		images.length ? [
			h('h3', { text: t('wallpaper.images') }),
			h('ul', { class: 'wp-grid' }, images.map(i => thumb(`image:${i.id}`, L(i.name), null,
				h('img', { src: Desk.env.asset(i.src), alt: '', loading: 'lazy', decoding: 'async' }),
				() => set({ type: 'image', id: i.id }),
				i.credit ? t('wallpaper.credit', { name: i.credit }) : null)))
		] : null,

		h('h3', { text: t('wallpaper.colors') }),
		colors.length ? h('ul', { class: 'wp-swatches' }, colors.map(c =>
			swatch(`color:${c.color}`, L(c.name), c.color, () => set({ type: 'color', color: c.color })))) : null,
		h('label', { class: 'wp-custom' },
			h('span', { text: t('wallpaper.customColor') }),
			h('input', {
				type: 'color', class: 'wp-color',
				value: state.type === 'color' ? state.color : colors[0]?.color ?? FALLBACK.from,
				oninput: e => set({ type: 'color', color: e.target.value })
			})),

		h('h3', { text: t('wallpaper.gradients') }),
		gradients.length ? h('ul', { class: 'wp-swatches' }, gradients.map(x =>
			swatch(`gradient:${x.from}:${x.to}:${x.dir}`, L(x.name), gradientCss(x.dir, x.from, x.to),
				() => set({ type: 'gradient', from: x.from, to: x.to, dir: x.dir })))) : null,
		h('div', { class: 'wp-custom', role: 'group', 'aria-label': t('wallpaper.customGradient') },
			h('span', { text: t('wallpaper.customGradient') }),
			h('label', {}, h('span', { class: 'visually-hidden', text: t('wallpaper.from') }),
				h('input', { type: 'color', class: 'wp-from', value: g.from, oninput: custom })),
			h('button', {
				type: 'button', class: 'wp-swap', 'aria-label': t('wallpaper.swap'), title: t('wallpaper.swap'),
				onclick() {
					const from = root.querySelector('.wp-from');
					const to = root.querySelector('.wp-to');
					[from.value, to.value] = [to.value, from.value];
					custom();
				}
			}, Desk.icon('ti-arrows-exchange')),
			h('label', {}, h('span', { class: 'visually-hidden', text: t('wallpaper.to') }),
				h('input', { type: 'color', class: 'wp-to', value: g.to, oninput: custom })),
			h('label', {}, h('span', { class: 'visually-hidden', text: t('wallpaper.dir') }),
				h('select', { class: 'wp-dir', onchange: custom },
					DIRS.map(k => h('option', { value: k, selected: k === g.dir, text: t(`wallpaper.dir.${k}`) })))))
	];
}

/** The panel (kind 'native': rebuilt on a language switch) */
function renderWallpaper() {
	const root = h('div', { class: 'panel wp-panel' });
	root.redraw = () => {
		const focused = root.contains(document.activeElement) ? document.activeElement : null;
		const keep = focused?.dataset.wp ?? (focused?.classList.contains('wp-color') ? 'wp-color' : null);
		root.replaceChildren(...content(root).flat(Infinity).filter(Boolean));
		syncPanel(root);
		if (keep) (root.querySelector(`[data-wp="${Desk.dom.cssEscape(keep)}"]`) ?? root.querySelector(`.${keep}`))?.focus({ preventScroll: true });
	};
	root.sync = () => syncPanel(root);
	views.add(root);
	root.redraw();
	return root;
}

export default { render: renderWallpaper };
