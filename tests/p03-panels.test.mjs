/* JPKCom Desktop — tests: panels (colour contrast, wallpaper values, trash items, backup and reset summaries, motifs, window code on demand) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	luminance, contrast, onAccent, accentRing, gradientCss, cleanWallpaper, wallpaperKey, cleanTrash, trashId, ITEM_ID,
	dateStamp, mergeById, DIRS, LEGACY_MOTIFS, brightest, wallpaperTone
} from '../src/panels/pure.js';
import { copyrightYears, legacyBackup, summarize, groupState, splitAt, nameParts, rowParts } from '../src/panels/pure-window.js';
import { BUILTIN_MOTIFS, checkMotif } from '../src/wallpapers/index.js';
import { DEFAULTS } from '../src/core/config.js';
import { ownCaches } from '../src/panels/install.js';
import { rowText } from '../src/panels/help.js';
import enHelp from '../locales/en/help.js';
import deHelp from '../locales/de/help.js';

/* ---------- Colour ---------- */

test('colour: luminance and contrast follow WCAG 2', () => {
	assert.equal(luminance('#000000'), 0);
	assert.equal(luminance('#ffffff'), 1);
	assert.equal(contrast('#ffffff', '#000000'), 21);
	assert.equal(contrast('#000000', '#ffffff'), 21, 'order does not matter');
	assert.equal(contrast('#fff', '#000'), 21, 'short hex works');
	assert.ok(Math.abs(contrast('#ffffff', '#3571c0') - 4.9) < 0.1, 'blue accent ≈ 4.9:1 with white');
});

