#!/usr/bin/env node
/* JPKCom Desktop — icon subset builder (Tabler Icons → src/icons/tabler.js) — © Jean Pierre Kolb — MIT License

   Scans the sources for quoted icon ids and writes ONLY the icons in use to
   src/icons/tabler.js (an ES module, committed, loaded at runtime without a
   build step):

     'ti-<name>'   outline icon   node_modules/@tabler/icons/icons/outline/<name>.svg
     'tif-<name>'  filled icon    node_modules/@tabler/icons/icons/filled/<name>.svg

   An id only counts when it stands in quotes ('…', "…" or `…`) — write every
   icon id out in full, never build it from parts at runtime (`ti-${x}`),
   or the scanner cannot see it. Unknown names fail the build.

   Extra icons: site/icons.json (optional, committed, never git-ignored) is a
   JSON array of further ids — ["ti-brand-github", "tif-star"] — for icons the
   sources never name, above all those used only inside sealed vault data
   (tools/seal-vault.mjs warns about vault icons missing from the subset).

   Usage
     node tools/build-icons.mjs            write src/icons/tabler.js
     node tools/build-icons.mjs --check    exit 1 if the file is out of date (CI)
     node tools/build-icons.mjs --list     print the ids found, write nothing

   Zero dependencies (Node ≥ 22). */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/icons/tabler.js');
