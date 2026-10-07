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
