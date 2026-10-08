#!/usr/bin/env node
/* JPKCom Desktop — preload hints builder (module graph → src/boot/preload.js) — © Jean Pierre Kolb — MIT License

   Native ES modules load level by level: the browser sees the imports of a file
   only once it has that file, so a chain of eleven imports costs eleven round
   trips before the first line runs. This tool reads the static import graph of
   the boot (src/boot/main.js), of the core parts and of every module and app in
   src/ and writes it to src/boot/preload.js — a classic script in index.html
   that, before main.js runs, asks the browser for every file the configured
   desktop will need at once:

     <link rel="modulepreload">        the JavaScript of the boot and of each configured part
                                       (static imports only — window code behind load() and
                                       other dynamic imports stays out, it loads on demand)
     <link rel="preload" as="style">   the descriptors' styles: [...] (not windowStyles)
     <link rel="modulepreload">        locales/<lang>/_meta.js of every offered language and the
                                       namespaces (i18n: [...]) of the configured parts for the
                                       language the desktop will most likely start in

   Site modules in site/modules/<id>/index.js are read the same way and matched by
   their src ({ id, src: 'site/modules/<id>/index.js' }); a site module elsewhere
   gets a hint for its entry file only. Added or changed a site module? Run
   `npm run preload` again.

   The file is committed (no build step for the desktop) and checked in CI. A stale
   file costs speed, never correctness: hints are only hints.

   Usage
     node tools/build-preload.mjs            write src/boot/preload.js
     node tools/build-preload.mjs --check    exit 1 if the file is out of date (CI)

   Zero dependencies (Node ≥ 24). */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../src/core/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/boot/preload.js');
const CORE_PARTS = ['wm', 'shell', 'panels'];

