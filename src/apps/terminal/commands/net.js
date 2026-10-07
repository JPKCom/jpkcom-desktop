/* JPKCom Desktop — terminal: DNS over HTTPS (dig, host, nslookup) — © Jean Pierre Kolb — MIT License

   Only present when the site configures a resolver (config.terminal.doh =
   { url: 'https://…/resolve', name }) AND offers the online service 'dns'
   (config.services.dns = true). Before the first question the user is asked
   for consent (Desk.consent.ask('dns')); every request goes through
   Desk.net with { service: 'dns' } — no cookies, no referrer, a timeout.
   The resolver must speak the JSON API (?name=&type=, Accept: application/dns-json).

   Pure helpers (exported for tests): dnsName, reverseName, isIp, records, RR_TYPES, digArgs. */

import Desk from '../../../core/api.js';

const t = (key, params) => Desk.t(`terminal.${key}`, params);

export const DNS_TIMEOUT = 6000;
export const RR = {
	1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 43: 'DS',
	46: 'RRSIG', 47: 'NSEC', 48: 'DNSKEY', 50: 'NSEC3', 52: 'TLSA', 64: 'SVCB', 65: 'HTTPS', 257: 'CAA'
};
export const RR_TYPES = ['A', 'AAAA', 'CAA', 'CNAME', 'DNSKEY', 'DS', 'HTTPS', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'SVCB', 'TLSA', 'TXT'];
export const RCODE = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED' };

