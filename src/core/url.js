/* JPKCom Desktop — URL checks for data from the site and the modules — © Jean Pierre Kolb — MIT License

   One rule set for every URL that comes from data (site/apps.js, collections,
   catalog guides, the vault, …) instead of a copy per part. A safe URL is a
   relative or root path, or an absolute http(s) URL — never javascript:,
   data:, blob:, '//host' or '\host'.

   Checking the raw string alone is not enough: URL parsers drop TAB, LF and
   CR anywhere ('java<TAB>script:' → 'javascript:', '/<TAB>/host' → '//host'),
   trim C0 controls and spaces at both ends and read a backslash as '/'
   ('/\host' → '//host'). So control characters, DEL and backslashes are
   refused anywhere, spaces at the ends; a space inside a path stays allowed
   (the parser percent-encodes it).

   A web app's scope is a folder path (isSafeScope): no dot segments (DOT_SEGMENT, also
   '%2e' and '..;x'), no encoded '/', '\' or '.', no '?', '#', ';', scheme or '//host'.

   No imports, no DOM — safe in Node (tests) and for any part to import. */

/** Characters a URL from data never contains: C0 controls, DEL, backslash */
export const UNSAFE_URL_CHARS = /[\u0000-\u001f\u007f\\]/;

/** Longest URL accepted from data */
export const MAX_URL = 2000;

/** Cheap check of a raw URL string (no parsing): relative/root path or absolute http(s), at most MAX_URL long. */
export const isSafeUrl = u => typeof u === 'string' && u.length > 0 && u.length <= MAX_URL
	&& !UNSAFE_URL_CHARS.test(u) && !/^\s|\s$/.test(u)
	&& (/^https?:\/\//i.test(u) || (!/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//')));

/** Longest path from data that names a file on this site (man, files, manUrl) */
export const MAX_PATH = 500;

/** A path on this site: relative or /root, no scheme, no //host, no whitespace or control character, ≤ MAX_PATH */
export const isSitePath = v => isSafeUrl(v) && v.length <= MAX_PATH && !/\s/.test(v) && !/^[a-z][a-z0-9+.-]*:/i.test(v);

/**
 * Parses a URL from data against base and returns the URL object, or null:
 *   - the raw string must pass isSafeUrl()
 *   - the result must be http: or https:
 *   - a relative value must stay on origin (when origin is given)
 * safeUrl('docs/a.html', 'https://site.example/desk/', 'https://site.example') → URL
 * safeUrl('java\tscript:x', …) → null;  safeUrl('/\t/evil.example/', …) → null
 */
export function safeUrl(raw, base, origin = null) {
	if (!isSafeUrl(raw)) return null;
	let url;
	try {
		url = new URL(raw, base);
	} catch {
		return null;
	}
	if (!/^https?:$/.test(url.protocol)) return null;
	if (origin && !/^https?:\/\//i.test(raw) && url.origin !== origin) return null;
	return url;
}

/** True for an http(s) URL object or string that parses (after any rewriting) — the last check before a link is used. */
export function isHttpUrl(url, base) {
	try {
		return /^https?:$/.test((url instanceof URL ? url : new URL(String(url), base)).protocol);
	} catch {
		return false;
	}
}

/** A dot segment in a path ('.', '..', also '%2e' and with path parameters '..;x', Tomcat/Jetty) */
export const DOT_SEGMENT = /(?:^|\/)(?:\.|%2e){1,2}(?:;[^/]*)?(?=\/|$)/i;

/**
 * A folder path from data that may name a web app's scope: root-relative ('demos/clock/') or
 * root-absolute ('/wiki/'); never a scheme, '//host', '?', '#', ';', '..', '//' or an encoded '/', '\' or '.'.
 * ('/' passes this syntax check; the router refuses it as a parent of every root, the validator as an error.)
 */
export const isSafeScope = v => typeof v === 'string' && v.length <= 500 && isSafeUrl(v)
	&& !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith('//') && !/[?#;]/.test(v)
	&& !v.slice(1).includes('//') && !/%(?:2f|5c|2e)/i.test(v) && !DOT_SEGMENT.test(v);
