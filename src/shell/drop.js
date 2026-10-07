/* JPKCom Desktop — files dragged onto the desktop open in the app that takes them — © Jean Pierre Kolb — MIT License

   Who opens what is declared by the modules (contribution point 'files'):

     files: { text: { accept: ['.txt', '.md'], mime: /^text\//, label: '@editor.dropLabel',
                      multiple: false, max: 10, order: 50, open(file | files, ctx) {} } }

   A file goes to the first handler (by order) whose mime pattern matches its
   type or whose accept list has its extension. A handler without accept and
   mime takes the files of the built-in kind named by its key — 'image',
   'text', 'audio', 'video' (by MIME type, else by extension; a name without
   any extension counts as text: Makefile, Dockerfile). multiple: true hands
   all files of the handler over at once (a player's playlist), otherwise one
   after the other, in the order they were dropped (the editor's tabs keep
   it). ctx: { target (the element dropped on), files (all of them) }.
   Images without a handler go to the image viewer service (viewer.openFile).

   While files are dragged over the page an overlay says what will happen
   (the handlers' labels); files nobody here can open get a short message.
   Stray drops never navigate away from the desktop. */

import { on } from '../core/bus.js';
import { t, L, i18n } from '../core/i18n.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { announce } from '../core/a11y.js';
import { get as service } from '../core/services.js';
import { follow } from './contrib.js';

const IMAGE = /^image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp)$/;
const TEXT_TYPE = /^(text\/|application\/(json|ld\+json|xml|javascript|x-javascript|x-sh|x-yaml|yaml|toml|x-httpd-php|sql))/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonc|js|mjs|cjs|ts|jsx|tsx|css|scss|less|html?|xml|ya?ml|toml|ini|conf|cfg|env|log|sh|bash|zsh|ps1|bat|py|rb|php|java|c|h|cpp|hpp|cs|go|rs|swift|kt|sql|njk|liquid|vue|svelte|diff|patch|srt|vtt|htaccess|gitignore|editorconfig)$/i;
/* By MIME type, else by extension (some systems send no type) */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|wav|wave|ogg|oga|opus|flac|weba)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|ogv|mov|mkv)$/i;
const MAX_IMAGES = 8;
const MAX_DEFAULT = 10;

/**
 * The built-in kind of a file: 'image' | 'video' | 'audio' | 'text' | null.
 * Pure (exported for tests): file = { name, type }.
 */
