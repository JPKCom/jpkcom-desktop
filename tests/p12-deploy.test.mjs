/* JPKCom Desktop — tests: web app manifest, PWA icons, server configuration snippets — © Jean Pierre Kolb — MIT License

   The five server snippets (six files: Ferron 2 and 3) must send the same header set as
   docs/ARCHITECTURE.md §5 and tools/serve.mjs; the manifest must work at the web root and in
   a sub-folder and point at icons that exist with the sizes it claims. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { DEFAULTS } from '../src/core/config.js';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(PROJECT, p), 'utf8');

/* §5 of the architecture, in this order; production adds upgrade-insecure-requests */
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:", "media-src 'self' blob:",
	"font-src 'self'", "connect-src 'self' blob:", "frame-src 'self'", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'",
	"base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"];
const CSP_PROD = [...CSP, 'upgrade-insecure-requests'].join('; ');
const PERMISSIONS = 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';
const OPT_IN_HOSTS = ['https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com', 'https://api.brightsky.dev', 'https://dns.google',
	'https://v2.jokeapi.dev', 'https://uselessfacts.jsph.pl'];

const SERVERS = {
	'docs/server/apache.htaccess': { comment: '#' },
	'docs/server/nginx.conf': { comment: '#' },
	'docs/server/Caddyfile': { comment: '#' },
	'docs/server/ferron.conf': { comment: '#' },
	'docs/server/ferron.kdl': { comment: '//' },
	'docs/server/static-web-server.toml': { comment: '#' }
};

/** Lines that are not comments */
const active = (text, comment) => text.split('\n').filter(l => !l.trim().startsWith(comment));

