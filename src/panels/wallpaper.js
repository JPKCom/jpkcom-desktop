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
   white text (menubar.css, desktop-icons.css).

   The panel (previews, swatches, the custom colour and gradient) is
   wallpaper-window.js, loaded when it first opens; the layer, the motif
   registry and the service stay here — the desktop paints at boot. */

import Desk from '../core/api.js';
import { BUILTIN_MOTIFS, checkMotif } from '../wallpapers/index.js';
import { cleanWallpaper, wallpaperKey, gradientCss, wallpaperTone, DIRS, HEX } from './pure.js';

const { h, L, store } = Desk;
const KEY = 'wallpaper';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const FALLBACK = Object.freeze({ type: 'gradient', from: '#3c4955', to: '#0c1925', dir: 'glow' });
const warn = msg => console.warn(`[wallpaper] ${msg}`);
/* A picture lives on this site: a relative path or a root path — never a scheme, never //host */
const localPath = v => typeof v === 'string' && v.length > 0 && v.length <= 300 && !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith('//') && !/[\s\\]/.test(v);
const isText = v => (typeof v === 'string' && v) || (v && typeof v === 'object' && Object.values(v).length > 0 && Object.values(v).every(x => typeof x === 'string'));

const cfg = Desk.config.wallpaper;

/* ---------- What is offered (config, cleaned once) ---------- */

const listed = (Array.isArray(cfg.motifs) ? cfg.motifs : []).filter(id => typeof id === 'string' && ID.test(id));

export const colors = (Array.isArray(cfg.colors) ? cfg.colors : []).filter(c => {
	const ok = c && typeof c === 'object' && HEX.test(c.color ?? '');
	if (!ok) warn(`config.wallpaper.colors: skipped ${JSON.stringify(c)} (needs color: '#rrggbb')`);
	return ok;
}).map(c => ({ color: c.color.toLowerCase(), name: isText(c.name) ? c.name : c.color }));

export const gradients = (Array.isArray(cfg.gradients) ? cfg.gradients : []).filter(g => {
	const ok = g && typeof g === 'object' && HEX.test(g.from ?? '') && HEX.test(g.to ?? '') && DIRS.includes(g.dir);
	if (!ok) warn(`config.wallpaper.gradients: skipped ${JSON.stringify(g)} (needs from, to: '#rrggbb', dir: ${DIRS.join('|')})`);
	return ok;
}).map(g => ({ from: g.from.toLowerCase(), to: g.to.toLowerCase(), dir: g.dir, name: isText(g.name) ? g.name : `${g.from} → ${g.to}` }));

export const images = (Array.isArray(cfg.images) ? cfg.images : []).filter(i => {
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
export const offered = () => listed.map(id => motifs.get(id)).filter(m => m && usable(m));

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
/** The open panels (wallpaper-window.js adds them: root.redraw() rebuilds, root.sync() marks the choice) */
export const views = new Set();

/** A motif's SVG (ids prefixed), its heavy effects off when reduced — null when its builder fails */
export function build(m, prefix) {
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

/* ---------- Open panels (wallpaper-window.js) ---------- */

function refresh() {
	for (const root of views) {
		if (!root.isConnected) views.delete(root);
		else root.sync();
	}
}

function redrawViews() {
	for (const root of views) {
		if (!root.isConnected) views.delete(root);
		else root.redraw();
	}
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