export function kindOf(f) {
	const type = String(f?.type ?? '');
	const name = String(f?.name ?? '');
	if (IMAGE.test(type) || (!type && IMAGE_EXT.test(name))) return 'image';
	if (/^video\//.test(type)) return 'video';
	if (/^audio\//.test(type)) return 'audio';
	if (VIDEO_EXT.test(name)) return 'video';
	if (AUDIO_EXT.test(name)) return 'audio';
	if (TEXT_TYPE.test(type) || TEXT_EXT.test(name) || (!type && !/\.[^./]+$/.test(name))) return 'text';
	return null;
}

const extOf = name => (/\.[^./]+$/.exec(String(name ?? ''))?.[0] ?? '').toLowerCase();

/**
 * Does a handler take a file? accept: extensions ('.md'), mime: a RegExp or a
 * string prefix ('text/'); neither → the built-in kind named by handler.id. Pure.
 */
export function accepts(handler, file) {
	const hasAccept = Array.isArray(handler.accept) && handler.accept.length > 0;
	const hasMime = handler.mime instanceof RegExp || (typeof handler.mime === 'string' && handler.mime.length > 0);
	if (!hasAccept && !hasMime) return kindOf(file) === handler.id;
	if (hasAccept && handler.accept.some(x => typeof x === 'string' && x.toLowerCase() === extOf(file.name))) return true;
	if (hasMime && file.type) return handler.mime instanceof RegExp ? handler.mime.test(file.type) : file.type.startsWith(handler.mime);
	return false;
}

/** Groups files by the first handler (sorted by order) that takes them. Pure → { groups: Map(handler → files), rest: files }. */
export function assign(handlers, files) {
	const sorted = [...handlers].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
	const groups = new Map();
	const rest = [];
	for (const f of files) {
		const hd = sorted.find(x => accepts(x, f));
		if (!hd) {
			rest.push(f);
			continue;
		}
		if (!groups.has(hd)) groups.set(hd, []);
		groups.get(hd).push(f);
	}
	return { groups, rest };
}

const handlers = [];
let overlay = null;
let depth = 0;
let flashTimer = 0;

/* The image viewer takes pictures even without a declared handler */
function fallbacks() {
	const viewer = service('viewer');
	return viewer?.openFile && !handlers.some(x => x.id === 'image')
		? [{ id: 'image', order: 90, multiple: false, max: MAX_IMAGES, open: (f, ctx) => viewer.openFile(f, ctx) }]
		: [];
}

const all = () => [...handlers, ...fallbacks()];

const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes('Files');

function show(title, sub) {
	if (!overlay) {
		overlay = h('div', { class: 'dropzone', 'aria-hidden': 'true' },
			h('div', { class: 'dropzone-box' },
				icon('ti-file-import', 'i dropzone-icon'),
				h('p', { class: 'dropzone-title' }),
				h('p', { class: 'dropzone-sub' })));
		document.body.append(overlay);
	}
	overlay.querySelector('.dropzone-title').textContent = title;
	overlay.querySelector('.dropzone-sub').textContent = sub || '';
	overlay.classList.add('is-on');
}

function hide() {
	depth = 0;
	overlay?.classList.remove('is-on', 'is-msg');
}

/* A short message in the same place, for files nobody here can open */
function flash(text) {
	show(text, '');
	overlay.classList.add('is-msg');
	announce(text);
	clearTimeout(flashTimer);
	flashTimer = setTimeout(hide, 2200);
}

/* "Opens text in the editor, images in the image viewer and music in the player" */
function hint() {
	const labels = [...new Set(all().map(x => (x.label ? L(x.label) : '')).filter(Boolean))];
	return labels.length ? t('shell.dropSub', { list: i18n.list(labels) }) : '';
}

async function drop(files, target) {
	const { groups, rest } = assign(all(), files);
	const ctx = { target, files };
	let opened = 0;
	for (const [hd, list] of groups) {
		const max = Number.isInteger(hd.max) && hd.max > 0 ? hd.max : MAX_DEFAULT;
		const take = list.slice(0, max);
		opened += take.length;
		try {
			if (hd.multiple) {
				await hd.open(take, ctx);
			} else {
				/* One after the other, so tabs and windows keep the order of the files */
				for (const f of take) await hd.open(f, ctx);
			}
		} catch (err) {
			console.error(`[drop] '${hd.id}' of '${hd.module ?? 'shell'}' failed:`, err);
		}
	}
	/* Nothing here could open any of it */
	if (files.length && !opened) flash(t('shell.dropNope', { name: (rest[0] ?? files[0]).name }));
}

/** Registers a handler at runtime (same shape as a 'files' contribution). Returns remove(). */
export function handle(id, def) {
	if (typeof id !== 'string' || typeof def?.open !== 'function') return () => {};
	const entry = { ...def, id };
	handlers.push(entry);
	return () => {
		const i = handlers.indexOf(entry);
		if (i >= 0) handlers.splice(i, 1);
	};
}

export function initDrop() {
	follow('files', {
		add(item) {
			if (typeof item.open !== 'function') {
				console.warn(`[drop] files handler '${item.id}' of '${item.module}' has no open() — skipped`);
				return;
			}
			handlers.push(item);
		},
		remove(moduleId) {
			for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i].module === moduleId) handlers.splice(i, 1);
		}
	});

	document.addEventListener('dragenter', e => {
		if (!hasFiles(e)) return;
		depth++;
		clearTimeout(flashTimer);
		overlay?.classList.remove('is-msg');
		show(t('shell.dropTitle'), hint());
	});
	document.addEventListener('dragover', e => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	});
	document.addEventListener('dragleave', e => {
		if (hasFiles(e) && --depth <= 0) hide();
	});
	document.addEventListener('drop', e => {
		if (!hasFiles(e)) return;
		e.preventDefault();
		hide();
		drop([...e.dataTransfer.files], e.target);
	});
	on('lang:change', hide);

	return Object.freeze({
		handlers: () => all().map(x => ({ id: x.id, module: x.module ?? null, label: x.label ? L(x.label) : null })),
		handle,
		open: (files, target = null) => drop([...files], target),
		kindOf
	});
}