/** A host name as the resolver wants it: IDN as punycode, no trailing dot — or null */
export function dnsName(raw) {
	const s = String(raw || '').trim().replace(/\.$/, '');
	if (!s || s.length > 253 || /[\s/@:?#\\]/.test(s)) return null;
	try {
		const host = new URL(`http://${s}`).hostname;
		return host.length <= 253 && /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i.test(host) ? host : null;
	} catch {
		return null;
	}
}

/** 192.0.2.1 → 1.2.0.192.in-addr.arpa, IPv6 → nibbles under ip6.arpa — or null */
export function reverseName(ip) {
	ip = String(ip ?? '');
	const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) return v4.slice(1).every(n => Number(n) <= 255) ? `${v4.slice(1).reverse().map(Number).join('.')}.in-addr.arpa` : null;
	if (!/^[0-9a-f:]{2,39}$/i.test(ip) || (ip.match(/::/g) || []).length > 1) return null;
	const short = ip.includes('::');
	const [head, tail = ''] = ip.split('::');
	const a = head ? head.split(':') : [];
	const b = short && tail ? tail.split(':') : [];
	const fill = 8 - a.length - b.length;
	if (short ? fill < 1 : a.length !== 8) return null;
	const groups = [...a, ...Array(short ? fill : 0).fill('0'), ...b];
	if (groups.some(g => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
	return `${[...groups.map(g => g.padStart(4, '0')).join('')].reverse().join('.')}.ip6.arpa`;
}

export const isIp = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) || (s.includes(':') && /^[0-9a-f:]+$/i.test(s));

/** Records as plain values: name, TTL, type name, data (strings only, length-capped) */
export const records = list => (Array.isArray(list) ? list : [])
	.filter(r => typeof r?.name === 'string' && typeof r?.data === 'string')
	.slice(0, 200)
	.map(r => ({
		name: r.name.slice(0, 260), ttl: Number.isFinite(r.TTL) ? r.TTL : 0,
		type: RR[r.type] || `TYPE${Number(r.type) || 0}`, data: r.data.slice(0, 2000)
	}));

/** The resolver's JSON answer → { status, flags, answer, authority } or null */
export function readAnswer(data) {
	if (!Number.isInteger(data?.Status)) return null;
	return {
		status: data.Status,
		flags: ['qr', data.RD && 'rd', data.RA && 'ra', data.AD && 'ad', data.CD && 'cd'].filter(Boolean),
		answer: records(data.Answer), authority: records(data.Authority)
	};
}

/**
 * dig's arguments → { name, type, short } | { error: 'usage' | 'badIp' | 'badName', value }.
 * A word that names a type is the type — unless it is the only word.
 */
export function digArgs(args) {
	const plus = args.filter(a => a.startsWith('+') || a.startsWith('@')).map(a => a.toLowerCase());
	const words = args.filter(a => !a.startsWith('+') && !a.startsWith('@'));
	const short = plus.includes('+short');
	const x = words.findIndex(a => a === '-x');
	if (x !== -1) {
		const name = reverseName(words[x + 1] || '');
		return name ? { name, type: 'PTR', short } : { error: 'badIp', value: words[x + 1] || '' };
	}
	const isType = a => RR_TYPES.includes(a.toUpperCase());
	const rest = words.filter(a => !a.startsWith('-'));
	const raw = rest.length === 1 ? rest[0] : rest.find(a => !isType(a));
	const type = (rest.length > 1 && rest.find(isType)?.toUpperCase()) || 'A';
	if (!raw) return { error: 'usage' };
	const name = dnsName(raw);
	return name ? { name, type, short } : { error: 'badName', value: raw };
}

const quoteTxt = r => (r.type === 'TXT' && !r.data.startsWith('"') ? `"${r.data}"` : r.data);
const bare = n => n.replace(/\.$/, '');

/**
 * The commands for one resolver (cleaned config.terminal.doh: { url, host, name }).
 * consent: the service id ('dns').
 */
export default function netCommands(doh, service = 'dns') {
	/* One question — null when it failed (the error row is printed) */
	async function resolveDns(io, name, type) {
		const url = new URL(doh.url);
		url.searchParams.set('name', name);
		url.searchParams.set('type', type);
		const start = performance.now();
		const data = await Desk.net.getJson(url.href, { service, accept: 'application/dns-json', timeout: DNS_TIMEOUT, signal: io.signal });
		const r = readAnswer(data);
		if (!r) throw new Error('dns: no answer');
		return { ...r, ms: Math.round(performance.now() - start) };
	}

	/* Consent first (a question sheet over the window), then the request with a progress row */
	async function allowed(io, cmd) {
		if (await Desk.consent.ask(service, { within: io.win })) return true;
		io.err(t('dnsDenied', { cmd, server: doh.name }));
		return false;
	}

	async function ask(io, cmd, name, type) {
		const done = io.progress(t('dnsAsk', { server: doh.name }));
		try {
			return await resolveDns(io, name, type);
		} catch (e) {
			if (e?.code !== 'aborted') io.err(t('dnsError', { cmd, server: doh.name }));
			return null;
		} finally {
			done();
		}
	}

	function rrTable(io, rows) {
		const w = [0, 0, 0];
		for (const r of rows) {
			w[0] = Math.max(w[0], r.name.length);
			w[1] = Math.max(w[1], String(r.ttl).length);
			w[2] = Math.max(w[2], r.type.length);
		}
		for (const r of rows) io.say(`${r.name.padEnd(w[0] + 2)}${String(r.ttl).padStart(w[1])}  IN  ${r.type.padEnd(w[2] + 2)}${quoteTxt(r)}`, 'term-pre');
	}

	/* dig <name> [type] [+short] · dig -x <ip> — the usual sections, in dig's layout */
	async function dig(args, io) {
		const q = digArgs(args);
		if (q.error === 'usage') {
			io.err(t('usage', { usage: Desk.L('@terminal.usage.dig') }));
			return;
		}
		if (q.error) {
			io.err(t(q.error === 'badIp' ? 'dnsBadIp' : 'dnsBadName', { cmd: 'dig', value: q.value }));
			return;
		}
		if (!await allowed(io, 'dig')) return;
		const r = await ask(io, 'dig', q.name, q.type);
		if (!r) return;
		if (q.short) {
			for (const a of r.answer.filter(a => a.type === q.type)) io.say(quoteTxt(a), 'term-pre');
			return;
		}
		const dim = text => io.say(text, 'term-pre term-dim');
		dim(`; <<>> jsh dig <<>> ${q.name} ${q.type}`);
		dim(`;; status: ${RCODE[r.status] || r.status}, flags: ${r.flags.join(' ')}; ANSWER: ${r.answer.length}, AUTHORITY: ${r.authority.length}`);
		io.blank();
		dim(';; QUESTION SECTION:');
		dim(`;${q.name}.  IN  ${q.type}`);
		for (const [title, rows] of [['ANSWER', r.answer], ['AUTHORITY', r.authority]]) {
			if (!rows.length) continue;
			io.blank();
			dim(`;; ${title} SECTION:`);
			rrTable(io, rows);
		}
		io.blank();
		dim(`;; ${t('dnsTime', { ms: String(r.ms) })}`);
		dim(`;; SERVER: ${doh.name} (DNS over HTTPS)`);
	}

	/* host <name> — addresses, aliases and mail servers; host <ip> — its name */
	async function host(args, io, ctx) {
		const cmd = ctx?.name ?? 'host';
		const raw = args.find(a => !a.startsWith('-'));
		if (!raw) {
			io.err(t('usage', { usage: Desk.L('@terminal.usage.host') }));
			return;
		}
		if (isIp(raw)) {
			const rev = reverseName(raw);
			if (!rev) {
				io.err(t('dnsBadName', { cmd, value: raw }));
				return;
			}
			if (!await allowed(io, cmd)) return;
			const r = await ask(io, cmd, rev, 'PTR');
			if (!r) return;
			const ptr = r.answer.filter(a => a.type === 'PTR');
			if (!ptr.length) io.err(`Host ${rev} not found: ${r.status}(${RCODE[r.status] || 'NOERROR'})`);
			for (const a of ptr) io.say(`${rev} domain name pointer ${a.data}`, 'term-pre');
			return;
		}
		const name = dnsName(raw);
		if (!name) {
			io.err(t('dnsBadName', { cmd, value: raw }));
			return;
		}
		if (!await allowed(io, cmd)) return;
		const done = io.progress(t('dnsAsk', { server: doh.name }));
		const got = await Promise.allSettled(['A', 'AAAA', 'MX'].map(tp => resolveDns(io, name, tp)));
		done();
		if (io.signal?.aborted) return;
		const [a4, a6, mx] = got.map(g => (g.status === 'fulfilled' ? g.value : null));
		if (!a4 && !a6 && !mx) {
			io.err(t('dnsError', { cmd, server: doh.name }));
			return;
		}
		const first = a4 || a6 || mx;
		if (first.status === 3) {
			io.err(`Host ${name} not found: 3(NXDOMAIN)`);
			return;
		}
		const lines = [];
		const seen = new Set();
		for (const r of [a4, a6]) {
			for (const x of r?.answer || []) {
				if (x.type !== 'CNAME' || seen.has(x.name)) continue;
				seen.add(x.name);
				lines.push(`${bare(x.name)} is an alias for ${x.data}`);
			}
		}
		for (const x of a4?.answer || []) if (x.type === 'A') lines.push(`${bare(x.name)} has address ${x.data}`);
		for (const x of a6?.answer || []) if (x.type === 'AAAA') lines.push(`${bare(x.name)} has IPv6 address ${x.data}`);
		for (const x of mx?.answer || []) if (x.type === 'MX') lines.push(`${bare(x.name)} mail is handled by ${x.data}`);
		if (!lines.length) io.dim(t('dnsNone', { name }));
		for (const l of lines) io.say(l, 'term-pre');
	}

	const types = () => RR_TYPES.map(x => x.toLowerCase()).concat('+short', '-x');
	return {
		dig: { help: () => t('cmd.dig', { server: doh.name }), usage: '@terminal.usage.dig', man: () => t('man.dig', { server: doh.name }), complete: types, run: dig },
		host: { help: () => t('cmd.host', { server: doh.name }), usage: '@terminal.usage.host', man: () => t('man.host', { server: doh.name }), run: host },
		nslookup: { help: () => t('cmd.host', { server: doh.name }), usage: '@terminal.usage.nslookup', hidden: true, run: host }
	};
}
