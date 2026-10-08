#!/usr/bin/env node
/* JPKCom Desktop — local static server with the production security headers — © Jean Pierre Kolb — MIT License

   The desktop uses ES modules and fetch(), so it needs a web server (file://
   is not supported). This one sends the same headers a production server
   should send — what works here works behind the real CSP.

   Usage
     node tools/serve.mjs [--port 8080] [--host 127.0.0.1] [--base /] [--root .]
                          [--connect https://api.open-meteo.com,https://dns.google]
                          [--frame https://games.example.org] [--wasm] [--geolocation]
                          [--extra <url-path>=<file>[,<url-path>=<file>…]]

     --port      port (default 8080)
     --host      interface (default 127.0.0.1; 0.0.0.0 for the LAN)
     --base      URL path the desktop lives under, e.g. /desktop/ (tests subfolder deployments)
     --root      folder to serve (default: the project folder)
     --connect   extra origins for connect-src (online services you switched on)
     --frame     extra origins for frame-src ('web' apps whose url lives on another origin)
     --wasm      adds 'wasm-unsafe-eval' to script-src (only for WebAssembly, e.g. the
                 optional Pagefind search provider; nothing else needs it). This server sends
                 its policy with every file, so it covers both Pagefind's worker and its
                 fallback to the page (docs/deploy.md §6)
     --geolocation  allows geolocation=(self) in Permissions-Policy (only when site/config.js
                 sets services.geolocation: true — production blocks it otherwise)
     --extra     serves single files from outside the project tree at <base><url-path>, with the
                 same headers and MIME rules as any file — for tests and trials, production servers
                 have no such thing. <url-path>: letters, digits, . _ - / (no '..', no dot segment);
                 <file>: absolute or relative to the current folder, a regular file (checked at the
                 start, else exit 1). It may shadow a project file, e.g. a trial config that the page
                 and the service worker (importScripts) both read:
                 --extra site/config.js=/tmp/cfg.js,site/icon-sets/t.json=/tmp/t.json

   Rules: GET/HEAD only; a directory serves its index.html (a path without the
   trailing slash is redirected first); dotfiles, node_modules, tools and
   tests are never served; everything else that is not a file is a 404.
   Zero dependencies (Node ≥ 24). */

import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { createReadStream, statSync } from 'node:fs';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(opt('root', PROJECT));
const PORT = Number.parseInt(opt('port', '8080'), 10);
const HOST = opt('host', '127.0.0.1');
const BASE = `/${opt('base', '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
/* A comma-separated list of https origins; anything else is reported and dropped */
const origins = name => opt(name, '').split(',').map(s => s.trim()).filter(Boolean).filter(s => {
	if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s)) return true;
	console.warn(`--${name}: '${s}' is not an https origin (https://host[:port]) — ignored`);
	return false;
});
const CONNECT = origins('connect');
const FRAME = origins('frame');
/* --extra url-path=file pairs → Map rel path → absolute file */
const EXTRA = new Map();
for (const pair of opt('extra', '').split(',').map(s => s.trim()).filter(Boolean)) {
	const at = pair.indexOf('=');
	const path = at > 0 ? pair.slice(0, at).replace(/^\/+/, '') : '';
	const file = at > 0 ? resolve(pair.slice(at + 1)) : '';
	if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.split('/').some(seg => !seg || seg.startsWith('.'))) {
		console.error(`--extra: '${pair}' needs <url-path>=<file>; the path takes letters, digits, . _ - / only, no '..' or dot segments`);
		process.exit(1);
	}
	let ok = false;
	try { ok = statSync(file).isFile(); } catch { /* reported below */ }
	if (!ok) {
		console.error(`--extra: ${file} is not a file`);
		process.exit(1);
	}
	EXTRA.set(path, file);
}
const WASM = args.includes('--wasm');
const GEO = args.includes('--geolocation');

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
	console.error(`Invalid --port ${opt('port')}`);
	process.exit(1);
}

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.mp3': 'audio/mpeg',
	'.ogg': 'audio/ogg',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.wasm': 'application/wasm',
	'.pdf': 'application/pdf',
	'.bin': 'application/octet-stream'
};

