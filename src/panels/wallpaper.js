/* JPKCom Desktop — wallpaper: SVG motifs, plain colours, gradients, pictures — © Jean Pierre Kolb — MIT License

   One builder per motif serves the desktop and the previews (src/wallpapers/).
   What is offered comes from config.wallpaper (motifs, colors, gradients,
   images); the choice lives in storage ('wallpaper') and is validated on
   load — an unknown motif or a broken colour falls back to the configured
   default. Service 'wallpaper': register(motif, { module }), unregister(id),
   set(value), get(), menuItems(). Motifs a module registered go again when
   its setup fails ('module:failed').

   Values: { type: 'svg', id } | { type: 'color', color } | { type: 'gradient', from, to, dir }
           | { type: 'image', id } — see cleanWallpaper() in pure.js.

   html[data-wp-tone=light|dark] tells the menu bar and the desktop icons how light
   the wallpaper is (wallpaperTone() in pure.js; config.wallpaper.images take an
   optional tone, motifs too): on a light one they add a darker layer under their
   white text (menubar.css, desktop-icons.css). */

import Desk from '../core/api.js';
import { BUILTIN_MOTIFS, checkMotif } from '../wallpapers/index.js';
import { cleanWallpaper, wallpaperKey, gradientCss, wallpaperTone, DIRS, HEX } from './pure.js';

const { h, t, L, store } = Desk;
const KEY = 'wallpaper';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FALLBACK = Object.freeze({ type: 'gradient', from: '#3c4955', to: '#0c1925', dir: 'glow' });
const warn = msg => console.warn(`[wallpaper] ${msg}`);
/* A picture lives on this site: a relative path or a root path — never a scheme, never //host */
const localPath = v => typeof v === 'string' && v.length > 0 && v.length <= 300 && !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith('//') && !/[\s\\]/.test(v);
const isText = v => (typeof v === 'string' && v) || (v && typeof v === 'object' && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));

const cfg = Desk.config.wallpaper;

/* ---------- What is offered (config, cleaned once) ---------- */

const listed = (Array.isArray(cfg.motifs) ? cfg.motifs : []).filter(id => typeof id === 'string' && ID.test(id));

const colors = (Array.isArray(cfg.colors) ? cfg.colors : []).filter(c => {
	const ok = c && typeof c === 'object' && HEX.test(c.color ?? '');
	if (!ok) warn(`config.wallpaper.colors: skipped ${JSON.stringify(c)} (needs color: '#rrggbb')`);
	return ok;
}).map(c => ({ color: c.color.toLowerCase(), name: isText(c.name) ? c.name : c.color }));

const gradients = (Array.isArray(cfg.gradients) ? cfg.gradients : []).filter(g => {
	const ok = g && typeof g === 'object' && HEX.test(g.from ?? '') && HEX.test(g.to ?? '') && DIRS.includes(g.dir);
	if (!ok) warn(`config.wallpaper.gradients: skipped ${JSON.stringify(g)} (needs from, to: '#rrggbb', dir: ${DIRS.join('|')})`);
	return ok;
}).map(g => ({ from: g.from.toLowerCase(), to: g.to.toLowerCase(), dir: g.dir, name: isText(g.name) ? g.name : `${g.from} → ${g.to}` }));

const images = (Array.isArray(cfg.images) ? cfg.images : []).filter(i => {
	const ok = i && typeof i === 'object' && typeof i.id === 'string' && ID.test(i.id) && localPath(i.src);
	if (!ok) warn(`config.wallpaper.images: skipped ${JSON.stringify(i)} (needs id [a-z0-9-] and src: a path on this site)`);
	return ok;
}).map(i => ({
	id: i.id, src: i.src, name: isText(i.name) ? i.name : i.id, credit: typeof i.credit === 'string' ? i.credit : null,
	tone: i.tone === 'light' || i.tone === 'dark' ? i.tone : null
}));

/* ---------- Motif registry ---------- */

const motifs = new Map();
const owners = new Map();   // motif id → module id (registered by a module)
for (const m of BUILTIN_MOTIFS) {
	const c = checkMotif(m, warn);
	if (c) motifs.set(c.id, c);
}

const usable = m => {
	try {
		return m.available() !== false;
	} catch {
		return false;
	}
};

/** Offered motifs in config order (registered, listed, available) */
const offered = () => listed.map(id => motifs.get(id)).filter(m => m && usable(m));

const known = {
	motif: id => listed.includes(id) && motifs.has(id) && usable(motifs.get(id)),
	image: id => images.some(i => i.id === id)
};

/* For stored values and backups: a listed motif may still come (a module registers it later) */
const loose = { motif: id => listed.includes(id), image: known.image };

/** Validator of the storage key (backup, reset summaries) */
export const validateStored = v => cleanWallpaper(v, loose);

const defaultValue = () => cleanWallpaper(cfg.default, known) ?? FALLBACK;

/* Heavy effects (the aurora blur): config 'on' | 'off' | 'auto' (off while reduced motion is asked for) */
const reduced = () => cfg.reducedEffects === 'off' || (cfg.reducedEffects !== 'on' && Desk.reduceMotion());

/* ---------- State and painting ---------- */

let target = null;
let state = FALLBACK;
let pending = null;   // a stored motif id whose module has not registered it yet
let uid = 0;
const views = new Set();

function build(m, prefix) {
	try {
		return m.build(prefix, { reduced: m.heavy && reduced() });
	} catch (err) {
		console.error(`[wallpaper] motif '${m.id}' failed:`, err);
		return null;
	}
}

