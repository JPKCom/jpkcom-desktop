/* JPKCom Desktop — manual page values (man, manUrl) — © Jean Pierre Kolb — MIT License

   One rule set for the terminal's manual sources (ARCHITECTURE §7 "Manual pages"):
   the field `man` of collection items and collections in site/apps.js and
   config.terminal.manUrl. Used by the registry, the terminal's config and
   tools/validate-manifest.mjs — one rule, three callers.

   A value is false (no manual page), a path on this site (isSitePath of
   ./url.js) or a { lang: path } map. Paths may hold the placeholders of
   MAN_VARS; a template (a collection's man, manUrl) needs {slug} or {id} in
   every path, because it applies to many items.

   No DOM, no desktop state — safe in Node (tests, the validator). */

import { isSitePath } from './url.js';
import { isObj } from './is.js';

/** Placeholders a manual path may hold — all of them always fillable for a collection item */
export const MAN_VARS = Object.freeze(['slug', 'id', 'collection', 'lang']);

/** Language keys of a { lang: path } map (the rule of the terminal's `files`) */
export const MAN_LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Most languages a map may name */
export const MAN_MAX_LANGS = 20;

/** Ends in .md/.markdown/.txt (query and hash ignored) → the terminal prints it; any other path is a link */
export const isTextPath = p => /\.(md|markdown|txt)$/i.test(String(p).split(/[?#]/)[0]);

/** Every {name} in a path (also unknown ones) */
const PLACEHOLDER = /\{([^{}\s]*)\}/g;

/** Problem of one path, or null */
function pathProblem(p, template) {
	if (typeof p !== 'string' || !isSitePath(p)) return { code: 'path', detail: typeof p === 'string' ? p : String(p) };
	for (const m of p.matchAll(PLACEHOLDER)) {
		if (!MAN_VARS.includes(m[1])) return { code: 'placeholder', detail: m[0] };
	}
	if (template && !/\{(?:slug|id)\}/.test(p)) return { code: 'template', detail: p };
	return null;
}

/**
 * Checks one man value. template: every path needs {slug} or {id}.
 * → { value: null | false | string | map, problem: null | { code: 'type'|'path'|'lang'|'placeholder'|'template', detail } }
 *   null/undefined → { value: null }; false → { value: false }; anything invalid → { value: null, problem }
 *   (a map with one bad key or path is invalid as a whole — half a map would change the fallback order)
 */
export function cleanMan(v, { template = false } = {}) {
	if (v === undefined || v === null) return { value: null, problem: null };
	if (v === false) return { value: false, problem: null };
	if (typeof v === 'string') {
		const problem = pathProblem(v, template);
		return problem ? { value: null, problem } : { value: v, problem: null };
	}
	if (isObj(v)) {
		const entries = Object.entries(v);
		if (!entries.length || entries.length > MAN_MAX_LANGS) {
			return { value: null, problem: { code: 'type', detail: `a map with ${entries.length} languages (1–${MAN_MAX_LANGS})` } };
		}
		for (const [lang, p] of entries) {
			if (!MAN_LANG.test(lang)) return { value: null, problem: { code: 'lang', detail: lang } };
			const problem = pathProblem(p, template);
			if (problem) return { value: null, problem: { ...problem, lang } };
		}
		return { value: Object.freeze(Object.fromEntries(entries)), problem: null };
	}
	return { value: null, problem: { code: 'type', detail: Array.isArray(v) ? 'array' : typeof v } };
}