/* The production header set (docs/ARCHITECTURE.md → "Security"). No upgrade-insecure-requests
   and no HSTS here: this server speaks plain http on localhost. */
const CSP = [
	"default-src 'self'",
	`script-src 'self'${WASM ? " 'wasm-unsafe-eval'" : ''}`,
	"style-src 'self'",
	"img-src 'self' data: blob:",
	"media-src 'self' blob:",
	"font-src 'self'",
	`connect-src 'self' blob:${CONNECT.length ? ` ${CONNECT.join(' ')}` : ''}`,
	`frame-src 'self'${FRAME.length ? ` ${FRAME.join(' ')}` : ''}`,
	"worker-src 'self'",
	"manifest-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'"
].join('; ');

const HEADERS = {
	'Content-Security-Policy': CSP,
	/* The same value and order as every shipped server config: geolocation only on request */
	'Permissions-Policy': `accelerometer=(), camera=(), geolocation=${GEO ? '(self)' : '()'}, gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`,
	'X-Frame-Options': 'SAMEORIGIN',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cache-Control': 'no-cache'
};

/* Dotfiles anywhere; development folders at the top level */
const BLOCKED = /(^|\/)\.|^(node_modules|tools|tests)(\/|$)/;

function send(res, status, body, extra = {}) {
	res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
	res.end(body);
}

async function handle(req, res) {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		send(res, 405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
		return;
	}
	let pathname;
	try {
		pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	} catch {
		send(res, 400, 'Bad Request\n');
		return;
	}
	if (BASE !== '/' && pathname === BASE.slice(0, -1)) {
		res.writeHead(301, { ...HEADERS, Location: BASE });
		res.end();
		return;
	}
	if (!pathname.startsWith(BASE) || pathname.includes('\0')) {
		send(res, 404, 'Not Found\n');
		return;
	}
	const rel = pathname.slice(BASE.length);
	let file = EXTRA.get(rel) ?? null;
	if (!file) {
		if (BLOCKED.test(rel)) {
			send(res, 404, 'Not Found\n');
			return;
		}
		file = resolve(ROOT, `.${sep}${rel}`);
		if (file !== ROOT && !file.startsWith(ROOT + sep)) {
			send(res, 404, 'Not Found\n');
			return;
		}
	}
	let info;
	try {
		info = await stat(file);
		if (info.isDirectory()) {
			if (!pathname.endsWith('/')) {
				res.writeHead(301, { ...HEADERS, Location: `${pathname}/` });
				res.end();
				return;
			}
			file = join(file, 'index.html');
			info = await stat(file);
		}
		if (!info.isFile()) throw new Error('not a file');
	} catch {
		send(res, 404, 'Not Found\n');
		return;
	}
	const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
	res.writeHead(200, { ...HEADERS, 'Content-Type': type, 'Content-Length': info.size, 'Last-Modified': info.mtime.toUTCString() });
	if (req.method === 'HEAD') {
		res.end();
		return;
	}
	createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

const server = createServer((req, res) => {
	handle(req, res).catch(err => {
		console.error(err);
		if (!res.headersSent) send(res, 500, 'Internal Server Error\n');
		else res.destroy();
	});
});

server.listen(PORT, HOST, async () => {
	let name = 'JPKCom Desktop';
	try {
		name = JSON.parse(await readFile(join(PROJECT, 'package.json'), 'utf8')).name;
	} catch { /* keep the default */ }
	console.log(`${name}: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}${BASE}  (root ${ROOT})`);
	if (CONNECT.length) console.log(`connect-src adds: ${CONNECT.join(' ')}`);
	if (FRAME.length) console.log(`frame-src adds: ${FRAME.join(' ')}`);
	if (WASM) console.log("script-src adds: 'wasm-unsafe-eval'");
	if (GEO) console.log('Permissions-Policy allows: geolocation=(self)');
	for (const [path, file] of EXTRA) console.log(`extra: ${BASE}${path} → ${file}`);
});
