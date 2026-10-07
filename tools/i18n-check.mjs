#!/usr/bin/env node
/* JPKCom Desktop — locale checker: compares every language with the English reference — © Jean Pierre Kolb — MIT License

   Usage
     node tools/i18n-check.mjs            check every folder in locales/
     node tools/i18n-check.mjs fr de      check these languages only
   Site modules: every site/modules/<id>/locales/ folder (descriptor field locales) is checked the same
   way — its en/ is the reference, every checked language of locales/ needs its files there. A namespace
   that locales/en/ has as well is an error (the desktop would ignore the module's copy).

   Reports per language and namespace:
     missing      keys in en that the language lacks (error)
     placeholder  a {name} that en has and the translation lacks, or the other way round (error)
     form         a plural object where en has a string, or the other way round (error)
     plural       a plural object without a form the language needs (warning; the
                  categories come from Intl.PluralRules(meta.intl): pl/ru need 'few'
                  and 'many', ar also 'zero' and 'two')
     extra        keys en does not have (warning — probably renamed or removed)
     file         a namespace file of en that the language lacks (error)
     meta         _meta.js missing or without name/intl/dir/yes (error)
   And once for the reference language:
     unused       a key of en that no source file refers to (warning — every translator
                  has to translate it). Scanned: src/, site/, sw.js, index.html. A key counts
                  as used when a string literal names it ('ns.key', '@ns.key', a bare 'key'
                  for core), when a literal is its prefix ending in . - or _ ('weather.cond-'),
                  when a template builds it (`help.${id}Title`), or — for a namespace-bound
                  wrapper such as k => t(`terminal.${k}`) — when a literal in that file
                  names it bare. Keys built in other ways go into DYNAMIC below.
   Exit code 1 when there is any error. Zero dependencies. */

import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'locales');
const REF = 'en';

const load = async file => (await import(pathToFileURL(file).href)).default;
const isPlural = v => v !== null && typeof v === 'object';
const placeholders = v => new Set((isPlural(v) ? Object.values(v).join(' ') : String(v)).match(/\{[A-Za-z0-9_]+\}/g) ?? []);

const namespaces = lang => readdirSync(join(LOCALES, lang)).filter(f => f.endsWith('.js') && f !== '_meta.js').map(f => f.slice(0, -3)).sort();

const langs = process.argv.slice(2).length
	? process.argv.slice(2)
	: readdirSync(LOCALES).filter(d => statSync(join(LOCALES, d)).isDirectory() && d !== REF).sort();

let errors = 0;
let warnings = 0;
const report = (level, lang, where, msg) => {
	if (level === 'error') errors++;
	else warnings++;
	console.log(`${level === 'error' ? 'ERROR' : 'warn '}  ${lang}  ${where}  ${msg}`);
};

/* The plural categories a language needs (cardinal): en → one, other; pl → one, few, many, other */
function pluralCategories(tag) {
	try {
		return new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
	} catch {
		return ['other'];
	}
}

function checkPlurals(lang, ns, dict, cats) {
	for (const [key, value] of Object.entries(dict)) {
		if (!isPlural(value)) continue;
		const missing = cats.filter(c => typeof value[c] !== 'string');
		if (missing.length) report('warn', lang, ns, `'${key}' lacks the plural form(s) ${missing.join(', ')} (Intl.PluralRules: ${cats.join(', ')})`);
	}
}

/* One namespace file of a language against the reference: keys, plural shape, placeholders, extras */
function compare(lang, where, refDict, dict) {
	for (const [key, value] of Object.entries(refDict)) {
		if (!Object.hasOwn(dict, key)) {
			report('error', lang, where, `missing '${key}'`);
			continue;
		}
		const mine = dict[key];
		if (isPlural(value) !== isPlural(mine)) {
			report('error', lang, where, `'${key}' must be ${isPlural(value) ? 'a plural object { one, other, … }' : 'a string'}`);
			continue;
		}
		if (isPlural(mine) && typeof mine.other !== 'string') report('error', lang, where, `'${key}' needs an 'other' form`);
		const a = placeholders(value);
		const b = placeholders(mine);
		const lost = [...a].filter(p => !b.has(p));
		const added = [...b].filter(p => !a.has(p));
		if (lost.length || added.length) report('error', lang, where, `'${key}' placeholders differ (missing ${lost.join(' ') || '-'}, unknown ${added.join(' ') || '-'})`);
	}
	for (const key of Object.keys(dict)) {
		if (!Object.hasOwn(refDict, key)) report('warn', lang, where, `extra '${key}' (not in ${REF})`);
	}
}

