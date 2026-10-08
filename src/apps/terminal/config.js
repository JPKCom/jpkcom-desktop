/* JPKCom Desktop — terminal: config section, stored history, command names (what the descriptor needs at boot) — © Jean Pierre Kolb — MIT License

   The descriptor (index.js) validates config.terminal and the storage key
   'term' and checks command names before any terminal window exists, so these
   helpers load with the boot; the rest of the pure helpers (lib.js, which
   re-exports these) comes with the window. No DOM, no desktop imports. */

import { isObj } from '../../core/is.js';
import { cleanMan } from '../../core/man.js';

/** Longest stored command line */
export const MAX_LINE = 500;
/** Default and upper bound of the history length (config.terminal.historySize) */
export const HISTORY_DEFAULT = 100;
export const HISTORY_MAX = 1000;
/** Command names: lower-case letters, digits and '-', starting with a letter */
export const NAME = /^[a-z][a-z0-9-]{0,31}$/;

/* ---------- Stored history: { history: [line], last: timestamp } ---------- */

/** Validates the stored state; null when it is not an object */
export function cleanState(v, size = HISTORY_DEFAULT) {
	if (!isObj(v)) return null;
	const history = Array.isArray(v.history)
		? v.history.filter(x => typeof x === 'string' && x && x.length <= MAX_LINE && !/[\u0000-\u001f]/.test(x)).slice(-Math.max(0, size))
		: [];
	const last = typeof v.last === 'number' && Number.isFinite(v.last) && v.last > 0 ? v.last : null;
	return { history: size > 0 ? history : [], last };
}

/* ---------- Config section 'terminal' ---------- */

/* A path on this site, relative to the installation root or /root (no scheme, no //host, no whitespace,
   control character or backslash, ≤ 500) — the one rule of src/core/url.js under its old name */
export { isSitePath as isRelPath } from '../../core/url.js';

/** The warning for a bad config.terminal.manUrl */
export const MAN_URL_WARNING = 'manUrl must be null, a path template on this site or a { lang: template } map, each with '
	+ '{slug} or {id} and only {slug} {id} {collection} {lang} (e.g. \'docs/{lang}/{slug}.md\')';

/** A DNS-over-HTTPS resolver { url: 'https://host/path', name } → cleaned, or null */
export function cleanDoh(v) {
	if (!isObj(v) || typeof v.url !== 'string') return null;
	let url;
	try {
		url = new URL(v.url);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
	const name = typeof v.name === 'string' && v.name.trim() && v.name.length <= 80 ? v.name.trim() : url.hostname;
	return { url: url.href, host: url.hostname, name };
}

/**
 * Cleans config.terminal: { user, doh, eggs, historySize, manUrl }.
 *   user         prompt user name of a guest ([A-Za-z0-9._-], ≤ 32)
 *   doh          null | { url, name } (https; host for the consent service)
 *   eggs         hidden fun commands
 *   historySize  0–1000 stored lines
 *   manUrl       null | 'docs/{lang}/{slug}.md' | { lang: template } — the site-wide fallback of `man` for
 *                collection items (src/core/man.js; placeholders {slug} {id} {collection} {lang}, every
 *                value with {slug} or {id}; false counts as null; a map with one bad entry is ignored as a whole)
 */
export function cleanConfig(section, warn = () => {}) {
	const s = isObj(section) ? section : {};
	const out = { user: 'guest', doh: null, eggs: true, historySize: HISTORY_DEFAULT, manUrl: null };
	if (s.user !== undefined) {
		if (typeof s.user === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(s.user)) out.user = s.user;
		else warn(`user must be 1–32 characters [A-Za-z0-9._-] — using '${out.user}'`);
	}
	if (s.doh != null) {
		out.doh = cleanDoh(s.doh);
		if (!out.doh) warn('doh must be null or { url: \'https://…\', name } — dig/host/nslookup are off');
	}
	if (s.eggs !== undefined) {
		if (typeof s.eggs === 'boolean') out.eggs = s.eggs;
		else warn('eggs must be true or false');
	}
	if (s.historySize !== undefined) {
		if (Number.isInteger(s.historySize) && s.historySize >= 0 && s.historySize <= HISTORY_MAX) out.historySize = s.historySize;
		else warn(`historySize must be an integer 0–${HISTORY_MAX} — using ${HISTORY_DEFAULT}`);
	}
	const m = cleanMan(s.manUrl, { template: true });
	out.manUrl = m.value === false ? null : m.value;
	if (m.problem) warn(MAN_URL_WARNING);
	return out;
}
