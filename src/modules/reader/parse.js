/* JPKCom Desktop — Reader: inert parsing without CSP reports — © Jean Pierre Kolb — MIT License

   Chromium checks the CSP of the parser's window while DOMParser builds a
   document: every style="", <style> and <base> of a fetched page raises a
   (blocked) report in the console — hundreds for a page of highlighted code —
   before the sanitiser can see the node. Measured: every parse mode bound to the
   window does it (DOMParser, Document.parseHTML[Unsafe], XMLHttpRequest
   documents, <template> content, createContextualFragment); importNode and the
   sanitiser add none.

   parseInert() therefore uses the DOMParser of a same-origin about:blank iframe
   (sandboxed, no scripts) that is removed again before its first parse. A
   detached window's document gets no CSP check and no report. It is exactly as
   inert: scripts never run, nothing loads, and sanitize.js still removes every
   style, <style> and <base>. Its URL is about:blank — the Reader resolves every
   URL against the page's own URL from the attribute text, never through the
   document. When that parser cannot be made (another engine, a future change)
   or fails, the window's own DOMParser takes over (reports again, nothing is
   applied either way). */

import { h } from '../../core/dom.js';

let parser = null;

/* The DOMParser of a removed same-origin iframe, or null */
function detachedParser() {
	let frame = null;
	try {
		frame = h('iframe', { hidden: true, 'aria-hidden': 'true', tabindex: '-1', sandbox: 'allow-same-origin' });
		document.body.append(frame);
		const Parser = frame.contentWindow?.DOMParser;
		const p = typeof Parser === 'function' ? new Parser() : null;
		frame.remove();
		frame = null;
		const probe = p?.parseFromString('<!doctype html><p>ok</p>', 'text/html');
		return probe?.body?.textContent === 'ok' ? p : null;
	} catch {
		return null;
	} finally {
		frame?.remove();
	}
}

/** An inert HTML document of the text (no CSP reports where the engine allows it) */
export function parseInert(html) {
	parser ??= detachedParser() ?? new DOMParser();
	try {
		const doc = parser.parseFromString(html, 'text/html');
		if (doc?.documentElement) return doc;
	} catch { /* fall back below */ }
	parser = new DOMParser();
	return parser.parseFromString(html, 'text/html');
}
