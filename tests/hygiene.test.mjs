/* JPKCom Desktop — tests: source hygiene (no invisible bidi or zero-width characters) — © Jean Pierre Kolb — MIT License

   Bidi controls and zero-width characters are invisible in an editor and in a
   review, yet change what code means (a regex, a string compare, an id). Tool
   input that decodes \uXXXX escapes once let one slip into a regex; this walks
   every text file of the project and reports each one as file:line:column.
   Write such characters as escapes (\u200B) where they are meant. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'locales', 'tests', 'site', 'tools'];
const FILES = ['index.html', 'sw.js'];
const SKIP_DIRS = new Set(['node_modules', '.git']);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf',
	'.bin', '.wasm', '.pdf', '.zip', '.gz', '.br', '.mp3', '.mp4', '.ogg', '.oga', '.webm', '.wav', '.flac', '.m4a', '.pf_meta',
	'.pf_index', '.pf_fragment', '.pagefind']);

/* LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, ZWSP/ZWNJ/ZWJ/LRM/RLM, BOM */
const INVISIBLE = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g;

function* walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		const path = join(dir, e.name);
		if (e.isDirectory()) {
			if (!SKIP_DIRS.has(e.name)) yield* walk(path);
		} else if (e.isFile() && !BINARY.has(extname(e.name).toLowerCase())) {
			yield path;
		}
	}
}

function files() {
	const out = [];
	for (const d of DIRS) out.push(...walk(join(ROOT, d)));
	for (const f of FILES) {
		const path = join(ROOT, f);
		try {
			if (statSync(path).isFile()) out.push(path);
		} catch { /* not shipped */ }
	}
	return out;
}

test('hygiene: no bidi controls or zero-width characters in the sources', () => {
	const found = [];
	const list = files();
	assert.ok(list.length > 50, `walked ${list.length} files`);
	for (const path of list) {
		const buf = readFileSync(path);
		if (buf.includes(0)) continue; // binary content under a text-like name
		const lines = buf.toString('utf8').split('\n');
		lines.forEach((line, i) => {
			for (const m of line.matchAll(INVISIBLE)) {
				const code = m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
				found.push(`${relative(ROOT, path)}:${i + 1}:${m.index + 1} U+${code}`);
			}
		});
	}
	assert.deepEqual(found, [], `invisible characters found:\n  ${found.join('\n  ')}`);
});