const TABLER = join(ROOT, 'node_modules/@tabler/icons');
const SCAN = ['src', 'site', 'index.html'];
const SCAN_EXT = new Set(['.js', '.mjs', '.html', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git']);
const EXTRA = join(ROOT, 'site/icons.json');
const ID_ONLY = /^tif?-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* Every SVG element type Tabler 3.x ships (checked: 3.49 uses <path> only),
   plus the basic shapes in case a later release brings them back. Anything
   else fails loudly instead of silently rendering wrong. */
const ELEMENTS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
/* Attributes kept per element; everything else (class, …) is dropped */
const KEEP = new Set([
	'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points',
	'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity',
	'stroke-opacity', 'fill-rule', 'clip-rule', 'transform'
]);

const args = new Set(process.argv.slice(2));
const ID = /["'`](tif?-[a-z0-9]+(?:-[a-z0-9]+)*)["'`]/g;

function walk(path, out) {
	if (!existsSync(path)) return out;
	const st = statSync(path);
	if (st.isDirectory()) {
		for (const name of readdirSync(path).sort()) {
			if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
			walk(join(path, name), out);
		}
	} else if (SCAN_EXT.has(extname(path)) && path !== OUT) {
		out.push(path);
	}
	return out;
}

/* id → first file that uses it (for error messages) */
function collect() {
	const found = new Map();
	for (const entry of SCAN) {
		for (const file of walk(join(ROOT, entry), [])) {
			const text = readFileSync(file, 'utf8');
			for (const m of text.matchAll(ID)) {
				if (!found.has(m[1])) found.set(m[1], relative(ROOT, file));
			}
		}
	}
	for (const id of extraIds()) if (!found.has(id)) found.set(id, 'site/icons.json');
	return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

/* site/icons.json: a list of extra ids (vault data, content the scanner cannot see) */
function extraIds() {
	if (!existsSync(EXTRA)) return [];
	let list;
	try {
		list = JSON.parse(readFileSync(EXTRA, 'utf8'));
	} catch (err) {
		console.error(`site/icons.json is not valid JSON: ${err.message}`);
		process.exit(1);
	}
	if (!Array.isArray(list)) {
		console.error('site/icons.json must be a JSON array of icon ids, e.g. ["ti-star", "tif-heart"]');
		process.exit(1);
	}
	const bad = list.filter(id => typeof id !== 'string' || !ID_ONLY.test(id));
	if (bad.length) {
		console.error(`site/icons.json: invalid icon id(s) ${bad.map(x => JSON.stringify(x)).join(', ')} — use 'ti-<name>' (outline) or 'tif-<name>' (filled)`);
		process.exit(1);
	}
	return list;
}

function attrsOf(src) {
	const attrs = {};
	for (const m of src.matchAll(/([a-zA-Z0-9:-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
	return attrs;
}

/* Parse one Tabler SVG: root attributes decide outline vs filled, children become entries */
function parseSvg(text, file) {
	const root = text.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/);
	if (!root) throw new Error(`${file}: no <svg> root`);
	const rootAttrs = attrsOf(root[1]);
	if (rootAttrs.viewBox && rootAttrs.viewBox !== '0 0 24 24') throw new Error(`${file}: unexpected viewBox ${rootAttrs.viewBox}`);
	const kind = rootAttrs.stroke === 'currentColor' ? 'o' : rootAttrs.fill === 'currentColor' ? 'f' : null;
	if (!kind) throw new Error(`${file}: neither outline (stroke=currentColor) nor filled (fill=currentColor)`);

	const entries = [];
	const body = root[2].replace(/<!--[\s\S]*?-->/g, '');
	for (const m of body.matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)) {
		const tag = m[1];
		if (m[0].startsWith('</')) continue;
		if (!ELEMENTS.has(tag)) throw new Error(`${file}: unsupported element <${tag}>`);
		const all = attrsOf(m[2]);
		/* The invisible 24×24 bounding box every Tabler icon starts with */
		if (tag === 'path' && all.stroke === 'none' && /^M0 0h24v24H0z$/i.test(all.d || '') ) continue;
		const attrs = {};
		for (const [k, v] of Object.entries(all)) {
			if (KEEP.has(k)) attrs[k] = v;
		}
		if (tag === 'path' && Object.keys(attrs).length === 1 && attrs.d) entries.push(attrs.d);
		else entries.push([tag, attrs]);
	}
	if (!entries.length) throw new Error(`${file}: no drawable elements`);
	return { k: kind, e: entries };
}

function build(ids) {
	const icons = {};
	const missing = [];
	for (const [id, usedIn] of ids) {
		const filled = id.startsWith('tif-');
		const name = id.slice(filled ? 4 : 3);
		const file = join(TABLER, 'icons', filled ? 'filled' : 'outline', `${name}.svg`);
		if (!existsSync(file)) {
			missing.push(`${id} (used in ${usedIn})`);
			continue;
		}
		icons[id] = parseSvg(readFileSync(file, 'utf8'), relative(ROOT, file));
	}
	if (missing.length) {
		console.error(`Unknown Tabler icon name(s):\n  ${missing.join('\n  ')}\nCheck the names at https://tabler.io/icons (outline → 'ti-', filled → 'tif-').`);
		process.exit(1);
	}
	return icons;
}

function render(icons) {
	let version = 'unknown';
	try { version = JSON.parse(readFileSync(join(TABLER, 'package.json'), 'utf8')).version; } catch { /* keep unknown */ }
	const q = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
	const entry = e => (typeof e === 'string' ? q(e)
		: `[${q(e[0])}, { ${Object.entries(e[1]).map(([k, v]) => `${/^[a-z]+$/.test(k) ? k : q(k)}: ${q(v)}`).join(', ')} }]`);
	const lines = Object.entries(icons).map(([id, ic]) => `\t${q(id)}: { k: '${ic.k}', e: [${ic.e.map(entry).join(', ')}] }`);
	return `/* JPKCom Desktop — Tabler icon subset (generated) — © Jean Pierre Kolb — MIT License

   GENERATED by tools/build-icons.mjs from @tabler/icons ${version} — do not edit by hand;
   run \`npm run icons\` after adding or removing an icon id.

   Tabler Icons — MIT License — Copyright (c) 2020-2026 Paweł Kuna — https://tabler.io/icons

   Format: id → { k, e }
     k  'o' outline (stroke = currentColor, fill none) or 'f' filled (fill = currentColor)
     e  elements: a string is a <path d="…">, [tag, attrs] anything else
   viewBox is always 0 0 24 24. */

export default {
${lines.join(',\n')}
};
`;
}

const ids = collect();
if (args.has('--list')) {
	for (const [id, file] of ids) console.log(`${id}\t${file}`);
	process.exit(0);
}
const text = render(build(ids));
if (args.has('--check')) {
	const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
	if (current !== text) {
		console.error('src/icons/tabler.js is out of date — run: npm run icons');
		process.exit(1);
	}
	console.log(`src/icons/tabler.js is up to date (${ids.size} icons).`);
} else {
	writeFileSync(OUT, text);
	console.log(`Wrote src/icons/tabler.js with ${ids.size} icon(s).`);
}
