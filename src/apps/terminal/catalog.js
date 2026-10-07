/* JPKCom Desktop — terminal: directories, targets and files from the app registry — © Jean Pierre Kolb — MIT License

   The shell's "file system" is the desktop's own catalogue — nothing is
   hard-coded:
     ~/apps          every launchable app (not hidden, not the launcher, not a collection item, no dropped file)
     ~/<collection>  one directory per collection of site/apps.js, its groups as sub-headings
   `ls`, `cd`, `open`, `man` and the completion read from here; `cat` reads
   the `files` section of site/apps.js. */

import Desk from '../../core/api.js';
import { cleanFiles } from './lib.js';

const L = v => Desk.L(v);

/** Apps that belong in ~/apps */
function plainApps() {
	/* collection items carry item: true (aliases: collection + slug); a Catalog window app stays */
	return Desk.apps.list().filter(a => a.kind !== 'launcher' && !a.item && !a.transient && !(a.collection && a.slug));
}

/** Collections with at least one item that can open now */
function liveItems(id) {
	return Desk.apps.items(id).filter(a => !a.hidden && Desk.apps.available(a));
}

/** Directory names: 'apps' first, then every collection (manifest order) */
export function dirNames() {
	const out = ['apps'];
	for (const c of Desk.apps.collections()) if (c.id !== 'apps') out.push(c.id);
	return out;
}

/** Is name a directory? ('apps', a collection id) */
export const isDir = name => dirNames().includes(name);

/** Title of a directory */
export function dirTitle(name) {
	if (name === 'apps') return Desk.t('terminal.dirApps');
	const c = Desk.apps.collection(name);
	return c ? L(c.name) : name;
}

/**
 * The listing of a directory: [{ label, items: [{ key, name, id }] }]
 * (one block per group; collections without groups give one block).
 */
export function listing(name) {
	if (name === 'apps') {
		return [{ label: dirTitle('apps'), items: plainApps().map(a => ({ key: a.id, name: L(a.name), id: a.id })) }];
	}
	const c = Desk.apps.collection(name);
	if (!c) return [];
	const items = liveItems(name).map(a => ({ key: a.slug ?? a.id, name: L(a.name), id: a.id, group: a.group }));
	if (!c.groups.length) return items.length ? [{ label: L(c.name), items }] : [];
	return c.groups.map(g => ({ label: L(g.name), items: items.filter(x => x.group === g.id) })).filter(g => g.items.length);
}

/**
 * Everything `open` can reach: [{ kind: 'apps' | <collection id>, key, id, name, app }].
 * only: one directory. first: a directory whose entries come first (the current one).
 */
export function targets({ only = null, first = null } = {}) {
	const list = [];
	const add = dir => {
		if (only && only !== dir) return;
		if (dir === 'apps') {
			for (const a of plainApps()) list.push({ kind: 'apps', key: a.id, id: a.id, name: L(a.name), app: a });
		} else {
			for (const a of liveItems(dir)) list.push({ kind: dir, key: a.slug ?? a.id, id: a.id, name: L(a.name), app: a });
		}
	};
	const dirs = dirNames();
	if (first && dirs.includes(first)) add(first);
	for (const d of dirs) if (d !== first) add(d);
	return list;
}

/** Counts for neofetch: [{ label, count }] — apps, then every collection with items */
export function counts() {
	return dirNames().map(d => ({ label: dirTitle(d), count: d === 'apps' ? plainApps().length : liveItems(d).length }))
		.filter((x, i) => i === 0 || x.count > 0);
}

let filesCache = null;
let filesRaw;

/** The files of site/apps.js `files` (validated once) */
export function files() {
	const raw = Desk.apps.data('files');
	if (raw !== filesRaw || !filesCache) {
		filesRaw = raw;
		filesCache = cleanFiles(raw, msg => console.warn(`[terminal] site data ${msg}`));
	}
	return filesCache;
}
