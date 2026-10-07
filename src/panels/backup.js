/* JPKCom Desktop — backup: the desktop's settings and data as one JSON file — © Jean Pierre Kolb — MIT License

   What goes into a backup is not a hand-kept list: every module declares its
   stored keys in its descriptor (storage: { name: { backup, reset, validate,
   count, label } }) and the storage registry builds the document
   ({ format: config.backup.format, version, created, data }). On import every
   value is validated again by the key's own validator; keys this desktop does
   not know are left out. Restoring closes the windows (they write what they
   still hold), writes the values and restarts the desktop.

   Service 'backup': download(), snapshot(), open(). */

import Desk from '../core/api.js';
import { summarize, legacyBackup, dateStamp } from './pure.js';

const { h, t, L, store, storage } = Desk;
/* Validated by the core (validateConfig): an invalid site value is warned about and
   replaced by the default — no second default kept here */
const cfg = Desk.config.backup;
const MAX = cfg.maxBytes;
const PREFIX = cfg.filePrefix;

/** Writes the backup file */
export function download() {
	const doc = storage.snapshot();
	Desk.dom.saveFile(JSON.stringify(doc, null, '\t'), `${PREFIX}-${dateStamp()}.json`, 'application/json');
	Desk.announce(t('backup.downloaded'));
}

/* Rows of what a data set holds: one per reset group (keys with backup: true), keys
   without a group on their own. In a preview, groups the file does not contain stay as they are. */
function groups() {
	const keys = storage.listKeys().filter(k => k.backup);
	const out = [];
	for (const g of storage.resetGroups()) {
		const own = keys.filter(k => k.reset === g.id);
		if (own.length) out.push({ id: g.id, label: L(g.label), keys: own.map(k => ({ name: k.name, label: L(k.label), count: k.count })) });
	}
	for (const k of keys.filter(k => !k.reset || !out.some(g => g.id === k.reset))) {
		out.push({ id: `key-${k.name}`, label: L(k.label), keys: [{ name: k.name, label: L(k.label), count: k.count }] });
	}
	return out;
}

function current() {
	const data = {};
	for (const k of storage.listKeys()) {
		if (!k.backup) continue;
		const v = storage.read(k.name);
		if (v != null) data[k.name] = v;
	}
	return data;
}

function valueText(row) {
	if (row.kept) return t('backup.kept');
	switch (row.kind) {
		case 'count': return t('backup.entries', { n: row.n });
		case 'text': return row.text;
		/* a group whose only key carries the group's own name ("Wallpaper: Wallpaper") */
		case 'list': return row.labels.length === 1 && row.labels[0] === row.label ? t('backup.custom') : Desk.i18n.list(row.labels);
		default: return '—';
	}
}

const list = (data, preview) => h('dl', { class: 'bk-list' }, summarize(groups(), data, preview).map(row =>
	[h('dt', { text: row.label }), h('dd', { class: row.kept ? 'is-kept' : null, text: valueText(row) })]));

/* Parses a backup file; null when it is not one of this desktop */
function read(text) {
	let doc;
	try {
		doc = JSON.parse(text);
	} catch {
		return null;
	}
	doc = legacyBackup(doc, store.prefix, name => storage.key(name) !== null);
	const res = storage.inspect(doc);
	if (!res.ok || !res.entries.length) return null;
	return res;
}

/* Closing the windows first lets the apps write what they still hold —
   afterwards nothing can overwrite the restored data before the restart */
function apply(entries) {
	const wm = Desk.wm;
	for (const w of wm?.list?.() ?? []) wm.close(w, { force: true });
	if (!storage.restore(entries)) return false;
	if (typeof Desk.power?.restart === 'function') Desk.power.restart();
	else location.reload();
	return true;
}

export function renderBackup() {
	const status = h('div', { class: 'bk-status', role: 'status' });
	const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: true, tabindex: '-1' });
	const importBtn = h('button', { type: 'button', class: 'btn', text: t('backup.import'), onclick: () => picker.click() });

	const fail = text => status.replaceChildren(h('p', { class: 'bk-error', text }));
	const cancel = () => {
		status.replaceChildren();
		importBtn.focus({ preventScroll: true });
	};

	picker.addEventListener('change', async () => {
		const file = picker.files?.[0];
		picker.value = '';
		if (!file) return;
		if (file.size > MAX) {
			fail(t('backup.tooBig', { size: Desk.i18n.fmtBytes(MAX) }));
			return;
		}
		let parsed = null;
		try {
			parsed = read(await file.text());
		} catch { /* unreadable */ }
		if (!parsed) {
			fail(t('backup.invalid', { name: Desk.config.brand.name }));
			return;
		}
		const data = Object.fromEntries(parsed.entries.map(e => [e.name, e.value]));
		const when = parsed.created
			? Desk.i18n.fmtDate(new Date(parsed.created), { dateStyle: 'long', timeStyle: 'short' })
			: file.name;
		const applyBtn = h('button', {
			type: 'button', class: 'btn btn-danger', text: t('backup.apply'),
			onclick: () => { if (!apply(parsed.entries)) fail(t('backup.full')); }
		});
		status.replaceChildren(
			h('h3', { text: t('backup.from', { when }) }),
			list(data, true),
			parsed.unknown.length ? h('p', { class: 'bk-note', text: t('backup.unknown', { n: parsed.unknown.length }) }) : null,
			h('p', { text: t('backup.warn') }),
			h('div', { class: 'bk-btns' },
				h('button', { type: 'button', class: 'btn', text: t('core.cancel'), onclick: cancel }),
				applyBtn));
		applyBtn.focus({ preventScroll: true });
	});

	return h('div', { class: 'panel bk-panel' },
		h('h2', { text: t('backup.title') }),
		h('p', { text: t('backup.intro') }),
		h('h3', { text: t('backup.now') }),
		list(current(), false),
		h('div', { class: 'bk-btns' },
			h('button', { type: 'button', class: 'btn btn-primary', text: t('backup.download'), onclick: download }),
			importBtn),
		picker,
		status);
}

export const backupService = Object.freeze({
	download,
	snapshot: () => storage.snapshot(),
	open: () => Desk.launch('backup')
});
