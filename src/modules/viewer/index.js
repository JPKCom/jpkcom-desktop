/* JPKCom Desktop — image viewer: window kinds 'image' and 'viewer' — © Jean Pierre Kolb — MIT License

   kind 'image'   one fixed picture: image items of a collection (url) and
                  pictures dropped on the desktop (transient apps with a File)
   kind 'viewer'  the app "Image Viewer": opens pictures from the device
                  (button, Mod+O, a file dropped on its window)

   Both show the picture fitted on a checkerboard and an info bar (Mod+I):
   name, format, dimensions (an SVG's own width/height or viewBox, read from
   the file — not the browser's 150/300 px fallback), aspect ratio, megapixels,
   file size, modification date and source. Blob URLs are released when the
   picture changes and when the window closes; dropped pictures leave the
   registry with their window.

   Device files never open as a document: a raster picture's blob URL carries a
   checked image type, an SVG is shown from a data: URL (never a blob: URL — an
   SVG is a document type, util.js deviceSource), "Open in new tab" (button,
   menus, canPopOut for the shell) is offered for site pictures only, Download
   saves the File itself (retyped application/octet-stream), the picture is not
   draggable and the stage keeps the browser's own context menu away
   (data-contextmenu="none").

   Contributions: files.image (drop handler of the shell: the first picture
   dropped on the viewer window opens there, every other one in a window of
   its own, at most 8 per drop).
   Service 'viewer': openFile(file) → the viewer app shows the file;
   openImage(file) → a window of its own; open(files, { target }) → the drop logic.

   This file is the descriptor (drop handler, service); the windows are kind.js,
   loaded with the first picture window (defineKind load). */

import Desk from '../../core/api.js';
import { FORMATS, MAX_BYTES, isImageFile } from './util.js';

const MAX_DROP = 8;
let dropUid = 0;

const t = (key, params) => Desk.t(key, params);

/* The window code comes with the first picture window (kind.js); both kinds share it */
const kindDef = { load: () => import('./kind.js') };

/* ---------- Opening files ---------- */

/** A picture in a window of its own (a transient app: never in the session, the dock's pins or deep links). */
function openImage(file) {
	if (!isImageFile(file)) return false;
	if (file.size > MAX_BYTES) {
		Desk.announce(t('viewer.tooBig', { name: file.name, max: Desk.i18n.fmtBytes(MAX_BYTES, { digits: 0 }) }));
		return false;
	}
	let id;
	do id = `viewer-drop-${++dropUid}`; while (Desk.apps.has(id));
	/* '@…' would be read as a translation key */
	const name = String(file.name || '').startsWith('@') ? { file: file.name } : file.name || t('viewer.appName');
	const app = Desk.apps.register({
		id, kind: 'image', name, icon: 'ti-photo', tint: 'blue', size: [720, 560],
		transient: true, hidden: true, nodock: true, dropped: true, fileName: file.name, file
	}, { source: 'drop', module: 'viewer' });
	return !!(app && Desk.wm?.open(app));
}

/*
 * Hands a picture to a viewer app window (opened or brought to the front): opts.file reaches
 * mount() on the first open, reopen() when it is open — also while its code still loads.
 * → whether the picture will show (the window explains a refused file itself).
 */
function toViewer(appId, file) {
	const win = Desk.wm?.open(appId, { file });
	return !!win && isImageFile(file) && file.size <= MAX_BYTES;
}

/** The image viewer app shows the file. */
function openFile(file) {
	if (!file) return false;
	return toViewer('viewer', file);
}

/**
 * The drop logic: a picture dropped on the viewer window opens there, every
 * other one (at most 8) in a window of its own. ctx: { target } (drop target).
 */
function open(input, ctx = {}) {
	const files = (Array.isArray(input) ? input : input && typeof input.length === 'number' && !(input instanceof Blob) ? [...input] : [input])
		.filter(isImageFile);
	if (!files.length) return false;
	const el = ctx?.target?.closest?.('.win-viewer');
	const win = el ? Desk.wm?.get(el.dataset.app) : null;
	let opened = 0;
	if (win && toViewer(win.app.id, files.shift())) opened++;
	for (const f of files.slice(0, MAX_DROP)) if (openImage(f)) opened++;
	return opened > 0;
}

export default {
	id: 'viewer',
	kind: 'module',
	requires: ['wm'],
	i18n: ['viewer'],
	windowStyles: ['viewer.css'],

	app: { kind: 'viewer', icon: 'ti-photo', tint: 'blue', size: [820, 580], name: '@viewer.appName', desc: '@viewer.appDesc' },

	/* Drop handler for the shell (desktop drop): all pictures of a drop at once, so
	   open() can send the first one to the viewer window it was dropped on and the
	   rest (at most 8) to windows of their own */
	files: {
		image: {
			label: '@viewer.dropLabel',
			multiple: true,
			max: MAX_DROP + 1,
			icon: 'ti-photo',
			accept: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico'],
			mime: /^image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)$/,
			open
		}
	},

	setup(desk) {
		desk.wm.defineKind('image', kindDef);
		desk.wm.defineKind('viewer', kindDef);
		/* A dropped picture's app goes with its window (also one closed before its code arrived) */
		desk.on('window:close', ({ win }) => {
			if (win?.app.dropped && win.app.kind === 'image') setTimeout(() => desk.apps.unregister(win.app.id), 0);
		});
		desk.provide('viewer', Object.freeze({ openFile, openImage, open, formats: () => ({ ...FORMATS }) }));
	}
};