test('colour: accentRing — focus rings and selection marks reach 3:1 on the window background', () => {
	const LIGHT = '#fbfbfc';
	const DARK = '#18212a';
	assert.ok(contrast('#ffd400', LIGHT) < 1.6, 'the reported case: a light custom accent on white');
	for (const bg of [LIGHT, DARK]) {
		for (const hex of ['#ffd400', '#ffffff', '#000000', '#3571c0', '#7f7f7f', '#0a0a2a', '#f0f0f0', ...Object.values(DEFAULTS.theme.accents)]) {
			const ring = accentRing(hex, bg);
			assert.match(ring, /^#[0-9a-f]{6}$/, `${hex} on ${bg}`);
			assert.ok(contrast(ring, bg) >= 3, `${hex} on ${bg} → ${ring} (${contrast(ring, bg).toFixed(2)})`);
		}
	}
	assert.equal(accentRing('#3571c0', LIGHT), '#3571c0', 'an accent that already reaches 3:1 stays as it is');
	assert.ok(luminance(accentRing('#ffd400', LIGHT)) < luminance('#ffd400'), 'light background: darker');
	assert.ok(luminance(accentRing('#0a0a2a', DARK)) > luminance('#0a0a2a'), 'dark background: lighter');
	assert.equal(accentRing('nope', LIGHT), null);
});

test('colour: text on an accent is white or black, whichever reads better', () => {
	for (const hex of Object.values(DEFAULTS.theme.accents)) assert.equal(onAccent(hex), '#fff', `${hex} keeps white text`);
	assert.equal(onAccent('#ffeb3b'), '#000', 'yellow gets black text');
	assert.equal(onAccent('#f0f0f0'), '#000');
	assert.equal(onAccent('nonsense'), '#fff', 'invalid → the default');
	/* the better of black and white always clears AA for normal text */
	for (const hex of ['#777777', '#7f7f7f', '#808080', '#ff0000', '#00aaff', '#5a5a5a']) {
		assert.ok(contrast(onAccent(hex), hex) >= 4.5, hex);
	}
});

/* ---------- Wallpaper ---------- */

test('wallpaper: values are cleaned, anything else is rejected', () => {
	assert.deepEqual(cleanWallpaper({ type: 'color', color: '#ABCDEF' }), { type: 'color', color: '#abcdef' });
	assert.deepEqual(cleanWallpaper({ type: 'gradient', from: '#000000', to: '#FFFFFF', dir: 'diag', extra: 1 }),
		{ type: 'gradient', from: '#000000', to: '#ffffff', dir: 'diag' });
	assert.equal(cleanWallpaper({ type: 'gradient', from: '#000000', to: '#ffffff', dir: 'spiral' }), null);
	assert.equal(cleanWallpaper({ type: 'color', color: 'red' }), null);
	assert.equal(cleanWallpaper({ type: 'color', color: 'url(x)' }), null);
	assert.equal(cleanWallpaper({ type: 'svg', id: '<script>' }), null);
	assert.equal(cleanWallpaper(null), null);
	assert.equal(cleanWallpaper('waves'), null);
	assert.equal(cleanWallpaper([]), null);
});

test('wallpaper: motifs and pictures must be known', () => {
	const known = { motif: id => id === 'waves', image: id => id === 'cube' };
	assert.deepEqual(cleanWallpaper({ type: 'svg', id: 'waves' }, known), { type: 'svg', id: 'waves' });
	assert.equal(cleanWallpaper({ type: 'svg', id: 'dunes' }, known), null);
	assert.deepEqual(cleanWallpaper({ type: 'image', id: 'cube' }, known), { type: 'image', id: 'cube' });
	assert.equal(cleanWallpaper({ type: 'image', id: 'other' }, known), null);
});

test('wallpaper: keys and gradients', () => {
	assert.equal(wallpaperKey({ type: 'svg', id: 'waves' }), 'svg:waves');
	assert.equal(wallpaperKey({ type: 'color', color: '#112233' }), 'color:#112233');
	assert.equal(wallpaperKey({ type: 'gradient', from: '#000000', to: '#ffffff', dir: 'glow' }), 'gradient:#000000:#ffffff:glow');
	assert.equal(wallpaperKey({ type: 'image', id: 'cube' }), 'image:cube');
	assert.deepEqual([...DIRS], ['glow', 'down', 'diag', 'radial']);
	/* glow reproduces the page background of base.css */
	assert.match(gradientCss('glow', '#3c4955', '#0c1925'), /^radial-gradient\(120% 90% at 50% 0%, #3c4955 0%, color-mix\(in srgb, #3c4955 33\.3%, #0c1925\) 55%, #0c1925 100%\)$/);
	assert.equal(gradientCss('down', '#000000', '#ffffff'), 'linear-gradient(180deg, #000000, #ffffff)');
	assert.equal(gradientCss('diag', '#000000', '#ffffff'), 'linear-gradient(135deg, #000000, #ffffff)');
	assert.match(gradientCss('radial', '#000000', '#ffffff'), /^radial-gradient\(120% 120% at 30% 20%/);
});

test('wallpaper: built-in motifs match the configured list and the motif contract', () => {
	const ids = BUILTIN_MOTIFS.map(m => m.id);
	assert.deepEqual([...ids].sort(), [...DEFAULTS.wallpaper.motifs].sort(), 'every default motif id has a builder');
	for (const m of BUILTIN_MOTIFS) {
		const c = checkMotif(m);
		assert.ok(c, m.id);
		assert.equal(typeof c.build, 'function');
		assert.ok(typeof c.name === 'string' && c.name.startsWith('@wallpaper.motif.'), `${m.id} is named through the locale`);
	}
	assert.equal(BUILTIN_MOTIFS.filter(m => m.heavy).map(m => m.id).join(), 'aurora', 'aurora is the heavy one');
});

test('wallpaper: checkMotif rejects broken definitions', () => {
	const warnings = [];
	const warn = m => warnings.push(m);
	assert.equal(checkMotif(null, warn), null);
	assert.equal(checkMotif({ id: 'Bad Id', build() {} }, warn), null);
	assert.equal(checkMotif({ id: 'nobuild' }, warn), null);
	assert.equal(warnings.length, 3);
	const ok = checkMotif({ id: 'mine', build() {}, name: { en: 'Mine', de: 'Meins' } }, warn);
	assert.equal(ok.bg, '#000');
	assert.equal(ok.heavy, false);
	assert.equal(ok.available(), true);
	assert.ok(Object.isFrozen(ok));
	assert.equal(checkMotif({ id: 'x', build() {}, name: 42 }).name, 'x', 'a missing name falls back to the id');
});

/* ---------- Trash ---------- */

const NOW = Date.UTC(2026, 9, 6, 12);
const item = (over = {}) => ({ id: 'abc123', type: 'note', title: 'Hello', data: { text: 'x' }, deleted: NOW - 1000, ...over });

test('trash: well-formed, young items stay; the rest goes', () => {
	const v = { items: [
		item({ id: 'a1' }),
		item({ id: 'old', deleted: NOW - 31 * 86400000 }),
		item({ id: 'BAD ID' }),
		item({ id: 'a2', type: 'Not-A-Type' }),
		item({ id: 'a3', data: null }),
		item({ id: 'a4', data: [1] }),
		item({ id: 'a5', title: 'x'.repeat(121) }),
		item({ id: 'a6', deleted: 'yesterday' }),
		item({ id: 'a7', deleted: NOW + 10 * 86400000 }),
		item({ id: 'a8', type: 'module-gone' }),
		null, 'x'
	] };
	const out = cleanTrash(v, { now: NOW, days: 30, max: 200 });
	assert.deepEqual(out.items.map(x => x.id), ['a1', 'a8'], 'unknown but valid types are kept');
	assert.deepEqual(Object.keys(out.items[0]).sort(), ['data', 'deleted', 'id', 'title', 'type'], 'extra fields are dropped');
});

test('trash: days and max come from the config', () => {
	const items = Array.from({ length: 10 }, (_, i) => item({ id: `i${i}`, deleted: NOW - i * 86400000 }));
	assert.equal(cleanTrash({ items }, { now: NOW, days: 5, max: 200 }).items.length, 5);
	assert.deepEqual(cleanTrash({ items }, { now: NOW, days: 30, max: 3 }).items.map(x => x.id), ['i7', 'i8', 'i9'], 'the newest pushed ones stay');
	assert.deepEqual(cleanTrash(null, { now: NOW }), { items: [] });
	assert.deepEqual(cleanTrash({ items: 'no' }, { now: NOW }), { items: [] });
});

test('trash: item ids are short and storage-safe', () => {
	assert.match(trashId(NOW, 0.123456789), ITEM_ID);
	assert.match(trashId(NOW, 0), ITEM_ID);
	assert.notEqual(trashId(NOW, 0.1), trashId(NOW, 0.2));
});

/* ---------- About ---------- */

test('about: copyright years', () => {
	assert.equal(copyrightYears(2026, 2026), '2026');
	assert.equal(copyrightYears(1996, 2026), '1996–2026');
	assert.equal(copyrightYears(2030, 2026), '2026', 'a future start year is ignored');
	assert.equal(copyrightYears(null, 2026), '2026');
});

/* ---------- Backup ---------- */

test('backup: documents of the original desktop lose their key prefix', () => {
	const known = new Set(['notes', 'theme', 'wallpaper']);
	const doc = { format: 'f', data: { 'jpkdesk-notes': { notes: [] }, 'jpkdesk-theme': 'light', 'jpkdesk-unknown': 1, wallpaper: { type: 'color', color: '#000000' }, 'jpkdesk-wallpaper': { type: 'svg', id: 'waves' } } };
	const out = legacyBackup(doc, 'jpkdesk-', n => known.has(n));
	assert.deepEqual(Object.keys(out.data).sort(), ['jpkdesk-unknown', 'jpkdesk-wallpaper', 'notes', 'theme', 'wallpaper']);
	assert.deepEqual(out.data.wallpaper, { type: 'color', color: '#000000' }, 'a plain name in the file wins');
	assert.equal(out.format, 'f');
	assert.equal(legacyBackup(null, 'x-', () => true), null);
	assert.equal(legacyBackup({ data: 'x' }, 'x-', () => true).data, 'x');
});

test('backup: file date stamp', () => {
	assert.equal(dateStamp(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('backup: summaries per group (current state and import preview)', () => {
	const groups = [
		{ id: 'settings', label: 'Settings', keys: [{ name: 'theme', label: 'Mode' }, { name: 'accent', label: 'Accent' }] },
		{ id: 'notes', label: 'Notes', keys: [{ name: 'notes', label: 'Notes', count: v => v.notes.length }] },
		{ id: 'editor', label: 'Editor', keys: [{ name: 'editor', label: 'Editor', count: v => `${v.text.length} chars` }] },
		{ id: 'broken', label: 'Broken', keys: [{ name: 'broken', label: 'Broken', count: () => { throw new Error('x'); } }] }
	];
	const data = { theme: 'light', notes: { notes: [1, 2, 3] }, editor: { text: 'hello' }, broken: {} };
	const rows = summarize(groups, data);
	assert.deepEqual(rows.map(r => r.kind), ['list', 'count', 'text', 'count']);
	assert.deepEqual(rows[0].labels, ['Mode']);
	assert.equal(rows[1].n, 3);
	assert.equal(rows[2].text, '5 chars');
	assert.equal(rows[3].n, 0, 'a throwing count() counts nothing');

	const preview = summarize(groups, { notes: { notes: [] } }, true);
	assert.deepEqual(preview.map(r => r.kept), [true, false, true, true], 'groups the file lacks stay as they are');
	assert.deepEqual(summarize(groups, {}, false).map(r => r.kept), [false, false, false, false]);
});

/* ---------- Reset ---------- */

test('reset: the state of a group', () => {
	const count = v => v.items.length;
	assert.deepEqual(groupState([]), { kind: 'none' });
	assert.deepEqual(groupState([{ stored: false }]), { kind: 'default' });
	assert.deepEqual(groupState([{ stored: false, count }]), { kind: 'empty' });
	assert.deepEqual(groupState([{ stored: true, value: { items: [] }, count }]), { kind: 'empty' });
	assert.deepEqual(groupState([{ stored: true, value: { items: [1, 2] }, count }]), { kind: 'count', n: 2 });
	assert.deepEqual(groupState([{ stored: true, value: null, count }]), { kind: 'empty' }, 'an invalid stored value counts as empty');
	assert.deepEqual(groupState([{ stored: true, value: 'x', count: () => '12 characters' }]), { kind: 'text', text: '12 characters' });
	assert.deepEqual(groupState([{ stored: true, value: 'x', backup: true }, { stored: false }]), { kind: 'custom' });
	assert.deepEqual(groupState([{ stored: true, value: {}, backup: false }]), { kind: 'stored' });
});

/* ---------- Settings ---------- */

test('settings: rows sort by order; a contribution replaces the built-in of the same id', () => {
	const out = mergeById([
		{ id: 'lang', order: 10, from: 'core' },
		{ id: 'seconds', order: 40, from: 'core' },
		{ id: 'noorder' },
		{ id: 'seconds', order: 25, from: 'clock' },
		null,
		{ order: 1 }
	]);
	assert.deepEqual(out.map(r => `${r.id}:${r.from ?? '-'}`), ['lang:core', 'seconds:clock', 'noorder:-']);
});

/* ---------- Review fixes ---------- */

test('wallpaper: the original motif ids map to their new ones (stored values, old backups)', () => {
	const listed = DEFAULTS.wallpaper.motifs;
	const known = { motif: id => listed.includes(id) };
	assert.deepEqual(cleanWallpaper({ type: 'svg', id: 'monogram' }, known), { type: 'svg', id: 'author-monogram' });
	assert.deepEqual(cleanWallpaper({ type: 'svg', id: 'emblem' }, known), { type: 'svg', id: 'author-emblem' });
	assert.deepEqual(cleanWallpaper({ type: 'svg', id: 'blueprint' }, known), { type: 'svg', id: 'author-blueprint' });
	for (const id of Object.values(LEGACY_MOTIFS)) assert.ok(listed.includes(id), `${id} is a default motif`);
	assert.deepEqual(cleanWallpaper({ type: 'svg', id: 'waves' }, known), { type: 'svg', id: 'waves' }, 'current ids stay');
	assert.equal(cleanWallpaper({ type: 'svg', id: 'monogram' }, { motif: () => false }), null, 'still checked against what is offered');
	assert.equal(cleanWallpaper({ type: 'svg', id: 'constructor' }, known), null, 'no prototype lookups');
});

test('texts: splitAt puts a marker where the placeholder was, the sentence stays whole', () => {
	const M = Symbol('name');
	assert.deepEqual(splitAt('© 1996–2026 \uE000', '\uE000', M), ['© 1996–2026 ', M]);
	assert.deepEqual(splitAt('\uE000 hat es gemacht', '\uE000', M), [M, ' hat es gemacht']);
	assert.deepEqual(splitAt('A by \uE000, really \uE000.', '\uE000', M), ['A by ', M, ', really ', M, '.']);
	assert.deepEqual(splitAt('no placeholder', '\uE000', M), ['no placeholder']);
});

test('texts: nameParts accepts a name or its parts with languages', () => {
	assert.deepEqual(nameParts('Jean Pierre Kolb'), [{ text: 'Jean Pierre Kolb', lang: null }]);
	assert.deepEqual(nameParts([{ text: 'Jean Pierre', lang: 'fr' }, { text: 'Kolb', lang: 'de' }]),
		[{ text: 'Jean Pierre', lang: 'fr' }, { text: 'Kolb', lang: 'de' }]);
	assert.deepEqual(nameParts(['Ada', { text: 'Lovelace', lang: 'en-GB' }]), [{ text: 'Ada', lang: null }, { text: 'Lovelace', lang: 'en-GB' }]);
	assert.deepEqual(nameParts([{ text: 'X', lang: 'not a lang!' }]), [{ text: 'X', lang: null }], 'invalid lang dropped');
	assert.equal(nameParts(''), null);
	assert.equal(nameParts([]), null);
	assert.equal(nameParts([{ lang: 'fr' }, 3, null]), null);
	assert.equal(nameParts(42), null);
});

test('wallpaper: tone — light where white text falls below 4.5:1, a gradient by its brighter end', () => {
	assert.equal(wallpaperTone({ type: 'color', color: '#ffffff' }), 'light');
	assert.equal(wallpaperTone({ type: 'color', color: '#e8e8e8' }), 'light');
	assert.equal(wallpaperTone({ type: 'color', color: '#1d2025' }), 'dark');
	assert.equal(wallpaperTone({ type: 'gradient', from: '#3c4955', to: '#0c1925', dir: 'glow' }), 'dark', 'the default stays dark');
	assert.equal(wallpaperTone({ type: 'gradient', from: '#f28c6b', to: '#4b2c7a', dir: 'down' }), 'light', 'Sunset: light at the top');
	assert.equal(wallpaperTone({ type: 'gradient', from: '#0b1a33', to: '#f28c6b', dir: 'diag' }), 'light', 'the bright end may be either one');
	assert.equal(wallpaperTone({ type: 'svg', id: 'x' }, { motif: { bg: 'linear-gradient(180deg, #f6c0a0 0%, #25234a 100%)' } }), 'light');
	assert.equal(wallpaperTone({ type: 'svg', id: 'x' }, { motif: { bg: '#f6c0a0', tone: 'dark' } }), 'dark', 'an own tone wins');
	assert.equal(wallpaperTone({ type: 'svg', id: 'x' }, { motif: { bg: 'rgb(255 255 255)' } }), 'dark', 'no #hex colour: dark');
	assert.equal(wallpaperTone({ type: 'image', id: 'x' }, { image: { tone: 'light' } }), 'light');
	assert.equal(wallpaperTone({ type: 'image', id: 'x' }, { image: { tone: 'pale' } }), 'dark');
	assert.equal(wallpaperTone(null), 'dark');
	assert.equal(brightest('#000 #fff'), 1);
	assert.equal(brightest('#ffffff80'), null, '8-digit hex is not read');
	for (const m of BUILTIN_MOTIFS) assert.ok(['light', 'dark'].includes(wallpaperTone({ type: 'svg', id: m.id }, { motif: checkMotif(m) })));
});

test('about: rowParts accepts a text or parts with lang and abbr, nothing half-valid', () => {
	assert.deepEqual(rowParts('Plain'), [{ text: 'Plain', lang: null, abbr: null }]);
	assert.deepEqual(rowParts({ en: 'A', de: 'B' }), [{ text: { en: 'A', de: 'B' }, lang: null, abbr: null }]);
	assert.deepEqual(rowParts([{ text: 'HTML', abbr: 'Hypertext Markup Language' }, ', ', { text: 'Vanilla JavaScript', lang: 'en' }]), [
		{ text: 'HTML', lang: null, abbr: 'Hypertext Markup Language' },
		{ text: ', ', lang: null, abbr: null },
		{ text: 'Vanilla JavaScript', lang: 'en', abbr: null }
	]);
	assert.equal(rowParts([{ text: 'x', lang: 'not a tag!' }]), null);
	assert.equal(rowParts([{ text: 'x', abbr: 3 }]), null);
	assert.equal(rowParts([{ text: '' }]), null);
	assert.equal(rowParts([]), null);
	assert.equal(rowParts({ text: 'x', lang: 'en' }), null, 'a single part is not a language map');
	assert.equal(rowParts(42), null);
});

test('install: ownCaches matches the service worker\'s cache names of this folder only', () => {
	const sub = ownCaches('https://example.com/desk/');
	assert.ok(sub.test('jpkdesk:/desk/:1.0.0-0123abcd'));
	assert.ok(sub.test('other:/desk/:pages'), 'whatever the namespace');
	assert.ok(!sub.test('jpkdesk:/:pages'), 'the desktop at the root');
	assert.ok(!sub.test('jpkdesk-x'), 'an old prefix scheme');
	assert.ok(!sub.test('jpkdesk:/desk/sub/:pages'), 'a deeper folder');
	assert.ok(!sub.test('jpkdesk:/desk/:1.0.0'), 'no hash');
	const root = ownCaches('https://example.com/');
	assert.ok(root.test('jpkdesk:/:pages'));
	assert.ok(root.test('jpkdesk:/:1.2.0-beta.1-ffffffff'));
	assert.ok(!root.test('jpkdesk:/desk/:pages'), 'a root install leaves the sub-folder desktop alone');
	assert.ok(!root.test('jpkdesk:/desk/:1.0.0-0123abcd'));
	assert.ok(!root.test('jpkdesk-x'));
	assert.ok(ownCaches('https://example.com/a.b+c/').test('ns:/a.b+c/:pages'), 'special characters are escaped');
	assert.ok(!ownCaches('https://example.com/a.b/').test('ns:/axb/:pages'));
});

test('help: the search row names its shortcut, or says nothing about keys without one', () => {
	assert.deepEqual(rowText('search', 'Ctrl+K'), ['help.searchText', { keys: 'Ctrl+K' }]);
	assert.deepEqual(rowText('search', null), ['help.searchTextNoKeys', {}]);
	assert.deepEqual(rowText('move', 'Ctrl+K'), ['help.moveText', {}]);
	for (const strings of [enHelp, deHelp]) {
		assert.ok(strings.searchText.includes('{keys}'));
		assert.ok(strings.searchTextNoKeys && !strings.searchTextNoKeys.includes('{keys}'));
	}
});

/* ---------- Window code on demand ---------- */

const PANELS = new URL('../src/panels/', import.meta.url);
const source = file => readFileSync(new URL(file, PANELS), 'utf8');
/* Static imports of a panels file (relative ones inside src/panels/) */
const staticImports = file => [...source(file).matchAll(/^import\s[^;]*?from\s+'\.\/([^']+)'/gm)].map(m => m[1]);

test('panels: the boot does not import the window files; each panel app loads its own', () => {
	const WINDOWS = ['settings-window.js', 'wallpaper-window.js', 'trash-window.js', 'backup-window.js', 'about.js', 'help.js', 'pure-window.js'];
	/* Everything index.js reaches through static imports */
	const seen = new Set();
	const walk = file => {
		if (seen.has(file)) return;
		seen.add(file);
		for (const dep of staticImports(file)) walk(dep);
	};
	walk('index.js');
	for (const w of WINDOWS) assert.ok(!seen.has(w), `${w} is not in the boot (reached: ${[...seen].join(', ')})`);

	/* The loads are literal import('./…') calls (the service worker and the preload list read the source) */
	const index = source('index.js');
	for (const [app, file] of [['about-desktop', 'about.js'], ['settings', 'settings-window.js'], ['wallpaper', 'wallpaper-window.js'],
		['backup', 'backup-window.js'], ['trash', 'trash-window.js'], ['help', 'help.js']]) {
		assert.match(index, new RegExp(`id: '${app}'[^\\n]*load: \\(\\) => import\\('\\./${file.replace('.', '\\.')}'\\)`), `${app} loads ${file}`);
	}
	assert.match(index, /windowStyles: \['settings\.css', 'wallpaper\.css', 'panels\.css'\]/);
	assert.doesNotMatch(index, /^\s*styles:/m, 'no panel sheet in the boot');
});