const rel = file => relative(ROOT, file).split('\\').join('/');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const strings = text => [...text.matchAll(/(['"])([^'"\n]{1,256}?)\1/g)].map(m => m[2]);

/** Static imports and re-exports of a file (relative specifiers only), as root-relative paths */
function staticImports(path) {
	const text = read(path);
	const out = [];
	for (const m of text.matchAll(/^[ \t]*(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?(['"])(\.{1,2}\/[^'"\n]+?)\1/gm)) {
		out.push(posix.normalize(posix.join(posix.dirname(path), m[2])));
	}
	return out;
}

/** Every file a module needs before it runs (itself first, then depth first) */
function closure(entry, seen = new Set()) {
	if (seen.has(entry)) return seen;
	if (!existsSync(join(ROOT, entry))) throw new Error(`${entry}: imported but missing`);
	seen.add(entry);
	for (const dep of staticImports(entry)) closure(dep, seen);
	return seen;
}

/** A descriptor's styles: [...] (relative to it) and i18n: [...]; own: the folder of its own locales (field locales) */
function descriptorParts(entry) {
	const text = read(entry);
	const dir = posix.dirname(entry);
	const css = [];
	for (const m of text.matchAll(/(?<![A-Za-z])styles\s*:\s*\[([^\]]*)\]/g)) {
		css.push(...strings(m[1]).map(s => posix.normalize(posix.join(dir, s))));
	}
	const i18n = [];
	for (const m of text.matchAll(/\bi18n\s*:\s*\[([^\]]*)\]/g)) i18n.push(...strings(m[1]).filter(s => /^[a-z][a-z0-9-]*$/.test(s)));
	const own = text.match(/\blocales\s*:\s*(['"])([^'"\n]{1,256}?)\1/);
	/* the rule of src/core/modules.js localesDir: relative, ends in '/', inside the module's folder */
	const ownDir = own && own[2].endsWith('/') && !/^[a-z][a-z0-9+.-]*:|^\/|\\|\.\./i.test(own[2]) ? posix.join(dir, own[2]) : null;
	return { css: [...new Set(css)], i18n: [...new Set(i18n)], ...(own ? { own: ownDir } : {}) };
}

const dirs = base => readdirSync(join(ROOT, base), { withFileTypes: true })
	.filter(d => d.isDirectory() && existsSync(join(ROOT, base, d.name, 'index.js')))
	.map(d => d.name).sort();

export function buildGraph() {
	const files = [];
	const index = path => {
		let i = files.indexOf(path);
		if (i < 0) i = files.push(path) - 1;
		return i;
	};
	const boot = [...closure('src/boot/main.js')];
	boot.forEach(index);
	const part = entry => {
		const { css, i18n, own } = descriptorParts(entry);
		/* files the boot already brings are left out: each hint once */
		const js = [...closure(entry)].filter(f => !boot.includes(f)).map(index);
		if (own === null) return { js, css: css.map(index), i18n: [] };
		return { js, css: css.map(index), i18n, ...(own ? { own } : {}) };
	};
	const graph = { boot: boot.map(index), core: {}, module: {}, app: {}, site: {} };
	for (const id of CORE_PARTS) graph.core[id] = part(`src/${id}/index.js`);
	for (const id of dirs('src/modules')) graph.module[id] = part(`src/modules/${id}/index.js`);
	for (const id of dirs('src/apps')) graph.app[id] = part(`src/apps/${id}/index.js`);
	if (existsSync(join(ROOT, 'site/modules'))) {
		for (const id of dirs('site/modules')) graph.site[`site/modules/${id}/index.js`] = part(`site/modules/${id}/index.js`);
	}
	return { files, ...graph };
}

function render(graph) {
	const defaults = {
		namespace: DEFAULTS.namespace,
		languages: DEFAULTS.languages,
		defaultLang: DEFAULTS.defaultLang,
		modules: DEFAULTS.modules,
		apps: DEFAULTS.apps,
		siteData: DEFAULTS.site.data
	};
	const json = v => JSON.stringify(v);
	const parts = kind => Object.entries(graph[kind]).map(([id, p]) => `\t\t\t${json(id)}: ${json(p)}`).join(',\n');
	return `/* JPKCom Desktop — preload hints for the boot (generated) — © Jean Pierre Kolb — MIT License

   GENERATED by tools/build-preload.mjs — do not edit by hand; run \`npm run preload\` after
   changing an import, a descriptor's styles or i18n, or adding a module or app.

   A classic script in <head> after site/config.js: before main.js runs, it asks the browser
   for every file the configured desktop needs to start — all at once instead of one import
   level after the other (see the tool for the details). Hints only: a file the desktop does
   not need after all costs one request, a missing hint costs nothing but speed. */

(() => {
	'use strict';

	const G = {
		files: ${json(graph.files)},
		boot: ${json(graph.boot)},
		core: {
${parts('core')}
		},
		module: {
${parts('module')}
		},
		app: {
${parts('app')}
		},
		site: {
${parts('site')}
		},
		defaults: ${json(defaults)}
	};

	try {
		const script = document.currentScript;
		const link = document.createElement('link');
		if (!script?.src || !link.relList?.supports?.('modulepreload')) return;
		const root = new URL('../../', script.src);
		const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
		const cfg = isObj(window.DESKTOP_CONFIG) ? window.DESKTOP_CONFIG : {};
		const ID = /^[a-z][a-z0-9-]{0,31}$/;
		const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
		const seen = new Set();

		/* A same-origin path below the root, as the config may give it (no scheme, no //host, no backslash) */
		const local = path => {
			if (typeof path !== 'string' || !path || /^[a-z][a-z0-9+.-]*:|^\\/\\/|\\\\/i.test(path)) return null;
			const url = new URL(path, root);
			return url.origin === root.origin ? url.href : null;
		};
		const hint = (path, style = false) => {
			const href = local(path);
			if (!href || seen.has(href)) return;
			seen.add(href);
			const el = document.createElement('link');
			if (style) {
				el.rel = 'preload';
				el.as = 'style';
			} else el.rel = 'modulepreload';
			el.href = href;
			document.head.append(el);
		};

		const namespaces = new Set(['core']);
		const own = [];   // [folder, namespace] of modules that keep their texts next to their code
		const take = part => {
			if (!part) return;
			for (const i of part.js) hint(G.files[i]);
			for (const i of part.css) hint(G.files[i], true);
			for (const ns of part.i18n) {
				if (part.own) own.push([part.own, ns]);
				else namespaces.add(ns);
			}
		};
		/* site modules by the URL of their entry file */
		const site = new Map(Object.entries(G.site).map(([path, part]) => [new URL(path, root).href, part]));
		const refs = (list, fallback, kind) => {
			for (const ref of Array.isArray(list) ? list : fallback) {
				if (typeof ref === 'string' && ID.test(ref)) take(G[kind][ref]);
				else if (isObj(ref) && typeof ref.src === 'string') {
					hint(ref.src);
					take(site.get(local(ref.src)));
				}
			}
		};

		for (const i of G.boot) hint(G.files[i]);
		for (const id of Object.keys(G.core)) take(G.core[id]);
		refs(cfg.modules, G.defaults.modules, 'module');
		refs(cfg.apps, G.defaults.apps, 'app');
		hint(isObj(cfg.site) && typeof cfg.site.data === 'string' ? cfg.site.data : G.defaults.siteData);

		/* Languages: the start language as src/core/i18n.js detect() finds it, then its chain */
		const offer = Array.isArray(cfg.languages) && cfg.languages.length && cfg.languages.every(c => typeof c === 'string' && LANG.test(c))
			? cfg.languages : G.defaults.languages;
		const defaultLang = typeof cfg.defaultLang === 'string' && LANG.test(cfg.defaultLang) ? cfg.defaultLang : G.defaults.defaultLang;
		const ns = typeof cfg.namespace === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(cfg.namespace) ? cfg.namespace : G.defaults.namespace;
		const exact = c => offer.find(x => x.toLowerCase() === String(c).toLowerCase());
		let stored = null;
		try { stored = localStorage.getItem(\`\${ns}-lang\`); } catch { /* storage blocked */ }
		const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
		const base = c => String(c).split('-')[0].toLowerCase();
		const lang = exact(new URLSearchParams(location.search).get('lang')) ?? exact(stored)
			?? preferred.map(exact).find(Boolean)
			?? preferred.map(p => offer.find(x => x.toLowerCase() === base(p)) ?? offer.find(x => base(x) === base(p))).find(Boolean)
			?? (offer.includes(defaultLang) ? defaultLang : offer[0]);
		const known = new Set([...offer, 'en']);
		const chain = [...new Set([lang, base(lang), defaultLang, 'en'])].filter(c => c === lang || known.has(c));
		for (const code of known) hint(\`locales/\${code}/_meta.js\`);
		for (const code of chain) {
			for (const n of namespaces) hint(\`locales/\${code}/\${n}.js\`);
			for (const [dir, n] of own) hint(\`\${dir}\${code}/\${n}.js\`);
		}
	} catch {
		/* hints only — the boot loads everything itself */
	}
})();
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	const text = render(buildGraph());
	if (process.argv.includes('--check')) {
		const now = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
		if (now !== text) {
			console.error(`${rel(OUT)} is out of date — run npm run preload`);
			process.exit(1);
		}
		console.log(`${rel(OUT)} is up to date.`);
	} else {
		writeFileSync(OUT, text);
		const g = buildGraph();
		console.log(`${rel(OUT)} written: ${g.files.length} files (boot ${g.boot.length}, ${Object.keys(g.module).length} modules, ${Object.keys(g.app).length} apps).`);
	}
}
