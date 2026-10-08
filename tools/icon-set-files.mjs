/* JPKCom Desktop — site icon sets for the tools: reads config.iconSets from disk — © Jean Pierre Kolb — MIT License

   A helper of tools/validate-manifest.mjs and tools/seal-vault.mjs (not a command of its own):
   reads every file of config.iconSets below the installation root, checks it with
   cleanIconSet() of src/core/icon-sets.js — the same rules the browser applies when the set
   loads — and reports what it found. Sets are JSON: nothing is executed.

   Paths are resolved with join(root, src): SET_PATH admits no '%'-escapes, no '..' and no
   dot segments, so the tools read exactly the file the browser requests. Zero dependencies. */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanIconSet, isSetPath, MAX_SET_BYTES, MAX_SETS } from '../src/core/icon-sets.js';

/* The browser's view of a folder from the config: relative to the root, or root-absolute (a deployment
   at the web root) → a path relative to the installation root with a trailing '/', or null */
function folderOf(dir) {
	if (typeof dir !== 'string' || !dir) return null;
	const u = new URL(dir, 'https://root.invalid/');
	if (u.origin !== 'https://root.invalid') return null;
	const path = decodeURIComponent(u.pathname).replace(/^\//, '');
	return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Reads config.iconSets below root.
 * → { ids: Map<id, src>, sets: [{ src, name, license, bytes, count, icons, problems, fatal, missing, below }] }
 *   missing  the file does not exist (or is no file)
 *   fatal    the whole set is refused (size, JSON, format, too many icons, not a valid path)
 *   below    'vault' when the file lies below cfg.vault.dir (the service worker never keeps it), else null
 * Sets are checked in config order; an id an earlier set brought is a problem of the later one.
 */
export function readIconSets(root, cfg) {
	const ids = new Map();
	const sets = [];
	const list = Array.isArray(cfg?.iconSets) ? cfg.iconSets : [];
	const vault = folderOf(cfg?.vault?.dir);
	const taken = new Set();
	for (const src of list.slice(0, MAX_SETS)) {
		const set = { src, name: null, license: null, bytes: 0, count: 0, icons: {}, problems: [], fatal: null, missing: false, below: null };
		sets.push(set);
		if (!isSetPath(src)) {
			set.fatal = 'not a .json path inside the installation root';
			continue;
		}
		if (vault && src.startsWith(vault)) set.below = 'vault';
		const file = join(root, src);
		let text;
		try {
			const st = statSync(file);
			if (!st.isFile()) throw new Error('not a file');
			set.bytes = st.size;
			if (st.size > MAX_SET_BYTES) {
				set.fatal = `${Math.ceil(st.size / 1024)} KiB, larger than ${MAX_SET_BYTES / 1024 / 1024} MiB`;
				continue;
			}
			text = readFileSync(file, 'utf8');
		} catch {
			set.missing = true;
			continue;
		}
		let json;
		try {
			json = JSON.parse(text);
		} catch (err) {
			set.fatal = `invalid JSON: ${err.message}`;
			continue;
		}
		const r = cleanIconSet(json, { taken });
		Object.assign(set, { name: r.name, license: r.license, icons: r.icons, problems: r.problems, fatal: r.fatal });
		if (r.fatal) continue;
		set.count = Object.keys(r.icons).length;
		for (const id of Object.keys(r.icons)) {
			taken.add(id);
			ids.set(id, src);
		}
	}
	return { ids, sets };
}
