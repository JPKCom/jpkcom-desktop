/* JPKCom Desktop — tests: the local server (production Permissions-Policy, --extra files) — © Jean Pierre Kolb — MIT License

   npm run serve promises the headers of a real deployment; every shipped server config sends
   geolocation=() unless the site opts in. Starts tools/serve.mjs on a free port and compares. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERMISSIONS = 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';

const freePort = () => new Promise(r => {
	const s = createServer().listen(0, '127.0.0.1', () => {
		const { port } = s.address();
		s.close(() => r(port));
	});
});

async function headersOf(extra = []) {
	const port = await freePort();
	const child = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port), ...extra], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
	try {
		await new Promise((ok, fail) => {
			child.stdout.on('data', d => { if (String(d).includes('http://')) ok(); });
			child.on('exit', c => fail(new Error(`serve.mjs exited with ${c}`)));
			setTimeout(() => fail(new Error('serve.mjs did not start')), 5000);
		});
		const res = await fetch(`http://127.0.0.1:${port}/`);
		await res.arrayBuffer();
		return res.headers;
	} finally {
		child.kill();
	}
}

test('serve.mjs: --extra serves an out-of-tree file at its URL path (also shadowing a project file) and refuses a missing file or a path with ..', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'serve-extra-'));
	try {
		const set = join(dir, 't.json');
		const cfg = join(dir, 'cfg.js');
		writeFileSync(set, '{"format":"jpkcom-desktop-icons/1","icons":{}}');
		writeFileSync(cfg, 'window.DESKTOP_CONFIG = { iconSets: [] };');
		const port = await freePort();
		const child = spawn(process.execPath, ['tools/serve.mjs', '--port', String(port), '--extra', `site/icon-sets/t.json=${set},/site/config.js=${cfg}`],
			{ cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
		try {
			let out = '';
			await new Promise((ok, fail) => {
				child.stdout.on('data', d => { out += d; if (out.includes('extra: /site/config.js')) ok(); });
				child.on('exit', c => fail(new Error(`serve.mjs exited with ${c}`)));
				setTimeout(() => fail(new Error('serve.mjs did not start')), 5000);
			});
			assert.match(out, /extra: \/site\/icon-sets\/t\.json → /);
			const a = await fetch(`http://127.0.0.1:${port}/site/icon-sets/t.json`);
			assert.equal(a.status, 200);
			assert.equal(a.headers.get('content-type'), 'application/json; charset=utf-8');
			assert.match(a.headers.get('content-security-policy'), /default-src 'self'/);
			assert.equal(await a.text(), readFileSync(set, 'utf8'));
			const b = await fetch(`http://127.0.0.1:${port}/site/config.js`);
			assert.equal(await b.text(), readFileSync(cfg, 'utf8'), 'shadows the project file');
			const c = await fetch(`http://127.0.0.1:${port}/site/icon-sets/other.json`);
			await c.arrayBuffer();
			assert.equal(c.status, 404);
		} finally {
			child.kill();
		}
		const refused = args => new Promise(ok => {
			const p = spawn(process.execPath, ['tools/serve.mjs', '--port', '0', '--extra', args], { cwd: PROJECT, stdio: 'ignore' });
			p.on('exit', code => ok(code));
		});
		assert.equal(await refused(`site/x.json=${join(dir, 'missing.json')}`), 1);
		assert.equal(await refused(`site/../x.json=${set}`), 1);
		assert.equal(await refused(`site/.x.json=${set}`), 1);
		assert.equal(await refused(`site/x.json=${dir}`), 1, 'a folder is not a file');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('serve.mjs: Permissions-Policy equals production; geolocation only with --geolocation', async () => {
	assert.equal((await headersOf()).get('permissions-policy'), PERMISSIONS);
	assert.equal((await headersOf(['--geolocation'])).get('permissions-policy'), PERMISSIONS.replace('geolocation=()', 'geolocation=(self)'));
});
