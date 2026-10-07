/* JPKCom Desktop — network: JSON/text requests with timeout and privacy defaults — © Jean Pierre Kolb — MIT License

   Rules for every request (taken over from the original):
   - an AbortController timeout (default 8 s) — no answer means the feature is
     simply missing, the desktop keeps running
   - requests to other origins send no cookies (credentials: 'omit') and no
     referrer (referrerPolicy: 'no-referrer')
   - a request on behalf of an online service ({ service: 'weather' }) only
     goes out when consent.granted(service) — else it fails with code 'consent'
   - the CSP decides the rest: an external host must be in connect-src

   Timeout, caller signal and size limit cover the whole transfer when the body
   is read here: getJson(), getText() and request(url, { read }) ('json' |
   'text' | 'blob' | 'bytes', with maxBytes). request() without read returns
   the raw Response once the headers are in — its timeout and signal cover
   the headers only, so the caller then owns the body (prefer read; onHeaders
   hands over the headers of a read request).

   Errors are NetError with code 'timeout' | 'http' | 'network' | 'parse' |
   'consent' | 'aborted' | 'size'. describe(err) turns one into a short message
   in the current language (core.netTimeout, core.netError, core.serviceOff,
   core.offline). */

import { granted, enabled } from './consent.js';
import { t } from './i18n.js';

export class NetError extends Error {
	constructor(code, message, status = 0) {
		super(message);
		this.name = 'NetError';
		this.code = code;
		this.status = status;
	}
}

const READS = new Set(['json', 'text', 'blob', 'bytes']);

/* Reads the body chunk by chunk (while timeout and signal still apply), stops past maxBytes */
async function readBody(res, read, maxBytes, href) {
	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(maxBytes) && Number.isFinite(declared) && declared > maxBytes) {
		res.body?.cancel().catch(() => {});
		throw new NetError('size', `${href} is larger than ${maxBytes} bytes`);
	}
	let bytes;
	if (!res.body) {
		bytes = new Uint8Array(await res.arrayBuffer());
		if (bytes.byteLength > maxBytes) throw new NetError('size', `${href} is larger than ${maxBytes} bytes`);
	} else {
		const reader = res.body.getReader();
		const chunks = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				reader.cancel().catch(() => {});
				throw new NetError('size', `${href} is larger than ${maxBytes} bytes`);
			}
			chunks.push(value);
		}
		bytes = new Uint8Array(total);
		let at = 0;
		for (const c of chunks) {
			bytes.set(c, at);
			at += c.byteLength;
		}
	}
	if (read === 'bytes') return bytes;
	if (read === 'blob') return new Blob([bytes], { type: res.headers.get('content-type') ?? '' });
	/* UTF-8 with the BOM dropped, as Response.text() and .json() decode */
	const text = new TextDecoder().decode(bytes);
	if (read === 'text') return text;
	try {
		return JSON.parse(text);
	} catch {
		throw new NetError('parse', `invalid JSON from ${href}`);
	}
}

/**
 * fetch with timeout and the privacy defaults.
 * opts: { timeout = 8000, signal, service, headers, cache, accept, read = null, maxBytes = Infinity, onHeaders }
 *   read      'json' | 'text' | 'blob' | 'bytes' → resolves with the body, read under the
 *             same timeout and signal; null → resolves with the Response (headers only)
 *   maxBytes  with read: more than this many bytes fail with code 'size' (the transfer stops)
 *   onHeaders with read: called with the response Headers before the body is read
 *             (Last-Modified, Content-Type …) — so a caller never needs the raw Response
 */
export async function request(url, { timeout = 8000, signal = null, service = null, headers = {}, cache = 'default', accept = null, read = null, maxBytes = Infinity, onHeaders = null } = {}) {
	if (service && !granted(service)) {
		const err = new NetError('consent', `service '${service}' is not enabled or not agreed to`);
		err.service = service;
		throw err;
	}
	if (signal?.aborted) throw new NetError('aborted', 'aborted');
	if (read !== null && !READS.has(read)) throw new TypeError(`net.request(): read must be one of ${[...READS].join(', ')}`);
	let target;
	try {
		target = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
	} catch {
		throw new NetError('network', `invalid URL ${url}`);
	}
	const sameOrigin = typeof location !== 'undefined' && target.origin === location.origin;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(new NetError('timeout', `timeout after ${timeout} ms`)), timeout);
	const onAbort = () => ctrl.abort(new NetError('aborted', 'aborted'));
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		const res = await fetch(target.href, {
			signal: ctrl.signal,
			cache,
			credentials: sameOrigin ? 'same-origin' : 'omit',
			referrerPolicy: sameOrigin ? 'same-origin' : 'no-referrer',
			headers: accept ? { Accept: accept, ...headers } : headers
		});
		if (!res.ok) {
			res.body?.cancel().catch(() => {});
			throw new NetError('http', `HTTP ${res.status} for ${target.href}`, res.status);
		}
		if (!read) return res;
		if (typeof onHeaders === 'function') onHeaders(res.headers);
		return await readBody(res, read, maxBytes, target.href);
	} catch (err) {
		/* the timeout or the caller's signal wins over whatever the aborted read threw */
		if (ctrl.signal.aborted && ctrl.signal.reason instanceof NetError) throw ctrl.signal.reason;
		if (err instanceof NetError) throw err;
		throw new NetError('network', err?.message ?? 'network error');
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onAbort);
	}
}

/** Fetches and parses JSON (see request() for opts; timeout and signal cover the body). */
export const getJson = (url, opts = {}) => request(url, { accept: 'application/json', ...opts, read: 'json' });

/** Fetches text (see request() for opts; timeout and signal cover the body). */
export const getText = (url, opts = {}) => request(url, { ...opts, read: 'text' });

/**
 * A short message for the user about a failed request, in the current language:
 * timeout → core.netTimeout, a service the site switched off → core.serviceOff,
 * no connection → core.offline, anything else → core.netError; '' for 'aborted'
 * (the user cancelled — nothing to say).
 */
export function describe(err) {
	const code = err?.code;
	if (code === 'aborted') return '';
	if (code === 'timeout') return t('core.netTimeout');
	if (code === 'consent' && typeof err.service === 'string' && !enabled(err.service)) return t('core.serviceOff');
	if (typeof navigator !== 'undefined' && navigator.onLine === false) return t('core.offline');
	return t('core.netError');
}

export const net = Object.freeze({ request, getJson, getText, describe, NetError });