const catsOf = new Map(); // language → plural categories (from its _meta.js)

const refNs = namespaces(REF);
const ref = {};
for (const ns of refNs) ref[ns] = await load(join(LOCALES, REF, `${ns}.js`));

for (const lang of [REF, ...langs]) {
	const dir = join(LOCALES, lang);
	if (!existsSync(dir)) {
		report('error', lang, '-', 'no folder locales/' + lang);
		continue;
	}
	const metaFile = join(dir, '_meta.js');
	let meta = null;
	if (!existsSync(metaFile)) report('error', lang, '_meta', 'missing _meta.js');
	else {
		meta = await load(metaFile);
		for (const k of ['name', 'intl', 'dir', 'yes']) if (typeof meta?.[k] !== 'string') report('error', lang, '_meta', `missing '${k}'`);
		if (meta?.dir && !['ltr', 'rtl'].includes(meta.dir)) report('error', lang, '_meta', `dir must be 'ltr' or 'rtl'`);
		try {
			Intl.getCanonicalLocales(meta?.intl);
		} catch {
			report('error', lang, '_meta', `intl '${meta?.intl}' is not a valid language tag`);
		}
	}
	const cats = pluralCategories(typeof meta?.intl === 'string' ? meta.intl : lang);
	catsOf.set(lang, cats);
	if (lang === REF) {
		for (const ns of refNs) checkPlurals(lang, ns, ref[ns], cats);
		continue;
	}

	for (const ns of refNs) {
		const file = join(dir, `${ns}.js`);
		if (!existsSync(file)) {
			report('error', lang, ns, `missing file locales/${lang}/${ns}.js`);
			continue;
		}
		const dict = await load(file);
		checkPlurals(lang, ns, dict, cats);
		compare(lang, ns, ref[ns], dict);
	}
	for (const ns of namespaces(lang)) {
		if (!refNs.includes(ns)) report('warn', lang, ns, `namespace not in ${REF}`);
	}
}

/* ---------- Site modules: site/modules/<id>/locales/<lang>/<ns>.js ---------- */

const SITE_MODULES = join(ROOT, 'site', 'modules');
const siteDirs = existsSync(SITE_MODULES)
	? readdirSync(SITE_MODULES).sort().map(m => join(SITE_MODULES, m, 'locales')).filter(d => existsSync(join(d, REF)))
	: [];
for (const dir of siteDirs) {
	const label = dir.slice(ROOT.length + 1).split(/[\\/]/).join('/');
	const nsList = readdirSync(join(dir, REF)).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
	for (const ns of nsList) {
		const where = `${label}/${ns}`;
		if (refNs.includes(ns)) {
			report('error', REF, where, `namespace '${ns}' is also a core namespace (locales/${REF}/${ns}.js) — the desktop keeps the core one`);
			continue;
		}
		const refDict = await load(join(dir, REF, `${ns}.js`));
		checkPlurals(REF, where, refDict, catsOf.get(REF) ?? ['one', 'other']);
		for (const lang of langs) {
			const file = join(dir, lang, `${ns}.js`);
			if (!existsSync(file)) {
				report('error', lang, where, `missing file ${label}/${lang}/${ns}.js`);
				continue;
			}
			const dict = await load(file);
			checkPlurals(lang, where, dict, catsOf.get(lang) ?? ['other']);
			compare(lang, where, refDict, dict);
		}
		/* its keys take part in the unused check below */
		refNs.push(ns);
		ref[ns] = refDict;
	}
}

/* ---------- Unused keys of the reference language ---------- */

/* Keys looked up in ways the scan cannot see (namespace.key prefixes) */
const DYNAMIC = [];

function sourceFiles() {
	const out = [];
	for (const dir of ['src', 'site']) {
		const abs = join(ROOT, dir);
		if (!existsSync(abs)) continue;
		for (const f of readdirSync(abs, { recursive: true })) if (/\.(m?js|html)$/.test(f)) out.push(join(abs, f));
	}
	for (const f of ['sw.js', 'index.html']) if (existsSync(join(ROOT, f))) out.push(join(ROOT, f));
	return out;
}

