/* JPKCom Desktop — tests: theme tokens (families, aliases, definitions, no literals, docs, theme file) — © Jean Pierre Kolb — MIT License */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
/* CSS without comments */
export const readCss = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ');
/* Every CSS file of the desktop: src/**, site/modules/**, site/theme.css — not site/content (page styles) */
export function cssFiles() {
	const out = [];
	const walk = dir => {
		if (!existsSync(join(ROOT, dir))) return;
		for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
			const rel = `${dir}/${e.name}`;
			if (e.isDirectory()) walk(rel);
			else if (rel.endsWith('.css')) out.push(rel);
		}
	};
	walk('src');
	walk('site/modules');
	if (existsSync(join(ROOT, 'site/theme.css'))) out.push('site/theme.css');
	return out.sort();
}
/* Custom properties declared in a CSS text → Map name → [values] */
export function declared(css) {
	const m = new Map();
	for (const x of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
		if (!m.has(x[1])) m.set(x[1], []);
		m.get(x[1]).push(x[2].trim());
	}
	return m;
}

const FAMILIES = {
	'--radius-panel': '12px', '--radius-item': '8px', '--radius-field': '7px', '--radius-control': '6px',
	'--radius-control-sm': '5px', '--radius-small': '4px', '--radius-mark': '3px', '--radius-hair': '2px',
	'--radius-pill': '999px', '--radius-round': '50%', '--radius-win': '12px', '--radius-menu': '8px',
	'--glass-backdrop': 'blur(30px) saturate(1.8)', '--chrome-backdrop': 'blur(24px) saturate(1.6)'
};
const SHADOW_FAMILIES = ['--shadow-hairline', '--shadow-control-edge', '--shadow-pressed', '--ring-focus', '--ring-selected', '--shadow-popup', '--shadow-popover'];

test('theming: every family token exists with today\'s value', () => {
	const d = declared(readCss('src/css/tokens.css'));
	for (const [name, value] of Object.entries(FAMILIES)) assert.equal(d.get(name)?.[0], value, name);
	for (const name of SHADOW_FAMILIES) assert.ok(d.has(name), name);
	assert.deepEqual(d.get('--radius-dock'), ['20px', '18px'], '--radius-dock: 20px, 18px on body.compact');
});

test('theming: every alias points to a declared family', () => {
	const d = declared(readCss('src/css/tokens.css'));
	const families = new Set([...Object.keys(FAMILIES), ...SHADOW_FAMILIES]);
	let aliases = 0;
	for (const [name, values] of d) {
		for (const v of values) {
			const m = /^var\((--(?:radius|shadow|ring)[a-z0-9-]*|--(?:glass|chrome)-backdrop)\)$/.exec(v);
			if (!m) continue;
			aliases++;
			assert.ok(families.has(m[1]), `${name} aliases ${m[1]}, which is not a family`);
			assert.ok(d.has(m[1]), `${name} → ${m[1]} is declared`);
		}
	}
	assert.ok(aliases >= 50, `expected the part aliases (found ${aliases})`);
});

/* Properties set from JS (CSSOM) — known although no CSS file declares them */
const JS_SET = new Set(['--accent', '--on-accent', '--accent-ring', '--wallpaper-from', '--wallpaper-to', '--anim', '--c', '--tint']);
const JS_PREFIX = ['--accent-', '--t-'];

