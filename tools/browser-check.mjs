#!/usr/bin/env node
/* JPKCom Desktop — headless browser smoke test under the production headers — © Jean Pierre Kolb — MIT License

   Starts tools/serve.mjs on a free port, opens the desktop in headless Chromium
   (playwright-core, devDependency; browsers: `npm run browsers`),
   collects console errors, page errors, CSP violations and failed requests, optionally runs a
   scenario and takes a screenshot. Exit code 1 when anything went wrong.

   Usage
     node tools/browser-check.mjs [--path /] [--lang de] [--base /] [--mobile]
                                  [--scenario file.mjs] [--screenshot out.png]
                                  [--size 1280x800] [--wait 600] [--serve-args "--connect https://…"]

     --path        page to open, relative to the base (default: the base itself; '?lang=…' allowed)
     --lang        browser language (navigator.language), e.g. de-DE
     --base        deploy path passed to serve.mjs (tests sub-folder installs)
     --mobile      phone viewport (390x844, touch, coarse pointer)
     --scenario    ES module: export default async ({ page, desk, log, assert }) => { … }
                   desk(fn, ...args) evaluates fn(window.JPKDesk, ...args) in the page
     --screenshot  PNG file to write at the end
     --size        viewport WxH (default 1280x800)
     --wait        ms to wait after 'desk:ready' before the scenario (default 600)
     --site-config file.js  serve this file instead of site/config.js (try modules, services, languages
                   without touching the real config; it must set window.DESKTOP_CONFIG). The file is
                   swapped in with page.route(), which never sees requests a service worker answers —
                   so service workers are blocked with it (after a reload sw.js would serve the real
                   config unnoticed); --keep-sw keeps them and warns when one takes over the page
     --no-sw       block service workers (always on with --site-config unless --keep-sw)
     --serve-args  extra arguments for serve.mjs, one string split at spaces; the next argument is taken
                   even when it starts with '--': --serve-args "--connect https://api.example --wasm"
                   (the older form with a leading space, --serve-args " --connect …", still works)

   Every option also takes the form --name=value, e.g. --lang=de-DE --serve-args="--wasm".

   Expected failures: a scenario that provokes an error on purpose (a wrong vault password → HTTP 404,
   a provider answer faked with page.route() → HTTP 400) declares it, and matching events are listed
   as 'expected' instead of counting as problems:
     export const expect = {
       http: [/\/site\/vault\/[0-9a-f]+\.bin$/, { status: 400, url: /api\.example/ }],  // responses >= 400, failed requests
       console: [/weather: HTTP 400/]                                                  // console errors (text)
     };
   A RegExp in http matches the URL of any status >= 400 and of a failed request; { status, url } matches
   that status only (status may be left out). The browser's own "Failed to load resource" console error
   for an expected response is expected as well.

   Machines with little RAM: run browser checks one at a time, e.g.
     flock /tmp/jpkcom-desktop-browser.lock node tools/browser-check.mjs … */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
