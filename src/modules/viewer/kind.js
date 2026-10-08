/* JPKCom Desktop — image viewer: the picture window (loaded with the first one) — © Jean Pierre Kolb — MIT License

   The hooks of window kinds 'image' and 'viewer' (index.js defines both with
   load: () => import('./kind.js') and keeps the drop handler and the service).
   win.state.viewer is the window's handle (loadFile, toggleInfo, save, …) once
   it is mounted; a file handed over by index.js arrives as opts.file (mount on
   the first open, reopen when the viewer is open already). */

import Desk from '../../core/api.js';
import { h } from '../../core/dom.js';
import { ACCEPT, MAX_BYTES, MAX_SVG_TEXT, isImageFile, typeOf, blobType, deviceSource, megapixelFormat, formatName, ratioParts, svgSizeFromAttrs, baseName } from './util.js';

const TIMEOUT = 15000;
let uid = 0;

const t = (key, params) => Desk.t(key, params);
const num = (n, digits = 0) => Desk.i18n.fmtNumber(n, { maximumFractionDigits: digits });
const absHref = raw => {
	try {
		return Desk.router.resolveUrl(raw, Desk.env.root)?.href ?? null;
	} catch {
		return null;
	}
};

/* A picture from the device (a File in a blob: URL): never opened as a document of its own —
   in the desktop's origin an SVG could run script with access to its storage */
const fromDevice = cur => !!cur && (cur.owned === true || /^blob:/i.test(String(cur.url)));
/* Device pictures: raster types enter a blob URL with a checked image type only; an SVG (a document
   type) a data: URL, which no page can navigate to and which never runs in the desktop's origin */
function sourceOf(file) {
	const type = blobType(file.type, file.name);
	const typed = file.slice(0, file.size, type);
	if (deviceSource(file.type, file.name) === 'blob') return Promise.resolve(URL.createObjectURL(typed));
	return new Promise((ok, fail) => {
		const reader = new FileReader();
		reader.onload = () => (typeof reader.result === 'string' && reader.result.startsWith('data:image/svg+xml')
			? ok(reader.result) : fail(new Error('unreadable')));
		reader.onerror = () => fail(reader.error ?? new Error('unreadable'));
		reader.readAsDataURL(typed);
	});
}
const release = url => {
	if (/^blob:/i.test(String(url ?? ''))) URL.revokeObjectURL(url);
};
const isLocal = href => {
	try {
		const u = new URL(href);
		return u.protocol === 'blob:' || u.origin === location.origin;
	} catch {
		return false;
	}
};

/* An SVG's own size, read from the file */
function svgSize(text) {
	const el = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
	if (el?.nodeName !== 'svg') return null;
	return svgSizeFromAttrs(el.getAttribute('width'), el.getAttribute('height'), el.getAttribute('viewBox'));
}

/* Size, type and date: from the File for local pictures, else from one fetch (same origin only) */
async function facts(cur) {
	if (cur.facts) return cur.facts;
	let blob = cur.file || null;
	let modified = cur.file?.lastModified ?? null;
	if (!blob && isLocal(cur.url)) {
		try {
			/* The body under the timeout and the viewer's size limit; the date from the headers */
			blob = await Desk.net.request(cur.url, {
				timeout: TIMEOUT, read: 'blob', maxBytes: MAX_BYTES,
				onHeaders: hd => {
					const lm = Date.parse(hd.get('last-modified'));
					if (Number.isFinite(lm)) modified = lm;
				}
			});
		} catch { /* gone or unreachable — the rows show '—' */ }
	}
	const type = typeOf(blob?.type || '', cur.fileName);
	let svg = null;
	if (type === 'image/svg+xml' && blob && blob.size < MAX_SVG_TEXT) {
		try {
			svg = svgSize(await blob.text());
		} catch { /* unreadable */ }
	}
	cur.facts = { size: blob?.size ?? null, type, modified, svg };
	return cur.facts;
}