for (const [file, { comment }] of Object.entries(SERVERS)) {
	test(`${file}: complete header set, opt-in lines, caching, vault`, () => {
		assert.ok(existsSync(resolve(PROJECT, file)), `${file} exists`);
		const text = read(file);
		const live = active(text, comment).join('\n');
		assert.ok(text.includes('JPKCom Desktop') && text.includes('© Jean Pierre Kolb — MIT License'), 'file header');

		/* exactly one active CSP, the production one (Apache appends upgrade-insecure-requests on https only) */
		const csps = [...live.matchAll(/"(default-src [^"]+)"/g)].map(m => m[1]);
		assert.equal(csps.length, 1, `one active CSP in ${file}: ${csps.length}`);
		const expected = file.endsWith('.htaccess') ? CSP.join('; ') : CSP_PROD;
		assert.equal(csps[0], expected);
		if (file.endsWith('.htaccess')) assert.match(live, /edit Content-Security-Policy "\$" "; upgrade-insecure-requests" "expr=%\{HTTPS\} == 'on'"/);

		/* commented opt-in extensions */
		const comments = text.split('\n').filter(l => l.trim().startsWith(comment)).join('\n');
		for (const host of OPT_IN_HOSTS) assert.ok(comments.includes(host), `opt-in host ${host}`);
		assert.match(comments, /'wasm-unsafe-eval'/);
		assert.match(comments, /frame-src 'self' https:\/\//);
		assert.match(comments, /geolocation=\(self\)/);
		/* no shipped provider calls the geocoding host: it stays out of the example policies */
		for (const line of text.split('\n').filter(l => l.includes('geocoding-api.open-meteo.com'))) {
			assert.ok(!line.includes('default-src'), `geocoding host only in its own comment: ${line.trim()}`);
			assert.match(line, /place search/);
		}

		/* the rest of §5 */
		assert.ok(live.includes(PERMISSIONS), 'Permissions-Policy without geolocation');
		for (const h of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Strict-Transport-Security', 'X-Robots-Tag']) {
			assert.ok(live.includes(h), `${h} in ${file}`);
		}
		assert.match(live, /SAMEORIGIN/);
		assert.match(live, /nosniff/);
		assert.match(live, /strict-origin-when-cross-origin/);
		assert.match(live, /max-age=31536000; includeSubDomains/);
		assert.ok(!/preload/.test(live), 'no HSTS preload in a template');
		assert.match(live, /noindex, nofollow, noarchive/);
		assert.match(live, /site\/vault/);
		assert.match(live, /no-cache/);
		assert.match(live, /public, max-age=86400/);
		assert.match(live, /manifest\+json/);
		assert.ok(!/frame-ancestors 'none'|X-Frame-Options "?DENY/.test(live), 'iframes of the same origin stay possible');
		assert.ok(!/jpkc\.com/.test(text), 'no site-specific hosts');
	});
}

test('server snippets: directory listings off, dotfiles refused', () => {
	assert.match(read('docs/server/apache.htaccess'), /^Options -Indexes$/m);
	assert.match(read('docs/server/nginx.conf'), /^\s*autoindex off;$/m);
	assert.ok(!/\bbrowse\b/.test(active(read('docs/server/Caddyfile'), '#').join('\n')), 'Caddy without browse');
	assert.match(read('docs/server/ferron.conf'), /^\s*directory_listing false$/m);
	assert.match(read('docs/server/ferron.kdl'), /^\s*directory_listing #false$/m);
	assert.match(read('docs/server/static-web-server.toml'), /^directory-listing = false$/m);
	assert.match(read('docs/server/static-web-server.toml'), /^ignore-hidden-files = true$/m);
	assert.match(read('docs/server/static-web-server.toml'), /^redirect-trailing-slash = true$/m);
	for (const f of ['apache.htaccess', 'nginx.conf', 'Caddyfile', 'ferron.conf', 'ferron.kdl']) {
		assert.match(read(`docs/server/${f}`), /well-known/, `${f} keeps /.well-known/ reachable`);
	}
	/* Apache: mod_alias, outside any <IfModule> (mod_rewrite is optional: without it .git/ was served) */
	const htaccess = active(read('docs/server/apache.htaccess'), '#').join('\n');
	assert.match(htaccess, /^RedirectMatch 404 "\/\\\.\(\?!well-known\/\)"$/m);
	assert.ok(!/mod_rewrite|RewriteRule/.test(htaccess), 'no dotfile rule that depends on mod_rewrite');
});

test('server snippets: no version in the Server header, charset on text types', () => {
	const nginx = active(read('docs/server/nginx.conf'), '#').join('\n');
	assert.equal(nginx.match(/^\s*server \{/gm).length, 2);
	assert.equal(nginx.match(/^\s*server_tokens off;/gm).length, 2, 'server_tokens off in the redirect server too');
	for (const [f, q] of [['ferron.conf', ''], ['ferron.kdl', '"']]) {
		const text = read(`docs/server/${f}`);
		for (const [ext, type] of [['html', 'text/html'], ['css', 'text/css'], ['json', 'application/json'], ['webmanifest', 'application/manifest+json'], ['mjs', 'text/javascript'], ['js', 'text/javascript']]) {
			assert.ok(text.includes(`mime_type ${q}.${ext}${q} "${type}; charset=utf-8"`), `${f}: .${ext}`);
		}
	}
	const sws = read('docs/server/static-web-server.toml');
	for (const [glob, type] of [['**/*.{js,mjs}', 'text/javascript'], ['**/*.css', 'text/css'], ['**/*.json', 'application/json']]) {
		assert.ok(sws.includes(`source = "${glob}"\nheaders = { Content-Type = "${type}; charset=utf-8" }`), `static-web-server: ${glob}`);
	}
});

/* tools/serve.mjs as it really answers: start it on a free port and compare the response
   headers with the snippets — the same policy without upgrade-insecure-requests (plain http),
   the same Permissions-Policy, geolocation=(self) only with --geolocation */
async function freePort() {
	const srv = createNetServer();
	await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
	const { port } = srv.address();
	await new Promise(ok => srv.close(ok));
	return port;
}

async function serveHeaders(t, ...flags) {
	const port = await freePort();
	const child = spawn(process.execPath, [resolve(PROJECT, 'tools/serve.mjs'), '--port', String(port), ...flags], { cwd: PROJECT, stdio: 'ignore' });
	t.after(() => child.kill());
	for (let i = 0; i < 100; i++) {
		try {
			return (await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' })).headers;
		} catch {
			await new Promise(ok => setTimeout(ok, 50));
		}
	}
	throw new Error('tools/serve.mjs did not start');
}

const sorted = v => v.split(', ').sort();

test('tools/serve.mjs sends the headers of the snippets (without upgrade-insecure-requests on http)', async t => {
	const h = await serveHeaders(t);
	assert.equal(h.get('content-security-policy'), CSP.join('; '));
	assert.equal(`${h.get('content-security-policy')}; upgrade-insecure-requests`, CSP_PROD, 'the snippets add only upgrade-insecure-requests');
	assert.deepEqual(sorted(h.get('permissions-policy')), sorted(PERMISSIONS));
	assert.equal(h.get('x-frame-options'), 'SAMEORIGIN');
	assert.equal(h.get('x-content-type-options'), 'nosniff');
	assert.equal(h.get('referrer-policy'), 'strict-origin-when-cross-origin');
	assert.equal(h.get('cross-origin-opener-policy'), 'same-origin');
});

test('tools/serve.mjs --geolocation: geolocation=(self) only on request', async t => {
	const h = await serveHeaders(t, '--geolocation');
	assert.deepEqual(sorted(h.get('permissions-policy')), sorted(PERMISSIONS.replace('geolocation=()', 'geolocation=(self)')));
	assert.equal(h.get('content-security-policy'), CSP.join('; '));
});

test('Caddyfile: no header block mixes plain fields with deferred (-, ?, >) operations', () => {
	/* such a block is deferred as a whole, and file_server's error answers (404) never see it */
	const lines = active(read('docs/server/Caddyfile'), '#');
	let block = null;
	for (const line of lines) {
		const l = line.trim();
		if (/^header(\s+@\S+)?\s*\{$/.test(l)) block = [];
		else if (block && l === '}') {
			const deferred = block.filter(f => /^[-?>]/.test(f));
			assert.ok(!deferred.length || deferred.length === block.length, `mixed header block: ${block.join(' | ')}`);
			block = null;
		} else if (block && l) block.push(l);
	}
	assert.match(lines.join('\n'), /handle_errors \{/, 'error answers drop the Server header too');
});

test('docs/deploy.md links every snippet and repeats the CSP', () => {
	const doc = read('docs/deploy.md');
	for (const f of Object.keys(SERVERS)) assert.ok(doc.includes(f.replace('docs/', '')), `deploy.md mentions ${f}`);
	assert.ok(doc.includes(CSP_PROD), 'the production CSP is spelled out');
	for (const host of OPT_IN_HOSTS) assert.ok(doc.includes(host), host);
	for (const line of doc.split('\n').filter(l => l.includes('geocoding-api.open-meteo.com'))) {
		assert.ok(!line.includes('default-src') && !line.startsWith('|'), `deploy.md: geocoding host only as a note: ${line}`);
	}
});

test('static-web-server: the /.well-known/ limitation is documented, not hidden', () => {
	assert.match(read('docs/server/static-web-server.toml'), /ignore-hidden-files has no exception: \/\.well-known\/ is refused too/);
	const doc = read('docs/deploy.md');
	assert.match(doc, /static-web-server has\s+no such exception/);
	assert.match(doc, /`ignore-hidden-files = true` refuses \*\*every\*\* dotfile/);
});

test('shipped docs: no third-party product wording, no local paths, no site-specific hosts', () => {
	for (const f of ['docs/deploy.md', 'docs/packages/p12-pwa-deploy.md', ...Object.keys(SERVERS)]) {
		const text = read(f).replaceAll('apple-touch-icon', '').replaceAll('apple-mobile-web-app-title', '');   // HTML names, not wording
		assert.ok(!/\b(?:Apple|macOS|Mac|iOS|Finder|Spotlight|Launchpad|Chuck Norris|chucknorris)\b/i.test(text), `${f}: glossary wording`);
		assert.ok(!/jpkc\.com/.test(text), `${f}: no jpkc.com`);
		assert.ok(!/\/home\/|\/tmp\//.test(text), `${f}: no local paths`);
	}
});

/* ---------- Manifest and icons ---------- */

const manifest = JSON.parse(read('manifest.webmanifest'));

/** PNG width and height from the IHDR chunk */
function pngSize(file) {
	const b = readFileSync(resolve(PROJECT, file));
	assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is a PNG`);
	return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifest: relative start_url and scope, neutral English name, brand defaults', () => {
	assert.equal(manifest.start_url, './');
	assert.equal(manifest.scope, './');
	assert.equal(manifest.id, undefined, 'no id: it would resolve against the origin and collide between sub-folder installs');
	assert.equal(manifest.name, DEFAULTS.brand.name);
	assert.equal(manifest.short_name, DEFAULTS.brand.shortName);
	assert.equal(manifest.theme_color, DEFAULTS.brand.themeColor);
	assert.equal(manifest.lang, 'en');
	assert.equal(manifest.display, 'standalone');
	assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
	assert.ok(!/jpkc\.com|Portfolio|Spiele/.test(JSON.stringify(manifest)), 'no content of the original site');
	assert.ok(!JSON.stringify(manifest).includes('"/'), 'no root-absolute paths');
});

test('manifest icons exist, are relative and have the sizes they claim', () => {
	const purposes = new Set();
	for (const icon of manifest.icons) {
		assert.ok(!/^\/|:\/\//.test(icon.src), `relative: ${icon.src}`);
		assert.ok(existsSync(resolve(PROJECT, icon.src)), `exists: ${icon.src}`);
		purposes.add(`${icon.purpose}:${icon.sizes}`);
		if (icon.type === 'image/png') {
			const [w, h] = pngSize(icon.src);
			assert.equal(`${w}x${h}`, icon.sizes, icon.src);
		} else {
			assert.equal(icon.type, 'image/svg+xml');
			assert.equal(icon.sizes, 'any');
			assert.match(read(icon.src), /^<svg [^>]*viewBox="0 0 512 512"/);
		}
	}
	for (const p of ['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512', 'any:any', 'maskable:any']) assert.ok(purposes.has(p), p);
	assert.deepEqual(pngSize('assets/icons/apple-touch-icon.png'), [180, 180]);
});

test('maskable icons are full bleed (no transparent corners)', () => {
	const svg = read('assets/icons/maskable.svg');
	assert.match(svg, /<rect width="512" height="512" fill="url\(#g\)"\/>/);
	assert.ok(!/rx=/.test(svg), 'no rounded corners');
});