/* String literals of a file (comments dropped first; good enough for a warning). Literals inside a
   template's ${…} count as plain ones too: `${head} ${t('manHead')}` */
function literals(code) {
	const text = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
	const out = { plain: [], templates: [] };
	const scan = src => {
		for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
			if (m[3] !== undefined && m[3].includes('${')) {
				out.templates.push(m[3]);
				for (const e of m[3].matchAll(/\$\{([^}]*)\}/g)) scan(e[1]);
			} else out.plain.push(m[1] ?? m[2] ?? m[3]);
		}
	};
	scan(text);
	return out;
}

/* A namespace-bound wrapper (k => t(`ns.${k}`)) serves its whole part: src/apps/<name>/,
   src/modules/<name>/, else the file's folder */
const scopeOf = file => {
	const rel = file.slice(ROOT.length + 1).split(/[\\/]/);
	return rel[0] === 'src' && (rel[1] === 'apps' || rel[1] === 'modules') ? rel.slice(0, 3).join('/') : rel.slice(0, -1).join('/');
};
/* `pre${…}post` → its fixed head and tail (the tail only up to a further ${) */
const split = tpl => {
	const m = /^([^$`]*)\$\{[^}]*\}(.*)$/s.exec(tpl);
	return m ? [m[1], m[2].includes('${') ? '' : m[2]] : null;
};

const used = new Map(refNs.map(ns => [ns, new Set()]));
const all = ns => Object.keys(ref[ns]);
const mark = (ns, test) => { for (const k of all(ns)) if (test(k)) used.get(ns).add(k); };
const markParts = (ns, pre, post) => mark(ns, k => k.startsWith(pre) && k.endsWith(post) && k.length >= pre.length + post.length);
for (const p of DYNAMIC) {
	const [ns, pre] = [p.slice(0, p.indexOf('.')), p.slice(p.indexOf('.') + 1)];
	if (used.has(ns)) mark(ns, k => k.startsWith(pre));
}

const files = sourceFiles().map(file => ({ file, scope: scopeOf(file), ...literals(readFileSync(file, 'utf8')) }));
const wrappers = new Map(); // scope → Set of namespaces
for (const { scope, templates } of files) {
	for (const tpl of templates) {
		const m = /^@?([a-z][a-z0-9-]*)\.(.*)$/s.exec(tpl);
		const parts = m && used.has(m[1]) ? split(m[2]) : null;
		if (!parts) continue;
		const [pre, post] = parts;
		if (!pre && !post) {
			if (!wrappers.has(scope)) wrappers.set(scope, new Set());
			wrappers.get(scope).add(m[1]);
		} else markParts(m[1], pre, post);
	}
}
for (const { scope, plain, templates } of files) {
	const bound = wrappers.get(scope) ?? new Set();
	/* `bk.${key}` handed to a wrapper: relative to its namespace */
	for (const tpl of templates) {
		const parts = split(tpl);
		if (parts && (parts[0] || parts[1])) for (const ns of bound) markParts(ns, parts[0], parts[1]);
	}
	for (const lit of plain) {
		const v = lit.startsWith('@') ? lit.slice(1) : lit;
		const i = v.indexOf('.');
		if (i > 0 && used.has(v.slice(0, i))) {
			const ns = v.slice(0, i);
			const k = v.slice(i + 1);
			if (Object.hasOwn(ref[ns], k)) used.get(ns).add(k);
			else if (/[.\-_]$/.test(k)) mark(ns, x => x.startsWith(k));
		}
		if (i < 0 && used.has('core') && Object.hasOwn(ref.core, v)) used.get('core').add(v);
		for (const ns of bound) if (Object.hasOwn(ref[ns], v)) used.get(ns).add(v);
	}
}
for (const ns of refNs) {
	for (const k of all(ns)) if (!used.get(ns).has(k)) report('warn', REF, ns, `unused '${k}' (no source file refers to it)`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s) — reference '${REF}', checked: ${langs.join(', ') || '(none)'}`);
process.exit(errors ? 1 : 0);