/* ---------- The window ---------- */

function mount(win, body, bar, opts = {}) {
	const app = win.app;
	const fixed = app.kind === 'image';
	const v = { current: null, error: '', seq: 0, closed: false };
	win.state.viewer = v;

	/* Not draggable: a blob picture dropped on the browser's tab strip would open as a document */
	const img = h('img', { alt: '', decoding: 'async', draggable: 'false' });
	const stage = h('div', { class: 'viewer' });
	const info = h('aside', { class: 'viewer-info', id: `viewer-info-${++uid}`, hidden: true });
	const picker = h('input', { type: 'file', name: 'image', accept: ACCEPT, hidden: true, tabindex: '-1' });
	const btn = (glyph, key, run, extra = {}) => win.button({ icon: glyph, label: t(key), onClick: run, ...extra });
	const openBtn = fixed ? null : btn('ti-folder-open', 'viewer.open', () => picker.click());
	const infoBtn = btn('ti-info-circle', 'viewer.info', () => toggleInfo(), { pressed: false });
	infoBtn.setAttribute('aria-controls', info.id);
	const saveBtn = btn('ti-download', 'core.download', () => save());
	const tabBtn = btn('ti-external-link', 'core.openTab', () => popOut(win));

	body.append(h('div', { class: 'viewer-box' }, stage, info, picker));
	win.addActions(openBtn, infoBtn, saveBtn, tabBtn);

	/* A picture of the manifest takes its name in the current language (a language switch re-renders) */
	const nameOf = cur => (cur.fromApp ? Desk.apps.name(app) : cur.name);

	function render() {
		const cur = v.current;
		win.setTitle(cur ? nameOf(cur) || null : null);
		for (const b of [infoBtn, saveBtn, tabBtn]) b.disabled = !cur;
		/* Device files are never opened in a tab: no button, and no browser menu ("Open image in new tab") */
		tabBtn.hidden = !cur || fromDevice(cur);
		if (fromDevice(cur)) stage.dataset.contextmenu = 'none';
		else delete stage.dataset.contextmenu;
		if (!cur) {
			info.hidden = true;
			infoBtn.setAttribute('aria-pressed', 'false');
			stage.replaceChildren(h('div', { class: 'viewer-empty' },
				Desk.tile(app),
				h('p', { class: 'viewer-none', text: t('viewer.none') }),
				v.error ? h('p', { class: 'viewer-error', role: 'alert', text: v.error }) : null,
				fixed ? null : h('button', { type: 'button', class: 'btn btn-primary', text: t('viewer.openButton'), onclick: () => picker.click() }),
				fixed ? null : h('p', { class: 'viewer-hint', text: t('viewer.dropHint') })));
			return;
		}
		img.alt = nameOf(cur);
		if (img.getAttribute('src') !== cur.url) img.src = cur.url;
		stage.replaceChildren(img);
		renderInfo();
	}

	/* Errors are kept as key + params, so a language switch translates them too */
	function setError(key, params) {
		v.errorKey = { key, params };
		v.error = t(key, params);
	}

	function show(cur) {
		/* a newer picture wins over one still being read */
		v.seq++;
		if (v.current?.owned && v.current.url !== cur?.url) release(v.current.url);
		v.current = cur;
		v.error = '';
		v.errorKey = null;
		/* Same-origin site pictures only: a device file has no address to hand on */
		win.url = cur && !fromDevice(cur) ? cur.url : null;
		render();
		win.changed('state');
	}

	function fail(key, params) {
		setError(key, params);
		if (!v.current) render();
		else Desk.announce(v.error);
	}

	/* A picture from the device (button, Mod+O or dropped on this window) */
	function loadFile(file) {
		if (!file) return false;
		if (!isImageFile(file)) {
			fail('viewer.error', { name: file.name });
			return false;
		}
		if (file.size > MAX_BYTES) {
			fail('viewer.tooBig', { name: file.name, max: Desk.i18n.fmtBytes(MAX_BYTES, { digits: 0 }) });
			return false;
		}
		showFile(file, { name: file.name, fileName: file.name });
		return true;
	}

	/* A device file: its source is read asynchronously (an SVG's data: URL) */
	function showFile(file, fields) {
		const seq = ++v.seq;
		sourceOf(file).then(url => {
			if (seq !== v.seq || v.closed) {
				release(url);
				return;
			}
			show({ ...fields, url, file, owned: true });
		}, () => {
			if (seq === v.seq && !v.closed) fail('viewer.error', { name: fields.fileName || file.name });
		});
	}

	img.addEventListener('load', () => renderInfo());
	img.addEventListener('error', () => {
		if (!v.current) return;
		const name = v.current.fileName || nameOf(v.current);
		show(null);
		setError('viewer.error', { name });
		render();
	});

	async function renderInfo() {
		const cur = v.current;
		if (!cur || info.hidden) return;
		const f = await facts(cur);
		if (cur !== v.current || info.hidden) return;
		const svg = f.type === 'image/svg+xml';
		/* SVG: the file's own size; raster: the decoded pixels */
		const w = svg ? f.svg?.w : img.naturalWidth;
		const hgt = svg ? f.svg?.h : img.naturalHeight;
		const known = w > 0 && hgt > 0 && (svg || img.complete);
		const box = !!f.svg?.box;
		const ratio = known ? ratioParts(w, hgt) : null;
		const format = f.type ? formatName(f.type) : '';
		const rows = [
			[t('viewer.name'), cur.fileName || nameOf(cur)],
			[t('viewer.format'), f.type ? (svg ? t('viewer.formatVector', { format }) : format) : '—', f.type || null],
			[t('viewer.dimensions'), known ? t(box ? 'viewer.dimsUnits' : 'viewer.dimsPx', { w: num(w, 2), h: num(hgt, 2) }) : '—', svg && box ? 'viewBox' : null],
			...(known ? [[t('viewer.ratio'), ratio ? t('viewer.ratioValue', { a: String(ratio.a), b: String(ratio.b) }) : t('viewer.ratioValue', { a: num(w / hgt, 2), b: '1' })]] : []),
			...(known && !svg ? [[t('viewer.resolution'), t('viewer.megapixels', { n: Desk.i18n.fmtNumber((w * hgt) / 1e6, megapixelFormat((w * hgt) / 1e6)) })]] : []),
			[t('viewer.size'), f.size != null ? Desk.i18n.fmtBytes(f.size) : '—', f.size >= 1024 ? t('viewer.bytes', { n: f.size, size: num(f.size) }) : null],
			...(f.modified ? [[t('viewer.modified'), Desk.i18n.fmtDate(f.modified, { dateStyle: 'medium', timeStyle: 'short' })]] : []),
			[t('viewer.source'), cur.file ? t('viewer.local') : cur.path || '—']
		];
		info.replaceChildren(
			h('h3', { text: t('viewer.info') }),
			h('dl', {}, rows.map(([k, val, sub]) => [h('dt', { text: k }), h('dd', {}, val, sub ? h('small', { text: sub }) : null)])));
	}

	function toggleInfo(on = info.hidden) {
		if (!v.current) return;
		info.hidden = !on;
		infoBtn.setAttribute('aria-pressed', String(on));
		if (on) renderInfo();
	}

	/* A device file is saved from the File itself (dom.saveFile retypes it application/octet-stream) */
	function save() {
		const cur = v.current;
		if (!cur) return;
		if (cur.file) Desk.dom.saveFile(cur.file, cur.fileName || nameOf(cur));
		else Desk.download(cur.url, cur.fileName || nameOf(cur));
	}

	picker.addEventListener('change', () => {
		const file = picker.files?.[0];
		picker.value = '';
		loadFile(file);
	});

	win.el.addEventListener('keydown', e => {
		if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
		const k = e.key.toLowerCase();
		if (k === 'i') {
			e.preventDefault();
			toggleInfo();
		} else if (k === 'o' && !fixed) {
			e.preventDefault();
			picker.click();
		}
	});

	/* Without the shell's drop handling, the viewer window still takes a dropped picture */
	if (!fixed) {
		const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
		body.addEventListener('dragover', e => {
			if (Desk.service('drop') || !hasFiles(e)) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		});
		body.addEventListener('drop', e => {
			if (Desk.service('drop') || !hasFiles(e)) return;
			e.preventDefault();
			loadFile(e.dataTransfer.files?.[0]);
		});
	}

	Object.assign(v, {
		loadFile, toggleInfo, save, show, showFile,
		menu: () => [
			...(fixed ? [] : [{ label: t('viewer.open'), shortcut: 'Mod+O', run: () => picker.click() }, '-']),
			{ label: t('viewer.info'), checkbox: true, checked: !info.hidden, disabled: !v.current, shortcut: 'Mod+I', run: () => toggleInfo() },
			{ label: t('core.download'), disabled: !v.current, run: save },
			...(v.current && !fromDevice(v.current) ? [{ label: t('core.openTab'), run: () => popOut(win) }] : [])
		],
		relabel() {
			for (const [b, key] of [[openBtn, 'viewer.open'], [infoBtn, 'viewer.info'], [saveBtn, 'core.download'], [tabBtn, 'core.openTab']]) {
				if (!b) continue;
				b.setAttribute('aria-label', t(key));
				b.title = t(key);
			}
			if (v.errorKey) v.error = t(v.errorKey.key, v.errorKey.params);
			render();
		}
	});

	/* Collection images and dropped pictures bring their image along */
	if (fixed) {
		if (typeof Blob !== 'undefined' && app.file instanceof Blob) {
			const name = app.fileName || app.file.name || Desk.apps.name(app);
			showFile(app.file, { name: Desk.apps.name(app), fromApp: true, fileName: name });
		} else {
			const href = absHref(Desk.apps.url(app));
			if (href) {
				show({ url: href, name: Desk.apps.name(app), fromApp: true, fileName: app.fileName || baseName(href), file: null, path: Desk.apps.url(app) });
			} else {
				setError('viewer.error', { name: Desk.apps.name(app) });
				render();
			}
		}
	} else if (opts.file) {
		/* A picture handed over with the first open (service openFile, a drop on the opening window) */
		render();
		loadFile(opts.file);
	} else {
		render();
	}
}