function apply(v) {
	if (!target) return;
	document.documentElement.dataset.wpTone = wallpaperTone(v, {
		motif: v.type === 'svg' ? motifs.get(v.id) : null,
		image: v.type === 'image' ? images.find(i => i.id === v.id) : null
	});
	target.replaceChildren();
	target.style.removeProperty('background');
	if (v.type === 'svg') {
		const m = motifs.get(v.id);
		target.style.setProperty('background', m.bg);
		const svg = build(m, `wp${++uid}-`);
		if (svg) target.append(svg);
	} else if (v.type === 'image') {
		const img = images.find(i => i.id === v.id);
		target.style.setProperty('background', '#000');
		target.append(h('img', { src: Desk.env.asset(img.src), alt: '', decoding: 'async' }));
	} else if (v.type === 'color') {
		target.style.setProperty('background', v.color);
	} else {
		target.style.setProperty('background', gradientCss(v.dir, v.from, v.to));
	}
}

/** Sets the wallpaper (validated). Returns false for an invalid value. */
export function set(v) {
	const ok = cleanWallpaper(v, known);
	if (!ok) return false;
	state = ok;
	pending = null;
	apply(state);
	store.setJson(KEY, state);
	refresh();
	Desk.emit('wallpaper:change', { value: { ...state } });
	return true;
}

export const get = () => ({ ...state });

/**
 * Adds a motif (from a module). Offered when its id is listed in config.wallpaper.motifs.
 * opts.module (or motif.module): the module id — its motifs go again when its setup fails.
 */
export function register(motif, opts = {}) {
	const c = checkMotif(motif, warn);
	if (!c) return false;
	if (motifs.has(c.id)) {
		warn(`motif '${c.id}' is registered already — the second one is ignored`);
		return false;
	}
	motifs.set(c.id, c);
	const module = typeof opts?.module === 'string' ? opts.module : typeof motif.module === 'string' ? motif.module : null;
	if (module) owners.set(c.id, module);
	if (!listed.includes(c.id)) {
		if (Desk.config.debug) console.info(`[wallpaper] motif '${c.id}' is registered but not listed in config.wallpaper.motifs — not offered`);
	} else if (pending === c.id && known.motif(c.id)) {
		pending = null;
		state = { type: 'svg', id: c.id };
		apply(state);
	}
	redrawViews();
	return true;
}

/** Removes a motif a module registered (built-in motifs stay). The active one falls back to the default. */
export function unregister(id) {
	if (!owners.has(id)) return false;
	owners.delete(id);
	motifs.delete(id);
	if (state.type === 'svg' && state.id === id) {
		/* The stored choice stays: should the module come back, the motif does too */
		pending = id;
		state = defaultValue();
		apply(state);
		Desk.emit('wallpaper:change', { value: { ...state } });
	}
	redrawViews();
	return true;
}

/** Paints the stored (or default) wallpaper into #wallpaper. */
export function initWallpaper() {
	target = document.getElementById('wallpaper');
	const saved = store.getJson(KEY);
	const clean = cleanWallpaper(saved, known);
	const later = clean ? null : cleanWallpaper(saved, loose);
	if (later?.type === 'svg') pending = later.id;
	state = clean ?? defaultValue();
	apply(state);
	/* An old motif id (the original desktop's 'monogram' …) is stored under its new one */
	const migrated = clean ?? later;
	if (migrated?.type === 'svg' && saved?.id !== migrated.id) store.setJson(KEY, migrated);

	/* A module whose setup failed takes its motifs with it */
	Desk.on('module:failed', ({ id } = {}) => {
		for (const [motif, module] of [...owners]) if (module === id) unregister(motif);
	});

	/* Reduced motion switched: heavy motifs rebuild with or without their effects */
	Desk.on('env:motion', () => {
		if (state.type === 'svg' && motifs.get(state.id)?.heavy && cfg.reducedEffects === 'auto') apply(state);
	});
	/* Settings → Reset → Wallpaper (the desktop restarts anyway; paint the default right away) */
	Desk.on('storage:reset', ({ groups } = {}) => {
		if (!groups?.includes('wallpaper')) return;
		state = defaultValue();
		pending = null;
		apply(state);
		refresh();
	});
}

/* ---------- Panel ---------- */

function refresh() {
	for (const root of views) {
		if (!root.isConnected) {
			views.delete(root);
			continue;
		}
		syncPanel(root);
	}
}

function redrawViews() {
	for (const root of views) {
		if (!root.isConnected) views.delete(root);
		else root.redraw();
	}
}

function syncPanel(root) {
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
export function renderWallpaper() {
	const root = h('div', { class: 'panel wp-panel' });
	root.redraw = () => {
		const focused = root.contains(document.activeElement) ? document.activeElement : null;
		const keep = focused?.dataset.wp ?? (focused?.classList.contains('wp-color') ? 'wp-color' : null);
		root.replaceChildren(...content(root).flat(Infinity).filter(Boolean));
		syncPanel(root);
		if (keep) (root.querySelector(`[data-wp="${Desk.dom.cssEscape(keep)}"]`) ?? root.querySelector(`.${keep}`))?.focus({ preventScroll: true });
	};
	views.add(root);
	root.redraw();
	return root;
}

/** Radio items for a context menu's quick pick (menus engine format) */
export const menuItems = () => offered().map(m => ({
	label: L(m.name), radio: true, checked: state.type === 'svg' && state.id === m.id, run: () => set({ type: 'svg', id: m.id })
}));

export const wallpaperService = Object.freeze({
	register,
	unregister,
	set,
	get,
	menuItems,
	/** Offered motifs: [{ id, name }] */
	motifs: () => offered().map(m => ({ id: m.id, name: L(m.name) })),
	/** The stable key of a value ('svg:waves', 'color:#3c4955', …) */
	keyOf: wallpaperKey,
	open: () => Desk.launch('wallpaper')
});