test('theming: every var(--x) without fallback in the desktop CSS is declared somewhere', () => {
	const all = new Set(JS_SET);
	const files = cssFiles();
	for (const f of files) for (const n of declared(readCss(f)).keys()) all.add(n);
	/* names JS sets with setProperty('--x') or style: { '--x': … } */
	const walkJs = dir => {
		for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
			const rel = `${dir}/${e.name}`;
			if (e.isDirectory()) walkJs(rel);
			else if (rel.endsWith('.js')) {
				const js = read(rel);
				for (const m of js.matchAll(/setProperty\(\s*['"`](--[a-z0-9-]+)['"`]/g)) all.add(m[1]);
				for (const m of js.matchAll(/['"](--[a-z0-9-]+)['"]\s*:/g)) all.add(m[1]);
			}
		}
	};
	walkJs('src');
	const missing = [];
	for (const f of files) {
		for (const m of readCss(f).matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
			if (m[2] === ',') continue; // has a fallback
			if (all.has(m[1]) || JS_PREFIX.some(p => m[1].startsWith(p))) continue;
			missing.push(`${f}: ${m[1]}`);
		}
	}
	assert.deepEqual(missing, []);
});

/* Structural literals that stay (spec §2.3, appendix B "Kept literal"): file, property, value, reason */
export const EXCEPTIONS = [
	['src/wm/wm.css', 'border-radius', '0', 'maximised window, title bar and body flush with the screen edge'],
	['src/shell/menus.css', 'border-radius', '0', 'compact inline submenu resets the .menu box'],
	['src/shell/notifications.css', 'border-radius', 'inherit', 'follows .notif'],
	['src/wm/wm.css', 'border-radius', '50%', 'spinner ring geometry'],
	['src/shell/dock.css', 'border-radius', '50%', 'running-app status dot'],
	['src/modules/notify/notify.css', 'border-radius', '50%', 'status dot'],
	['src/apps/editor/editor.css', 'border-radius', '50%', 'status dot'],
	['src/shell/notifications.css', 'border-radius', '50%', 'invisible 44px hit areas'],
	['src/apps/editor/editor.css', 'border-radius', '1px', 'glyph geometry of a 2px bar'],
	['src/panels/panels.css', 'border-radius', '21%', 'brand logo shape (brand asset, SVG draws the same clip)']
];

/* Declarations of a property family outside tokens.css that are neither var(…) nor an exception → ['file: prop: value'] */
export function literals(props) {
	const re = new RegExp(`(?:^|[;{\\s])(${props.join('|')})\\s*:\\s*([^;{}]+);`, 'g');
	const bad = [];
	for (const f of cssFiles()) {
		if (f === 'src/css/tokens.css') continue;
		for (const m of readCss(f).matchAll(re)) {
			const value = m[2].trim();
			if (/var\(/.test(value)) continue;
			if (EXCEPTIONS.some(([ef, ep, ev]) => ef === f && ep === m[1].replace(/^-webkit-/, '') && ev === value)) continue;
			bad.push(`${f}: ${m[1]}: ${value}`);
		}
	}
	return bad;
}

test('theming: border-radius outside tokens.css only via tokens (or a documented exception)', () => {
	assert.deepEqual(literals(['border-radius', 'border-(?:top|bottom)-(?:left|right)-radius', 'border-(?:start|end)-(?:start|end)-radius']), []);
});

EXCEPTIONS.push(
	['src/shell/menus.css', 'backdrop-filter', 'none', 'compact inline submenu resets the .menu glass']
);

test('theming: backdrop-filter outside tokens.css only via tokens (or a documented exception)', () => {
	assert.deepEqual(literals(['backdrop-filter', '-webkit-backdrop-filter']), []);
});

test('theming: the three colours that do not follow --shade are tokens', () => {
	assert.match(readCss('src/shell/menubar.css'), /var\(--menubar-dim\)/);
	assert.match(readCss('src/shell/desktop-icons.css'), /var\(--icon-label-plate\)/);
	assert.doesNotMatch(readCss('src/shell/menubar.css'), /rgb\(0 0 0 \/ 0\.35\)/);
	assert.doesNotMatch(readCss('src/shell/desktop-icons.css'), /rgb\(0 0 0 \/ 0\.55\)/);
});

EXCEPTIONS.push(
	['src/wm/wm.css', 'box-shadow', 'none', 'structural reset'],
	['src/modules/catalog/catalog.css', 'box-shadow', 'none', 'structural reset'],
	['src/panels/settings.css', 'box-shadow', 'none', 'structural reset'],
	['src/shell/menus.css', 'box-shadow', 'none', 'structural reset (tile, compact inline submenu)'],
	['src/apps/terminal/terminal.css', 'box-shadow', 'none', 'structural reset'],
	['src/modules/calendar/calendar.css', 'box-shadow', 'none', 'structural reset'],
	['src/css/components.css', 'box-shadow', 'none', 'forced colours'],
	['src/panels/wallpaper.css', 'box-shadow', 'none', 'forced colours (forced-color-adjust: none swatch)'],
	['src/shell/desktop-icons.css', 'text-shadow', 'none', 'reset'],
	['src/shell/launcher.css', 'text-shadow', 'none', 'reset, conditional on the theme']
);

test('theming: shadows and rings outside tokens.css only via tokens (or a documented exception)', () => {
	assert.deepEqual(literals(['box-shadow', 'text-shadow']), []);
	const drop = [];
	for (const f of cssFiles()) {
		if (f === 'src/css/tokens.css') continue;
		for (const m of readCss(f).matchAll(/filter\s*:\s*([^;{}]*drop-shadow[^;{}]*);/g)) if (!/^var\(/.test(m[1].trim())) drop.push(`${f}: ${m[1].trim()}`);
	}
	assert.deepEqual(drop, []);
});

/* literals() lets any value containing var(…) pass; shadows must be a pure token list, bar the kept per-element sites */
test('theming: box-shadow/text-shadow values are token references only', () => {
	const kept = new Set([
		'src/css/components.css: 0 0 0 2px var(--win-bg), 0 0 0 4px var(--c)',
		'src/css/components.css: var(--tile-shadow-sm)'
	]);
	const bad = [];
	for (const f of cssFiles()) {
		if (f === 'src/css/tokens.css') continue;
		for (const m of readCss(f).matchAll(/(?:^|[;{\s])(?:box|text)-shadow\s*:\s*([^;{}]+);/g)) {
			const v = m[1].trim();
			if (/^var\(--[a-z0-9-]+\)(,\s*var\(--[a-z0-9-]+\))*$/.test(v) || v === 'none') continue;
			if (/^inset 0 0 0 1px var\(--wc-ring, /.test(v) || kept.has(`${f}: ${v}`)) continue;
			bad.push(`${f}: ${v}`);
		}
	}
	assert.deepEqual(bad, []);
});

test('theming: site/theme.css is linked after the core CSS, kept offline, and ships without rules', () => {
	const html = read('index.html');
	const core = html.indexOf('src/css/components.css');
	const theme = html.indexOf('href="site/theme.css"');
	assert.ok(core > 0 && theme > core, 'index.html links site/theme.css after src/css/components.css');
	assert.ok(theme < html.indexOf('site/config.js'), 'before site/config.js');
	assert.match(read('sw.js'), /['"]site\/theme\.css['"]/, 'sw.js keeps it as a shell file');
	const rules = readCss('site/theme.css').replace(/\s+/g, '');
	assert.equal(rules, '', 'the shipped theme has comments only');
	assert.match(read('site/theme.css'), /@layer themes/, 'the example shows @layer themes');
});