function popOut(win) {
	const cur = win.state.viewer?.current;
	if (!cur || fromDevice(cur)) return;
	window.open(cur.url, '_blank', 'noopener');
}

/* The shell asks before it offers "Open in new tab": site pictures only */
function canPopOut(win) {
	const cur = win.state.viewer?.current;
	return !!cur && !fromDevice(cur);
}

export default {
	mount,
	/* The viewer app already open: a picture handed over (service openFile, drop) shows here */
	reopen(win, opts) {
		if (opts?.file) win.state.viewer?.loadFile(opts.file);
	},
	relabel: win => win.state.viewer?.relabel(),
	menu: win => win.state.viewer?.menu() ?? [],
	/* No reload: a picture is no page (as in the original). "Open in new tab" only for
	   site pictures — canPopOut tells the shell; device files (blob: URLs) never open as a document */
	popOut,
	canPopOut,
	/* "Copy link to this window": not while it shows a file from the device (no address to link to) */
	canLink: win => !win.state.viewer?.current || !fromDevice(win.state.viewer.current),
	/* Same-origin pictures only — a file from the device has no address */
	locationOf(win) {
		const cur = win.state.viewer?.current;
		return cur && !cur.file && isLocal(cur.url) ? cur.url : null;
	},
	unmount(win) {
		const v = win.state.viewer;
		if (v?.current?.owned) release(v.current.url);
		if (v) {
			v.current = null;
			v.closed = true;
		}
	}
};