/* Options that pass arguments on: their value may itself start with '--' */
const RAW = new Set(['serve-args']);
const opt = (name, fallback) => {
	const eq = args.find(a => a.startsWith(`--${name}=`));
	if (eq !== undefined) return eq.slice(name.length + 3);
	const i = args.indexOf(`--${name}`);
	if (i < 0 || args[i + 1] === undefined) return fallback;
	return RAW.has(name) || !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = name => args.includes(`--${name}`) || args.includes(`--${name}=true`);

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `/${opt('base', '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const PATH = opt('path', '').replace(/^\//, '');
const MOBILE = flag('mobile');
const [W, H] = opt('size', MOBILE ? '390x844' : '1280x800').split('x').map(Number);
const WAIT = Number(opt('wait', '600'));

let chromium;
try {
	({ chromium } = await import('playwright-core'));
} catch {
	console.error('playwright-core is missing: npm ci (devDependency), then npm run browsers');
	process.exit(2);
}

const freePort = () => new Promise((ok, fail) => {
	const srv = createServer();
	srv.once('error', fail);
	srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => ok(port)); });
});

const port = await freePort();
const serveArgs = (opt('serve-args', '') || '').split(/\s+/).filter(Boolean);
const server = spawn(process.execPath, [resolve(PROJECT, 'tools/serve.mjs'), '--port', String(port), '--base', BASE, ...serveArgs],
	{ cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((ok, fail) => {
	const t = setTimeout(() => fail(new Error('serve.mjs did not start')), 8000);
	const onData = d => { if (/listening|http:\/\//i.test(String(d))) { clearTimeout(t); ok(); } };
	server.stdout.on('data', onData);
	server.stderr.on('data', d => process.stderr.write(d));
	server.once('exit', code => { clearTimeout(t); fail(new Error(`serve.mjs exited (${code})`)); });
});

const problems = [];
const warnings = [];
const expected = [];
const log = (...a) => console.log('  ·', ...a);
if (serveArgs.length) log(`serve.mjs ${serveArgs.join(' ')}`);

/* The scenario is imported before the page opens: its `expect` covers errors of the first load too */
const scenario = opt('scenario', null);
let scenarioMod = null;
let expectHttp = [];
let expectConsole = [];
const asList = v => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const abort = async e => {
	console.error(`harness: ${e.message}`);
	server.kill();
	process.exit(1);
};
if (scenario) {
	try {
		scenarioMod = await import(pathToFileURL(resolve(process.cwd(), scenario)).href);
	} catch (e) {
		await abort(new Error(`scenario ${scenario} could not be loaded: ${e.message}`));
	}
	const ex = scenarioMod.expect ?? {};
	expectHttp = asList(ex.http).filter(x => x instanceof RegExp || (x && typeof x === 'object' && (x.url instanceof RegExp || Number.isInteger(x.status))));
	expectConsole = asList(ex.console).filter(x => x instanceof RegExp);
	if (expectHttp.length !== asList(ex.http).length || expectConsole.length !== asList(ex.console).length) {
		warnings.push('scenario expect: entries that are neither a RegExp nor { status, url: RegExp } were ignored');
	}
}
/** Is this HTTP failure expected? status null = a failed request (no response) */
const httpExpected = (url, status) => expectHttp.some(x => {
	if (x instanceof RegExp) return x.test(url);
	if (Number.isInteger(x.status) && x.status !== status) return false;
	return x.url instanceof RegExp ? x.url.test(url) : true;
});
const expectedResponses = new Set(); // URLs of responses that failed as expected
/** Records a failure: expected ones are listed, the rest are problems */
const report = (text, isExpected) => (isExpected ? expected : problems).push(text);
const consoleErrors = [];

const browser = await chromium.launch({ headless: true });
let failed = false;
try {
	const siteConfig = opt('site-config', null);
	const blockSw = flag('no-sw') || (!!siteConfig && !flag('keep-sw'));
	const context = await browser.newContext({
		serviceWorkers: blockSw ? 'block' : 'allow',
		viewport: { width: W, height: H },
		locale: opt('lang', 'en-GB'),
		hasTouch: MOBILE, isMobile: MOBILE, deviceScaleFactor: MOBILE ? 2 : 1,
	});
	const page = await context.newPage();
	page.on('console', m => {
		const text = m.text();
		/* judged at the end: the browser may log a failed load before the response event arrives */
		if (m.type() === 'error') consoleErrors.push({ text, source: m.location()?.url ?? '' });
		else if (m.type() === 'warning') warnings.push(`console.warn: ${text}`);
	});
	page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
	page.on('requestfailed', r => {
		const ok = httpExpected(r.url(), null);
		if (ok) expectedResponses.add(r.url());
		report(`request failed: ${r.url()} (${r.failure()?.errorText})`, ok);
	});
	page.on('response', r => {
		if (r.status() < 400) return;
		const ok = httpExpected(r.url(), r.status());
		if (ok) expectedResponses.add(r.url());
		report(`HTTP ${r.status()}: ${r.url()}`, ok);
	});
	if (blockSw) log('service workers blocked');
	if (siteConfig) {
		const { readFile } = await import('node:fs/promises');
		const body = await readFile(resolve(process.cwd(), siteConfig), 'utf8');
		await page.route(/\/site\/config\.js(\?.*)?$/, route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body }));
		log(`site/config.js replaced by ${siteConfig}`);
	}
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', e =>
			console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || '(inline)'}`));
	});

	const url = `http://127.0.0.1:${port}${BASE}${PATH}`;
	log(`open ${url} (${W}x${H}${MOBILE ? ', mobile' : ''}, ${opt('lang', 'en-GB')})`);
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => document.body.classList.contains('is-ready'), null, { timeout: 15000 });
	await page.waitForTimeout(WAIT);

	const desk = (fn, ...a) => page.evaluate(([src, a]) => {
		// eslint-disable-next-line no-new-func -- test harness only, never shipped to the page
		return (0, eval)(`(${src})`)(window.JPKDesk, ...a);
	}, [fn.toString(), a]);
	const assert = (cond, msg) => { if (!cond) problems.push(`assert: ${msg}`); else log(`ok: ${msg}`); };

	const info = await desk(D => ({ loaded: D.modules.list().length, failed: D.modules.failed(), lang: D.lang() }));
	log(`modules loaded: ${info.loaded}, failed: ${JSON.stringify(info.failed)}, lang: ${info.lang}`);
	const nFailed = Array.isArray(info.failed) ? info.failed.length : Object.keys(info.failed || {}).length;
	if (nFailed) problems.push(`modules failed: ${JSON.stringify(info.failed)}`);

	if (scenarioMod) {
		if (typeof scenarioMod.default !== 'function') throw new Error(`scenario ${scenario} has no default export function`);
		await scenarioMod.default({ page, desk, log, assert });
	}
	/* --site-config --keep-sw: a service worker in control answers site/config.js past page.route() */
	if (siteConfig && !blockSw && await page.evaluate(() => !!navigator.serviceWorker?.controller).catch(() => false)) {
		warnings.push('a service worker controls the page: after a reload it serves the real site/config.js, not --site-config');
	}
	const shot = opt('screenshot', null);
	if (shot) { await page.screenshot({ path: shot }); log(`screenshot ${shot}`); }
} catch (e) {
	problems.push(`harness: ${e.message}`);
} finally {
	await browser.close();
	server.kill();
}

for (const { text, source } of consoleErrors) {
	const ok = expectConsole.some(re => re.test(text))
		|| (/^Failed to load resource\b/.test(text) && expectedResponses.has(source));
	report(`console.error: ${text}`, ok);
}

for (const w of warnings) console.log(`  ! ${w}`);
for (const x of expected) console.log(`  ~ expected: ${x}`);
for (const p of problems) console.log(`  ✗ ${p}`);
failed = problems.length > 0;
console.log(failed ? `FAILED (${problems.length} problem${problems.length === 1 ? '' : 's'})` : 'OK');
process.exit(failed ? 1 : 0);
